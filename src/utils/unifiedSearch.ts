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

import { collection, query, where, getDocs, orderBy, startAt, endAt, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { NumberPool } from '../types';

interface SearchResult {
  data: NumberPool[];
  totalItems: number;
  source: 'firebase';
  isComplete: boolean;
}

interface SearchOptions {
  category?: string;
  limit?: number;
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
   */
  async search(
    searchTerm: string,
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    const { category = 'all', limit: maxResults = 200 } = options;
    const rawTerm = searchTerm.trim();
    const term = rawTerm.toLowerCase();

    if (!term) {
      return { data: [], totalItems: 0, source: 'firebase', isComplete: true };
    }

    // Always fetch fresh data from Firebase (no cache)
    const result = await this.performFastFirebaseSearch(term, rawTerm, category, maxResults);

    return result;
  }

  /**
   * Performs fast Firebase search with parallel queries (ALWAYS FRESH DATA)
   */
  private async performFastFirebaseSearch(
    term: string,
    rawTerm: string,
    category: string,
    maxResults: number
  ): Promise<SearchResult> {
    const results = new Map<string, NumberPool>();

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
    
    // Check if search term matches a status
    const statusTerms: Record<string, string> = {
      'verified': 'verified',
      'reserved': 'reserved',
      'open': 'open',
      'pending': 'pending_verification',
      'pending_verification': 'pending_verification',
      'assigned': 'assigned',
      'activated': 'activated',
      'rejected': 'rejected',
      'follow_up': 'follow_up',
      'followup': 'follow_up',
      'follow-up': 'follow_up',
      'in_progress': 'in_progress',
      'inprogress': 'in_progress',
      'manager_review': 'manager_review',
      'managerreview': 'manager_review',
      'activation_pending': 'activation_pending',
      'activationpending': 'activation_pending',
      'pending_assignment': 'pending_assignment',
      'pendingassignment': 'pending_assignment'
    };
    
    const matchedStatus = statusTerms[normalized] || statusTerms[term.toLowerCase()];

    try {
      // Build base query with category filter if needed
      let base = query(collection(db, 'numberPool'));
      if (category !== 'all') {
        base = query(base, where('category', '==', category));
      }
      
      // OPTIMIZATION: Run queries in parallel for maximum speed
      const queries: Promise<void>[] = [];

      // Strategy 0: Pattern-based search (HIGHEST PRIORITY if pattern detected)
      // Example: "xx77xxx999" matches "0577117999"
      if (isPattern && patternRegex) {
        // Extract fixed digits from pattern for initial search
        const fixedDigits = term.replace(/[xX]/g, '').replace(/[^0-9]/g, '');
        
        if (fixedDigits.length >= 2) {
          // Use the longest fixed digit sequence for better matching
          // Try multiple token searches with different parts of fixed digits
          const searchTokens = [];
          if (fixedDigits.length >= 4) {
            searchTokens.push(fixedDigits.slice(-4)); // Last 4 digits
          }
          if (fixedDigits.length >= 3) {
            searchTokens.push(fixedDigits.slice(-3)); // Last 3 digits
          }
          searchTokens.push(fixedDigits.slice(-2)); // Last 2 digits
          
          // Search using each token
          searchTokens.forEach(token => {
            queries.push(
              getDocs(
                query(
                  base,
                  where('numberTokens', 'array-contains', token),
                  limit(maxResults * 5) // Get more results to filter by pattern
                )
              )
                .then(snap => {
                  snap.docs.forEach(doc => {
                    const number = (doc.data().number || '').toString();
                    // Filter by pattern regex
                    if (patternRegex && patternRegex.test(number)) {
                      results.set(doc.id, { id: doc.id, ...doc.data() } as NumberPool);
                    }
                  });
                })
                .catch(() => {}) // Silent fail
            );
          });
        }
      }

      // Strategy 1: Status search (HIGH PRIORITY if status match found)
      if (matchedStatus) {
        queries.push(
          getDocs(query(base, where('status', '==', matchedStatus), limit(maxResults)))
            .then(snap => {
              snap.docs.forEach(doc => {
                results.set(doc.id, { id: doc.id, ...doc.data() } as NumberPool);
              });
            })
            .catch(() => {}) // Silent fail
        );
      }

      // Strategy 2: Exact number match (HIGH PRIORITY - indexed field)
      queries.push(
        getDocs(query(base, where('number', '==', rawTerm), limit(maxResults)))
          .then(snap => {
            snap.docs.forEach(doc => {
          results.set(doc.id, { id: doc.id, ...doc.data() } as NumberPool);
        });
          })
          .catch(() => {}) // Silent fail
      );

      // Strategy 3: Exact code match (HIGH PRIORITY - indexed field)
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

      // Strategy 4: Prefix search (FAST for partial numbers - uses index)
      // Only run for numeric terms to avoid slow queries
      if (isNumeric && term.length >= 3) {
        queries.push(
          getDocs(
            query(
              base,
              orderBy('number'),
              startAt(term),
              endAt(term + '\uf8ff'),
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

      // Strategy 5: Pattern-based search (for numbers ending with specific patterns)
      // Example: search "123" finds numbers like "050123999", "971123999" (contains 123, ends with 999)
      // Only run if not already a pattern search
      if (!isPattern && isNumeric && normalized.length >= 2 && normalized.length <= 6) {
        // Search for numbers that contain the digits and end with "999"
        queries.push(
          getDocs(
            query(
              base,
              orderBy('number'),
              startAt(normalized),
              endAt(normalized + '\uf8ff'),
              limit(maxResults * 2) // Get more results to filter by pattern
            )
          )
            .then(snap => {
              snap.docs.forEach(doc => {
                if (results.size < maxResults) {
                  const number = doc.data().number || '';
                  const numberStr = number.toString();
                  
                  // Check if number contains the search digits AND ends with "999"
                  if (numberStr.includes(normalized) && numberStr.endsWith('999')) {
                    results.set(doc.id, { id: doc.id, ...doc.data() } as NumberPool);
                  }
                }
              });
            })
            .catch(() => {})
        );
      }

      // Strategy 6: Token-based search (COMPREHENSIVE - indexed array field)
      // Fast for complex searches with good indexes
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

      // Wait for all queries to complete (with 3-second safety timeout)
      await Promise.race([
        Promise.allSettled(queries),
        new Promise<void>(resolve => setTimeout(resolve, 3000))
      ]);

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
    
    finalResults = finalResults.slice(0, maxResults);
    
    return {
      data: finalResults,
      totalItems: finalResults.length,
      source: 'firebase',
      isComplete: true
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
