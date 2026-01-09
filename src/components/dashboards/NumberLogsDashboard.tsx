/**
 * ===============================================================================
 * NUMBER LOGS DASHBOARD COMPONENT - SYSTEM ACTIVITY MONITORING
 * ===============================================================================
 * 
 * This component provides comprehensive monitoring and logging of all number pool
 * activities, including reservations, claims, verifications, and status changes.
 * It enables administrators and managers to track system usage and audit activities.
 * 
 * FEATURES:
 * 
 * 1. COMPREHENSIVE ACTIVITY LOGGING
 *    - Real-time tracking of all number pool activities
 *    - User action logging with timestamps and details
 *    - Status change tracking and audit trails
 * 
 * 2. ADVANCED FILTERING AND SEARCH
 *    - Multi-criteria filtering (user, action type, date range)
 *    - Real-time search across all log entries
 *    - Customizable filter combinations
 * 
 * 3. GROUPED LOG DISPLAY
 *    - Number-specific action grouping for better readability
 *    - Expandable action lists for detailed views
 *    - Chronological ordering of activities
 * 
 * 4. PERFORMANCE OPTIMIZATION
 *    - Efficient pagination and lazy loading
 *    - Local caching for improved responsiveness
 *    - Real-time updates with snapshot listeners
 * 
 * 5. ADMINISTRATIVE TOOLS
 *    - Export capabilities for audit purposes
 *    - Bulk action management
 *    - System activity monitoring and analytics
 * 
 * USAGE:
 * This component is primarily used by administrators and managers to monitor
 * system activities, audit user actions, and track number pool usage patterns.
 * ===============================================================================
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  Search, 
  Filter, 
  Calendar, 
  User, 
  Hash, 
  Clock,
  ChevronDown,
  RefreshCw,
  Download,
  Eye,
  EyeOff
} from 'lucide-react';
import { collection, query as fsQuery, orderBy, limit as fsLimit, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { fetchNumberLogs, NumberLog, NumberLogFilters, getActionColor, getActionIcon, formatActionText, formatTimestamp, formatDataValue, formatDataValueWithUserNames, processDetailsWithAgentNames, actionTypes } from '../../utils/numberLogging';
import { useAuthStore } from '../../store/authStore';
import { toast } from 'react-hot-toast';

interface GroupedLog {
  number: string;
  numberId: string;
  actions: NumberLog[];
  latestAction: NumberLog;
  totalActions: number;
}

export function NumberLogsDashboard() {
  const { user, isAdmin } = useAuthStore();
  const [logs, setLogs] = useState<NumberLog[]>([]);
  const [groupedLogs, setGroupedLogs] = useState<GroupedLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<NumberLogFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [expandedNumbers, setExpandedNumbers] = useState<Set<string>>(new Set());
  const [formattedChanges, setFormattedChanges] = useState<Record<string, string[]>>({});
  const [processedDetails, setProcessedDetails] = useState<Record<string, string>>({});
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const CACHE_KEY = 'number_logs_cache_v1';

  // Seed from cache for instant paint
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { logs: NumberLog[] };
        if (Array.isArray(cached.logs) && cached.logs.length > 0) {
          console.log('NumberLogsDashboard: Loaded', cached.logs.length, 'logs from cache');
          setLogs(cached.logs);
          setLoading(false);
        }
      }
    } catch (error) {
      console.warn('NumberLogsDashboard: Failed to load cache, clearing corrupted data');
      try {
        localStorage.removeItem(CACHE_KEY);
      } catch {
        // Ignore cleanup errors
      }
    }
  }, []);

  useEffect(() => {
    if (isAdmin()) {
      // Real-time subscription (server + SDK local cache)
      const q = fsQuery(
        collection(db, 'number_logs'),
        orderBy('timestamp', 'desc'),
        fsLimit(5000) // Increased limit to load more logs
      );

      const unsub = onSnapshot(q, async (snap) => {
        try {
          const live: NumberLog[] = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
          console.log('NumberLogsDashboard: Loaded', live.length, 'logs from Firestore');
          setLogs(live);

          // Cache only recent logs to avoid quota exceeded error
          try {
            // Only cache the most recent 200 logs to save space
            const recentLogs = live.slice(0, 200);
            localStorage.setItem(CACHE_KEY, JSON.stringify({ logs: recentLogs }));
            console.log('NumberLogsDashboard: Cached', recentLogs.length, 'recent logs');
          } catch (cacheError) {
            console.warn('NumberLogsDashboard: Failed to cache logs (storage quota exceeded), continuing without cache');
            // Try to clear old cache entries if possible
            try {
              localStorage.removeItem(CACHE_KEY);
            } catch {
              // Ignore cleanup errors
            }
          }

          setLoading(false);
        } catch (e) {
          console.error('Error processing logs:', e);
          // ignore
        }
      }, (error) => {
        // ✅ FIX: Handle permission errors gracefully during logout
        if (error.code === 'permission-denied') {
          // User logged out or lost permissions - cleanup silently
          return;
        }
        
        console.error('Error in NumberLogsDashboard listener:', error);
      });

      return () => unsub();
    }
  }, [isAdmin, filters]);

  // Reset to first page whenever grouped logs or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [groupedLogs.length, filters]);

  // Derive filtered, grouped, and formatted data from live logs
  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        const base = logs || [];

        // Client-side filters
        const filtered = base.filter((log) => {
          if (filters.action && log.action !== filters.action) return false;
          if (filters.startDate) {
            const t = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
            if (t < filters.startDate) return false;
          }
          if (filters.endDate) {
            const t = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
            if (t > filters.endDate) return false;
          }
          if (filters.searchTerm) {
            const s = filters.searchTerm.toLowerCase();
            const hay = `${log.number} ${log.userName} ${log.details || ''} ${log.action}`.toLowerCase();
            if (!hay.includes(s)) return false;
          }
          return true;
        });

        console.log('NumberLogsDashboard: Base logs:', base.length, 'Filtered logs:', filtered.length);
        if (filters.startDate || filters.endDate) {
          console.log('NumberLogsDashboard: Date filters - Start:', filters.startDate, 'End:', filters.endDate);
          console.log('NumberLogsDashboard: Sample log timestamps:', base.slice(0, 3).map(log => {
            const t = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
            return { original: log.timestamp, parsed: t, iso: t.toISOString() };
          }));

          // Debug: Check if any logs fall within the date range
          const inRange = base.filter(log => {
            const t = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
            const startOk = !filters.startDate || t >= filters.startDate;
            const endOk = !filters.endDate || t <= filters.endDate;
            return startOk && endOk;
          });
          console.log('NumberLogsDashboard: Logs in date range:', inRange.length);
        }

        // Group by number
        const groupedMap = new Map<string, NumberLog[]>();
        filtered.forEach((log) => {
          const key = log.number;
          if (!groupedMap.has(key)) groupedMap.set(key, []);
          groupedMap.get(key)!.push(log);
        });

        const grouped: GroupedLog[] = Array.from(groupedMap.entries()).map(([number, actions]) => {
          const sortedActions = actions.slice().sort((a, b) =>
            (b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0) - (a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0)
          );
          return {
            number,
            numberId: sortedActions[0]?.numberId || '',
            actions: sortedActions,
            latestAction: sortedActions[0],
            totalActions: actions.length,
          };
        });

        grouped.sort((a, b) =>
          (b.latestAction?.timestamp?.toDate ? b.latestAction.timestamp.toDate().getTime() : 0) - (a.latestAction?.timestamp?.toDate ? a.latestAction.timestamp.toDate().getTime() : 0)
        );

        setGroupedLogs(grouped);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [logs, filters]);

  // Pagination helpers
  const totalItems = groupedLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedGroups = groupedLogs.slice(startIndex, endIndex);

  const gotoPrev = () => setCurrentPage((p) => Math.max(1, p - 1));
  const gotoNext = () => setCurrentPage((p) => Math.min(totalPages, p + 1));
  const onPageSizeChange = (n: number) => {
    setPageSize(n);
    setCurrentPage(1);
  };

  const handleFilterChange = (key: keyof NumberLogFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined
    }));
  };

  const clearFilters = () => {
    setFilters({});
  };

  // Debug function to show all logs temporarily
  const showAllLogs = () => {
    setFilters({});
    console.log('NumberLogsDashboard: Showing all logs, filters cleared');
  };

  // Clear cache function
  const clearCache = () => {
    try {
      localStorage.removeItem(CACHE_KEY);
      console.log('NumberLogsDashboard: Cache cleared');
      toast.success('Cache cleared successfully');
    } catch (error) {
      console.error('NumberLogsDashboard: Failed to clear cache', error);
      toast.error('Failed to clear cache');
    }
  };

  // Load recent logs (last 30 days)
  const loadRecentLogs = () => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    setFilters({
      startDate,
      endDate
    });
    console.log('NumberLogsDashboard: Loading logs from last 30 days');
  };

  const toggleNumberExpansion = (number: string) => {
    setExpandedNumbers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(number)) {
        newSet.delete(number);
      } else {
        newSet.add(number);
      }
      return newSet;
    });
  };

  const toggleActionExpansion = (actionId: string) => {
    setExpandedActions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(actionId)) {
        newSet.delete(actionId);
      } else {
        newSet.add(actionId);
      }
      return newSet;
    });
    // Compute details lazily if missing
    (async () => {
      const base = logs.find(l => l.id === actionId);
      if (base) {
        // Process formatted changes
        if (!formattedChanges[actionId]) {
          const changes = await formatDataChange(base.oldData, base.newData);
          setFormattedChanges(prev => ({ ...prev, [actionId]: changes || [] }));
        }
        // Process details to replace agent IDs with names
        if (base.details && !processedDetails[actionId]) {
          const processed = await processDetailsWithAgentNames(base.details);
          setProcessedDetails(prev => ({ ...prev, [actionId]: processed }));
        }
      }
    })();
  };

  const formatDataChange = async (oldData: any, newData: any) => {
    if (!oldData && !newData) return null;
    
    const changes: string[] = [];
    
    // Fields to completely hide from logs (technical/internal fields)
    const hiddenFields = [
      'numberTokens',
      'tokensUpdatedAt',
      'last2Digits',
      'last3Digits',
      'last4Digits',
      'last5Digits',
      'initials',
      'numberNormalized',
      'passcode', // Sensitive data
      'visibleToFreelancers',
      'createdAt', // Usually not meaningful in change logs
      'lastStatusChange', // Usually not meaningful in change logs
      'updatedAt', // Usually not meaningful in change logs
      'number', // The actual number itself (redundant)
      'code', // Internal code
      'reservationCount', // Internal counter
      'claimCount', // Internal counter
      'category', // Only show if it's actually changing (filtered below)
      'group', // Only show if it's actually changing (filtered below)
    ];
    
    // Fields that should show with custom labels
    const fieldLabels: Record<string, string> = {
      'leadId': 'Lead Number',
      'status': 'Status',
      'reservedBy': 'Reserved By',
      'claimingAgentId': 'Claiming Agent',
      'teamVisibility': 'Team Visibility',
    };
    
    if (oldData && newData) {
      // Get all unique keys from both objects
      const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
      
      for (const key of allKeys) {
        // Skip hidden fields completely
        if (hiddenFields.includes(key)) continue;
        
        const oldValue = oldData[key];
        const newValue = newData[key];
        
        // Only show category/group if they're actually changing
        if ((key === 'category' || key === 'group') && oldValue === newValue) {
          continue;
        }
        
        if (oldValue !== newValue) {
          const formattedOld = await formatDataValueWithUserNames(oldValue, key);
          const formattedNew = await formatDataValueWithUserNames(newValue, key);
          
          // Skip if both values are empty/null
          if (formattedOld === 'empty' && formattedNew === 'empty') continue;
          
          const displayKey = fieldLabels[key] || key;
          changes.push(`${displayKey}: ${formattedOld} → ${formattedNew}`);
        }
      }
    } else if (newData) {
      for (const key of Object.keys(newData)) {
        // Skip hidden fields completely
        if (hiddenFields.includes(key)) continue;
        
        const formattedValue = await formatDataValueWithUserNames(newData[key], key);
        
        // Skip if value is empty
        if (formattedValue === 'empty') continue;
        
        const displayKey = fieldLabels[key] || key;
        changes.push(`${displayKey}: ${formattedValue}`);
      }
    }
    
    return changes;
  };

  if (!isAdmin()) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">Only administrators can view number logs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <Activity className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Number Activity Logs</h1>
                <p className="text-gray-600">Track all number operations and changes</p>
                {!loading && (
                  <p className="text-sm text-gray-500 mt-1">
                    Total logs loaded: {logs?.length || 0} | Filtered: {groupedLogs.length}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-3">
              {/* Inline search */}
              <div className="hidden md:block">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={filters.searchTerm || ''}
                    onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
                    placeholder="Search logs..."
                    className="w-64 pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
              <button
                onClick={() => {
                  // manual refresh: clear cache to force network snapshot to refill
                  try { localStorage.removeItem(CACHE_KEY); } catch {}
                }}
                disabled={loading}
                className="flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Filter className="h-4 w-4" />
                <span>Filters</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>
          {/* Mobile search */}
          <div className="mt-4 md:hidden">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={filters.searchTerm || ''}
                onChange={(e) => handleFilterChange('searchTerm', e.target.value)}
                placeholder="Search logs..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

                {/* Action Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Action Type
                  </label>
                  <select
                    value={filters.action || ''}
                    onChange={(e) => handleFilterChange('action', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">All Actions</option>
                    {actionTypes.map(action => (
                      <option key={action} value={action}>
                        {formatActionText(action)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={filters.startDate ? filters.startDate.toISOString().split('T')[0] : ''}
                    onChange={(e) => handleFilterChange('startDate', e.target.value ? new Date(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={filters.endDate ? filters.endDate.toISOString().split('T')[0] : ''}
                    onChange={(e) => handleFilterChange('endDate', e.target.value ? new Date(e.target.value) : undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 mt-4">
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Clear Filters
                </button>
                <button
                  onClick={loadRecentLogs}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Recent Logs (30 days)
                </button>
                <button
                  onClick={showAllLogs}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Show All Logs
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Logs Table */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {loading ? (
            <div className="p-8 text-center">
              <RefreshCw className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading logs...</p>
            </div>
          ) : groupedLogs.length === 0 ? (
            <div className="p-8 text-center">
              <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No logs found</h3>
              <p className="text-gray-600">No number activity logs match your current filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Phone Number
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Latest Action
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Actions
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedGroups.map((groupedLog, index) => {
                    const isExpanded = expandedNumbers.has(groupedLog.number);
                    const latestLog = groupedLog.latestAction;
                    const changes = formattedChanges[latestLog.id] || [];
                    
                    return (
                      <React.Fragment key={groupedLog.number}>
                        <motion.tr
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.02 }}
                          className={`transition-colors cursor-pointer ${isExpanded ? 'bg-indigo-50/40' : 'hover:bg-gray-50'}`}
                          onClick={() => toggleNumberExpansion(groupedLog.number)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className={`mr-3 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                <ChevronDown className="h-4 w-4 text-gray-400" />
                              </div>
                              <Hash className="h-4 w-4 text-gray-400 mr-2" />
                              <span className="font-mono text-sm font-medium text-gray-900">
                                {groupedLog.number}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className={`inline-flex px-2.5 py-1.5 rounded-full text-xs font-medium border shadow-sm ${getActionColor(latestLog.action)}`}>
                              {formatActionText(latestLog.action)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <User className="h-4 w-4 text-gray-400 mr-2" />
                              <span className="text-sm text-gray-900">
                                {latestLog.userName}
                              </span>
                              <span className="text-xs text-gray-500 ml-1">
                                ({latestLog.userRole})
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <Clock className="h-4 w-4 text-gray-400 mr-2" />
                              <span className="text-sm text-gray-900">
                                {formatTimestamp(latestLog.timestamp)}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {groupedLog.totalActions} actions
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleNumberExpansion(groupedLog.number); }}
                              className="text-indigo-600 hover:text-indigo-900 transition-colors"
                            >
                              {isExpanded ? 'Hide Details' : 'Show Details'}
                            </button>
                          </td>
                        </motion.tr>

                        <AnimatePresence>
                          {isExpanded && (
                            <motion.tr
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="bg-white"
                            >
                              <td colSpan={6} className="px-6 py-5">
                                <div className="rounded-xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 p-4">
                                  <h3 className="text-sm font-semibold text-gray-900 mb-3">All Actions for {groupedLog.number}</h3>
                                  <div className="space-y-4">
                                    {groupedLog.actions.map((log) => {
                                      const itemChanges = formattedChanges[log.id] || [];
                                      return (
                                        <div key={log.id} className="group rounded-lg border border-gray-200 bg-white/60 px-4 py-3 shadow-sm hover:shadow transition">
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                              <div className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getActionColor(log.action)}`}>
                                                {formatActionText(log.action)}
                                              </div>
                                              <span className="text-sm text-gray-600">
                                                {log.userName} ({log.userRole})
                                              </span>
                                              <span className="hidden md:inline text-xs text-gray-500">
                                                • {formatTimestamp(log.timestamp)}
                                              </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <button
                                                onClick={() => toggleActionExpansion(log.id)}
                                                className="text-indigo-600 hover:text-indigo-800 text-sm"
                                              >
                                                {expandedActions.has(log.id) ? 'Hide details' : 'View details'}
                                              </button>
                                            </div>
                                          </div>

                                          <AnimatePresence>
                                            {expandedActions.has(log.id) && (
                                              <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="mt-3"
                                              >
                                                {(!formattedChanges[log.id] && !processedDetails[log.id] && log.details) && (
                                                  <div className="text-xs text-gray-500">Loading details…</div>
                                                )}
                                                {log.details && (
                                                  <p className="text-sm text-gray-700 mb-2">
                                                    {processedDetails[log.id] || log.details}
                                                  </p>
                                                )}
                                                {itemChanges && itemChanges.length > 0 && (
                                                  <div className="rounded-lg bg-gray-50 p-3">
                                                    <h4 className="text-xs font-medium text-gray-900 mb-2">Data Changes</h4>
                                                    <ul className="space-y-1">
                                                      {itemChanges.map((change, idx) => (
                                                        <li key={idx} className="text-xs text-gray-700 font-mono">
                                                          {change}
                                                        </li>
                                                      ))}
                                                    </ul>
                                                  </div>
                                                )}
                                              </motion.div>
                                            )}
                                          </AnimatePresence>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </td>
                            </motion.tr>
                          )}
                        </AnimatePresence>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination controls */}
              {totalItems > 0 && (
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-4 py-3 border-t bg-white">
                  <div className="text-sm text-gray-600">
                    Showing <span className="font-medium">{startIndex + 1}</span>–<span className="font-medium">{endIndex}</span> of <span className="font-medium">{totalItems}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-600">Rows per page</span>
                      <select
                        value={pageSize}
                        onChange={(e) => onPageSizeChange(parseInt(e.target.value, 10))}
                        className="px-2 py-1 border rounded-md text-sm"
                      >
                        {[10, 25, 50, 100].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={gotoPrev}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 rounded-md border text-sm disabled:opacity-50"
                      >
                        Prev
                      </button>
                      <div className="text-sm text-gray-700">
                        Page <span className="font-medium">{currentPage}</span> / {totalPages}
                      </div>
                      <button
                        onClick={gotoNext}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 rounded-md border text-sm disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Expanded Details */}
        <AnimatePresence>
          {groupedLogs.map((groupedLog) => {
            const isExpanded = expandedNumbers.has(groupedLog.number);
            if (!isExpanded) return null;

            return null;
          })}
        </AnimatePresence>

        {/* Stats */}
        {groupedLogs.length > 0 && (
          <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Activity Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-indigo-600">{groupedLogs.length}</div>
                <div className="text-sm text-gray-600">Numbers Tracked</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {logs.filter(log => log.action === 'created').length}
                </div>
                <div className="text-sm text-gray-600">Numbers Created</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-600">
                  {logs.filter(log => log.action === 'reserved').length}
                </div>
                <div className="text-sm text-gray-600">Reservations</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {logs.filter(log => log.action === 'claimed').length}
                </div>
                <div className="text-sm text-gray-600">Claims</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
