// ✅ ENHANCED: Persistent cache management with localStorage backup and performance tracking

import { dashboardPerf } from './performance';

// ✅ ENHANCED: Date and Map restoration utility for localStorage data
const restoreDates = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    // Check if it's an ISO date string
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(obj)) {
      return new Date(obj);
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(restoreDates);
  }
  
  if (typeof obj === 'object') {
    // ✅ ENHANCED: Check if this object should be restored as a Map
    // Maps serialized to localStorage have numeric or string keys with simple values
    if (isSerializedMap(obj)) {
      const map = new Map();
      for (const [key, value] of Object.entries(obj)) {
        map.set(key, restoreDates(value));
      }
      return map;
    }
    
    const restored: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // Known date fields that need restoration
      if (['createdAt', 'updatedAt', 'timestamp'].includes(key) && typeof value === 'string') {
        restored[key] = new Date(value);
      } else {
        restored[key] = restoreDates(value);
      }
    }
    return restored;
  }
  
  return obj;
};

// ✅ ENHANCED: Helper function to detect if an object was originally a Map
const isSerializedMap = (obj: any): boolean => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  
  const entries = Object.entries(obj);
  if (entries.length === 0) return false;
  
  // Check if all values are primitive types (string, number, boolean)
  // which is typical for our Map caches (numberId -> group, agentId -> name)
  return entries.every(([key, value]) => {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
  });
};

interface CacheItem<T> {
  data: T;
  timestamp: number;
}

interface CacheOptions {
  maxAge?: number; // in milliseconds
  maxSize?: number; // maximum number of items
  persistent?: boolean; // whether to use localStorage
  prefix?: string; // localStorage key prefix
  trackPerformance?: boolean; // whether to track performance metrics
}

class PerformanceCache<T> {
  private cache = new Map<string, CacheItem<T>>();
  private maxAge: number;
  private maxSize: number;
  private persistent: boolean;
  private prefix: string;
  private trackPerformance: boolean;
  private cacheName: string;

  constructor(options: CacheOptions = {}) {
    this.maxAge = options.maxAge || 60 * 60 * 1000; // 1 hour default
    this.maxSize = options.maxSize || 100; // 100 items default
    this.persistent = options.persistent ?? true; // Enable persistence by default
    this.prefix = options.prefix || 'crm_cache';
    this.trackPerformance = options.trackPerformance ?? true; // Enable tracking by default
    this.cacheName = this.prefix.replace('crm_', ''); // Extract cache type name
    
    // Load from localStorage on initialization
    if (this.persistent) {
      this.loadFromStorage();
    }
  }

  // ✅ Load cache from localStorage with performance tracking and date restoration
  private loadFromStorage(): void {
    try {
      const keys = Object.keys(localStorage).filter(key => key.startsWith(`${this.prefix}_`));
      let restoredCount = 0;
      
      for (const key of keys) {
        const item = localStorage.getItem(key);
        if (item) {
          const parsed = JSON.parse(item) as CacheItem<T>;
          const cacheKey = key.replace(`${this.prefix}_`, '');
          
          // Only load if not expired
          if (Date.now() - parsed.timestamp <= this.maxAge) {
            // ✅ ENHANCED: Restore dates when loading from localStorage
            const restoredData = restoreDates(parsed.data) as T;
            const restoredItem = { ...parsed, data: restoredData };
            
            this.cache.set(cacheKey, restoredItem);
            restoredCount++;
            
            // Track restoration
            if (this.trackPerformance) {
              dashboardPerf.measureCache('restored', this.cacheName, cacheKey, 'localStorage');
            }
          } else {
            // Remove expired items from localStorage
            localStorage.removeItem(key);
          }
        }
      }
      
      if (restoredCount > 0 && this.trackPerformance) {
        //console.log(`🔄 Restored ${restoredCount} items from ${this.cacheName} localStorage cache`);
      }
    } catch (error) {
      console.warn('Failed to load cache from localStorage:', error);
    }
  }

