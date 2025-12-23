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
import { collection, query, where, getDocs, orderBy, deleteDoc, doc, limit, startAfter, QueryDocumentSnapshot, DocumentData, onSnapshot, documentId, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { Lead, CoordinatorType, VerifierGroups } from '../../types';
import { Link, useSearchParams } from 'react-router-dom';
import { format, formatDistanceToNow, formatDistance, differenceInHours, differenceInMinutes } from 'date-fns';
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
  Settings,
  X,
  Check,
  CheckCheck,
  Calendar,
  ArrowRightLeft
} from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import React from 'react';
// ✅ ENHANCED: Import enhanced cache system and performance monitoring
import { dashboardPerf } from '../../utils/performance';
import { leadsCache, userCache } from '../../utils/cache';
import { AdvancedLeadSearch } from './AdvancedLeadSearch';
import { TransferLeadModal } from './TransferLeadModal';
import { WhatsAppConversationView, WhatsAppMessage } from '../WhatsApp/WhatsAppConversationView';
import { checkConversation } from '../../utils/whatsappRouter';
import { normalizeTimestamp, formatTimestamp, getTimestampForSort } from '../../utils/timestampUtils';

// ✅ PERFORMANCE: Optimized load sizes for faster initial loading
const INITIAL_LOAD_SIZE = 200; // Always load 200 leads initially
const PAGINATION_SIZE = (() => {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  return isMobile ? 20 : 50; // Optimized for better performance
})();

// ✅ PERFORMANCE: Debounce configuration for real-time updates
const DEBOUNCE_DELAY = 200; // 200ms debounce for real-time updates (reduced for faster response)

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
  maxAge: 24 * 60 * 60 * 1000, // 24 hours (agent names rarely change)
  maxSize: 200, // Increased cache size
  persistent: true,
  prefix: 'crm_agent_info',
  trackPerformance: true
});

// Team info cache (teamId -> teamName)
const teamInfoCache = new PerformanceCache<Map<string, string>>({
  maxAge: 24 * 60 * 60 * 1000, // 24 hours (team names rarely change)
  maxSize: 200, // Increased cache size
  persistent: true,
  prefix: 'crm_team_info',
  trackPerformance: true
});

// ✅ OPTIMIZED: Active listeners tracker to prevent duplicate listeners
const activeListeners: Map<string, () => void> = new Map();

