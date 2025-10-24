/**
 * ===============================================================================
 * UNIFIED SEARCH UTILITY - HYBRID CACHE AND FIREBASE SEARCH SYSTEM
 * ===============================================================================
 * 
 * This module provides a unified search system that combines local IndexedDB cache
 * with Firebase queries to deliver fast, consistent search results across the
 * number pool. It optimizes performance by utilizing cached data while ensuring
 * data freshness and completeness.
 * 
 * FEATURES:
 * 
 * 1. HYBRID SEARCH APPROACH
 *    - Primary search through IndexedDB cache for speed
 *    - Fallback to Firebase for comprehensive results
 *    - Result deduplication and merging for consistency
 * 
 * 2. INTELLIGENT CACHING
 *    - Search result caching with timeout management
 *    - Cache staleness detection and refresh
 *    - Memory-efficient result storage
 * 
 * 3. PERFORMANCE OPTIMIZATION
 *    - Multi-method search with result combination
 *    - Configurable search limits and filtering
 *    - Source tracking for result provenance
 * 
 * USAGE:
 * Import UnifiedSearch class to implement fast, comprehensive search functionality
 * that leverages both local cache and live Firebase data for optimal performance.
 * ===============================================================================
 */

import { collection, query, where, getDocs, orderBy, startAt, endAt, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { NumberPool } from '../types';
import { searchCachedNumbersFast, searchCachedNumbersByTokens } from './indexedDB';

interface SearchResult {
  data: NumberPool[];
  totalItems: number;
  source: 'cache' | 'firebase' | 'hybrid';
  isComplete: boolean;
}

interface SearchOptions {
  category?: string;
  limit?: number;
  includeStale?: boolean;
}

/**
 * Unified search system that combines cache and Firebase for consistent results
 */
export class UnifiedSearch {
  private static instance: UnifiedSearch;
  private searchCache = new Map<string, SearchResult>();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  static getInstance(): UnifiedSearch {
    if (!UnifiedSearch.instance) {
      UnifiedSearch.instance = new UnifiedSearch();
    }
    return UnifiedSearch.instance;
  }

  /**
   * Main search method that tries multiple approaches for consistent results
   */
  async search(
    searchTerm: string,
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    const { category = 'all', limit: maxResults = 100, includeStale = false } = options;
    const term = searchTerm.trim().toLowerCase();

    if (!term) {
      return { data: [], totalItems: 0, source: 'cache', isComplete: true };
    }

    // Check cache first
    const cacheKey = `${term}_${category}_${maxResults}`;
    const cached = this.searchCache.get(cacheKey);
    
    if (cached && !includeStale) {
      const isStale = Date.now() - (cached as any).timestamp > this.cacheTimeout;
      if (!isStale) {
        return cached;
      }
    }

    // Perform unified search
    const result = await this.performUnifiedSearch(term, category, maxResults);
    
    // Cache the result
    (result as any).timestamp = Date.now();
    this.searchCache.set(cacheKey, result);

    return result;
  }

  /**
   * Performs search using multiple methods and combines results
   */
  private async performUnifiedSearch(
    term: string,
    category: string,
    maxResults: number
  ): Promise<SearchResult> {
    const results = new Map<string, NumberPool>();
    let source: 'cache' | 'firebase' | 'hybrid' = 'cache';
    let isComplete = true;

    try {
      // 1. Try cached search first (fastest)
      try {
        const cachedResults = await this.searchCachedData(term, category, maxResults);
        if (cachedResults && cachedResults.length > 0) {
          cachedResults.forEach(number => results.set(number.id, number));
          console.log(`Cache search found ${cachedResults.length} results for "${term}"`);
        }
      } catch (cacheError) {
        console.warn('Cache search failed, falling back to Firebase:', cacheError);
      }

      // 2. If cache results are insufficient, supplement with Firebase
      if (results.size < maxResults * 0.5) { // Less than 50% of desired results
        try {
          const firebaseResults = await this.searchFirebase(term, category, maxResults);
          firebaseResults.forEach(number => results.set(number.id, number));
          source = results.size > 0 ? 'hybrid' : 'firebase';
          console.log(`Firebase search added ${firebaseResults.length} additional results`);
        } catch (firebaseError) {
          console.warn('Firebase search failed:', firebaseError);
        }
      }

      // 3. If still insufficient, try broader Firebase search
      if (results.size < maxResults * 0.3) { // Less than 30% of desired results
        try {
          const broadResults = await this.searchFirebaseBroad(term, category, maxResults);
          broadResults.forEach(number => results.set(number.id, number));
          source = 'firebase';
          isComplete = false; // Indicate we may have missed some results
          console.log(`Broad Firebase search added ${broadResults.length} more results`);
        } catch (broadError) {
          console.warn('Broad Firebase search failed:', broadError);
        }
      }

    } catch (error) {
      console.error('Unified search error:', error);
      source = 'firebase';
      isComplete = false;
    }

    const finalResults = Array.from(results.values()).slice(0, maxResults);
    
    return {
      data: finalResults,
      totalItems: results.size,
      source,
      isComplete
    };
  }

  /**
   * Search using cached data (IndexedDB)
   */
  private async searchCachedData(term: string, category: string, maxResults: number): Promise<NumberPool[]> {
    try {
      // Try fast cached search first
      let cachedResults = await searchCachedNumbersFast(term, category, maxResults);
      
      if (!cachedResults || cachedResults.length === 0) {
        // Try multi-token search for complex terms
        const tokens = term.split(/\s+/).filter(Boolean);
        if (tokens.length > 1) {
          cachedResults = await searchCachedNumbersByTokens(tokens, category, maxResults) || [];
        }
      }

      return cachedResults || [];
    } catch (error) {
      console.warn('Cache search failed:', error);
      return [];
    }
  }

  /**
   * Search using Firebase with exact and prefix matching
   */
  private async searchFirebase(term: string, category: string, maxResults: number): Promise<NumberPool[]> {
    const results = new Map<string, NumberPool>();

    try {
      // Build base query
      let base = query(collection(db, 'numberPool'));
      if (category !== 'all') {
        base = query(base, where('category', '==', category));
      }

      // 1. Exact number match
      try {
        const exactSnap = await getDocs(query(base, where('number', '==', term), limit(maxResults)));
        exactSnap.docs.forEach(doc => {
          results.set(doc.id, { id: doc.id, ...doc.data() } as NumberPool);
        });
      } catch (error) {
        console.warn('Exact number search failed:', error);
      }

      // 2. Prefix search on number (for numeric terms)
      if (/^\d+/.test(term) && results.size < maxResults) {
        try {
          const prefixSnap = await getDocs(
            query(
              base,
              orderBy('number'),
              startAt(term),
              endAt(term + '\uf8ff'),
              limit(maxResults - results.size)
            )
          );
          prefixSnap.docs.forEach(doc => {
            results.set(doc.id, { id: doc.id, ...doc.data() } as NumberPool);
          });
        } catch (error) {
          console.warn('Prefix search failed:', error);
        }
      }

      // 3. Exact code match
      if (results.size < maxResults) {
        try {
          const codeSnap = await getDocs(query(base, where('code', '==', term), limit(maxResults - results.size)));
          codeSnap.docs.forEach(doc => {
            results.set(doc.id, { id: doc.id, ...doc.data() } as NumberPool);
          });
        } catch (error) {
          console.warn('Code search failed:', error);
        }
      }

      // 4. Token-based search (if we have tokens)
      if (results.size < maxResults) {
        const normalized = term.replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
        if (normalized.length >= 3) {
          try {
            const tokenSnap = await getDocs(
              query(
                base,
                where('numberTokens', 'array-contains', normalized),
                limit(maxResults - results.size)
              )
            );
            tokenSnap.docs.forEach(doc => {
              results.set(doc.id, { id: doc.id, ...doc.data() } as NumberPool);
            });
          } catch (error) {
            console.warn('Token search failed:', error);
          }
        }
      }

    } catch (error) {
      console.error('Firebase search error:', error);
    }

    return Array.from(results.values());
  }

  /**
   * Broader Firebase search with more relaxed criteria
   */
  private async searchFirebaseBroad(term: string, category: string, maxResults: number): Promise<NumberPool[]> {
    const results = new Map<string, NumberPool>();

    try {
      let base = query(collection(db, 'numberPool'));
      if (category !== 'all') {
        base = query(base, where('category', '==', category));
      }

      // Try substring search on various fields
      const fields = ['number', 'code'];
      
      for (const field of fields) {
        if (results.size >= maxResults) break;

        try {
          // Get all documents and filter client-side (not efficient but comprehensive)
          const allSnap = await getDocs(query(base, limit(500)));
          const filtered = allSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as NumberPool))
            .filter(number => {
              const value = (number as any)[field];
              return value && value.toString().toLowerCase().includes(term);
            })
            .slice(0, maxResults - results.size);

          filtered.forEach(number => results.set(number.id, number));
        } catch (error) {
          console.warn(`Broad search on ${field} failed:`, error);
        }
      }

    } catch (error) {
      console.error('Broad Firebase search error:', error);
    }

    return Array.from(results.values());
  }

  /**
   * Clear search cache
   */
  clearCache(): void {
    this.searchCache.clear();
  }

  /**
   * Clear cache for specific term
   */
  clearCacheForTerm(term: string, category: string = 'all'): void {
    const keys = Array.from(this.searchCache.keys());
    keys.forEach(key => {
      if (key.startsWith(`${term}_${category}_`)) {
        this.searchCache.delete(key);
      }
    });
  }
}

// Export singleton instance
export const unifiedSearch = UnifiedSearch.getInstance();