  // ✅ Save to localStorage with performance tracking
  private saveToStorage(key: string, item: CacheItem<T>): void {
    if (!this.persistent) return;
    
    try {
      localStorage.setItem(`${this.prefix}_${key}`, JSON.stringify(item));
      
      // Track persistence
      if (this.trackPerformance) {
        dashboardPerf.measureCache('persisted', this.cacheName, key, 'localStorage');
      }
    } catch (error) {
      // localStorage quota exceeded - clear old items
      this.clearExpiredFromStorage();
      try {
        localStorage.setItem(`${this.prefix}_${key}`, JSON.stringify(item));
        if (this.trackPerformance) {
          dashboardPerf.measureCache('persisted', this.cacheName, key, 'localStorage');
        }
      } catch (retryError) {
        console.warn('Failed to save to localStorage after cleanup:', retryError);
      }
    }
  }

  // ✅ Remove from localStorage
  private removeFromStorage(key: string): void {
    if (!this.persistent) return;
    
    try {
      localStorage.removeItem(`${this.prefix}_${key}`);
    } catch (error) {
      console.warn('Failed to remove from localStorage:', error);
    }
  }

  // ✅ Clear expired items from localStorage
  private clearExpiredFromStorage(): void {
    if (!this.persistent) return;
    
    try {
      const now = Date.now();
      const keys = Object.keys(localStorage).filter(key => key.startsWith(`${this.prefix}_`));
      
      for (const key of keys) {
        const item = localStorage.getItem(key);
        if (item) {
          const parsed = JSON.parse(item) as CacheItem<T>;
          if (now - parsed.timestamp > this.maxAge) {
            localStorage.removeItem(key);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to clear expired localStorage items:', error);
    }
  }

  // ✅ Set item in cache with automatic cleanup and persistence
  set(key: string, data: T): void {
    // Remove expired items if cache is getting full
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }

    const item: CacheItem<T> = {
      data,
      timestamp: Date.now()
    };

    // Set in memory cache
    this.cache.set(key, item);
    
    // Save to localStorage
    this.saveToStorage(key, item);
  }

  // ✅ Get item from cache with performance tracking and date restoration
  get(key: string): T | null {
    // First check in-memory cache
    let item = this.cache.get(key);
    let source: 'memory' | 'localStorage' = 'memory';
    
    if (item) {
      // Check if expired
      if (Date.now() - item.timestamp > this.maxAge) {
        this.cache.delete(key);
        this.removeFromStorage(key);
        
        // Track miss due to expiration
        if (this.trackPerformance) {
          dashboardPerf.measureCache('miss', this.cacheName, `${key}_expired`);
        }
        return null;
      }
      
      // Track memory hit
      if (this.trackPerformance) {
        dashboardPerf.measureCache('hit', this.cacheName, key, 'memory');
      }
      return item.data;
    }
    
    // If not in memory but persistent, try localStorage
    if (this.persistent) {
      try {
        const stored = localStorage.getItem(`${this.prefix}_${key}`);
        if (stored) {
          const parsed = JSON.parse(stored) as CacheItem<T>;
          source = 'localStorage';
          
          // Check if expired
          if (parsed && Date.now() - parsed.timestamp <= this.maxAge) {
            // ✅ ENHANCED: Restore dates when retrieving from localStorage
            const restoredData = restoreDates(parsed.data) as T;
            const restoredItem = { ...parsed, data: restoredData };
            
            // Restore to memory cache
            this.cache.set(key, restoredItem);
            
            // Track localStorage hit
            if (this.trackPerformance) {
              dashboardPerf.measureCache('hit', this.cacheName, key, 'localStorage');
            }
            return restoredData;
          } else {
            // Remove expired item
            localStorage.removeItem(`${this.prefix}_${key}`);
          }
        }
      } catch (error) {
        console.warn('Failed to retrieve from localStorage:', error);
      }
    }
    
    // Track miss
    if (this.trackPerformance) {
      dashboardPerf.measureCache('miss', this.cacheName, `${key}_not_found`);
    }
    
    return null;
  }

  // ✅ Check if item exists and is valid
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  // ✅ Clear all cache (both memory and localStorage)
  clear(): void {
    this.cache.clear();
    
    if (this.persistent) {
      try {
        const keys = Object.keys(localStorage).filter(key => key.startsWith(`${this.prefix}_`));
        for (const key of keys) {
          localStorage.removeItem(key);
        }
      } catch (error) {
        console.warn('Failed to clear localStorage cache:', error);
      }
    }
  }

  // ✅ Remove expired items (both memory and localStorage)
  cleanup(): void {
    const now = Date.now();
    
    // Clean memory cache
    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > this.maxAge) {
        this.cache.delete(key);
      }
    }
    
    // Clean localStorage
    this.clearExpiredFromStorage();
  }

