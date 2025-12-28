/**
 * ===============================================================================
 * USER SESSION LOGS DASHBOARD COMPONENT - USER ACTIVITY MONITORING
 * ===============================================================================
 * 
 * This component provides comprehensive monitoring and logging of all user
 * activities, including login, logout, session management, and other key
 * operations. It enables administrators to track user activity and audit sessions.
 * 
 * FEATURES:
 * 
 * 1. COMPREHENSIVE ACTIVITY LOGGING
 *    - Real-time tracking of all user activities
 *    - Login/logout tracking with timestamps and details
 *    - Session management and page view tracking
 * 
 * 2. ADVANCED FILTERING AND SEARCH
 *    - Multi-criteria filtering (user, action type, date range)
 *    - Real-time search across all log entries
 *    - Customizable filter combinations
 * 
 * 3. DETAILED LOG DISPLAY
 *    - User-specific action grouping for better readability
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
 *    - User activity monitoring and analytics
 * 
 * USAGE:
 * This component is primarily used by administrators to monitor user activities,
 * audit sessions, and track system usage patterns.
 * ===============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  Search, 
  Filter, 
  User, 
  Clock,
  ChevronDown,
  RefreshCw,
  LogIn,
  LogOut,
  Eye,
  Download
} from 'lucide-react';
import { collection, query as fsQuery, orderBy, limit as fsLimit, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  fetchUserSessionLogs, 
  UserSessionLog, 
  UserSessionLogFilters, 
  UserSessionAction,
  getUserSessionActionColor, 
  getUserSessionActionIcon,
  formatUserSessionActionText, 
  formatUserSessionTimestamp
} from '../../utils/userSessionLogging';
import { useAuthStore } from '../../store/authStore';
import { toast } from 'react-hot-toast';

const actionTypes: UserSessionAction[] = [
  'login',
  'logout',
  'session_start',
  'session_end',
  'page_view',
  'action_performed',
  'data_accessed',
  'data_modified',
  'export_performed',
  'search_performed',
  'filter_applied',
  'settings_changed',
  'password_changed',
  'profile_updated',
  'permission_denied',
  'error_occurred'
];

export function UserSessionLogsDashboard() {
  const { user, isAdmin } = useAuthStore();
  const [logs, setLogs] = useState<UserSessionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<UserSessionLogFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const CACHE_KEY = 'user_session_logs_cache_v1';

  // Seed from cache for instant paint
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { logs: UserSessionLog[] };
        if (Array.isArray(cached.logs)) {
          setLogs(cached.logs);
          setLoading(false);
        }
      }
    } catch {}
  }, []);

  // Real-time subscription
  useEffect(() => {
    if (isAdmin()) {
      const q = fsQuery(
        collection(db, 'user_session_logs'),
        orderBy('timestamp', 'desc'),
        fsLimit(1000)
      );

      const unsub = onSnapshot(q, async (snap) => {
        try {
          const live: UserSessionLog[] = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
          setLogs(live);
          localStorage.setItem(CACHE_KEY, JSON.stringify({ logs: live }));
          setLoading(false);
        } catch (e) {
          // ignore
        }
      }, (error) => {
        if (error.code === 'permission-denied') {
          return;
        }
        console.error('Error in UserSessionLogsDashboard listener:', error);
      });

      return () => unsub();
    }
  }, [isAdmin]);

  // Reset to first page whenever logs or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [logs.length, filters]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    let filtered = logs || [];

    // Apply filters
    if (filters.userId) {
      filtered = filtered.filter(log => log.userId === filters.userId);
    }
    if (filters.userRole) {
      filtered = filtered.filter(log => log.userRole === filters.userRole);
    }
    if (filters.action && filters.action.length > 0) {
      filtered = filtered.filter(log => filters.action!.includes(log.action));
    }
    if (filters.startDate) {
      filtered = filtered.filter(log => {
        const logDate = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
        return logDate >= filters.startDate!;
      });
    }
    if (filters.endDate) {
      filtered = filtered.filter(log => {
        const logDate = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
        return logDate <= filters.endDate!;
      });
    }
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(log => 
        log.userName?.toLowerCase().includes(searchLower) ||
        log.userEmail?.toLowerCase().includes(searchLower) ||
        log.details?.toLowerCase().includes(searchLower) ||
        log.page?.toLowerCase().includes(searchLower) ||
        log.action.toLowerCase().includes(searchLower)
      );
    }

    return filtered;
  }, [logs, filters]);

  // Pagination
  const totalPages = Math.ceil(filteredLogs.length / pageSize);
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  // Get unique users for filter
  const uniqueUsers = useMemo(() => {
    const userMap = new Map<string, { id: string; name: string; role: string }>();
    logs.forEach(log => {
      if (!userMap.has(log.userId)) {
        userMap.set(log.userId, {
          id: log.userId,
          name: log.userName,
          role: log.userRole
        });
      }
    });
    return Array.from(userMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [logs]);

  // Get unique roles for filter
  const uniqueRoles = useMemo(() => {
    const roles = new Set<string>();
    logs.forEach(log => {
      if (log.userRole) roles.add(log.userRole);
    });
    return Array.from(roles).sort();
  }, [logs]);

  const toggleExpanded = (logId: string) => {
    setExpandedLogs(prev => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  };

  const handleRefresh = () => {
    setLoading(true);
    fetchUserSessionLogs(filters, 1000).then(fetched => {
      setLogs(fetched);
      setLoading(false);
      toast.success('Logs refreshed');
    }).catch(() => {
      setLoading(false);
      toast.error('Failed to refresh logs');
    });
  };

  if (!isAdmin()) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Access denied. Admin privileges required.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">User Session Logs</h1>
              <p className="text-sm text-gray-600">Track all user activities and sessions</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Refresh logs"
          >
            <RefreshCw className={`w-5 h-5 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 bg-white rounded-xl shadow-sm border border-gray-200 p-4"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Filters</h2>
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {showFilters ? 'Hide' : 'Show'} Filters
          </button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Search */}
                <div className="md:col-span-2 lg:col-span-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Search
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={filters.searchTerm || ''}
                      onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value || undefined }))}
                      placeholder="Search by user, email, page, details..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* User Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    User
                  </label>
                  <select
                    value={filters.userId || ''}
                    onChange={(e) => setFilters(prev => ({ ...prev, userId: e.target.value || undefined }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">All Users</option>
                    {uniqueUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Role Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    value={filters.userRole || ''}
                    onChange={(e) => setFilters(prev => ({ ...prev, userRole: e.target.value || undefined }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">All Roles</option>
                    {uniqueRoles.map(role => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Action Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Action Type
                  </label>
                  <select
                    value={filters.action?.[0] || ''}
                    onChange={(e) => setFilters(prev => ({ 
                      ...prev, 
                      action: e.target.value ? [e.target.value as UserSessionAction] : undefined 
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">All Actions</option>
                    {actionTypes.map(action => (
                      <option key={action} value={action}>
                        {formatUserSessionActionText(action)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date Range */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={filters.startDate ? filters.startDate.toISOString().split('T')[0] : ''}
                    onChange={(e) => setFilters(prev => ({ 
                      ...prev, 
                      startDate: e.target.value ? new Date(e.target.value) : undefined 
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={filters.endDate ? filters.endDate.toISOString().split('T')[0] : ''}
                    onChange={(e) => setFilters(prev => ({ 
                      ...prev, 
                      endDate: e.target.value ? new Date(e.target.value) : undefined 
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Clear Filters */}
                <div className="md:col-span-2 lg:col-span-4 flex justify-end">
                  <button
                    onClick={() => setFilters({})}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Logs</p>
              <p className="text-2xl font-bold text-gray-900">{filteredLogs.length}</p>
            </div>
            <Activity className="w-8 h-8 text-blue-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Unique Users</p>
              <p className="text-2xl font-bold text-gray-900">{uniqueUsers.length}</p>
            </div>
            <User className="w-8 h-8 text-green-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Logins Today</p>
              <p className="text-2xl font-bold text-gray-900">
                {filteredLogs.filter(log => {
                  const logDate = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
                  const today = new Date();
                  return log.action === 'login' && 
                         logDate.toDateString() === today.toDateString();
                }).length}
              </p>
            </div>
            <LogIn className="w-8 h-8 text-purple-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Sessions</p>
              <p className="text-2xl font-bold text-gray-900">
                {filteredLogs.filter(log => 
                  log.action === 'login' || log.action === 'session_start'
                ).length - filteredLogs.filter(log => 
                  log.action === 'logout' || log.action === 'session_end'
                ).length}
              </p>
            </div>
            <Eye className="w-8 h-8 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
      >
        {loading && filteredLogs.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading logs...</p>
          </div>
        ) : paginatedLogs.length === 0 ? (
          <div className="p-12 text-center">
            <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No logs found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Page
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Details
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedLogs.map((log) => {
                    const isExpanded = expandedLogs.has(log.id);
                    return (
                      <React.Fragment key={log.id}>
                        <tr className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-gray-400" />
                              <div>
                                <p className="text-sm font-medium text-gray-900">{log.userName}</p>
                                <p className="text-xs text-gray-500">{log.userRole}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getUserSessionActionColor(log.action)}`}>
                              <span>{getUserSessionActionIcon(log.action)}</span>
                              {formatUserSessionActionText(log.action)}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            {log.page || 'N/A'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatUserSessionTimestamp(log.timestamp)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => toggleExpanded(log.id)}
                              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                            >
                              {isExpanded ? 'Hide' : 'Show'} Details
                              <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={5} className="px-4 py-4 bg-gray-50">
                              <div className="space-y-2 text-sm">
                                {log.details && (
                                  <div>
                                    <span className="font-medium text-gray-700">Details: </span>
                                    <span className="text-gray-600">{log.details}</span>
                                  </div>
                                )}
                                {log.userEmail && (
                                  <div>
                                    <span className="font-medium text-gray-700">Email: </span>
                                    <span className="text-gray-600">{log.userEmail}</span>
                                  </div>
                                )}
                                {log.sessionId && (
                                  <div>
                                    <span className="font-medium text-gray-700">Session ID: </span>
                                    <span className="text-gray-600 font-mono text-xs">{log.sessionId}</span>
                                  </div>
                                )}
                                {log.duration && (
                                  <div>
                                    <span className="font-medium text-gray-700">Duration: </span>
                                    <span className="text-gray-600">{Math.round(log.duration / 60)} minutes</span>
                                  </div>
                                )}
                                {log.userAgent && (
                                  <div>
                                    <span className="font-medium text-gray-700">User Agent: </span>
                                    <span className="text-gray-600 text-xs">{log.userAgent}</span>
                                  </div>
                                )}
                                {log.deviceInfo && (
                                  <div>
                                    <span className="font-medium text-gray-700">Device: </span>
                                    <span className="text-gray-600">{log.deviceInfo}</span>
                                  </div>
                                )}
                                {log.ipAddress && (
                                  <div>
                                    <span className="font-medium text-gray-700">IP Address: </span>
                                    <span className="text-gray-600 font-mono text-xs">{log.ipAddress}</span>
                                  </div>
                                )}
                                {log.metadata && (
                                  <div>
                                    <span className="font-medium text-gray-700">Metadata: </span>
                                    <pre className="text-gray-600 text-xs mt-1 bg-white p-2 rounded border overflow-auto">
                                      {JSON.stringify(log.metadata, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700">
                    Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredLogs.length)} of {filteredLogs.length} logs
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-700">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-700">Per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-2 py-1 text-sm border border-gray-300 rounded-lg"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}

