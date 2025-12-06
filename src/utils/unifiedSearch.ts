/**
 * ===============================================================================
 * UNIFIED SEARCH UTILITY - FAST FIREBASE SEARCH SYSTEM
 * ===============================================================================
 * 
 * This module provides lightning-fast search functionality directly from Firebase
 * with always-fresh data. Optimized for speed using parallel queries and smart
 * query strategies.
 * 
 * FEATURES:
 * 
 * 1. ALWAYS FRESH DATA
 *    - Direct Firebase queries (no cache)
 *    - Real-time accurate results
 *    - No stale data issues
 * 
 * 2. MAXIMUM SPEED OPTIMIZATION
 *    - Parallel query execution
 *    - Smart query selection based on search term
 *    - Indexed field queries for sub-100ms response
 *    - Race condition timeout protection
 * 
 * 3. COMPREHENSIVE SEARCH
 *    - Exact number matching
 *    - Code matching
 *    - Prefix search for partial numbers
 *    - Token-based search for complex terms
 * 
 * USAGE:
 * Import UnifiedSearch class for fast, reliable search with always-fresh data.
 * ===============================================================================
 */

import { collection, query, where, getDocs, orderBy, startAt, endAt, limit, startAfter, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { NumberPool } from '../types';

interface SearchResult {
  data: NumberPool[];
  totalItems: number;
  source: 'firebase';
  isComplete: boolean;
  hasMore: boolean;
  lastDoc: QueryDocumentSnapshot | null;
}

interface SearchOptions {
  category?: string;
  limit?: number;
  startAfter?: QueryDocumentSnapshot | null;
  includeStale?: boolean; // Kept for API compatibility, but always returns fresh data
}

/**
 * Fast Firebase search system with always-fresh data
 */
export class UnifiedSearch {
  private static instance: UnifiedSearch;

  static getInstance(): UnifiedSearch {
    if (!UnifiedSearch.instance) {
      UnifiedSearch.instance = new UnifiedSearch();
    }
    return UnifiedSearch.instance;
  }

  /**
   * Main search method - Always fetches fresh data from Firebase
   * Optimized for speed with parallel queries
   * Supports multi-column search: "050 04DECGOLG3" searches for numbers with "050" AND code with "04DECGOLG3"
   */
  async search(
    searchTerm: string,
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    const { category = 'all', limit: maxResults = 200, startAfter: cursorDoc } = options;
    const rawTerm = searchTerm.trim();

    if (!rawTerm) {
      return { data: [], totalItems: 0, source: 'firebase', isComplete: true, hasMore: false, lastDoc: null };
    }

    // Parse multiple search terms (separated by spaces)
    // Example: "050 04DECGOLG3" -> ["050", "04DECGOLG3"]
    const searchTerms = rawTerm.split(/\s+/).filter(t => t.length > 0);
    
    // If multiple terms, use multi-column search (no pagination support for now)
    if (searchTerms.length > 1) {
      const result = await this.performMultiColumnSearch(searchTerms, category, maxResults);
      return { ...result, hasMore: false, lastDoc: null };
    }

    // Single term - use existing fast search with cursor support
    const term = rawTerm.toLowerCase();
    const result = await this.performFastFirebaseSearch(term, rawTerm, category, maxResults, cursorDoc);

    return result;
  }

  /**
   * Performs multi-column search where ALL terms must match (AND logic)
   * Each term can match different columns (number, code, plan, category, status)
   * Example: "050 04DECGOLG3" finds numbers with "050" in number AND "04DECGOLG3" in code
   * Example: "050 res" finds numbers with "050" in number AND status "reserved"
   */
  private async performMultiColumnSearch(
    searchTerms: string[],
    category: string,
    maxResults: number
  ): Promise<SearchResult> {
    const results = new Map<string, NumberPool>();

    try {
      // Status mapping for status term matching
      const statusTerms: Record<string, string> = {
        'verified': 'verified',
        'verif': 'verified',
        'reserved': 'reserved',
        'reserv': 'reserved',
        'res': 'reserved',
        'open': 'open',
        'pending': 'pending_verification',
        'pend': 'pending_verification',
        'pending_verification': 'pending_verification',
        'assigned': 'assigned',
        'activ': 'activated',
        'activated': 'activated',
        'reject': 'rejected',
        'rejected': 'rejected',
        'follow_up': 'follow_up',
        'followup': 'follow_up',
        'follow-up': 'follow_up',
        'follow': 'follow_up',
        'non_verified': 'non_verified',
        'nonverified': 'non_verified',
        'non-verified': 'non_verified',
        'non_verif': 'non_verified',
        'nonverif': 'non_verified',
        'non': 'non_verified',
        'follow_verification': 'follow_verification',
        'followverification': 'follow_verification',
        'follow verification': 'follow_verification',
        'follow verif': 'follow_verification',
        'in_progress': 'in_progress',
        'inprogress': 'in_progress',
        'manager_review': 'manager_review',
        'managerreview': 'manager_review',
        'activation_pending': 'activation_pending',
        'activationpending': 'activation_pending',
        'pending_assignment': 'pending_assignment',
        'pendingassignment': 'pending_assignment'
      };

      // Check if any term matches a status
      let statusFilter: string | null = null;
      const nonStatusTerms: string[] = [];
      
      searchTerms.forEach(term => {
        const normalized = term.toLowerCase().replace(/[^0-9a-zA-Z]/g, '');
        let matchedStatus = statusTerms[normalized] || statusTerms[term.toLowerCase()];
        
        if (!matchedStatus) {
          // Try prefix-based matching
          const statusKey = Object.keys(statusTerms).find(key => key.startsWith(normalized));
          if (statusKey) {
            matchedStatus = statusTerms[statusKey];
          }
        }
        
        if (matchedStatus) {
          statusFilter = matchedStatus;
        } else {
          nonStatusTerms.push(term);
        }
      });

      // If no status term found, use all terms for field matching
      const fieldSearchTerms = nonStatusTerms.length > 0 ? nonStatusTerms : searchTerms;

      // Build base query with category filter if needed
      let base = query(collection(db, 'numberPool'));
      if (category !== 'all') {
        base = query(base, where('category', '==', category));
      }

      // If status filter is found, add it to the query for efficiency
      // But we'll also verify in memory to ensure accuracy
      if (statusFilter) {
        try {
          base = query(base, where('status', '==', statusFilter));
        } catch (error) {
          // If query fails (e.g., missing index), we'll filter in memory instead
          console.warn('[UnifiedSearch] Status filter query failed, filtering in memory:', error);
        }
      }

      // For multi-column search, we need to fetch a larger dataset and filter in memory
      // This is because Firestore doesn't support complex AND queries across multiple fields
      // Increase limit when we have status filter to ensure we get enough results
      const queryLimit = statusFilter ? 10000 : 5000;
      let snapshot;
      try {
        snapshot = await getDocs(query(base, limit(queryLimit)));
      } catch (error) {
        // If query with status filter fails (e.g., missing composite index), 
        // fall back to querying without status filter and filter in memory
        console.warn('[UnifiedSearch] Query with status filter failed, falling back to in-memory filtering:', error);
        let fallbackBase = query(collection(db, 'numberPool'));
        if (category !== 'all') {
          fallbackBase = query(fallbackBase, where('category', '==', category));
        }
        snapshot = await getDocs(query(fallbackBase, limit(queryLimit)));
      }
      
      // Helper to normalize strings for case-insensitive and punctuation-insensitive comparison
      const normalize = (value: any) => (value || '').toString().toLowerCase();
      const normalizeLoose = (value: any) =>
        normalize(value).replace(/[^a-z0-9]/g, ''); // remove spaces/punctuation for fuzzy matches

      // Pre-normalize search terms to ensure strict case-insensitive matching
      const normalizedTerms = fieldSearchTerms.map(term => {
        const termLower = term.toLowerCase();
        const termLoose = termLower.replace(/[^a-z0-9]/g, '');
        return { termLower, termLoose };
      });

      // Filter numbers where ALL search terms match in ANY column (AND logic)
      snapshot.docs.forEach(doc => {
        const number = doc.data() as NumberPool;
        
        // Verify status filter in memory (in case query didn't filter or we're in fallback mode)
        if (statusFilter && number.status !== statusFilter) {
          return;
        }
        
        // If no field search terms (only status was searched), include all results
        if (normalizedTerms.length === 0) {
          if (results.size < maxResults) {
            results.set(doc.id, { id: doc.id, ...number });
          }
          return;
        }
        
        const numberStr = normalize(number.number);
        const codeStr = normalize(number.code);
        const planStr = normalize(number.plan);
        const categoryStr = normalize(number.category);
        const groupStr = normalize(number.group);

        const numberLoose = normalizeLoose(number.number);
        const codeLoose = normalizeLoose(number.code);
        const planLoose = normalizeLoose(number.plan);
        const categoryLoose = normalizeLoose(number.category);
        const groupLoose = normalizeLoose(number.group);
        
        // Check if ALL search terms match in ANY column (AND logic)
        const allTermsMatch = normalizedTerms.every(({ termLower, termLoose }) => {

          const matchesField = (field: string, looseField: string) =>
            field.includes(termLower) || (termLoose ? looseField.includes(termLoose) : false);

          return (
            matchesField(numberStr, numberLoose) ||
            matchesField(codeStr, codeLoose) ||
            matchesField(planStr, planLoose) ||
            matchesField(categoryStr, categoryLoose) ||
            matchesField(groupStr, groupLoose)
          );
        });
        
        if (allTermsMatch && results.size < maxResults) {
          results.set(doc.id, { id: doc.id, ...number });
        }
      });
      
    } catch (error) {
      console.error('[UnifiedSearch] Multi-column search error:', error);
    }
    
    const finalResults = Array.from(results.values()).slice(0, maxResults);
    
    return {
      data: finalResults,
      totalItems: finalResults.length,
      source: 'firebase',
      isComplete: true,
      hasMore: false,
      lastDoc: null
    };
  }

  /**
   * Performs fast Firebase search with parallel queries (ALWAYS FRESH DATA)
   * Supports cursor-based pagination for "Load More" functionality
   */
  private async performFastFirebaseSearch(
    term: string,
    rawTerm: string,
    category: string,
    maxResults: number,
    cursorDoc: QueryDocumentSnapshot | null | undefined = null
  ): Promise<SearchResult> {
    const results = new Map<string, NumberPool>();
    
    // Track pagination state (accessible throughout function)
    let primaryLastDoc: QueryDocumentSnapshot | null = null;
    let primaryHasMore = false;
    const usePrimaryPagination = cursorDoc !== null && cursorDoc !== undefined;

    // Determine search strategy based on term type (moved outside try block for scope)
      const isNumeric = /^\d+$/.test(term);
      const normalized = term.replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
      
    // Check if search term is a pattern with wildcards (x or X)
    const isPattern = /[xX]/.test(term);
    let patternRegex: RegExp | null = null;
    if (isPattern) {
      // Convert pattern like "xx77xxx999" to regex
      // Replace 'x' or 'X' with \d (digit), keep digits as-is
      const patternStr = term.replace(/[xX]/g, '\\d');
      try {
        patternRegex = new RegExp(`^${patternStr}$`);
      } catch (e) {
        // Invalid pattern, ignore
        patternRegex = null;
      }
    }
    
    // Check if search term matches or partially matches a status
    // Supports exact terms (e.g. "reserved") and smart prefixes (e.g. "res" -> reserved, "non" -> non_verified)
    const statusTerms: Record<string, string> = {
      // Core statuses
      'verified': 'verified',
      'verif': 'verified',
      'reserved': 'reserved',
      'reserv': 'reserved',
      'res': 'reserved',
      'open': 'open',
      'pending': 'pending_verification',
      'pend': 'pending_verification',
      'pending_verification': 'pending_verification',
      'assigned': 'assigned',
      'activ': 'activated',
      'activated': 'activated',
      'reject': 'rejected',
      'rejected': 'rejected',
      // Follow-up / non-verified style statuses
      'follow_up': 'follow_up',
      'followup': 'follow_up',
      'follow-up': 'follow_up',
      'follow': 'follow_up',
      'non_verified': 'non_verified',
      'nonverified': 'non_verified',
      'non-verified': 'non_verified',
      'non_verif': 'non_verified',
      'nonverif': 'non_verified',
      'non': 'non_verified',
      // Legacy "follow verification" variants → search specifically for follow_verification
      // (used to locate only records still having this legacy status)
      'follow_verification': 'follow_verification',
      'followverification': 'follow_verification',
      'follow verification': 'follow_verification',
      'follow verif': 'follow_verification',
      // Additional lead-like statuses (kept for completeness)
      'in_progress': 'in_progress',
      'inprogress': 'in_progress',
      'manager_review': 'manager_review',
      'managerreview': 'manager_review',
      'activation_pending': 'activation_pending',
      'activationpending': 'activation_pending',
      'pending_assignment': 'pending_assignment',
      'pendingassignment': 'pending_assignment'
    };
    
    let matchedStatus = statusTerms[normalized] || statusTerms[term.toLowerCase()];
    // If no direct match, try prefix-based matching over known keys
    if (!matchedStatus) {
      const statusKey = Object.keys(statusTerms).find(key => key.startsWith(normalized));
      if (statusKey) {
        matchedStatus = statusTerms[statusKey];
      }
    }

    try {
      // Build base query with category filter if needed
      let base = query(collection(db, 'numberPool'));
      if (category !== 'all') {
        base = query(base, where('category', '==', category));
      }
      
      // Primary strategy will be used for cursor-based "Load More" pagination
      
      // If cursor is provided, we're loading more - only use primary strategy
      if (usePrimaryPagination) {
        // Determine which strategy to use based on search term
        if (isNumeric && term.length >= 3) {
          // Primary: Prefix search for numeric terms
          let prefixQuery = query(
            base,
            orderBy('number'),
            startAt(term),
            endAt(term + '\uf8ff'),
            startAfter(cursorDoc),
            limit(maxResults + 1) // Fetch one extra to check if there are more
          );
          
          const snap = await getDocs(prefixQuery);
          const docs = snap.docs;
          
          // Check if we have more results
          if (docs.length > maxResults) {
            primaryHasMore = true;
            docs.pop(); // Remove the extra doc
          }
          
          // Store lastDoc for next "Load More"
          if (docs.length > 0) {
            primaryLastDoc = docs[docs.length - 1];
          }
          
          docs.forEach(doc => {
            results.set(doc.id, { id: doc.id, ...doc.data() } as NumberPool);
          });
        } else {
          // For non-numeric terms with cursor, can't paginate - return empty
          return {
            data: [],
            totalItems: 0,
            source: 'firebase',
            isComplete: true,
            hasMore: false,
            lastDoc: null
          };
        }
      } else {
        // First page: Run all strategies in parallel for comprehensive results
      const queries: Promise<void>[] = [];

        // Strategy 0: Pattern-based search (HIGHEST PRIORITY if pattern detected)
        if (isPattern && patternRegex) {
          const fixedDigits = term.replace(/[xX]/g, '').replace(/[^0-9]/g, '');
          if (fixedDigits.length >= 2) {
            const searchTokens = [];
            if (fixedDigits.length >= 4) searchTokens.push(fixedDigits.slice(-4));
            if (fixedDigits.length >= 3) searchTokens.push(fixedDigits.slice(-3));
            searchTokens.push(fixedDigits.slice(-2));
            
            searchTokens.forEach(token => {
              queries.push(
                getDocs(query(base, where('numberTokens', 'array-contains', token), limit(maxResults * 5)))
                  .then(snap => {
                    snap.docs.forEach(doc => {
                      const number = (doc.data().number || '').toString();
                      if (patternRegex && patternRegex.test(number)) {
                        results.set(doc.id, { id: doc.id, ...doc.data() } as NumberPool);
                      }
                    });
                  })
                  .catch(() => {})
              );
            });
          }
        }

        // Strategy 1: Status search
        if (matchedStatus) {
      queries.push(
            getDocs(query(base, where('status', '==', matchedStatus), limit(maxResults)))
          .then(snap => {
            snap.docs.forEach(doc => {
          results.set(doc.id, { id: doc.id, ...doc.data() } as NumberPool);
        });
          })
              .catch(() => {})
      );
        }

        // Strategy 2: Exact number match
      queries.push(
          getDocs(query(base, where('number', '==', rawTerm), limit(maxResults)))
          .then(snap => {
            snap.docs.forEach(doc => {
                results.set(doc.id, { id: doc.id, ...doc.data() } as NumberPool);
            });
          })
          .catch(() => {})
      );

        // Strategy 3: Exact code match
        queries.push(
          getDocs(query(base, where('code', '==', rawTerm), limit(maxResults)))
            .then(snap => {
              snap.docs.forEach(doc => {
                if (results.size < maxResults) {
            results.set(doc.id, { id: doc.id, ...doc.data() } as NumberPool);
                }
          });
            })
            .catch(() => {})
        );

        // Strategy 3.5: Code prefix search
        const isCodePrefix = !isNumeric && /^[a-zA-Z0-9]+$/.test(term) && term.length >= 3;
        if (isCodePrefix) {
          const codePrefixUpper = rawTerm.toUpperCase();
          queries.push(
            getDocs(
              query(
                base,
                orderBy('code'),
                startAt(codePrefixUpper),
                endAt(codePrefixUpper + '\uf8ff'),
                limit(maxResults * 2)
              )
            )
              .then(snap => {
                snap.docs.forEach(doc => {
                  const code = (doc.data().code || '').toString();
                  if (code.toLowerCase().startsWith(term) && results.size < maxResults) {
                    results.set(doc.id, { id: doc.id, ...doc.data() } as NumberPool);
                  }
                });
              })
              .catch(() => {})
          );
        }

        // Strategy 4: Prefix search (PRIMARY for numeric terms - will be used for pagination)
        if (isNumeric && term.length >= 3) {
          if (!usePrimaryPagination) {
            // For randomization: Use a random start point within the prefix range
            // This ensures different results each time without fetching large chunks
            const prefixLength = term.length;
            const remainingDigits = 10 - prefixLength; // Phone numbers are 10 digits
            let randomStart = term;
            
            if (remainingDigits > 0) {
              // Generate random digits to append to prefix (0-99% of range for variety)
              const randomPercent = Math.random() * 0.99; // Use 0-99% to avoid edge cases
              const maxValue = Math.pow(10, remainingDigits) - 1;
              const randomDigits = Math.floor(randomPercent * maxValue);
              const randomSuffix = randomDigits.toString().padStart(remainingDigits, '0');
              randomStart = term + randomSuffix;
            }
            
            let prefixQuery = query(
              base,
              orderBy('number'),
              startAt(randomStart),
              endAt(term + '\uf8ff'),
              limit(maxResults + 1) // Fetch one extra to check if there are more
            );
            
            const snap = await getDocs(prefixQuery);
            const docs = snap.docs;
            
            // Check if we have more results
            if (docs.length > maxResults) {
              primaryHasMore = true;
              docs.pop();
            }
            
            // Store lastDoc for "Load More" - continue sequentially from here
            if (docs.length > 0) {
              primaryLastDoc = docs[docs.length - 1];
            }
            
            docs.forEach(doc => {
              results.set(doc.id, { id: doc.id, ...doc.data() } as NumberPool);
            });
          } else {
            // For "Load More", continue sequentially from cursor
            let prefixQuery = query(
              base,
              orderBy('number'),
              startAt(term),
              endAt(term + '\uf8ff'),
              startAfter(cursorDoc),
              limit(maxResults + 1)
            );
            
            const snap = await getDocs(prefixQuery);
            const docs = snap.docs;
            
            if (docs.length > maxResults) {
              primaryHasMore = true;
              docs.pop();
            }
            
            if (docs.length > 0) {
              primaryLastDoc = docs[docs.length - 1];
            }
            
            docs.forEach(doc => {
              results.set(doc.id, { id: doc.id, ...doc.data() } as NumberPool);
            });
          }
        }

        // Strategy 5: Pattern-based search for numbers ending with "999"
        if (!isPattern && isNumeric && normalized.length >= 2 && normalized.length <= 6) {
          queries.push(
            getDocs(
              query(
                base,
                orderBy('number'),
                startAt(normalized),
                endAt(normalized + '\uf8ff'),
                limit(maxResults * 2)
              )
            )
              .then(snap => {
                snap.docs.forEach(doc => {
                  if (results.size < maxResults) {
                    const number = doc.data().number || '';
                    const numberStr = number.toString();
                    if (numberStr.includes(normalized) && numberStr.endsWith('999')) {
                      results.set(doc.id, { id: doc.id, ...doc.data() } as NumberPool);
                    }
                  }
                });
              })
              .catch(() => {})
          );
        }

        // Strategy 6: Token-based search
        if (normalized.length >= 3) {
        queries.push(
          getDocs(
              query(
                base,
                where('numberTokens', 'array-contains', normalized),
              limit(maxResults)
            )
              )
            .then(snap => {
              snap.docs.forEach(doc => {
                if (results.size < maxResults) {
              results.set(doc.id, { id: doc.id, ...doc.data() } as NumberPool);
                }
            });
            })
            .catch(() => {})
        );
  }

        // Wait for all parallel queries to complete
      await Promise.race([
        Promise.allSettled(queries),
        new Promise<void>(resolve => setTimeout(resolve, 3000))
      ]);
      }


    } catch (error) {
      console.error('[UnifiedSearch] Search error:', error);
      // Return whatever we have
    }

    let finalResults = Array.from(results.values());
    
    // Post-process: Pattern-based filtering (for wildcard patterns like "xx77xxx999")
    if (isPattern && patternRegex) {
      finalResults = finalResults.filter(num => {
        const numberStr = (num.number || '').toString();
        return patternRegex!.test(numberStr);
      });
    }
    
    // Post-process: Pattern-based filtering for numbers ending with "999"
    // If search term is numeric and we have results, prioritize numbers that contain the digits and end with "999"
    if (!isPattern && isNumeric && normalized.length >= 2 && normalized.length <= 6) {
      const patternMatches = finalResults.filter(num => {
        const numberStr = (num.number || '').toString();
        return numberStr.includes(normalized) && numberStr.endsWith('999');
      });
      
      // If we found pattern matches, prioritize them
      if (patternMatches.length > 0) {
        // Combine pattern matches with other results, but put pattern matches first
        const otherResults = finalResults.filter(num => {
          const numberStr = (num.number || '').toString();
          return !(numberStr.includes(normalized) && numberStr.endsWith('999'));
        });
        finalResults = [...patternMatches, ...otherResults];
      }
    }
    
    // Post-process: If search term looks like a status but we didn't get exact match,
    // filter results by status field containing the term
    if (!matchedStatus && normalized.length >= 3) {
      const statusKeywords = ['verif', 'reserv', 'pend', 'assign', 'activ', 'reject', 'follow', 'progress', 'review'];
      const looksLikeStatus = statusKeywords.some(keyword => normalized.includes(keyword));
      
      if (looksLikeStatus) {
        // Filter results where status contains the search term
        finalResults = finalResults.filter(num => 
          num.status?.toLowerCase().includes(normalized) || 
          num.status?.toLowerCase().replace(/_/g, ' ').includes(normalized)
        );
      }
    }
    
    // Only slice if we're not using primary pagination (first page might have more from multiple strategies)
    if (!usePrimaryPagination) {
      finalResults = finalResults.slice(0, maxResults);
    }
    
    return {
      data: finalResults,
      totalItems: finalResults.length,
      source: 'firebase',
      isComplete: true,
      hasMore: primaryHasMore,
      lastDoc: primaryLastDoc
    };
  }

  /**
   * No-op for backward compatibility
   * Search is always fresh, no cache to clear
   */
  clearCache(): void {
    // No cache to clear - search is always fresh
  }

  /**
   * No-op for backward compatibility
   * Search is always fresh, no cache to clear
   */
  clearCacheForTerm(_term: string, _category: string = 'all'): void {
    // No cache to clear - search is always fresh
  }
}

// Export singleton instance
export const unifiedSearch = UnifiedSearch.getInstance();
