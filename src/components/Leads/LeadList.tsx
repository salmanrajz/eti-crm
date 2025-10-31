/**
 * ===============================================================================
 * LEAD LIST COMPONENT - LEAD MANAGEMENT INTERFACE
 * ===============================================================================
 * 
 * This component provides a comprehensive interface for viewing, searching, and
 * managing leads in the CRM system. It features advanced filtering, pagination,
 * and real-time updates with optimized caching for performance.
 * 
 * FEATURES:
 * 
 * 1. ADVANCED LEAD DISPLAY AND FILTERING
 *    - Real-time lead list with search and filter capabilities
 *    - Status-based filtering (verified, pending, assigned, activated)
 *    - Date range filtering for time-based lead analysis
 *    - Role-based access control and data visibility
 * 
 * 2. PERFORMANCE OPTIMIZATION
 *    - Advanced caching system with localStorage persistence
 *    - Mobile-optimized loading sizes and pagination
 *    - Efficient Firestore queries with pagination support
 *    - Real-time updates via snapshot listeners
 * 
 * 3. SEARCH AND NAVIGATION
 *    - Multi-field search across name, number, plan, and status
 *    - Sorting capabilities by various lead attributes
 *    - Pagination with configurable page sizes
 *    - URL parameter support for deep linking and state persistence
 * 
 * 4. ROLE-BASED FUNCTIONALITY
 *    - Different views and capabilities based on user role
 *    - Coordinator-specific filtering by group assignments
 *    - Verifier access to appropriate lead subsets
 *    - Manager oversight capabilities
 * 
 * 5. DATA MANAGEMENT
 *    - Efficient data loading with caching strategies
 *    - Real-time updates without performance degradation
 *    - Proper cleanup of listeners and memory management
 *    - Error handling and retry mechanisms
 * 
 * USAGE:
 * This component is the primary interface for lead management across
 * all user roles, providing unified access to lead data and workflows.
 * ===============================================================================
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { collection, query, where, getDocs, orderBy, deleteDoc, doc, limit, startAfter, QueryDocumentSnapshot, DocumentData, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { Lead, CoordinatorType, VerifierGroups } from '../../types';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { 
  Plus, 
  Search, 
  Filter,
  Eye,
  ArrowRight,
  Phone,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  Zap,
  Hash,
  Trash2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  MapPin,
  User2,
  ArrowUpDown,
  Settings
} from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import React from 'react';
// ✅ ENHANCED: Import enhanced cache system and performance monitoring
import { dashboardPerf } from '../../utils/performance';
import { leadsCache, userCache } from '../../utils/cache';
import { AdvancedLeadSearch } from './AdvancedLeadSearch';

// ✅ PERFORMANCE: Optimized load sizes for faster initial loading
const INITIAL_LOAD_SIZE = (() => {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  return isMobile ? 50 : 100; // Reduced for faster loading
})();
const PAGINATION_SIZE = (() => {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  return isMobile ? 20 : 50; // Optimized for better performance
})();

// ✅ PERFORMANCE: Debounce configuration for real-time updates
const DEBOUNCE_DELAY = 500; // 500ms debounce for real-time updates

// ✅ ENHANCED: Separate cache instances for different data types with localStorage support
import { PerformanceCache } from '../../utils/cache';

const numberGroupsCache = new PerformanceCache<Map<string, string>>({
  maxAge: 60 * 60 * 1000, // 1 hour
  maxSize: 50,
  persistent: true,
  prefix: 'crm_number_groups',
  trackPerformance: true
});

const agentInfoCache = new PerformanceCache<Map<string, { name: string; teamId?: string }>>({
  maxAge: 60 * 60 * 1000, // 1 hour
  maxSize: 100,
  persistent: true,
  prefix: 'crm_agent_info',
  trackPerformance: true
});

// Team info cache (teamId -> teamName)
const teamInfoCache = new PerformanceCache<Map<string, string>>({
  maxAge: 60 * 60 * 1000, // 1 hour
  maxSize: 100,
  persistent: true,
  prefix: 'crm_team_info',
  trackPerformance: true
});

// ✅ OPTIMIZED: Active listeners tracker to prevent duplicate listeners
const activeListeners: Map<string, () => void> = new Map();

// Helper function to check if a lead belongs to coordinator's group
const isLeadInCoordinatorGroup = (lead: Lead, coordinatorType: CoordinatorType): boolean => {
  if (!lead.plans || lead.plans.length === 0) return false;
  
  // Get all unique groups from the lead's plans
  const leadGroups = new Set(lead.plans.map(plan => plan.group).filter(Boolean));
  
  switch (coordinatorType) {
    case 'g1':
      return leadGroups.has('G1');
    case 'g2':
      return leadGroups.has('G2');
    case 'g3':
      return leadGroups.has('G3');
    case 'all':
      // All groups coordinator can handle any group
      return true;
    default:
      return false;
  }
};

export function LeadList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [numberGroups, setNumberGroups] = useState<Map<string, string>>(new Map());
  const [loadingMore, setLoadingMore] = useState(false);
  const [isMobile] = useState(() => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const { user, isAdmin, isManager, isVerifier } = useAuthStore();
  const [searchParams] = useSearchParams();
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [dateRange, setDateRange] = useState<{
    from?: string;
    to?: string;
  }>({});
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);

  // ✅ OPTIMIZED: Use refs to store unsubscribe functions for proper cleanup
  const leadsUnsubscribeRef = useRef<(() => void) | null>(null);
  
  // ✅ PERFORMANCE: Debounced update mechanism to prevent excessive re-renders
  const debouncedUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdateRef = useRef<Lead[] | null>(null);

  // ✅ PERFORMANCE: Debounced update function to prevent excessive re-renders
  const debouncedUpdateLeads = useCallback((leadsData: Lead[], lastDoc: QueryDocumentSnapshot<DocumentData> | null, hasMore: boolean) => {
    // Clear existing timeout
    if (debouncedUpdateRef.current) {
      clearTimeout(debouncedUpdateRef.current);
    }

    // Store pending update
    pendingUpdateRef.current = leadsData;

    // Set new timeout for debounced update
    debouncedUpdateRef.current = setTimeout(() => {
      if (pendingUpdateRef.current) {
        setLeads(pendingUpdateRef.current);
        setLastDoc(lastDoc);
        setHasMore(hasMore);
        pendingUpdateRef.current = null;
      }
    }, DEBOUNCE_DELAY);
  }, []);

  // Memoize cache key
  const cacheKey = useMemo(() => {
    const coordinatorType = user?.role === 'coordinator' ? user.coordinatorType || 'all' : 'not-coordinator';
    const dateRangeKey = dateRange.from || dateRange.to ? `_${dateRange.from || 'none'}_${dateRange.to || 'none'}` : '';
    return `leads_${user?.id}_${user?.role}_${user?.teamId || 'no-team'}_${coordinatorType}${dateRangeKey}`;
  }, [user?.id, user?.role, user?.teamId, user?.coordinatorType, dateRange.from, dateRange.to]);

  // Add effect to handle URL parameters
  useEffect(() => {
    const statusFromUrl = searchParams.get('status');
    const fromDate = searchParams.get('from');
    const toDate = searchParams.get('to');
    
    if (statusFromUrl) {
      setStatusFilter(statusFromUrl);
    }
    
    if (fromDate || toDate) {
      setDateRange({
        from: fromDate || undefined,
        to: toDate || undefined
      });
    } else {
      setDateRange({});
    }
  }, [searchParams]);

  useEffect(() => {
    if (!user) {
      // ✅ FIX: Cleanup listeners when user logs out
      if (leadsUnsubscribeRef.current) {
        leadsUnsubscribeRef.current();
        leadsUnsubscribeRef.current = null;
      }
      
      // Cleanup active listeners - user is null at this point
      // We'll clean up any remaining listeners in the cleanup function
      
      setLoading(false);
      setLeads([]);
      return;
    }

    loadLeads(true); // true = initial load
  }, [user, cacheKey]);


  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, itemsPerPage, dateRange]);


  // ✅ ENHANCED: Enhanced data loading with real-time updates and persistent caching
  const loadLeads = useCallback(async (isInitialLoad = false) => {
    try {
      if (!user) return;

      // ✅ OPTIMIZED: Check for existing listener to prevent duplicates
      // Use a base listener key that doesn't include dynamic parameters
      const baseListenerKey = `leads_${user.id}_${user.role}`;
      
      // Always clean up old listener when starting a new one for initial load
      if (isInitialLoad) {
        // Clean up any existing listener for this user/role combination
        if (leadsUnsubscribeRef.current) {
          leadsUnsubscribeRef.current();
          leadsUnsubscribeRef.current = null;
        }
        
        // Remove from active listeners using base key
        if (activeListeners.has(baseListenerKey)) {
          activeListeners.get(baseListenerKey)?.();
          activeListeners.delete(baseListenerKey);
        }

        // ✅ ENHANCED: Check persistent cache first for instant display
        const cachedData = leadsCache.get(cacheKey);
        if (cachedData) {
          // ✅ PERFORMANCE: Cache hit - instant display
          // Fix any Map objects in cached plans
          const fixedCachedLeads = cachedData.leads.map((lead: any) => ({
            ...lead,
            plans: lead.plans?.map((plan: any) => {
              // Convert any Map objects back to regular objects
              if (plan instanceof Map) {
                return Object.fromEntries(plan);
              }
              return plan;
            })
          }));

          setLeads(fixedCachedLeads);
          setLastDoc(cachedData.lastDoc || null);
          setHasMore(cachedData.hasMore);
          setLoading(false);
          // Continue to setup real-time listener below for fresh updates
        } else {
          // No cached data, set loading state
          setLoading(true);
        }
      }

      if (isInitialLoad) {
        // Only set loading if we don't have cached data (cached data already sets loading to false)
        if (!leadsCache.get(cacheKey)) {
          setLoading(true);
        }
        // ✅ PERFORMANCE: Track loading time
        dashboardPerf.measureQuery('leadsList', { userId: user.id, role: user.role });
      } else {
        setLoadingMore(true);
      }

      let baseQuery = collection(db, 'leads');
      let constraints = [];

      // Add role-based filters
      if (user.role === 'agent') {
        constraints.push(where('agentId', '==', user.id));
      } else if (isVerifier()) {
        constraints.push(
          where('status', 'in', [
            'pending_verification',
            'verified',
            'rejected',
            'follow_up'
          ])
        );
      } else if (isManager() && user.teamId) {
        constraints.push(where('teamId', '==', user.teamId));
      }

      // Add ordering
      constraints.push(orderBy('createdAt', 'desc'));

      // Add pagination
      const loadSize = isInitialLoad ? INITIAL_LOAD_SIZE : PAGINATION_SIZE;
      constraints.push(limit(loadSize));

      // Add startAfter for pagination
      if (!isInitialLoad && lastDoc) {
        constraints.push(startAfter(lastDoc));
      }

      const q = query(baseQuery, ...constraints);
      
      // ✅ PERFORMANCE: Optimized real-time updates with reduced overhead
      if (isInitialLoad) {
        // Setup onSnapshot for real-time updates with performance optimizations
        const unsubscribe = onSnapshot(q, async (snapshot) => {
          try {
            // ✅ PERFORMANCE: Process data efficiently with early filtering
            const maxDocs = isMobile ? Math.min(snapshot.docs.length, 100) : snapshot.docs.length;
            let leadsData = snapshot.docs.slice(0, maxDocs).map(doc => ({
              id: doc.id,
              ...doc.data(),
              createdAt: doc.data().createdAt?.toDate(),
              updatedAt: doc.data().updatedAt?.toDate()
            })) as Lead[];

            // ✅ PERFORMANCE: Apply date range filtering early to reduce processing
            if (dateRange.from || dateRange.to) {
              const fromDate = dateRange.from ? new Date(dateRange.from) : null;
              const toDate = dateRange.to ? new Date(dateRange.to) : null;
              
              leadsData = leadsData.filter(lead => {
                const leadDate = lead.updatedAt || lead.createdAt;
                if (!leadDate) return false;
                
                const leadDateObj = leadDate instanceof Date ? leadDate : new Date(leadDate);
                
                if (fromDate && leadDateObj < fromDate) return false;
                if (toDate && leadDateObj > toDate) return false;
                
                return true;
              });
            }

            // ✅ PERFORMANCE: Only process if data has actually changed
            if (leadsData.length > 0) {
              const leadsWithInfo = await processLeadsWithInfo(leadsData);

              // ✅ PERFORMANCE: Update cache efficiently
            const serializedLeads = leadsWithInfo.map(lead => ({
              ...lead,
              plans: lead.plans?.map(plan => {
                if (plan instanceof Map) {
                  return Object.fromEntries(plan);
                }
                return plan;
              })
            }));

            leadsCache.set(cacheKey, {
              leads: serializedLeads,
              lastDoc: snapshot.docs[snapshot.docs.length - 1],
              hasMore: snapshot.docs.length === loadSize
            });

              // ✅ PERFORMANCE: Use debounced update to prevent excessive re-renders
              debouncedUpdateLeads(
                leadsWithInfo,
                snapshot.docs[snapshot.docs.length - 1] || null,
                snapshot.docs.length === loadSize
              );
            }
            
            setLoading(false);

            // End performance measurement
            if (isInitialLoad) {
              const endMeasure = dashboardPerf.measureQuery('leadsList', { userId: user.id, role: user.role });
              if (typeof endMeasure === 'function') endMeasure();
            }
          } catch (error) {
            console.error('Error processing leads snapshot:', error);
            toast.error('Failed to process leads data');
          }
        }, (error) => {
          // ✅ FIX: Handle permission errors gracefully during logout
          if (error.code === 'permission-denied') {
            // User logged out or lost permissions - cleanup silently
            activeListeners.delete(baseListenerKey);
            if (leadsUnsubscribeRef.current) {
              leadsUnsubscribeRef.current();
              leadsUnsubscribeRef.current = null;
            }
            return;
          }
          
          console.error('Error in leads listener:', error);
          activeListeners.delete(baseListenerKey);
          toast.error('Failed to load leads');
        });

        // Store listener for cleanup
        leadsUnsubscribeRef.current = unsubscribe;
        activeListeners.set(baseListenerKey, unsubscribe);
      } else {
        // For pagination, use getDocs to append data
        const snapshot = await getDocs(q);
        const leadsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate()
        })) as Lead[];

        const leadsWithInfo = await processLeadsWithInfo(leadsData);
        setLeads(prev => [...prev, ...leadsWithInfo]);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === loadSize);
        setLoadingMore(false);
      }

    } catch (error) {
      console.error('Error loading leads:', error);
      toast.error('Failed to load leads');
      setLoading(false);
      setLoadingMore(false);
    }
  }, [user, cacheKey, lastDoc, isVerifier, isManager, dateRange]);

  // Add focus event to refresh data when user navigates back to leads page
  useEffect(() => {
    const handleFocus = () => {
      // Only refresh if user exists and we're not currently loading
      if (user && !loading) {
        loadLeads(true);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, loading, loadLeads]);

  // ✅ PERFORMANCE: Optimized batch processing with efficient queries
  const processLeadsWithInfo = useCallback(async (leadsData: Lead[]) => {
    // Early return for empty data
    if (!leadsData || leadsData.length === 0) return leadsData;

    // Get unique ids for batch processing
    const numberIds = [...new Set(leadsData.flatMap(lead => lead.plans?.map(plan => plan.numberId) || []))];
    const agentIds = [...new Set(leadsData.map(lead => lead.agentId))];

    // ✅ PERFORMANCE: Batch fetch all data in parallel with optimized queries
    const [numberGroupsResult, agentInfoResult] = await Promise.all([
      fetchNumberGroupsOptimized(numberIds),
      fetchAgentInfoOptimized(agentIds)
    ]);

    // ✅ PERFORMANCE: Process data efficiently
    const numberGroupsMap = numberGroupsResult;
    setNumberGroups(numberGroupsMap);

    // Normalize agent info map
    const agentInfo = new Map<string, { name: string; teamId?: string }>();
    agentInfoResult.forEach((value: any, key: string) => {
      if (typeof value === 'string') {
        agentInfo.set(key, { name: value });
      } else if (value && typeof value === 'object') {
        const name = value.name || value.fullName || value.displayName || value.email || 'Unknown Agent';
        const teamId = value.teamId as string | undefined;
        agentInfo.set(key, { name, teamId });
      } else {
        agentInfo.set(key, { name: 'Unknown Agent' });
      }
    });

    // ✅ PERFORMANCE: Get team info only for unique team IDs
    const derivedTeamIds = [...new Set(
      leadsData.map(lead => (lead.teamId as string) || (agentInfo.get(lead.agentId)?.teamId as string)).filter(Boolean)
    )] as string[];

    const teamInfo = await fetchTeamInfoOptimized(derivedTeamIds);

    // ✅ PERFORMANCE: Enrich leads efficiently
    return leadsData.map(lead => {
      const resolvedAgent = agentInfo.get(lead.agentId);
      const resolvedTeamId = (lead.teamId as string) || resolvedAgent?.teamId;
      const resolvedTeamName = resolvedTeamId ? teamInfo.get(resolvedTeamId) : undefined;
      return {
        ...lead,
        plans: lead.plans?.map(plan => ({
          ...plan,
          group: numberGroupsMap.get(plan.numberId) || 'Unassigned'
        })),
        agentName: resolvedAgent?.name || 'Unknown Agent',
        teamName: resolvedTeamName || (resolvedTeamId ? 'Unknown Team' : undefined)
      } as Lead & { agentName?: string; teamName?: string };
    });
  }, []);

  // ✅ PERFORMANCE: Optimized team info fetching with batch queries
  const fetchTeamInfoOptimized = useCallback(async (teamIds: string[]) => {
    if (!teamIds || teamIds.length === 0) return new Map();

    const cacheKey = `teamInfo_${teamIds.sort().join('_')}`;
    const cached = teamInfoCache.get(cacheKey);
    if (cached) {
      return cached instanceof Map ? cached : new Map(Object.entries(cached || {}));
    }

    const teamInfo = new Map<string, string>();

    // ✅ PERFORMANCE: Use batch queries instead of individual queries
    const chunkSize = 10; // Firestore 'in' query limit
    const chunks: string[][] = [];
    for (let i = 0; i < teamIds.length; i += chunkSize) {
      chunks.push(teamIds.slice(i, i + chunkSize));
    }

    // ✅ PERFORMANCE: Batch fetch using 'in' queries
    const promises = chunks.map(async (chunk) => {
      try {
        const q = query(collection(db, 'teams'), where('__name__', 'in', chunk));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || 'Unknown Team'
        }));
        } catch (error) {
        console.error(`Error fetching team batch:`, error);
        return chunk.map(id => ({ id, name: 'Unknown Team' }));
        }
    });

    const results = await Promise.all(promises);
    results.flat().forEach(({ id, name }) => {
      teamInfo.set(id, name);
    });

    teamInfoCache.set(cacheKey, teamInfo);
    return teamInfo;
  }, []);


  // ✅ PERFORMANCE: Optimized number groups fetching with batch queries
  const fetchNumberGroupsOptimized = useCallback(async (numberIds: string[]) => {
    if (numberIds.length === 0) return new Map();
    
    const cacheKey = `numberGroups_${numberIds.sort().join('_')}`;
    const cached = numberGroupsCache.get(cacheKey);
    if (cached) {
      return cached instanceof Map ? cached : new Map(Object.entries(cached || {}));
    }

    const numberGroups = new Map();

    // ✅ PERFORMANCE: Use batch queries instead of individual queries
    const chunkSize = 10; // Firestore 'in' query limit
    const chunks = [];
    for (let i = 0; i < numberIds.length; i += chunkSize) {
      chunks.push(numberIds.slice(i, i + chunkSize));
    }

    // ✅ PERFORMANCE: Batch fetch using 'in' queries
    const promises = chunks.map(async (chunk) => {
      try {
        const q = query(collection(db, 'numberPool'), where('__name__', 'in', chunk));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
          id: doc.id,
          group: doc.data().group || 'Unassigned'
        }));
        } catch (error) {
        console.error(`Error fetching number batch:`, error);
        return chunk.map(id => ({ id, group: 'Unassigned' }));
        }
    });

    const results = await Promise.all(promises);
    results.flat().forEach(({ id, group }) => {
      numberGroups.set(id, group);
    });

    numberGroupsCache.set(cacheKey, numberGroups);
    return numberGroups;
  }, []);


  // ✅ PERFORMANCE: Optimized agent info fetching with batch queries
  const fetchAgentInfoOptimized = useCallback(async (agentIds: string[]) => {
    if (agentIds.length === 0) return new Map();
    
    const cacheKey = `agentInfo_${agentIds.sort().join('_')}`;
    const cached = agentInfoCache.get(cacheKey);
    if (cached) {
      const cachedMap = cached instanceof Map ? cached : new Map(Object.entries(cached || {}));
      // Normalize legacy string values to objects on the fly
      const normalized = new Map<string, { name: string; teamId?: string }>();
      cachedMap.forEach((value: any, key: string) => {
        if (typeof value === 'string') {
          normalized.set(key, { name: value });
        } else if (value && typeof value === 'object') {
          const name = value.name || value.fullName || value.displayName || value.email || 'Unknown Agent';
          const teamId = value.teamId as string | undefined;
          normalized.set(key, { name, teamId });
        }
      });
      agentInfoCache.set(cacheKey, normalized as any);
      return normalized as any;
    }

    const agentInfo = new Map<string, { name: string; teamId?: string }>();

    // ✅ PERFORMANCE: Use batch queries instead of individual queries
    const chunkSize = 10; // Firestore 'in' query limit
    const chunks = [];
    for (let i = 0; i < agentIds.length; i += chunkSize) {
      chunks.push(agentIds.slice(i, i + chunkSize));
    }

    // ✅ PERFORMANCE: Batch fetch using 'in' queries
    const promises = chunks.map(async (chunk) => {
      try {
        const q = query(collection(db, 'users'), where('__name__', 'in', chunk));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || doc.data().fullName || doc.data().displayName || doc.data().email || 'Unknown Agent',
          teamId: doc.data().teamId
        }));
        } catch (error) {
        console.error(`Error fetching agent batch:`, error);
        return chunk.map(id => ({ id, name: 'Unknown Agent', teamId: undefined }));
        }
    });

    const results = await Promise.all(promises);
    results.flat().forEach(({ id, name, teamId }) => {
      agentInfo.set(id, { name, teamId });
    });

    agentInfoCache.set(cacheKey, agentInfo);
    return agentInfo;
  }, []);


  const handleDeleteLeads = async () => {
    if (!isAdmin()) {
      toast.error('Only administrators can delete leads');
      return;
    }

    if (selectedLeads.length === 0) {
      toast.error('Please select leads to delete');
      return;
    }

    setDeleteInProgress(true);

    try {
      for (const leadId of selectedLeads) {
        const leadRef = doc(db, 'leads', leadId);
        await deleteDoc(leadRef);
      }

      toast.success(`Successfully deleted ${selectedLeads.length} leads`);
      setSelectedLeads([]);
      
      // ✅ ENHANCED: Clear all related caches and reload
      leadsCache.clear(); // Clear leads cache to force fresh data
      numberGroupsCache.clear(); // Clear all number groups cache
      agentInfoCache.clear(); // Clear all agent info cache
      loadLeads(true);
    } catch (error) {
      console.error('Error deleting leads:', error);
      toast.error('Failed to delete leads');
    } finally {
      setDeleteInProgress(false);
      setShowDeleteDialog(false);
    }
  };

  // ✅ OPTIMIZED: Enhanced cleanup function with proper listener management - Mobile optimized
  useEffect(() => {
    // Cleanup function when component unmounts or user changes
    return () => {
      
      // ✅ PERFORMANCE: Cleanup debounced timeout
      if (debouncedUpdateRef.current) {
        clearTimeout(debouncedUpdateRef.current);
        debouncedUpdateRef.current = null;
      }
      
      // ✅ FIX: Cleanup listeners when component unmounts or user changes
      if (leadsUnsubscribeRef.current) {
        leadsUnsubscribeRef.current();
        leadsUnsubscribeRef.current = null;
      }

      // ✅ FIX: Remove from active listeners for all possible user states
      if (user?.id && user?.role) {
        activeListeners.delete(`leads_${user.id}_${user.role}`);
      }
      
      // Cleanup any remaining listeners for this component
      const baseListenerKey = user?.id && user?.role ? `leads_${user.id}_${user.role}` : null;
      if (baseListenerKey && activeListeners.has(baseListenerKey)) {
        activeListeners.get(baseListenerKey)?.();
        activeListeners.delete(baseListenerKey);
      }

      // Mobile optimization: Clear cache more aggressively on mobile to free memory
      if (isMobile) {
        leadsCache.clear();
        userCache.clear();
        numberGroupsCache.clear();
      }
      // ✅ OPTIMIZED: DON'T clear cache on unmount for better performance with optimized cache
      // Cache will naturally expire after optimized duration, keeping it for fast remounts
    };
  }, [user?.id, user?.role, isMobile]);

  // Memoized filtered leads with optimized search
  const filteredLeads = useMemo(() => {
    let filtered = leads;

    // Coordinators should never see pending_verification leads
    if (user?.role === 'coordinator') {
      filtered = filtered.filter(lead => lead.status !== 'pending_verification');
    }

    // Apply coordinator group filtering
    if (user?.role === 'coordinator' && user.coordinatorType && ['g1', 'g2', 'g3', 'all'].includes(user.coordinatorType)) {
      filtered = filtered.filter(lead => isLeadInCoordinatorGroup(lead, user.coordinatorType as CoordinatorType));

      // For coordinators, hide pending_verification and pending_coordinator statuses
      filtered = filtered.filter(lead => lead.status !== 'pending_verification');
      if (user.coordinatorType !== 'all' && user.coordinatorType !== undefined) {
        filtered = filtered.filter(lead => lead.status !== 'pending_coordinator');
      }
    }

    // Apply verifier group filtering
    if (user?.role === 'verifier' && user.verifierGroups && user.verifierGroups.length > 0) {
      const hasAllGroups = user.verifierGroups.includes('all');

      if (!hasAllGroups) {
        filtered = filtered.filter(lead => {
          // Check if any of the lead's plans belong to any of the verifier's groups
          const hasMatchingGroup = lead.plans?.some(plan => {
            // Get group from number groups mapping (same as used in display)
            const planGroup = numberGroups.get(plan.numberId)?.toLowerCase();
            return (user.verifierGroups as VerifierGroups)?.some((verifierGroup: string) => {
              const normalizedVerifierGroup = verifierGroup.toLowerCase();
              return planGroup === normalizedVerifierGroup;
            }) || false;
          }) || false;

          return hasMatchingGroup;
        });
      }
    }

    // Apply search and status filters
    if (!searchTerm && statusFilter === 'all') {
      return filtered;
    }

    return filtered.filter(lead => {
      const matchesSearch = !searchTerm || (
        lead.customerNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.plans?.some(plan => 
          plan.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
          plan.plan?.toLowerCase().includes(searchTerm.toLowerCase())
        ) ||
        lead.status?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.status?.replace(/_/g, ' ').toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [leads, searchTerm, statusFilter, user?.role, user?.coordinatorType, user?.verifierGroups, numberGroups]);

  // Add sorting function
  const handleSort = useCallback((field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField, sortDirection]);

  // Handle advanced search filters
  const handleAdvancedFiltersChange = useCallback(() => {
    // This will be used to apply advanced filters to the leads
    // For now, we'll just log the filters
    
  }, []);

  // Handle export results
  const handleExportResults = useCallback(async (filteredLeads: Lead[]) => {
    try {
      // Dynamic import for xlsx to avoid bundle size issues
      const XLSX = await import('xlsx');
      
      // Prepare data for Excel export
      const exportData = filteredLeads.map((lead, index) => {
        const plans = lead.plans?.map(plan => `${plan.plan} (${plan.number})`).join('; ') || 'No Plans';
        const planCategories = lead.plans?.map(plan => plan.category).join('; ') || 'No Categories';
        const planGroups = lead.plans?.map(plan => plan.group).join('; ') || 'No Groups';
        const selectedNumbers = lead.plans?.map(plan => plan.number).join('; ') || 'No Numbers';
        
        return {
          'S.No': index + 1,
          'Customer Name': lead.customerName || 'N/A',
          'Customer Phone': lead.customerNumber || lead.customerPhone || 'N/A',
          'Customer Address': lead.customerAddress || 'N/A',
          'Status': lead.status?.replace('_', ' ').toUpperCase() || 'N/A',
          'Selected Numbers': selectedNumbers,
          'Plans': plans,
          'Plan Categories': planCategories,
          'Plan Groups': planGroups,
          'Created Date': lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : 'N/A',
          'Updated Date': lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString() : 'N/A',
          'Agent ID': lead.agentId || 'N/A',
          'Coordinator ID': lead.coordinatorId || 'N/A',
          'Verifier ID': lead.verifierId || 'N/A',
          'Emirate': lead.emirate || 'N/A',
          'Area': lead.area || 'N/A',
          'Country': lead.country || 'N/A',
          'Gender': lead.gender || 'N/A',
          'Language': lead.language || 'N/A',
          'Advance Payment': lead.advancePayment ? 'Yes' : 'No',
          'Has Emirates ID': lead.hasEmirateId ? 'Yes' : 'No'
        };
      });

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);

      // Set column widths
      const colWidths = [
        { wch: 5 },   // S.No
        { wch: 20 },  // Customer Name
        { wch: 15 },  // Customer Phone
        { wch: 30 },  // Customer Address
        { wch: 12 },  // Status
        { wch: 25 },  // Selected Numbers
        { wch: 40 },  // Plans
        { wch: 20 },  // Plan Categories
        { wch: 15 },  // Plan Groups
        { wch: 12 },  // Created Date
        { wch: 12 },  // Updated Date
        { wch: 15 },  // Agent ID
        { wch: 18 },  // Coordinator ID
        { wch: 15 },  // Verifier ID
        { wch: 15 },  // Emirate
        { wch: 15 },  // Area
        { wch: 15 },  // Country
        { wch: 10 },  // Gender
        { wch: 12 },  // Language
        { wch: 15 },  // Advance Payment
        { wch: 15 }   // Has Emirates ID
      ];
      ws['!cols'] = colWidths;

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Filtered Leads');

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `Filtered_Leads_${timestamp}.xlsx`;

      // Save the file
      XLSX.writeFile(wb, filename);

      toast.success(`Successfully exported ${filteredLeads.length} leads to ${filename}`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export leads. Please try again.');
    }
  }, []);

  // Memoized sorted and filtered leads
  const sortedAndFilteredLeads = useMemo(() => {
    return [...filteredLeads].sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'customerName':
          comparison = (a.customerName || '').localeCompare(b.customerName || '');
          break;
        case 'customerNumber':
          comparison = (a.customerNumber || '').localeCompare(b.customerNumber || '');
          break;
        case 'group':
          const aGroup = a.plans?.[0]?.group || '';
          const bGroup = b.plans?.[0]?.group || '';
          comparison = aGroup.localeCompare(bGroup);
          break;
        case 'agentName':
          comparison = (a.agentName || '').localeCompare(b.agentName || '');
          break;
        case 'status':
          comparison = (a.status || '').localeCompare(b.status || '');
          break;
        case 'createdAt':
        default:
          // ✅ ENHANCED: Safe date comparison that handles both Date objects and strings
          const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
          const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
          comparison = aTime - bTime;
          break;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredLeads, sortField, sortDirection]);

  // Pagination calculations
  const totalPages = Math.ceil(sortedAndFilteredLeads.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentLeads = sortedAndFilteredLeads.slice(startIndex, endIndex);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handleItemsPerPageChange = useCallback((value: number) => {
    setItemsPerPage(value);
    setCurrentPage(1); // Reset to first page when changing items per page
  }, []);

  const getStatusBadgeClass = useCallback((status: string) => {
    switch (status) {
      case 'verified':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'pending_verification':
        return 'bg-yellow-100 text-yellow-800';
      case 'pending_coordinator':
        return 'bg-blue-100 text-blue-800';
      case 'follow_up':
        return 'bg-orange-100 text-orange-800';
      case 'activated':
        return 'bg-purple-100 text-purple-800';
      case 'assigned':
        return 'bg-indigo-100 text-indigo-800';
      case 'pending_assignment':
        return 'bg-cyan-100 text-cyan-800';
      case 'follow_verification':
        return 'bg-amber-100 text-amber-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }, []);

  const getStatusIcon = useCallback((status: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircle className="w-4 h-4 mr-1.5" />;
      case 'rejected':
        return <XCircle className="w-4 h-4 mr-1.5" />;
      case 'pending_verification':
        return <Clock className="w-4 h-4 mr-1.5" />;
      case 'pending_coordinator':
        return <Clock className="w-4 h-4 mr-1.5" />;
      case 'pending_assignment':
        return <Clock className="w-4 h-4 mr-1.5" />;
      case 'follow_up':
        return <ArrowRight className="w-4 h-4 mr-1.5" />;
      case 'follow_verification':
        return <ArrowRight className="w-4 h-4 mr-1.5" />;
      case 'activated':
        return <Zap className="w-4 h-4 mr-1.5" />;
      case 'assigned':
        return <User2 className="w-4 h-4 mr-1.5" />;
      default:
        return null;
    }
  }, []);

  // Load more function for infinite scroll (optional)
  const loadMoreLeads = useCallback(() => {
    if (!loadingMore && hasMore) {
      loadLeads(false);
    }
  }, [loadingMore, hasMore, loadLeads]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Page Header Skeleton */}
          <div className="mb-6 sm:mb-10">
            <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse" />
            <div className="mt-2 h-4 w-72 bg-gray-100 rounded-lg animate-pulse" />
          </div>

          {/* Search and Filters Skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="h-12 bg-white border border-gray-200 rounded-xl animate-pulse" />
            <div className="h-12 bg-white border border-gray-200 rounded-xl animate-pulse" />
            <div className="h-12 bg-white border border-gray-200 rounded-xl animate-pulse hidden lg:block" />
          </div>

          {/* Entries count & actions skeleton */}
          <div className="flex items-center gap-3 mb-4">
            <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
            <div className="h-4 w-10 bg-gray-100 rounded animate-pulse" />
            <div className="h-4 w-10 bg-gray-100 rounded animate-pulse" />
            <div className="h-4 w-10 bg-gray-100 rounded animate-pulse" />
          </div>

          {/* Table Header Skeleton (Desktop) */}
          <div className="hidden sm:block px-4 py-4 bg-white rounded-t-xl border border-gray-200 shadow-sm mb-0">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-3"><div className="h-4 w-36 bg-gray-100 rounded animate-pulse" /></div>
              <div className="col-span-2"><div className="h-4 w-28 bg-gray-100 rounded animate-pulse" /></div>
              <div className="col-span-4"><div className="h-4 w-28 bg-gray-100 rounded animate-pulse" /></div>
              <div className="col-span-1"><div className="h-4 w-20 bg-gray-100 rounded animate-pulse" /></div>
              <div className="col-span-2"><div className="h-4 w-20 bg-gray-100 rounded animate-pulse" /></div>
            </div>
          </div>

          {/* Rows Skeleton */}
          <div className="bg-white border border-t-0 border-gray-200 rounded-b-xl shadow-sm divide-y divide-gray-100">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="px-4 sm:px-6 py-4">
                {/* Desktop row */}
                <div className="hidden sm:grid grid-cols-12 gap-3 items-center">
                  <div className="col-span-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-100 rounded-xl animate-pulse" />
                      <div>
                        <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
                        <div className="mt-2 h-3 w-32 bg-gray-100 rounded animate-pulse" />
                      </div>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="space-y-2">
                      <div className="h-6 w-40 bg-gray-50 rounded-lg border border-gray-100 animate-pulse" />
                      <div className="h-6 w-36 bg-gray-50 rounded-lg border border-gray-100 animate-pulse" />
                    </div>
                  </div>
                  <div className="col-span-4">
                    <div className="space-y-2">
                      <div className="h-6 w-56 bg-gray-50 rounded-lg border border-gray-100 animate-pulse" />
                      <div className="h-6 w-48 bg-gray-50 rounded-lg border border-gray-100 animate-pulse" />
                    </div>
                  </div>
                  <div className="col-span-1">
                    <div className="h-7 w-24 bg-gray-100 rounded-full animate-pulse" />
                  </div>
                  <div className="col-span-2">
                    <div className="h-9 w-32 bg-gray-50 rounded-lg border border-gray-100 animate-pulse ml-auto" />
                  </div>
                </div>

                {/* Mobile row */}
                <div className="sm:hidden">
                  <div className="flex items-start gap-3">
                    <div className="w-14 h-14 bg-gray-100 rounded-2xl animate-pulse" />
                    <div className="flex-1 min-w-0">
                      <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
                      <div className="mt-2 h-3 w-28 bg-gray-100 rounded animate-pulse" />
                      <div className="mt-2 h-3 w-24 bg-gray-100 rounded animate-pulse" />
                    </div>
                    <div className="h-6 w-20 bg-gray-100 rounded-full animate-pulse" />
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="h-6 w-full bg-gray-50 rounded-lg border border-gray-100 animate-pulse" />
                    <div className="h-6 w-5/6 bg-gray-50 rounded-lg border border-gray-100 animate-pulse" />
                  </div>
                  <div className="mt-3 h-9 w-full bg-gray-50 rounded-lg border border-gray-100 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
      {/* Delete Confirmation Dialog */}
      <AnimatePresence>
      {showDeleteDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="flex items-center justify-center mb-4"
              >
                <div className="p-3 bg-red-100 rounded-full">
              <AlertCircle className="h-12 w-12 text-red-500" />
            </div>
              </motion.div>
              <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">
              Delete Leads
            </h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              Are you sure you want to delete {selectedLeads.length} selected leads? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                onClick={() => setShowDeleteDialog(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors duration-200"
              >
                Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                onClick={handleDeleteLeads}
                disabled={deleteInProgress}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                  {deleteInProgress ? (
                    <div className="flex items-center">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Deleting...
            </div>
                  ) : (
                    'Delete Leads'
                  )}
                </motion.button>
          </div>
            </motion.div>
          </motion.div>
      )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="sm:flex sm:items-center"
        >
        <div className="sm:flex-auto">
            <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
              Leads
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              {dateRange.from || dateRange.to ? (
                <>
                  Showing leads from{' '}
                  {dateRange.from && <span className="font-medium">{new Date(dateRange.from).toLocaleDateString()}</span>}
                  {dateRange.from && dateRange.to && ' to '}
                  {dateRange.to && <span className="font-medium">{new Date(dateRange.to).toLocaleDateString()}</span>}
                </>
              ) : (
                'View and manage all leads in your dashboard'
              )}
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none space-x-4">
          {isAdmin() && selectedLeads.length > 0 && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              onClick={() => setShowDeleteDialog(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 shadow-lg hover:shadow-xl transition-all duration-200"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected ({selectedLeads.length})
              </motion.button>
          )}
          {user?.role === 'agent' && (
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
            <Link
              to="/dashboard/leads/create"
                  className="inline-flex items-center justify-center rounded-lg border border-transparent bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:shadow-xl transition-all duration-200"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Lead
            </Link>
              </motion.div>
          )}
        </div>
        </motion.div>

        {/* Enhanced Search and Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-6 flex flex-col sm:flex-row gap-4"
        >
          {/* Search Bar */}
          <div className="relative flex-1">
            <div className="relative rounded-xl shadow-sm group bg-white border border-gray-200 hover:border-indigo-200 transition-all duration-200">
              <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                <Search className="h-5 w-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors duration-200" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, number, plan, or status..."
                className="block w-full rounded-xl border-0 pl-11 pr-4 py-3.5 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/20 sm:text-sm"
              />
            </div>
          </div>

          {/* Filters - Stack vertically on mobile */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 hover:border-indigo-200 px-4 py-2 transition-all duration-200">
              <span className="text-sm font-medium text-gray-600">Show</span>
              <select
                value={itemsPerPage}
                onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
                className="rounded-lg border-0 bg-transparent py-1.5 pl-2 pr-8 text-sm font-medium text-gray-900 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={100}>100</option>
              </select>
              <span className="text-sm font-medium text-gray-600">entries</span>
            </div>

            {/* Advanced Search Button - Admin Only */}
            {isAdmin() && (
              <button
                onClick={() => setShowAdvancedSearch(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl hover:from-purple-700 hover:to-blue-700 transition-all duration-200 shadow-md hover:shadow-lg"
              >
                <Settings className="h-4 w-4" />
                <span className="text-sm font-medium">Advanced Search</span>
              </button>
            )}
            <div className="relative">
              <div className="relative rounded-xl shadow-sm group bg-white border border-gray-200 hover:border-indigo-200 transition-all duration-200">
                <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                  <Filter className="h-5 w-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors duration-200" />
                </div>
                <select
                  className="block w-full rounded-xl border-0 pl-11 pr-8 py-3.5 text-gray-900 focus:ring-2 focus:ring-indigo-500/20 sm:text-sm cursor-pointer appearance-none bg-transparent"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">All Status</option>
                  <option value="pending_verification">Pending Verification</option>
                  <option value="verified">Verified</option>
                  <option value="rejected">Rejected</option>
                  <option value="follow_up">Follow Up</option>
                  <option value="activated">Activated</option>
                  <option value="assigned">Assigned</option>
                  <option value="pending_assignment">Pending Assignment</option>
                  <option value="pending_coordinator">Pending Coordinator</option>
                  <option value="follow_verification">Follow-up Verification</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Entries Count */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-4 flex items-center gap-2 text-sm text-gray-600"
        >
          <span>Showing</span>
          <span className="font-medium text-gray-900">{startIndex + 1}</span>
          <span>to</span>
          <span className="font-medium text-gray-900">{Math.min(endIndex, sortedAndFilteredLeads.length)}</span>
          <span>of</span>
          <span className="font-medium text-gray-900">{sortedAndFilteredLeads.length}</span>
          <span>entries</span>
        </motion.div>

        {/* List Headers - Hide on mobile */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="hidden sm:block mt-4 px-4 py-4 bg-white rounded-t-xl border border-gray-200 shadow-sm"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center w-1/6">
              <button
                onClick={() => handleSort('customerName')}
                className="flex items-center text-sm font-semibold text-gray-900 tracking-wide hover:text-indigo-600 transition-colors duration-200"
              >
                Customer Information
                <ArrowUpDown className="h-4 w-4 ml-1" />
                {sortField === 'customerName' && (
                  sortDirection === 'asc' ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />
                )}
              </button>
            </div>
            <div className="flex items-center w-1/6">
              <button
                onClick={() => handleSort('customerNumber')}
                className="flex items-center text-sm font-semibold text-gray-900 tracking-wide hover:text-indigo-600 transition-colors duration-200"
              >
                Selected Numbers
                <ArrowUpDown className="h-4 w-4 ml-1" />
                {sortField === 'customerNumber' && (
                  sortDirection === 'asc' ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />
                )}
              </button>
            </div>
            <div className="flex items-center w-1/6">
              <button
                onClick={() => handleSort('group')}
                className="flex items-center text-sm font-semibold text-gray-900 tracking-wide hover:text-indigo-600 transition-colors duration-200"
              >
                Group
                <ArrowUpDown className="h-4 w-4 ml-1" />
                {sortField === 'group' && (
                  sortDirection === 'asc' ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />
                )}
              </button>
            </div>
            <div className="hidden md:flex items-center w-1/6">
              <span className="text-sm font-semibold text-gray-900 tracking-wide">Plan Details</span>
            </div>
            {(isManager() || user?.role === 'coordinator') && (
              <div className="flex items-center justify-center w-1/6">
                <button
                  onClick={() => handleSort('agentName')}
                  className="flex items-center text-sm font-semibold text-gray-900 tracking-wide hover:text-indigo-600 transition-colors duration-200"
                >
                  Agent & Team
                  <ArrowUpDown className="h-4 w-4 ml-1" />
                  {sortField === 'agentName' && (
                    sortDirection === 'asc' ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />
                  )}
                </button>
              </div>
            )}
            <div className="flex items-center justify-center w-1/6">
              <button
                onClick={() => handleSort('status')}
                className="flex items-center text-sm font-semibold text-gray-900 tracking-wide hover:text-indigo-600 transition-colors duration-200"
              >
                Status
                <ArrowUpDown className="h-4 w-4 ml-1" />
                {sortField === 'status' && (
                  sortDirection === 'asc' ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />
                )}
              </button>
            </div>
            <div className="flex items-center justify-end w-1/6">
              <span className="text-sm font-semibold text-gray-900 tracking-wide">Actions</span>
            </div>
          </div>
        </motion.div>

        {/* Leads List */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="space-y-2 mt-6"
        >
          <AnimatePresence>
            {currentLeads.map((lead, index) => (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className={clsx(
                  "group relative bg-white border border-gray-200 hover:border-indigo-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden",
                  (lead as any).verificationMethod === 'whatsapp' && "bg-gradient-to-r from-emerald-50/50 to-transparent"
                )}
              >
                {/* WhatsApp Indicator */}
                {(lead as any).verificationMethod === 'whatsapp' && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 z-10"></div>
                )}
                <div className="p-4 relative z-10">
                  {/* Desktop Layout */}
                  <div className="hidden sm:flex items-center justify-between gap-4">
                    {/* Left Section - Customer Info */}
                    <div className="flex items-center w-1/6">
                      <div className="flex-shrink-0">
                        <motion.div 
                          whileHover={{ scale: 1.05 }}
                          className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center ring-2 ring-white shadow-sm"
                        >
                          <Phone className="h-6 w-6 text-indigo-600" />
                        </motion.div>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors duration-200">
                          {lead.customerName || 'Unnamed Customer'}
                        </h3>
                        <div className="flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors duration-200">
                          <Phone className="h-4 w-4 mr-1.5" />
                          {lead.customerNumber}
                        </div>
                        {lead.customerAddress && (
                          <div className="flex items-center text-s text-gray-500 mt-1">
                            <MapPin className="h-3 w-3 mr-1.5" />
                            {lead.customerAddress}
                          </div>
                        )}
                        <div className="flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors duration-200 mt-1">
                          <Clock className="h-4 w-4 mr-1.5" />
                          {format(lead.createdAt, 'MMM d, yyyy')}
                        </div>
                      </div>
                    </div>

                    {/* Selected Number Column */}
                    <div className="flex items-center w-1/6">
                      <div className="flex flex-col space-y-2">
                        {lead.plans?.map((plan, planIndex) => (
                          <div key={planIndex} className="flex items-center space-x-2 bg-gray-50 px-3 py-1.5 rounded-lg">
                        <Hash className="h-4 w-4 text-indigo-500" />
                        <span className="text-sm font-medium text-gray-700">
                              {plan.number || 'N/A'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Group Column */}
                    <div className="flex items-center w-1/6">
                      <div className="flex flex-col space-y-2">
                        {lead.plans?.map((plan, planIndex) => (
                          <div key={planIndex} className="flex items-center">
                            <span className={clsx(
                              "px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full",
                              plan.group === 'Group A' ? 'bg-blue-100 text-blue-800' :
                              plan.group === 'Group B' ? 'bg-green-100 text-green-800' :
                              plan.group === 'Group C' ? 'bg-purple-100 text-purple-800' :
                              plan.group === 'Group D' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            )}>
                              {plan.group}
                        </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Middle Section - Plan Details */}
                    <div className="hidden md:flex items-center w-1/6">
                      <div className="flex flex-col space-y-2">
                        {lead.plans?.map((plan, planIndex) => (
                          <div key={planIndex} className="flex items-center space-x-2 bg-gray-50 px-3 py-1.5 rounded-lg">
                          <Package className="h-4 w-4 text-indigo-500" />
                          <span className="text-sm font-medium text-gray-700">
                              {plan.plan || 'N/A'}
                          </span>
                        </div>
                        ))}
                      </div>
                    </div>

                    {/* Agent Column - Only visible to managers and coordinators */}
                    {(isManager() || user?.role === 'coordinator') && (
                      <div className="flex items-center justify-center w-1/6">
                        <div className="flex items-center space-x-2">
                          <User2 className="h-4 w-4 text-indigo-500" />
                          <div className="flex flex-col leading-tight">
                            <span className="text-sm font-medium text-gray-700">
                              {(lead as any).agentName || 'Unknown Agent'}
                            </span>
                            {user?.role === 'coordinator' && (
                              <span className="text-xs text-gray-500">
                                {(lead as any).teamName || 'Unknown Team'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Status Column */}
                    <div className="flex items-center justify-center w-1/6">
                      <motion.span
                        whileHover={{ scale: 1.05 }}
                        className={clsx(
                          "inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium shadow-sm ring-1 ring-opacity-5",
                          getStatusBadgeClass(lead.status),
                          "ring-current"
                        )}
                      >
                        {getStatusIcon(lead.status)}
                        {lead.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </motion.span>
                    </div>

                    {/* Right Section - Actions */}
                    <div className="flex items-center justify-end w-1/6">
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="relative z-20"
                      >
                        <Link
                          to={`/dashboard/leads/${lead.id}`}
                          className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-600 rounded-lg hover:from-indigo-100 hover:to-purple-100 transition-all duration-200 group ring-1 ring-indigo-100"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                          <ArrowRight className="h-4 w-4 ml-2 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
                        </Link>
                      </motion.div>
                    </div>
                  </div>

                  {/* Mobile Layout */}
                  <div className="sm:hidden">
                    {/* Customer Info Card with Status */}
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <motion.div 
                          whileHover={{ scale: 1.05 }}
                          className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center ring-2 ring-white shadow-sm"
                        >
                          <Phone className="h-7 w-7 text-indigo-600" />
                        </motion.div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors duration-200 truncate">
                              {lead.customerName || 'Unnamed Customer'}
                            </h3>
                            <div className="flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors duration-200 mt-1">
                              <Phone className="h-4 w-4 mr-1.5 flex-shrink-0" />
                              <span className="truncate">{lead.customerNumber}</span>
                            </div>
                            {lead.customerAddress && (
                              <div className="flex items-center text-s text-gray-500 mt-1">
                                <MapPin className="h-3 w-3 mr-1.5" />
                                {lead.customerAddress}
                              </div>
                            )}
                            <div className="flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors duration-200 mt-1">
                              <Clock className="h-4 w-4 mr-1.5 flex-shrink-0" />
                              <span>{format(lead.createdAt, 'MMM d, yyyy')}</span>
                            </div>
                          </div>
                          {/* Status Badge */}
                          <motion.div
                            whileHover={{ scale: 1.02 }}
                            className="flex-shrink-0"
                          >
                            <motion.span
                              className={clsx(
                                "inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-medium shadow-sm ring-1 ring-opacity-5",
                                getStatusBadgeClass(lead.status),
                                "ring-current"
                              )}
                            >
                              {getStatusIcon(lead.status)}
                              {lead.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </motion.span>
                          </motion.div>
                        </div>
                      </div>
                    </div>

                    {/* Plan Details Section */}
                    <div className="mt-4 space-y-3">
                      {/* Plan Details Cards */}
                      <div className="space-y-3">
                        {lead.plans?.map((plan, planIndex) => (
                          <React.Fragment key={planIndex}>
                        <motion.div
                          whileHover={{ scale: 1.02 }}
                          className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 ring-1 ring-indigo-100"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-white rounded-lg shadow-sm">
                              <Hash className="h-5 w-5 text-indigo-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-500">Selected Number</p>
                              <p className="text-base font-semibold text-gray-900 break-all">
                                    {plan.number || 'N/A'}
                              </p>
                            </div>
                          </div>
                        </motion.div>

                        <motion.div
                          whileHover={{ scale: 1.02 }}
                          className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 ring-1 ring-indigo-100"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-white rounded-lg shadow-sm">
                              <Package className="h-5 w-5 text-indigo-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-500">Plan Details</p>
                              <p className="text-base font-semibold text-gray-900 break-all">
                                    {plan.plan || 'N/A'}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="mt-4">
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="relative z-20"
                      >
                        <Link
                          to={`/dashboard/leads/${lead.id}`}
                          className="inline-flex items-center justify-center w-full px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-200 group shadow-lg shadow-indigo-500/20"
                        >
                          <Eye className="h-5 w-5 mr-2" />
                          <span className="font-medium">View Details</span>
                          <ArrowRight className="h-5 w-5 ml-2 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
                        </Link>
                      </motion.div>
                    </div>
                  </div>
                </div>

                {/* Hover Effect Overlay */}
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 to-purple-500/0 group-hover:from-indigo-500/5 group-hover:to-purple-500/5 transition-all duration-200 pointer-events-none" />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>

        {/* Empty State */}
        {filteredLeads.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-12 text-center"
          >
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-indigo-50 to-purple-50 mb-4 ring-2 ring-white shadow-sm">
              <Search className="h-8 w-8 text-indigo-500" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">No leads found</h3>
            <p className="mt-2 text-sm text-gray-500">
              Try adjusting your search or filter criteria
            </p>
          </motion.div>
        )}

        {/* Pagination Controls */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4"
        >
          {/* Left side - Items per page */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">Show</span>
            <select
              value={itemsPerPage}
              onChange={(e) => handleItemsPerPageChange(Number(e.target.value))}
              className="block w-20 rounded-md border-gray-300 py-1.5 text-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span className="text-sm text-gray-700">entries</span>
          </div>

          {/* Right side - Pagination and Load More */}
          <div className="flex items-center gap-4">
            {/* Pagination */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-3 py-2 text-sm font-medium rounded-md text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-gray-700">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="relative inline-flex items-center px-3 py-2 text-sm font-medium rounded-md text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Load More Button */}
            {hasMore && (
              <button
                onClick={loadMoreLeads}
                disabled={loadingMore}
                className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingMore ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Loading...
                  </>
                ) : (
                  <>
                    
                    Load More
                  </>
                )}
              </button>
            )}
          </div>
        </motion.div>
      </div>

      {/* Advanced Search Modal */}
      <AdvancedLeadSearch
        leads={leads}
        onFiltersChange={handleAdvancedFiltersChange}
        onExportResults={handleExportResults}
        isVisible={showAdvancedSearch}
        onClose={() => setShowAdvancedSearch(false)}
      />
    </div>
  );
}