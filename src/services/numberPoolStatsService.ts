import { doc, getDoc, getDocFromServer, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface NumberPoolStats {
  totalItems: number;
  totalPages_10: number;
  totalPages_20: number;
  totalPages_50: number;
  totalPages_80: number;
  totalPages_100: number;
  totalPages_120: number;
  lastUpdated: Date;
  // Per-category stats (optional)
  totalItems_premium?: number;
  totalItems_standard?: number;
  totalPages_20_premium?: number;
  totalPages_20_standard?: number;
  // Add more categories as needed
}

const STATS_DOC_PATH = 'stats/numberPool';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

class NumberPoolStatsService {
  private static instance: NumberPoolStatsService;
  private statsCache: NumberPoolStats | null = null;
  private cacheTimestamp = 0;
  private listeners = new Map<string, Unsubscribe>();

  static getInstance(): NumberPoolStatsService {
    if (!NumberPoolStatsService.instance) {
      NumberPoolStatsService.instance = new NumberPoolStatsService();
    }
    return NumberPoolStatsService.instance;
  }

  /**
   * Get stats with caching
   */
  async getStats(): Promise<NumberPoolStats | null> {
    // Check cache first
    if (this.statsCache && Date.now() - this.cacheTimestamp < CACHE_DURATION) {
      return this.statsCache;
    }

    try {
      // Always attempt a fresh server read to avoid stale persistent cache
      let statsDoc;
      try {
        statsDoc = await getDocFromServer(doc(db, STATS_DOC_PATH));
      } catch (serverErr) {
        // Fallback to cached doc if offline or server fetch fails
        statsDoc = await getDoc(doc(db, STATS_DOC_PATH));
      }
      if (statsDoc.exists()) {
        const data = statsDoc.data();
        this.statsCache = {
          ...data,
          lastUpdated: data.lastUpdated?.toDate() || new Date()
        } as NumberPoolStats;
        this.cacheTimestamp = Date.now();
        return this.statsCache;
      }
    } catch (error) {
      console.error('Error fetching number pool stats:', error);
    }

    return null;
  }

  /**
   * Get total pages for a specific page size
   */
  async getTotalPages(pageSize: number, category?: string): Promise<number> {
    const stats = await this.getStats();
    if (!stats) return 0;

    // Use category-specific stats if available
    if (category && category !== 'all') {
      const categoryKey = `totalPages_${pageSize}_${category}` as keyof NumberPoolStats;
      if (stats[categoryKey] && typeof stats[categoryKey] === 'number') {
        return stats[categoryKey] as number;
      }
    }

    // Fall back to global stats
    const globalKey = `totalPages_${pageSize}` as keyof NumberPoolStats;
    return (stats[globalKey] as number) || 0;
  }

  /**
   * Get total items count
   */
  async getTotalItems(category?: string): Promise<number> {
    const stats = await this.getStats();
    if (!stats) return 0;

    // Use category-specific stats if available
    if (category && category !== 'all') {
      const categoryKey = `totalItems_${category}` as keyof NumberPoolStats;
      if (stats[categoryKey] && typeof stats[categoryKey] === 'number') {
        return stats[categoryKey] as number;
      }
    }

    return stats.totalItems || 0;
  }

  /**
   * Listen to stats changes (for real-time updates)
   */
  subscribeToStats(callback: (stats: NumberPoolStats | null) => void): Unsubscribe {
    const ref = doc(db, STATS_DOC_PATH);
    const unsubscribe = onSnapshot(
      ref,
      { includeMetadataChanges: true },
      async (snapshot) => {
        if (snapshot.exists()) {
          // If we received a cached snapshot and we are online, force a fresh server read once
          if (snapshot.metadata.fromCache && navigator.onLine) {
            try {
              const fresh = await getDocFromServer(ref);
              if (fresh.exists()) {
                const freshData = fresh.data();
                const stats: NumberPoolStats = {
                  ...freshData,
                  lastUpdated: freshData.lastUpdated?.toDate() || new Date()
                } as NumberPoolStats;
                this.statsCache = stats;
                this.cacheTimestamp = Date.now();
                callback(stats);
                return;
              }
            } catch {}
          }

          const data = snapshot.data();
          const stats: NumberPoolStats = {
            ...data,
            lastUpdated: data.lastUpdated?.toDate() || new Date()
          } as NumberPoolStats;
          
          this.statsCache = stats;
          this.cacheTimestamp = Date.now();
          callback(stats);
        } else {
          callback(null);
        }
      },
      (error) => {
        console.error('Error listening to stats:', error);
        callback(null);
      }
    );

    return unsubscribe;
  }

  /**
   * Clear cache (useful for testing or forced refresh)
   */
  clearCache(): void {
    this.statsCache = null;
    this.cacheTimestamp = 0;
  }

  /**
   * Clean up all listeners
   */
  cleanup(): void {
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners.clear();
  }
}

export const numberPoolStatsService = NumberPoolStatsService.getInstance();
