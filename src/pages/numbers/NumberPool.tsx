/**
 * ===============================================================================
 * NUMBER POOL PAGE COMPONENT - COMPREHENSIVE NUMBER POOL MANAGEMENT INTERFACE
 * ===============================================================================
 * 
 * This is the main Number Pool management page that provides comprehensive
 * functionality for managing phone numbers in the CRM system. It includes
 * advanced features like pagination, search, filtering, real-time updates,
 * number claiming/reservation, and administrative operations.
 * 
 * FEATURES:
 * 
 * 1. NUMBER POOL MANAGEMENT
 *    - Complete CRUD operations for phone numbers
 *    - Real-time synchronization with Firebase Firestore
 *    - Advanced pagination with cursor-based navigation
 *    - Category-based filtering and organization
 * 
 * 2. SEARCH AND DISCOVERY
 *    - Real-time search with debounced input
 *    - Hybrid search combining cache and live data
 *    - Advanced filtering by category, status, and team visibility
 *    - Search result pagination and caching
 * 
 * 3. NUMBER OPERATIONS
 *    - Number claiming and reservation system
 *    - Status management and updates
 *    - Team visibility controls
 *    - Bulk operations and multi-selection
 * 
 * 4. USER INTERFACE
 *    - Responsive design optimized for mobile and desktop
 *    - Real-time status updates and countdown timers
 *    - Interactive modals and dialogs for operations
 *    - Advanced sorting and column management
 * 
 * 5. PERFORMANCE OPTIMIZATION
 *    - IndexedDB caching for fast data access
 *    - Smart pagination with cursor caching
 *    - Debounced search and operations
 *    - Memory-efficient state management
 * 
 * 6. ROLE-BASED ACCESS CONTROL
 *    - Admin, Manager, Coordinator, and Agent role support
 *    - Team-based number visibility
 *    - Permission-based operation availability
 * 
 * USAGE:
 * This component is the main interface for number pool management and is
 * used by all user roles with appropriate permission filtering.
 * ===============================================================================
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp, orderBy, onSnapshot, writeBatch, getDoc, addDoc, runTransaction, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  getCachedPaginatedNumbers,
  cachePaginatedNumbers,
  searchCachedNumbersFast
} from '../../utils/indexedDB';
import { NumberPoolPagination, paginationUtils } from '../../utils/pagination';
import { numberPoolManager } from '../../utils/numberPoolManager';
import { unifiedSearch } from '../../utils/unifiedSearch';
import { useAuthStore } from '../../store/authStore';
import { NumberPool as NumberPoolType, NumberStatus } from '../../types';
import { toast } from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { useDebounce } from '../../hooks/useDebounce';
import { logNumberAction } from '../../utils/numberLogging';
import { resolveUserName } from '../../utils/numberLogging';
import { numberPoolStatsService } from '../../services/numberPoolStatsService';
import { 
  AlertCircle, 
  Trash2, 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Hash,
  Tag,
  XCircle,
  Clock,
  Zap,
  AlertTriangle,
  Filter,
  MessageSquare,
  UserCheck,
  CheckSquare,
  XSquare,
  Loader2,
  Phone,
  Package,
  Shield,
  Lock,
  Plus,
  ChevronDown,
  CheckCircle2,
  CheckCircle,
  X,
  Edit,
  RefreshCw
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatBox } from '../../components/ChatBox';

// ===============================================================================
// HELPER COMPONENTS
// ===============================================================================

/**
 * ===============================================================================
 * AGENT TEAM INFO COMPONENT
 * ===============================================================================
 * 
 * Displays agent name and team information for number assignments.
 * Handles permission-based data access and loading states.
 * 
 * @param agentId - ID of the agent to display information for
 */
const AgentTeamInfo = ({ agentId }: { agentId: string }) => {
  const [agentInfo, setAgentInfo] = useState<{ name: string; teamName: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, isAdmin } = useAuthStore();

  useEffect(() => {
    const fetchAgentInfo = async () => {
      try {
        setLoading(true);
        const userDoc = await getDoc(doc(db, 'users', agentId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const agentName = userData.name || userData.email || 'Unknown Agent';
          
          // Get team information (only if user has permission)
          let teamName = 'No Team';
          if (userData.teamId && (isAdmin() || user?.role === 'coordinator' || user?.role === 'manager')) {
            try {
              const teamDoc = await getDoc(doc(db, 'teams', userData.teamId));
              if (teamDoc.exists()) {
                teamName = teamDoc.data().name || 'Unknown Team';
              }
            } catch (teamError) {
              // If user doesn't have permission to read teams, just show "No Team"
              teamName = 'No Team';
            }
          }
          
          setAgentInfo({ name: agentName, teamName });
        }
      } catch (error) {
        setAgentInfo({ name: 'Error', teamName: 'Error' });
      } finally {
        setLoading(false);
      }
    };

    if (agentId) {
      fetchAgentInfo();
    }
  }, [agentId, isAdmin, user?.role]);

  if (loading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-3 w-16 bg-gray-200 rounded animate-pulse"></div>
      </div>
    );
  }

  if (!agentInfo) {
    return <div className="text-sm text-gray-400">-</div>;
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center space-x-2">
        <div className="h-6 w-6 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center">
          <UserCheck className="h-3 w-3 text-indigo-600" />
        </div>
        <div className="text-sm font-medium text-gray-900 whitespace-normal break-words">
          {agentInfo.name}
        </div>
      </div>
      <div className="text-xs text-gray-500 whitespace-normal break-words">
        {agentInfo.teamName}
      </div>
    </div>
  );
};

// ===============================================================================
// TYPE DEFINITIONS AND INTERFACES
// ===============================================================================

/**
 * Props interface for the NumberPool component
 */
interface NumberPoolProps {
  onNumberSelect?: (number: NumberPoolType) => void;  // Callback for number selection
  selectedCategory?: string;                          // Pre-selected category filter
  onCategoryChange?: (category: string) => void;      // Callback for category changes
}

/**
 * Available sortable fields for the number pool table
 */
type SortField = 'number' | 'category' | 'code' | 'group' | 'passcode' | 'status' | 'reservationCount';

/**
 * Sort direction options
 */
type SortDirection = 'asc' | 'desc';

// ===============================================================================
// CONSTANTS AND CONFIGURATION
// ===============================================================================

/**
 * Available number categories in the system
 */
const CATEGORIES = ['Standard', 'Silver', 'Silver plus', 'Gold', 'Gold plus', 'Platinum'] as const;

/**
 * Available page sizes for pagination
 */
const PAGE_SIZES = [10, 20, 40, 80, 120] as const;

/**
 * Maximum time (20 minutes) for number claims before auto-release
 */
const CLAIM_TIMEOUT = 20 * 60 * 1000; // 20 minutes in milliseconds

/**
 * Maximum number of concurrent reservations per user
 */
const MAX_RESERVATIONS = 3;

/**
 * Debounce delay for button operations to prevent rapid clicking
 */
const BUTTON_DEBOUNCE_DELAY = 300; // 300ms debounce

/**
 * Timeout for claim operations to prevent hanging states
 */
const CLAIM_OPERATION_TIMEOUT = 10000; // 10 seconds timeout for claim operations

/**
 * Status styling configuration for number status badges
 * Defines colors, icons, and gradients for each number status
 */
const STATUS_STYLES = {
  open: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-800',
    icon: CheckCircle2,
    gradient: 'from-emerald-50 to-emerald-100'
  },
  verified: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    icon: CheckCircle2,
    gradient: 'from-blue-50 to-blue-100'
  },
  reserved: {
    bg: 'bg-amber-100',
    text: 'text-amber-800',
    icon: Clock,
    gradient: 'from-amber-50 to-amber-100'
  },
  pending_verification: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    icon: Clock,
    gradient: 'from-yellow-50 to-yellow-100'
  },
  assigned: {
    bg: 'bg-purple-100',
    text: 'text-purple-800',
    icon: Tag,
    gradient: 'from-purple-50 to-purple-100'
  },
  activated: {
    bg: 'bg-indigo-100',
    text: 'text-indigo-800',
    icon: Zap,
    gradient: 'from-indigo-50 to-indigo-100'
  },
  follow_up: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    icon: AlertTriangle,
    gradient: 'from-orange-50 to-orange-100'
  },
  rejected: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    icon: XCircle,
    gradient: 'from-red-50 to-red-100'
  },
  claimed: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    icon: Clock,
    gradient: 'from-blue-50 to-blue-100'
  },
  being_claimed: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    icon: Clock,
    gradient: 'from-blue-50 to-blue-100'
  }
};

/**
 * Status check interface for external number availability verification
 */
interface StatusCheck {
  id: string;
  numberId: string;
  number: string;
  requestedBy: string;
  requestedAt: Date;
  status?: 'pending' | 'available' | 'unavailable';
  respondedAt?: Date;
  respondedBy?: string;
  expiresAt?: Date; // Add expiration time
}

// ===============================================================================
// MAIN NUMBER POOL COMPONENT
// ===============================================================================

/**
 * ===============================================================================
 * NUMBER POOL COMPONENT
 * ===============================================================================
 * 
 * Main component for managing the number pool with comprehensive functionality
 * including pagination, search, filtering, real-time updates, and number operations.
 * 
 * @param onNumberSelect - Optional callback when a number is selected
 * @param propSelectedCategory - Optional pre-selected category
 * @param onCategoryChange - Optional callback for category changes
 */
