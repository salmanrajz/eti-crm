/**
 * ===============================================================================
 * LEAD LOGS DASHBOARD COMPONENT - SYSTEM ACTIVITY MONITORING
 * ===============================================================================
 * 
 * This component provides comprehensive monitoring and logging of all lead
 * activities, including creation, updates, status changes, verification actions,
 * and other key operations. It enables administrators to track system usage
 * and audit activities.
 * 
 * FEATURES:
 * 
 * 1. COMPREHENSIVE ACTIVITY LOGGING
 *    - Real-time tracking of all lead activities
 *    - User action logging with timestamps and details
 *    - Status change tracking and audit trails
 * 
 * 2. ADVANCED FILTERING AND SEARCH
 *    - Multi-criteria filtering (user, action type, date range)
 *    - Real-time search across all log entries
 *    - Customizable filter combinations
 * 
 * 3. GROUPED LOG DISPLAY
 *    - Lead-specific action grouping for better readability
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
 *    - System activity monitoring and analytics
 * 
 * USAGE:
 * This component is primarily used by administrators to monitor system activities,
 * audit user actions, and track lead usage patterns.
 * ===============================================================================
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, 
  Search, 
  Filter, 
  User, 
  Hash, 
  Clock,
  ChevronDown,
  RefreshCw,
  ClipboardList
} from 'lucide-react';
import { collection, query as fsQuery, orderBy, limit as fsLimit, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  fetchLeadLogs, 
  LeadLog, 
  LeadLogFilters, 
  LeadLogAction,
  getLeadActionColor, 
  formatLeadActionText, 
  formatLeadTimestamp, 
  formatLeadDataValue, 
  formatLeadDataValueWithUserNames, 
  processLeadDetailsWithUserNames 
} from '../../utils/leadLogging';
import { useAuthStore } from '../../store/authStore';
import { toast } from 'react-hot-toast';

interface GroupedLog {
  leadNumber: string;
  leadId: string;
  actions: LeadLog[];
  latestAction: LeadLog;
  totalActions: number;
}

const actionTypes: LeadLogAction[] = [
  'created',
  'updated',
  'status_changed',
  'verified',
  'rejected',
  'non_verified',
  'activated',
  'assigned',
  'reassigned',
  'resubmitted',
  'split',
  'deleted',
  'plan_added',
  'plan_removed',
  'plan_updated',
  'customer_info_changed',
  'notes_added',
  'media_uploaded',
  'transferred'
];

export function LeadLogsDashboard() {
  const { user, isAdmin } = useAuthStore();
  const [logs, setLogs] = useState<LeadLog[]>([]);
  const [groupedLogs, setGroupedLogs] = useState<GroupedLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<LeadLogFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [expandedLeads, setExpandedLeads] = useState<Set<string>>(new Set());
  const [formattedChanges, setFormattedChanges] = useState<Record<string, string[]>>({});
  const [processedDetails, setProcessedDetails] = useState<Record<string, string>>({});
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [leadPhoneNumbers, setLeadPhoneNumbers] = useState<Record<string, string>>({});
  const [leadNumberCache, setLeadNumberCache] = useState<Record<string, string>>({});
  const CACHE_KEY = 'lead_logs_cache_v1';

  // Seed from cache for instant paint
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { logs: LeadLog[] };
        if (Array.isArray(cached.logs)) {
          setLogs(cached.logs);
          setLoading(false);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (isAdmin()) {
      // Real-time subscription (server + SDK local cache)
      const q = fsQuery(
        collection(db, 'lead_logs'),
        orderBy('timestamp', 'desc'),
        fsLimit(1000)
      );

      const unsub = onSnapshot(q, async (snap) => {
        try {
          const live: LeadLog[] = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
          setLogs(live);
          localStorage.setItem(CACHE_KEY, JSON.stringify({ logs: live }));
          setLoading(false);
        } catch (e) {
          // ignore
        }
      }, (error) => {
        // Handle permission errors gracefully during logout
        if (error.code === 'permission-denied') {
          // User logged out or lost permissions - cleanup silently
          return;
        }
        
        console.error('Error in LeadLogsDashboard listener:', error);
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
            const hay = `${log.leadNumber} ${log.userName} ${log.details || ''} ${log.action}`.toLowerCase();
            if (!hay.includes(s)) return false;
          }
          return true;
        });

        // Group by lead number (use human-readable leadNumber, fallback to leadId only if leadNumber is missing)
        const groupedMap = new Map<string, LeadLog[]>();
        filtered.forEach((log) => {
          // Always prefer human-readable leadNumber over leadId
          const key = log.leadNumber || log.leadId;
          if (!groupedMap.has(key)) groupedMap.set(key, []);
          groupedMap.get(key)!.push(log);
        });

        const grouped: GroupedLog[] = Array.from(groupedMap.entries()).map(([leadNumber, actions]) => {
          const sortedActions = actions.slice().sort((a, b) =>
            (b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0) - (a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0)
          );
          
          const leadId = sortedActions[0]?.leadId || '';
          
          // Helper to check if a string looks like a Firestore ID
          const isFirestoreId = (str: string | undefined): boolean => {
            return !!(str && str.length > 20 && /^[a-zA-Z0-9]{20,}$/.test(str));
          };
          
          // Helper to check if a string is human-readable (not a Firestore ID)
          const isHumanReadable = (str: string | undefined): boolean => {
            return !!(str && (str.length <= 20 || str.includes('-') || str.includes('_')));
          };
          
          // Get the best leadNumber from actions
          // Priority: 1) human-readable leadNumber from any action, 2) leadNumber from oldData/newData, 3) fallback to key
          let bestLeadNumber = sortedActions.find(a => 
            a.leadNumber && isHumanReadable(a.leadNumber) && a.leadNumber !== a.leadId
          )?.leadNumber;
          
          if (!bestLeadNumber) {
            // Try to get from oldData or newData
            const actionWithLeadNumber = sortedActions.find(a => {
              const oldLeadNum = a.oldData?.leadNumber;
              const newLeadNum = a.newData?.leadNumber;
              return (oldLeadNum && isHumanReadable(oldLeadNum)) || (newLeadNum && isHumanReadable(newLeadNum));
            });
            
            if (actionWithLeadNumber) {
              bestLeadNumber = actionWithLeadNumber.oldData?.leadNumber || actionWithLeadNumber.newData?.leadNumber;
            }
          }
          
          // If still not found, check if the key itself is human-readable
          if (!bestLeadNumber && isHumanReadable(leadNumber)) {
            bestLeadNumber = leadNumber;
          }
          
          // Final fallback: use the key (might be Firestore ID, will be resolved later)
          const finalLeadNumber = bestLeadNumber || leadNumber;
          
          return {
            leadNumber: finalLeadNumber,
            leadId: leadId,
            actions: sortedActions,
            latestAction: sortedActions[0],
            totalActions: actions.length,
          };
        });

        grouped.sort((a, b) =>
          (b.latestAction?.timestamp?.toDate ? b.latestAction.timestamp.toDate().getTime() : 0) - (a.latestAction?.timestamp?.toDate ? a.latestAction.timestamp.toDate().getTime() : 0)
        );

        setGroupedLogs(grouped);
        
        // Fetch phone numbers and lead numbers for all visible leads
        const fetchPromises = grouped.slice(0, 50).map(async (groupedLog) => {
          if (!groupedLog.leadId) return;
          
          // Check if leadNumber looks like a Firestore ID and we need to fetch the real leadNumber
          const isFirestoreId = groupedLog.leadNumber && groupedLog.leadNumber.length > 20 && /^[a-zA-Z0-9]{20,}$/.test(groupedLog.leadNumber);
          
          // Also check if leadNumber is missing or equals leadId
          const needsFetch = isFirestoreId || !groupedLog.leadNumber || groupedLog.leadNumber === groupedLog.leadId;
          
          if (needsFetch && !leadNumberCache[groupedLog.leadId]) {
            try {
              // First, try to get from newData in created action
              const createdAction = groupedLog.actions.find(a => a.action === 'created' && a.newData?.leadNumber);
              if (createdAction?.newData?.leadNumber) {
                const createdLeadNumber = createdAction.newData.leadNumber;
                if (createdLeadNumber && createdLeadNumber.length <= 20 && createdLeadNumber !== groupedLog.leadId) {
                  setLeadNumberCache(prev => ({
                    ...prev,
                    [groupedLog.leadId]: createdLeadNumber
                  }));
                  return;
                }
              }
              
              // Try to fetch from the lead document
              const leadDoc = await getDoc(doc(db, 'leads', groupedLog.leadId));
              if (leadDoc.exists()) {
                const leadData = leadDoc.data();
                const realLeadNumber = leadData.leadNumber;
                if (realLeadNumber && realLeadNumber !== groupedLog.leadId && realLeadNumber.length <= 20) {
                  setLeadNumberCache(prev => ({
                    ...prev,
                    [groupedLog.leadId]: realLeadNumber
                  }));
                }
              }
            } catch (error) {
              // Lead might be deleted, try to get from oldData
              const deletedAction = groupedLog.actions.find(a => a.action === 'deleted' && a.oldData?.leadNumber);
              if (deletedAction?.oldData?.leadNumber) {
                const deletedLeadNumber = deletedAction.oldData.leadNumber;
                if (deletedLeadNumber && deletedLeadNumber.length <= 20) {
                  setLeadNumberCache(prev => ({
                    ...prev,
                    [groupedLog.leadId]: deletedLeadNumber
                  }));
                }
              }
            }
          }
          
          // Fetch phone numbers
          if (!leadPhoneNumbers[groupedLog.leadId]) {
            // First, try to get from oldData (for deleted leads)
            const deletedAction = groupedLog.actions.find(a => a.action === 'deleted' && a.oldData);
            if (deletedAction?.oldData) {
              const oldData = deletedAction.oldData;
              const plans = oldData.plans || [];
              const phoneNumbers = plans
                .filter((p: any) => p.number && !p.numberId?.startsWith('virtual-'))
                .map((p: any) => p.number)
                .join(', ');
              if (phoneNumbers) {
                setLeadPhoneNumbers(prev => ({
                  ...prev,
                  [groupedLog.leadId]: phoneNumbers
                }));
              } else if (oldData.customerNumber) {
                // Fallback to customerNumber if plans don't have numbers
                setLeadPhoneNumbers(prev => ({
                  ...prev,
                  [groupedLog.leadId]: oldData.customerNumber
                }));
              }
            } else {
              // Try to fetch from the lead document (if it still exists)
              try {
                const leadDoc = await getDoc(doc(db, 'leads', groupedLog.leadId));
                if (leadDoc.exists()) {
                  const leadData = leadDoc.data();
                  const plans = leadData.plans || [];
                  const phoneNumbers = plans
                    .filter((p: any) => p.number && !p.numberId?.startsWith('virtual-'))
                    .map((p: any) => p.number)
                    .join(', ');
                  if (phoneNumbers) {
                    setLeadPhoneNumbers(prev => ({
                      ...prev,
                      [groupedLog.leadId]: phoneNumbers
                    }));
                  } else if (leadData.customerNumber) {
                    // Fallback to customerNumber if plans don't have numbers
                    setLeadPhoneNumbers(prev => ({
                      ...prev,
                      [groupedLog.leadId]: leadData.customerNumber
                    }));
                  }
                }
              } catch (error) {
                // Silently fail - phone number is optional
              }
            }
          }
        });
        
        await Promise.all(fetchPromises);
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [logs, filters]);

  // Fetch phone number when viewing a single lead
  useEffect(() => {
    if (groupedLogs.length === 1) {
      const selectedLog = groupedLogs[0];
      if (selectedLog.leadId && !leadPhoneNumbers[selectedLog.leadId]) {
        (async () => {
          // First, try to get from oldData (for deleted leads)
          const deletedAction = selectedLog.actions.find(a => a.action === 'deleted' && a.oldData);
          if (deletedAction?.oldData) {
            const oldData = deletedAction.oldData;
            const plans = oldData.plans || [];
            const phoneNumbers = plans
              .filter((p: any) => p.number && !p.numberId?.startsWith('virtual-'))
              .map((p: any) => p.number)
              .join(', ');
            if (phoneNumbers) {
              setLeadPhoneNumbers(prev => ({
                ...prev,
                [selectedLog.leadId]: phoneNumbers
              }));
            } else if (oldData.customerNumber) {
              setLeadPhoneNumbers(prev => ({
                ...prev,
                [selectedLog.leadId]: oldData.customerNumber
              }));
            }
          } else {
            // Try to fetch from the lead document
            try {
              const leadDoc = await getDoc(doc(db, 'leads', selectedLog.leadId));
              if (leadDoc.exists()) {
                const leadData = leadDoc.data();
                const plans = leadData.plans || [];
                const phoneNumbers = plans
                  .filter((p: any) => p.number && !p.numberId?.startsWith('virtual-'))
                  .map((p: any) => p.number)
                  .join(', ');
                if (phoneNumbers) {
                  setLeadPhoneNumbers(prev => ({
                    ...prev,
                    [selectedLog.leadId]: phoneNumbers
                  }));
                } else if (leadData.customerNumber) {
                  setLeadPhoneNumbers(prev => ({
                    ...prev,
                    [selectedLog.leadId]: leadData.customerNumber
                  }));
                }
              }
            } catch (error) {
              // Silently fail
            }
          }
        })();
      }
    }
  }, [groupedLogs, leadPhoneNumbers]);

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

  const handleFilterChange = (key: keyof LeadLogFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined
    }));
  };

  const clearFilters = () => {
    setFilters({});
  };

  // Helper function to get human-readable lead number
  const getHumanReadableLeadNumber = (groupedLog: GroupedLog): string => {
    // First check cache
    if (leadNumberCache[groupedLog.leadId]) {
      return leadNumberCache[groupedLog.leadId];
    }
    
    // Check if leadNumber looks like a Firestore ID (long alphanumeric string)
    const isFirestoreId = groupedLog.leadNumber && groupedLog.leadNumber.length > 20 && /^[a-zA-Z0-9]{20,}$/.test(groupedLog.leadNumber);
    
    if (isFirestoreId) {
      // Try to get human-readable leadNumber from oldData (for deleted leads)
      const deletedAction = groupedLog.actions.find(a => a.action === 'deleted' && a.oldData?.leadNumber);
      if (deletedAction?.oldData?.leadNumber && deletedAction.oldData.leadNumber.length <= 20 && !/^[a-zA-Z0-9]{20,}$/.test(deletedAction.oldData.leadNumber)) {
        return deletedAction.oldData.leadNumber;
      }
      // Try to get from any action's oldData or newData
      const actionWithLeadNumber = groupedLog.actions.find(a => 
        (a.oldData?.leadNumber && a.oldData.leadNumber.length <= 20 && !/^[a-zA-Z0-9]{20,}$/.test(a.oldData.leadNumber)) || 
        (a.newData?.leadNumber && a.newData.leadNumber.length <= 20 && !/^[a-zA-Z0-9]{20,}$/.test(a.newData.leadNumber))
      );
      if (actionWithLeadNumber) {
        const leadNum = actionWithLeadNumber.oldData?.leadNumber || actionWithLeadNumber.newData?.leadNumber;
        if (leadNum && leadNum.length <= 20 && !/^[a-zA-Z0-9]{20,}$/.test(leadNum)) {
          return leadNum;
        }
      }
      
      // If still not found, trigger async fetch (will update on next render)
      if (groupedLog.leadId) {
        (async () => {
          try {
            const leadDoc = await getDoc(doc(db, 'leads', groupedLog.leadId));
            if (leadDoc.exists()) {
              const leadData = leadDoc.data();
              const realLeadNumber = leadData.leadNumber;
              if (realLeadNumber && realLeadNumber !== groupedLog.leadId && realLeadNumber.length <= 20) {
                setLeadNumberCache(prev => ({
                  ...prev,
                  [groupedLog.leadId]: realLeadNumber
                }));
              }
            }
          } catch (error) {
            // Lead doesn't exist, try oldData
            const deletedAction = groupedLog.actions.find(a => a.action === 'deleted' && a.oldData?.leadNumber);
            if (deletedAction?.oldData?.leadNumber) {
              setLeadNumberCache(prev => ({
                ...prev,
                [groupedLog.leadId]: deletedAction.oldData.leadNumber
              }));
            }
          }
        })();
      }
    }
    
    // Return the leadNumber if it's already human-readable (short or contains dashes)
    if (groupedLog.leadNumber && (groupedLog.leadNumber.length <= 20 || groupedLog.leadNumber.includes('-'))) {
      return groupedLog.leadNumber;
    }
    
    // Fallback: return leadNumber even if it looks like an ID (will be updated when cache loads)
    return groupedLog.leadNumber || groupedLog.leadId;
  };

  const toggleLeadExpansion = async (leadNumber: string) => {
    setExpandedLeads(prev => {
      const newSet = new Set(prev);
      if (newSet.has(leadNumber)) {
        newSet.delete(leadNumber);
      } else {
        newSet.add(leadNumber);
        // Fetch lead data to get phone number when expanding
        const groupedLog = groupedLogs.find(g => g.leadNumber === leadNumber);
        if (groupedLog && groupedLog.leadId && !leadPhoneNumbers[groupedLog.leadId]) {
          (async () => {
            try {
              // First, try to get from oldData (for deleted leads)
              const deletedAction = groupedLog.actions.find(a => a.action === 'deleted' && a.oldData);
              if (deletedAction?.oldData) {
                const oldData = deletedAction.oldData;
                const plans = oldData.plans || [];
                const phoneNumbers = plans
                  .filter((p: any) => p.number && !p.numberId?.startsWith('virtual-'))
                  .map((p: any) => p.number)
                  .join(', ');
                if (phoneNumbers) {
                  setLeadPhoneNumbers(prev => ({
                    ...prev,
                    [groupedLog.leadId]: phoneNumbers
                  }));
                } else if (oldData.customerNumber) {
                  setLeadPhoneNumbers(prev => ({
                    ...prev,
                    [groupedLog.leadId]: oldData.customerNumber
                  }));
                }
              } else {
                // Try to fetch from the lead document
                const leadDoc = await getDoc(doc(db, 'leads', groupedLog.leadId));
                if (leadDoc.exists()) {
                  const leadData = leadDoc.data();
                  const plans = leadData.plans || [];
                  const phoneNumbers = plans
                    .filter((p: any) => p.number && !p.numberId?.startsWith('virtual-'))
                    .map((p: any) => p.number)
                    .join(', ');
                  if (phoneNumbers) {
                    setLeadPhoneNumbers(prev => ({
                      ...prev,
                      [groupedLog.leadId]: phoneNumbers
                    }));
                  } else if (leadData.customerNumber) {
                    setLeadPhoneNumbers(prev => ({
                      ...prev,
                      [groupedLog.leadId]: leadData.customerNumber
                    }));
                  }
                }
              }
            } catch (error) {
              console.error('Error fetching lead phone number:', error);
            }
          })();
        }
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
        // Process details to replace user IDs with names
        if (base.details && !processedDetails[actionId]) {
          const processed = await processLeadDetailsWithUserNames(base.details);
          setProcessedDetails(prev => ({ ...prev, [actionId]: processed }));
        }
      }
    })();
  };

  const formatDataChange = async (oldData: any, newData: any) => {
    if (!oldData && !newData) return null;
    
    const changes: string[] = [];
    
    // Fields to completely hide from logs
    const hiddenFields = ['numberTokens', 'tokensUpdatedAt'];
    
    if (oldData && newData) {
      // Get all unique keys from both objects
      const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
      
      for (const key of allKeys) {
        // Skip hidden fields completely
        if (hiddenFields.includes(key)) continue;
        
        const oldValue = oldData[key];
        const newValue = newData[key];
        
        if (oldValue !== newValue) {
          const formattedOld = await formatLeadDataValueWithUserNames(oldValue, key);
          const formattedNew = await formatLeadDataValueWithUserNames(newValue, key);
          changes.push(`${key}: ${formattedOld} → ${formattedNew}`);
        }
      }
    } else if (newData) {
      for (const key of Object.keys(newData)) {
        // Skip hidden fields completely
        if (hiddenFields.includes(key)) continue;
        
        const formattedValue = await formatLeadDataValueWithUserNames(newData[key], key);
        changes.push(`${key}: ${formattedValue}`);
      }
    }
    
    return changes;
  };

  if (!isAdmin()) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">Only administrators can view lead logs.</p>
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
                <ClipboardList className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Lead Activity Logs</h1>
                <p className="text-gray-600">
                  Track all lead operations and changes
                  {groupedLogs.length > 0 && groupedLogs.length === 1 && (() => {
                    const selectedLog = groupedLogs[0];
                    const humanReadableLeadNumber = getHumanReadableLeadNumber(selectedLog);
                    const phoneNumber = selectedLog.leadId ? leadPhoneNumbers[selectedLog.leadId] : null;
                    // Also try to get phone number from oldData if not in cache yet
                    const phoneFromOldData = !phoneNumber ? (() => {
                      const deletedAction = selectedLog.actions.find(a => a.action === 'deleted' && a.oldData);
                      if (deletedAction?.oldData) {
                        const oldData = deletedAction.oldData;
                        const plans = oldData.plans || [];
                        const phoneNumbers = plans
                          .filter((p: any) => p.number && !p.numberId?.startsWith('virtual-'))
                          .map((p: any) => p.number)
                          .join(', ');
                        return phoneNumbers || oldData.customerNumber || null;
                      }
                      return null;
                    })() : null;
                    const displayPhoneNumber = phoneNumber || phoneFromOldData;
                    return displayPhoneNumber ? (
                      <span className="ml-2 font-medium text-gray-900">
                        • Lead: {humanReadableLeadNumber} • Number: {displayPhoneNumber}
                      </span>
                    ) : (
                      <span className="ml-2 font-medium text-gray-900">
                        • Lead: {humanReadableLeadNumber}
                      </span>
                    );
                  })()}
                </p>
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
                        {formatLeadActionText(action)}
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

              <div className="flex justify-end mt-4">
                <button
                  onClick={clearFilters}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Clear Filters
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
              <p className="text-gray-600">No lead activity logs match your current filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Lead Number
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
                    const isExpanded = expandedLeads.has(groupedLog.leadNumber);
                    const latestLog = groupedLog.latestAction;
                    const changes = formattedChanges[latestLog.id] || [];
                    
                    return (
                      <React.Fragment key={groupedLog.leadNumber}>
                        <motion.tr
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.02 }}
                          className={`transition-colors cursor-pointer ${isExpanded ? 'bg-indigo-50/40' : 'hover:bg-gray-50'}`}
                          onClick={() => toggleLeadExpansion(groupedLog.leadNumber)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className={`mr-3 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                <ChevronDown className="h-4 w-4 text-gray-400" />
                              </div>
                              <Hash className="h-4 w-4 text-gray-400 mr-2" />
                              <div className="flex flex-col">
                                <span className="font-mono text-sm font-medium text-gray-900">
                                  {getHumanReadableLeadNumber(groupedLog)}
                                </span>
                                {leadPhoneNumbers[groupedLog.leadId] && (
                                  <span className="font-mono text-xs text-gray-500 mt-0.5">
                                    {leadPhoneNumbers[groupedLog.leadId]}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className={`inline-flex px-2.5 py-1.5 rounded-full text-xs font-medium border shadow-sm ${getLeadActionColor(latestLog.action)}`}>
                              {formatLeadActionText(latestLog.action)}
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
                                {formatLeadTimestamp(latestLog.timestamp)}
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
                              onClick={(e) => { e.stopPropagation(); toggleLeadExpansion(groupedLog.leadNumber); }}
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
                                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                                    All Actions for {getHumanReadableLeadNumber(groupedLog)}
                                    {leadPhoneNumbers[groupedLog.leadId] && (
                                      <span className="ml-2 text-xs font-normal text-gray-600">
                                        • {leadPhoneNumbers[groupedLog.leadId]}
                                      </span>
                                    )}
                                  </h3>
                                  <div className="space-y-4">
                                    {groupedLog.actions.map((log) => {
                                      const itemChanges = formattedChanges[log.id] || [];
                                      return (
                                        <div key={log.id} className="group rounded-lg border border-gray-200 bg-white/60 px-4 py-3 shadow-sm hover:shadow transition">
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                              <div className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getLeadActionColor(log.action)}`}>
                                                {formatLeadActionText(log.action)}
                                              </div>
                                              <span className="text-sm text-gray-600">
                                                {log.userName} ({log.userRole})
                                              </span>
                                              <span className="hidden md:inline text-xs text-gray-500">
                                                • {formatLeadTimestamp(log.timestamp)}
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

        {/* Stats */}
        {groupedLogs.length > 0 && (
          <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Activity Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-indigo-600">{groupedLogs.length}</div>
                <div className="text-sm text-gray-600">Leads Tracked</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {logs.filter(log => log.action === 'created').length}
                </div>
                <div className="text-sm text-gray-600">Leads Created</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-600">
                  {logs.filter(log => log.action === 'verified').length}
                </div>
                <div className="text-sm text-gray-600">Verified</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {logs.filter(log => log.action === 'rejected').length}
                </div>
                <div className="text-sm text-gray-600">Rejected</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

