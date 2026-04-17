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
   * Prioritizes combination stats when multiple filters are active
   */
  async getTotalPages(pageSize: number, category?: string, group?: string, initials?: string): Promise<number> {
    const stats = await this.getStats();
    if (!stats) return 0;

    const hasCategory = category && category !== 'all';
    const hasGroup = group && group !== 'all';
    const hasInitials = initials && initials !== 'all';
    const getNumericStat = (key: string): number | null => {
      const value = (stats as any)[key];
      return typeof value === 'number' ? value : null;
    };

    // Priority 0: exact 3-filter stats when all filters are active.
    // Supports future keys if backend adds explicit category+group+initials counters.
    if (hasCategory && hasGroup && hasInitials) {
      const tripleKeys = [
        `categoryGroupInitialsTotalPages_${pageSize}_${category}_${group}_${initials}`,
        `categoryGroupInitialsTotalPages_${pageSize}_${category}_${initials}_${group}`
      ];
      for (const key of tripleKeys) {
        const value = getNumericStat(key);
        if (value !== null) return value;
      }

      // Fallback for existing datasets without 3-filter stats:
      // estimate using the tightest available pair-wise aggregate.
      // This keeps pagination reactive to all filters (including group changes)
      // instead of getting stuck on category+initials only.
      const pairValues = [
        getNumericStat(`categoryGroupTotalPages_${pageSize}_${category}_${group}`),
        getNumericStat(`groupInitialsTotalPages_${pageSize}_${group}_${initials}`),
        getNumericStat(`categoryInitialsTotalPages_${pageSize}_${category}_${initials}`)
      ].filter((v): v is number => v !== null);
      if (pairValues.length > 0) {
        return Math.min(...pairValues);
      }
    }

    // Priority 1: Check for combination stats when multiple filters are active
    // Category + Initials (e.g., "Gold" + "050")
    if (hasCategory && hasInitials) {
      const combinationKey = `categoryInitialsTotalPages_${pageSize}_${category}_${initials}`;
      const value = getNumericStat(combinationKey);
      if (value !== null) return value;
    }

    // Category + Group (e.g., "Gold" + "G1")
    if (hasCategory && hasGroup) {
      const combinationKey = `categoryGroupTotalPages_${pageSize}_${category}_${group}`;
      const value = getNumericStat(combinationKey);
      if (value !== null) return value;
    }

    // Group + Initials (e.g., "G1" + "050")
    if (hasGroup && hasInitials) {
      const combinationKey = `groupInitialsTotalPages_${pageSize}_${group}_${initials}`;
      const value = getNumericStat(combinationKey);
      if (value !== null) return value;
    }

    // Priority 2: Use initials-specific stats if available (highest priority for single filter)
    if (hasInitials) {
      const initialsKey = `initialsTotalPages_${pageSize}_${initials}`;
      const value = getNumericStat(initialsKey);
      if (value !== null) return value;
    }

    // Priority 3: Use group-specific stats if available
    if (hasGroup) {
      const groupKey = `groupTotalPages_${pageSize}_${group}`;
      const value = getNumericStat(groupKey);
      if (value !== null) return value;
    }

    // Priority 4: Use category-specific stats if available
    if (hasCategory) {
      const categoryKey = `totalPages_${pageSize}_${category}`;
      const value = getNumericStat(categoryKey);
      if (value !== null) return value;
    }

    // Priority 5: Fall back to global stats
    const globalKey = `totalPages_${pageSize}` as keyof NumberPoolStats;
    return (stats[globalKey] as number) || 0;
  }

  /**
   * Get total items count
   * Prioritizes combination stats when multiple filters are active
   */
  async getTotalItems(category?: string, group?: string, initials?: string): Promise<number> {
    const stats = await this.getStats();
    if (!stats) return 0;

    const hasCategory = category && category !== 'all';
    const hasGroup = group && group !== 'all';
    const hasInitials = initials && initials !== 'all';
    const getNumericStat = (key: string): number | null => {
      const value = (stats as any)[key];
      return typeof value === 'number' ? value : null;
    };

    // Priority 0: exact 3-filter stats when all filters are active.
    if (hasCategory && hasGroup && hasInitials) {
      const tripleKeys = [
        `categoryGroupInitialsTotalItems_${category}_${group}_${initials}`,
        `categoryGroupInitialsTotalItems_${category}_${initials}_${group}`
      ];
      for (const key of tripleKeys) {
        const value = getNumericStat(key);
        if (value !== null) return value;
      }

      // Fallback for current datasets: use tightest available pair-wise aggregate.
      const pairValues = [
        getNumericStat(`categoryGroupTotalItems_${category}_${group}`),
        getNumericStat(`groupInitialsTotalItems_${group}_${initials}`),
        getNumericStat(`categoryInitialsTotalItems_${category}_${initials}`)
      ].filter((v): v is number => v !== null);
      if (pairValues.length > 0) {
        return Math.min(...pairValues);
      }
    }

    // Priority 1: Check for combination stats when multiple filters are active
    // Category + Initials (e.g., "Gold" + "050")
    if (hasCategory && hasInitials) {
      const combinationKey = `categoryInitialsTotalItems_${category}_${initials}`;
      const value = getNumericStat(combinationKey);
      if (value !== null) return value;
    }

    // Category + Group (e.g., "Gold" + "G1")
    if (hasCategory && hasGroup) {
      const combinationKey = `categoryGroupTotalItems_${category}_${group}`;
      const value = getNumericStat(combinationKey);
      if (value !== null) return value;
    }

    // Group + Initials (e.g., "G1" + "050")
    if (hasGroup && hasInitials) {
      const combinationKey = `groupInitialsTotalItems_${group}_${initials}`;
      const value = getNumericStat(combinationKey);
      if (value !== null) return value;
    }

    // Priority 2: Use initials-specific stats if available (highest priority for single filter)
    if (hasInitials) {
      const initialsKey = `initialsTotalItems_${initials}`;
      const value = getNumericStat(initialsKey);
      if (value !== null) return value;
    }

    // Priority 3: Use group-specific stats if available
    if (hasGroup) {
      const groupKey = `groupTotalItems_${group}`;
      const value = getNumericStat(groupKey);
      if (value !== null) return value;
    }

    // Priority 4: Use category-specific stats if available
    if (hasCategory) {
      const categoryKey = `totalItems_${category}`;
      const value = getNumericStat(categoryKey);
      if (value !== null) return value;
    }

    // Priority 5: Fall back to global stats
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
