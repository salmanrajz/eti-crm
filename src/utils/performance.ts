// ✅ ENHANCED: Performance monitoring with persistent cache tracking

import React from 'react';

interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

interface CacheMetric {
  type: 'hit' | 'miss' | 'restored' | 'persisted';
  cacheType: string;
  key: string;
  source?: 'memory' | 'localStorage';
  timestamp: number;
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private cacheMetrics: CacheMetric[] = [];
  private enabled: boolean = process.env.NODE_ENV === 'development';

  // ✅ Start timing a performance metric
  start(name: string, metadata?: Record<string, any>): void {
    if (!this.enabled) return;

    this.metrics.set(name, {
      name,
      startTime: performance.now(),
      metadata
    });
  }

  // ✅ End timing and calculate duration
  end(name: string): number | null {
    if (!this.enabled) return null;

    const metric = this.metrics.get(name);
    if (!metric) {
      console.warn(`Performance metric "${name}" was not started`);
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - metric.startTime;

    metric.endTime = endTime;
    metric.duration = duration;

    // Log in development
    // Performance logs disabled - uncomment the line below to re-enable
    // if (this.enabled) {
    //   console.log(`📊 Performance: ${name} took ${duration.toFixed(2)}ms`, metric.metadata);
    // }

    return duration;
  }

  // ✅ Track cache metrics
  trackCache(metric: Omit<CacheMetric, 'timestamp'>): void {
    if (!this.enabled) return;

    const cacheMetric: CacheMetric = {
      ...metric,
      timestamp: Date.now()
    };

    this.cacheMetrics.push(cacheMetric);

    // Keep only last 100 cache metrics to prevent memory bloat
    if (this.cacheMetrics.length > 100) {
      this.cacheMetrics = this.cacheMetrics.slice(-100);
    }
  }

  // ✅ Get cache statistics
  getCacheStats(): { hitRate: number; totalOperations: number; breakdown: Record<string, number> } {
    const total = this.cacheMetrics.length;
    if (total === 0) {
      return { hitRate: 0, totalOperations: 0, breakdown: {} };
    }

    const hits = this.cacheMetrics.filter(m => m.type === 'hit' || m.type === 'restored').length;
    const hitRate = hits / total;

    const breakdown = this.cacheMetrics.reduce((acc, metric) => {
      const key = `${metric.type}${metric.source ? `_${metric.source}` : ''}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { hitRate, totalOperations: total, breakdown };
  }

  // ✅ Get performance summary
  getSummary(): PerformanceMetric[] {
    return Array.from(this.metrics.values()).filter(m => m.duration !== undefined);
  }

  // ✅ Clear all metrics
  clear(): void {
    this.metrics.clear();
    this.cacheMetrics = [];
  }

  // ✅ Log cache statistics
  logCacheStats(cacheName: string, stats: any): void {
    if (!this.enabled) return;
    console.log(`💾 Cache Stats [${cacheName}]:`, stats);
  }
}

// ✅ Global performance monitor instance
export const perfMonitor = new PerformanceMonitor();

// ✅ Enhanced utility functions for dashboard measurements
export const dashboardPerf = {
  // Measure dashboard loading time
  measureDashboardLoad: (dashboardType: string, userId: string) => {
    perfMonitor.start(`dashboard_load_${dashboardType}`, { userId, dashboardType });
    
    return () => {
      const duration = perfMonitor.end(`dashboard_load_${dashboardType}`);
      return duration;
    };
  },

  // Measure database query time
  measureQuery: (queryName: string, queryParams?: any) => {
    perfMonitor.start(`db_query_${queryName}`, queryParams);
    
    return () => {
      const duration = perfMonitor.end(`db_query_${queryName}`);
      return duration;
    };
  },

  // Enhanced cache measurement with persistence tracking
  measureCache: (operation: 'hit' | 'miss' | 'restored' | 'persisted', cacheType: string, key: string, source?: 'memory' | 'localStorage') => {
    // Track the cache metric
    perfMonitor.trackCache({ type: operation, cacheType, key, source });

    // Cache logs disabled - uncomment the block below to re-enable
    /*
    if (process.env.NODE_ENV === 'development') {
      let emoji = '🎯';
      let message = `Cache ${operation.toUpperCase()}`;
      
      switch (operation) {
        case 'hit':
          emoji = source === 'memory' ? '⚡' : '💾';
          message = source === 'memory' ? 'Cache HIT (Memory)' : 'Cache HIT (Storage)';
          break;
        case 'miss':
          emoji = '❌';
          message = 'Cache MISS';
          break;
        case 'restored':
          emoji = '🔄';
          message = 'Cache RESTORED from localStorage';
          break;
        case 'persisted':
          emoji = '💾';
          message = 'Cache PERSISTED to localStorage';
          break;
      }

      console.log(`${emoji} ${message}: ${cacheType}[${key.length > 100 ? key.substring(0, 100) + '...' : key}]`);
    }
    */
  },

  // Measure component render time
  measureRender: (componentName: string) => {
    perfMonitor.start(`render_${componentName}`);
    
    return () => {
      const duration = perfMonitor.end(`render_${componentName}`);
      return duration;
    };
  },

  // Get cache performance summary
  getCachePerformance: () => {
    const stats = perfMonitor.getCacheStats();
    if (process.env.NODE_ENV === 'development' && stats.totalOperations > 0) {
      console.log(`📈 Cache Performance Summary:`, {
        hitRate: `${(stats.hitRate * 100).toFixed(1)}%`,
        totalOperations: stats.totalOperations,
        breakdown: stats.breakdown
      });
    }
    return stats;
  }
};

// ✅ React hook for measuring component performance
export const usePerformanceTracking = (componentName: string) => {
  const trackRender = () => {
    const endMeasure = dashboardPerf.measureRender(componentName);
    
    // Return cleanup function
    return () => {
      endMeasure();
    };
  };

  return { trackRender };
};

// ✅ HOC for automatic performance tracking
export const withPerformanceTracking = <P extends Record<string, any>>(
  Component: React.ComponentType<P>,
  componentName: string
): React.ComponentType<P> => {
  return (props: P) => {
    const endMeasure = dashboardPerf.measureRender(componentName);
    
    React.useEffect(() => {
      return () => {
        endMeasure();
      };
    }, [endMeasure]);

    return React.createElement(Component, props);
  };
};

// ✅ Enhanced performance targets
export const PERFORMANCE_TARGETS = {
  DASHBOARD_LOAD_TIME: 1000, // 1 second target for dashboard load
  CACHE_HIT_RATIO: 0.8, // 80% cache hit ratio target
  DATABASE_QUERY_TIME: 500, // 500ms target for DB queries
  COMPONENT_RENDER_TIME: 100, // 100ms target for component renders
  CACHE_RESTORE_TIME: 50 // 50ms target for cache restoration
};

// ✅ Enhanced performance alert system
export const checkPerformanceTargets = (): string[] => {
  const summary = perfMonitor.getSummary();
  const cacheStats = perfMonitor.getCacheStats();
  const alerts: string[] = [];

  summary.forEach(metric => {
    if (metric.name.includes('dashboard_load') && metric.duration! > PERFORMANCE_TARGETS.DASHBOARD_LOAD_TIME) {
      alerts.push(`⚠️ Slow dashboard load: ${metric.name} took ${metric.duration!.toFixed(2)}ms (target: ${PERFORMANCE_TARGETS.DASHBOARD_LOAD_TIME}ms)`);
    }
    
    if (metric.name.includes('db_query') && metric.duration! > PERFORMANCE_TARGETS.DATABASE_QUERY_TIME) {
      alerts.push(`⚠️ Slow database query: ${metric.name} took ${metric.duration!.toFixed(2)}ms (target: ${PERFORMANCE_TARGETS.DATABASE_QUERY_TIME}ms)`);
    }
  });

  // Check cache performance
  if (cacheStats.totalOperations > 10 && cacheStats.hitRate < PERFORMANCE_TARGETS.CACHE_HIT_RATIO) {
    alerts.push(`⚠️ Low cache hit rate: ${(cacheStats.hitRate * 100).toFixed(1)}% (target: ${PERFORMANCE_TARGETS.CACHE_HIT_RATIO * 100}%)`);
  }

  if (alerts.length > 0 && process.env.NODE_ENV === 'development') {
    console.warn('Performance Alerts:', alerts);
  }

  return alerts;
}; 