// Helper function to calculate duration from assigned_to_cord to assigned
const getAssignmentDuration = (lead: Lead): string | null => {
  if (lead.status !== 'assigned') return null;
  
  try {
    const assignedToCordAt = (lead as any).assignedToCordAt;
    const assignedAt = (lead as any).assignedAt;
    
    // If timestamps don't exist, return null (for leads assigned before this feature was added)
    if (!assignedToCordAt || !assignedAt) {
      return null;
    }
    
    // Convert Firestore timestamps to Date if needed
    let startDate: Date;
    if (assignedToCordAt?.toDate && typeof assignedToCordAt.toDate === 'function') {
      startDate = assignedToCordAt.toDate();
    } else if (assignedToCordAt instanceof Date) {
      startDate = assignedToCordAt;
    } else if (typeof assignedToCordAt === 'string' || typeof assignedToCordAt === 'number') {
      startDate = new Date(assignedToCordAt);
    } else {
      return null;
    }
    
    let endDate: Date;
    if (assignedAt?.toDate && typeof assignedAt.toDate === 'function') {
      endDate = assignedAt.toDate();
    } else if (assignedAt instanceof Date) {
      endDate = assignedAt;
    } else if (typeof assignedAt === 'string' || typeof assignedAt === 'number') {
      endDate = new Date(assignedAt);
    } else {
      return null;
    }
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;
    
    const durationMs = endDate.getTime() - startDate.getTime();
    if (durationMs < 0) return null; // Invalid if end is before start
    
    // Format duration
    const minutes = Math.floor(durationMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else {
      return `${minutes}m`;
    }
  } catch (error) {
    console.error('Error calculating assignment duration:', error);
    return null;
  }
};

// Helper function to check if a lead belongs to coordinator's scope
// First checks coordinator's assigned teams (team-based routing),
// then falls back to group-based coordinatorType if no coordinatorTeams configured.
const isLeadInCoordinatorScope = (
  lead: Lead,
  coordinatorType: CoordinatorType,
  coordinatorTeams?: string[]
): boolean => {
  // If coordinator has explicit team assignments, use ONLY those teams
  if (coordinatorTeams && coordinatorTeams.length > 0) {
    // Normalize team IDs for comparison (trim whitespace, handle null/undefined)
    const normalizedCoordinatorTeams = coordinatorTeams
      .map(tid => tid?.trim())
      .filter(Boolean) as string[];
    const normalizedLeadTeamId = lead.teamId?.trim();
    
    // If lead has a teamId, check if it matches any assigned team
    if (normalizedLeadTeamId) {
      const matches = normalizedCoordinatorTeams.some(teamId => 
        teamId === normalizedLeadTeamId
      );
      if (matches) {
        return true;
      }
      // If coordinator has team assignments and lead's teamId doesn't match, exclude it
      return false;
    }
    // If coordinator has team assignments but lead has no teamId, exclude it
    return false;
  }

  // Group-based routing by first number's group (primary), only used when no coordinatorTeams configured
  if (!lead.plans || lead.plans.length === 0) return false;
  // Use only the first plan's group for visibility decision
  const firstGroup = lead.plans[0]?.group?.toUpperCase?.() || lead.plans[0]?.group || '';
  
  switch (coordinatorType) {
    case 'g1':
      return firstGroup === 'G1';
    case 'g2':
      return firstGroup === 'G2';
    case 'g3':
      return firstGroup === 'G3';
    case 'all':
      // All groups coordinator can handle any group / any team
      return true;
    default:
      return false;
  }
};

export function LeadList() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isMobile] = useState(() => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [firebaseSearchResults, setFirebaseSearchResults] = useState<Lead[]>([]);
  const [isSearchingFirebase, setIsSearchingFirebase] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const { user, isAdmin, isManager, isVerifier, isAgent, isCoordinator } = useAuthStore();
  const [searchParams] = useSearchParams();
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [dateRange, setDateRange] = useState<{
    from?: string;
    to?: string;
  }>({});
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [showWhatsAppChat, setShowWhatsAppChat] = useState(false);
  const [selectedLeadForChat, setSelectedLeadForChat] = useState<Lead | null>(null);
  const [whatsAppLogs, setWhatsAppLogs] = useState<any[]>([]);
  const [planDetails, setPlanDetails] = useState<{ amount: string; benefits: string; duration: string } | null>(null);
  const logsContainerRef = useRef<HTMLDivElement | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedLeadForTransfer, setSelectedLeadForTransfer] = useState<Lead | null>(null);
  const [statusTimers, setStatusTimers] = useState<Record<string, number>>({});
  const [leadStrikes, setLeadStrikes] = useState<Record<string, number>>({});


  // Load plan details from Firebase when selectedLeadForChat changes
  useEffect(() => {
    const loadPlanDetails = async () => {
      if (!selectedLeadForChat?.plans?.[0]?.plan) {
        setPlanDetails(null);
        return;
      }
      try {
        const planName = selectedLeadForChat.plans[0].plan;
        const plansQuery = query(collection(db, 'plans'), where('name', '==', planName));
        const plansSnapshot = await getDocs(plansQuery);
        if (!plansSnapshot.empty) {
          const planDoc = plansSnapshot.docs[0];
          const planData = planDoc.data();
          setPlanDetails({
            amount: planData.amount || 'N/A',
            benefits: planData.benefits || 'N/A',
            duration: planData.duration || 'N/A'
          });
        } else {
          setPlanDetails(null);
        }
      } catch (error) {
        console.error('Error loading plan details:', error);
        setPlanDetails(null);
      }
    };
    loadPlanDetails();
  }, [selectedLeadForChat]);

  // ✅ OPTIMIZED: Use refs to store unsubscribe functions for proper cleanup
  const leadsUnsubscribeRef = useRef<(() => void) | null>(null);

  // Helper function to normalize date from Firestore
  const normalizeDate = useCallback((value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    if (typeof value.toMillis === 'function') return new Date(value.toMillis());
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }, []);

  // Format countdown timer (hours and minutes)
  const formatCountdown = useCallback((ms: number): string => {
    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }, []);

  // Calculate time elapsed since status changed to verified/follow_up
  const getStatusTimeElapsed = useCallback((lead: Lead): number | null => {
    if (lead.status !== 'verified' && lead.status !== 'follow_up') {
      return null;
    }

    const statusChangeDate = normalizeDate(lead.updatedAt);
    if (!statusChangeDate) {
      return null;
    }

    const now = new Date();
    const elapsedMs = now.getTime() - statusChangeDate.getTime();
    return elapsedMs;
  }, [normalizeDate]);

  // Update status timers every second
  useEffect(() => {
    const interval = setInterval(() => {
      const newTimers: Record<string, number> = {};
      const allLeads = [...leads, ...firebaseSearchResults];
      
      allLeads.forEach(lead => {
        if (lead.status === 'verified' || lead.status === 'follow_up') {
          const elapsed = getStatusTimeElapsed(lead);
          if (elapsed !== null) {
            newTimers[lead.id] = elapsed;
          }
        }
      });

      setStatusTimers(newTimers);
    }, 1000);

    return () => clearInterval(interval);
  }, [leads, firebaseSearchResults, getStatusTimeElapsed]);
  
  // ✅ PERFORMANCE: Debounced update mechanism to prevent excessive re-renders
  const debouncedUpdateRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpdateRef = useRef<Lead[] | null>(null);

  // ✅ PERFORMANCE: Debounced update function to prevent excessive re-renders
  // skipDebounce: true for immediate update (initial load), false for debounced (real-time updates)
  const debouncedUpdateLeads = useCallback((leadsData: Lead[], lastDoc: QueryDocumentSnapshot<DocumentData> | null, hasMore: boolean, skipDebounce = false) => {
    // Clear existing timeout
    if (debouncedUpdateRef.current) {
      clearTimeout(debouncedUpdateRef.current);
      debouncedUpdateRef.current = null;
    }

    // ✅ PERFORMANCE: Immediate update for initial load, debounced for real-time updates
    if (skipDebounce) {
      setLeads(leadsData);
      setLastDoc(lastDoc);
      setHasMore(hasMore);
      pendingUpdateRef.current = null;
      return;
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

  // Fetch strikes count for leads
  const fetchLeadStrikes = useCallback(async (leadsToCheck: Lead[]) => {
    try {
      const strikesMap: Record<string, number> = {};
      
      // Collect all unique numberIds from all leads with lead mapping
      const numberToLeadsMap = new Map<string, string[]>(); // numberId -> leadIds[]
      leadsToCheck.forEach(lead => {
        if (lead.plans && Array.isArray(lead.plans)) {
          lead.plans.forEach(plan => {
            if (plan.numberId) {
              if (!numberToLeadsMap.has(plan.numberId)) {
                numberToLeadsMap.set(plan.numberId, []);
              }
              numberToLeadsMap.get(plan.numberId)!.push(lead.id);
            }
          });
        }
      });

      if (numberToLeadsMap.size === 0) {
        setLeadStrikes({});
        return;
      }

      // Fetch numbers in batches (Firestore 'in' limit is 10)
      const numberIdArray = Array.from(numberToLeadsMap.keys());
      const BATCH_SIZE = 10;
      
      for (let i = 0; i < numberIdArray.length; i += BATCH_SIZE) {
        const batch = numberIdArray.slice(i, i + BATCH_SIZE);
        try {
          const numbersQuery = query(
            collection(db, 'numberPool'),
            where('__name__', 'in', batch)
          );
          const numbersSnapshot = await getDocs(numbersQuery);
          
          numbersSnapshot.forEach(numberDoc => {
            const numberData = numberDoc.data();
            const claims = numberData.claims || [];
            const pendingClaims = claims.filter((claim: any) => claim.status === 'pending');
            const strikesCount = pendingClaims.length;
            
            // Map strikes to all leads that use this number
            const leadIds = numberToLeadsMap.get(numberDoc.id) || [];
            leadIds.forEach(leadId => {
              strikesMap[leadId] = (strikesMap[leadId] || 0) + strikesCount;
            });
          });
        } catch (error) {
          console.error('Error fetching strikes for batch:', error);
        }
      }

      setLeadStrikes(strikesMap);
    } catch (error) {
      console.error('Error fetching lead strikes:', error);
    }
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


  // Fetch strikes count for leads when leads change
  useEffect(() => {
    if (leads.length > 0) {
      fetchLeadStrikes(leads);
    }
  }, [leads, fetchLeadStrikes]);

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

          // ✅ SECURITY: Freelancers must ONLY see their own leads in cached data
          const filteredCachedLeads = user?.role === 'freelancer' && user?.id
            ? fixedCachedLeads.filter((lead: Lead) => lead.agentId === user.id)
            : fixedCachedLeads;

          setLeads(filteredCachedLeads);
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
      if (user.role === 'agent' || user.role === 'freelancer') {
        constraints.push(where('agentId', '==', user.id));
      } else if (isVerifier()) {
        constraints.push(
          where('status', 'in', [
            'pending_verification',
            'activated_non_verified'
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
        let isFirstSnapshot = true; // Track first snapshot for immediate display
        const unsubscribe = onSnapshot(q, async (snapshot) => {
          try {
            // ✅ PERFORMANCE: Process data efficiently with early filtering
            const maxDocs = isMobile ? Math.min(snapshot.docs.length, 100) : snapshot.docs.length;
            let leadsData = snapshot.docs.slice(0, maxDocs).map(doc => {
              const data = doc.data();
              // Helper to convert Firestore timestamp to Date
              const convertTimestamp = (ts: any): Date | undefined => {
                if (!ts) return undefined;
                if (ts.toDate && typeof ts.toDate === 'function') return ts.toDate();
                if (ts instanceof Date) return ts;
                if (typeof ts === 'string' || typeof ts === 'number') {
                  const date = new Date(ts);
                  return isNaN(date.getTime()) ? undefined : date;
                }
                return undefined;
              };
              
              return {
              id: doc.id,
                ...data,
                createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
                updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
                assignedToCordAt: convertTimestamp(data.assignedToCordAt),
                assignedAt: convertTimestamp(data.assignedAt)
              };
            }) as Lead[];

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

            // ✅ SECURITY: Defense-in-depth - Freelancers must ONLY see their own leads
            if (user?.role === 'freelancer' && user?.id) {
              leadsData = leadsData.filter(lead => lead.agentId === user.id);
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

              // ✅ PERFORMANCE: Immediate update for first snapshot, debounced for subsequent updates
              debouncedUpdateLeads(
                leadsWithInfo,
                snapshot.docs[snapshot.docs.length - 1] || null,
                snapshot.docs.length === loadSize,
                isFirstSnapshot // Skip debounce for first snapshot (instant display)
              );
              
              // Mark first snapshot as processed
              if (isFirstSnapshot) {
                isFirstSnapshot = false;
              }
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
        let leadsData = snapshot.docs.map(doc => {
          const data = doc.data();
          // Helper to convert Firestore timestamp to Date
          const convertTimestamp = (ts: any): Date | undefined => {
            if (!ts) return undefined;
            if (ts.toDate && typeof ts.toDate === 'function') return ts.toDate();
            if (ts instanceof Date) return ts;
            if (typeof ts === 'string' || typeof ts === 'number') {
              const date = new Date(ts);
              return isNaN(date.getTime()) ? undefined : date;
            }
            return undefined;
          };
          
          return {
          id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
            assignedToCordAt: convertTimestamp(data.assignedToCordAt),
            assignedAt: convertTimestamp(data.assignedAt)
          };
        }) as Lead[];

        // ✅ SECURITY: Defense-in-depth - Freelancers must ONLY see their own leads
        if (user?.role === 'freelancer' && user?.id) {
          leadsData = leadsData.filter(lead => lead.agentId === user.id);
        }

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

  // Fetch WhatsApp messages from API (similar to VerifierDashboard and LeadDetailsView)
  const fetchWhatsAppMessagesFromAPI = async () => {
    if (!selectedLeadForChat?.customerNumber) {
      console.warn('No customer number for WhatsApp fetch');
      return;
    }

    try {
      // Format phone number (remove leading 0, add 971)
      const customerNumber = selectedLeadForChat.customerNumber.toString().replace(/^0+/, '');
      const formattedNumber = customerNumber.startsWith('971') ? customerNumber : `971${customerNumber}`;

      const conversationData = await checkConversation(formattedNumber, selectedLeadForChat.id);

      if (conversationData?.success && conversationData?.messages && Array.isArray(conversationData.messages)) {
        // Format messages for display
        const formattedMessages = conversationData.messages.map((msg: any) => ({
          id: msg.messageId || msg.id,
          direction: msg.direction,
          from: msg.from,
          to: msg.to,
          messageText: msg.messageText || '',
          messageId: msg.messageId,
          status: msg.status,
          templateName: msg.templateName,
          consents: msg.consents,
          readStatus: msg.readStatus,
          deliveryStatus: msg.deliveryStatus,
          messageType: msg.messageType,
          replyTo: msg.replyTo,
          repliedMessage: msg.repliedMessage,
          mediaId: msg.mediaId,
          mediaPath: msg.mediaPath,
          mime: msg.mime,
          userId: msg.userId,
          userName: msg.userName,
          senderName: msg.senderName,
          buttons: msg.buttons,
          payload: msg.payload,
          // Normalize timestamp once when first received from API
          createdAt: msg.createdAt 
            ? (msg.createdAt instanceof Date 
                ? msg.createdAt 
                : normalizeTimestamp(msg.createdAt) || new Date(msg.createdAt))
            : new Date()
        }));

        // Sort by timestamp (oldest first), with secondary sort by messageId
        formattedMessages.sort((a: any, b: any) => {
          const timeA = getTimestampForSort(normalizeTimestamp(a.createdAt));
          const timeB = getTimestampForSort(normalizeTimestamp(b.createdAt));
          if (timeA !== timeB) {
            return timeA - timeB;
          }
          const idA = a.messageId || a.id || '';
          const idB = b.messageId || b.id || '';
          return idA.localeCompare(idB);
        });

        // Only update if messages actually changed to prevent unnecessary re-renders
        setWhatsAppLogs(prev => {
          // Create a map of existing messages by messageId to preserve their timestamps
          const existingMessageMap = new Map();
          prev.forEach((msg: any) => {
            const msgId = msg.messageId || msg.id;
            if (msgId && !msgId.toString().startsWith('temp-')) {
              existingMessageMap.set(msgId, msg);
            }
          });

          // Merge API messages with existing messages, preserving timestamps from existing messages
          const mergedMessages = formattedMessages.map((apiMsg: any) => {
            const msgId = apiMsg.messageId || apiMsg.id;
            const existingMsg = existingMessageMap.get(msgId);
            
            // If this message already exists, ALWAYS preserve its timestamp to prevent changes
            if (existingMsg && existingMsg.createdAt) {
              return {
                ...apiMsg,
                createdAt: existingMsg.createdAt,
                messageId: existingMsg.messageId || apiMsg.messageId
              };
            }
            
            // New message, normalize API timestamp once and store as Date object
            const apiDate = normalizeTimestamp(apiMsg.createdAt);
            return {
              ...apiMsg,
              createdAt: apiDate || new Date(apiMsg.createdAt)
            };
          });

          const prevMessageIds = prev.map((m: any) => m.id || m.messageId).join(',');
          const newMessageIds = mergedMessages.map((m: any) => m.id || m.messageId).join(',');
          
          // Only update if messages actually changed
          if (prevMessageIds === newMessageIds && prev.length === mergedMessages.length) {
            return prev;
          }
          
          return mergedMessages;
        });
      }
    } catch (error: any) {
      console.error('Error fetching WhatsApp messages from API:', error);
    }
  };

  // Auto-poll WhatsApp messages from API
  useEffect(() => {
    if (!selectedLeadForChat?.id || !selectedLeadForChat?.customerNumber || !showWhatsAppChat) {
      return;
    }

    // Fetch immediately
    fetchWhatsAppMessagesFromAPI();

    // Set up polling interval - every 3 seconds for instant updates
    const pollInterval = setInterval(() => {
      fetchWhatsAppMessagesFromAPI();
    }, 3000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [selectedLeadForChat?.id, selectedLeadForChat?.customerNumber, showWhatsAppChat]);

  // Cleanup on unmount (no longer needed for Firestore listeners, but keeping for consistency)
  useEffect(() => {
    return () => {
      // Cleanup handled by polling interval cleanup
    };
  }, []);

  // ✅ PERFORMANCE: Optimized batch processing with efficient queries
  const processLeadsWithInfo = useCallback(async (leadsData: Lead[]) => {
    // Early return for empty data
    if (!leadsData || leadsData.length === 0) return leadsData;

    // ✅ PERFORMANCE: Group is always stored in lead document, no need to fetch from numberPool
    const agentIds = [...new Set(leadsData.map(lead => lead.agentId).filter((id): id is string => !!id))];

    // ✅ PERFORMANCE: Pre-extract team IDs from leads (before agent info) for parallel fetching
    const leadTeamIds = [...new Set(leadsData.map(lead => lead.teamId as string).filter(Boolean))] as string[];

    // ✅ PERFORMANCE: Fetch agent info and team info in parallel for maximum speed
    const [agentInfoResult, teamInfoFromLeads] = await Promise.all([
      fetchAgentInfoOptimized(agentIds),
      leadTeamIds.length > 0 ? fetchTeamInfoOptimized(leadTeamIds) : Promise.resolve(new Map<string, string>())
    ]);

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

    // ✅ PERFORMANCE: Get team IDs from agent info that weren't in leads
    const agentTeamIds = [...new Set(
      Array.from(agentInfo.values())
        .map(agent => agent.teamId)
        .filter((id): id is string => Boolean(id) && !leadTeamIds.includes(id))
    )] as string[];

    // ✅ PERFORMANCE: Fetch additional team info from agents if needed, then merge
    const teamInfoFromAgents = agentTeamIds.length > 0 
      ? await fetchTeamInfoOptimized(agentTeamIds)
      : new Map<string, string>();
    
    // ✅ PERFORMANCE: Merge team info maps (leads first, then agents)
    const teamInfo = new Map([...teamInfoFromLeads, ...teamInfoFromAgents]);

    // ✅ PERFORMANCE: Enrich leads efficiently
    return leadsData.map(lead => {
      const resolvedAgent = agentInfo.get(lead.agentId);
      const resolvedTeamId = (lead.teamId as string) || resolvedAgent?.teamId;
      const resolvedTeamName = resolvedTeamId ? teamInfo.get(resolvedTeamId) : undefined;
      
      return {
        ...lead,
        plans: lead.plans?.map(plan => ({
          ...plan,
          // ✅ PERFORMANCE: Group is always stored in lead document, no need to fetch from numberPool
          group: plan.group || 'Unassigned'
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
        // Handle nested Map case (corrupted serialization)
        if (value instanceof Map) {
          const mapObj: any = {};
          value.forEach((v: any, k: string) => {
            mapObj[k] = v;
          });
          const name = mapObj.name || mapObj.fullName || mapObj.displayName || mapObj.email || 'Unknown Agent';
          const teamId = mapObj.teamId as string | undefined;
          normalized.set(key, { name, teamId });
        } else if (typeof value === 'string') {
          normalized.set(key, { name: value });
        } else if (value && typeof value === 'object') {
          const name = value.name || value.fullName || value.displayName || value.email || 'Unknown Agent';
          const teamId = value.teamId as string | undefined;
          normalized.set(key, { name, teamId });
        } else {
          normalized.set(key, { name: 'Unknown Agent' });
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
        // Filter out any invalid IDs before querying
        const validChunk = chunk.filter(id => id && typeof id === 'string' && id.trim() !== '');
        if (validChunk.length === 0) {
          return chunk.map(id => ({ id, name: 'Unknown Agent', teamId: undefined }));
        }
        const q = query(collection(db, 'users'), where(documentId(), 'in', validChunk));
        const snapshot = await getDocs(q);
        // Create a map of fetched agents
        const fetchedAgents = new Map<string, { id: string; name: string; teamId?: string }>();
        snapshot.docs.forEach(doc => {
          fetchedAgents.set(doc.id, {
            id: doc.id,
            name: doc.data().name || doc.data().fullName || doc.data().displayName || doc.data().email || 'Unknown Agent',
            teamId: doc.data().teamId
          });
        });
        // Return results for all requested IDs, using fetched data or 'Unknown Agent'
        return chunk.map(id => {
          if (fetchedAgents.has(id)) {
            return fetchedAgents.get(id)!;
          }
          return { id, name: 'Unknown Agent', teamId: undefined };
        });
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

  // Firebase search function - searches Firebase when not found in loaded leads
  const searchFirebase = useCallback(async (searchTerm: string) => {
    if (!user || !searchTerm.trim()) {
      setFirebaseSearchResults([]);
      return;
    }

    setIsSearchingFirebase(true);
    try {
      const normalizedSearch = searchTerm.trim().toLowerCase();
      let baseQuery = collection(db, 'leads');
      let constraints: any[] = [];

      // Add role-based filters
      if (user.role === 'agent' || user.role === 'freelancer') {
        constraints.push(where('agentId', '==', user.id));
      } else if (isVerifier()) {
        constraints.push(
          where('status', 'in', [
            'pending_verification',
            'activated_non_verified'
          ])
        );
      } else if (isManager() && user.teamId) {
        constraints.push(where('teamId', '==', user.teamId));
      }

      // Search in multiple fields - we'll fetch and filter in memory for complex searches
      constraints.push(orderBy('createdAt', 'desc'));

      // Fetch all leads with pagination to ensure we get ALL matching leads
      let allDocs: QueryDocumentSnapshot<DocumentData>[] = [];
      let lastDocSnapshot: QueryDocumentSnapshot<DocumentData> | null = null;
      const BATCH_SIZE = 1000; // Firestore can handle up to several thousand per query
      let hasMore = true;

      while (hasMore) {
        let batchConstraints = [...constraints];
        if (lastDocSnapshot) {
          batchConstraints.push(startAfter(lastDocSnapshot));
        }
        batchConstraints.push(limit(BATCH_SIZE));

        const q = query(baseQuery, ...batchConstraints);
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          hasMore = false;
        } else {
          allDocs.push(...snapshot.docs);
          lastDocSnapshot = snapshot.docs[snapshot.docs.length - 1];
          // If we got fewer than BATCH_SIZE, we've reached the end
          if (snapshot.docs.length < BATCH_SIZE) {
            hasMore = false;
          }
        }
      }

      let searchResults = allDocs
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
            assignedToCordAt: data.assignedToCordAt?.toDate ? data.assignedToCordAt.toDate() : data.assignedToCordAt,
            assignedAt: data.assignedAt?.toDate ? data.assignedAt.toDate() : data.assignedAt
          };
        })
        .filter((lead: any) => {
          const canSearchEtisalatId = user?.role === 'admin' || user?.role === 'coordinator';
          return (
            lead.customerNumber?.toLowerCase().includes(normalizedSearch) ||
            lead.customerName?.toLowerCase().includes(normalizedSearch) ||
            lead.leadNumber?.toLowerCase().includes(normalizedSearch) ||
            lead.plans?.some((plan: any) => 
              plan.number?.toLowerCase().includes(normalizedSearch) ||
              plan.plan?.toLowerCase().includes(normalizedSearch)
            ) ||
            lead.status?.toLowerCase().includes(normalizedSearch) ||
            lead.status?.replace(/_/g, ' ').toLowerCase().includes(normalizedSearch) ||
            (canSearchEtisalatId && (
              lead.etisalatLeadId?.toString?.().toLowerCase().includes(normalizedSearch) ||
              (lead.etisalatLeadIds && Array.isArray(lead.etisalatLeadIds) 
                ? lead.etisalatLeadIds.some((id: string) => id?.toString?.().toLowerCase().includes(normalizedSearch))
                : false) ||
              (lead.plans && lead.plans.some((plan: any) => plan.etisalatLeadId?.toString?.().toLowerCase().includes(normalizedSearch)))
            ))
          );
        }) as Lead[];

      // Apply role-based filtering (same as filteredLeads)
      if (user?.role === 'freelancer' && user?.id) {
        searchResults = searchResults.filter(lead => lead.agentId === user.id);
      }

      if (user?.role === 'coordinator') {
        searchResults = searchResults.filter(
          lead => lead.status !== 'pending_verification' && lead.status !== 'non_verified'
        );
      }

      // Apply coordinator scope filtering
      if (user?.role === 'coordinator' && user.coordinatorType && ['g1', 'g2', 'g3', 'all'].includes(user.coordinatorType)) {
        const coordinatorTeams = (user as any).coordinatorTeams as string[] | undefined;
        searchResults = searchResults.filter(lead => 
          isLeadInCoordinatorScope(lead, user.coordinatorType as CoordinatorType, coordinatorTeams)
        );
      }

      // Apply verifier group filtering
      if (user?.role === 'verifier' && user.verifierGroups && user.verifierGroups.length > 0) {
        const hasAllGroups = user.verifierGroups.includes('all');
        if (!hasAllGroups) {
          searchResults = searchResults.filter(lead => {
            const hasMatchingGroup = lead.plans?.some(plan => {
              const planGroup = (plan.group || '').toLowerCase();
              return (user.verifierGroups as VerifierGroups)?.some((verifierGroup: string) => {
                const normalizedVerifierGroup = verifierGroup.toLowerCase();
                return planGroup === normalizedVerifierGroup;
              }) || false;
          }) || false;
            return hasMatchingGroup;
          });
        }
      }

      // Process with agent/team info
      const enrichedResults = await processLeadsWithInfo(searchResults);
      setFirebaseSearchResults(enrichedResults);
    } catch (error) {
      console.error('Firebase search error:', error);
      setFirebaseSearchResults([]);
    } finally {
      setIsSearchingFirebase(false);
    }
  }, [user, isVerifier, isManager, processLeadsWithInfo, isLeadInCoordinatorScope]);

  // Memoized filtered leads with optimized search
  const filteredLeads = useMemo(() => {
    let filtered = leads;

    // Freelancers must ONLY see their own leads (security-critical)
    if (user?.role === 'freelancer' && user?.id) {
      filtered = filtered.filter(lead => lead.agentId === user.id);
    }

    // Coordinators should never see pending_verification or non_verified leads
    if (user?.role === 'coordinator') {
      filtered = filtered.filter(
        lead => lead.status !== 'pending_verification' && lead.status !== 'non_verified'
      );
    }

    // Apply coordinator scope filtering (team-based first, then group-based)
    if (user?.role === 'coordinator' && user.coordinatorType && ['g1', 'g2', 'g3', 'all'].includes(user.coordinatorType)) {
      const coordinatorTeams = (user as any).coordinatorTeams as string[] | undefined;
      
      filtered = filtered.filter(lead => 
        isLeadInCoordinatorScope(lead, user.coordinatorType as CoordinatorType, coordinatorTeams)
      );

      // For coordinators, hide pending_verification, non_verified and pending_coordinator statuses
      filtered = filtered.filter(
        lead => lead.status !== 'pending_verification' && lead.status !== 'non_verified'
      );
      if (user.coordinatorType !== 'all' && user.coordinatorType !== undefined) {
        filtered = filtered.filter(lead => lead.status !== 'pending_coordinator');
      }
      
      // Include verified and follow_up leads that have been assigned by manager, and assigned_to_cord leads (these should appear as "unassigned" to coordinators)
      // These leads have status='verified' or 'follow_up' and managerAssigned=true, or status='assigned_to_cord'
      const managerAssignedLeads = leads.filter(
        lead => ((lead.status === 'verified' && lead.managerAssigned === true) ||
                 (lead.status === 'follow_up' && lead.managerAssigned === true) ||
                 (lead.status === 'assigned_to_cord')) &&
                isLeadInCoordinatorScope(lead, user.coordinatorType as CoordinatorType, coordinatorTeams)
      );
      
      // Add manager-assigned leads to filtered list if not already present
      managerAssignedLeads.forEach(lead => {
        if (!filtered.find(l => l.id === lead.id)) {
          filtered.push(lead);
        }
      });
    }

    // Apply verifier group filtering
    if (user?.role === 'verifier' && user.verifierGroups && user.verifierGroups.length > 0) {
      const hasAllGroups = user.verifierGroups.includes('all');

      if (!hasAllGroups) {
        filtered = filtered.filter(lead => {
          // Check if any of the lead's plans belong to any of the verifier's groups
          const hasMatchingGroup = lead.plans?.some(plan => {
            // ✅ PERFORMANCE: Group is always stored in lead document, no need to check numberPool
            const planGroup = (plan.group || '').toLowerCase();
            
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

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const canSearchEtisalatId = user?.role === 'admin' || user?.role === 'coordinator';

    return filtered.filter(lead => {
      const matchesSearch = !normalizedSearch || (
        lead.customerNumber?.toLowerCase().includes(normalizedSearch) ||
        lead.customerName?.toLowerCase().includes(normalizedSearch) ||
        lead.leadNumber?.toLowerCase().includes(normalizedSearch) ||
        lead.plans?.some(plan => 
          plan.number.toLowerCase().includes(normalizedSearch) ||
          plan.plan?.toLowerCase().includes(normalizedSearch)
        ) ||
        lead.status?.toLowerCase().includes(normalizedSearch) ||
        lead.status?.replace(/_/g, ' ').toLowerCase().includes(normalizedSearch) ||
        (canSearchEtisalatId && (
          lead.etisalatLeadId?.toString?.().toLowerCase().includes(normalizedSearch) ||
          ((lead as any).etisalatLeadIds && Array.isArray((lead as any).etisalatLeadIds) 
            ? (lead as any).etisalatLeadIds.some((id: string) => id?.toString?.().toLowerCase().includes(normalizedSearch))
            : false) ||
          (lead.plans && lead.plans.some((plan: any) => plan.etisalatLeadId?.toString?.().toLowerCase().includes(normalizedSearch)))
        ))
      );
      
      let matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
      
      // For managers, include follow_up leads with managerAssigned=false in pending_assignment filter
      if (!matchesStatus && statusFilter === 'pending_assignment' && isManager()) {
        matchesStatus = lead.status === 'pending_assignment' || 
                       (lead.status === 'follow_up' && !lead.managerAssigned);
      }
      
      return matchesSearch && matchesStatus;
    });
  }, [leads, searchTerm, statusFilter, user?.role, user?.coordinatorType, user?.verifierGroups]);

  // Combine loaded leads with Firebase search results when searching
  const finalFilteredLeads = useMemo(() => {
    if (searchTerm.trim() && filteredLeads.length === 0 && firebaseSearchResults.length > 0) {
      // Use Firebase search results if no results in loaded leads
      // Apply status filter to Firebase results
      if (statusFilter === 'all') {
        return firebaseSearchResults;
      }
      return firebaseSearchResults.filter(lead => {
        let matchesStatus = lead.status === statusFilter;
        if (!matchesStatus && statusFilter === 'pending_assignment' && isManager()) {
          matchesStatus = lead.status === 'pending_assignment' || 
                         (lead.status === 'follow_up' && !lead.managerAssigned);
        }
        return matchesStatus;
      });
    }
    return filteredLeads;
  }, [filteredLeads, firebaseSearchResults, searchTerm, statusFilter, isManager]);

  // Search Firebase when search term changes and no results in loaded leads
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (searchTerm.trim()) {
        // Check if search term matches any leads in the loaded set (before status filter)
        const normalizedSearch = searchTerm.trim().toLowerCase();
        const canSearchEtisalatId = user?.role === 'admin' || user?.role === 'coordinator';
        
        // First check if any loaded leads match the search term
        const hasMatchesInLoaded = leads.some(lead => {
          return (
            lead.customerNumber?.toLowerCase().includes(normalizedSearch) ||
            lead.customerName?.toLowerCase().includes(normalizedSearch) ||
            lead.leadNumber?.toLowerCase().includes(normalizedSearch) ||
            lead.plans?.some(plan => 
              plan.number?.toLowerCase().includes(normalizedSearch) ||
              plan.plan?.toLowerCase().includes(normalizedSearch)
            ) ||
            lead.status?.toLowerCase().includes(normalizedSearch) ||
            lead.status?.replace(/_/g, ' ').toLowerCase().includes(normalizedSearch) ||
            (canSearchEtisalatId && (
              lead.etisalatLeadId?.toString?.().toLowerCase().includes(normalizedSearch) ||
              ((lead as any).etisalatLeadIds && Array.isArray((lead as any).etisalatLeadIds) 
                ? (lead as any).etisalatLeadIds.some((id: string) => id?.toString?.().toLowerCase().includes(normalizedSearch))
                : false) ||
              (lead.plans && lead.plans.some((plan: any) => plan.etisalatLeadId?.toString?.().toLowerCase().includes(normalizedSearch)))
            ))
          );
        });

        // If no matches in loaded leads, search Firebase
        if (!hasMatchesInLoaded && filteredLeads.length === 0) {
          searchFirebase(searchTerm);
        } else {
          // Clear Firebase search results if we have matches in loaded leads
          setFirebaseSearchResults([]);
        }
      } else {
        // Clear Firebase search results when search is cleared
        setFirebaseSearchResults([]);
      }
    }, 500); // Debounce Firebase search

    return () => clearTimeout(debounceTimer);
  }, [searchTerm, filteredLeads.length, leads, user?.role, searchFirebase]);

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
      // Enrich leads with agent/team names for export (reuses optimized helper)
      const enrichedLeads = await processLeadsWithInfo(filteredLeads);

      // Dynamic import for xlsx to avoid bundle size issues
      const XLSX = await import('xlsx');
      
      // Prepare data for Excel export - create one row per plan/number
      const exportData: any[] = [];
      let rowIndex = 0;
      
      enrichedLeads.forEach((lead) => {
        const anyLead = lead as any;
        const plans = lead.plans || [];
        
        // Get activation dates and SR numbers arrays (for multiple number activation)
        const activationDates = anyLead.activationDates || [];
        const srNumbers = anyLead.srNumbers || [];
        const serviceOrderNumbers = anyLead.serviceOrderNumbers || [];
        const activationGroups = anyLead.activationGroups || [];
        
        // Legacy single activation date/SR number (for backward compatibility)
        const rawActivationDate = anyLead.activationDate;
        const srNumber = anyLead.srNumber || anyLead.srNo || anyLead.sr;
        
        // Helper function to normalize activation date
        const normalizeActivationDate = (rawDate: any): string => {
          if (!rawDate) return 'N/A';
          if (typeof rawDate.toDate === 'function') {
            return rawDate.toDate().toLocaleDateString();
          } else if (rawDate instanceof Date) {
            return rawDate.toLocaleDateString();
          } else if (typeof rawDate === 'string') {
            const parsed = new Date(rawDate);
            return isNaN(parsed.getTime()) ? rawDate : parsed.toLocaleDateString();
          } else {
            return String(rawDate);
          }
        };
        
        // If lead has no plans, create one row with N/A for plan fields
        if (plans.length === 0) {
          exportData.push({
            'S.No': ++rowIndex,
            'Lead ID': lead.leadNumber || lead.id,
          'Customer Name': lead.customerName || 'N/A',
          'Customer Phone': lead.customerNumber || lead.customerPhone || 'N/A',
          'Customer Address': lead.customerAddress || 'N/A',
          'Status': lead.status?.replace('_', ' ').toUpperCase() || 'N/A',
            'Team Name': anyLead.teamName || lead.teamId || 'N/A',
            'Agent Name': anyLead.agentName || 'Unknown Agent',
            'Etisalat Lead ID': anyLead.etisalatLeadId || 'N/A',
            'Activation Date': normalizeActivationDate(rawActivationDate),
            'SR Number': srNumber || 'N/A',
            'Selected Numbers': 'No Numbers',
            'Plans': 'No Plans',
            'Plan Categories': 'No Categories',
            'Plan Groups': 'No Groups',
          'Created Date': lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : 'N/A',
          'Updated Date': lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString() : 'N/A',
          'Emirate': lead.emirate || 'N/A',
          'Area': lead.area || 'N/A',
          'Country': lead.country || 'N/A',
          'Gender': lead.gender || 'N/A',
          'Language': lead.language || 'N/A',
          'Advance Payment': lead.advancePayment ? 'Yes' : 'No',
          'Has Emirates ID': lead.hasEmirateId ? 'Yes' : 'No'
          });
        } else {
          // Create one row for each plan/number
          plans.forEach((plan: any, planIndex: number) => {
            // Get plan-specific Etisalat ID
            const planEtisalatId = plan.etisalatLeadId || 
              ((lead as any).etisalatLeadIds && Array.isArray((lead as any).etisalatLeadIds) 
                ? (lead as any).etisalatLeadIds[planIndex] 
                : null) ||
              (planIndex === 0 ? anyLead.etisalatLeadId : null);
            
            // Get plan-specific activation date (from array or legacy single value)
            const planActivationDate = activationDates[planIndex] || 
              (planIndex === 0 ? rawActivationDate : null);
            
            // Get plan-specific SR number (from array or legacy single value)
            const planSrNumber = srNumbers[planIndex] || 
              (planIndex === 0 ? srNumber : null);
            
            // Get plan-specific service order number
            const planServiceOrderNumber = serviceOrderNumbers[planIndex] || 'N/A';
            
            // Get plan-specific activation group
            const planActivationGroup = activationGroups[planIndex] || plan.group || 'N/A';
            
            exportData.push({
              'S.No': ++rowIndex,
              'Lead ID': lead.leadNumber || lead.id,
              'Customer Name': lead.customerName || 'N/A',
              'Customer Phone': lead.customerNumber || lead.customerPhone || 'N/A',
              'Customer Address': lead.customerAddress || 'N/A',
              'Status': lead.status?.replace('_', ' ').toUpperCase() || 'N/A',
              'Team Name': anyLead.teamName || lead.teamId || 'N/A',
              'Agent Name': anyLead.agentName || 'Unknown Agent',
              'Etisalat Lead ID': planEtisalatId || 'N/A',
              'Activation Date': normalizeActivationDate(planActivationDate),
              'SR Number': planSrNumber || 'N/A',
              'Service Order Number': planServiceOrderNumber,
              'Selected Numbers': plan.number || 'N/A',
              'Plans': `${plan.plan || 'N/A'} (${plan.number || 'N/A'})`,
              'Plan Categories': plan.category || 'N/A',
              'Plan Groups': planActivationGroup,
              'Created Date': lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : 'N/A',
              'Updated Date': lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString() : 'N/A',
              'Emirate': lead.emirate || 'N/A',
              'Area': lead.area || 'N/A',
              'Country': lead.country || 'N/A',
              'Gender': lead.gender || 'N/A',
              'Language': lead.language || 'N/A',
              'Advance Payment': lead.advancePayment ? 'Yes' : 'No',
              'Has Emirates ID': lead.hasEmirateId ? 'Yes' : 'No'
            });
          });
        }
      });

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);

      // Set column widths
      const colWidths = [
        { wch: 5 },   // S.No
        { wch: 18 },  // Lead ID
        { wch: 20 },  // Customer Name
        { wch: 15 },  // Customer Phone
        { wch: 30 },  // Customer Address
        { wch: 12 },  // Status
        { wch: 18 },  // Team Name
        { wch: 18 },  // Agent Name
        { wch: 18 },  // Etisalat Lead ID
        { wch: 14 },  // Activation Date
        { wch: 14 },  // SR Number
        { wch: 18 },  // Service Order Number
        { wch: 15 },  // Selected Numbers
        { wch: 40 },  // Plans
        { wch: 20 },  // Plan Categories
        { wch: 15 },  // Plan Groups
        { wch: 12 },  // Created Date
        { wch: 12 },  // Updated Date
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

      toast.success(`Successfully exported ${exportData.length} rows (${enrichedLeads.length} leads) to ${filename}`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export leads. Please try again.');
    }
  }, [processLeadsWithInfo]);

  // Memoized sorted and filtered leads
  const sortedAndFilteredLeads = useMemo(() => {
    return [...finalFilteredLeads].sort((a, b) => {
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
  }, [finalFilteredLeads, sortField, sortDirection]);

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
      case 'activated_non_verified':
        return 'bg-amber-100 text-amber-800';
      case 'pending_coordinator':
        return 'bg-blue-100 text-blue-800';
      case 'follow_up':
        return 'bg-orange-100 text-orange-800';
      case 'activated':
        return 'bg-purple-100 text-purple-800';
      case 'assigned':
        return 'bg-indigo-100 text-indigo-800';
      case 'assigned_to_cord':
        return 'bg-teal-100 text-teal-800';
      case 'pending_assignment':
        return 'bg-cyan-100 text-cyan-800';
      case 'non_verified':
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
      case 'activated_non_verified':
        return <Clock className="w-4 h-4 mr-1.5" />;
      case 'pending_coordinator':
        return <Clock className="w-4 h-4 mr-1.5" />;
      case 'pending_assignment':
        return <Clock className="w-4 h-4 mr-1.5" />;
      case 'follow_up':
        return <ArrowRight className="w-4 h-4 mr-1.5" />;
      case 'non_verified':
        return <ArrowRight className="w-4 h-4 mr-1.5" />;
      case 'activated':
        return <Zap className="w-4 h-4 mr-1.5" />;
      case 'assigned':
        return <User2 className="w-4 h-4 mr-1.5" />;
      case 'assigned_to_cord':
        return <User2 className="w-4 h-4 mr-1.5" />;
      default:
        return null;
    }
  }, []);

  const getStatusDisplayText = useCallback((status: string) => {
    // Convert "assigned" to "Processed with Etisalat" for UI display only
    if (status === 'assigned') {
      return 'Processed with Etisalat';
    }
    // Convert "assigned_to_cord" to "Assigned to Activation" for UI display only
    if (status === 'assigned_to_cord') {
      return 'Assigned to Activation';
    }
    // Handle other statuses
    if (status === 'non_verified') return 'Non Verified';
    if (status === 'follow_up') return 'Follow-up';
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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

            {/* Advanced Search Button - Admin & Coordinator */}
            {(isAdmin() || isCoordinator()) && (
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
                  <option value="non_verified">Non Verified</option>
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

        {/* Leads Table Container */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-4 bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl overflow-hidden border border-white/50"
        >
          {/* Table Headers - Desktop Only */}
          <div className="hidden sm:block relative px-6 py-5 bg-gradient-to-br from-indigo-50/90 via-purple-50/90 to-pink-50/90 backdrop-blur-sm border-b border-indigo-100/50">
            <div className="grid grid-cols-12 gap-3">
              <div className="col-span-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-lg">
                    <User2 className="h-4 w-4 text-indigo-600" />
            </div>
                  <span className="text-sm font-bold text-indigo-700 uppercase tracking-wide">Customer Info</span>
            </div>
            </div>
              <div className="col-span-2 -ml-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-lg">
                    <Hash className="h-4 w-4 text-blue-600" />
            </div>
                  <span className="text-sm font-bold text-blue-700 uppercase tracking-wide">Selected Number</span>
              </div>
            </div>
              <div className="col-span-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-gradient-to-br from-emerald-100 to-green-100 rounded-lg">
                    <Package className="h-4 w-4 text-emerald-600" />
            </div>
                  <span className="text-sm font-bold text-emerald-700 uppercase tracking-wide">Plan Details</span>
          </div>
              </div>
              <div className="col-span-1 pr-8">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-gradient-to-br from-amber-100 to-orange-100 rounded-lg">
                    <Clock className="h-4 w-4 text-amber-600" />
                  </div>
                  <span className="text-sm font-bold text-amber-700 uppercase tracking-wide">Status</span>
                </div>
              </div>
              <div className="col-span-2 pl-8">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-gradient-to-br from-purple-100 to-pink-100 rounded-lg">
                    <Eye className="h-4 w-4 text-purple-600" />
                  </div>
                  <span className="text-sm font-bold text-purple-700 uppercase tracking-wide">Actions</span>
                </div>
              </div>
            </div>
          </div>

        {/* Leads List */}
          <div className="relative">
          <AnimatePresence>
            {currentLeads.map((lead, index) => (
              <motion.div
                key={lead.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className={clsx(
                  "group hover:bg-gradient-to-r hover:from-indigo-50/50 hover:to-purple-50/50 transition-all duration-200 relative",
                  (lead as any).verificationMethod === 'whatsapp' && "bg-gradient-to-r from-emerald-50/50 to-transparent",
                  index < currentLeads.length - 1 && "border-b border-gradient-to-r from-gray-200/60 via-indigo-200/40 to-purple-200/60"
                )}
                style={{
                  borderBottom: index < currentLeads.length - 1 ? '2px solid transparent' : 'none',
                  backgroundImage: index < currentLeads.length - 1 
                    ? 'linear-gradient(white, white), linear-gradient(90deg, rgba(156, 163, 175, 0.7), rgba(129, 140, 248, 0.6), rgba(196, 181, 253, 0.6), rgba(236, 72, 153, 0.5))'
                    : 'none',
                  backgroundOrigin: 'border-box',
                  backgroundClip: 'padding-box, border-box'
                }}
              >
                {/* WhatsApp Indicator */}
                {(lead as any).verificationMethod === 'whatsapp' && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 z-10"></div>
                )}
                <div className="px-6 py-4">
                  {/* Desktop Layout */}
                  <div className="hidden sm:grid grid-cols-12 gap-3 items-center">
                    {/* Customer Information */}
                    <div className="col-span-3 flex items-center">
                      <div className="flex items-center space-x-2">
                        <div className="p-2.5 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-xl shadow-sm">
                          <User2 className="h-5 w-5 text-indigo-600" />
                      </div>
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">
                          {lead.customerName || 'Unnamed Customer'}
                        </h3>
                          {isManager() && (lead as any).agentName && (
                            <div className="flex items-center text-xs text-gray-600 mt-1 font-medium">
                              <User2 className="h-3 w-3 mr-1.5" />
                              Agent: {(lead as any).agentName}
                            </div>
                          )}
                          <div className="flex items-center text-xs text-gray-500 mt-1">
                            <Phone className="h-3 w-3 mr-1.5" />
                          {lead.customerNumber}
                        </div>
                          <div className="flex items-center text-xs text-gray-500 mt-1">
                            <Calendar className="h-3 w-3 mr-1.5" />
                            {format(lead.createdAt, 'MMM d, yyyy h:mm a')}
                          </div>
                          {lead.leadNumber && (
                            <div className="mt-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-100 text-indigo-700 border border-indigo-200">
                                {lead.leadNumber}
                              </span>
                          </div>
                        )}
                        </div>
                      </div>
                    </div>

                    {/* Selected Numbers */}
                    <div className="col-span-2 -ml-3">
                      <div className="flex flex-col space-y-2">
                        {(lead.plans && lead.plans.length > 0)
                          ? lead.plans.map((plan, planIndex) => {
                              // Get Etisalat ID for this specific plan
                              const planEtisalatId = (plan as any).etisalatLeadId || 
                                ((lead as any).etisalatLeadIds && Array.isArray((lead as any).etisalatLeadIds) 
                                  ? (lead as any).etisalatLeadIds[planIndex] 
                                  : (planIndex === 0 ? lead.etisalatLeadId : null));
                              
                              return (
                                <div
                                  key={planIndex}
                                  className="flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 px-3 py-1.5 rounded-lg shadow-sm"
                                >
                                  <div className="flex items-center space-x-2">
                        <Hash className="h-4 w-4 text-indigo-500" />
                        <span className="text-sm font-medium text-gray-700">
                                      {plan.number || ''}
                                      {plan.group && (
                                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-700">
                                          {plan.group}
                                        </span>
                                      )}
                            </span>
                          </div>
                                  {planEtisalatId && (
                                    <span className="mt-0.5 text-[11px] font-medium text-gray-500">
                                      Etisalat ID: {planEtisalatId}
                            </span>
                                  )}
                          </div>
                              );
                            })
                          : <span className="text-sm font-medium text-gray-700"></span>
                        }
                      </div>
                    </div>

                    {/* Plan Details */}
                    <div className="col-span-4">
                      <div className="flex flex-col space-y-2">
                        {(lead.plans && lead.plans.length > 0)
                          ? lead.plans.map((plan, planIndex) => (
                              <div key={planIndex} className="flex items-center space-x-2 bg-gradient-to-br from-gray-50 to-gray-100 px-3 py-1.5 rounded-lg shadow-sm">
                          <Package className="h-4 w-4 text-indigo-500" />
                          <span className="text-sm font-medium text-gray-700">
                                  {plan.plan || ''}
                          </span>
                        </div>
                            ))
                          : <span className="text-sm font-medium text-gray-700"></span>
                        }
                      </div>
                    </div>

                    {/* Status */}
                    <div className="col-span-1 pr-8">
                      <div className="flex flex-col space-y-1 items-start">
                      <motion.span
                        whileHover={{ scale: 1.05 }}
                        className={clsx(
                          "inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium shadow-sm ring-1 ring-opacity-5",
                          getStatusBadgeClass(lead.status),
                          "ring-current"
                        )}
                      >
                        {getStatusIcon(lead.status)}
                        {getStatusDisplayText(lead.status)}
                      </motion.span>
                      {/* Strikes Count */}
                      {leadStrikes[lead.id] > 0 && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-red-100 text-red-700 border border-red-200 mt-1"
                        >
                          <AlertCircle className="h-3 w-3 mr-1" />
                          {leadStrikes[lead.id]} Strike{leadStrikes[lead.id] !== 1 ? 's' : ''}
                        </motion.div>
                      )}
                        {lead.status === 'assigned' && (() => {
                          const duration = getAssignmentDuration(lead);
                          if (duration) {
                            return (
                              <div className="flex items-center text-[10px] text-indigo-600 mt-1 px-2 py-0.5 bg-indigo-50 rounded border border-indigo-200 whitespace-nowrap">
                                <Clock className="h-3 w-3 mr-1 flex-shrink-0" />
                                <span className="font-semibold">Assigned in: {duration}</span>
                    </div>
                            );
                          }
                          return null;
                        })()}
                        {/* Countdown Timer / At Risk Indicator for Desktop */}
                        {(lead.status === 'verified' || lead.status === 'follow_up') && (() => {
                          const elapsed = statusTimers[lead.id] ?? getStatusTimeElapsed(lead);
                          if (elapsed === null) return null;

                          const hoursElapsed = elapsed / (1000 * 60 * 60);
                          const twentyFourHoursMs = 24 * 60 * 60 * 1000;
                          const remainingMs = twentyFourHoursMs - elapsed;

                                if (hoursElapsed >= 24) {
                            // More than 24 hours - show "At Risk"
                            return (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 text-red-700 border border-red-200 mt-1 whitespace-nowrap">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                At Risk
                              </span>
                            );
                          } else {
                            // Less than 24 hours - show countdown
                            return (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-yellow-100 text-yellow-700 border border-yellow-200 mt-1 whitespace-nowrap">
                                <Clock className="h-3 w-3 mr-1" />
                                {formatCountdown(remainingMs)} remaining
                              </span>
                            );
                          }
                        })()}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="col-span-2 pl-8">
                      <div className="flex items-center gap-2">
                        {(isAdmin() || isCoordinator() || (isAgent() && lead.agentId === user?.id)) && (lead as any).verificationMethod === 'whatsapp' && (
                          <motion.button
                            whileHover={{ scale: 1.02, y: -1 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                              setSelectedLeadForChat(lead);
                              setShowWhatsAppChat(true);
                              setWhatsAppLogs([]); // Clear previous messages
                              // Messages will be fetched via API polling in useEffect
                            }}
                            title="WhatsApp Verification"
                            className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-green-50/80 text-green-700 border border-green-100 hover:bg-green-50 hover:border-green-200 transition-all duration-200"
                          >
                            <svg viewBox="0 0 32 32" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                              <path d="M19.11 17.46c-.27-.13-1.6-.79-1.85-.88-.25-.09-.43-.13-.61.13-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.13-1.12-.41-2.12-1.31-.78-.69-1.31-1.54-1.46-1.8-.15-.27-.02-.41.11-.54.11-.11.27-.29.41-.45.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.13-.61-1.46-.83-2-.22-.52-.44-.45-.61-.45h-.52c-.18 0-.45.07-.68.34-.23.27-.9.88-.9 2.15 0 1.27.92 2.5 1.05 2.67.14.18 1.81 2.77 4.4 3.88.62.27 1.11.43 1.49.55.63.2 1.2.17 1.65.1.5-.07 1.6-.65 1.83-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.31zM16 3C8.82 3 3 8.82 3 16c0 2.29.62 4.48 1.79 6.42L3 29l6.74-1.77C11.58 28.38 13.76 29 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3zm0 23.73c-2.12 0-4.11-.62-5.78-1.78l-.41-.26-4.01 1.05 1.07-3.9-.27-.41C5.43 20.76 4.73 18.43 4.73 16 4.73 9.94 9.94 4.73 16 4.73S27.27 9.94 27.27 16 22.06 26.73 16 26.73z"/>
                            </svg>
                          </motion.button>
                        )}
                        {isAdmin() && (
                          <motion.button
                            whileHover={{ scale: 1.02, y: -1 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                              setSelectedLeadForTransfer(lead);
                              setShowTransferModal(true);
                            }}
                            title="Transfer Lead"
                            className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-blue-50/80 text-blue-700 border border-blue-100 hover:bg-blue-50 hover:border-blue-200 transition-all duration-200"
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                          </motion.button>
                        )}
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
                            <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors duration-200 truncate">
                              {lead.customerName || 'Unnamed Customer'}
                            </h3>
                            </div>
                            {isManager() && (lead as any).agentName && (
                              <div className="flex items-center text-sm text-gray-600 font-medium mt-1">
                                <User2 className="h-4 w-4 mr-1.5 flex-shrink-0" />
                                <span>Agent: {(lead as any).agentName}</span>
                              </div>
                            )}
                            <div className="flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors duration-200 mt-1">
                              <Phone className="h-4 w-4 mr-1.5 flex-shrink-0" />
                              <span className="truncate">{lead.customerNumber}</span>
                            </div>
                            {lead.leadNumber && (
                              <div className="flex items-center text-sm text-gray-500 mt-1">
                                <Hash className="h-3 w-3 mr-1.5" />
                                <span className="font-medium text-indigo-600">{lead.leadNumber}</span>
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
                            <div className="flex flex-col items-end gap-1">
                            <motion.span
                              className={clsx(
                                "inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-medium shadow-sm ring-1 ring-opacity-5",
                                getStatusBadgeClass(lead.status),
                                "ring-current"
                              )}
                            >
                              {getStatusIcon(lead.status)}
                                {getStatusDisplayText(lead.status)}
                            </motion.span>
                              {/* Strikes Count */}
                              {leadStrikes[lead.id] > 0 && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.9 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-red-100 text-red-700 border border-red-200 mt-1"
                                >
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  {leadStrikes[lead.id]} Strike{leadStrikes[lead.id] !== 1 ? 's' : ''}
                                </motion.div>
                              )}
                              {/* Countdown Timer / At Risk Indicator */}
                              {(lead.status === 'verified' || lead.status === 'follow_up') && (() => {
                                const elapsed = statusTimers[lead.id] ?? getStatusTimeElapsed(lead);
                                if (elapsed === null) return null;

                                const hoursElapsed = elapsed / (1000 * 60 * 60);
                                const twentyFourHoursMs = 24 * 60 * 60 * 1000;
                                const remainingMs = twentyFourHoursMs - elapsed;

                                if (hoursElapsed >= 24) {
                                  // More than 24 hours - show "At Risk"
                                  return (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 text-red-700 border border-red-200 whitespace-nowrap">
                                      <AlertCircle className="h-3 w-3 mr-1" />
                                      At Risk
                                    </span>
                                  );
                                } else {
                                  // Less than 24 hours - show countdown
                                  return (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-yellow-100 text-yellow-700 border border-yellow-200 whitespace-nowrap">
                                      <Clock className="h-3 w-3 mr-1" />
                                      {formatCountdown(remainingMs)} remaining
                                    </span>
                                  );
                                }
                              })()}
                            </div>
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
                                    {plan.group && (
                                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-700">
                                        {plan.group}
                                      </span>
                                    )}
                              </p>
                              {lead.etisalatLeadId && (
                                <p className="mt-0.5 text-[11px] font-medium text-gray-500">
                                  Etisalat ID: {lead.etisalatLeadId}
                                </p>
                              )}
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

                    {/* Action Buttons */}
                    <div className="mt-4 flex gap-2">
                      {(isAdmin() || isCoordinator() || (isAgent() && lead.agentId === user?.id)) && (lead as any).verificationMethod === 'whatsapp' && (
                        <motion.button
                          whileHover={{ scale: 1.02, y: -1 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => {
                            setSelectedLeadForChat(lead);
                            setShowWhatsAppChat(true);
                            const logsCol = collection(db, 'leads', lead.id, 'whatsappLogs');
                            if (whatsAppLogsUnsubscribeRef.current) {
                              whatsAppLogsUnsubscribeRef.current();
                            }
                            const unsubscribe = onSnapshot(
                              query(logsCol, orderBy('createdAt', 'asc')),
                              (snap) => {
                                const rows = snap.docs.map(d => ({
                                  id: d.id,
                                  ...d.data(),
                                  createdAt: d.data().createdAt
                                }));
                                setWhatsAppLogs(rows as any[]);
                              },
                              (error) => {
                                if (error.code === 'permission-denied') {
                                  return;
                                }
                                console.error('Error fetching WhatsApp logs:', error);
                                toast.error('Failed to load WhatsApp chat');
                              }
                            );
                            whatsAppLogsUnsubscribeRef.current = unsubscribe;
                          }}
                          title="WhatsApp Verification"
                          className="inline-flex items-center justify-center h-11 w-11 rounded-full bg-green-50/80 text-green-700 border border-green-100 hover:bg-green-50 hover:border-green-200 transition-all duration-200 flex-shrink-0"
                        >
                          <svg viewBox="0 0 32 32" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                            <path d="M19.11 17.46c-.27-.13-1.6-.79-1.85-.88-.25-.09-.43-.13-.61.13-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.13-1.12-.41-2.12-1.31-.78-.69-1.31-1.54-1.46-1.8-.15-.27-.02-.41.11-.54.11-.11.27-.29.41-.45.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.13-.61-1.46-.83-2-.22-.52-.44-.45-.61-.45h-.52c-.18 0-.45.07-.68.34-.23.27-.9.88-.9 2.15 0 1.27.92 2.5 1.05 2.67.14.18 1.81 2.77 4.4 3.88.62.27 1.11.43 1.49.55.63.2 1.2.17 1.65.1.5-.07 1.6-.65 1.83-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.31zM16 3C8.82 3 3 8.82 3 16c0 2.29.62 4.48 1.79 6.42L3 29l6.74-1.77C11.58 28.38 13.76 29 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3zm0 23.73c-2.12 0-4.11-.62-5.78-1.78l-.41-.26-4.01 1.05 1.07-3.9-.27-.41C5.43 20.76 4.73 18.43 4.73 16 4.73 9.94 9.94 4.73 16 4.73S27.27 9.94 27.27 16 22.06 26.73 16 26.73z"/>
                          </svg>
                        </motion.button>
                      )}
                      {isAdmin() && (
                        <motion.button
                          whileHover={{ scale: 1.02, y: -1 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => {
                            setSelectedLeadForTransfer(lead);
                            setShowTransferModal(true);
                          }}
                          title="Transfer Lead"
                          className="inline-flex items-center justify-center h-11 w-11 rounded-full bg-blue-50/80 text-blue-700 border border-blue-100 hover:bg-blue-50 hover:border-blue-200 transition-all duration-200 flex-shrink-0"
                        >
                          <ArrowRightLeft className="h-5 w-5" />
                        </motion.button>
                      )}
                      <motion.div
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className="relative z-20 flex-1"
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
          </div>
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

      {/* WhatsApp Chat Modal for Admins */}
      <AnimatePresence>
        {showWhatsAppChat && selectedLeadForChat && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white/90 rounded-2xl p-0 max-w-6xl w-full mx-4 shadow-2xl overflow-hidden"
            >
              <div className="px-6 sm:px-8 py-4 bg-gradient-to-r from-emerald-50 to-green-50 border-b border-emerald-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-emerald-100 text-emerald-600">
                    <svg viewBox="0 0 32 32" className="h-5 w-5" fill="currentColor" aria-hidden="true"><path d="M19.11 17.46c-.27-.13-1.6-.79-1.85-.88-.25-.09-.43-.13-.61.13-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.13-1.12-.41-2.12-1.31-.78-.69-1.31-1.54-1.46-1.8-.15-.27-.02-.41.11-.54.11-.11.27-.29.41-.45.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.13-.61-1.46-.83-2-.22-.52-.44-.45-.61-.45h-.52c-.18 0-.45.07-.68.34-.23.27-.9.88-.9 2.15 0 1.27.92 2.5 1.05 2.67.14.18 1.81 2.77 4.4 3.88.62.27 1.11.43 1.49.55.63.2 1.2.17 1.65.1.5-.07 1.6-.65 1.83-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.31zM16 3C8.82 3 3 8.82 3 16c0 2.29.62 4.48 1.79 6.42L3 29l6.74-1.77C11.58 28.38 13.76 29 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3zm0 23.73c-2.12 0-4.11-.62-5.78-1.78l-.41-.26-4.01 1.05 1.07-3.9-.27-.41C5.43 20.76 4.73 18.43 4.73 16 4.73 9.94 9.94 4.73 16 4.73S27.27 9.94 27.27 16 22.06 26.73 16 26.73z"/></svg>
                  </span>
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-emerald-800">WhatsApp Verification</h3>
                    {selectedLeadForChat && (
                      <p className="text-xs sm:text-sm text-emerald-700/80">{selectedLeadForChat.customerName} · {selectedLeadForChat.customerNumber}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowWhatsAppChat(false);
                    setSelectedLeadForChat(null);
                    setWhatsAppLogs([]);
                  }}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-full text-emerald-700 hover:bg-emerald-100/60"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div ref={logsContainerRef} className="px-6 sm:px-8 py-5 max-h-[70vh] overflow-y-auto">
                <WhatsAppConversationView
                  messages={whatsAppLogs as WhatsAppMessage[]}
                  lead={selectedLeadForChat || undefined}
                  planDetails={planDetails || undefined}
                  containerRef={logsContainerRef}
                  className=""
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Advanced Search Modal */}
      <AdvancedLeadSearch
        leads={leads}
        onFiltersChange={handleAdvancedFiltersChange}
        onExportResults={handleExportResults}
        isVisible={showAdvancedSearch}
        onClose={() => setShowAdvancedSearch(false)}
      />

      {/* Transfer Lead Modal */}
      {selectedLeadForTransfer && (
        <TransferLeadModal
          lead={selectedLeadForTransfer}
          isOpen={showTransferModal}
          onClose={() => {
            setShowTransferModal(false);
            setSelectedLeadForTransfer(null);
          }}
          onTransferComplete={() => {
            // Refresh leads list after transfer
            loadLeads();
          }}
        />
      )}
    </div>
  );
}