  // ✅ Get cache statistics
  getStats(): { size: number; maxSize: number; maxAge: number; persistent: boolean } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      maxAge: this.maxAge,
      persistent: this.persistent
    };
  }

  // ✅ Get or set pattern for better performance
  async getOrSet(key: string, factory: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const fresh = await factory();
    this.set(key, fresh);
    return fresh;
  }
}

// ✅ ENHANCED: Predefined cache instances with persistent storage and performance tracking

// Metrics cache with 1-hour duration and persistence
export const metricsCache = new PerformanceCache<any>({
  maxAge: 60 * 60 * 1000, // 1 hour
  maxSize: 50, // 50 different metric sets
  persistent: true,
  prefix: 'crm_metrics',
  trackPerformance: true
});

// Leads cache with 1-hour duration and persistence
export const leadsCache = new PerformanceCache<any>({
  maxAge: 60 * 60 * 1000, // 1 hour
  maxSize: 100, // 100 different lead lists
  persistent: true,
  prefix: 'crm_leads',
  trackPerformance: true
});

// Target cache with 1-hour duration and persistence
export const targetCache = new PerformanceCache<any>({
  maxAge: 60 * 60 * 1000, // 1 hour
  maxSize: 30, // 30 different targets
  persistent: true,
  prefix: 'crm_targets',
  trackPerformance: true
});

// User data cache with longer duration and persistence
export const userCache = new PerformanceCache<any>({
  maxAge: 2 * 60 * 60 * 1000, // 2 hours
  maxSize: 200, // 200 users
  persistent: true,
  prefix: 'crm_users',
  trackPerformance: true
});

// Team data cache with persistence
export const teamCache = new PerformanceCache<any>({
  maxAge: 30 * 60 * 1000, // 30 minutes
  maxSize: 50, // 50 teams
  persistent: true,
  prefix: 'crm_teams',
  trackPerformance: true
});

// ✅ Automatic cleanup every 10 minutes
setInterval(() => {
  metricsCache.cleanup();
  leadsCache.cleanup();
  targetCache.cleanup();
  userCache.cleanup();
  teamCache.cleanup();
}, 10 * 60 * 1000);

// ✅ Cache key generators for consistency
export const cacheKeys = {
  agentMetrics: (userId: string, month: string) => `agent_metrics_${userId}_${month}`,
  agentLeads: (userId: string) => `agent_leads_${userId}`,
  agentTarget: (userId: string, month: string) => `agent_target_${userId}_${month}`,
  teamMetrics: (teamId: string, month: string) => `team_metrics_${teamId}_${month}`,
  adminMetrics: (month: string) => `admin_metrics_${month}`,
  userProfile: (userId: string) => `user_profile_${userId}`,
  teamData: (teamId: string) => `team_data_${teamId}`
};

// ✅ Export utility functions
export { PerformanceCache };

// ✅ Helper to check if cache is valid (for backward compatibility)
export const isCacheValid = (timestamp: number, maxAge: number = 60 * 60 * 1000): boolean => {
  return Date.now() - timestamp < maxAge;
}; 