export function NumberPool({ onNumberSelect, selectedCategory: propSelectedCategory, onCategoryChange }: NumberPoolProps = {}) {
  // ===============================================================================
  // STATE MANAGEMENT
  // ===============================================================================
  
  // Core data state
  const [numbers, setNumbers] = useState<NumberPoolType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPool, setShowPool] = useState(true);
  const [isMobile] = useState(() => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
  const { user, isAdmin } = useAuthStore();
  
  // Reservation and number management state
  const [hasReservation, setHasReservation] = useState(false);
  const [reservedNumbers, setReservedNumbers] = useState<NumberPoolType[]>([]);
  const [allNumbersForReserved, setAllNumbersForReserved] = useState<NumberPoolType[]>([]);
  
  // ===============================================================================
  // PAGINATION STATE
  // ===============================================================================
  
  const [currentPage, setCurrentPage] = useState(1);
  // Mobile-optimized page size
  const [pageSize, setPageSize] = useState(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return isMobile ? 20 : paginationUtils.calculateOptimalPageSize();
  });
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  // ===============================================================================
  // SEARCH STATE
  // ===============================================================================
  
  const [searchResults, setSearchResults] = useState<NumberPoolType[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchCurrentPage, setSearchCurrentPage] = useState(1);
  const [searchTotalPages, setSearchTotalPages] = useState(0);
  const [searchTotalItems, setSearchTotalItems] = useState(0);
  const [searchHasNextPage, setSearchHasNextPage] = useState(false);
  const [searchHasPreviousPage, setSearchHasPreviousPage] = useState(false);
  
  // ===============================================================================
  // UI STATE AND DIALOGS
  // ===============================================================================
  
  const [showReleaseDialog, setShowReleaseDialog] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<NumberPoolType | null>(null);
  const [selectedNumbers, setSelectedNumbers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(propSelectedCategory || null);
  const [statsTotalPages, setStatsTotalPages] = useState<number>(0);
  const [sortConfig, setSortConfig] = useState<{ field: SortField; direction: SortDirection }>({
    field: 'number',
    direction: 'asc'
  });
  const [showReserveDialog, setShowReserveDialog] = useState(false);
  const [numberToReserve, setNumberToReserve] = useState<NumberPoolType | null>(null);
  const [showReserveLimitDialog, setShowReserveLimitDialog] = useState(false);
  const [showNumberActiveDialog, setShowNumberActiveDialog] = useState(false);
  const [activeNumberInfo, setActiveNumberInfo] = useState<{number: string, etiStatus: number, message: string} | null>(null);
  const [checkingReserveId, setCheckingReserveId] = useState<string | null>(null);
  const [selectAllMode, setSelectAllMode] = useState(false);
  const [showClaimDialog, setShowClaimDialog] = useState(false);
  const [numberToClaim, setNumberToClaim] = useState<NumberPoolType | null>(null);
  const [showStatusCheckDialog, setShowStatusCheckDialog] = useState(false);
  const [numberForStatusCheck, setNumberForStatusCheck] = useState<NumberPoolType | null>(null);
  const [isStatusCheckSubmitting, setIsStatusCheckSubmitting] = useState(false);
  const [claimTimer, setClaimTimer] = useState<NodeJS.Timeout | null>(null);
  const [claimCountdowns, setClaimCountdowns] = useState<Record<string, number>>({});
  const [reservationCountdowns, setReservationCountdowns] = useState<Record<string, number>>({});
  const [showChat, setShowChat] = useState(false);
  const [selectedNumberForChat, setSelectedNumberForChat] = useState<NumberPoolType | null>(null);
  const [searchParams] = useSearchParams();
  const numberIdFromUrl = searchParams.get('numberId');
  const [statusChecks, setStatusChecks] = useState<StatusCheck[]>([]);
  const [isCoordinator, setIsCoordinator] = useState(false);
  const [agentLeadNumberIds, setAgentLeadNumberIds] = useState<Set<string>>(new Set());
  
  // ===============================================================================
  // PERFORMANCE OPTIMIZATION STATE
  // ===============================================================================
  
  const [claimingNumbers, setClaimingNumbers] = useState<Set<string>>(new Set());
  const [reservingNumbers, setReservingNumbers] = useState<Set<string>>(new Set());
  const [chattingNumbers, setChattingNumbers] = useState<Set<string>>(new Set());
  const [operationTimeouts, setOperationTimeouts] = useState<Map<string, NodeJS.Timeout>>(new Map());
  const [lastClaimAttempts, setLastClaimAttempts] = useState<Map<string, number>>(new Map());
  
  // ===============================================================================
  // COORDINATOR ADD/EDIT NUMBER STATES
  // ===============================================================================
  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addingNumber, setAddingNumber] = useState(false);
  const [newPoolNumber, setNewPoolNumber] = useState('');
  const [newPoolCategory, setNewPoolCategory] = useState('');
  const [newPoolCode, setNewPoolCode] = useState('');
  const [newPoolGroup, setNewPoolGroup] = useState('');
  const [newPoolPasscode, setNewPoolPasscode] = useState('');
  const [newPoolTeamVisibility, setNewPoolTeamVisibility] = useState('');
  const [phoneError, setPhoneError] = useState('');

  // Edit functionality states
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingNumber, setEditingNumber] = useState<NumberPoolType | null>(null);
  const [editPoolNumber, setEditPoolNumber] = useState('');
  const [editPoolCategory, setEditPoolCategory] = useState('');
  const [editPoolCode, setEditPoolCode] = useState('');
  const [editPoolGroup, setEditPoolGroup] = useState('');
  const [editPoolPasscode, setEditPoolPasscode] = useState('');
  const [editPoolTeamVisibility, setEditPoolTeamVisibility] = useState('');
  const [editPoolStatus, setEditPoolStatus] = useState<NumberStatus>('open');
  const [editPhoneError, setEditPhoneError] = useState('');
  const [updatingNumber, setUpdatingNumber] = useState(false);
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [showDuplicateNumberDialog, setShowDuplicateNumberDialog] = useState(false);
  const [duplicateNumberData, setDuplicateNumberData] = useState<{ existingNumber: string; newNumber: string } | null>(null);
  const [showSetOpenDialog, setShowSetOpenDialog] = useState(false);
  const [numberToSetOpen, setNumberToSetOpen] = useState<NumberPoolType | null>(null);
  const [isSettingOpen, setIsSettingOpen] = useState(false);
  
  // Bulk delete functionality states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // ===============================================================================
  // UTILITY FUNCTIONS AND REFS
  // ===============================================================================
  
  // Debounced search term for performance optimization
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  // Realtime subscriptions for search-visible documents cleanup
  const searchVisibleUnsubsRef = useRef<Map<string, () => void>>(new Map());

  /**
   * Visibility guard filter for team-restricted numbers based on user role
   * @param list - List of numbers to filter
   * @returns Filtered list based on user permissions
   */
  const filterByVisibility = useCallback((list: NumberPoolType[]): NumberPoolType[] => {
    // Admin/manager/coordinator see everything
    if (isAdmin() || user?.role === 'manager' || user?.role === 'coordinator') return list;
    // Agents: if number has teamVisibility, it must match user's team; if missing, it's public
    if (user?.role === 'agent' && user.teamId) {
      return list.filter(n => !n.teamVisibility || n.teamVisibility === user.teamId);
    }
    return list;
  }, [isAdmin, user?.role, user?.teamId]);

  // ===============================================================================
  // EFFECTS AND LIFECYCLE MANAGEMENT
  // ===============================================================================

  /**
   * Initialize number pool manager and subscribe to state changes
   * Handles persistent state management across navigation and loading timeout protection
   */
  useEffect(() => {
    
    // Subscribe to manager state
    const unsubscribe = numberPoolManager.subscribe((state) => {
      setNumbers(state.numbers);
      setCurrentPage(state.currentPage);
      setTotalPages(state.totalPages);
      setTotalItems(state.totalItems);
      setHasNextPage(state.hasNextPage);
      setHasPreviousPage(state.hasPreviousPage);
      setLoading(state.isLoading);
      
      // Always keep track of all numbers for reserved numbers calculation
      setAllNumbersForReserved(state.numbers);
      
      // Don't update search results from manager subscription
      // Search results are managed separately by the search effect
    });

    // Initialize manager (will use cache if available)
    numberPoolManager.setUserRole(user?.role);
    numberPoolManager.initialize(selectedCategory, pageSize, user?.id, user?.role);

    // Add timeout protection for stuck loading states
    const loadingTimeout = setTimeout(() => {
      if (loading) {
        console.warn('NumberPool loading timeout detected - forcing reset');
        numberPoolManager.forceResetLoading();
      }
    }, 35000); // 35 second timeout

    return () => {
      unsubscribe();
      clearTimeout(loadingTimeout);
    };
  }, [selectedCategory, pageSize, user?.id, loading]);

  /**
   * Component cleanup effect - handles cleanup of listeners and timers
   * Runs only on component unmount to prevent memory leaks
   */
  useEffect(() => {
    return () => {
      // Clean up search listeners when component unmounts
      const searchUnsubs = searchVisibleUnsubsRef.current;
      for (const unsub of searchUnsubs.values()) {
          unsub();
      }
      searchUnsubs.clear();
      
      if (claimTimer) {
        clearTimeout(claimTimer);
      }
    };
  }, []);

  /**
   * Search management effect - handles comprehensive search functionality
   * Includes debounced search, result pagination, and real-time updates
   */
  useEffect(() => {
    if (!debouncedSearchTerm.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      // Reset search pagination state
      setSearchCurrentPage(1);
      setSearchTotalPages(0);
      setSearchTotalItems(0);
      setSearchHasNextPage(false);
      setSearchHasPreviousPage(false);
      // Return to original page when search is cleared
      numberPoolManager.onSearchClear();
      
      // Force a re-render by updating the display numbers
      setTimeout(() => {
        setSearchResults([]);
      }, 100);
      return;
    }

    const performSearch = async () => {
      setIsSearching(true);
      const termAtStart = debouncedSearchTerm;
      
      try {
        // Use unified search for consistent results
        const result = await unifiedSearch.search(debouncedSearchTerm, {
          category: selectedCategory || 'all',
          limit: pageSize * 2, // Get more results for pagination
          includeStale: false
        });
        
        // Avoid race conditions: only apply if term hasn't changed
        if (termAtStart === debouncedSearchTerm) {
          const filteredResults = filterByVisibility(result.data);
          
          // Calculate pagination for current page
          const startIndex = (searchCurrentPage - 1) * pageSize;
          const endIndex = startIndex + pageSize;
          const paginatedResults = filteredResults.slice(startIndex, endIndex);
          
          setSearchResults(paginatedResults);
          setSearchTotalPages(Math.ceil(filteredResults.length / pageSize));
          setSearchTotalItems(filteredResults.length);
          setSearchHasNextPage(endIndex < filteredResults.length);
          setSearchHasPreviousPage(searchCurrentPage > 1);
          
          // Log search performance
          console.log(`Search "${debouncedSearchTerm}": ${result.source} source, ${result.data.length} results, complete: ${result.isComplete}`);
        }
      } catch (error) {
        console.error('Search error:', error);
        toast.error('Search failed');
      } finally {
        if (termAtStart === debouncedSearchTerm) {
          setIsSearching(false);
        }
      }
    };

    performSearch();
  }, [debouncedSearchTerm, selectedCategory, searchCurrentPage, pageSize]);

  // Realtime listeners for search results (keep visible searched items live) - OPTIMIZED
  useEffect(() => {
    const unsubs = searchVisibleUnsubsRef.current;

    if (!debouncedSearchTerm.trim()) {
      // Clear any existing search listeners when search is cleared
      for (const fn of unsubs.values()) fn();
      unsubs.clear();
      return;
    }

    // OPTIMIZATION: Limit search listeners to prevent performance issues on mobile
    if (searchResults.length > 10) { // Reduced from 20 for mobile performance
      console.log('Too many search results, limiting listeners for mobile performance');
      return;
    }

    const ids = new Set(searchResults.map(n => n.id));

    // Remove listeners for docs no longer in search results
    for (const [id, fn] of unsubs.entries()) {
      if (!ids.has(id)) {
        fn();
        unsubs.delete(id);
      }
    }

    // Attach listeners for newly visible search docs
    searchResults.forEach(n => {
      if (unsubs.has(n.id)) return;
      const unsub = onSnapshot(doc(db, 'numberPool', n.id), (snap) => {
        if (!snap.exists()) {
          setSearchResults(prev => prev.filter(x => x.id !== n.id));
          // Also reflect in numbers if present
          setNumbers(prev => prev.filter(x => x.id !== n.id));
          return;
        }
        const d = snap.data();
        const updated: NumberPoolType = {
          id: snap.id,
          ...d,
          lastStatusChange: d.lastStatusChange?.toDate?.() || d.lastStatusChange,
          reservedAt: d.reservedAt?.toDate?.() || d.reservedAt,
          expiresAt: d.expiresAt?.toDate?.() || d.expiresAt,
          claimingStartedAt: d.claimingStartedAt?.toDate?.() || d.claimingStartedAt,
          claimingExpiresAt: d.claimingExpiresAt?.toDate?.() || d.claimingExpiresAt
        } as NumberPoolType;
        setSearchResults(prev => prev.map(x => (x.id === updated.id ? updated : x)));
        // Optionally keep base numbers in sync too
        setNumbers(prev => prev.map(x => (x.id === updated.id ? updated : x)));
      });
      unsubs.set(n.id, unsub);
    });

    // Cleanup on unmount
    return () => {
      for (const fn of unsubs.values()) fn();
      unsubs.clear();
    };
  }, [debouncedSearchTerm, searchResults]);

  // Load stats for total pages (OPTIMIZED) - Mobile performance
  useEffect(() => {
    let isMounted = true;
    
    const loadStats = async () => {
      try {
        const totalPages = await numberPoolStatsService.getTotalPages(pageSize, selectedCategory || undefined);
        if (isMounted) {
          setStatsTotalPages(totalPages);
        }
      } catch (error) {
        // no-op
      }
    };

    loadStats();
    
    return () => {
      isMounted = false;
    };
  }, [pageSize, selectedCategory]);

  // Always keep "Your Reserved Numbers" in sync globally (independent of current page) - Mobile optimized
  useEffect(() => {
    if (!user?.id) {
      setReservedNumbers([]);
      return;
    }

    let isMounted = true;
    let unsub: (() => void) | undefined;
    let fallbackCleanup: (() => void) | undefined;

    // Primary listener ordered by reservedAt desc (requires composite index)
    const qPrimary = query(
      collection(db, 'numberPool'),
      where('reservedBy', '==', user.id),
      where('status', '==', 'reserved'),
      orderBy('reservedAt', 'desc'),
      limit(20) // Reduced from 40 for mobile performance
    );

    unsub = onSnapshot(
      qPrimary,
      (snap) => {
        if (!isMounted) return;
        
        const items = snap.docs.map((d) => {
          const data: any = d.data();
          return {
            id: d.id,
            ...data,
            reservedAt: data.reservedAt?.toDate?.() || data.reservedAt,
            lastStatusChange: data.lastStatusChange?.toDate?.() || data.lastStatusChange,
            claimingStartedAt: data.claimingStartedAt?.toDate?.() || data.claimingStartedAt,
            claimingExpiresAt: data.claimingExpiresAt?.toDate?.() || data.claimingExpiresAt
          } as NumberPoolType;
        });
        setReservedNumbers(items);
      },
      () => {
        if (!isMounted) return;
        
        // Fallback without orderBy to avoid index requirement; client-side sort
        const qFallback = query(
          collection(db, 'numberPool'),
          where('reservedBy', '==', user.id),
          where('status', '==', 'reserved'),
          limit(20) // Reduced from 40 for mobile performance
        );
        fallbackCleanup = onSnapshot(qFallback, (snap) => {
          if (!isMounted) return;
          
          const items = snap.docs
            .map((d) => {
              const data: any = d.data();
              return {
                id: d.id,
                ...data,
                reservedAt: data.reservedAt?.toDate?.() || data.reservedAt,
                lastStatusChange: data.lastStatusChange?.toDate?.() || data.lastStatusChange,
                claimingStartedAt: data.claimingStartedAt?.toDate?.() || data.claimingStartedAt,
                claimingExpiresAt: data.claimingExpiresAt?.toDate?.() || data.claimingExpiresAt
              } as NumberPoolType;
            })
            .sort((a, b) => (new Date(b.reservedAt || 0).getTime() - new Date(a.reservedAt || 0).getTime()));
          setReservedNumbers(items);
        });
      }
    );

    return () => {
      isMounted = false;
      if (unsub) unsub();
      if (fallbackCleanup) fallbackCleanup();
    };
  }, [user?.id]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
    setSearchCurrentPage(1);
  }, [selectedCategory, pageSize]);

  // Pagination navigation functions using global manager
  const goToNextPage = useCallback(async () => {
    await numberPoolManager.nextPage();
  }, []);

  const goToPreviousPage = useCallback(async () => {
    await numberPoolManager.previousPage();
  }, []);

  const goToPage = useCallback(async (page: number) => {
    await numberPoolManager.goToPage(page);
  }, []);

  // Search pagination functions
  const goToNextSearchPage = useCallback(() => {
    if (searchHasNextPage) {
      setSearchCurrentPage(prev => prev + 1);
    }
  }, [searchHasNextPage]);

  const goToPreviousSearchPage = useCallback(() => {
    if (searchHasPreviousPage) {
      setSearchCurrentPage(prev => prev - 1);
    }
  }, [searchHasPreviousPage]);

  const goToSearchPage = useCallback((page: number) => {
    if (page >= 1 && page <= searchTotalPages) {
      setSearchCurrentPage(page);
    }
  }, [searchTotalPages]);


  // Get display pagination info
  const displayPagination = useMemo(() => {
    if (debouncedSearchTerm.trim()) {
      return {
        currentPage: searchCurrentPage,
        totalPages: searchTotalPages,
        totalItems: searchTotalItems,
        hasNextPage: searchHasNextPage,
        hasPreviousPage: searchHasPreviousPage
      };
    }
    return {
      currentPage,
      totalPages: statsTotalPages > 0 ? statsTotalPages : totalPages,
      totalItems,
      hasNextPage,
      hasPreviousPage
    };
  }, [debouncedSearchTerm, searchCurrentPage, searchTotalPages, searchTotalItems, searchHasNextPage, searchHasPreviousPage, currentPage, totalPages, totalItems, hasNextPage, hasPreviousPage, statsTotalPages]);

  // Compute reservation cap state from the dedicated reservedNumbers listener
  useEffect(() => {
    setHasReservation(reservedNumbers.length >= MAX_RESERVATIONS);
  }, [reservedNumbers]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, pageSize]);

  useEffect(() => {
    if (propSelectedCategory !== undefined) {
      setSelectedCategory(propSelectedCategory);
    }
  }, [propSelectedCategory]);

  // Edit number functionality
  const openEditModal = (number: NumberPoolType) => {
    setEditingNumber(number);
    setEditPoolNumber(number.number || '');
    setEditPoolCategory(number.category || '');
    setEditPoolCode(number.code || '');
    setEditPoolGroup(number.group || '');
    setEditPoolPasscode(number.passcode || '');
    setEditPoolTeamVisibility(number.teamVisibility || '');
    setEditPoolStatus(number.status || 'open');
    setEditPhoneError('');
    setShowEditDialog(true);
  
  };

  const handleUpdateNumber = async () => {
    if (!editingNumber || updatingNumber) {
      return;
    }

    const num = editPoolNumber.trim();
    const cat = editPoolCategory.trim();
    const code = editPoolCode.trim();
    const group = editPoolGroup.trim();
    

    // Validate phone number
    if (!num) {
      toast.error('Phone number is required');
      return;
    }
    if (num.length !== 10) {
      toast.error('Phone number must be exactly 10 digits');
      return;
    }
    if (!code) {
      toast.error('Code is required');
      return;
    }
    if (!group) {
      toast.error('Group is required');
      return;
    }
    if (!Array.from(CATEGORIES).includes(cat as any)) {
      toast.error('Please select a valid category');
      return;
    }
    // Validate passcode for admin/coordinator
    if ((isAdmin() || isCoordinator) && !editPoolPasscode.trim()) {
      toast.error('Passcode is required');
      return;
    }

    // Check if another number already exists with this number (excluding current)
    const existingNumber = numbers.find(n => n.id !== editingNumber.id && (n.number || '').trim() === num);
    if (existingNumber) {
      setDuplicateNumberData({
        existingNumber: existingNumber.number || '',
        newNumber: num
      });
      setShowDuplicateNumberDialog(true);
      return;
    }

    try {
      setUpdatingNumber(true);
      const numberData: any = {
        number: num,
        category: cat,
        code,
        group: group.trim(),
        status: editPoolStatus,
        lastStatusChange: serverTimestamp()
      };

      // Add passcode for admin/coordinator
      if (isAdmin() || isCoordinator) {
        numberData.passcode = editPoolPasscode.trim();
      }
      // Only add team visibility if it has a value
      if (editPoolTeamVisibility.trim()) {
        numberData.teamVisibility = editPoolTeamVisibility.trim();
      }

      
      // Get old data for logging
      const oldData = {
        number: editingNumber.number,
        category: editingNumber.category,
        code: editingNumber.code,
        group: editingNumber.group,
        passcode: editingNumber.passcode,
        teamVisibility: editingNumber.teamVisibility,
        status: editingNumber.status
      };
      
      await updateDoc(doc(db, 'numberPool', editingNumber.id), numberData);
      
      // Log the number update
      await logNumberAction(
        editingNumber.id,
        num,
        'updated',
        oldData,
        numberData,
        `Updated number: ${editingNumber.number} → ${num}`
      );
      
      toast.success('Number updated successfully!');
      setShowEditDialog(false);
      setEditingNumber(null);
      // Reset form
      setEditPoolNumber('');
      setEditPoolCategory('');
      setEditPoolCode('');
      setEditPoolGroup('');
      setEditPoolPasscode('');
      setEditPoolTeamVisibility('');
      setEditPoolStatus('open');
      setEditPhoneError('');
    } catch (err) {
      toast.error('Failed to update number');
    } finally {
      setUpdatingNumber(false);
    }
  };

  // Fetch teams data for team visibility selection (only for admins and coordinators)
  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const teamsSnapshot = await getDocs(collection(db, 'teams'));
        const teamsData = teamsSnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || 'Unnamed Team'
        }));
        setTeams(teamsData);
      } catch (error) {
      }
    };

    // Only fetch teams for admins and coordinators (they need it for team visibility dropdown)
    if (isAdmin() || user?.role === 'coordinator') {
      fetchTeams();
    }
  }, [isAdmin, user?.role]);

  useEffect(() => {
    if (onCategoryChange && selectedCategory !== propSelectedCategory) {
      onCategoryChange(selectedCategory || '');
    }
  }, [selectedCategory, onCategoryChange, propSelectedCategory]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const newClaimCountdowns: Record<string, number> = {};
      const newReservationCountdowns: Record<string, number> = {};

      // Combine all sources: current page numbers, reserved section numbers, and search results
      const mergedMap = new Map<string, NumberPoolType>();
      numbers.forEach(n => mergedMap.set(n.id, n));
      reservedNumbers.forEach(n => mergedMap.set(n.id, n));
      searchResults.forEach(n => mergedMap.set(n.id, n));
      

      mergedMap.forEach((number) => {
        // Handle claim countdowns
        const claimingRaw = (number as any)?.claimingExpiresAt;
        if (claimingRaw) {
          const claimingExpiresAt: Date = typeof claimingRaw?.toDate === 'function'
            ? claimingRaw.toDate()
            : (claimingRaw instanceof Date ? claimingRaw : new Date(claimingRaw));
          if (claimingExpiresAt && !Number.isNaN(claimingExpiresAt.getTime())) {
            const timeLeft = Math.max(0, claimingExpiresAt.getTime() - now);
            if (timeLeft > 0) newClaimCountdowns[number.id] = timeLeft;
          }
        }

        // Handle reservation countdowns
        const reservationRaw = (number as any)?.expiresAt;
        if (reservationRaw && number.status === 'reserved') {
          let reservationExpiresAt: Date;
          
          // Handle different date formats
          if (typeof reservationRaw?.toDate === 'function') {
            // Firestore Timestamp
            reservationExpiresAt = reservationRaw.toDate();
          } else if (reservationRaw instanceof Date) {
            // Already a Date object
            reservationExpiresAt = reservationRaw;
          } else if (typeof reservationRaw === 'string') {
            // ISO string
            reservationExpiresAt = new Date(reservationRaw);
          } else if (typeof reservationRaw === 'number') {
            // Unix timestamp
            reservationExpiresAt = new Date(reservationRaw);
          } else {
            // Try to parse as date
            reservationExpiresAt = new Date(reservationRaw);
          }
          
          if (reservationExpiresAt && !Number.isNaN(reservationExpiresAt.getTime())) {
            const timeLeft = Math.max(0, reservationExpiresAt.getTime() - now);
            if (timeLeft > 0) {
              newReservationCountdowns[number.id] = timeLeft;
            }
          }
        }
      });

      setClaimCountdowns(newClaimCountdowns);
      setReservationCountdowns(newReservationCountdowns);
    }, 1000);

    return () => clearInterval(interval);
  }, [numbers, reservedNumbers, searchResults]);

  // Trigger expiry when countdown reaches 0
  useEffect(() => {
    const triggerExpiredReservations = async () => {
      const now = Date.now();
      const expiredNumbers = reservedNumbers.filter(number => {
        const expiresAt = number.expiresAt;
        if (!expiresAt) return false;
        const expiryTime = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
        return expiryTime <= now;
      });

      if (expiredNumbers.length > 0) {
        console.log(`Found ${expiredNumbers.length} expired reservations, triggering release...`);
        
        // Import Firebase functions
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const functions = getFunctions();
        const triggerExpiry = httpsCallable(functions, 'triggerReservationExpiry');

        // Trigger expiry for each expired number
        for (const number of expiredNumbers) {
          try {
            console.log(`Triggering expiry for number ${number.id}`);
            await triggerExpiry({ numberId: number.id });
          } catch (error) {
            console.error(`Failed to trigger expiry for number ${number.id}:`, error);
          }
        }
      }
    };

    // Check for expired reservations every 5 seconds
    const interval = setInterval(triggerExpiredReservations, 5000);
    
    return () => clearInterval(interval);
  }, [reservedNumbers]);

  useEffect(() => {
    if (numberIdFromUrl && numbers.length > 0) {
      const number = numbers.find(n => n.id === numberIdFromUrl);
      if (number) {
        setSelectedNumberForChat(number);
        setShowChat(true);
      }
    }
  }, [numberIdFromUrl, numbers]);

  // Add useEffect to check coordinator status and fetch status checks
  useEffect(() => {
    const checkCoordinatorStatus = async () => {
      if (!user?.id) return;
      
      const userDoc = await getDoc(doc(db, 'users', user.id));
      if (userDoc.exists()) {
        setIsCoordinator(userDoc.data().role === 'coordinator');
      }
    };

    checkCoordinatorStatus();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    // Get all status checks
    const q = query(
      collection(db, 'statusChecks'),
      orderBy('requestedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const checks = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          numberId: data.numberId,
          number: data.number,
          requestedBy: data.requestedBy,
          requestedAt: data.requestedAt?.toDate(),
          status: data.status,
          respondedAt: data.respondedAt?.toDate(),
          respondedBy: data.respondedBy,
          expiresAt: data.expiresAt?.toDate()
        };
      }) as StatusCheck[];
      setStatusChecks(checks);
    });

    return () => {
      unsubscribe();
    };
  }, [user?.id]);

  useEffect(() => {
    async function fetchAgentLeadNumbers() {
      if (!user?.id) return;
      const leadsQuery = query(
        collection(db, 'leads'),
        where('agentId', '==', user.id)
      );
      const leadsSnapshot = await getDocs(leadsQuery);
      const numberIds = new Set<string>();
      leadsSnapshot.forEach(doc => {
        const data = doc.data();
        if (Array.isArray(data.plans)) {
          data.plans.forEach((plan: any) => {
            if (plan.numberId) numberIds.add(plan.numberId);
          });
        }
      });
      setAgentLeadNumberIds(numberIds);
    }
    fetchAgentLeadNumbers();
  }, [user?.id]);

  const handleSort = (field: SortField) => {
    setSortConfig(current => ({
      field,
      direction: current.field === field && current.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleNumberSelect = (number: NumberPoolType) => {
    if (onNumberSelect) {
      onNumberSelect(number);
      setShowPool(false);
    }
  };

  const [orderedNumbers, setOrderedNumbers] = useState<NumberPoolType[]>([]);

  const passesFilter = useCallback((number: NumberPoolType) => {
    // Filter out activated numbers for non-admin and non-coordinator users
    if (!isAdmin() && user?.role !== 'coordinator') {
      if (number.status === 'activated') return false;
    }

    // Category filter
    if (selectedCategory && number.category !== selectedCategory) return false;

    // Team visibility for agents
    if (user?.role === 'agent' && user.teamId) {
      if (number.teamVisibility && number.teamVisibility !== user.teamId) return false;
    }

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matches =
        number.number.toLowerCase().includes(searchLower) ||
        number.category.toLowerCase().includes(searchLower) ||
        number.code.toLowerCase().includes(searchLower);
      if (!matches) return false;
    }

    return true;
  }, [isAdmin, user?.role, user?.teamId, selectedCategory, searchTerm]);

  const computeSorted = useCallback((list: NumberPoolType[]) => {
    const result = [...list];
    const direction = sortConfig.direction === 'asc' ? 1 : -1;
    
    result.sort((a, b) => {
      if (sortConfig.field === 'number') {
        return a.number.localeCompare(b.number) * direction;
      }
      if (sortConfig.field === 'category') {
        return a.category.localeCompare(b.category) * direction;
      }
      if (sortConfig.field === 'code') {
        return a.code.localeCompare(b.code) * direction;
      }
      if (sortConfig.field === 'group') {
        const groupA = a.group || '';
        const groupB = b.group || '';
        return groupA.localeCompare(groupB) * direction;
      }
      if (sortConfig.field === 'passcode') {
        const passcodeA = a.passcode || '';
        const passcodeB = b.passcode || '';
        return passcodeA.localeCompare(passcodeB) * direction;
      }
      if (sortConfig.field === 'status') {
        return a.status.localeCompare(b.status) * direction;
      }
      if (sortConfig.field === 'reservationCount') {
        const countA = a.reservationCount || 0;
        const countB = b.reservationCount || 0;
        return (countA - countB) * direction;
      }
      return 0;
    });
    
    return result;
  }, [sortConfig]);

  // Recompute full order only when sort or filters change
  useEffect(() => {
    const filtered = numbers.filter(passesFilter);
    setOrderedNumbers(computeSorted(filtered));
  }, [passesFilter, computeSorted]);

  // On incremental updates, keep order stable: retain existing order, update items, append new
  useEffect(() => {
    if (orderedNumbers.length === 0) {
      // Initial population when numbers arrive
      const filtered = numbers.filter(passesFilter);
      setOrderedNumbers(prev => (prev.length === 0 ? computeSorted(filtered) : prev));
      return;
    }

    const byId = new Map(numbers.map(n => [n.id, n]));
    const next: NumberPoolType[] = [];
    const seen = new Set<string>();

    // Keep existing order for items that still exist and pass filters
    for (const item of orderedNumbers) {
      const fresh = byId.get(item.id);
      if (fresh && passesFilter(fresh)) {
        next.push(fresh);
        seen.add(fresh.id);
      }
    }

    // Append any new items that pass filters
    for (const n of numbers) {
      if (!seen.has(n.id) && passesFilter(n)) {
        next.push(n);
        seen.add(n.id);
      }
    }

    setOrderedNumbers(next);
  }, [numbers]);

  // Get display numbers (search results take precedence; do not fallback to page while searching)
  const displayNumbers = useMemo(() => {
    if (debouncedSearchTerm.trim()) {
      return searchResults; // can be empty to show "no results"
    }
    // If we have search results but no search term, clear them
    if (searchResults.length > 0 && !debouncedSearchTerm.trim()) {
      setSearchResults([]);
      return orderedNumbers; // Use orderedNumbers instead of numbers
    }
    return orderedNumbers; // Use orderedNumbers instead of numbers
  }, [debouncedSearchTerm, searchResults, orderedNumbers]);

  // Use displayNumbers instead of paginatedNumbers for the new pagination system
  const paginatedNumbers = displayNumbers;

  async function handleReserve(number: NumberPoolType) {
    // Enforce cap using global reservedNumbers (listener-backed, not page-limited)
    if (reservedNumbers.length >= MAX_RESERVATIONS) {
      setShowReserveLimitDialog(true);
      return;
    }

    setCheckingReserveId(number.id);

    // Pre-check on server data (outside transaction) to avoid transaction query limitations
    if (user?.id) {
      try {
        const capCheckQuery = query(
          collection(db, 'numberPool'),
          where('reservedBy', '==', user.id),
          where('status', '==', 'reserved'),
          limit(MAX_RESERVATIONS)
        );
        const capSnap = await getDocs(capCheckQuery);
        if (capSnap.size >= MAX_RESERVATIONS) {
          setCheckingReserveId(null);
          setShowReserveLimitDialog(true);
          return;
        }
      } catch (_err) {
        // If the pre-check query fails (e.g., missing index), do not block reservation
      }
    }

    // Check number status with ETI API before showing reserve dialog
    try {
      toast.loading('Checking number status...', { id: 'number-check' });
      const { NumberCheckService } = await import('../../services/numberCheckService');
      const canReserve = await NumberCheckService.canReserveNumber(number.number);
      toast.dismiss('number-check');
      
      if (!canReserve) {
        // Show dialog instead of toast
        setActiveNumberInfo({
          number: number.number,
          etiStatus: 200, // ETI API returned 200 for active numbers
          message: 'Number is active'
        });
        setShowNumberActiveDialog(true);
        setCheckingReserveId(null);
        return;
      }
    } catch (error: any) {
      console.error('Error checking number status:', error);
      toast.dismiss('number-check');
      toast.error('Failed to verify number status. Please try again.', {
        duration: 3000
      });
      setCheckingReserveId(null);
      return;
    }
    
    setCheckingReserveId(null);
    setNumberToReserve(number);
    setShowReserveDialog(true);
  }

  async function confirmReserve() {
    if (!numberToReserve || !user?.id) return;

    // Prevent multiple clicks during reservation
    if (reservingNumbers.has(numberToReserve.id)) {
      return;
    }

    try {
      // Show loading state
      setReservingNumbers(prev => new Set(prev).add(numberToReserve.id));
      setShowReserveDialog(false);

      // ETI API check is now handled in handleReserve function
      
      // Use Firestore transaction to prevent race conditions
      const result = await runTransaction(db, async (transaction) => {
        const numberRef = doc(db, 'numberPool', numberToReserve.id);
        const numberDoc = await transaction.get(numberRef);
        
        if (!numberDoc.exists()) {
          throw new Error('Number not found');
        }
        
        const numberData = numberDoc.data();
        
        // Check if number is still available for reservation
        if (numberData.status !== 'open') {
          throw new Error('Number is no longer available for reservation');
        }
        
        // Check if another agent has already reserved it
        if (numberData.reservedBy) {
          throw new Error('Number has already been reserved by another agent');
        }
        
        // Cap was already checked before the transaction
        
        // Prepare the update data for Firestore
        const firestoreUpdateData = {
          status: 'reserved' as NumberStatus,
          reservedBy: user.id,
          reservedAt: serverTimestamp(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
          lastStatusChange: serverTimestamp(),
          reservationCount: (numberData.reservationCount || 0) + 1
        };
        
        // Update the document in the transaction
        transaction.update(numberRef, firestoreUpdateData);
        
        // Prepare data for local state (with Date objects)
        const localUpdateData = {
          status: 'reserved' as NumberStatus,
          reservedBy: user.id,
          reservedAt: new Date(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
          lastStatusChange: new Date(),
          reservationCount: (numberData.reservationCount || 0) + 1
        };
        
        return {
          success: true,
          updateData: localUpdateData
        };
      });
      
      if (result.success) {
        // Update local state only after successful transaction
        const updatedNumber: NumberPoolType = {
          ...numberToReserve,
          ...result.updateData
        };

        setNumbers(prev => prev.map(n => 
          n.id === numberToReserve.id ? updatedNumber : n
        ));
        setReservedNumbers(prev => [...prev, updatedNumber]);
        setAllNumbersForReserved(prev => 
          prev.map(n => n.id === numberToReserve.id ? updatedNumber : n)
        );
        
        // Log the reservation action
        await logNumberAction(
          numberToReserve.id,
          numberToReserve.number || '',
          'reserved',
          { status: 'open' },
          result.updateData,
          `Reserved number for 24 hours`
        );
        
        toast.success('Number reserved successfully');
      }
      
    } catch (error: any) {
      
      // Show appropriate error message
      if (error.message.includes('Number is no longer available')) {
        toast.error('This number is no longer available for reservation');
      } else if (error.message.includes('already been reserved')) {
        toast.error('This number has already been reserved by another agent');
      } else if (error.message.includes('only reserve up to')) {
        toast.error(error.message);
      } else {
        toast.error('Failed to reserve number. Please try again.');
      }
      
      // Refresh the number data to get the latest status
      // This will be handled by the real-time listener
    } finally {
      // Cleanup loading state
      setReservingNumbers(prev => {
        const newSet = new Set(prev);
        newSet.delete(numberToReserve.id);
        return newSet;
      });
    }
  }

  async function handleRelease(number: NumberPoolType) {
    setSelectedNumber(number);
    setShowReleaseDialog(true);
  }

  function handleSetOpen(number: NumberPoolType) {
    if (!isCoordinator) return;
    
    setNumberToSetOpen(number);
    setShowSetOpenDialog(true);
  }

  async function confirmSetOpen() {
    if (!numberToSetOpen) return;
    
    setIsSettingOpen(true);
    try {
      // Show loading state
      const numberRef = doc(db, 'numberPool', numberToSetOpen.id);
      
      // Get old data for logging
      const oldData = {
        status: numberToSetOpen.status,
        reservedBy: numberToSetOpen.reservedBy,
        reservedAt: numberToSetOpen.reservedAt,
        expiresAt: numberToSetOpen.expiresAt,
        claimingAgentId: numberToSetOpen.claimingAgentId,
        claimingStartedAt: numberToSetOpen.claimingStartedAt,
        claimingExpiresAt: numberToSetOpen.claimingExpiresAt,
        originalAgentId: numberToSetOpen.originalAgentId,
        originalReservedAt: numberToSetOpen.originalReservedAt,
        originalExpiresAt: numberToSetOpen.originalExpiresAt,
        claimQueue: numberToSetOpen.claimQueue,
        claimCount: numberToSetOpen.claimCount
      };
      
      // Update the number status to open
      await updateDoc(numberRef, {
        status: 'open' as NumberStatus,
        reservedBy: null,
        reservedAt: null,
        expiresAt: null,
        lastStatusChange: serverTimestamp(),
        claimingAgentId: null,
        claimingStartedAt: null,
        claimingExpiresAt: null,
        originalAgentId: null,
        originalReservedAt: null,
        originalExpiresAt: null,
        claimQueue: [],
        claimCount: 0
      });

      // Log the set open action
      await logNumberAction(
        numberToSetOpen.id,
        numberToSetOpen.number || '',
        'opened',
        oldData,
        { status: 'open' },
        `Set number to open (cleared all reservations and claims)`
      );

      // Update local state
      const updatedNumber: NumberPoolType = {
        ...numberToSetOpen,
        status: 'open' as NumberStatus,
        reservedBy: undefined,
        reservedAt: undefined,
        expiresAt: undefined,
        lastStatusChange: new Date(),
        claimingAgentId: undefined,
        claimingStartedAt: undefined,
        claimingExpiresAt: undefined,
        originalAgentId: undefined,
        originalReservedAt: undefined,
        originalExpiresAt: undefined,
        claimQueue: [],
        claimCount: 0
      };

      setNumbers(prev => prev.map(n => 
        n.id === numberToSetOpen.id ? updatedNumber : n
      ));

      // Remove from reserved numbers if it was there
      setReservedNumbers(prev => prev.filter(n => n.id !== numberToSetOpen.id));
      setAllNumbersForReserved(prev => 
        prev.map(n => n.id === numberToSetOpen.id ? updatedNumber : n)
      );

      toast.success('Number set to open successfully');
      
      // Close dialog and reset state
      setShowSetOpenDialog(false);
      setNumberToSetOpen(null);
    } catch (error) {
      toast.error('Failed to set number to open');
    } finally {
      setIsSettingOpen(false);
    }
  }

  async function confirmRelease() {
    if (!selectedNumber) return;

    try {
      // Update local state immediately
      const updatedNumber: NumberPoolType = {
        ...selectedNumber,
        status: 'open' as NumberStatus,
        reservedBy: undefined,
        reservedAt: undefined,
        expiresAt: undefined,
        lastStatusChange: new Date(),
        claimingAgentId: undefined,
        claimingStartedAt: undefined,
        claimingExpiresAt: undefined,
        originalAgentId: undefined,
        originalReservedAt: undefined,
        originalExpiresAt: undefined,
        claimQueue: [],
        claimCount: 0
      };

      // Update UI immediately
      setNumbers(prev => prev.map(n => 
        n.id === selectedNumber.id ? updatedNumber : n
      ));
      setReservedNumbers(prev => prev.filter(n => n.id !== selectedNumber.id));
      setAllNumbersForReserved(prev => 
        prev.map(n => n.id === selectedNumber.id ? updatedNumber : n)
      );
      setHasReservation(false);
      setShowReleaseDialog(false);
      toast.success('Number released successfully');

      // If there's a claiming agent, transfer ownership to them immediately
      if (selectedNumber.claimingAgentId) {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now

        // Get the next claim from the queue
        const claimQueue = selectedNumber.claimQueue || [];
        const nextClaim = claimQueue.find((claim: { agentId: string; claimedAt: Date }) => claim.agentId !== selectedNumber.claimingAgentId);

        // Update local state for the claiming agent
        const claimedNumber: NumberPoolType = {
          ...selectedNumber,
          status: 'reserved',
          reservedBy: selectedNumber.claimingAgentId,
          reservedAt: now,
          expiresAt: expiresAt,
          lastStatusChange: now,
          // Update claiming agent information if there's a next claim
          claimingAgentId: nextClaim ? nextClaim.agentId : undefined,
          claimingStartedAt: nextClaim ? now : undefined,
          claimingExpiresAt: nextClaim ? new Date(now.getTime() + CLAIM_TIMEOUT) : undefined,
          // Clear original agent information
          originalAgentId: undefined,
          originalReservedAt: undefined,
          originalExpiresAt: undefined,
          // Update claim queue
          claimQueue: nextClaim ? claimQueue.filter(claim => claim.agentId !== selectedNumber.claimingAgentId) : []
        };

        setNumbers(prev => prev.map(n => 
          n.id === selectedNumber.id ? claimedNumber : n
        ));

        if (claimTimer) {
        clearTimeout(claimTimer);
      }

        // Update backend asynchronously
        const numberRef = doc(db, 'numberPool', selectedNumber.id);
        
        // Get old data for logging
        const oldData = {
          status: selectedNumber.status,
          reservedBy: selectedNumber.reservedBy,
          claimingAgentId: selectedNumber.claimingAgentId,
          claimQueue: selectedNumber.claimQueue
        };
        
        await updateDoc(numberRef, {
          status: 'reserved',
          reservedBy: selectedNumber.claimingAgentId,
          reservedAt: serverTimestamp(),
          expiresAt: expiresAt,
          lastStatusChange: serverTimestamp(),
          // Update claiming agent information if there's a next claim
          claimingAgentId: nextClaim ? nextClaim.agentId : null,
          claimingStartedAt: nextClaim ? serverTimestamp() : null,
          claimingExpiresAt: nextClaim ? new Date(now.getTime() + CLAIM_TIMEOUT) : null,
          // Clear original agent information
          originalAgentId: null,
          originalReservedAt: null,
          originalExpiresAt: null,
          // Update claim queue
          claimQueue: nextClaim ? claimQueue.filter(claim => claim.agentId !== selectedNumber.claimingAgentId) : []
        });

        // Log the release and transfer action
        const claimingAgentName = selectedNumber.claimingAgentId 
          ? await resolveUserName(selectedNumber.claimingAgentId) 
          : 'Unknown User';

        await logNumberAction(
          selectedNumber.id,
          selectedNumber.number || '',
          'released',
          oldData,
          { 
            status: 'reserved', 
            reservedBy: selectedNumber.claimingAgentId,
            claimingAgentId: nextClaim ? nextClaim.agentId : null
          },
          `Released number and transferred to claiming agent: ${claimingAgentName}`
        );

        // Send notification to the claiming agent
        await addDoc(collection(db, 'notifications'), {
          userId: selectedNumber.claimingAgentId,
          type: 'number_claimed',
          title: 'Number Claim Completed',
          message: `The number has been released by the original agent and is now reserved for you.`,
          read: false,
          createdAt: serverTimestamp(),
          numberId: selectedNumber.id
        });

        // If there's a next claim, start real-time timer
        if (nextClaim) {
          // Start timer to trigger real-time claim expiry when time expires
          const timer = setTimeout(() => {
            handleClaimTimeout({
              ...selectedNumber,
              claimingAgentId: nextClaim.agentId,
              claimingStartedAt: now,
              claimingExpiresAt: new Date(now.getTime() + CLAIM_TIMEOUT)
            });
          }, CLAIM_TIMEOUT);

          setClaimTimer(timer);

          // Send notification to the next claiming agent
          await addDoc(collection(db, 'notifications'), {
            userId: nextClaim.agentId,
            type: 'number_claimed',
            title: 'Number Claim Started',
            message: `The number is now available for your claim. You have ${CLAIM_TIMEOUT / 60000} minutes to take ownership.`,
            read: false,
            createdAt: serverTimestamp(),
            numberId: selectedNumber.id
          });
        }
      } else {
        // Regular release without any claims
        const numberRef = doc(db, 'numberPool', selectedNumber.id);
        
        // Get old data for logging
        const oldData = {
          status: selectedNumber.status,
          reservedBy: selectedNumber.reservedBy,
          reservedAt: selectedNumber.reservedAt,
          expiresAt: selectedNumber.expiresAt,
          claimingAgentId: selectedNumber.claimingAgentId,
          claimQueue: selectedNumber.claimQueue
        };
        
        await updateDoc(numberRef, {
          status: 'open',
          reservedBy: null,
          reservedAt: null,
          expiresAt: null,
          lastStatusChange: serverTimestamp(),
          claimingAgentId: null,
          claimingStartedAt: null,
          claimingExpiresAt: null,
          originalAgentId: null,
          originalReservedAt: null,
          originalExpiresAt: null,
          claimQueue: [],
          claimCount: 0
        });

        // Log the regular release action
        await logNumberAction(
          selectedNumber.id,
          selectedNumber.number || '',
          'released',
          oldData,
          { status: 'open' },
          `Released number (no claiming agent)`
        );
      }
    } catch (error) {
      // Revert local state if backend update fails
      setNumbers(prev => prev.map(n => 
        n.id === selectedNumber.id ? selectedNumber : n
      ));
      setReservedNumbers(prev => [...prev, selectedNumber]);
      setAllNumbersForReserved(prev => 
        prev.map(n => n.id === selectedNumber.id ? selectedNumber : n)
      );
      setHasReservation(true);
      toast.error('Failed to release number');
    }
  }

  const handleBulkDelete = async () => {
    if (!isAdmin()) {
      toast.error('Only administrators can delete numbers');
      return;
    }

    if (selectedNumbers.length === 0) {
      toast.error('Please select numbers to delete');
      return;
    }

    if (selectedNumbers.length > 10000) {
      toast.error('Cannot delete more than 10000 numbers at once');
      return;
    }

    setShowDeleteDialog(true);
  };

  const confirmBulkDelete = async () => {
    try {
      setIsDeleting(true);
      let batch = writeBatch(db);
      
      // Process numbers in chunks of 30 to comply with Firebase's IN operator limitation
      const chunkSize = 30;
      let totalDeleted = 0;
      
      for (let i = 0; i < selectedNumbers.length; i += chunkSize) {
        const chunk = selectedNumbers.slice(i, i + chunkSize);
        const numbersRef = collection(db, 'numberPool');
        const q = query(numbersRef, where('id', 'in', chunk));
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((doc) => {
          batch.delete(doc.ref);
        });
        
        // Commit the batch for this chunk
        await batch.commit();
        totalDeleted += querySnapshot.size;
        
        // Create a new batch for the next chunk
        batch = writeBatch(db);
      }
      
      toast.success(`Successfully deleted ${totalDeleted} numbers`);
      setSelectedNumbers([]);
      setShowDeleteDialog(false);
      setSelectAllMode(false);
    } catch (error) {
      toast.error('Failed to delete numbers');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSelectAll = () => {
    if (selectAllMode) {
      setSelectedNumbers([]);
      setSelectAllMode(false);
    } else {
      // Get all numbers that match current filters
      const filteredNumbers = orderedNumbers;
      if (filteredNumbers.length > 10000) {
        toast.error('Cannot select more than 10000 numbers at once');
        return;
      }
      setSelectedNumbers(filteredNumbers.map(n => n.id));
      setSelectAllMode(true);
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortConfig.field !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1" />;
    }
    return sortConfig.direction === 'asc' ? 
      <ArrowUp className="h-4 w-4 ml-1" /> : 
      <ArrowDown className="h-4 w-4 ml-1" />;
  };

  // ===============================================================================
  // EVENT HANDLERS AND OPERATIONS
  // ===============================================================================

  /**
   * Optimized claim function with debouncing and loading states
   * Handles number claiming with rate limiting and UI feedback
   */
  const handleClaim = useCallback(async (number: NumberPoolType) => {
    if (!user?.id) return;
    
    // Check if this number is already being claimed
    if (claimingNumbers.has(number.id)) {
      toast.error('Claim in progress, please wait');
      return;
    }
    
    // Check rate limiting
    const lastAttempt = lastClaimAttempts.get(number.id) || 0;
    const now = Date.now();
    if (now - lastAttempt < BUTTON_DEBOUNCE_DELAY) {
      return; // Silently ignore rapid clicks
    }
    
    setLastClaimAttempts(prev => new Map(prev.set(number.id, now)));
    setNumberToClaim(number);
    setShowClaimDialog(true);
  }, [user?.id, claimingNumbers, lastClaimAttempts]);

  const confirmClaim = async () => {
    if (!numberToClaim || !user?.id) return;

    // Prevent multiple simultaneous claims
    if (claimingNumbers.has(numberToClaim.id)) {
      return;
    }

    setClaimingNumbers(prev => new Set(prev.add(numberToClaim.id)));
    
    // Set timeout for operation
    const timeoutId = setTimeout(() => {
      setClaimingNumbers(prev => {
        const newSet = new Set(prev);
        newSet.delete(numberToClaim.id);
        return newSet;
      });
      toast.error('Claim operation timed out. Please try again.');
    }, CLAIM_OPERATION_TIMEOUT);

    setOperationTimeouts(prev => new Map(prev.set(numberToClaim.id, timeoutId)));

    try {
      // FIXED: Use simple updateDoc instead of complex transaction for better performance
        const numberRef = doc(db, 'numberPool', numberToClaim.id);
      
      // For numbers with specific statuses (STRIKE functionality)
      if (['pending_verification', 'assigned', 'verified', 'follow_up'].includes(numberToClaim.status)) {
        const now = new Date();
        
        // Get current number data first
        const numberDoc = await getDoc(numberRef);
        if (!numberDoc.exists()) {
          throw new Error('Number not found');
        }

        const numberData = numberDoc.data();
          const claims = numberData.claims || [];
          
          // Check if user already has a pending claim
          const existingClaim = claims.find((claim: any) => claim.userId === user.id && claim.status === 'pending');
          if (existingClaim) {
            throw new Error('You already have a pending claim for this number');
          }

        // Add new claim to the array - FIXED: Use direct array update
          const newClaim = {
            userId: user.id,
            claimedAt: now,
            status: 'pending'
          };

        const updatedClaims = [...claims, newClaim];

        // Update in Firebase - FIXED: Simple update instead of transaction
        await updateDoc(numberRef, {
            lastClaimedAt: now,
            claimedAt: now,
          claims: updatedClaims,  // FIXED: Direct array instead of arrayUnion
            claimCount: (numberData.claimCount || 0) + 1
          });

          // Log the strike action
          await logNumberAction(
            numberToClaim.id,
            numberToClaim.number || '',
            'claimed',
            { claims: claims, claimCount: numberData.claimCount || 0 },
            { claims: updatedClaims, claimCount: (numberData.claimCount || 0) + 1 },
            `Striked number (status: ${numberToClaim.status})`
          );

          // Update local state immediately for better UX
          setNumbers(prev => prev.map(n => 
            n.id === numberToClaim.id 
              ? {
                  ...n,
                  claimedAt: now,
                claims: updatedClaims,
                  claimCount: (n.claimCount || 0) + 1
                }
              : n
          ));

      } else {
        // CLAIM functionality for reserved numbers
        const numberDoc = await getDoc(numberRef);
        if (!numberDoc.exists()) {
          throw new Error('Number not found');
        }
        
        const numberData = numberDoc.data();
        
        if (numberData.status !== 'reserved') {
          throw new Error('This number is not available for claiming');
        }

        if (numberData.claimingAgentId === user.id) {
          throw new Error('You are already claiming this number');
        }

        // Check if user is already in the claim queue
        const claimQueue = numberData.claimQueue || [];
        const existingQueueClaim = claimQueue.find((claim: any) => claim.agentId === user.id);
        if (existingQueueClaim) {
          throw new Error('You are already in the claim queue for this number');
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + CLAIM_TIMEOUT);

        // Add user to claim queue
        const updatedClaimQueue = [...claimQueue, { agentId: user.id, claimedAt: now }];

        // Update in Firebase - FIXED: Simple update instead of transaction
        await updateDoc(numberRef, {
          claimingAgentId: numberData.claimingAgentId || user.id,
          claimingStartedAt: numberData.claimingAgentId ? numberData.claimingStartedAt : now,
          claimingExpiresAt: numberData.claimingAgentId ? numberData.claimingExpiresAt : expiresAt,
          claimQueue: updatedClaimQueue,
          claimCount: (numberData.claimCount || 0) + 1
        });

        // Log the claim action
        await logNumberAction(
          numberToClaim.id,
          numberToClaim.number || '',
          'claimed',
          { 
            claimQueue: claimQueue, 
            claimCount: numberData.claimCount || 0,
            claimingAgentId: numberData.claimingAgentId
          },
          { 
            claimQueue: updatedClaimQueue, 
            claimCount: (numberData.claimCount || 0) + 1,
            claimingAgentId: numberData.claimingAgentId || user.id
          },
          `Claimed reserved number (queue position: ${updatedClaimQueue.length})`
        );

        // Update local state immediately
        setNumbers(prev => prev.map(n => 
          n.id === numberToClaim.id 
            ? {
                ...n,
                claimingAgentId: n.claimingAgentId || user.id,
                claimingStartedAt: n.claimingAgentId ? n.claimingStartedAt : now,
                claimingExpiresAt: n.claimingAgentId ? n.claimingExpiresAt : expiresAt,
                claimQueue: updatedClaimQueue,
                claimCount: (n.claimCount || 0) + 1
              }
            : n
        ));

        // Send notification to the original owner asynchronously (outside transaction)
        if (numberData.reservedBy) {
          // FIXED: Use setTimeout to prevent blocking
          setTimeout(async () => {
            try {
              await addDoc(collection(db, 'notifications'), {
              userId: numberData.reservedBy,
              type: 'number_claimed',
              title: 'Number Claim Alert',
              message: `Number ${numberToClaim.number} has been claimed by another agent. You have ${CLAIM_TIMEOUT / 60000} minutes to respond.`,
              read: false,
              createdAt: serverTimestamp(),
              numberId: numberToClaim.id
            });
            } catch (error) {
            }
          }, 0);
        }
      }

      // Success - close dialog and show success message
      setShowClaimDialog(false);
      toast.success(['pending_verification', 'assigned', 'verified', 'follow_up'].includes(numberToClaim.status) 
        ? 'Number Striked successfully' 
        : 'Number claimed successfully');

    } catch (error: any) {
      
      // Revert local state if there's an error
      setNumbers(prev => prev.map(n => 
        n.id === numberToClaim.id ? numberToClaim : n
      ));
      
      toast.error(error.message || 'Failed to claim number');
    } finally {
      // Cleanup loading state and timeout
      setClaimingNumbers(prev => {
        const newSet = new Set(prev);
        newSet.delete(numberToClaim.id);
        return newSet;
      });
      
      const timeoutId = operationTimeouts.get(numberToClaim.id);
      if (timeoutId) {
        clearTimeout(timeoutId);
        setOperationTimeouts(prev => {
          const newMap = new Map(prev);
          newMap.delete(numberToClaim.id);
          return newMap;
        });
      }
    }
  };

    const handleClaimTimeout = async (number: NumberPoolType) => {
      try {
        // Trigger real-time claim expiry by updating the document
        const numberRef = doc(db, 'numberPool', number.id);
        
        // Update the document to trigger the real-time Cloud Function
        await updateDoc(numberRef, {
          claimExpiryTrigger: serverTimestamp(),
          // Add performance tracking
          clientTriggeredAt: new Date().toISOString(),
          triggerSource: 'client_timer'
        });
        
        console.log(`Claim timeout triggered for number ${number.id} - Real-time function will process immediately`);
        
        // Show user feedback
        toast.success('Claim expiry processed - number will transfer automatically');
      } catch (error) {
        console.error('Error triggering claim expiry:', error);
        toast.error('Failed to process claim timeout');
      }
    };

  // Add a new function to handle status changes
  const handleStatusChange = async (number: NumberPoolType, newStatus: NumberStatus) => {
    try {
      const numberRef = doc(db, 'numberPool', number.id);
      
      if (newStatus === 'open') {
        // If status is changing to open, check for pending claims
        const claimQueue = number.claimQueue || [];
        if (claimQueue.length > 0) {
          const nextClaim = claimQueue[0];
          const now = new Date();
          const newExpiresAt = new Date(now.getTime() + CLAIM_TIMEOUT);

          // Update the number to be reserved for the first person in queue
          const updateData = {
            status: 'reserved' as NumberStatus,
            reservedBy: nextClaim.agentId,
            reservedAt: serverTimestamp(),
            lastStatusChange: serverTimestamp(),
            // If there's a second claim in queue, set them as the claiming agent
            claimingAgentId: claimQueue.length > 1 ? claimQueue[1].agentId : null,
            claimingStartedAt: claimQueue.length > 1 ? serverTimestamp() : null,
            claimingExpiresAt: claimQueue.length > 1 ? newExpiresAt : null,
            claimQueue: claimQueue.slice(1) // Remove the first claim from queue
          };

          await updateDoc(numberRef, updateData);

          // If there's a second claim in queue, start real-time timer
          if (claimQueue.length > 1) {
            // Start timer to trigger real-time claim expiry when time expires
            const timer = setTimeout(() => {
              handleClaimTimeout({
                ...number,
                claimingAgentId: claimQueue[1].agentId,
                claimingStartedAt: now,
                claimingExpiresAt: newExpiresAt
              });
            }, CLAIM_TIMEOUT);

            setClaimTimer(timer);

            // Send notification to the second claiming agent
            await addDoc(collection(db, 'notifications'), {
              userId: claimQueue[1].agentId,
              type: 'number_claimed',
              title: 'Number Claim Started',
              message: `The number is now available for your claim. You have ${CLAIM_TIMEOUT / 60000} minutes to take ownership.`,
              read: false,
              createdAt: serverTimestamp(),
              numberId: number.id
            });
          }

          // Send notification to the first claiming agent
          await addDoc(collection(db, 'notifications'), {
            userId: nextClaim.agentId,
            type: 'number_claimed',
            title: 'Number Claim Completed',
            message: `The number has been reserved for you.`,
            read: false,
            createdAt: serverTimestamp(),
            numberId: number.id
          });
        } else {
          // No claims in queue, just update status
          await updateDoc(numberRef, {
            status: newStatus,
            lastStatusChange: serverTimestamp(),
            claimingAgentId: null,
            claimingStartedAt: null,
            claimingExpiresAt: null,
            claimQueue: []
          });
        }
      } else {
        // For any other status change, clear the claim queue and stop timers
        await updateDoc(numberRef, {
          status: newStatus,
          lastStatusChange: serverTimestamp(),
          claimingAgentId: null,
          claimingStartedAt: null,
          claimingExpiresAt: null,
          claimQueue: []
        });

        if (claimTimer) {
        clearTimeout(claimTimer);
      }
      }
    } catch (error) {
      toast.error('Failed to update number status');
    }
  };

  // Format countdown time
  const formatCountdown = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  };

  // Format reservation countdown time (shows hours and minutes)
  const formatReservationCountdown = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  // Optimized chat function with loading state
  const handleOpenChat = useCallback((number: NumberPoolType) => {
    // Check if chat is already being opened for this number
    if (chattingNumbers.has(number.id)) {
      return;
    }
    
    // Check rate limiting
    const lastAttempt = lastClaimAttempts.get(`chat_${number.id}`) || 0;
    const now = Date.now();
    if (now - lastAttempt < BUTTON_DEBOUNCE_DELAY) {
      return; // Silently ignore rapid clicks
    }
    
    setLastClaimAttempts(prev => new Map(prev.set(`chat_${number.id}`, now)));
    setChattingNumbers(prev => new Set(prev.add(number.id)));
    
    setSelectedNumberForChat(number);
    setShowChat(true);
    
    // Remove from chatting set after a short delay
    setTimeout(() => {
      setChattingNumbers(prev => {
        const newSet = new Set(prev);
        newSet.delete(number.id);
        return newSet;
      });
    }, 1000);
  }, [chattingNumbers, lastClaimAttempts]);

  // Add function to handle status check request
  const handleStatusCheck = async (number: NumberPoolType) => {
    if (!user?.id) return;

    try {
      // Create status check request
      const statusCheckRef = await addDoc(collection(db, 'statusChecks'), {
        numberId: number.id,
        number: number.number,
        requestedBy: user.id,
        requestedAt: serverTimestamp(),
        status: 'pending'
      });

      // Update local state immediately to show pending status
      setStatusChecks(prev => [...prev, {
        id: statusCheckRef.id,
        numberId: number.id,
        number: number.number,
        requestedBy: user.id,
        requestedAt: new Date(),
        status: 'pending'
      }]);

      // Send notification to coordinators
      const coordinatorsQuery = query(
        collection(db, 'users'),
        where('role', '==', 'coordinator')
      );
      const coordinatorsSnapshot = await getDocs(coordinatorsQuery);
      
      const notificationPromises = coordinatorsSnapshot.docs.map(doc => 
        addDoc(collection(db, 'notifications'), {
          userId: doc.id,
          type: 'status_check',
          title: 'New Status Check Request',
          message: `Agent ${user.email} has requested a status check for number ${number.number}`,
          read: false,
          createdAt: serverTimestamp(),
          numberId: number.id
        })
      );

      await Promise.all(notificationPromises);
      toast.success('Status check request sent to coordinator');
    } catch (error) {
      toast.error('Failed to request status check');
    }
  };

  // Add function to handle status response
  const handleStatusResponse = async (check: StatusCheck, status: 'available' | 'unavailable') => {
    if (!user?.id) return;

    try {
      const checkRef = doc(db, 'statusChecks', check.id);
      const updateData: any = {
        status,
        respondedAt: serverTimestamp(),
        respondedBy: user.id
      };

      // If marking as available, add 24-hour expiration
      if (status === 'available') {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); // Set expiration to 24 hours from now
        updateData.expiresAt = expiresAt;
      }

      await updateDoc(checkRef, updateData);

      // Send notification to the requesting agent
      await addDoc(collection(db, 'notifications'), {
        userId: check.requestedBy,
        type: 'status_check_response',
        title: 'Status Check Response',
        message: `Your status check for number ${check.number} has been marked as ${status}`,
        read: false,
        createdAt: serverTimestamp(),
        numberId: check.numberId
      });

      // Remove the check from the local state immediately
      setStatusChecks(prev => prev.filter(c => c.id !== check.id));

      toast.success('Status updated successfully');
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  // Update formatTimeRemaining function to handle undefined dates
  const formatTimeRemaining = (expiresAt?: Date) => {
    if (!expiresAt) return '00:00';
    
    const now = new Date();
    const diff = expiresAt.getTime() - now.getTime();
    
    if (diff <= 0) return '00:00';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  // Helper function to generate dynamic page numbers (OPTIMIZED)
  const generatePageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5; // Reduced from 7 to 5 for better performance
    
    if (displayPagination.totalPages <= maxVisiblePages) {
      // Show all pages if total pages is small
      for (let i = 1; i <= displayPagination.totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Smart pagination logic
      const leftOffset = Math.floor(maxVisiblePages / 2);
      const rightOffset = maxVisiblePages - leftOffset - 1;
      
      let startPage = Math.max(1, displayPagination.currentPage - leftOffset);
      let endPage = Math.min(displayPagination.totalPages, displayPagination.currentPage + rightOffset);
      
      // Adjust if we're near the beginning
      if (displayPagination.currentPage <= leftOffset) {
        endPage = Math.min(displayPagination.totalPages, maxVisiblePages);
      }
      
      // Adjust if we're near the end
      if (displayPagination.currentPage + rightOffset >= displayPagination.totalPages) {
        startPage = Math.max(1, displayPagination.totalPages - maxVisiblePages + 1);
      }
      
      // Add first page and ellipsis if needed
      if (startPage > 1) {
        pages.push(1);
        if (startPage > 2) {
          pages.push('...');
        }
      }
      
      // Add middle pages
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
      
      // Add ellipsis and last page if needed
      if (endPage < displayPagination.totalPages) {
        if (endPage < displayPagination.totalPages - 1) {
          pages.push('...');
        }
        pages.push(displayPagination.totalPages);
      }
    }
    
    return pages;
  };

  // Update the status check display in the table
  const renderStatusCheck = (number: NumberPoolType) => {
    const check = statusChecks.find(check => check.numberId === number.id);
    
    // Check if the status check has expired
    const isExpired = check?.status === 'available' && check?.expiresAt && check.expiresAt.getTime() <= Date.now();
    
    if (!check?.status || isExpired) {
      return (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => { setNumberForStatusCheck(number); setShowStatusCheckDialog(true); }}
          className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-600 rounded-lg hover:from-blue-100 hover:to-indigo-100 transition-all duration-200 group ring-1 ring-blue-100"
        >
          <CheckSquare className="h-4 w-4 mr-1.5" />
          Check Status
        </motion.button>
      );
    }

    return (
      <motion.span
        className={clsx(
          "inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium",
          check.status === 'available'
            ? "bg-green-100 text-green-700"
            : check.status === 'unavailable'
            ? "bg-red-100 text-red-700"
            : "bg-yellow-100 text-yellow-700"
        )}
      >
        {check.status === 'available' && (
          <>
            <CheckCircle2 className="h-4 w-4 mr-1.5" />
            <span>Available</span>
            {check.expiresAt && (
              <span className="ml-2 text-xs font-medium bg-green-200 px-2 py-0.5 rounded">
                {formatTimeRemaining(check.expiresAt)}
              </span>
            )}
          </>
        )}
        {check.status === 'unavailable' && (
          <>
            <XSquare className="h-4 w-4 mr-1.5" />
            <span>Unavailable</span>
          </>
        )}
        {check.status === 'pending' && (
          <>
            <Clock className="h-4 w-4 mr-1.5" />
            <span>Pending</span>
          </>
        )}
      </motion.span>
    );
  };

  // Add new function to handle changing status to open
  const handleChangeToOpen = async (number: NumberPoolType) => {
    if (!isAdmin()) return;

    try {
      const numberRef = doc(db, 'numberPool', number.id);
      const now = new Date();

      const updateData = {
        status: 'open' as NumberStatus,
        reservedBy: null,
        reservedAt: null,
        expiresAt: null,
        lastStatusChange: now,
        claimingAgentId: null,
        claimingStartedAt: null,
        claimingExpiresAt: null,
        originalAgentId: null,
        originalReservedAt: null,
        originalExpiresAt: null
      };

      await updateDoc(numberRef, updateData);
      toast.success('Number status changed to open');
    } catch (error) {
      toast.error('Failed to change number status');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse mb-2"></div>
              <div className="h-4 w-64 bg-gray-200 rounded-lg animate-pulse"></div>
            </div>
          </div>

          {/* Search and Filters Skeleton */}
          <div className="mt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="h-10 bg-gray-200 rounded-lg animate-pulse"></div>
              <div className="h-10 bg-gray-200 rounded-lg animate-pulse"></div>
              <div className="h-10 bg-gray-200 rounded-lg animate-pulse"></div>
            </div>
          </div>
        </div>

        {/* Table Skeleton */}
        <div className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-6 py-4">
                    <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
                  </th>
                  <th className="px-6 py-4">
                    <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
                  </th>
                  <th className="px-6 py-4">
                    <div className="h-4 w-24 bg-gray-200 rounded animate-pulse"></div>
                  </th>
                  <th className="px-6 py-4">
                    <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
                  </th>
                  <th className="px-6 py-4">
                    <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
                  </th>
                  <th className="px-6 py-4">
                    <div className="h-4 w-16 bg-gray-200 rounded animate-pulse"></div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[...Array(5)].map((_, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4">
                      <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-32 bg-gray-200 rounded animate-pulse"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-6 w-24 bg-gray-200 rounded-full animate-pulse"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 w-20 bg-gray-200 rounded animate-pulse"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-6 w-28 bg-gray-200 rounded-full animate-pulse"></div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-8 w-20 bg-gray-200 rounded-lg animate-pulse"></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ===============================================================================
  // RENDER SECTION
  // ===============================================================================

  /**
   * Main component render - comprehensive number pool interface with all dialogs and tables
   */
  return showPool ? (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
                Number Pool
              </h1>
              <p className="mt-2 text-lg text-gray-600">
                Manage and reserve phone numbers for your leads
            </p>
            </div>
            {isAdmin() && (
              <div className="flex items-center gap-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSelectAll}
                  className="inline-flex items-center px-4 py-2 bg-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-300"
                >
                  <div className="flex items-center">
                    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-2 rounded-lg mr-3">
                      <Hash className="w-5 h-5 text-white" />
            </div>
                    <div>
                      <span className="block text-sm font-semibold text-gray-900">
                        {selectAllMode ? 'Deselect All' : 'Select All'}
                      </span>
          </div>
        </div>
                </motion.button>
                {selectedNumbers.length > 0 && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleBulkDelete}
                    className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300"
                  >
                    <div className="flex items-center">
                      <div className="bg-white/10 p-2 rounded-lg mr-3">
                        <Trash2 className="w-5 h-5 text-white" />
            </div>
                      <div>
                        <span className="block text-sm font-semibold text-white">
                          Delete Selected ({selectedNumbers.length})
                        </span>
          </div>
        </div>
                  </motion.button>
                )}
              </div>
            )}
            {isCoordinator && (
              <div className="flex items-center gap-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowAddDialog(true)}
                  className="inline-flex items-center px-4 py-2 bg-white rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 border border-gray-200"
                >
                  <div className="flex items-center">
                    <div className="bg-gradient-to-br from-emerald-500 to-green-600 p-2 rounded-lg mr-3">
                      <Hash className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <span className="block text-sm font-semibold text-gray-900">Add Number</span>
                    </div>
                  </div>
                </motion.button>
              </div>
            )}
            </div>
          </motion.div>

          {/* Reserved Numbers Section */}
          {reservedNumbers.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-6 mb-12"
            >
              <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
                <div className="px-8 py-6 bg-gradient-to-r from-indigo-500 to-purple-600">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-bold text-white">Your Reserved Numbers</h3>
                      <p className="mt-1 text-indigo-100 text-sm">Numbers currently reserved by you</p>
            </div>
                    <div className="p-2 bg-white/10 rounded-lg">
                      <Hash className="h-6 w-6 text-white" />
          </div>
        </div>
              </div>
                <div className="p-6">
                <div className="space-y-4">
                    {reservedNumbers.map((number, index) => (
                      <motion.div
                        key={number.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.1 }}
                      className="bg-white rounded-lg p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-300 border border-gray-100 w-full"
                      >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center space-x-3 sm:space-x-4">
                          <div className="h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0 rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center ring-2 ring-white shadow-sm">
                            <Hash className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-600" />
            </div>
          <div>
                            <h4 className="text-base sm:text-base font-semibold text-gray-900">{number.number}</h4>
                            <span className="text-xs sm:text-sm text-gray-500">{number.category}</span>
                      </div>
                          </div>

                        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                          <div className="flex items-center space-x-2 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg px-3 py-2">
                            <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
                            <div>
                              <p className="text-xs text-indigo-600 font-medium">Reserve Count</p>
                              <p className="text-sm sm:text-base font-semibold text-indigo-700">
                                {number.reservationCount || 0}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center space-x-2 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg px-3 py-2">
                            <UserCheck className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
                            <div>
                              <p className="text-xs text-purple-600 font-medium">Claims in Queue</p>
                              <p className="text-sm sm:text-base font-semibold text-purple-700">
                                {number.claimQueue?.length || 0}
                              </p>
                            </div>
                          </div>

                          {reservationCountdowns[number.id] && (
                            <div className="flex items-center space-x-2 bg-gradient-to-br from-green-50 to-green-100 rounded-lg px-3 py-2">
                              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                              <div>
                                <p className="text-xs text-green-600 font-medium">Expires In</p>
                                <p className="text-sm sm:text-base font-semibold text-green-700">
                                  {formatReservationCountdown(reservationCountdowns[number.id])}
                                </p>
                              </div>
                            </div>
                          )}

                          {number.claimingAgentId && claimCountdowns[number.id] && (
                            <div className="flex items-center space-x-2 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg px-3 py-2">
                              <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                              <div>
                                <p className="text-xs text-blue-600 font-medium">Claim Timer</p>
                                <p className="text-sm sm:text-base font-semibold text-blue-700">
                                  {formatCountdown(claimCountdowns[number.id])}
                                </p>
                              </div>
                            </div>
                          )}

                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        onClick={() => handleRelease(number)}
                            className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 bg-gradient-to-r from-red-50 to-red-100 text-red-600 rounded-lg hover:from-red-100 hover:to-red-200 transition-all duration-200 group ring-1 ring-red-100"
                      >
                            <XCircle className="h-4 w-4 mr-1.5" />
                        Release
                          </motion.button>
                        </div>
                    </div>
                      </motion.div>
                  ))}
                </div>
              </div>
          </div>
            </motion.div>
          )}

        {/* Search and Filters */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-10"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Search Input */}
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400 group-hover:text-indigo-500 transition-colors" />
              </div>
              <input
                type="text"
                placeholder="Search numbers or codes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-12 pr-20 py-3.5 w-full rounded-lg border border-gray-200 bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all hover:border-indigo-200"
              />
              {isSearching && (
                <div className="absolute inset-y-0 right-12 pr-4 flex items-center">
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                </div>
              )}
              {/* Manual Refresh Button */}
              <button
                onClick={() => numberPoolManager.manualRefresh()}
                className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-indigo-500 transition-colors"
                title="Refresh data (real-time updates active)"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              {debouncedSearchTerm.trim() && (
                <div className="mt-1 text-xs text-gray-500 pl-12">
                  {isSearching ? 'Searching…' : (
                    <>
                      Found {searchResults.length} result{searchResults.length === 1 ? '' : 's'}
                      {numberPoolManager.getPreSearchPage() > 1 && (
                        <span className="ml-2 text-blue-600">
                          (Will return to page {numberPoolManager.getPreSearchPage()})
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Category Filter */}
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Filter className="h-5 w-5 text-gray-400 group-hover:text-indigo-500 transition-colors" />
              </div>
              <select
                value={selectedCategory || ''}
                onChange={(e) => setSelectedCategory(e.target.value || null)}
                className="pl-12 pr-4 py-3.5 w-full rounded-lg border border-gray-200 bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all hover:border-indigo-200 appearance-none"
              >
                <option value="">All Categories</option>
                {CATEGORIES.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            {/* Page Size Selector */}
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Hash className="h-5 w-5 text-gray-400 group-hover:text-indigo-500 transition-colors" />
              </div>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value) as typeof PAGE_SIZES[number])}
                className="pl-12 pr-4 py-3.5 w-full rounded-lg border border-gray-200 bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all hover:border-indigo-200 appearance-none"
              >
                {PAGE_SIZES.map(size => (
                  <option key={size} value={size}>{size} per page</option>
                ))}
              </select>
            </div>
          </div>
        </motion.div>

        {/* Add Number Dialog */}
        <AnimatePresence>
          {showAddDialog && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: 'spring', duration: 0.5, bounce: 0.3 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-auto overflow-hidden border border-gray-100"
              >
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-6 py-4 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight">Add New Number</h2>
                      <p className="text-indigo-100 text-sm">Configure number settings and visibility options</p>
                    </div>
                    <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                      <Hash className="h-6 w-6" />
                    </div>
                  </div>
                </div>

                {/* Form Content */}
                <div className="px-6 py-4">
                  {/* Basic Information Card */}
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 mb-3 border border-gray-200/50">
                    <div className="flex items-center mb-3">
                      <div className="p-1.5 bg-indigo-100 rounded-md mr-2">
                        <Phone className="h-4 w-4 text-indigo-600" />
                      </div>
                      <h3 className="text-base font-semibold text-gray-900">Basic Information</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Phone Number Field */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-700 flex items-center">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-2"></span>
                          Phone Number
                          <span className="ml-2 text-xs text-gray-500 font-normal">(10 digits required)</span>
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={newPoolNumber}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, ''); // Only allow digits
                              if (value.length <= 10) { // Limit to 10 digits
                                setNewPoolNumber(value);
                                // Validate phone number
                                if (value.length > 0 && value.length !== 10) {
                                  setPhoneError('Phone number must be exactly 10 digits');
                                } else if (value.length === 10) {
                                  setPhoneError('');
                                } else {
                                  setPhoneError('');
                                }
                              }
                            }}
                            className={`w-full pl-3 pr-10 py-2.5 bg-white border-2 rounded-lg focus:ring-2 transition-all duration-200 text-gray-900 placeholder-gray-400 text-sm ${
                              phoneError
                                ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                                : 'border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/20'
                            }`}
                            placeholder="1234567890"
                            maxLength={10}
                          />
                          <div className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${
                            phoneError ? 'text-red-400' : 'text-gray-400'
                          }`}>
                            <Phone className="h-4 w-4" />
                          </div>
                        </div>
                        {/* Character counter */}
                        <div className="flex justify-between items-center text-xs">
                          <span className={`font-medium ${
                            newPoolNumber.length === 10 ? 'text-green-600' :
                            newPoolNumber.length > 10 ? 'text-red-600' : 'text-gray-500'
                          }`}>
                            {newPoolNumber.length}/10 digits
                          </span>
                          {newPoolNumber.length === 10 && (
                            <span className="text-green-600 flex items-center">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Valid
                            </span>
                          )}
                        </div>
                        {phoneError && (
                          <motion.p
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-xs text-red-600 flex items-center"
                          >
                            <AlertCircle className="h-3 w-3 mr-1" />
                            {phoneError}
                          </motion.p>
                        )}
                      </div>

                      {/* Category Field */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-700 flex items-center">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-2"></span>
                          Category
                        </label>
                        <div className="relative">
                          <select
                            value={newPoolCategory}
                            onChange={(e) => setNewPoolCategory((e.target as HTMLSelectElement).value)}
                            className="w-full pl-3 pr-10 py-2.5 bg-white border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200 text-gray-900 appearance-none text-sm"
                          >
                            <option value="" className="text-gray-400">Select a category</option>
                            {Array.from(CATEGORIES).map((c) => (
                              <option key={c as string} value={c as string} className="text-gray-900">
                                {c as string}
                              </option>
                            ))}
                          </select>
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none">
                            <ChevronDown className="h-4 w-4" />
                          </div>
                        </div>
                      </div>

                      {/* Code Field */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-700 flex items-center">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-2"></span>
                          Code
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={newPoolCode}
                            onChange={(e) => setNewPoolCode((e.target as HTMLInputElement).value)}
                            className="w-full pl-3 pr-10 py-2.5 bg-white border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200 text-gray-900 placeholder-gray-400 text-sm"
                            placeholder="Abc123"
                          />
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                            <Tag className="h-4 w-4" />
                          </div>
                        </div>
                        <p className="text-xs text-gray-600">
                          
                        </p>
                      </div>

                      {/* Group Field */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-700 flex items-center">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-2"></span>
                          Group
                        </label>
                        <div className="relative">
                          <select
                            value={newPoolGroup}
                            onChange={(e) => setNewPoolGroup(e.target.value)}
                            className="w-full pl-3 pr-10 py-2.5 bg-white border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200 text-gray-900 text-sm appearance-none cursor-pointer"
                          >
                            <option value="">Select a group</option>
                            <option value="G1">G1</option>
                            <option value="G2">G2</option>
                            <option value="G3">G3</option>
                            <option value="G4">G4</option>
                            <option value="G5">G5</option>
                          </select>
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none">
                            <ChevronDown className="h-4 w-4" />
                          </div>
                        </div>
                        <p className="text-xs text-gray-600">
                          Select a group from G1 to G5
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Security & Access Card */}
                  {(isAdmin() || isCoordinator) && (
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 mb-3 border border-blue-200/50">
                      <div className="flex items-center mb-3">
                        <div className="p-1.5 bg-blue-100 rounded-md mr-2">
                          <Shield className="h-4 w-4 text-blue-600" />
                        </div>
                        <h3 className="text-base font-semibold text-gray-900">Security & Access</h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Passcode Field */}
                        {(isAdmin() || isCoordinator) && (
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700 flex items-center">
                              <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-2"></span>
                              Passcode
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                value={newPoolPasscode}
                                onChange={(e) => setNewPoolPasscode((e.target as HTMLInputElement).value)}
                                className="w-full pl-3 pr-10 py-2.5 bg-white border-2 border-blue-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 text-gray-900 placeholder-gray-400 text-sm"
                                placeholder="Enter security passcode"
                              />
                              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-blue-400">
                                <Lock className="h-4 w-4" />
                              </div>
                            </div>
                            <p className="text-xs text-gray-600">
                              Enter security passcode
                            </p>
                          </div>
                        )}

                        {/* Team Visibility Field */}
                        {isCoordinator && (
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700 flex items-center">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2"></span>
                              Team Visibility
                              <span className="ml-2 text-xs text-gray-500 font-normal">(optional)</span>
                            </label>
                            <div className="relative">
                              <select
                                value={newPoolTeamVisibility}
                                onChange={(e) => setNewPoolTeamVisibility((e.target as HTMLSelectElement).value)}
                                className="w-full pl-3 pr-10 py-2.5 bg-white border-2 border-green-200 rounded-lg focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all duration-200 text-gray-900 appearance-none text-sm"
                              >
                                <option value="" className="text-gray-400">Visible to all teams</option>
                                {teams.map((team) => (
                                  <option key={team.id} value={team.id} className="text-gray-900">
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-400 pointer-events-none">
                                <ChevronDown className="h-4 w-4" />
                              </div>
                            </div>
                            <p className="text-xs text-gray-600">
                              Restrict this number to a specific team only
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-6 border-t border-gray-200">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setShowAddDialog(false);
                        // Reset form and clear errors
                        setNewPoolNumber('');
                        setNewPoolCategory('');
                        setNewPoolCode('');
                        setNewPoolGroup('');
                        setNewPoolPasscode('');
                        setNewPoolTeamVisibility('');
                        setPhoneError('');
                      }}
                      disabled={addingNumber}
                      className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: addingNumber ? 1 : 1.02 }}
                      whileTap={{ scale: addingNumber ? 1 : 0.98 }}
                      onClick={async () => {
                        if (addingNumber) return;
                        const num = newPoolNumber.trim();
                        const cat = newPoolCategory.trim();
                        const code = newPoolCode.trim();
                        const group = newPoolGroup.trim();

                        // Validate phone number
                        if (!num) {
                          toast.error('Phone number is required');
                          return;
                        }
                        if (num.length !== 10) {
                          toast.error('Phone number must be exactly 10 digits');
                          return;
                        }
                        if (!code) {
                          toast.error('Code is required');
                          return;
                        }
                        if (!group) {
                          toast.error('Group is required');
                          return;
                        }
                        if (!Array.from(CATEGORIES).includes(cat as any)) {
                          toast.error('Please select a valid category');
                          return;
                        }
                        // Validate passcode for admin/coordinator
                        if ((isAdmin() || isCoordinator) && !newPoolPasscode.trim()) {
                          toast.error('Passcode is required');
                          return;
                        }
                        const existingNumber = numbers.find(n => (n.number || '').trim() === num);
                        if (existingNumber) {
                          setDuplicateNumberData({
                            existingNumber: existingNumber.number || '',
                            newNumber: num
                          });
                          setShowDuplicateNumberDialog(true);
                          return;
                        }
                        try {
                          setAddingNumber(true);
                          const numberData: any = {
                            number: num,
                            category: cat,
                            code,
                            group: group.trim(),
                            status: 'open',
                            visibleToFreelancers: true, // Default to visible for single number additions
                            lastStatusChange: serverTimestamp(),
                            reservationCount: 0,
                            claimCount: 0
                          };

                          // Add passcode for admin/coordinator
                          if (isAdmin() || isCoordinator) {
                            numberData.passcode = newPoolPasscode.trim();
                          }
                          // Only add team visibility if it has a value
                          if (newPoolTeamVisibility.trim()) {
                            numberData.teamVisibility = newPoolTeamVisibility.trim();
                          }

                          const docRef = await addDoc(collection(db, 'numberPool'), numberData);
                          
                          // Log the number creation
                          await logNumberAction(
                            docRef.id,
                            num,
                            'created',
                            null,
                            numberData,
                            `Created new number with category: ${cat}, code: ${code}, group: ${group}`
                          );
                          
                          toast.success('Number added to pool successfully!');
                          setShowAddDialog(false);
                          setNewPoolNumber('');
                          setNewPoolCategory('');
                          setNewPoolCode('');
                          setNewPoolGroup('');
                          setNewPoolPasscode('');
                          setNewPoolTeamVisibility('');
                          setPhoneError('');
                        } catch (err) {
                          toast.error('Failed to add number');
                        } finally {
                          setAddingNumber(false);
                        }
                      }}
                      disabled={addingNumber}
                      className={clsx(
                        'px-4 py-2 text-sm font-semibold text-white rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed',
                        addingNumber
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 transform hover:scale-[1.02]'
                      )}
                    >
                      <div className="flex items-center justify-center">
                        {addingNumber ? (
                          <>
                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                            Adding Number...
                          </>
                        ) : (
                          <>
                            <Plus className="h-5 w-5 mr-2" />
                            Add Number
                          </>
                        )}
                      </div>
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Edit Number Dialog */}
        <AnimatePresence>
          {showEditDialog && editingNumber && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: 'spring', duration: 0.5, bounce: 0.3 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-auto overflow-hidden border border-gray-100"
              >
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 py-4 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight">Edit Number</h2>
                      <p className="text-blue-100 text-sm">Modify details and settings</p>
                    </div>
                    <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                      <Edit className="h-6 w-6" />
                    </div>
                  </div>
                </div>

                {/* Form Content */}
                <div className="px-6 py-4">
                  {/* Basic Information Card */}
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 mb-3 border border-gray-200/50">
                    <div className="flex items-center mb-3">
                      <div className="p-1.5 bg-indigo-100 rounded-md mr-2">
                        <Phone className="h-4 w-4 text-indigo-600" />
                      </div>
                      <h3 className="text-base font-semibold text-gray-900">Basic Information</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Number Field */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-700 flex items-center">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-2"></span>
                          Phone Number
                          <span className="ml-2 text-xs text-gray-500 font-normal">(10 digits required)</span>
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={editPoolNumber}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, ''); // Only allow digits
                              if (value.length <= 10) { // Limit to 10 digits
                                setEditPoolNumber(value);
                                // Validate phone number
                                if (value.length > 0 && value.length !== 10) {
                                  setEditPhoneError('Phone number must be exactly 10 digits');
                                } else if (value.length === 10) {
                                  setEditPhoneError('');
                                } else {
                                  setEditPhoneError('');
                                }
                              }
                            }}
                            className={`w-full pl-3 pr-10 py-2.5 bg-white border-2 rounded-lg focus:ring-2 transition-all duration-200 text-gray-900 placeholder-gray-400 text-sm ${
                              editPhoneError
                                ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                                : 'border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/20'
                            }`}
                            placeholder="1234567890"
                            maxLength={10}
                          />
                          <div className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${
                            editPhoneError ? 'text-red-400' : 'text-gray-400'
                          }`}>
                            <Phone className="h-4 w-4" />
                          </div>
                        </div>
                        {/* Character counter */}
                        <div className="flex justify-between items-center text-xs">
                          <span className={`font-medium ${
                            editPoolNumber.length === 10 ? 'text-green-600' :
                            editPoolNumber.length > 10 ? 'text-red-600' : 'text-gray-500'
                          }`}>
                            {editPoolNumber.length}/10 digits
                          </span>
                          {editPoolNumber.length === 10 && (
                            <span className="text-green-600 flex items-center">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Valid
                            </span>
                          )}
                        </div>
                        {editPhoneError && (
                          <motion.p
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-xs text-red-600 flex items-center mt-1"
                          >
                            <AlertCircle className="h-3 w-3 mr-1" />
                            {editPhoneError}
                          </motion.p>
                        )}
                      </div>

                      {/* Category Field */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-700 flex items-center">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-2"></span>
                          Category
                        </label>
                        <div className="relative">
                          <select
                            value={editPoolCategory}
                            onChange={(e) => setEditPoolCategory((e.target as HTMLSelectElement).value)}
                            className="w-full pl-3 pr-10 py-2.5 bg-white border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200 text-gray-900 appearance-none text-sm"
                          >
                            <option value="" className="text-gray-400">Select a category</option>
                            {Array.from(CATEGORIES).map((c) => (
                              <option key={c as string} value={c as string} className="text-gray-900">
                                {c as string}
                              </option>
                            ))}
                          </select>
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none">
                            <ChevronDown className="h-4 w-4" />
                          </div>
                        </div>
                      </div>

                      {/* Code Field */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-700 flex items-center">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-2"></span>
                          Code
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={editPoolCode}
                            onChange={(e) => setEditPoolCode((e.target as HTMLInputElement).value)}
                            className="w-full pl-3 pr-10 py-2.5 bg-white border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200 text-gray-900 placeholder-gray-400 text-sm"
                            placeholder="e.g., 050, 051"
                          />
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                            <Tag className="h-4 w-4" />
                          </div>
                        </div>
                      </div>

                      {/* Group Field */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-700 flex items-center">
                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-2"></span>
                          Group
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={editPoolGroup}
                            onChange={(e) => setEditPoolGroup((e.target as HTMLInputElement).value)}
                            className="w-full pl-3 pr-10 py-2.5 bg-white border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200 text-gray-900 placeholder-gray-400 text-sm"
                            placeholder="e.g., G1, G2, VIP"
                          />
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                            <Package className="h-4 w-4" />
                          </div>
                        </div>
                      </div>

                      {/* Status Field */}
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-700 flex items-center">
                          <span className="w-1.5 h-1.5 bg-purple-500 rounded-full mr-2"></span>
                          Status
                        </label>
                        <div className="relative">
                          <select
                            value={editPoolStatus}
                            onChange={(e) => setEditPoolStatus((e.target as HTMLSelectElement).value as NumberStatus)}
                            className="w-full pl-3 pr-10 py-2.5 bg-white border-2 border-purple-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all duration-200 text-gray-900 appearance-none text-sm"
                          >
                            <option value="open" className="text-gray-900">Open</option>
                            <option value="reserved" className="text-gray-900">Reserved</option>
                            <option value="pending_verification" className="text-gray-900">Pending Verification</option>
                            <option value="verified" className="text-gray-900">Verified</option>
                            <option value="rejected" className="text-gray-900">Rejected</option>
                            <option value="follow_verification" className="text-gray-900">Follow-up Verification</option>
                            <option value="activated" className="text-gray-900">Activated</option>
                          </select>
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-400 pointer-events-none">
                            <ChevronDown className="h-4 w-4" />
                          </div>
                        </div>
                        <p className="text-xs text-gray-600">
                          Set the current status of this number
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Security & Access Card */}
                  {(isAdmin() || isCoordinator) && (
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 mb-3 border border-blue-200/50">
                      <div className="flex items-center mb-3">
                        <div className="p-1.5 bg-blue-100 rounded-md mr-2">
                          <Shield className="h-4 w-4 text-blue-600" />
                        </div>
                        <h3 className="text-base font-semibold text-gray-900">Security & Access</h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Passcode Field */}
                        {(isAdmin() || isCoordinator) && (
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700 flex items-center">
                              <span className="w-1.5 h-1.5 bg-red-500 rounded-full mr-2"></span>
                              Passcode
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                value={editPoolPasscode}
                                onChange={(e) => setEditPoolPasscode((e.target as HTMLInputElement).value)}
                                className="w-full pl-3 pr-10 py-2.5 bg-white border-2 border-blue-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 text-gray-900 placeholder-gray-400 text-sm"
                                placeholder="Enter security passcode"
                              />
                              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-blue-400">
                                <Lock className="h-4 w-4" />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Team Visibility Field */}
                        {isCoordinator && (
                          <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700 flex items-center">
                              <span className="w-1.5 h-1.5 bg-green-500 rounded-full mr-2"></span>
                              Team Visibility
                              <span className="ml-2 text-xs text-gray-500 font-normal">(optional)</span>
                            </label>
                            <div className="relative">
                              <select
                                value={editPoolTeamVisibility}
                                onChange={(e) => setEditPoolTeamVisibility((e.target as HTMLSelectElement).value)}
                                className="w-full pl-3 pr-10 py-2.5 bg-white border-2 border-green-200 rounded-lg focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all duration-200 text-gray-900 appearance-none text-sm"
                              >
                                <option value="" className="text-gray-400">Visible to all teams</option>
                                {teams.map((team) => (
                                  <option key={team.id} value={team.id} className="text-gray-900">
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-green-400 pointer-events-none">
                                <ChevronDown className="h-4 w-4" />
                              </div>
                            </div>
                            <p className="text-xs text-gray-600">
                              Restrict this number to a specific team only
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-6 border-t border-gray-200">
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setShowEditDialog(false);
                        setEditingNumber(null);
                        // Reset form
                        setEditPoolNumber('');
                        setEditPoolCategory('');
                        setEditPoolCode('');
                        setEditPoolGroup('');
                        setEditPoolPasscode('');
                        setEditPoolTeamVisibility('');
                        setEditPoolStatus('open');
                        setEditPhoneError('');
                      }}
                      disabled={updatingNumber}
                      className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      type="button"
                      whileHover={{ scale: updatingNumber ? 1 : 1.02 }}
                      whileTap={{ scale: updatingNumber ? 1 : 0.98 }}
                      onClick={(e) => {
                       e.preventDefault();
                        e.stopPropagation();
                        handleUpdateNumber();
                      }}
                      disabled={updatingNumber}
                      style={{ pointerEvents: 'auto' }}
                      className={clsx(
                        'px-4 py-2 text-sm font-semibold text-white rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed',
                        updatingNumber
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transform hover:scale-[1.02]'
                      )}
                    >
                      <div className="flex items-center justify-center">
                        {updatingNumber ? (
                          <>
                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                            Updating...
                          </>
                        ) : (
                          <>
                            <Edit className="h-5 w-5 mr-2" />
                            Update Number
                          </>
                        )}
                      </div>
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Duplicate Number Dialog */}
        <AnimatePresence>
          {showDuplicateNumberDialog && duplicateNumberData && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: 'spring', duration: 0.5, bounce: 0.3 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto overflow-hidden border border-gray-100"
              >
                {/* Header */}
                <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-4 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight">Number Already Exists</h2>
                      <p className="text-red-100 text-sm">This number is already in use</p>
                    </div>
                    <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                      <AlertCircle className="h-6 w-6" />
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="px-6 py-6">
                  <div className="text-center">
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                      <AlertCircle className="h-6 w-6 text-red-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Duplicate Number Detected
                    </h3>
                    <p className="text-gray-600 mb-4">
                      The number you're trying to use is already assigned to another entry in the pool.
                    </p>
                    
                    <div className="bg-gray-50 rounded-lg p-4 mb-6">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">New Number:</span>
                        <span className="text-sm font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          {duplicateNumberData.newNumber}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-sm font-medium text-gray-700">Existing Number:</span>
                        <span className="text-sm font-mono bg-red-100 text-red-800 px-2 py-1 rounded">
                          {duplicateNumberData.existingNumber}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm text-gray-500 mb-6">
                      Please choose a different number or modify the existing entry instead.
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setShowDuplicateNumberDialog(false);
                        setDuplicateNumberData(null);
                      }}
                      className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      Close
                    </motion.button>
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setShowDuplicateNumberDialog(false);
                        setDuplicateNumberData(null);
                        // Focus on the phone number input to allow user to change it
                        setTimeout(() => {
                          const phoneInput = document.querySelector('input[placeholder="1234567890"]') as HTMLInputElement;
                          if (phoneInput) {
                            phoneInput.focus();
                            phoneInput.select();
                          }
                        }, 100);
                      }}
                      className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
                    >
                      Change Number
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      {/* Numbers Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100"
        >
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
                <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
                {isAdmin() && (
                  <th className="px-6 py-4 text-left">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 transition-colors"
                      checked={selectedNumbers.length === paginatedNumbers.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedNumbers(paginatedNumbers.map(n => n.id));
                        } else {
                          setSelectedNumbers([]);
                        }
                      }}
                    />
                  </th>
                )}
                <th 
                    className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600 transition-colors"
                  onClick={() => handleSort('number')}
                >
                  <div className="flex items-center">
                    Number
                    <SortIcon field="number" />
                  </div>
                </th>
                <th 
                    className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600 transition-colors"
                  onClick={() => handleSort('category')}
                >
                  <div className="flex items-center">
                    Category
                    <SortIcon field="category" />
                  </div>
                </th>
                <th 
                    className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600 transition-colors"
                  onClick={() => handleSort('code')}
                >
                  <div className="flex items-center">
                    Code
                    <SortIcon field="code" />
                  </div>
                </th>
                <th
                    className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600 transition-colors"
                  onClick={() => handleSort('group')}
                >
                  <div className="flex items-center">
                    Group
                    <SortIcon field="group" />
                  </div>
                </th>
                {(isAdmin() || isCoordinator) && (
                  <>
                    <th 
                      className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600 transition-colors"
                      onClick={() => handleSort('passcode')}
                    >
                      <div className="flex items-center">
                        Passcode
                        <SortIcon field="passcode" />
                      </div>
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Visibility
                    </th>
                  </>
                )}
                <th 
                    className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600 transition-colors"
                  onClick={() => handleSort('reservationCount')}
                >
                  <div className="flex items-center">
                    Status
                    <SortIcon field="reservationCount" />
                  </div>
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    Time Left
                  </div>
                </th>
                {(isAdmin() || isCoordinator) && (
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div className="flex items-center">
                      <UserCheck className="h-4 w-4 mr-1" />
                      Agent & Team
                    </div>
                  </th>
                )}
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {paginatedNumbers.map((number, index) => {
                const isBeingClaimed = number.status === 'reserved' && number.claimingAgentId;
                const getStatusStyle = (status: NumberStatus) => {
                  if (status === 'follow_verification') {
                      return STATUS_STYLES.reserved;
                  }
                  return STATUS_STYLES[status as keyof typeof STATUS_STYLES];
                };
                
                const statusStyle = getStatusStyle(number.status);
                const StatusIcon = statusStyle?.icon || CheckCircle2; 

  return (
    <motion.tr 
                      key={number.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="hover:bg-gray-50/50 transition-colors group"
    >
                    {isAdmin() && (
        <td className="px-6 py-4">
          <input
            type="checkbox"
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 transition-colors"
                          checked={selectedNumbers.includes(number.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedNumbers([...selectedNumbers, number.id]);
                            } else {
                              setSelectedNumbers(selectedNumbers.filter(id => id !== number.id));
                            }
                          }}
          />
        </td>
      )}
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          <div className="h-8 w-8 flex-shrink-0 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center ring-2 ring-white shadow-sm mr-3">
            <Hash className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="text-sm font-medium text-gray-900 group-hover:text-indigo-600 transition-colors">
            {number.number}
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <motion.span
          whileHover={{ scale: 1.05 }}
          className={clsx(
            "px-3 py-1 rounded-full text-xs font-medium inline-flex items-center shadow-sm",
            number.category === 'Platinum' ? 'bg-purple-100 text-purple-800' :
            number.category === 'Gold' ? 'bg-yellow-100 text-yellow-800' :
            number.category === 'Gold Plus' ? 'bg-amber-100 text-amber-800' :
            number.category === 'Silver Plus' ? 'bg-blue-200 text-blue-800' :
            number.category === 'Silver' ? 'bg-blue-100 text-blue-800' :
            'bg-gray-100 text-gray-800'
          )}
        >
          <Tag className="h-3 w-3 mr-1" />
          {number.category}
        </motion.span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-500">{number.code}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-500">{number.group || '-'}</div>
      </td>
                    {(isAdmin() || isCoordinator) && (
                      <>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">{number.passcode || '-'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-500">
                            {number.teamVisibility ?
                              (teams.find(team => team.id === number.teamVisibility)?.name || 'Unknown Team') :
                              'All Teams'
                            }
                          </div>
                        </td>
                      </>
                    )}
      <td className="px-6 py-4 whitespace-nowrap">
        <motion.span
          whileHover={{ scale: 1.05 }}
          className={clsx(
            "px-3 py-1 rounded-full text-xs font-medium inline-flex items-center shadow-sm ring-1 ring-opacity-5",
            number.status === 'reserved' ? STATUS_STYLES.reserved.bg : (statusStyle?.bg || STATUS_STYLES.open.bg),
            number.status === 'reserved' ? STATUS_STYLES.reserved.text : (statusStyle?.text || STATUS_STYLES.open.text),
            number.status === 'reserved' ? 'ring-indigo-200' : 'ring-gray-200'
          )}
        >
          <StatusIcon className="h-3 w-3 mr-1" />
          {number.status === 'reserved' ? "Reserved" : number.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        {number.claimingAgentId && claimCountdowns[number.id] && (
            <span className="ml-2 text-xs">
                            ({formatCountdown(claimCountdowns[number.id])})
            </span>
          )}
          <span className="ml-2 text-xs font-normal">
            (R: {number.reservationCount || 0})
          </span>
          <span className="ml-2 text-xs font-normal">
            (C: {number.claimQueue?.length || 0})
          </span>
        </motion.span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        {number.status === 'reserved' ? (
          (() => {
            // Try to get countdown from state first
            let timeLeft = reservationCountdowns[number.id];
            
            // If not in state, calculate directly from expiresAt
            if (!timeLeft && number.expiresAt) {
              const now = Date.now();
              let expiresAt: number;
              
              // Handle different date formats
              if (typeof number.expiresAt === 'object' && typeof (number.expiresAt as any)?.toDate === 'function') {
                expiresAt = (number.expiresAt as any).toDate().getTime();
              } else if (number.expiresAt instanceof Date) {
                expiresAt = number.expiresAt.getTime();
              } else if (typeof number.expiresAt === 'string') {
                expiresAt = new Date(number.expiresAt).getTime();
              } else {
                expiresAt = new Date(number.expiresAt as any).getTime();
              }
              
              if (!Number.isNaN(expiresAt)) {
                timeLeft = Math.max(0, expiresAt - now);
              }
            }
            
            return timeLeft && timeLeft > 0 ? (
              <div className="flex items-center">
                <div className="flex items-center space-x-2 bg-gradient-to-br from-green-50 to-green-100 rounded-lg px-3 py-2">
                  <Clock className="h-4 w-4 text-green-600" />
                  <div>
                    <p className="text-xs text-green-600 font-medium">Expires In</p>
                    <p className="text-sm font-semibold text-green-700">
                      {formatReservationCountdown(timeLeft)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-400">-</div>
            );
          })()
        ) : (
          <div className="text-sm text-gray-400">-</div>
        )}
      </td>
                    {(isAdmin() || isCoordinator) && (
        <td className="px-6 py-4 whitespace-nowrap">
          {number.status !== 'open' && (number.reservedBy || number.claimingAgentId || number.originalAgentId) ? (
            <AgentTeamInfo agentId={(number.reservedBy || number.claimingAgentId || number.originalAgentId) as string} />
          ) : (
            <div className="text-sm text-gray-400">-</div>
          )}
        </td>
      )}
      <td className="px-6 py-4 whitespace-nowrap text-right relative z-10">
        <div className="flex items-center justify-end space-x-3">
          {number.status === 'open' && (
            <motion.button
                              type="button"
                              whileHover={{ scale: reservingNumbers.has(number.id) ? 1 : 1.05 }}
                              whileTap={{ scale: reservingNumbers.has(number.id) ? 1 : 0.95 }}
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleReserve(number); }}
                              disabled={reservingNumbers.has(number.id) || checkingReserveId === number.id}
              className={clsx(
                "inline-flex items-center px-3 py-1.5 rounded-lg transition-all duration-200 group ring-1 relative z-20",
                reservingNumbers.has(number.id) || checkingReserveId === number.id
                  ? "bg-gray-100 text-gray-400 ring-gray-200 cursor-not-allowed"
                  : "bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-600 hover:from-indigo-100 hover:to-purple-100 ring-indigo-100"
              )}
            >
                              {reservingNumbers.has(number.id) || checkingReserveId === number.id ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Clock className="h-4 w-4 mr-1.5" />
              )}
                              {reservingNumbers.has(number.id) ? 'Reserving...' : checkingReserveId === number.id ? 'Checking...' : 'Reserve'}
            </motion.button>
          )}
          {(number.status === 'pending_verification' || 
            number.status === 'assigned' || 
            number.status === 'verified' || 
            number.status === 'follow_up') && 
                            number.reservedBy !== user?.id && 
                            !((number as any).claims || []).some((claim: any) => claim.userId === user?.id && claim.status === 'pending') &&
                            !agentLeadNumberIds.has(number.id) &&
                            (
            <motion.button
                              whileHover={{ scale: claimingNumbers.has(number.id) ? 1 : 1.05 }}
                              whileTap={{ scale: claimingNumbers.has(number.id) ? 1 : 0.95 }}
                              onClick={() => handleClaim(number)}
                              disabled={claimingNumbers.has(number.id)}
              className={clsx(
                "inline-flex items-center px-3 py-1.5 rounded-lg transition-all duration-200 group ring-1 relative z-20",
                                claimingNumbers.has(number.id)
                  ? "bg-gray-100 text-gray-400 ring-gray-200 cursor-not-allowed"
                  : "bg-gradient-to-r from-amber-50 to-orange-50 text-amber-600 hover:from-amber-100 hover:to-orange-100 ring-amber-100"
              )}
            >
                              {claimingNumbers.has(number.id) ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <AlertTriangle className="h-4 w-4 mr-1.5" />
              )}
                              {claimingNumbers.has(number.id) ? 'Striking...' : 'Strike'}
            </motion.button>
          )}
          {(number.status === 'pending_verification' || 
            number.status === 'assigned' || 
            number.status === 'verified' || 
            number.status === 'follow_up') && 
                            ((number as any).claims || []).some((claim: any) => claim.userId === user?.id && claim.status === 'pending') && (
            <motion.span
              className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-gray-50 to-gray-100 text-gray-600 rounded-lg ring-1 ring-gray-100 relative z-20"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Striked
            </motion.span>
          )}
          {number.status === 'reserved' && 
                           number.reservedBy !== user?.id && 
                           number.claimingAgentId !== user?.id && (
            <motion.button
                              whileHover={{ scale: claimingNumbers.has(number.id) ? 1 : 1.05 }}
                              whileTap={{ scale: claimingNumbers.has(number.id) ? 1 : 0.95 }}
                              onClick={() => handleClaim(number)}
              className={clsx(
                "inline-flex items-center px-3 py-1.5 rounded-lg transition-all duration-200 group ring-1 relative z-20",
                                claimingNumbers.has(number.id)
                  ? "bg-gray-100 text-gray-400 ring-gray-200 cursor-not-allowed"
                                  : number.claimQueue?.some((claim: any) => claim.agentId === user?.id)
                  ? "bg-gray-100 text-gray-600 ring-gray-200 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-600 hover:from-blue-100 hover:to-indigo-100 ring-blue-100"
              )}
                              disabled={claimingNumbers.has(number.id) || number.claimQueue?.some((claim: any) => claim.agentId === user?.id)}
            >
                              {claimingNumbers.has(number.id) ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-1.5" />
              )}
                              {claimingNumbers.has(number.id) 
                ? 'Claiming...' 
                                : number.claimQueue?.some((claim: any) => claim.agentId === user?.id) 
                ? 'Claimed' 
                : 'Claim'}
            </motion.button>
          )}
                          {number.status === 'reserved' && number.reservedBy === user?.id && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
                              onClick={() => handleRelease(number)}
              className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-red-50 to-red-100 text-red-600 rounded-lg hover:from-red-100 hover:to-red-200 transition-all duration-200 group ring-1 ring-red-100 relative z-20"
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              Release
            </motion.button>
          )}
          {/* Coordinator can set any number to open */}
                          {isCoordinator && number.status !== 'open' && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
                              onClick={() => handleSetOpen(number)}
              className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-green-50 to-emerald-100 text-emerald-600 rounded-lg hover:from-green-100 hover:to-emerald-200 transition-all duration-200 group ring-1 ring-emerald-100 relative z-20"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Set Open
            </motion.button>
          )}
                          {(isAdmin() || (number.claimingAgentId && (user?.id === number.claimingAgentId || user?.id === number.reservedBy))) && (
            <motion.button
                              whileHover={{ scale: chattingNumbers.has(number.id) ? 1 : 1.05 }}
                              whileTap={{ scale: chattingNumbers.has(number.id) ? 1 : 0.95 }}
                              onClick={() => handleOpenChat(number)}
                              disabled={chattingNumbers.has(number.id)}
              className={clsx(
                "inline-flex items-center px-3 py-1.5 rounded-lg transition-all duration-200 group ring-1 relative z-20",
                                chattingNumbers.has(number.id)
                  ? "bg-gray-100 text-gray-400 ring-gray-200 cursor-not-allowed"
                  : "bg-gradient-to-r from-green-50 to-emerald-50 text-green-600 hover:from-green-100 hover:to-emerald-100 ring-green-100"
              )}
            >
                              {chattingNumbers.has(number.id) ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <MessageSquare className="h-4 w-4 mr-1.5" />
              )}
                              {chattingNumbers.has(number.id) 
                ? 'Opening...' 
                                : isAdmin() ? 'View Chat' : 'Chat'}
            </motion.button>
          )}
          {(number.group?.includes('G4') || number.group?.includes('G5')) && 
           (number.status === 'open' || number.status === 'reserved') && (
            <>
                              {renderStatusCheck(number)}
            </>
          )}
                          {isAdmin() && number.status !== 'open' && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
                              onClick={() => handleChangeToOpen(number)}
              className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-emerald-50 to-green-50 text-emerald-600 rounded-lg hover:from-emerald-100 hover:to-green-100 transition-all duration-200 group ring-1 ring-emerald-100 relative z-20"
            >
              <CheckCircle2 className="h-4 w-4 mr-1.5" />
              Set Open
            </motion.button>
          )}
          {/* Edit button for coordinators and admins */}
                        {(isAdmin() || isCoordinator) && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => openEditModal(number)}
              className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 text-indigo-600 rounded-lg hover:from-blue-100 hover:to-indigo-100 transition-all duration-200 group ring-1 ring-indigo-100 relative z-20 ml-2"
              title="Edit Number"
            >
              <Edit className="h-4 w-4 mr-1.5" />
              Edit
            </motion.button>
          )}
        </div>
      </td>
    </motion.tr>
  );
              })}
            </tbody>
          </table>
        </div>

        {/* Enhanced Pagination with Firebase Integration - Mobile Optimized */}
          <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-700">
                {debouncedSearchTerm.trim() ? (
                  `Showing ${searchResults.length} search results`
                ) : (
                  `Page ${displayPagination.currentPage} of ${displayPagination.totalPages} (${displayPagination.totalItems} total)`
                )}
              </div>
              </div>
              
              {/* Enhanced Pagination Controls - Mobile Optimized */}
              <div className="w-full sm:w-auto">
                <div className="flex items-center space-x-1 overflow-x-auto scrollbar-hide pb-2 sm:pb-0 min-w-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
                {/* First Page Button */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => debouncedSearchTerm.trim() ? goToSearchPage(1) : goToPage(1)}
                  disabled={displayPagination.currentPage === 1 || loading}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-l-lg hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex-shrink-0"
                  title="First Page"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <ChevronLeft className="h-4 w-4 -ml-1" />
                </motion.button>

                {/* Previous Button */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={debouncedSearchTerm.trim() ? goToPreviousSearchPage : goToPreviousPage}
                  disabled={!displayPagination.hasPreviousPage || loading}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex-shrink-0"
                  title="Previous Page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </motion.button>

                {/* Dynamic Page Numbers */}
                {generatePageNumbers().map((page, index) => (
                  <motion.button
                    key={index}
                    whileHover={{ scale: page !== '...' ? 1.05 : 1 }}
                    whileTap={{ scale: page !== '...' ? 0.95 : 1 }}
                    onClick={() => typeof page === 'number' && (debouncedSearchTerm.trim() ? goToSearchPage(page) : goToPage(page))}
                    disabled={page === '...' || page === displayPagination.currentPage || loading}
                    className={`inline-flex items-center px-3 py-2 text-sm font-medium border transition-all duration-200 ${
                      page === displayPagination.currentPage
                        ? 'bg-indigo-600 text-white border-indigo-600 z-10 relative'
                        : page === '...'
                        ? 'bg-white text-gray-400 border-gray-300 cursor-default'
                        : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50 hover:text-gray-700'
                    }`}
                    title={page === '...' ? 'More pages' : `Page ${page}`}
                  >
                    {page}
                  </motion.button>
                ))}

                {/* Next Button */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={debouncedSearchTerm.trim() ? goToNextSearchPage : goToNextPage}
                  disabled={!displayPagination.hasNextPage || loading}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex-shrink-0"
                  title="Next Page"
                >
                  <ChevronRight className="h-4 w-4" />
                </motion.button>

                {/* Last Page Button */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => debouncedSearchTerm.trim() ? goToSearchPage(displayPagination.totalPages) : goToPage(displayPagination.totalPages)}
                  disabled={displayPagination.currentPage === displayPagination.totalPages || loading}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-r-lg hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  title="Last Page"
                >
                  <ChevronRight className="h-4 w-4" />
                  <ChevronRight className="h-4 w-4 -ml-1" />
                </motion.button>
                </div>
              </div>
            </div>
          </div>

        {/* Reserve Dialog */}
        {showReserveDialog && numberToReserve && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl transform transition-all">
              <div className="flex items-center justify-center mb-6">
                <div className="p-3 rounded-full bg-indigo-100">
                  <AlertCircle className="h-8 w-8 text-indigo-600" />
        </div>
        </div>
              <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">
                Reserve Number
              </h3>
              <p className="text-gray-500 text-center mb-6">
                Are you sure you want to reserve the number {numberToReserve.number}?
                <br />
                <span className="text-sm mt-2 block">
                  This number will be reserved for 24 hours.
                  <br />
                  You currently have {reservedNumbers.length} out of {MAX_RESERVATIONS} reservations.
                </span>
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowReserveDialog(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReserve}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Reserve
                </button>
      </div>
      </div>
    </div>
        )}

        {/* Number Active Dialog */}
        {showNumberActiveDialog && activeNumberInfo && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl transform transition-all">
              <div className="flex items-center justify-center mb-6">
                <div className="p-3 rounded-full bg-red-100">
                  <XCircle className="h-8 w-8 text-red-600" />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">
                Number Already Active
              </h3>
              <p className="text-gray-500 text-center mb-6">
                The number <span className="font-semibold text-gray-900">{activeNumberInfo.number}</span> is currently active and cannot be reserved.
              </p>
              <div className="flex justify-center">
                <button
                  onClick={() => {
                    setShowNumberActiveDialog(false);
                    setActiveNumberInfo(null);
                  }}
                  className="px-6 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Claim Dialog */}
        {showClaimDialog && numberToClaim && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl transform transition-all">
              <div className="flex items-center justify-center mb-6">
                <div className={clsx(
                  "p-3 rounded-full",
                  ['pending_verification', 'assigned', 'verified', 'follow_up'].includes(numberToClaim.status)
                    ? "bg-amber-100"
                    : "bg-blue-100"
                )}>
                  <AlertCircle className={clsx(
                    "h-8 w-8",
                    ['pending_verification', 'assigned', 'verified', 'follow_up'].includes(numberToClaim.status)
                      ? "text-amber-600"
                      : "text-blue-600"
                  )} />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">
                {['pending_verification', 'assigned', 'verified', 'follow_up'].includes(numberToClaim.status)
                  ? "Strike Number"
                  : "Claim Number"
                }
              </h3>
              <p className="text-gray-500 text-center mb-6">
                {['pending_verification', 'assigned', 'verified', 'follow_up'].includes(numberToClaim.status) ? (
                  <>
                    Are you sure you want to strike the number {numberToClaim.number}?
                    <br />
                    <span className="text-sm mt-2 block">
                      This will notify the current agent that you are interested in this number.
                      The agent will be notified of your strike.
            </span>
                  </>
                ) : (
                  <>
                    Are you sure you want to claim the number {numberToClaim.number}?
                    <br />
                    <span className="text-sm mt-2 block">
                      The number will remain reserved by the original agent for {CLAIM_TIMEOUT / 60000} minutes.
                      After that time, it will be automatically reserved for you.
                    </span>
        </>
      )}
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowClaimDialog(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmClaim}
                  disabled={claimingNumbers.has(numberToClaim.id)}
                  className={clsx(
                    "px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors flex items-center",
                    claimingNumbers.has(numberToClaim.id)
                      ? "bg-gray-400 cursor-not-allowed"
                      : ['pending_verification', 'assigned', 'verified', 'follow_up'].includes(numberToClaim.status)
                      ? "bg-amber-600 hover:bg-amber-700"
                      : "bg-blue-600 hover:bg-blue-700"
                  )}
                >
                  {claimingNumbers.has(numberToClaim.id) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {claimingNumbers.has(numberToClaim.id)
                    ? 'Processing...'
                    : ['pending_verification', 'assigned', 'verified', 'follow_up'].includes(numberToClaim.status)
                    ? "Strike"
                    : "Claim"
                  }
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Status Check Confirmation Dialog */}
        {showStatusCheckDialog && numberForStatusCheck && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl transform transition-all">
              <div className="flex items-center justify-center mb-6">
                <div className="p-3 rounded-full bg-blue-100">
                  <AlertCircle className="h-8 w-8 text-blue-600" />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">
                Request Status Check
              </h3>
              <p className="text-gray-500 text-center mb-6">
                Do you want to request a status check for number {numberForStatusCheck.number}?
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => { setShowStatusCheckDialog(false); setNumberForStatusCheck(null); }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!numberForStatusCheck || isStatusCheckSubmitting) return;
                    setIsStatusCheckSubmitting(true);
                    try {
                      await handleStatusCheck(numberForStatusCheck);
                      setShowStatusCheckDialog(false);
                      setNumberForStatusCheck(null);
                    } finally {
                      setIsStatusCheckSubmitting(false);
                    }
                  }}
                  disabled={isStatusCheckSubmitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center"
                >
                  {isStatusCheckSubmitting && (
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  {isStatusCheckSubmitting ? 'Sending...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reserve Limit Dialog */}
        {showReserveLimitDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl transform transition-all">
              <div className="flex items-center justify-center mb-6">
                <div className="p-3 rounded-full bg-red-100">
                  <AlertCircle className="h-8 w-8 text-red-600" />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">
                Reservation Limit Reached
              </h3>
              <p className="text-gray-500 text-center mb-6">
                You can only reserve up to {MAX_RESERVATIONS} numbers at a time.
                <br />
                Please release a reserved number before reserving a new one.
              </p>
              <div className="flex justify-center">
                <button
                  onClick={() => setShowReserveLimitDialog(false)}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Release Dialog */}
        {showReleaseDialog && selectedNumber && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl transform transition-all">
              <div className="flex items-center justify-center mb-6">
                <div className="p-3 rounded-full bg-red-100">
                  <AlertCircle className="h-8 w-8 text-red-600" />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">
                Release Number
              </h3>
              <p className="text-gray-500 text-center mb-6">
                Are you sure you want to release the number {selectedNumber.number}?
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowReleaseDialog(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRelease}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                >
                  Release
                </button>
              </div>
            </div>
          </div>
        )}

        <AnimatePresence>
          {showChat && selectedNumberForChat && (
            <ChatBox
              numberId={selectedNumberForChat.id}
              originalAgentId={selectedNumberForChat.reservedBy || ''}
              claimingAgentId={selectedNumberForChat.claimingAgentId || ''}
              onClose={() => {
                setShowChat(false);
                setSelectedNumberForChat(null);
              }}
            />
          )}
        </AnimatePresence>

        {/* Set Open Confirmation Dialog */}
        <AnimatePresence>
          {showSetOpenDialog && numberToSetOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                transition={{ type: 'spring', duration: 0.5, bounce: 0.3 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-auto overflow-hidden border border-gray-100"
              >
                {/* Header */}
                <div className="bg-gradient-to-r from-orange-500 to-red-500 px-6 py-4 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight">Set Number to Open</h2>
                      <p className="text-orange-100 text-sm">This action will clear all reservations and claims</p>
                    </div>
                    <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                      <AlertTriangle className="h-6 w-6" />
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="px-6 py-6">
                  <div className="text-center">
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-orange-100 mb-4">
                      <AlertTriangle className="h-6 w-6 text-orange-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Warning: This action cannot be undone
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Setting number <span className="font-semibold text-gray-900">{numberToSetOpen.number}</span> to open will:
                    </p>
                    <ul className="text-left text-sm text-gray-600 space-y-2 mb-6">
                      <li className="flex items-center">
                        <X className="h-4 w-4 text-red-500 mr-2 flex-shrink-0" />
                        Clear all reservations and claims
                      </li>
                      <li className="flex items-center">
                        <X className="h-4 w-4 text-red-500 mr-2 flex-shrink-0" />
                        Remove the number from any agent's reserved list
                      </li>
                      <li className="flex items-center">
                        <X className="h-4 w-4 text-red-500 mr-2 flex-shrink-0" />
                        Reset all claiming timers and queues
                      </li>
                      <li className="flex items-center">
                        <CheckCircle className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
                        Make the number available for new reservations
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Actions */}
                <div className="px-6 py-4 bg-gray-50 flex flex-col sm:flex-row justify-end gap-3">
                  <motion.button
                    whileHover={{ scale: isSettingOpen ? 1 : 1.02 }}
                    whileTap={{ scale: isSettingOpen ? 1 : 0.98 }}
                    onClick={() => {
                      setShowSetOpenDialog(false);
                      setNumberToSetOpen(null);
                    }}
                    disabled={isSettingOpen}
                    className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: isSettingOpen ? 1 : 1.02 }}
                    whileTap={{ scale: isSettingOpen ? 1 : 0.98 }}
                    onClick={confirmSetOpen}
                    disabled={isSettingOpen}
                    className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center justify-center">
                      {isSettingOpen ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Setting Open...
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-4 w-4 mr-2" />
                          Set to Open
                        </>
                      )}
                    </div>
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        </motion.div>
      </div>
    </div>
  ) : null;
}