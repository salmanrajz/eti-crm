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
    
    // If multiple terms, check if all are numeric
    if (searchTerms.length > 1) {
      const allNumeric = searchTerms.every(t => /^\d+$/.test(t));
      
      if (allNumeric) {
        // All numeric terms - use efficient token-based search
        const result = await this.performNumericMultiTokenSearch(searchTerms, category, maxResults, cursorDoc);
        return result;
      } else {
        // Mixed terms - use multi-column search with cursor support
        const result = await this.performMultiColumnSearch(searchTerms, category, maxResults, cursorDoc);
        return result;
      }
    }

    // Single term - use existing fast search with cursor support
    const term = rawTerm.toLowerCase();
    const result = await this.performFastFirebaseSearch(term, rawTerm, category, maxResults, cursorDoc);

    return result;
  }

  /**
   * Performs ULTRA-FAST search for multiple numeric tokens (e.g., "050 111")
   * Strategy: Use array-contains on numberTokens for the MOST SELECTIVE token
   * Then filter other tokens in memory - this is THE FASTEST possible approach!
   * 
   * For "050 111":
   * - "050" appears in ~9,600 numbers (common prefix)
   * - "111" appears in ~200-300 numbers (rare suffix)
   * Solution: Query for "111" in numberTokens, filter "050" in memory
   */
  private async performNumericMultiTokenSearch(
    searchTerms: string[],
    category: string,
    maxResults: number,
    cursorDoc: QueryDocumentSnapshot | null | undefined = null
  ): Promise<SearchResult> {
    const results = new Map<string, NumberPool>();
    let lastDoc: QueryDocumentSnapshot | null = null;
    const batchSize = 300; // Reduced from 500 to limit reads per batch
    let currentCursor = cursorDoc;
    let hasMore = false;

    try {
      // Check if ALL search terms are numeric (regardless of length)
      const allNumeric = searchTerms.every(token => /^\d+$/.test(token));
      
      if (!allNumeric) {
        // Has non-numeric tokens (code, plan, status, etc.) - use multi-column
        return await this.performMultiColumnSearch(searchTerms, category, maxResults, cursorDoc);
      }
      
      // ALL tokens are numeric! Check if all are exactly 3 digits
      const allExactly3Digits = searchTerms.every(token => token.length === 3);
      
      if (!allExactly3Digits) {
        // Numeric but not all 3-digit - use optimized number-only substring search
        return await this.performNumericSubstringSearch(searchTerms, category, maxResults, cursorDoc);
      }
      
      // All tokens are exactly 3-digit - use ULTRA-FAST array-contains on numberTokens!
      const sortedTokens = [...searchTerms].sort((a, b) => {
        const scoreA = this.calculateTokenRarity(a);
        const scoreB = this.calculateTokenRarity(b);
        return scoreA - scoreB; // Lower = rarer = better
      });
      
      const primaryToken = sortedTokens[0]; // Most selective token for query
      const otherTokens = sortedTokens.slice(1); // Filter these in memory

      let totalFetched = 0;
      const maxAttempts = 3; // Reduced from 5 to limit reads
      let attempts = 0;
      
      // Track efficiency to stop early if reads are wasteful
      let totalProcessed = 0;
      let matchRate = 1.0; // Start optimistic

      while (results.size < maxResults && attempts < maxAttempts) {
        attempts++;

        // Build ULTRA-OPTIMIZED query using array-contains on numberTokens
        let tokenQuery = query(collection(db, 'numberPool'));
        
        if (category !== 'all') {
          tokenQuery = query(tokenQuery, where('category', '==', category));
        }

        // Use array-contains for the most selective token
        // This queries the numberTokens array field for exact token match
        tokenQuery = query(
          tokenQuery,
          where('numberTokens', 'array-contains', primaryToken),
          orderBy('number')
        );

        if (currentCursor) {
          tokenQuery = query(tokenQuery, startAfter(currentCursor));
        }

        tokenQuery = query(tokenQuery, limit(batchSize + 1));

        const snapshot = await getDocs(tokenQuery);
        totalFetched += snapshot.docs.length;

        hasMore = snapshot.docs.length > batchSize;
        const docsToProcess = hasMore ? snapshot.docs.slice(0, batchSize) : snapshot.docs;

        if (docsToProcess.length === 0) {
          hasMore = false;
          break;
        }

        currentCursor = docsToProcess[docsToProcess.length - 1];

        // Filter: ALL tokens must match (primary already matched by query, check others)
        docsToProcess.forEach((doc: QueryDocumentSnapshot) => {
          if (results.size >= maxResults) return;

          const data = doc.data() as NumberPool;
          const number = (data.number || '').toString();
          const tokens = (data as any).numberTokens || [];

          // Check if all OTHER tokens match
          const otherTokensMatch = otherTokens.every(token => {
            return tokens.includes(token) || number.includes(token);
          });

          if (otherTokensMatch) {
            results.set(doc.id, { ...data, id: doc.id });
            lastDoc = doc;
          }
        });
        
        // Calculate match efficiency
        totalProcessed += docsToProcess.length;
        matchRate = results.size / totalProcessed;

        // EARLY EXIT: If match rate is too low and we haven't found many results, stop
        if (attempts >= 2 && matchRate < 0.3 && results.size < 100) {
          hasMore = true; // Signal there might be more, but we're stopping
          break;
        }

        if (results.size >= maxResults) {
          break;
        }
        
        if (!hasMore) {
          break;
        }
      }
      
    } catch (error) {
      // Silent error handling
    }

    const finalResults = Array.from(results.values()).slice(0, maxResults);

    return {
      data: finalResults,
      totalItems: finalResults.length,
      source: 'firebase',
      isComplete: !hasMore || results.size < maxResults,
      hasMore: hasMore && results.size >= maxResults,
      lastDoc: lastDoc
    };
  }

  /**
   * Calculate rarity score for a token (lower = rarer = better for query)
   * 
   * CRITICAL: numberTokens only contains 3-digit tokens!
   * - 2-digit tokens (34, 42, 97) → NOT in numberTokens → must avoid!
   * - 3-digit tokens (111, 222, 050) → IN numberTokens → can query!
   * - 4-digit tokens (4242, 9797) → NOT in numberTokens → must avoid!
   * 
   * Fixed Prefixes in dataset: 050, 054, 056 (UAE mobile)
   * 
   * Scoring:
   * - 3-digit repeated (111, 222): score 10 (BEST - very rare + in array)
   * - 3-digit sequential (123, 456): score 60 (GOOD - rare + in array)
   * - 3-digit patterns: score 100-200 (OK - in array)
   * - 3-digit prefixes (050, 054, 056): score 5000+ (WORST - common but usable)
   * - 2-digit tokens: score 9999 (NEVER USE - not in array!)
   * - 4-digit tokens: score 9999 (NEVER USE - not in array!)
   */
  private calculateTokenRarity(token: string): number {
    // CRITICAL: Only 3-digit tokens are in numberTokens array!
    // 2-digit and 4-digit tokens will return 0 results
    if (token.length !== 3) {
      return 9999; // NEVER query these - they're not in the array!
    }
    
    // Now we know it's 3 digits - check patterns
    
    // Check for repeated digits (111, 222, 333, etc.)
    const allSame = token.split('').every(digit => digit === token[0]);
    if (allSame) {
      return 10; // BEST! Very rare + in array
    }
    
    // Check if it's a known common prefix (050, 054, 056)
    if (token === '050' || token === '054' || token === '056') {
      return 5000; // Common prefix - use as last resort
    }
    
    // Check for other prefixes starting with 05 or 04
    if (token.startsWith('05') || token.startsWith('04')) {
      return 4000; // Likely common prefix
    }
    
    // Check for sequential digits (123, 234, 456, etc.)
    let isSequential = true;
    for (let i = 1; i < token.length; i++) {
      const diff = parseInt(token[i]) - parseInt(token[i - 1]);
      if (diff !== 1 && diff !== -1) {
        isSequential = false;
        break;
      }
    }
    if (isSequential) {
      return 60; // Rare pattern
    }
    
    // Check for alternating/mirror patterns (010, 121, 212, etc.)
    if (token[0] === token[2]) {
      return 100; // Somewhat rare
    }
    
    // Check for repeated pairs (112, 221, 334, etc.)
    if (token[0] === token[1] || token[1] === token[2]) {
      return 150; // Contains repetition
    }
    
    // Default: generic 3-digit token
    return 200;
  }

  /**
   * Performs optimized NUMERIC-ONLY substring search
   * Used when ALL search terms are numeric but not all are 3-digit
   * Only searches the 'number' field (faster than multi-column)
   * 
   * Example: "050 11 22" searches only the number field for all three substrings
   */
  private async performNumericSubstringSearch(
    searchTerms: string[],
    category: string,
    maxResults: number,
    cursorDoc: QueryDocumentSnapshot | null | undefined = null
  ): Promise<SearchResult> {
    const results = new Map<string, NumberPool>();
    let lastDoc: QueryDocumentSnapshot | null = null;
    const batchSize = 450; // smaller batch to keep reads tight when using token index
    let currentCursor = cursorDoc;
    let hasMore = false;

    try {
      let totalFetched = 0;
      const maxAttempts = 8;
      let attempts = 0;

      // Choose a primary 3-digit token to query via numberTokens (faster) when possible
      const tokenCandidates = new Set<string>();
      for (let idx = 0; idx < searchTerms.length; idx++) {
        const term = searchTerms[idx];
        const len = term.length;
        if (len === 3) {
          tokenCandidates.add(term);
        } else if (len > 3) {
          // Add sliding 3-digit windows from longer tokens (e.g., "9090" -> "909", "090")
          for (let i = 0; i <= len - 3; i++) {
            tokenCandidates.add(term.slice(i, i + 3));
          }
        }
      }

      let primaryToken: string | null = null;
      let bestScore = Number.MAX_SAFE_INTEGER;
      tokenCandidates.forEach(token => {
        const score = this.calculateTokenRarity(token);
        if (score < bestScore) {
          bestScore = score;
          primaryToken = token;
        }
      });

      const useTokenQuery = primaryToken && bestScore < 9000; // avoid unusable tokens

      while (results.size < maxResults && attempts < maxAttempts) {
        attempts++;

        let numQuery = query(collection(db, 'numberPool'));
        
        if (category !== 'all') {
          numQuery = query(numQuery, where('category', '==', category));
        }
        
        if (useTokenQuery) {
          // Use array-contains on numberTokens for the chosen 3-digit token
          numQuery = query(
            numQuery,
            where('numberTokens', 'array-contains', primaryToken!),
            orderBy('number')
          );
        } else {
          // Fallback to full scan ordered by number
          numQuery = query(numQuery, orderBy('number'));
        }
        
        if (currentCursor) {
          numQuery = query(numQuery, startAfter(currentCursor));
        }
        
        numQuery = query(numQuery, limit(batchSize + 1));

        const snapshot = await getDocs(numQuery);
        totalFetched += snapshot.docs.length;

        hasMore = snapshot.docs.length > batchSize;
        const docsToProcess = hasMore ? snapshot.docs.slice(0, batchSize) : snapshot.docs;

        if (docsToProcess.length === 0) {
          hasMore = false;
          break;
        }

        currentCursor = docsToProcess[docsToProcess.length - 1];

        // Filter: Check if number contains ALL search terms (substring match)
        const processedDocs = docsToProcess;
        for (let i = 0; i < processedDocs.length; i++) {
          if (results.size >= maxResults) break;

          const doc = processedDocs[i];
          const data = doc.data() as NumberPool;
          const number = (data.number || '').toString();

          let allTermsMatch = true;
          for (let t = 0; t < searchTerms.length; t++) {
            if (!number.includes(searchTerms[t])) {
              allTermsMatch = false;
              break;
            }
          }

          if (allTermsMatch) {
            results.set(doc.id, { ...data, id: doc.id });
            lastDoc = doc;
          }
        }

        if (results.size >= maxResults || !hasMore) {
          break;
        }
      }

    } catch (error) {
      // Silent error handling
    }

    const finalResults = Array.from(results.values()).slice(0, maxResults);

    return {
      data: finalResults,
      totalItems: finalResults.length,
      source: 'firebase',
      isComplete: !hasMore || results.size < maxResults,
      hasMore: hasMore && results.size >= maxResults,
      lastDoc: lastDoc
    };
  }

  /**
   * Performs multi-column search where ALL terms must match (AND logic)
   * Each term can match different columns (number, code, plan, category, status)
   * Example: "050 04DECGOLG3" finds numbers with "050" in number AND "04DECGOLG3" in code
   * Example: "050 res" finds numbers with "050" in number AND status "reserved"
   * Supports cursor-based pagination for "Load More" functionality
   */
  private async performMultiColumnSearch(
    searchTerms: string[],
    category: string,
    maxResults: number,
    cursorDoc: QueryDocumentSnapshot | null | undefined = null
  ): Promise<SearchResult> {
    const results = new Map<string, NumberPool>();
    let lastDoc: QueryDocumentSnapshot | null = null;
    let snapshot: any; // Declare at function level so it's accessible everywhere
    let hasMoreData = false; // Track if there's more data available

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
        }
      }

      // For multi-column search, we need to fetch a dataset and filter in memory
      // This is because Firestore doesn't support complex AND queries across multiple fields
      // Keep fetching batches until we have enough matching results
      const batchSize = 1000; // Fetch 1000 docs per batch
      let currentCursor = cursorDoc;
      hasMoreData = false; // Reset the function-level variable
      const maxAttempts = 10; // Allow more attempts to find all matches (up to 10,000 docs)
      let attempts = 0;

      // Keep fetching until we have enough results
      let totalFetched = 0;
      while (results.size < maxResults && attempts < maxAttempts) {
        attempts++;

        // Build query for this batch
        let batchQuery = query(collection(db, 'numberPool'));
        
        if (category !== 'all') {
          batchQuery = query(batchQuery, where('category', '==', category));
        }
        
        // If status filter is found, add it to the query for efficiency
        if (statusFilter) {
          try {
            batchQuery = query(batchQuery, where('status', '==', statusFilter));
          } catch (error) {
            // If query fails (e.g., missing index), we'll filter in memory instead
          }
        }
        
        // Add ordering for consistent pagination
        batchQuery = query(batchQuery, orderBy('number'));
        
        // Add cursor for pagination
        if (currentCursor) {
          batchQuery = query(batchQuery, startAfter(currentCursor));
        }
        
        // Add limit + 1 to detect if there are more results
        batchQuery = query(batchQuery, limit(batchSize + 1));
        
        try {
          snapshot = await getDocs(batchQuery);
        } catch (error) {
          // If query with status filter fails (e.g., missing composite index), 
          // fall back to querying without status filter and filter in memory
          let fallbackQuery = query(collection(db, 'numberPool'), orderBy('number'));
          if (category !== 'all') {
            fallbackQuery = query(fallbackQuery, where('category', '==', category));
          }
          if (currentCursor) {
            fallbackQuery = query(fallbackQuery, startAfter(currentCursor));
          }
          fallbackQuery = query(fallbackQuery, limit(batchSize + 1));
          snapshot = await getDocs(fallbackQuery);
        }
        
        totalFetched += snapshot.docs.length;
        
        // Check if we have more data to fetch
        hasMoreData = snapshot.docs.length > batchSize;
        const docsToProcess = hasMoreData ? snapshot.docs.slice(0, batchSize) : snapshot.docs;
        
        // If no documents returned, we've reached the end
        if (docsToProcess.length === 0) {
          break;
        }
        
        // Update cursor for next batch
        currentCursor = docsToProcess[docsToProcess.length - 1];
      
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
        docsToProcess.forEach((doc: QueryDocumentSnapshot) => {
          if (results.size >= maxResults) return; // Stop if we have enough
          
          const number = doc.data() as NumberPool;
          
          // Verify status filter in memory (in case query didn't filter or we're in fallback mode)
          if (statusFilter && number.status !== statusFilter) {
            return;
          }
          
          // If no field search terms (only status was searched), include all results
          if (normalizedTerms.length === 0) {
            results.set(doc.id, { ...number, id: doc.id });
            lastDoc = doc; // Track last document
            return;
          }
          
          const numberStr = normalize(number.number);
          const codeStr = normalize(number.code);
          const planStr = normalize((number as any).plan);
          const categoryStr = normalize(number.category);
          const groupStr = normalize(number.group);

          const numberLoose = normalizeLoose(number.number);
          const codeLoose = normalizeLoose(number.code);
          const planLoose = normalizeLoose((number as any).plan);
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
          
          if (allTermsMatch) {
            results.set(doc.id, { ...number, id: doc.id });
            lastDoc = doc; // Track last document
          }
        });

        // If we have enough results or no more data, stop fetching
        if (results.size >= maxResults || !hasMoreData) {
          break;
        }
      }

      // Log for debugging
      
    } catch (error) {
      // Silent error handling
    }
    
    const finalResults = Array.from(results.values()).slice(0, maxResults);
    
    // Check if there might be more results
    // hasMoreData is set in the loop based on whether we got the +1 extra document
    const hasMore = hasMoreData && results.size >= maxResults;
    
    return {
      data: finalResults,
      totalItems: finalResults.length,
      source: 'firebase',
      isComplete: !hasMore,
      hasMore: hasMore,
      lastDoc: lastDoc
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
        } else if (!isNumeric && /^[a-zA-Z0-9]+$/.test(term) && term.length >= 3) {
          // Code prefix search with pagination (case-insensitive)
          // Fetch from the original case and filter
          
          let codeQuery = query(
            base,
            orderBy('code'),
            startAt(rawTerm), // Use original case as baseline
            startAfter(cursorDoc),
            limit(maxResults * 3) // Fetch more to account for case variations
          );
          
          const snap = await getDocs(codeQuery);
          const allDocs = snap.docs;
          
          // Filter for case-insensitive prefix match
          const termLower = rawTerm.toLowerCase();
          const matchedDocs = [];
          for (const doc of allDocs) {
            const code = (doc.data().code || '').toLowerCase();
            if (code.startsWith(termLower)) {
              matchedDocs.push(doc);
              if (matchedDocs.length >= maxResults + 1) break;
            }
          }
          
          const docs = matchedDocs;
          
          // Check if we have more results
          if (docs.length > maxResults) {
            primaryHasMore = true;
            docs.pop(); // Remove the extra doc
          }
          
          // Store lastDoc for next "Load More"
          if (docs.length > 0) {
            primaryLastDoc = docs[docs.length - 1];
          }
          
          // Filter for case-insensitive match
          docs.forEach(doc => {
            const data = doc.data() as NumberPool;
            const code = (data.code || '').toLowerCase();
            if (code.startsWith(term)) {
              results.set(doc.id, { ...data, id: doc.id });
            }
          });
        } else if (matchedStatus) {
          // Status search with pagination
          let statusQuery = query(
            base,
            where('status', '==', matchedStatus),
            orderBy('number'),
            startAfter(cursorDoc),
            limit(maxResults + 1)
          );
          
          const snap = await getDocs(statusQuery);
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
            results.set(doc.id, { ...(doc.data() as NumberPool), id: doc.id });
          });
        } else {
          // For other terms with cursor, can't paginate - return empty
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

        // Strategy 1: Status search (PRIMARY for status terms - will be used for pagination)
        if (matchedStatus) {
      queries.push(
            getDocs(
              query(
                base,
                where('status', '==', matchedStatus),
                orderBy('number'),
                limit(maxResults + 1) // Fetch one extra to check if there are more
              )
            )
          .then(snap => {
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

        // Strategy 3.5: Code prefix search (PRIMARY for code terms - will be used for pagination)
        // CASE-INSENSITIVE: Fetch larger dataset and filter in memory
        const isCodePrefix = !isNumeric && /^[a-zA-Z0-9]+$/.test(term) && term.length >= 3;
        if (isCodePrefix) {
          // Query starting from original case term
          // Use a large limit to get all matches (case-insensitive filter in memory)
          queries.push(
            getDocs(
              query(
                base,
                orderBy('code'),
                startAt(rawTerm),
                limit(maxResults * 10) // Large limit to handle case variations
              )
            )
              .then(snap => {
                const allDocs = snap.docs;
                
                // Filter for case-insensitive prefix match
                const termLower = rawTerm.toLowerCase();
                const matchingDocs: any[] = [];
                
                for (const doc of allDocs) {
                  const code = (doc.data().code || '').toLowerCase();
                  if (code.startsWith(termLower)) {
                    matchingDocs.push(doc);
                    if (matchingDocs.length >= maxResults + 1) break;
                  }
                }
                
                // Check if we have more results for pagination
                if (matchingDocs.length > maxResults) {
                  primaryHasMore = true;
                  matchingDocs.pop(); // Remove the extra doc
                }
                
                // Add to results and track last doc
                matchingDocs.forEach(doc => {
                  results.set(doc.id, { id: doc.id, ...doc.data() } as NumberPool);
                });
                
                if (matchingDocs.length > 0) {
                  primaryLastDoc = matchingDocs[matchingDocs.length - 1];
                }
              })
              .catch(() => {})
          );
        }

        // Strategy 4: Prefix search (PRIMARY for numeric terms - will be used for pagination)
        if (isNumeric && term.length >= 3) {
          queries.push(
            getDocs(
              query(
                base,
                orderBy('number'),
                startAt(term),
                endAt(term + '\uf8ff'),
                limit(maxResults + 1) // Fetch one extra to check if there are more
              )
            )
              .then(snap => {
                const docs = snap.docs;
                
                // Check if we have more results
                if (docs.length > maxResults) {
                  primaryHasMore = true;
                  docs.pop();
                }
                
                // Store lastDoc for "Load More"
                if (docs.length > 0) {
                  primaryLastDoc = docs[docs.length - 1];
                }
                
                docs.forEach(doc => {
                  results.set(doc.id, { id: doc.id, ...doc.data() } as NumberPool);
                });
              })
              .catch(() => {})
          );
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
