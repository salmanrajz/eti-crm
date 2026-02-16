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
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp, orderBy, onSnapshot, writeBatch, getDoc, addDoc, runTransaction, limit, deleteDoc, setDoc } from 'firebase/firestore';
import { db, createStrikeAlertBroadcastFunction } from '../../lib/firebase';
// IndexedDB helpers intentionally not used for search to keep direct Firestore fetches fast
import { NumberPoolPagination, paginationUtils } from '../../utils/pagination';
import { numberPoolManager } from '../../utils/numberPoolManager';
import { unifiedSearch } from '../../utils/unifiedSearch';
import { useAuthStore } from '../../store/authStore';
import { NumberPool as NumberPoolType, NumberStatus, ActivatedNumber } from '../../types';
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
  Circle,
  X,
  Copy,
  FileWarning,
  Edit,
  RefreshCw,
  StickyNote,
  Clipboard,
  Check,
  Minus,
  Info,
  ChevronUp,
  Download
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
 * Can fetch agent info directly via agentId or from a lead via leadId.
 * 
 * @param agentId - ID of the agent to display information for
 * @param leadId - Optional lead ID to fetch agent info from if agentId is not available
 */
const AgentTeamInfo = ({ agentId, leadId }: { agentId?: string; leadId?: string }) => {
  const [agentInfo, setAgentInfo] = useState<{ name: string; teamName: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, isAdmin, isCoordinator } = useAuthStore();

  useEffect(() => {
    const fetchAgentInfo = async () => {
      try {
        setLoading(true);
        
        let resolvedAgentId = agentId;
        
        // If no agentId but we have leadId, fetch the lead to get the agentId
        if (!resolvedAgentId && leadId) {
          const leadDoc = await getDoc(doc(db, 'leads', leadId));
          if (leadDoc.exists()) {
            resolvedAgentId = leadDoc.data().agentId;
          }
        }
        
        if (!resolvedAgentId) {
          setAgentInfo(null);
          return;
        }
        
        const userDoc = await getDoc(doc(db, 'users', resolvedAgentId));
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
        } else {
          setAgentInfo(null);
        }
      } catch (error) {
        setAgentInfo({ name: 'Error', teamName: 'Error' });
      } finally {
        setLoading(false);
      }
    };

    if (agentId || leadId) {
      fetchAgentInfo();
    } else {
      setLoading(false);
    }
  }, [agentId, leadId, isAdmin, user?.role]);

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
 * Available number groups in the system
 */
const GROUPS = ['G1', 'G2', 'G3'] as const;

/**
 * Available number initials in the system
 */
const INITIALS = ['050', '054', '056'] as const;

/**
 * Available page sizes for pagination
 */
const PAGE_SIZES = [10, 20, 40, 80, 120] as const;

/**
 * Maximum time (15 minutes) for number claims before auto-release
 */
const CLAIM_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds

/**
 * Maximum number of concurrent reservations per user
 */
const MAX_RESERVATIONS = 3;
const MAX_CLAIMS_PER_24H = 10;
const getTodayUaeDateString = () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
};

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
  activated_non_verified: {
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
  later: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    icon: Clock,
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
  },
  returned: {
    bg: 'bg-gray-200',
    text: 'text-gray-700',
    icon: XCircle,
    gradient: 'from-gray-100 to-gray-200'
  },
  non_verified: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    icon: AlertTriangle,
    gradient: 'from-orange-50 to-orange-100'
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

// Helper function to check if current time is within claim hours (8 AM - 10:30 PM UAE time)
const isWithinClaimHours = (): boolean => {
  const now = new Date();
  const uaeTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Dubai' }));
  const currentHour = uaeTime.getHours();
  const currentMinute = uaeTime.getMinutes();

  // Check if time is between 8 AM and 10:30 PM
  if (currentHour >= 8 && currentHour < 22) return true; // 8 AM to 10 PM
  if (currentHour === 22 && currentMinute <= 30) return true; // 10:00 PM to 10:30 PM
  return false;
};

export function NumberPool({ onNumberSelect, selectedCategory: propSelectedCategory, onCategoryChange }: NumberPoolProps = {}) {
  // ===============================================================================
  // STATE MANAGEMENT
  // ===============================================================================
  
  // Core data state
  const [numbers, setNumbers] = useState<NumberPoolType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPool, setShowPool] = useState(true);
  const [isMobile] = useState(() => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
  const { user, isAdmin, isCoordinator, isAgent } = useAuthStore();
  
  // ===============================================================================
  // ROBUST PERMISSION CHECKS - Explicitly excludes agents
  // ===============================================================================
  
  // Robust permission check: Explicitly excludes agents from admin/coordinator features
  const canEditNumbers = useCallback(() => {
    // Explicitly check that user is NOT an agent
    if (!user || isAgent()) {
      return false;
    }
    // Only allow admin or coordinator
    return isAdmin() || isCoordinator();
  }, [user, isAdmin, isCoordinator, isAgent]);

  // Helper for UI visibility - memoized for performance
  const canViewAdminColumns = useMemo(() => {
    if (!user || isAgent()) return false;
    return isAdmin() || isCoordinator();
  }, [user, isAdmin, isCoordinator, isAgent]);
  
  // Track claim hours state for real-time updates
  const [isWithinClaimWindow, setIsWithinClaimWindow] = useState(isWithinClaimHours());
  
  // Update claim window status every minute
  useEffect(() => {
    const updateClaimWindow = () => {
      setIsWithinClaimWindow(isWithinClaimHours());
    };
    
    updateClaimWindow(); // Initial check
    const interval = setInterval(updateClaimWindow, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, []);
  
  // Reservation and number management state
  const [hasReservation, setHasReservation] = useState(false);
  const [reservedNumbers, setReservedNumbers] = useState<NumberPoolType[]>([]);
  const [allNumbersForReserved, setAllNumbersForReserved] = useState<NumberPoolType[]>([]);
  
  // ===============================================================================
  // PAGINATION STATE
  // ===============================================================================
  
  const [currentPage, setCurrentPage] = useState(1);
  // Default page size: 10 for desktop, 20 for mobile
  const [pageSize, setPageSize] = useState(() => {
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return isMobileDevice ? 20 : 10;
  });
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  // ===============================================================================
  // SEARCH STATE
  // ===============================================================================
  
  const [searchResults, setSearchResults] = useState<NumberPoolType[]>([]);
  // Store full filtered search results to avoid re-searching when only pageSize changes
  const fullSearchResultsRef = useRef<NumberPoolType[]>([]);
  const recoveryAttemptedRef = useRef(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchCurrentPage, setSearchCurrentPage] = useState(1);
  const [searchTotalPages, setSearchTotalPages] = useState(0);
  const [searchTotalItems, setSearchTotalItems] = useState(0);
  const [searchHasNextPage, setSearchHasNextPage] = useState(false);
  const [searchHasPreviousPage, setSearchHasPreviousPage] = useState(false);
  const [searchLastDoc, setSearchLastDoc] = useState<any>(null);
  const [searchHasMore, setSearchHasMore] = useState(false);
  
  // ===============================================================================
  // UI STATE AND DIALOGS
  // ===============================================================================
  
  const [showReleaseDialog, setShowReleaseDialog] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<NumberPoolType | null>(null);
  const [selectedNumbers, setSelectedNumbers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [endsWithToggle, setEndsWithToggle] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(propSelectedCategory || null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [selectedInitials, setSelectedInitials] = useState<string | null>(null);
  const allowedGroups = user?.role === 'agent' && user?.allowedGroups?.length ? user.allowedGroups : null;
  const [userClaimCount, setUserClaimCount] = useState<number>(0);
  const [userClaimDate, setUserClaimDate] = useState<string>('');
  const [statsTotalPages, setStatsTotalPages] = useState<number>(0);
  const [statsTotalItems, setStatsTotalItems] = useState<number>(0);
  const [sortConfig, setSortConfig] = useState<{ field: SortField; direction: SortDirection }>({
    field: 'number',
    direction: 'asc'
  });
  const [showReserveDialog, setShowReserveDialog] = useState(false);
  const [numberToReserve, setNumberToReserve] = useState<NumberPoolType | null>(null);
  const [showReserveLimitDialog, setShowReserveLimitDialog] = useState(false);
  const [showReservationLimitClaimDialog, setShowReservationLimitClaimDialog] = useState(false);
  const [showNumberActiveDialog, setShowNumberActiveDialog] = useState(false);
  const [activeNumberInfo, setActiveNumberInfo] = useState<{number: string, etiStatus: number, message: string} | null>(null);
  const [showReserveConflictDialog, setShowReserveConflictDialog] = useState(false);
  const [reserveConflictInfo, setReserveConflictInfo] = useState<{ number: string; status?: string; reservedByName?: string | null } | null>(null);
  const [checkingReserveId, setCheckingReserveId] = useState<string | null>(null);
  const [showMyClaimsDialog, setShowMyClaimsDialog] = useState(false);
  const [showClaimDialog, setShowClaimDialog] = useState(false);
  const [numberToClaim, setNumberToClaim] = useState<NumberPoolType | null>(null);
  const [strikeBlockedSameTeam, setStrikeBlockedSameTeam] = useState(false);
  const [openingStrikeModalId, setOpeningStrikeModalId] = useState<string | null>(null);
  const [showStatusCheckDialog, setShowStatusCheckDialog] = useState(false);
  const [numberForStatusCheck, setNumberForStatusCheck] = useState<NumberPoolType | null>(null);
  const [isStatusCheckSubmitting, setIsStatusCheckSubmitting] = useState(false);
  const [claimTimer, setClaimTimer] = useState<NodeJS.Timeout | null>(null);
  const [claimCountdowns, setClaimCountdowns] = useState<Record<string, number>>({});
  const [reservationCountdowns, setReservationCountdowns] = useState<Record<string, number>>({});
  const computeUserWaitMs = useCallback(
    (number: NumberPoolType) => {
      const position = number.claimQueue?.findIndex((c: any) => c?.agentId === user?.id) ?? -1;
      const activeRemaining =
        claimCountdowns[number.id] ??
        (number.claimingExpiresAt
          ? Math.max(0, new Date(number.claimingExpiresAt as any).getTime() - Date.now())
          : undefined);

      if (position >= 0) {
        const base = activeRemaining ?? CLAIM_TIMEOUT;
        return base + Math.max(0, position) * CLAIM_TIMEOUT;
      }

      if (number.claimingAgentId === user?.id) {
        return activeRemaining ?? null;
      }

      return activeRemaining ?? null;
    },
    [claimCountdowns, user?.id]
  );
  const [showChat, setShowChat] = useState(false);
  const [selectedNumberForChat, setSelectedNumberForChat] = useState<NumberPoolType | null>(null);
  const [searchParams] = useSearchParams();
  const numberIdFromUrl = searchParams.get('numberId');
  const [statusChecks, setStatusChecks] = useState<StatusCheck[]>([]);
  const [agentLeadNumberIds, setAgentLeadNumberIds] = useState<Set<string>>(new Set());
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateNumbers, setDuplicateNumbers] = useState<Array<{ number: string; entries: NumberPoolType[] }>>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [selectedDuplicateEntries, setSelectedDuplicateEntries] = useState<Set<string>>(new Set());
  const [isDeletingDuplicates, setIsDeletingDuplicates] = useState(false);
  const [showDeleteDuplicatesDialog, setShowDeleteDuplicatesDialog] = useState(false);
  
  // Number status checker state
  const [showNumberStatusChecker, setShowNumberStatusChecker] = useState(false);
  const [pastedNumbers, setPastedNumbers] = useState('');
  const [numberStatusResults, setNumberStatusResults] = useState<Array<{
    number: string;
    found: boolean;
    data?: NumberPoolType;
  }>>([]);
  const [checkingNumbers, setCheckingNumbers] = useState(false);
  const [copiedFeedback, setCopiedFeedback] = useState<{
    type: 'open' | 'reserved' | 'all';
    timestamp: number;
  } | null>(null);

  // Parse valid numbers from pasted text in real-time
  const validPastedNumbers = useMemo(() => {
    if (!pastedNumbers.trim()) return [];
    return pastedNumbers
      .split(/[\n,\s]+/)
      .map(n => n.trim())
      .filter(n => n.length > 0)
      .map(n => n.replace(/\D/g, ''))
      .filter(n => n.length === 10);
  }, [pastedNumbers]);

  const formatStatusLabel = useCallback((status?: string) => {
    if (!status) return 'Unknown';
    return status
      .replace(/_/g, ' ')
      .replace(/\b\w/g, letter => letter.toUpperCase());
  }, []);
  
  // ===============================================================================
  // PERFORMANCE OPTIMIZATION STATE
  // ===============================================================================
  
  const [claimingNumbers, setClaimingNumbers] = useState<Set<string>>(new Set());
  const [cancellingNumbers, setCancellingNumbers] = useState<Set<string>>(new Set());
  const [reservingNumbers, setReservingNumbers] = useState<Set<string>>(new Set());
  const [chattingNumbers, setChattingNumbers] = useState<Set<string>>(new Set());
  const [operationTimeouts, setOperationTimeouts] = useState<Map<string, NodeJS.Timeout>>(new Map());
  const [lastClaimAttempts, setLastClaimAttempts] = useState<Map<string, number>>(new Map());
  const userClaimLimitReached = userClaimCount >= MAX_CLAIMS_PER_24H;
  
  // Derived claim lists for current user (claimed/being claimed)
  const flattenSources = useCallback(() => {
    const map = new Map<string, NumberPoolType>();
    [numbers, reservedNumbers, searchResults, allNumbersForReserved].forEach(list => {
      (list || []).forEach((n: any) => {
        if (n?.id && !map.has(n.id)) {
          map.set(n.id, n as NumberPoolType);
        }
      });
    });
    return Array.from(map.values());
  }, [numbers, reservedNumbers, searchResults, allNumbersForReserved]);
  
  const myClaimedNumbers = useMemo(() => {
    if (!user?.id) return [];
    return flattenSources().filter(n => (n.claimQueue || []).some((c: any) => c?.agentId === user.id));
  }, [flattenSources, user?.id]);
  
  const [myBeingClaimedNumbers, setMyBeingClaimedNumbers] = useState<NumberPoolType[]>([]);

  // Derived list: include numbers where user is claiming OR in the claim queue (from any loaded source)
  const myBeingClaimedAll = useMemo(() => {
    const map = new Map<string, NumberPoolType>();
    const userId = user?.id;
    if (userId) {
      // From queue membership across loaded sources
      flattenSources().forEach((n) => {
        if ((n.claimQueue || []).some((c: any) => c?.agentId === userId)) {
          map.set(n.id, n);
        }
      });
      // From active claiming listener
      myBeingClaimedNumbers.forEach((n) => map.set(n.id, n));
    }
    return Array.from(map.values());
  }, [flattenSources, myBeingClaimedNumbers, user?.id]);

  // Fetch "Being claimed" numbers directly from Firestore for the current user
  useEffect(() => {
    if (!user?.id) {
      setMyBeingClaimedNumbers([]);
      return;
    }
    const q = query(
      collection(db, 'numberPool'),
      where('claimingAgentId', '==', user.id)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as any;
        return {
          ...data,
          id: docSnap.id,
          claimingStartedAt: data?.claimingStartedAt?.toDate
            ? data.claimingStartedAt.toDate()
            : data?.claimingStartedAt,
          claimingExpiresAt: data?.claimingExpiresAt?.toDate
            ? data.claimingExpiresAt.toDate()
            : data?.claimingExpiresAt,
        } as NumberPoolType;
      });
      setMyBeingClaimedNumbers(docs);
    });
    return () => unsubscribe();
  }, [user?.id]);

  // Load/reset claim quota at UAE midnight
  useEffect(() => {
    const loadClaimStats = async () => {
      const today = getTodayUaeDateString();
      if (!user?.id) {
        setUserClaimDate(today);
        setUserClaimCount(0);
        return;
      }
      try {
        const ref = doc(db, 'userClaimStats', user.id);
        const snap = await getDoc(ref);
        const data = snap.exists() ? snap.data() : {};
        const storedDate = typeof (data as any).date === 'string' ? (data as any).date : '';
        const storedCount = typeof (data as any).count === 'number' ? (data as any).count : 0;
        if (storedDate === today) {
          setUserClaimDate(storedDate);
          setUserClaimCount(storedCount);
        } else {
          setUserClaimDate(today);
          setUserClaimCount(0);
          await setDoc(ref, { date: today, count: 0 }, { merge: true });
        }
      } catch (err) {
        console.error('Error loading claim stats:', err);
        setUserClaimDate(today);
        setUserClaimCount(0);
      }
    };
    loadClaimStats();
  }, [user?.id]);

  const recordDailyClaim = useCallback(async () => {
    if (!user?.id) return;
    try {
      const today = getTodayUaeDateString();
      const newCount = (userClaimDate === today ? userClaimCount : 0) + 1;
      setUserClaimDate(today);
      setUserClaimCount(newCount);
      const ref = doc(db, 'userClaimStats', user.id);
      await setDoc(ref, { date: today, count: newCount }, { merge: true });
    } catch (err) {
      console.error('Error recording claim stat:', err);
    }
  }, [user?.id, userClaimDate, userClaimCount]);
  
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
  
  // Bulk delete functionality states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // ===============================================================================
  // AGENT UTILITIES STATE
  // ===============================================================================
  
  // Notepad utility
  const [showNotepad, setShowNotepad] = useState(false);
  const [notepadContent, setNotepadContent] = useState('');
  const [isCopyingNotepad, setIsCopyingNotepad] = useState(false);
  const [notepadCopied, setNotepadCopied] = useState(false);
  const [whatsappBlankLines, setWhatsappBlankLines] = useState(true); // Toggle for blank lines in WhatsApp format
  const [showInstructions, setShowInstructions] = useState(false);
  
  // Bulk copy utility - reuse selectedNumbers state for checkboxes
  const [bulkCopyMode, setBulkCopyMode] = useState(false);
  const [showBulkCopyWarning, setShowBulkCopyWarning] = useState(false);
  const [bulkCopyWarningMessage, setBulkCopyWarningMessage] = useState('');

  // Export numbers (admin)
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportingNumbers, setExportingNumbers] = useState(false);
  const exportFields = [
    { key: 'number', label: 'Number' },
    { key: 'category', label: 'Category' },
    { key: 'code', label: 'Code' },
    { key: 'passcode', label: 'Passcode' },
    { key: 'status', label: 'Status' },
    { key: 'group', label: 'Group' },
    { key: 'reservedBy', label: 'Reserved By' }
  ] as const;
  const [selectedExportFields, setSelectedExportFields] = useState<string[]>(exportFields.map(f => f.key));
  
  // ===============================================================================
  // UTILITY FUNCTIONS AND REFS
  // ===============================================================================
  
  // Debounced search term for performance optimization
  // Debounce search input to 800ms to allow users to complete typing
  const debouncedSearchTerm = useDebounce(searchTerm, 350);

  // Realtime subscriptions for search-visible documents cleanup
  const searchVisibleUnsubsRef = useRef<Map<string, () => void>>(new Map());
  
  // Track the search term currently being processed to prevent race conditions
  const currentSearchTermRef = useRef<string>('');

  const toggleExportField = (key: string) => {
    setSelectedExportFields(prev =>
      prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  // Check numbers status from pasted list
  const handleCheckNumbers = async () => {
    if (!pastedNumbers.trim()) {
      toast.error('Please paste numbers to check');
      return;
    }

    setCheckingNumbers(true);
    try {
      // Parse numbers from pasted text (support line breaks, comma-separated, and space-separated)
      const numberStrings = pastedNumbers
        .split(/[\n,\s]+/) // Split by newlines, commas, or spaces
        .map(n => n.trim())
        .filter(n => n.length > 0)
        .map(n => n.replace(/\D/g, '')) // Remove non-digits
        .filter(n => n.length === 10); // Only 10-digit numbers

      if (numberStrings.length === 0) {
        toast.error('No valid 10-digit numbers found. Please ensure numbers are 10 digits.');
        setCheckingNumbers(false);
        return;
      }

      // Remove duplicates
      const uniqueNumbers = [...new Set(numberStrings)];

      // Query Firestore for these numbers
      // Firestore 'in' query supports up to 10 items, so we need to batch
      const results: Array<{ number: string; found: boolean; data?: NumberPoolType }> = [];
      
      for (let i = 0; i < uniqueNumbers.length; i += 10) {
        const batch = uniqueNumbers.slice(i, i + 10);
        const q = query(
          collection(db, 'numberPool'),
          where('number', 'in', batch)
        );
        const snapshot = await getDocs(q);
        
        const foundNumbers = new Set<string>();
        snapshot.docs.forEach(doc => {
          const data = doc.data() as any;
          foundNumbers.add(data.number);
          results.push({
            number: data.number,
            found: true,
            data: {
              id: doc.id,
              ...data,
              lastStatusChange: data.lastStatusChange?.toDate ? data.lastStatusChange.toDate() : data.lastStatusChange,
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
              expiresAt: data.expiresAt?.toDate ? data.expiresAt.toDate() : data.expiresAt,
              reservedAt: data.reservedAt?.toDate ? data.reservedAt.toDate() : data.reservedAt,
              claimingStartedAt: data.claimingStartedAt?.toDate ? data.claimingStartedAt.toDate() : data.claimingStartedAt,
              claimingExpiresAt: data.claimingExpiresAt?.toDate ? data.claimingExpiresAt.toDate() : data.claimingExpiresAt,
            } as NumberPoolType
          });
        });

        // Add not found numbers
        batch.forEach(num => {
          if (!foundNumbers.has(num)) {
            results.push({
              number: num,
              found: false
            });
          }
        });
      }

      setNumberStatusResults(results);
      toast.success(`Checked ${uniqueNumbers.length} number(s)`);
    } catch (error) {
      console.error('Error checking numbers:', error);
      toast.error('Failed to check numbers');
    } finally {
      setCheckingNumbers(false);
    }
  };

  // Copy number to clipboard
  const copyNumber = async (number: string) => {
    try {
      await navigator.clipboard.writeText(number);
      toast.success(`Copied ${number}`);
    } catch (error) {
      console.error('Failed to copy:', error);
      toast.error('Failed to copy number');
    }
  };

  const handleExportNumbers = async () => {
    if (!isAdmin()) {
      toast.error('Only admins can export numbers');
      return;
    }
    setExportingNumbers(true);
    try {
      const snapshot = await getDocs(collection(db, 'numberPool'));
      const rows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      if (!rows.length) {
        toast.error('No numbers to export');
        setExportingNumbers(false);
        return;
      }

      const headerMap: Record<string, string> = {
        number: 'Number',
        category: 'Category',
        code: 'Code',
        passcode: 'Passcode',
        status: 'Status',
        group: 'Group',
        teamVisibility: 'Team Visibility',
        visibleToFreelancers: 'Visible To Freelancers',
        reservedBy: 'Reserved By',
        reservedAt: 'Reserved At',
        expiresAt: 'Expires At',
        claimingAgentId: 'Claiming Agent',
        claimingStartedAt: 'Claiming Started At',
        claimingExpiresAt: 'Claiming Expires At',
        originalAgentId: 'Original Agent',
        originalReservedAt: 'Original Reserved At',
        originalExpiresAt: 'Original Expires At',
        lastClaimedAt: 'Last Claimed At',
        claimedAt: 'Claimed At',
        leadId: 'Lead Id'
      };

      const formatVal = (val: any) => {
        if (val === undefined || val === null) return '';
        if (val?.toDate instanceof Function) return val.toDate().toISOString();
        if (val instanceof Date) return val.toISOString();
        if (typeof val === 'boolean') return val ? 'Yes' : 'No';
        return val;
      };

      const data = rows.map(row => {
        const out: Record<string, any> = {};
        selectedExportFields.forEach(key => {
          out[headerMap[key] || key] = formatVal(row[key]);
        });
        return out;
      });

      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'NumberPool');
      const filename = `NumberPool_${new Date().toISOString().slice(0,10)}.xlsx`;
      XLSX.writeFile(wb, filename);
      toast.success('Export complete');
      setShowExportModal(false);
    } catch (error) {
      console.error('Error exporting numbers:', error);
      toast.error('Failed to export numbers');
    } finally {
      setExportingNumbers(false);
    }
  };

  /**
   * Visibility guard filter for team-restricted numbers based on user role
   * @param list - List of numbers to filter
   * @returns Filtered list based on user permissions
   */
  const filterByVisibility = useCallback((list: NumberPoolType[]): NumberPoolType[] => {
    // Admin/manager/coordinator see everything
    if (isAdmin() || user?.role === 'manager' || user?.role === 'coordinator') return list;
    // Agents: enforce allowedGroups (if set) and team visibility; hide activated numbers
    if (user?.role === 'agent') {
      const allowedGroups = user.allowedGroups && user.allowedGroups.length > 0 ? user.allowedGroups : null;

      const filtered = list.filter(n => {
        if (n.status === 'activated') return false;
        if (allowedGroups && !allowedGroups.includes(n.group || '')) return false;
        if (user.teamId && n.teamVisibility && n.teamVisibility !== user.teamId) return false;
        return true;
      });

      return filtered;
    }
    return list;
  }, [isAdmin, user?.role, user?.teamId, user?.allowedGroups]);

  // ===============================================================================
  // EFFECTS AND LIFECYCLE MANAGEMENT
  // ===============================================================================

  /**
   * Initialize number pool manager and subscribe to state changes
   * Handles persistent state management across navigation and loading timeout protection
   */
  useEffect(() => {
    if (!user?.id) {
      // User not logged in, clear state and listeners
      recoveryAttemptedRef.current = false;
      numberPoolManager.destroy();
      setNumbers([]);
      setCurrentPage(1);
      setTotalPages(0);
      setTotalItems(0);
      setHasNextPage(false);
      setHasPreviousPage(false);
      setAllNumbersForReserved([]);
      setLoading(false);
      return;
    }
    
    let isMounted = true;
    let loadingCheckInterval: NodeJS.Timeout | null = null;
    let stuckStateTimeout: NodeJS.Timeout | null = null;
    
    // Subscribe to manager state
    const unsubscribe = numberPoolManager.subscribe((state) => {
      if (!isMounted) return;
      
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
    // The manager will detect user changes and force reset internally
    numberPoolManager.setUserRole(user?.role);
    const effectiveGroup = selectedGroup || (allowedGroups ? allowedGroups[0] : null);
    if (!selectedGroup && effectiveGroup) {
      setSelectedGroup(effectiveGroup);
    }
    numberPoolManager.initialize(selectedCategory, pageSize, user?.id, user?.role, effectiveGroup, selectedInitials).catch(error => {
      console.error('[NumberPool] Initialization error:', error);
      if (isMounted) {
        setLoading(false);
      }
    });

    // Watchdog: Check for stuck loading state every 10 seconds
    let stuckCheckCount = 0;
    let loadingStartTime: number | null = null;
    
    loadingCheckInterval = setInterval(() => {
      if (!isMounted) return;
      
      // Get current state from manager directly
      const currentState = numberPoolManager.getState();
      const currentLoading = currentState?.isLoading ?? false;
      
      // Track when loading starts
      if (currentLoading && loadingStartTime === null) {
        loadingStartTime = Date.now();
      } else if (!currentLoading && loadingStartTime !== null) {
        // Loading stopped, reset tracking
        loadingStartTime = null;
        stuckCheckCount = 0;
        return;
      }
      
      // If loading has been true for more than 30 seconds, force reset
      if (currentLoading && loadingStartTime !== null) {
        const loadingDuration = Date.now() - loadingStartTime;
        stuckCheckCount++;
        
        if (stuckCheckCount >= 3 || loadingDuration > 30000) { // 3 checks = 30 seconds OR if duration > 30s
        numberPoolManager.forceResetLoading();
          stuckCheckCount = 0;
          loadingStartTime = null; // Reset to allow new cycle
        }
      }
    }, 10000); // Check every 10 seconds

    // Fallback timeout: If still loading after 40 seconds, force reset
    stuckStateTimeout = setTimeout(() => {
      if (isMounted) {
        const currentState = numberPoolManager.getState();
        if (currentState?.isLoading) {
          if (!user?.id) {
            numberPoolManager.destroy();
            setLoading(false);
            return;
          }
          numberPoolManager.forceReset();
          // Re-initialize after reset
          setTimeout(() => {
            if (isMounted && user?.id) {
              numberPoolManager.initialize(selectedCategory, pageSize, user?.id, user?.role, selectedGroup, selectedInitials).catch(() => {
                // Silent error handling
              });
            }
          }, 1000);
        }
      }
    }, 40000); // 40 second hard timeout

    return () => {
      isMounted = false;
      unsubscribe();
      if (loadingCheckInterval) {
        clearInterval(loadingCheckInterval);
      }
      if (stuckStateTimeout) {
        clearTimeout(stuckStateTimeout);
      }
    };
  }, [selectedCategory, selectedGroup, selectedInitials, pageSize, user?.id, user?.role]); // Removed 'loading' to prevent circular dependency

  // ===============================================================================
  // AGENT UTILITIES - NOTEPAD LOCALSTORAGE
  // ===============================================================================
  
  // Load notepad content from localStorage on mount
  useEffect(() => {
    if (user?.id) {
      const storageKey = `notepad_${user.id}`;
      const savedContent = localStorage.getItem(storageKey);
      if (savedContent) {
        setNotepadContent(savedContent);
      }
    }
  }, [user?.id]);
  
  // Save notepad content to localStorage whenever it changes
  useEffect(() => {
    if (user?.id && notepadContent !== undefined) {
      const storageKey = `notepad_${user.id}`;
      localStorage.setItem(storageKey, notepadContent);
    }
  }, [notepadContent, user?.id]);

  /**
   * Helper function to refresh a specific number's data after an action
   * Fetches fresh data from Firestore and updates both numbers and search results
   */
  const refreshNumberData = useCallback(async (numberId: string) => {
    try {
      const numberDoc = await getDoc(doc(db, 'numberPool', numberId));
      if (numberDoc.exists()) {
        const data = numberDoc.data();
        const refreshedNumber: NumberPoolType = {
          id: numberDoc.id,
          ...data,
          lastStatusChange: data.lastStatusChange?.toDate?.() || data.lastStatusChange,
          reservedAt: data.reservedAt?.toDate?.() || data.reservedAt,
          expiresAt: data.expiresAt?.toDate?.() || data.expiresAt,
          claimingStartedAt: data.claimingStartedAt?.toDate?.() || data.claimingStartedAt,
          claimingExpiresAt: data.claimingExpiresAt?.toDate?.() || data.claimingExpiresAt
        } as NumberPoolType;
        
        // Update both numbers and search results
        setNumbers(prev => prev.map(n => n.id === numberId ? refreshedNumber : n));
        setSearchResults(prev => prev.map(n => n.id === numberId ? refreshedNumber : n));
        
        // Also update full search results cache
        if (fullSearchResultsRef.current.length > 0) {
          fullSearchResultsRef.current = fullSearchResultsRef.current.map(n => 
            n.id === numberId ? refreshedNumber : n
          );
        }
      }
    } catch (error) {
      console.error('Error refreshing number data:', error);
    }
  }, []);

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
      fullSearchResultsRef.current = [];
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

    // Check if we have cached results and only pageSize/page changed (not search term or filters)
    // This allows fast re-pagination without re-searching
    const hasCachedResults = fullSearchResultsRef.current.length > 0;
    const lastSearchTerm = (fullSearchResultsRef.current as any).lastSearchTerm;
    const lastCategory = (fullSearchResultsRef.current as any).lastCategory;
    const lastGroup = (fullSearchResultsRef.current as any).lastGroup;
    const lastInitials = (fullSearchResultsRef.current as any).lastInitials;
    const lastEndsWithToggle = (fullSearchResultsRef.current as any).lastEndsWithToggle;
    
    // Determine if search term or any filter changed
    const searchTermChanged = debouncedSearchTerm !== lastSearchTerm;
    const categoryChanged = selectedCategory !== lastCategory;
    const groupChanged = selectedGroup !== lastGroup;
    const initialsChanged = selectedInitials !== lastInitials;
    const endsWithToggleChanged = endsWithToggle !== lastEndsWithToggle;
    
    // IMPORTANT: If we have cached results and search term/filters haven't changed,
    // ONLY re-paginate - DO NOT call performSearch() which would reset everything
    // Note: Sorting is handled by a separate useEffect, so we just paginate here
    if (hasCachedResults && !searchTermChanged && !categoryChanged && !groupChanged && !initialsChanged && !endsWithToggleChanged) {
      // Use cached results - just re-slice for new pageSize/page
      // Sorting will be applied by the sort effect if needed
      const filteredResults = fullSearchResultsRef.current;
      const startIndex = (searchCurrentPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedResults = filteredResults.slice(startIndex, endIndex);
      
      const calculatedTotalPages = Math.ceil(filteredResults.length / pageSize);
      const calculatedHasNextPage = endIndex < filteredResults.length;
      const calculatedHasPreviousPage = searchCurrentPage > 1;
      
      setSearchResults(paginatedResults);
      setSearchTotalPages(calculatedTotalPages);
      setSearchTotalItems(filteredResults.length);
      setSearchHasNextPage(calculatedHasNextPage);
      setSearchHasPreviousPage(calculatedHasPreviousPage);
      setIsSearching(false);
      setIsLoadingMore(false);
      return; // CRITICAL: Return early to prevent performSearch() from being called
    }

    // OPTIMIZATION: If we have cached results and only filters changed (not search term),
    // filter cached results in memory instead of doing a new Firebase search
    // This applies to ALL filters: category, group, and initials
    if (hasCachedResults && !searchTermChanged && !endsWithToggleChanged && (categoryChanged || groupChanged || initialsChanged)) {
      // Get the full unfiltered results from cache
      // We need to check if we have the original unfiltered results stored
      const originalUnfilteredResults = (fullSearchResultsRef.current as any).originalUnfilteredResults || fullSearchResultsRef.current;
      
      // Start with the original unfiltered results
      let filteredResults = [...originalUnfilteredResults];
      
      // Apply category filter in memory
      if (selectedCategory && selectedCategory !== 'all') {
        filteredResults = filteredResults.filter(n => n.category === selectedCategory);
      }
      
      // Apply group filter
      if (selectedGroup) {
        filteredResults = filteredResults.filter(n => n.group === selectedGroup);
      }
      
      // Apply initial filter
      if (selectedInitials) {
        filteredResults = filteredResults.filter(n => (n.number || '').startsWith(selectedInitials));
      }
      
      // Update cached results - store both filtered and original unfiltered
      fullSearchResultsRef.current = filteredResults;
      (fullSearchResultsRef.current as any).originalUnfilteredResults = originalUnfilteredResults;
      (fullSearchResultsRef.current as any).lastSearchTerm = debouncedSearchTerm;
      (fullSearchResultsRef.current as any).lastCategory = selectedCategory;
      (fullSearchResultsRef.current as any).lastGroup = selectedGroup;
      (fullSearchResultsRef.current as any).lastInitials = selectedInitials;
      (fullSearchResultsRef.current as any).lastEndsWithToggle = endsWithToggle;
      
      // Reset to page 1 when filter changes
      setSearchCurrentPage(1);
      
      // Paginate filtered results
      const startIndex = 0;
      const endIndex = pageSize;
      const paginatedResults = filteredResults.slice(startIndex, endIndex);
      
      setSearchResults(paginatedResults);
      setSearchTotalPages(Math.ceil(filteredResults.length / pageSize));
      setSearchTotalItems(filteredResults.length);
      setSearchHasNextPage(endIndex < filteredResults.length);
      setSearchHasPreviousPage(false);
      setIsSearching(false);
      setIsLoadingMore(false);
      return; // Return early - no Firebase query needed, all filtering done in memory
    }

    // Only perform new Firebase search if:
    // 1. No cached results exist, OR
    // 2. Search term changed, OR
    // 3. endsWith toggle changed (changes search behavior)
    // Filters (category, group, initials) are now handled in memory above
    if (!hasCachedResults || searchTermChanged || endsWithToggleChanged) {
      // Reset to page 1 when search term or toggle changes
      if (searchTermChanged || endsWithToggleChanged) {
        setSearchCurrentPage(1);
      }
      performSearch();
    }
  }, [debouncedSearchTerm, selectedCategory, selectedGroup, selectedInitials, searchCurrentPage, pageSize, endsWithToggle]);

  // Perform search function - accessible for "Load More" button
  // Helper function to search deletedNumbers collection (admin and coordinator)
  const searchDeletedNumbers = useCallback(async (searchTerm: string, category: string, endsWith: boolean) => {
    if (!isAdmin() && !isCoordinator()) {
      return [];
    }

    try {
      const deletedNumbersRef = collection(db, 'deletedNumbers');
      const cleanTerm = searchTerm.trim();
      const isNumeric = /^\d+$/.test(cleanTerm);
      
      let deletedQuery: any = deletedNumbersRef;
      const constraints: any[] = [];
      
      // Apply category filter if not 'all'
      if (category !== 'all') {
        constraints.push(where('category', '==', category));
      }

      // Build search query based on search type
      if (isNumeric) {
        // For numeric searches, check if it's an "ends with" search
        if (endsWith && /^\d{2,5}$/.test(cleanTerm)) {
          const length = cleanTerm.length;
          const fieldName = length === 2 ? 'last2Digits' : 
                           length === 3 ? 'last3Digits' : 
                           length === 4 ? 'last4Digits' :
                           'last5Digits';
          constraints.push(where(fieldName, '==', cleanTerm));
          constraints.push(orderBy('number'));
        } else {
          // Search in number field (contains) - requires orderBy
          constraints.push(where('number', '>=', cleanTerm));
          constraints.push(where('number', '<=', cleanTerm + '\uf8ff'));
          constraints.push(orderBy('number'));
        }
      } else {
        // For non-numeric searches, search in code field
        constraints.push(where('code', '>=', cleanTerm.toLowerCase()));
        constraints.push(where('code', '<=', cleanTerm.toLowerCase() + '\uf8ff'));
        constraints.push(orderBy('code'));
      }
      
      constraints.push(limit(500));
      deletedQuery = query(deletedNumbersRef, ...constraints);

      const snapshot = await getDocs(deletedQuery);
      const deletedNumbers = snapshot.docs.map(doc => {
        const data = doc.data() as any;
        return {
          ...data,
          id: doc.id,
          status: 'returned' as NumberStatus,
          isDeleted: true // Flag to identify deleted numbers
        } as NumberPoolType & { isDeleted?: boolean };
      });

      return deletedNumbers;
    } catch (error) {
      console.error('Error searching deleted numbers:', error);
      // If query fails (e.g., missing index), return empty array
      return [];
    }
  }, [isAdmin]);

  // Helper function to search activatedNumbers collection (admin and coordinator only)
  const searchActivatedNumbers = useCallback(async (searchTerm: string, category: string, endsWith: boolean) => {
    if (!isAdmin() && user?.role !== 'coordinator') {
      return [];
    }

    try {
      const activatedNumbersRef = collection(db, 'activatedNumbers');
      const cleanTerm = searchTerm.trim().toLowerCase();
      const isNumeric = /^\d+$/.test(cleanTerm);

      let activatedQuery: any = activatedNumbersRef;
      const constraints: any[] = [];

      // Apply category filter if not 'all'
      if (category !== 'all') {
        constraints.push(where('category', '==', category));
      }

      // Special case: if searching for "activated", return all activated numbers
      if (cleanTerm === 'activated') {
        // Get all activated numbers (with category filter if specified)
        constraints.push(orderBy('activatedAt', 'desc'));
        constraints.push(limit(1000)); // Higher limit for "show all" searches
        activatedQuery = query(activatedNumbersRef, ...constraints);
      }
      // Build search query based on search type
      else if (isNumeric) {
        // For numeric searches, check if it's an "ends with" search
        if (endsWith && /^\d{2,5}$/.test(cleanTerm)) {
          const length = cleanTerm.length;
          const fieldName = length === 2 ? 'last2Digits' :
                           length === 3 ? 'last3Digits' :
                           length === 4 ? 'last4Digits' :
                           'last5Digits';
          constraints.push(where(fieldName, '==', cleanTerm));
          constraints.push(orderBy('number'));
        } else {
          // Search in number field (contains) - requires orderBy
          constraints.push(where('number', '>=', cleanTerm));
          constraints.push(where('number', '<=', cleanTerm + '\uf8ff'));
          constraints.push(orderBy('number'));
        }
        constraints.push(limit(500));
        activatedQuery = query(activatedNumbersRef, ...constraints);
      } else {
        // For non-numeric searches, search in code field
        constraints.push(where('code', '>=', cleanTerm));
        constraints.push(where('code', '<=', cleanTerm + '\uf8ff'));
        constraints.push(orderBy('code'));
        constraints.push(limit(500));
        activatedQuery = query(activatedNumbersRef, ...constraints);
      }

      // Build the final query
      activatedQuery = query(activatedNumbersRef, ...constraints);

      const snapshot = await getDocs(activatedQuery);
      const activatedNumbers = snapshot.docs.map(doc => {
        const data = doc.data() as any;
        return {
          ...data,
          id: doc.id,
          status: 'activated' as NumberStatus,
          isActivated: true // Flag to identify activated numbers
        } as NumberPoolType & { isActivated?: boolean };
      });

      return activatedNumbers;
    } catch (error) {
      console.error('Error searching activated numbers:', error);
      // If query fails (e.g., missing index), return empty array
      return [];
    }
  }, [isAdmin, user?.role]);

  const performSearch = useCallback(async (loadMore: boolean = false) => {
    // Capture the search term at the start of this search operation
    const termAtStart = debouncedSearchTerm.trim();
    
    const lastSearchTerm = (fullSearchResultsRef.current as any)?.lastSearchTerm;
    const hasResultsForThisTerm = lastSearchTerm === termAtStart && fullSearchResultsRef.current.length > 0;
    
    // OPTIMIZATION: Try in-memory filtering if we have existing results and new term is more specific
    if (!loadMore && termAtStart !== '' && fullSearchResultsRef.current.length > 0) {
      const lastSearchTerm = (fullSearchResultsRef.current as any)?.lastSearchTerm;
      const originalUnfilteredResults = (fullSearchResultsRef.current as any)?.originalUnfilteredResults || fullSearchResultsRef.current;
      
      // Check if new search term contains the previous search term (more specific search)
      
      if (lastSearchTerm && termAtStart.includes(lastSearchTerm) && originalUnfilteredResults.length > 0) {
        // Parse search terms (handle multi-term searches like "999 0" or "050 14JANSILG1" or "999 silver")
        const searchTerms = termAtStart.split(/\s+/).filter(t => t.length > 0);
        
        // Filter existing results in memory - order-independent matching
        // Supports searching in: number, code, category, group, status
        // All terms must be present, but can be in any order
        let filteredResults = originalUnfilteredResults.filter((num: NumberPoolType) => {
          const numberStr = (num.number || '').toLowerCase();
          const codeStr = (num.code || '').toLowerCase();
          const categoryStr = (num.category || '').toLowerCase();
          const groupStr = (num.group || '').toLowerCase();
          const statusStr = (num.status || '').toLowerCase();
          
          // Combine all searchable fields for searching
          // Use a space separator to ensure we can distinguish between fields
          // Searches in: number, code, category, group, status
          const combinedStr = (numberStr + ' ' + codeStr + ' ' + categoryStr + ' ' + groupStr + ' ' + statusStr).toLowerCase();
          
          // Check if ALL search terms are present (order-independent)
          // Each term must appear somewhere in the combined string, but order doesn't matter
          for (const term of searchTerms) {
            const termLower = term.toLowerCase();
            
            // Check if this term appears anywhere in the combined string
            if (!combinedStr.includes(termLower)) {
              return false; // Term not found
            }
          }
          
          return true; // All terms found (in any order)
        });
        
        // Apply visibility filter
        filteredResults = filterByVisibility(filteredResults);
        
        // Apply category filter in memory (only if we searched 'all' categories)
        const searchCategory = (selectedCategory && selectedCategory !== 'all') ? selectedCategory : 'all';
        if (searchCategory === 'all' && selectedCategory && selectedCategory !== 'all') {
          filteredResults = filteredResults.filter((n: NumberPoolType) => n.category === selectedCategory);
        }
        
        // Apply group filter
        if (selectedGroup) {
          filteredResults = filteredResults.filter((n: NumberPoolType) => n.group === selectedGroup);
        }
        
        // Apply initials filter
        if (selectedInitials) {
          filteredResults = filteredResults.filter((n: NumberPoolType) => (n.number || '').startsWith(selectedInitials));
        }
        
        // If we got good results from in-memory filtering, use them
        if (filteredResults.length > 0 || searchTerms.length > 0) {
          // Mark this search term as being processed
          currentSearchTermRef.current = termAtStart;
          
          // Store results
          fullSearchResultsRef.current = filteredResults;
          (fullSearchResultsRef.current as any).originalUnfilteredResults = originalUnfilteredResults; // Keep original for future filtering
          (fullSearchResultsRef.current as any).lastSearchTerm = termAtStart;
          (fullSearchResultsRef.current as any).lastCategory = selectedCategory;
          (fullSearchResultsRef.current as any).lastGroup = selectedGroup;
          (fullSearchResultsRef.current as any).lastInitials = selectedInitials;
          (fullSearchResultsRef.current as any).lastEndsWithToggle = endsWithToggle;
          
          // Paginate results
          const pageForNewSearch = 1;
          const startIndex = (pageForNewSearch - 1) * pageSize;
          const endIndex = startIndex + pageSize;
          const paginatedResults = filteredResults.slice(startIndex, endIndex);
          
          const calculatedTotalPages = Math.ceil(filteredResults.length / pageSize);
          const calculatedHasNextPage = endIndex < filteredResults.length;
          
          setSearchResults(paginatedResults);
          setSearchTotalPages(calculatedTotalPages);
          setSearchTotalItems(filteredResults.length);
          setSearchHasNextPage(calculatedHasNextPage);
          setSearchHasPreviousPage(false);
          setSearchCurrentPage(1);
          setSearchLastDoc(null);
          setSearchHasMore(false);
          setIsSearching(false);
          
          return; // Skip API call, use in-memory results
        }
      }
    }
    
    // Skip duplicate search only if we already have results for this exact term
    // We don't check "search in progress" because:
    // 1. Debouncing already prevents rapid calls
    // 2. Race condition protection handles stale results
    // 3. Multiple searches for the same term are harmless (race condition protection will handle it)
    if (!loadMore && hasResultsForThisTerm && termAtStart !== '') {
      return; // Already have results for this term, skip
    }
    
    // Mark this search term as being processed
    if (!loadMore) {
      currentSearchTermRef.current = termAtStart;
    }
    
    if (loadMore) {
      setIsLoadingMore(true);
    } else {
      setIsSearching(true);
      // Don't clear results immediately - wait until we have new results ready
      // This prevents showing zero results while user is editing the search term
      setSearchLastDoc(null);
      setSearchHasMore(false);
    }
      
      try {
        // Use unified search for consistent results
      // Fetch a larger first batch to reduce extra roundtrips while keeping pagination client-side
      const searchLimit = 2000;
      
      // If category filter is set, search within that category for maximum results
      // Otherwise, search all categories
      const searchCategory = (selectedCategory && selectedCategory !== 'all') ? selectedCategory : 'all';
        
        // Run main search and secondary searches (deleted/activated) in PARALLEL for speed
        const endsWithFlag = endsWithToggle && /^\d{2,5}$/.test(debouncedSearchTerm.trim());
        const mainSearchPromise = unifiedSearch.search(debouncedSearchTerm, {
          category: searchCategory,
          limit: searchLimit,
          startAfter: loadMore ? searchLastDoc : null,
          includeStale: false,
          endsWith: endsWithFlag
        });

        // Only search deletedNumbers and activatedNumbers on first search, not on loadMore
        // (they don't support cursor pagination and would return the same results)
        let deletedResults: NumberPoolType[] = [];
        let activatedResults: NumberPoolType[] = [];
        let result: Awaited<ReturnType<typeof unifiedSearch.search>>;

        if (!loadMore) {
          const [mainResult, deletedResult, activatedResult] = await Promise.all([
            mainSearchPromise,
            searchDeletedNumbers(debouncedSearchTerm, searchCategory, endsWithFlag),
            searchActivatedNumbers(debouncedSearchTerm, searchCategory, endsWithFlag)
          ]);
          result = mainResult;
          deletedResults = deletedResult;
          activatedResults = activatedResult;
        } else {
          result = await mainSearchPromise;
        }
        
        // Avoid race conditions: only apply if term hasn't changed
      // Check both the trimmed version and the original to handle whitespace differences
      const currentTerm = debouncedSearchTerm.trim();
      
      // Only process results if this search is still relevant (term hasn't changed)
      if (termAtStart === currentTerm && termAtStart !== '') {
          let filteredResults = filterByVisibility(result.data);
          
          // Add deleted numbers to results (they already have status 'returned')
          filteredResults = [...filteredResults, ...deletedResults];

        // Add activated numbers to results (they already have status 'activated')
        filteredResults = [...filteredResults, ...activatedResults];
        
        // Store the original unfiltered results for in-memory filtering
        const originalUnfilteredResults = [...filteredResults];
        
        // Apply category filter in memory (only if we searched 'all' categories)
        // If we already searched within a specific category, skip this filter
        if (searchCategory === 'all' && selectedCategory && selectedCategory !== 'all') {
          filteredResults = filteredResults.filter(n => n.category === selectedCategory);
        }
          
          // Apply group filter
          if (selectedGroup) {
            filteredResults = filteredResults.filter(n => n.group === selectedGroup);
          }
          
          // Apply initials filter
          if (selectedInitials) {
            filteredResults = filteredResults.filter(n => (n.number || '').startsWith(selectedInitials));
          }
          
        if (loadMore) {
          // Append new results to existing ones, deduplicating by id
          const existingOriginal = (fullSearchResultsRef.current as any).originalUnfilteredResults || fullSearchResultsRef.current;
          const existingIds = new Set(existingOriginal.map((n: NumberPoolType) => n.id));
          const newUniqueResults = originalUnfilteredResults.filter((n: NumberPoolType) => !existingIds.has(n.id));
          const combinedOriginalResults = [...existingOriginal, ...newUniqueResults];
          
          // Re-apply all filters to combined results
          let combinedFiltered = [...combinedOriginalResults];
          // Apply category filter only if we searched 'all' categories
          if (searchCategory === 'all' && selectedCategory && selectedCategory !== 'all') {
            combinedFiltered = combinedFiltered.filter(n => n.category === selectedCategory);
          }
          if (selectedGroup) {
            combinedFiltered = combinedFiltered.filter(n => n.group === selectedGroup);
          }
          if (selectedInitials) {
            combinedFiltered = combinedFiltered.filter(n => (n.number || '').startsWith(selectedInitials));
          }
          
          fullSearchResultsRef.current = combinedFiltered;
          // Store original unfiltered results for future in-memory filtering
          (fullSearchResultsRef.current as any).originalUnfilteredResults = combinedOriginalResults;
          // Preserve search metadata for pagination checks
          (fullSearchResultsRef.current as any).lastSearchTerm = currentTerm;
          (fullSearchResultsRef.current as any).lastCategory = selectedCategory;
          (fullSearchResultsRef.current as any).lastGroup = selectedGroup;
          (fullSearchResultsRef.current as any).lastInitials = selectedInitials;
          (fullSearchResultsRef.current as any).lastEndsWithToggle = endsWithToggle;
          
          // Update pagination
          const startIndex = (searchCurrentPage - 1) * pageSize;
          const endIndex = startIndex + pageSize;
          const paginatedResults = combinedFiltered.slice(startIndex, endIndex);
          
          setSearchResults(paginatedResults);
          setSearchTotalPages(Math.ceil(combinedFiltered.length / pageSize));
          setSearchTotalItems(combinedFiltered.length);
          setSearchHasNextPage(endIndex < combinedFiltered.length);
          setSearchHasPreviousPage(searchCurrentPage > 1);
          
          // Update hasMore from the search result: if no new unique results came, stop showing Load More
          setSearchLastDoc(result.lastDoc);
          setSearchHasMore(result.hasMore && newUniqueResults.length > 0);
          
          // Scroll to top after loading more results
          setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }, 0);
        } else {
          // New search - replace results
          // Double-check term hasn't changed before applying results
          const finalCheckTerm = debouncedSearchTerm.trim();
          const currentRefTerm = currentSearchTermRef.current;
          
          // Only apply results if:
          // 1. The term hasn't changed (termAtStart === finalCheckTerm)
          // 2. The ref still matches this term (termAtStart === currentRefTerm)
          // This prevents stale searches from overwriting newer results
          if (termAtStart === finalCheckTerm && termAtStart === currentRefTerm && termAtStart !== '') {
          fullSearchResultsRef.current = filteredResults;
            // Store original unfiltered results for future in-memory filtering
            (fullSearchResultsRef.current as any).originalUnfilteredResults = originalUnfilteredResults;
            (fullSearchResultsRef.current as any).lastSearchTerm = finalCheckTerm;
          (fullSearchResultsRef.current as any).lastCategory = selectedCategory;
          (fullSearchResultsRef.current as any).lastGroup = selectedGroup;
          (fullSearchResultsRef.current as any).lastInitials = selectedInitials;
          (fullSearchResultsRef.current as any).lastEndsWithToggle = endsWithToggle;
          
          // For new searches, always start at page 1
          const pageForNewSearch = 1;
          const startIndex = (pageForNewSearch - 1) * pageSize;
          const endIndex = startIndex + pageSize;
          const paginatedResults = filteredResults.slice(startIndex, endIndex);
          
          const calculatedTotalPages = Math.ceil(filteredResults.length / pageSize);
          const calculatedHasNextPage = endIndex < filteredResults.length;
          
          setSearchResults(paginatedResults);
          setSearchTotalPages(calculatedTotalPages);
          setSearchTotalItems(filteredResults.length);
          setSearchHasNextPage(calculatedHasNextPage);
          setSearchHasPreviousPage(false); // Always false for page 1
          
          // Ensure we're on page 1 for new searches
          setSearchCurrentPage(1);
        
        // Store cursor and hasMore for "Load More" button
        setSearchLastDoc(result.lastDoc);
        setSearchHasMore(result.hasMore);
          }
          // If term changed during search, don't apply results - keep showing previous results
        }
      } else {
        // Search term changed during async operation - don't apply stale results
        // The new search will handle updating results when it completes
        // Don't clear existing results here to avoid showing empty state
        // Clear the ref so a new search for the changed term can proceed
        if (termAtStart !== debouncedSearchTerm.trim()) {
          currentSearchTermRef.current = '';
        }
        }
      } catch (error) {
        console.error('Search error:', error);
        // Only show error if this search term is still current
        if (termAtStart === debouncedSearchTerm.trim()) {
        toast.error('Search failed');
        }
        // Clear the ref on error so user can retry
        currentSearchTermRef.current = '';
      } finally {
        // Only clear loading state if this search term is still current
        const finalTerm = debouncedSearchTerm.trim();
        if (termAtStart === finalTerm || termAtStart === '') {
          setIsSearching(false);
        setIsLoadingMore(false);
          // Keep ref set to current term if search completed successfully
          if (termAtStart === finalTerm && finalTerm !== '') {
            // Ref already set, keep it
          } else {
            // Clear ref if search was cancelled or term is empty
            currentSearchTermRef.current = '';
          }
        } else {
          // Term changed during search - clear loading state and ref
          setIsSearching(false);
          setIsLoadingMore(false);
          currentSearchTermRef.current = '';
        }
      }
  }, [debouncedSearchTerm, selectedCategory, selectedGroup, selectedInitials, searchCurrentPage, pageSize, searchLastDoc, endsWithToggle, searchDeletedNumbers, searchActivatedNumbers]);

  // DISABLED: Real-time listeners for search results
  // Search already fetches fresh data, no need for additional real-time listeners
  // This prevents "400 Bad Request" errors from too many concurrent Firebase connections
  useEffect(() => {
    // Cleanup any existing search listeners
    const unsubs = searchVisibleUnsubsRef.current;
      for (const fn of unsubs.values()) fn();
      unsubs.clear();
    
    return () => {
      for (const fn of unsubs.values()) fn();
      unsubs.clear();
    };
  }, []); // Run once on mount/unmount only

  // Load stats for total pages (OPTIMIZED) - Mobile performance
  useEffect(() => {
    let isMounted = true;
    let unsubStats: (() => void) | undefined;
    
    const loadStats = async () => {
      try {
        const totalPages = await numberPoolStatsService.getTotalPages(pageSize, selectedCategory || undefined, selectedGroup || undefined, selectedInitials || undefined);
        if (isMounted) {
          setStatsTotalPages(totalPages);
        }
      } catch (error) {
        // no-op
      }
    };

    loadStats();
    // Subscribe to live updates and hydrate when stats change
    unsubStats = numberPoolStatsService.subscribeToStats(async (stats) => {
      if (!isMounted) return;
      const totalPages = await numberPoolStatsService.getTotalPages(pageSize, selectedCategory || undefined, selectedGroup || undefined, selectedInitials || undefined);
      const totalItems = await numberPoolStatsService.getTotalItems(selectedCategory || undefined, selectedGroup || undefined, selectedInitials || undefined);
      if (isMounted) {
        setStatsTotalPages(totalPages);
        setStatsTotalItems(totalItems || 0);
      }
    });

    // Refresh on tab focus and on upload invalidation to bypass stale cache
    const onFocus = () => {
      numberPoolStatsService.clearCache();
      loadStats();
    };
    const onVis = () => { if (document.visibilityState === 'visible') onFocus(); };
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'npInvalidate') {
        numberPoolStatsService.clearCache();
        loadStats();
      }
    };
    window.addEventListener('visibilitychange', onVis);
    window.addEventListener('storage', onStorage);
    
    return () => {
      isMounted = false;
      if (unsubStats) unsubStats();
      window.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('storage', onStorage);
    };
  }, [pageSize, selectedCategory, selectedGroup, selectedInitials]);

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
      (error) => {
        // ✅ FIX: Handle permission errors gracefully during logout
        if (error.code === 'permission-denied') {
          // User logged out or lost permissions - cleanup silently
          return;
        }
        
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
        }, (error) => {
          // ✅ FIX: Handle permission errors gracefully during logout
          if (error.code === 'permission-denied') {
            // User logged out or lost permissions - cleanup silently
            return;
          }
          
          console.error('Error in NumberPool fallback listener:', error);
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
  }, [selectedCategory, selectedGroup, selectedInitials, pageSize]);

  // Enforce allowed group for agents (pre-applied filter)
  useEffect(() => {
    if (allowedGroups && allowedGroups.length > 0) {
      setSelectedGroup(prev => {
        if (prev && allowedGroups.includes(prev)) return prev;
        return allowedGroups[0];
      });
    }
  }, [allowedGroups]);

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
      // Scroll to top of the page after a brief delay to ensure content is updated
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 0);
    }
  }, [searchHasNextPage]);

  const goToPreviousSearchPage = useCallback(() => {
    if (searchHasPreviousPage) {
      setSearchCurrentPage(prev => prev - 1);
      // Scroll to top of the page after a brief delay to ensure content is updated
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 0);
    }
  }, [searchHasPreviousPage]);

  const goToSearchPage = useCallback((page: number) => {
    if (page >= 1 && page <= searchTotalPages) {
      setSearchCurrentPage(page);
      // Scroll to top of the page after a brief delay to ensure content is updated
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 0);
    }
  }, [searchTotalPages]);

  // ===============================================================================
  // AGENT UTILITIES CALLBACKS
  // ===============================================================================
  
  /**
   * Toggle bulk copy mode and clear selections when turning off
   */
  const toggleBulkCopyMode = useCallback(() => {
    setBulkCopyMode(prev => !prev);
    if (bulkCopyMode) {
      setSelectedNumbers([]);
    }
  }, [bulkCopyMode]);
  
  /**
   * Toggle number selection for bulk copy
   * Also automatically adds/removes number from notepad (with duplicate check)
   */
  const toggleNumberSelection = useCallback((numberId: string, phoneNumber: string, numberStatus?: string) => {
    setSelectedNumbers(prev => {
      const isCurrentlySelected = prev.includes(numberId);
      
      if (isCurrentlySelected) {
        // Remove from selection and notepad
        setNotepadContent(currentContent => {
          const lines = currentContent.split('\n');
          const filteredLines = lines.filter(line => line.trim() !== phoneNumber);
          return filteredLines.join('\n');
        });
        return prev.filter(id => id !== numberId);
      } else {
        // Check if number status is not open or reserved, show warning (after state update)
        if (numberStatus && numberStatus !== 'open' && numberStatus !== 'reserved') {
          const statusLabel = formatStatusLabel(numberStatus);
          // Use setTimeout to avoid updating during render
          setTimeout(() => {
            setBulkCopyWarningMessage(`Number status is "${statusLabel}". Only open and reserved numbers are recommended for bulk copy.`);
            setShowBulkCopyWarning(true);
          }, 0);
        }
        
        // Add to selection and notepad (check for duplicates)
        setNotepadContent(currentContent => {
          const trimmedContent = currentContent.trim();
          
          // Check if number already exists
          const existingLines = trimmedContent ? trimmedContent.split('\n').map(l => l.trim()) : [];
          if (existingLines.includes(phoneNumber)) {
            // Number already exists, don't add again
            return currentContent;
          }
          
          if (trimmedContent === '') {
            return phoneNumber;
          }
          return trimmedContent + '\n' + phoneNumber;
        });
        return [...prev, numberId];
      }
    });
  }, [formatStatusLabel]);
  
  /**
   * Select all visible numbers on current page
   * Also adds all numbers to notepad
   */
  const selectAllVisible = useCallback(() => {
    const visibleNumbers = debouncedSearchTerm.trim() ? searchResults : numbers;
    const allIds = visibleNumbers.map(n => n.id);
    const allPhoneNumbers = visibleNumbers.map(n => n.number).join('\n');
    
    // Check for numbers that are not open or reserved and show warning (before state update)
    const nonOpenReservedNumbers = visibleNumbers.filter(n => n.status && n.status !== 'open' && n.status !== 'reserved');
    if (nonOpenReservedNumbers.length > 0) {
      const statusCounts = new Map<string, number>();
      nonOpenReservedNumbers.forEach(n => {
        const status = n.status || 'unknown';
        statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
      });
      
      const statusMessages = Array.from(statusCounts.entries())
        .map(([status, count]) => `${formatStatusLabel(status)}: ${count}`)
        .join(', ');
      
      // Use setTimeout to avoid updating during render
      setTimeout(() => {
        setBulkCopyWarningMessage(`${nonOpenReservedNumbers.length} number(s) with status "${statusMessages}" selected. Only open and reserved numbers are recommended for bulk copy.`);
        setShowBulkCopyWarning(true);
      }, 0);
    }
    
    setSelectedNumbers(allIds);
    
    // Add all numbers to notepad
    setNotepadContent(currentContent => {
      const trimmedContent = currentContent.trim();
      if (trimmedContent === '') {
        return allPhoneNumbers;
      }
      // Only add numbers that aren't already in the notepad
      const existingLines = new Set(trimmedContent.split('\n').map(l => l.trim()));
      const newNumbers = visibleNumbers
        .map(n => n.number)
        .filter(num => !existingLines.has(num))
        .join('\n');
      
      if (newNumbers) {
        return trimmedContent + '\n' + newNumbers;
      }
      return trimmedContent;
    });
  }, [numbers, searchResults, debouncedSearchTerm, formatStatusLabel]);
  
  /**
   * Clear selected numbers (they're already in notepad)
   */
  const clearSelectedNumbers = useCallback(() => {
    if (selectedNumbers.length === 0) {
      return;
    }
    
    setSelectedNumbers([]);
    setBulkCopyMode(false);
    toast.success(`${selectedNumbers.length} number${selectedNumbers.length > 1 ? 's' : ''} added to notepad`);
  }, [selectedNumbers]);

  /**
   * Handle textarea input with smart line break after 10 digits
   */
  const handleNotepadInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    let value = e.target.value;
    const cursorPosition = e.target.selectionStart;
    
    // Get the current line (text from last newline to cursor)
    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastNewlineIndex = textBeforeCursor.lastIndexOf('\n');
    const currentLine = textBeforeCursor.substring(lastNewlineIndex + 1);
    
    // Count only digits in current line
    const digitCount = (currentLine.match(/\d/g) || []).length;
    
    // If exactly 10 digits and user just typed a digit, add newline
    if (digitCount === 10 && /^\d+$/.test(currentLine)) {
      const textAfterCursor = value.substring(cursorPosition);
      value = textBeforeCursor + '\n' + textAfterCursor;
      setNotepadContent(value);
      
      // Set cursor position after the newline
      setTimeout(() => {
        const newCursorPos = cursorPosition + 1;
        e.target.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    } else {
      setNotepadContent(value);
    }
  }, []);

  /**
   * Copy notepad content with WhatsApp formatting (bold with asterisks and optional empty lines)
   */
  const copyNotepadContent = useCallback(async () => {
    if (!notepadContent.trim()) {
      toast.error('Notepad is empty');
      return;
    }
    
    setIsCopyingNotepad(true);
    
    try {
      // Get all non-empty lines
      const lines = notepadContent.split('\n').filter(line => line.trim());
      
      // Format each number with asterisks for WhatsApp bold
      const formattedNumbers = lines.map(line => `*${line.trim()}*`);
      
      // Join with blank lines if toggle is on, otherwise single newline
      const separator = whatsappBlankLines ? '\n\n' : '\n';
      const finalText = formattedNumbers.join(separator);
      
      await navigator.clipboard.writeText(finalText);
      
      // Show success state
      setNotepadCopied(true);
      toast.success(`✅ Copied ${lines.length} number${lines.length > 1 ? 's' : ''} (WhatsApp formatted)`);
      
      // Reset success state after 2 seconds
      setTimeout(() => {
        setNotepadCopied(false);
      }, 2000);
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    } finally {
      setIsCopyingNotepad(false);
    }
  }, [notepadContent, whatsappBlankLines]);


  // Get display pagination info
  const displayPagination = useMemo(() => {
    if (debouncedSearchTerm.trim()) {
      const pagination = {
        currentPage: searchCurrentPage,
        totalPages: searchTotalPages,
        totalItems: searchTotalItems,
        hasNextPage: searchHasNextPage,
        hasPreviousPage: searchHasPreviousPage
      };
      return pagination;
    }
    // When a category OR group is selected, use actual pagination totalPages (from count query or stats service)
    // This ensures accurate pagination for filtered views
    if (selectedCategory || selectedGroup) {
    return {
      currentPage,
        totalPages,
      totalItems,
      hasNextPage,
      hasPreviousPage
    };
    }
    // For "all categories" view, prefer stats service (faster)
    return {
      currentPage,
      totalPages: statsTotalPages > 0 ? statsTotalPages : totalPages,
      totalItems: statsTotalItems > 0 ? statsTotalItems : totalItems,
      hasNextPage,
      hasPreviousPage
    };
  }, [debouncedSearchTerm, searchCurrentPage, searchTotalPages, searchTotalItems, searchHasNextPage, searchHasPreviousPage, currentPage, totalPages, totalItems, hasNextPage, hasPreviousPage, statsTotalPages, statsTotalItems, selectedCategory, selectedGroup, selectedInitials]);

  // Compute reservation cap state from the dedicated reservedNumbers listener
  useEffect(() => {
    setHasReservation(reservedNumbers.length >= MAX_RESERVATIONS);
  }, [reservedNumbers]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory, selectedGroup, selectedInitials, pageSize]);

  // Enforce allowed group for agents (pre-applied filter)
  useEffect(() => {
    if (allowedGroups && allowedGroups.length > 0) {
      setSelectedGroup(prev => {
        if (prev && allowedGroups.includes(prev)) return prev;
        return allowedGroups[0];
      });
    }
  }, [allowedGroups]);

  useEffect(() => {
    if (propSelectedCategory !== undefined) {
      setSelectedCategory(propSelectedCategory);
    }
  }, [propSelectedCategory]);

  // Edit number functionality
  const openEditModal = (number: NumberPoolType) => {
    // Double-check permission before opening modal - explicitly exclude agents
    if (!canEditNumbers()) {
      toast.error('You do not have permission to edit numbers');
      return;
    }
    
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

  // Prevent body scroll when edit dialog is open
  useEffect(() => {
    if (showEditDialog) {
      // Save current scroll position
      const scrollY = window.scrollY;
      // Lock body scroll
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      
      return () => {
        // Restore scroll position when modal closes
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [showEditDialog]);

  const handleUpdateNumber = async () => {
    // Explicit permission check at function start - explicitly exclude agents
    if (!canEditNumbers()) {
      toast.error('You do not have permission to edit numbers');
      return;
    }
    
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
    if (canEditNumbers() && !editPoolPasscode.trim()) {
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

      // Check if number is from deletedNumbers collection
      const isFromDeletedNumbers = (editingNumber as any)?.isDeleted === true;
      
      // If number is from deletedNumbers and status is being set to 'open', move it back to numberPool
      if (isFromDeletedNumbers && editPoolStatus === 'open') {
        const deletedNumberRef = doc(db, 'deletedNumbers', editingNumber.id);
        const deletedNumberDoc = await getDoc(deletedNumberRef);
        
        if (!deletedNumberDoc.exists()) {
          toast.error('Number not found in return numbers');
          return;
        }

        const deletedNumberData = deletedNumberDoc.data();
        const batch = writeBatch(db);
        
        // Prepare number data for numberPool (remove deletedNumbers-specific fields)
        const { deletedAt, originalId, originalCollection, ...numberData } = deletedNumberData;
        const numberPoolData: any = {
          ...numberData,
          number: num,
          category: cat,
          code,
          group: group.trim(),
          status: 'open',
          lastStatusChange: serverTimestamp(),
          reservedBy: null,
          reservedAt: null,
          expiresAt: null,
          claimingAgentId: null,
          claimingStartedAt: null,
          claimingExpiresAt: null,
          claimQueue: [],
          originalAgentId: null,
          originalReservedAt: null,
          originalExpiresAt: null
        };

        // Add passcode for admin/coordinator
        if (canEditNumbers()) {
          numberPoolData.passcode = editPoolPasscode.trim();
        }
        // Handle team visibility
        if (canEditNumbers()) {
          if (editPoolTeamVisibility.trim()) {
            numberPoolData.teamVisibility = editPoolTeamVisibility.trim();
          } else {
            numberPoolData.teamVisibility = null;
          }
        }
        
        // Create document in numberPool collection
        const numberPoolRef = doc(db, 'numberPool', editingNumber.id);
        batch.set(numberPoolRef, numberPoolData);
        
        // Delete from deletedNumbers
        batch.delete(deletedNumberRef);
        
        await batch.commit();

        // Log the number restoration
        await logNumberAction(
          editingNumber.id,
          editingNumber.number || num,
          'created',
          { status: 'returned' },
          { status: 'open' },
          `Number restored from return numbers and moved back to numberPool`
        );
        
        toast.success('Number restored and moved back to number pool!');
        await refreshNumberData(editingNumber.id);
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
        return;
      }

      // If status is being set to 'returned', delete number and add to deletedNumbers
      if (editPoolStatus === 'returned') {
        const numberRef = doc(db, 'numberPool', editingNumber.id);
        const numberDoc = await getDoc(numberRef);
        
        if (!numberDoc.exists()) {
          toast.error('Number not found');
          return;
        }

        const numberData = numberDoc.data();
        const batch = writeBatch(db);
        
        // Create document in deletedNumbers collection with status "returned"
        const deletedNumberRef = doc(db, 'deletedNumbers', editingNumber.id);
        batch.set(deletedNumberRef, {
          ...numberData,
          status: 'returned',
          deletedAt: serverTimestamp(),
          originalId: editingNumber.id,
          originalCollection: 'numberPool'
        });
        
        // Delete from numberPool
        batch.delete(numberRef);
        
        await batch.commit();

        // Log the number deletion
        await logNumberAction(
          editingNumber.id,
          editingNumber.number || num,
          'deleted',
          { status: numberData?.status },
          { status: 'returned' },
          `Number marked as returned and moved to return numbers`
        );
        
        toast.success('Number returned and moved to return numbers!');
        await refreshNumberData(editingNumber.id);
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
        return;
      }

      // For numbers in numberPool, update normally
      const numberData: any = {
        number: num,
        category: cat,
        code,
        group: group.trim(),
        status: editPoolStatus,
        lastStatusChange: serverTimestamp()
      };

      // If status is being set to 'open', clear all reserved data (for admin or coordinator)
      if (editPoolStatus === 'open' && canEditNumbers()) {
        numberData.reservedBy = null;
        numberData.reservedAt = null;
        numberData.expiresAt = null;
        numberData.claimingAgentId = null;
        numberData.claimingStartedAt = null;
        numberData.claimingExpiresAt = null;
        numberData.claimQueue = [];
        numberData.originalAgentId = null;
        numberData.originalReservedAt = null;
        numberData.originalExpiresAt = null;
      }

      // Add passcode for admin/coordinator
      if (canEditNumbers()) {
        numberData.passcode = editPoolPasscode.trim();
      }
      // Handle team visibility - set to empty string if cleared, or to the selected team ID
      if (canEditNumbers()) {
      if (editPoolTeamVisibility.trim()) {
        numberData.teamVisibility = editPoolTeamVisibility.trim();
        } else {
          // Clear team visibility to make it visible to all teams
          numberData.teamVisibility = null;
        }
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
      await refreshNumberData(editingNumber.id);
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

      // Combine all sources: current page numbers, reserved section numbers, search results, and "being claimed" numbers
      const mergedMap = new Map<string, NumberPoolType>();
      numbers.forEach(n => mergedMap.set(n.id, n));
      reservedNumbers.forEach(n => mergedMap.set(n.id, n));
      searchResults.forEach(n => mergedMap.set(n.id, n));
      myBeingClaimedNumbers.forEach(n => mergedMap.set(n.id, n));
      

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
        } else if (number.claimQueue && number.claimQueue.length > 0) {
          // If not actively claiming but there is a queue, show timer based on position (15 min slots)
          const position = number.claimQueue.findIndex((c: any) => c.agentId === user?.id);
          if (position >= 0) {
            const timeLeft = Math.max(0, CLAIM_TIMEOUT * (position + 1));
            newClaimCountdowns[number.id] = timeLeft;
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
    }, (error) => {
      // ✅ FIX: Handle permission errors gracefully during logout
      if (error.code === 'permission-denied') {
        // User logged out or lost permissions - cleanup silently
        return;
      }
      
      console.error('Error in NumberPool status checks listener:', error);
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
        const leadStatus = data.status;
        
        // Only include numbers from ACTIVE leads (not rejected, non_verified, etc.)
        // Active lead statuses: verified, activated, activated_non_verified, assigned_to_cord, pending_verification, follow_up
        const activeLeadStatuses = ['verified', 'activated', 'activated_non_verified', 'assigned_to_cord', 'pending_verification', 'follow_up', 'assigned'];
        
        if (activeLeadStatuses.includes(leadStatus) && Array.isArray(data.plans)) {
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

    // Category filter is handled server-side by numberPoolManager
    // No need to filter client-side as manager already returns filtered results

    // Team visibility for agents
    if (user?.role === 'agent' && user.teamId) {
      if (number.teamVisibility && number.teamVisibility !== user.teamId) return false;
    }

    // Search filter (only when actively searching, not for category changes)
    if (searchTerm && debouncedSearchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matches =
        number.number.toLowerCase().includes(searchLower) ||
        number.category.toLowerCase().includes(searchLower) ||
        number.code.toLowerCase().includes(searchLower);
      if (!matches) return false;
    }

    // Prefix/initials filter (e.g., 050/054/056)
    if (selectedInitials && !number.number?.startsWith(selectedInitials)) {
      return false;
    }

    return true;
  }, [isAdmin, user?.role, user?.teamId, searchTerm, debouncedSearchTerm, selectedInitials]);

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

  // Apply column sort to search results as well (entire result set, not just current page)
  useEffect(() => {
    if (!debouncedSearchTerm.trim()) return;
    const full = fullSearchResultsRef.current;
    if (!full || full.length === 0) return;

    // Preserve all metadata from cached results
    const lastSearchTerm = (full as any).lastSearchTerm;
    const lastCategory = (full as any).lastCategory;
    const lastGroup = (full as any).lastGroup;
    const lastInitials = (full as any).lastInitials;
    const lastEndsWithToggle = (full as any).lastEndsWithToggle;

    const sortedFull = computeSorted(full);
    // Preserve all metadata
    (sortedFull as any).lastSearchTerm = lastSearchTerm;
    (sortedFull as any).lastCategory = lastCategory;
    (sortedFull as any).lastGroup = lastGroup;
    (sortedFull as any).lastInitials = lastInitials;
    (sortedFull as any).lastEndsWithToggle = lastEndsWithToggle;
    fullSearchResultsRef.current = sortedFull as any;

    const startIndex = (searchCurrentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedResults = sortedFull.slice(startIndex, endIndex);
    
    const calculatedTotalPages = Math.ceil(sortedFull.length / pageSize);
    const calculatedHasNextPage = endIndex < sortedFull.length;
    const calculatedHasPreviousPage = searchCurrentPage > 1;

    setSearchResults(paginatedResults);
    setSearchTotalPages(calculatedTotalPages);
    setSearchTotalItems(sortedFull.length);
    setSearchHasNextPage(calculatedHasNextPage);
    setSearchHasPreviousPage(calculatedHasPreviousPage);
  }, [sortConfig, searchCurrentPage, pageSize, debouncedSearchTerm, computeSorted]);

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

  // Auto-recovery: if nothing is visible but stats indicate there are items, attempt a re-initialize
  // Only trigger if we're not currently loading and haven't just initialized
  useEffect(() => {
    // Only attempt recovery if:
    // 1. Not currently loading
    // 2. Display is empty
    // 3. Stats show items exist
    // 4. User is logged in
    // 5. Haven't already attempted recovery for this state
    if (!user?.id) {
      recoveryAttemptedRef.current = false;
      return;
    }

    if (!loading && displayNumbers.length === 0 && (statsTotalItems > 0)) {
      const currentState = numberPoolManager.getState();
      // Don't recover if we just reset or are initializing
      if (currentState?.isLoading) {
        return;
      }
      
      // Prevent multiple recovery attempts
      if (recoveryAttemptedRef.current) {
        return;
      }
      
      recoveryAttemptedRef.current = true;
      
      // Use a gentler approach - just re-initialize instead of force reset
      setTimeout(() => {
        if (user?.id) {
          // Mark as not initialized so it will reload
          numberPoolManager.initialize(selectedCategory, pageSize, user.id, user.role, selectedGroup, selectedInitials).catch(() => {
            recoveryAttemptedRef.current = false; // Allow retry on error
          }).finally(() => {
            // Reset recovery flag after a delay to allow future recoveries if needed
            setTimeout(() => {
              recoveryAttemptedRef.current = false;
            }, 5000);
          });
        }
      }, 1000);
    } else {
      // Reset recovery flag if conditions change
      recoveryAttemptedRef.current = false;
    }
  }, [loading, displayNumbers.length, statsTotalItems, selectedCategory, selectedGroup, selectedInitials, pageSize, user?.id, user?.role]);

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
      console.error('[NumberPool] Reserve: active status check failed', { number: number.number, id: number.id, error });
      toast.dismiss('number-check');
      toast.error('Failed to verify number status. Please try again.', {
        duration: 3000
      });
      setCheckingReserveId(null);
      return;
    }
    
    setCheckingReserveId(null);

    try {
      const numberRef = doc(db, 'numberPool', number.id);
      const latestSnapshot = await getDoc(numberRef);
      if (latestSnapshot.exists()) {
        const latestData = latestSnapshot.data();
        const latestStatus = latestData.status as NumberStatus | undefined;
        // Number is reservable if status is 'open' - reservedBy field doesn't matter for open numbers
        const isReservable = latestStatus === 'open';

        if (!isReservable) {
          setReserveConflictInfo({
            number: latestData.number || number.number,
            status: latestStatus,
            reservedByName: null
          });
          setShowReserveConflictDialog(true);
          await refreshNumberData(number.id);
          return;
        }
      }
    } catch (error) {
      console.error('Error validating latest number status before reserve:', error);
    }

    setReserveConflictInfo(null);
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
        
        // Refresh with latest data from Firestore
        await refreshNumberData(numberToReserve.id);
        
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

          // Send notification to the next claiming agent with their effective window
          const nextClaimIdx = claimQueue.findIndex((c: any) => nextClaim && c.agentId === nextClaim.agentId);
          const nextClaimMinutes = Math.round((CLAIM_TIMEOUT / 60000) * (nextClaimIdx >= 0 ? nextClaimIdx + 1 : 1));
          await addDoc(collection(db, 'notifications'), {
            userId: nextClaim.agentId,
            type: 'number_claimed',
            title: 'Number Claim Started',
            message: `The number is now available for your claim. You have ${nextClaimMinutes} minutes to take ownership.`,
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

      // Refresh with latest data from Firestore after all updates complete
      await refreshNumberData(selectedNumber.id);
      
      toast.success('Number released successfully');
      
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

  /** Cancel my pending strike on this number (set my claim to cancelled). */
  const handleCancelStrike = async (number: NumberPoolType) => {
    if (!user?.id) return;
    const claims = (number as any).claims || [];
    const myPending = claims.find((c: any) => c.userId === user.id && c.status === 'pending');
    if (!myPending) return;
    if (cancellingNumbers.has(number.id)) return;
    setCancellingNumbers(prev => new Set(prev).add(number.id));
    try {
      const numberRef = doc(db, 'numberPool', number.id);
      const updatedClaims = claims.map((c: any) =>
        c.userId === user.id && c.status === 'pending' ? { ...c, status: 'cancelled' as const } : c
      );
      await updateDoc(numberRef, { claims: updatedClaims });
      toast.success('Strike cancelled');
      await logNumberAction(
        number.id,
        number.number || '',
        'claimed',
        { claims },
        { claims: updatedClaims },
        'Strike cancelled by agent'
      );
      await refreshNumberData(number.id);
    } catch (e) {
      console.error(e);
      toast.error('Failed to cancel strike');
    } finally {
      setCancellingNumbers(prev => { const s = new Set(prev); s.delete(number.id); return s; });
    }
  };

  /** Leave claim queue (or give up claiming window) for this number. */
  const handleCancelQueue = async (number: NumberPoolType) => {
    if (!user?.id) return;
    const claimQueue = number.claimQueue || [];
    const inQueue = claimQueue.some((c: any) => c.agentId === user.id);
    if (!inQueue) return;
    if (cancellingNumbers.has(number.id)) return;
    setCancellingNumbers(prev => new Set(prev).add(number.id));
    try {
      const numberRef = doc(db, 'numberPool', number.id);
      const numberDoc = await getDoc(numberRef);
      if (!numberDoc.exists()) throw new Error('Number not found');
      const data = numberDoc.data();
      const queue = (data.claimQueue || []).filter((c: any) => c.agentId !== user.id);
      const isCurrentClaimer = data.claimingAgentId === user.id;
      const nextClaim = queue[0];
      const now = new Date();
      const updatePayload: Record<string, unknown> = {
        claimQueue: queue,
        lastStatusChange: serverTimestamp(),
      };
      if (isCurrentClaimer) {
        updatePayload.claimingAgentId = nextClaim ? nextClaim.agentId : null;
        updatePayload.claimingStartedAt = nextClaim ? serverTimestamp() : null;
        updatePayload.claimingExpiresAt = nextClaim ? new Date(now.getTime() + CLAIM_TIMEOUT) : null;
      }
      await updateDoc(numberRef, updatePayload);
      toast.success('Left claim queue');
      await logNumberAction(
        number.id,
        number.number || '',
        'released',
        { claimQueue: number.claimQueue, claimingAgentId: (number as any).claimingAgentId },
        { claimQueue: queue, claimingAgentId: nextClaim?.agentId ?? null },
        'Agent left claim queue'
      );
      await refreshNumberData(number.id);
    } catch (e) {
      console.error(e);
      toast.error('Failed to leave queue');
    } finally {
      setCancellingNumbers(prev => { const s = new Set(prev); s.delete(number.id); return s; });
    }
  };

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
        
        querySnapshot.forEach((numberDoc) => {
          const numberData = numberDoc.data();
          
          // Create document in deletedNumbers collection with status "returned"
          const deletedNumberRef = doc(db, 'deletedNumbers', numberDoc.id);
          batch.set(deletedNumberRef, {
            ...numberData,
            status: 'returned',
            deletedAt: serverTimestamp(),
            originalId: numberDoc.id,
            originalCollection: 'numberPool'
          });
          
          // Delete from numberPool
          batch.delete(numberDoc.ref);
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

  const handleCheckDuplicates = async () => {
    if (!isAdmin()) {
      toast.error('Only administrators can check for duplicates');
      return;
    }

    try {
      setCheckingDuplicates(true);
      
      // Fetch all numbers from Firestore
      const numbersRef = collection(db, 'numberPool');
      const numbersSnapshot = await getDocs(numbersRef);
      
      // Group numbers by their number value
      const numberMap = new Map<string, NumberPoolType[]>();
      
      numbersSnapshot.forEach((doc) => {
        const data = doc.data() as NumberPoolType;
        const number = (data.number || '').trim();
        
        if (number) {
          if (!numberMap.has(number)) {
            numberMap.set(number, []);
          }
          numberMap.get(number)!.push({
            ...data,
            id: doc.id
          });
        }
      });
      
      // Find duplicates (numbers that appear more than once)
      const duplicates: Array<{ number: string; entries: NumberPoolType[] }> = [];
      
      numberMap.forEach((entries, number) => {
        if (entries.length > 1) {
          duplicates.push({ number, entries });
        }
      });
      
      // Sort by number of duplicates (most duplicates first)
      duplicates.sort((a, b) => b.entries.length - a.entries.length);
      
      setDuplicateNumbers(duplicates);
      setShowDuplicateDialog(true);
      
      if (duplicates.length === 0) {
        toast.success('No duplicate numbers found!');
      } else {
        toast.success(`Found ${duplicates.length} duplicate number(s)`);
      }
    } catch (error) {
      console.error('Error checking duplicates:', error);
      toast.error('Failed to check for duplicates');
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const handleDeleteSelectedDuplicates = async () => {
    if (!isAdmin()) {
      toast.error('Only administrators can delete numbers');
      return;
    }

    if (selectedDuplicateEntries.size === 0) {
      toast.error('Please select entries to delete');
      return;
    }

    try {
      setIsDeletingDuplicates(true);
      
      const entriesToDelete = Array.from(selectedDuplicateEntries);
      let deletedCount = 0;
      
      // Delete in batches of 30 (Firestore limit)
      const batchSize = 30;
      for (let i = 0; i < entriesToDelete.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = entriesToDelete.slice(i, i + batchSize);
        
        for (const entryId of chunk) {
          // Find the entry to get its details for logging
          let entryToLog: NumberPoolType | null = null;
          for (const duplicate of duplicateNumbers) {
            const found = duplicate.entries.find(e => e.id === entryId);
            if (found) {
              entryToLog = found;
              break;
            }
          }
          
          if (entryToLog) {
            // Get old data for logging
            const oldData = {
              number: entryToLog.number,
              category: entryToLog.category,
              code: entryToLog.code,
              group: entryToLog.group,
              status: entryToLog.status
            };
            
            // Delete the document
            const docRef = doc(db, 'numberPool', entryId);
            batch.delete(docRef);
            
            // Log the deletion
            await logNumberAction(
              entryId,
              entryToLog.number || '',
              'deleted',
              oldData,
              {},
              `Deleted duplicate number: ${entryToLog.number}`
            );
          }
        }
        
        await batch.commit();
        deletedCount += chunk.length;
      }
      
      toast.success(`Successfully deleted ${deletedCount} duplicate entry/entries`);
      
      // Remove deleted entries from local state
      setDuplicateNumbers(prev => 
        prev.map(duplicate => ({
          ...duplicate,
          entries: duplicate.entries.filter(e => !selectedDuplicateEntries.has(e.id))
        })).filter(duplicate => duplicate.entries.length > 1) // Remove if no longer duplicate
      );
      
      // Clear selection
      setSelectedDuplicateEntries(new Set());
      setShowDeleteDuplicatesDialog(false);
      
      // Refresh the numbers list
      // The real-time listener will update automatically
    } catch (error) {
      console.error('Error deleting duplicates:', error);
      toast.error('Failed to delete duplicate entries');
    } finally {
      setIsDeletingDuplicates(false);
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

    // Per-number claim queue cap
    const queueLength = number.claimQueue?.length || 0;
    if (queueLength >= 3) {
      toast.error('Claim queue full (3/3) for this number');
      return;
    }

    // Per-user daily claim limit (resets at UAE midnight)
    if (userClaimCount >= MAX_CLAIMS_PER_24H) {
      toast.error(`Daily claim limit reached (${MAX_CLAIMS_PER_24H} per day)`);
      return;
    }
    
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
    setStrikeBlockedSameTeam(false);
    setOpeningStrikeModalId(number.id);

    try {
      // For strike flow: check if number is in a lead owned by same-team agent (show in modal)
      const isStrikeFlow = ['assigned', 'verified', 'follow_up'].includes(number.status);
      if (isStrikeFlow && user.role === 'agent' && (number as any).leadId && user.teamId) {
        try {
          const leadDoc = await getDoc(doc(db, 'leads', (number as any).leadId));
          if (leadDoc.exists()) {
            const lead = leadDoc.data();
            const leadOwnerId = lead?.agentId;
            if (leadOwnerId && leadOwnerId !== user.id) {
              const ownerUserDoc = await getDoc(doc(db, 'users', leadOwnerId));
              const ownerTeamId = ownerUserDoc.data()?.teamId;
              if (ownerTeamId && ownerTeamId === user.teamId) {
                setStrikeBlockedSameTeam(true);
              }
            }
          }
        } catch {
          // ignore; modal will show normally (e.g. permission denied for other-team agent)
        }
      }

      setShowClaimDialog(true);
    } finally {
      setOpeningStrikeModalId(null);
    }
  }, [user?.id, user?.role, user?.teamId, claimingNumbers, lastClaimAttempts, userClaimCount]);

  const confirmClaim = async () => {
    if (!numberToClaim || !user?.id) return;

    // Prevent multiple simultaneous claims
    if (claimingNumbers.has(numberToClaim.id)) {
      return;
    }

    setClaimingNumbers(prev => new Set(prev.add(numberToClaim.id)));
    let claimSucceeded = false;
    
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
      if (['assigned', 'verified', 'follow_up'].includes(numberToClaim.status)) {
        const now = new Date();
        
        // Get current number data first
        const numberDoc = await getDoc(numberRef);
        if (!numberDoc.exists()) {
          throw new Error('Number not found');
        }

        const numberData = numberDoc.data();
          const claims = numberData.claims || [];

          // Same-team restriction: agents cannot strike on a number that is in a lead owned by someone from their team
          // If we get permission error (e.g. agent can't read lead/owner), allow strike (different team or unverifiable)
          if (user?.role === 'agent' && numberData.leadId && user.teamId) {
            try {
              const leadDoc = await getDoc(doc(db, 'leads', numberData.leadId));
              if (leadDoc.exists()) {
                const lead = leadDoc.data();
                const leadOwnerId = lead?.agentId;
                if (leadOwnerId && leadOwnerId !== user.id) {
                  const ownerUserDoc = await getDoc(doc(db, 'users', leadOwnerId));
                  const ownerTeamId = ownerUserDoc.data()?.teamId;
                  if (ownerTeamId && ownerTeamId === user.teamId) {
                    throw new Error('You cannot strike on a number that is in a lead owned by an agent from your team.');
                  }
                }
              }
            } catch (err: any) {
              if (err?.message?.includes('cannot strike on a number that is in a lead')) throw err;
              // Permission denied or other error: allow strike (different team or cannot verify)
            }
          }
          
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

          // Log the strike action (fire-and-forget so UI stays fast)
          void logNumberAction(
            numberToClaim.id,
            numberToClaim.number || '',
            'claimed',
            { claims: claims, claimCount: numberData.claimCount || 0 },
            { claims: updatedClaims, claimCount: (numberData.claimCount || 0) + 1 },
            `Striked number (status: ${numberToClaim.status})`
          );

          // Notify lead owner via Cloud Function (fire-and-forget so UI stays fast)
          const leadId = numberData.leadId;
          if (leadId && user?.id) {
            createStrikeAlertBroadcastFunction({
              leadId,
              numberId: numberToClaim.id,
              number: numberToClaim.number || ''
            }).catch((broadcastErr) => {
              console.warn('Strike broadcast to lead owner failed:', broadcastErr);
            });
          }

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
              const minutesForOriginal = Math.round(CLAIM_TIMEOUT / 60000);
              await addDoc(collection(db, 'notifications'), {
              userId: numberData.reservedBy,
              type: 'number_claimed',
              title: 'Number Claim Alert',
              message: `Number ${numberToClaim.number} has been claimed by another agent. You have ${minutesForOriginal} minutes to respond.`,
              read: false,
              createdAt: serverTimestamp(),
              numberId: numberToClaim.id
            });
            } catch (error) {
            }
          }, 0);
        }
      }

      // Success - close dialog and show success message (no await so Processing ends immediately)
      setShowClaimDialog(false);
      void refreshNumberData(numberToClaim.id);
      toast.success(['pending_verification', 'assigned', 'verified', 'follow_up'].includes(numberToClaim.status) 
        ? 'Number Striked successfully' 
        : 'Number claimed successfully');
      claimSucceeded = true;

    } catch (error: any) {
      // Revert local state if there's an error
      setNumbers(prev => prev.map(n => 
        n.id === numberToClaim.id ? numberToClaim : n
      ));
      
      toast.error(error.message || 'Failed to claim number');
    } finally {
      // Clear loading state first so "Processing..." ends immediately
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
      if (claimSucceeded) {
        void recordDailyClaim();
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
        
        // Refresh with latest data from Firestore
        await refreshNumberData(number.id);
        
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

            // Send notification to the second claiming agent with their effective window
            const secondClaimIdx = claimQueue.findIndex((c: any) => claimQueue[1] && c.agentId === claimQueue[1].agentId);
            const secondClaimMinutes = Math.round((CLAIM_TIMEOUT / 60000) * (secondClaimIdx >= 0 ? secondClaimIdx + 1 : 1));
            await addDoc(collection(db, 'notifications'), {
              userId: claimQueue[1].agentId,
              type: 'number_claimed',
              title: 'Number Claim Started',
              message: `The number is now available for your claim. You have ${secondClaimMinutes} minutes to take ownership.`,
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
      
      // Add ellipsis and last page if needed (show in both browse and search mode)
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 pb-12 pt-0 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
            className="mb-6 sm:mb-12 pt-2"
        >
           <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
            <div className="w-full">
               <h1 className="text-2xl sm:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
                Number Pool
              </h1>
               <p className="mt-1 sm:mt-2 text-sm sm:text-lg text-gray-600">
                Manage and reserve phone numbers for your leads
            </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
            {isAdmin() && (
                <>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCheckDuplicates}
                  disabled={checkingDuplicates}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 h-8 bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200"
                >
                    <div className="bg-gradient-to-br from-orange-500 to-red-600 p-1 rounded flex-shrink-0">
                      {checkingDuplicates ? (
                        <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                      ) : (
                        <FileWarning className="w-3.5 h-3.5 text-white" />
                      )}
                    </div>
                    <span className="text-xs font-medium text-gray-700 whitespace-nowrap">
                        {checkingDuplicates ? 'Checking...' : 'Check Duplicates'}
                      </span>
                </motion.button>
                <button
                  onClick={() => {
                    setShowExportModal(true);
                  }}
                  type="button"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 h-8 bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer border border-gray-200"
                >
                    <div className="bg-gradient-to-br from-emerald-500 to-green-600 p-1 rounded flex-shrink-0">
                      <Download className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="flex flex-col items-start leading-tight">
                      <span className="text-xs font-medium text-gray-700 whitespace-nowrap">Export</span>
                      <span className="text-[10px] text-gray-500 whitespace-nowrap">Choose columns</span>
                  </div>
                </button>
                </>
            )}
              {user?.role === 'agent' && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setShowNumberStatusChecker(true);
                    setPastedNumbers('');
                    setNumberStatusResults([]);
                  }}
                  type="button"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 h-8 bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer border border-gray-200"
                >
                  <div className="bg-gradient-to-br from-purple-500 to-pink-600 p-1 rounded flex-shrink-0">
                    <Clipboard className="w-3.5 h-3.5 text-white" />
                    </div>
                  <div className="flex flex-col items-start leading-tight">
                    <span className="text-xs font-medium text-gray-700 whitespace-nowrap">Check Your List</span>
                  </div>
                </motion.button>
            )}
            {isAdmin() && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowAddDialog(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 h-8 bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 border border-gray-200"
                >
                  <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-1 rounded flex-shrink-0">
                    <Hash className="w-3.5 h-3.5 text-white" />
              </div>
                  <span className="text-xs font-medium text-gray-700 whitespace-nowrap">Add Number</span>
                </motion.button>
            )}
            </div>
            {/* Agent Utilities */}
            {user?.role === 'agent' && (
              <div className="flex items-center gap-2 flex-wrap justify-between w-full">
                {/* My Claim Quota Summary - Compact for Single Row */}
                <div className="flex items-center gap-1.5 sm:gap-2 bg-white border border-indigo-100 rounded-lg sm:rounded-xl px-2 sm:px-3 py-1.5 sm:py-2 shadow-sm">
                  <div className="p-1 sm:p-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-500 text-white shadow-sm flex-shrink-0">
                    <Shield className="h-3 w-3 sm:h-4 sm:w-4" />
                      </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-0.5 sm:gap-1 px-1 sm:px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[8px] sm:text-[10px] font-semibold whitespace-nowrap">
                        <CheckCircle className="h-2.5 w-2.5 sm:hidden" />
                        <span className="hidden sm:inline">Used:</span> {userClaimCount}/{MAX_CLAIMS_PER_24H}
                          </span>
                      <span className="inline-flex items-center gap-0.5 sm:gap-1 px-1 sm:px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[8px] sm:text-[10px] font-semibold whitespace-nowrap">
                        <Circle className="h-2.5 w-2.5 sm:hidden" />
                        <span className="hidden sm:inline">Avail:</span> {Math.max(0, MAX_CLAIMS_PER_24H - userClaimCount)}
                          </span>
                      <span className="inline-flex items-center gap-0.5 sm:gap-1 px-1 sm:px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[8px] sm:text-[10px] font-semibold whitespace-nowrap">
                        <Clock className="h-2.5 w-2.5 sm:hidden" />
                        <span className="hidden sm:inline">Claiming:</span> {myBeingClaimedAll.length}
                          </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowMyClaimsDialog(true)}
                    className="text-[8px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm flex-shrink-0 whitespace-nowrap"
                    >
                      View
                    </button>
                </div>

                {/* Bulk Copy and Notes Buttons */}
                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ml-auto">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={selectedNumbers.length > 0 ? clearSelectedNumbers : toggleBulkCopyMode}
                    className={`inline-flex items-center h-8 sm:h-9 px-2 sm:px-2.5 rounded-lg shadow hover:shadow-md transition-all duration-300 border ${
                      bulkCopyMode 
                        ? selectedNumbers.length > 0
                          ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white border-green-600'
                          : 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >
                    {selectedNumbers.length > 0 ? (
                      <>
                        <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-all duration-300" />
                        <span className="ml-1 sm:ml-1.5 text-[10px] sm:text-xs font-semibold">Done ({selectedNumbers.length})</span>
                      </>
                    ) : (
                      <>
                        <Clipboard className="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-all duration-300" />
                        <span className="ml-1 sm:ml-1.5 text-[10px] sm:text-xs font-medium">Bulk Copy</span>
                      </>
                    )}
                  </motion.button>
                  
                  {/* Notepad Button */}
                  <motion.div
                    onMouseEnter={() => setShowNotepad(true)}
                    className="inline-block"
                  >
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="inline-flex items-center h-8 sm:h-9 px-2 sm:px-2.5 bg-white rounded-lg shadow hover:shadow-md transition-all duration-300 border border-gray-200"
                    >
                      <StickyNote className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors duration-300 ${showNotepad ? 'text-blue-600' : 'text-gray-600'}`} />
                      <span className="ml-1 sm:ml-1.5 text-[10px] sm:text-xs font-medium text-gray-700">Notes</span>
                    </motion.button>
                  </motion.div>
                </div>
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
          <div>
                            <h4 className="text-xl sm:text-2xl font-bold font-mono tracking-wide text-gray-900">{number.number}</h4>
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
          {/* Desktop: Search bar in first row, filters in second row */}
          <div className="flex flex-col gap-3 md:gap-4">
            {/* Search Input - Full width row on desktop */}
            <div className="relative group w-full">
              <div className="absolute inset-y-0 left-0 pl-3 sm:pl-4 flex items-center pointer-events-none">
                <Search className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 group-hover:text-indigo-500 transition-colors" />
              </div>
              <input
                type="text"
                placeholder="Search numbers or codes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  // Prevent form submission on Enter key
                  if (e.key === 'Enter') {
                    e.preventDefault();
                  }
                }}
                className="pl-10 sm:pl-12 pr-28 sm:pr-32 py-2.5 sm:py-3.5 w-full rounded-lg border border-gray-200 bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all hover:border-indigo-200 text-sm sm:text-base"
              />
              {isSearching && (
                <div className="absolute inset-y-0 right-20 sm:right-24 pr-3 sm:pr-4 flex items-center">
                  <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin text-gray-400" />
                </div>
              )}
              {/* Ends With Toggle (switch) */}
              <div className="absolute inset-y-0 right-12 sm:right-12 flex items-center">
                <label
                  className="flex items-center gap-1 sm:gap-2 text-xs font-medium select-none cursor-pointer"
                  title={
                    searchTerm.trim() && !/^\d{2,5}$/.test(searchTerm.trim())
                      ? "Ends with search only works for 2-5 digit numbers"
                      : endsWithToggle
                      ? "Ends with search enabled (2-5 digits)"
                      : "Toggle ends with search"
                  }
                >
                  <span className={clsx("text-gray-600 hidden sm:inline", endsWithToggle && "text-indigo-700")}>
                    Ends
                  </span>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={endsWithToggle}
                    onChange={() => setEndsWithToggle(!endsWithToggle)}
                    disabled={!!(searchTerm.trim() && !/^\d{2,5}$/.test(searchTerm.trim()))}
                  />
                  <span
                    className={clsx(
                      "relative inline-flex h-4 w-8 sm:h-5 sm:w-10 items-center rounded-full transition-colors",
                      endsWithToggle ? "bg-indigo-500" : "bg-gray-300",
                      searchTerm.trim() && !/^\d{2,5}$/.test(searchTerm.trim()) && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    <span
                      className={clsx(
                        "inline-block h-3 w-3 sm:h-4 sm:w-4 rounded-full bg-white shadow transform transition-transform",
                        endsWithToggle ? "translate-x-4 sm:translate-x-5" : "translate-x-0.5 sm:translate-x-1"
                      )}
                    />
                  </span>
                </label>
              </div>
              {/* Manual Refresh Button */}
              <button
                type="button"
                onClick={async () => {
                  try {
                    // If there's active search, clear it first to avoid conflicts
                    if (debouncedSearchTerm.trim()) {
                      setSearchTerm('');
                      setSearchResults([]);
                      setIsSearching(false);
                      fullSearchResultsRef.current = [];
                      // Small delay to let search clear before refreshing
                      await new Promise(resolve => setTimeout(resolve, 100));
                    }
                    // Then refresh the number pool with timeout protection
                    const refreshPromise = numberPoolManager.manualRefresh();
                    const timeoutPromise = new Promise((_, reject) => 
                      setTimeout(() => reject(new Error('Refresh timeout')), 10000)
                    );
                    await Promise.race([refreshPromise, timeoutPromise]);
                  } catch (error) {
                    // If refresh fails or times out, ensure loading state is cleared
                    numberPoolManager.forceResetLoading();
                    toast.error('Refresh failed or timed out');
                  }
                }}
                className="absolute inset-y-0 right-0 px-2 sm:px-3 flex items-center text-gray-400 hover:text-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Refresh data (real-time updates active)"
                disabled={loading && !debouncedSearchTerm.trim()}
              >
                <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${loading && !debouncedSearchTerm.trim() ? 'animate-spin' : ''}`} />
              </button>
              {debouncedSearchTerm.trim() && (
                <div className="mt-1 text-xs text-gray-500 pl-10 sm:pl-12">
                  {isSearching ? 'Searching…' : (
                    <>
                      Found {fullSearchResultsRef.current.length} result{fullSearchResultsRef.current.length === 1 ? '' : 's'}
                      {endsWithToggle && /^\d{2,5}$/.test(debouncedSearchTerm.trim()) && (
                        <span className="ml-2 text-indigo-600 font-medium">(Ends with: {debouncedSearchTerm.trim()})</span>
                      )}
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

            {/* Filters - Second row on desktop, grid on mobile */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-2">
            {/* Category Filter */}
            <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-2 sm:pl-4 flex items-center pointer-events-none">
                  <Filter className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-gray-400 group-hover:text-indigo-500 transition-colors" />
              </div>
              <select
                value={selectedCategory || ''}
                onChange={(e) => setSelectedCategory(e.target.value || null)}
                  className="pl-8 sm:pl-12 pr-2 sm:pr-4 py-2 sm:py-3.5 w-full rounded-lg border border-gray-200 bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all hover:border-indigo-200 appearance-none text-xs sm:text-sm"
              >
                <option value="">All Categories</option>
                {CATEGORIES.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            {/* Group Filter */}
            <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-2 sm:pl-4 flex items-center pointer-events-none">
                  <Filter className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-gray-400 group-hover:text-indigo-500 transition-colors" />
              </div>
              <select
                value={selectedGroup || ''}
                onChange={(e) => {
                  const val = e.target.value || null;
                  if (allowedGroups && allowedGroups.length > 0) {
                    if (val && !allowedGroups.includes(val)) return;
                  }
                  setSelectedGroup(val);
                }}
                disabled={!!(allowedGroups && allowedGroups.length === 1)}
                  className="pl-8 sm:pl-12 pr-2 sm:pr-4 py-2 sm:py-3.5 w-full rounded-lg border border-gray-200 bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all hover:border-indigo-200 appearance-none disabled:bg-gray-100 disabled:cursor-not-allowed text-xs sm:text-sm"
              >
                {!allowedGroups && <option value="">All Groups</option>}
                {(allowedGroups || GROUPS).map(group => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
            </div>

            {/* Initials Filter */}
            <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-2 sm:pl-4 flex items-center pointer-events-none">
                  <Filter className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-gray-400 group-hover:text-indigo-500 transition-colors" />
              </div>
              <select
                value={selectedInitials || ''}
                onChange={(e) => setSelectedInitials(e.target.value || null)}
                  className="pl-8 sm:pl-12 pr-2 sm:pr-4 py-2 sm:py-3.5 w-full rounded-lg border border-gray-200 bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all hover:border-indigo-200 appearance-none text-xs sm:text-sm"
              >
                <option value="">All Initials</option>
                {INITIALS.map(initials => (
                  <option key={initials} value={initials}>{initials}</option>
                ))}
              </select>
            </div>

            {/* Page Size Selector */}
            <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-2 sm:pl-4 flex items-center pointer-events-none">
                  <Hash className="h-3.5 w-3.5 sm:h-5 sm:w-5 text-gray-400 group-hover:text-indigo-500 transition-colors" />
              </div>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value) as typeof PAGE_SIZES[number])}
                  className="pl-8 sm:pl-12 pr-2 sm:pr-4 py-2 sm:py-3.5 w-full rounded-lg border border-gray-200 bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all hover:border-indigo-200 appearance-none text-xs sm:text-sm"
              >
                {PAGE_SIZES.map(size => (
                  <option key={size} value={size}>{size} per page</option>
                ))}
              </select>
              </div>
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
                  <div className="text-[11px] text-gray-800 leading-snug bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 border border-indigo-100 rounded-md px-3 py-2">
                    <div>• Max 10 claims per day</div>
                    <div>• Per-number queue cap: 3</div>
                    <div>• Claim window: 8 AM–10:30 PM (UAE time)</div>
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
                  {canViewAdminColumns && (
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 mb-3 border border-blue-200/50">
                      <div className="flex items-center mb-3">
                        <div className="p-1.5 bg-blue-100 rounded-md mr-2">
                          <Shield className="h-4 w-4 text-blue-600" />
                        </div>
                        <h3 className="text-base font-semibold text-gray-900">Security & Access</h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Passcode Field */}
                        {canViewAdminColumns && (
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
                        {isCoordinator() && (
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
                        if (canEditNumbers() && !newPoolPasscode.trim()) {
                          toast.error('Passcode is required');
                          return;
                        }
                        
                        // Check if number already exists in Firestore
                        setAddingNumber(true);
                        try {
                          const numbersRef = collection(db, 'numberPool');
                          const q = query(numbersRef, where('number', '==', num));
                          const querySnapshot = await getDocs(q);
                          
                          if (!querySnapshot.empty) {
                            // Number already exists
                            const existingDoc = querySnapshot.docs[0];
                            const existingData = existingDoc.data() as NumberPoolType;
                          setDuplicateNumberData({
                              existingNumber: existingData.number || '',
                            newNumber: num
                          });
                          setShowDuplicateNumberDialog(true);
                            setAddingNumber(false);
                          return;
                        }
                          
                          // Number doesn't exist, proceed with adding
                          const numberData: any = {
                            number: num,
                            initials: num.slice(0, 3),
                            last2Digits: num.slice(-2),
                            last3Digits: num.slice(-3),
                            last4Digits: num.slice(-4),
                            last5Digits: num.slice(-5),
                            category: cat,
                            code,
                            group: group.trim(),
                            status: 'open',
                            visibleToFreelancers: true, // Default to visible for single number additions
                            lastStatusChange: new Date('2025-07-05'), // Baseline for "never touched" numbers
                            createdAt: serverTimestamp(),
                            reservationCount: 0,
                            claimCount: 0
                          };

                          // Add passcode for admin/coordinator
                          if (canEditNumbers()) {
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
              className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[9999] p-0 sm:p-4"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setShowEditDialog(false);
                }
              }}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                transition={{ type: 'spring', duration: 0.3, bounce: 0.2 }}
                className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-4xl mx-auto border border-gray-100 max-h-[95vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header - Fixed */}
                <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 sm:px-6 py-3 sm:py-4 text-white flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-lg sm:text-xl font-bold tracking-tight truncate">Edit Number</h2>
                      <p className="text-blue-100 text-xs sm:text-sm mt-0.5">Modify details and settings</p>
                    </div>
                    <div className="p-1.5 sm:p-2 bg-white/20 rounded-lg backdrop-blur-sm ml-2 flex-shrink-0">
                      <Edit className="h-4 w-4 sm:h-6 sm:w-6" />
                    </div>
                  </div>
                </div>

                {/* Form Content - Scrollable */}
                <div className="px-4 sm:px-6 py-3 sm:py-4 overflow-y-auto flex-1 min-h-0">
                  {/* Basic Information Card */}
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-3 sm:p-4 mb-3 border border-gray-200/50">
                    <div className="flex items-center mb-2 sm:mb-3">
                      <div className="p-1 sm:p-1.5 bg-indigo-100 rounded-md mr-2">
                        <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-indigo-600" />
                      </div>
                      <h3 className="text-sm sm:text-base font-semibold text-gray-900">Basic Information</h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                      {/* Number Field */}
                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="text-xs sm:text-sm font-semibold text-gray-700 flex items-center flex-wrap gap-1">
                          <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-red-500 rounded-full"></span>
                          <span>Phone Number</span>
                          <span className="text-xs text-gray-500 font-normal">(10 digits)</span>
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
                            className={`w-full pl-2.5 sm:pl-3 pr-8 sm:pr-10 py-2 sm:py-2.5 bg-white border-2 rounded-lg focus:ring-2 transition-all duration-200 text-gray-900 placeholder-gray-400 text-sm ${
                              editPhoneError
                                ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                                : 'border-gray-200 focus:border-indigo-500 focus:ring-indigo-500/20'
                            }`}
                            placeholder="1234567890"
                            maxLength={10}
                          />
                          <div className={`absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 ${
                            editPhoneError ? 'text-red-400' : 'text-gray-400'
                          }`}>
                            <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
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
                            <span className="text-green-600 flex items-center text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-0.5" />
                              Valid
                            </span>
                          )}
                        </div>
                        {editPhoneError && (
                          <motion.p
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-xs text-red-600 flex items-center mt-0.5"
                          >
                            <AlertCircle className="h-3 w-3 mr-1" />
                            {editPhoneError}
                          </motion.p>
                        )}
                      </div>

                      {/* Category Field */}
                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="text-xs sm:text-sm font-semibold text-gray-700 flex items-center">
                          <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-red-500 rounded-full mr-1.5 sm:mr-2"></span>
                          Category
                        </label>
                        <div className="relative">
                          <select
                            value={editPoolCategory}
                            onChange={(e) => setEditPoolCategory((e.target as HTMLSelectElement).value)}
                            className="w-full pl-2.5 sm:pl-3 pr-8 sm:pr-10 py-2 sm:py-2.5 bg-white border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200 text-gray-900 appearance-none text-sm"
                          >
                            <option value="" className="text-gray-400">Select a category</option>
                            {Array.from(CATEGORIES).map((c) => (
                              <option key={c as string} value={c as string} className="text-gray-900">
                                {c as string}
                              </option>
                            ))}
                          </select>
                          <div className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none">
                            <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </div>
                        </div>
                      </div>

                      {/* Code Field */}
                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="text-xs sm:text-sm font-semibold text-gray-700 flex items-center">
                          <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-red-500 rounded-full mr-1.5 sm:mr-2"></span>
                          Code
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={editPoolCode}
                            onChange={(e) => setEditPoolCode((e.target as HTMLInputElement).value)}
                            className="w-full pl-2.5 sm:pl-3 pr-8 sm:pr-10 py-2 sm:py-2.5 bg-white border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200 text-gray-900 placeholder-gray-400 text-sm"
                            placeholder="e.g., 28DECSILG2"
                          />
                          <div className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                            <Tag className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </div>
                        </div>
                      </div>

                      {/* Group Field */}
                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="text-xs sm:text-sm font-semibold text-gray-700 flex items-center">
                          <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-red-500 rounded-full mr-1.5 sm:mr-2"></span>
                          Group
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={editPoolGroup}
                            onChange={(e) => setEditPoolGroup((e.target as HTMLInputElement).value)}
                            className="w-full pl-2.5 sm:pl-3 pr-8 sm:pr-10 py-2 sm:py-2.5 bg-white border-2 border-gray-200 rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all duration-200 text-gray-900 placeholder-gray-400 text-sm"
                            placeholder="e.g., G1, G2"
                          />
                          <div className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                            <Package className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </div>
                        </div>
                      </div>

                      {/* Status Field */}
                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="text-xs sm:text-sm font-semibold text-gray-700 flex items-center">
                          <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-purple-500 rounded-full mr-1.5 sm:mr-2"></span>
                          Status
                        </label>
                        <div className="relative">
                          <select
                            value={editPoolStatus}
                            onChange={(e) => setEditPoolStatus((e.target as HTMLSelectElement).value as NumberStatus)}
                            className="w-full pl-2.5 sm:pl-3 pr-8 sm:pr-10 py-2 sm:py-2.5 bg-white border-2 border-purple-200 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all duration-200 text-gray-900 appearance-none text-sm"
                          >
                            <option value="open" className="text-gray-900">Open</option>
                            <option value="reserved" className="text-gray-900">Reserved</option>
                            <option value="pending_verification" className="text-gray-900">Pending Verification</option>
                            <option value="verified" className="text-gray-900">Verified</option>
                            <option value="rejected" className="text-gray-900">Rejected</option>
                            <option value="non_verified" className="text-gray-900">Non Verified</option>
                            <option value="activated" className="text-gray-900">Activated</option>
                            <option value="returned" className="text-gray-900">Returned</option>
                          </select>
                          <div className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 text-purple-400 pointer-events-none">
                            <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          </div>
                        </div>
                        <p className="text-xs text-gray-600">
                          Set the current status of this number
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Security & Access Card */}
                  {canViewAdminColumns && (
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 mb-3 border border-blue-200/50">
                      <div className="flex items-center mb-3">
                        <div className="p-1.5 bg-blue-100 rounded-md mr-2">
                          <Shield className="h-4 w-4 text-blue-600" />
                        </div>
                        <h3 className="text-base font-semibold text-gray-900">Security & Access</h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Passcode Field */}
                        {canViewAdminColumns && (
                          <div className="space-y-1.5 sm:space-y-2">
                            <label className="text-xs sm:text-sm font-semibold text-gray-700 flex items-center">
                              <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-red-500 rounded-full mr-1.5 sm:mr-2"></span>
                              Passcode
                            </label>
                            <div className="relative">
                              <input
                                type="text"
                                value={editPoolPasscode}
                                onChange={(e) => setEditPoolPasscode((e.target as HTMLInputElement).value)}
                                className="w-full pl-2.5 sm:pl-3 pr-8 sm:pr-10 py-2 sm:py-2.5 bg-white border-2 border-blue-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 text-gray-900 placeholder-gray-400 text-sm"
                                placeholder="Enter passcode"
                              />
                              <div className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 text-blue-400">
                                <Lock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Team Visibility Field */}
                        {canViewAdminColumns && (
                          <div className="space-y-1.5 sm:space-y-2">
                            <label className="text-xs sm:text-sm font-semibold text-gray-700 flex items-center flex-wrap gap-1">
                              <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-green-500 rounded-full"></span>
                              <span>Team Visibility</span>
                              <span className="text-xs text-gray-500 font-normal">(optional)</span>
                            </label>
                            <div className="relative">
                              <select
                                value={editPoolTeamVisibility}
                                onChange={(e) => setEditPoolTeamVisibility((e.target as HTMLSelectElement).value)}
                                className="w-full pl-2.5 sm:pl-3 pr-8 sm:pr-10 py-2 sm:py-2.5 bg-white border-2 border-green-200 rounded-lg focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all duration-200 text-gray-900 appearance-none text-sm"
                              >
                                <option value="" className="text-gray-400">Visible to all teams</option>
                                {teams.map((team) => (
                                  <option key={team.id} value={team.id} className="text-gray-900">
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                              <div className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 text-green-400 pointer-events-none">
                                <ChevronDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
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
                </div>

                {/* Action Buttons - Fixed at Bottom */}
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 bg-white flex-shrink-0">
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
                    className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
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
                      'w-full sm:w-auto px-4 py-2.5 sm:py-2 text-sm font-semibold text-white rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed',
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
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : isSearching && debouncedSearchTerm.trim() ? (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
              <p className="text-lg font-medium">Searching in number pool...</p>
            </div>
          </div>
        ) : paginatedNumbers.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <div className="text-center">
              <Hash className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">No numbers found</p>
              {(selectedCategory && selectedCategory !== 'all') || selectedInitials ? (
                <p className="text-sm mt-2">Try adjusting your filters</p>
              ) : null}
            </div>
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
                <tr className="bg-gradient-to-r from-gray-50 to-gray-100">
                {bulkCopyMode && (
                  <th className="px-6 py-4 text-left">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 transition-colors"
                      checked={selectedNumbers.length > 0 && selectedNumbers.length === paginatedNumbers.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          selectAllVisible();
                        } else {
                          setSelectedNumbers([]);
                        }
                      }}
                    />
                  </th>
                )}
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  S.No.
                </th>
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
                {canViewAdminColumns && (
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
                    className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-indigo-600 transition-colors"
                  onClick={() => handleSort('reservationCount')}
                >
                  <div className="flex items-center justify-center pr-4">
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
                {canViewAdminColumns && (
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
                  if (status === 'non_verified') {
                      return STATUS_STYLES.reserved;
                  }
                  return STATUS_STYLES[status as keyof typeof STATUS_STYLES];
                };
                
                const statusStyle = getStatusStyle(number.status);
                const StatusIcon = statusStyle?.icon || CheckCircle2; 

  const serialNumber = (displayPagination.currentPage - 1) * pageSize + index + 1;

  return (
    <tr 
                      key={number.id}
      className="hover:bg-gray-50/50 transition-colors group"
    >
                    {bulkCopyMode && (
        <td className="px-6 py-4">
          <input
            type="checkbox"
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 transition-colors"
                          checked={selectedNumbers.includes(number.id)}
                          onChange={() => toggleNumberSelection(number.id, number.number, number.status)}
                          onClick={(e) => e.stopPropagation()}
          />
        </td>
      )}
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-500">
        {serialNumber}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
          <div
            className={clsx(
              "text-lg sm:text-xl font-mono tracking-wide px-3 py-2 rounded-lg shadow-sm",
              (number.status === 'activated' || number.struckThrough)
                ? 'bg-red-100 text-red-800 line-through decoration-red-600 decoration-2'
                : number.status === 'reserved'
                ? `${STATUS_STYLES.reserved.bg} text-gray-800`
                : `${statusStyle?.bg || STATUS_STYLES.open.bg} text-gray-800`,
              (number as any).isDeleted && 'line-through'
            )}
          >
            {number.number}
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
                    {canViewAdminColumns && (
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
      <td className="px-6 py-4 whitespace-nowrap min-w-[190px]">
        <motion.span
          whileHover={{ scale: 1.05 }}
          className={clsx(
            "px-3 py-1 rounded-lg text-xs font-medium inline-flex flex-col items-center shadow-sm ring-1 ring-opacity-5",
            number.status === 'reserved' ? STATUS_STYLES.reserved.bg : (statusStyle?.bg || STATUS_STYLES.open.bg),
            number.status === 'reserved' ? STATUS_STYLES.reserved.text : (statusStyle?.text || STATUS_STYLES.open.text),
            number.status === 'reserved' ? 'ring-indigo-200' : 'ring-gray-200'
          )}
        >
          <div className="inline-flex items-center">
          <StatusIcon className="h-3 w-3 mr-1" />
            <span>{number.status === 'reserved' ? "Reserved" : number.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] min-w-[150px] justify-center">
            {(() => {
              const waitMs = computeUserWaitMs(number);
              return waitMs ? <span className="tabular-nums">({formatCountdown(waitMs)})</span> : null;
            })()}
            <span>(R: {number.reservationCount || 0})</span>
            <span>(C: {number.claimQueue?.length || 0})</span>
            {(() => {
              const claims = (number as any).claims || [];
              const strikeCount = claims.filter((c: any) => c.status === 'pending').length;
              return <span title={strikeCount > 0 ? `${strikeCount} agent(s) struck` : ''} className={strikeCount > 0 ? 'text-red-600 font-semibold' : ''}>(S: {strikeCount})</span>;
            })()}
          </div>
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
                    {canViewAdminColumns && (
        <td className="px-6 py-4 whitespace-nowrap">
          {number.status !== 'open' && (number.reservedBy || number.claimingAgentId || number.originalAgentId || number.leadId) ? (
            <AgentTeamInfo 
              agentId={(number.reservedBy || number.claimingAgentId || number.originalAgentId) as string} 
              leadId={number.leadId}
            />
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
          {/* Strike button - Only visible to agents */}
          {user?.role === 'agent' && (number.status === 'assigned' || 
            number.status === 'verified' || 
            number.status === 'follow_up') && 
                            number.reservedBy !== user?.id && 
                            !((number as any).claims || []).some((claim: any) => claim.userId === user?.id && claim.status === 'pending') &&
                            !agentLeadNumberIds.has(number.id) && (
            <motion.button
                              whileHover={{ scale: (claimingNumbers.has(number.id) || openingStrikeModalId === number.id) ? 1 : 1.05 }}
                              whileTap={{ scale: (claimingNumbers.has(number.id) || openingStrikeModalId === number.id) ? 1 : 0.92 }}
                              onClick={() => handleClaim(number)}
                              disabled={claimingNumbers.has(number.id) || openingStrikeModalId === number.id}
              className={clsx(
                "inline-flex items-center px-3 py-1.5 rounded-lg transition-all duration-200 group ring-1 relative z-20",
                                (claimingNumbers.has(number.id) || openingStrikeModalId === number.id)
                  ? "bg-gray-100 text-gray-400 ring-gray-200 cursor-not-allowed"
                  : "bg-gradient-to-r from-amber-50 to-orange-50 text-amber-600 hover:from-amber-100 hover:to-orange-100 ring-amber-100 active:ring-2 active:ring-amber-300 active:scale-[0.98]"
              )}
            >
                              {(claimingNumbers.has(number.id) || openingStrikeModalId === number.id) ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <AlertTriangle className="h-4 w-4 mr-1.5" />
              )}
                              {claimingNumbers.has(number.id) ? 'Striking...' : openingStrikeModalId === number.id ? 'Checking...' : 'Strike'}
            </motion.button>
          )}
          {/* Striked status - Only visible to agents */}
          {user?.role === 'agent' && (number.status === 'pending_verification' || 
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
          {/* Claim button or reservation-limit warning - Only visible to agents */}
          {user?.role === 'agent' && number.status === 'reserved' && 
                           number.reservedBy !== user?.id && 
                           number.claimingAgentId !== user?.id && (
            reservedNumbers.length >= MAX_RESERVATIONS ? (
              /* Triangle icon when agent has 3 reserved - can't claim until they release one */
              <button
                type="button"
                onClick={() => setShowReservationLimitClaimDialog(true)}
                className="inline-flex items-center justify-center p-2 rounded-lg bg-amber-50 text-amber-600 ring-1 ring-amber-200 hover:bg-amber-100 transition-colors cursor-pointer relative z-20"
                title="You have already three numbers reserved, can't reserve more. Please release a number first in order to claim."
              >
                <AlertTriangle className="h-5 w-5" />
              </button>
            ) : isWithinClaimWindow &&
                           (number.claimQueue?.length || 0) < 3 &&
                           !userClaimLimitReached ? (
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
                               disabled={
                                 claimingNumbers.has(number.id) ||
                                 number.claimQueue?.some((claim: any) => claim.agentId === user?.id) ||
                                 (number.claimQueue?.length || 0) >= 3 ||
                                 userClaimLimitReached
                               }
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
          ) : null
          )}
                          {/* Release: release my reservation */}
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
          {/* Cancel: cancel my strike */}
          {user?.role === 'agent' && (number.status === 'pending_verification' || number.status === 'assigned' || number.status === 'verified' || number.status === 'follow_up') &&
            ((number as any).claims || []).some((c: any) => c.userId === user?.id && c.status === 'pending') && (
            <motion.button
              whileHover={{ scale: cancellingNumbers.has(number.id) ? 1 : 1.05 }}
              whileTap={{ scale: cancellingNumbers.has(number.id) ? 1 : 0.95 }}
              onClick={() => handleCancelStrike(number)}
              disabled={cancellingNumbers.has(number.id)}
              className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-red-50 to-red-100 text-red-600 rounded-lg hover:from-red-100 hover:to-red-200 transition-all duration-200 group ring-1 ring-red-100 relative z-20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancellingNumbers.has(number.id) ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <XCircle className="h-4 w-4 mr-1.5" />}
              Cancel
            </motion.button>
          )}
          {/* Cancel: leave claim queue */}
          {user?.role === 'agent' && number.status === 'reserved' && number.reservedBy !== user?.id &&
            (number.claimQueue || []).some((c: any) => c.agentId === user?.id) && (
            <motion.button
              whileHover={{ scale: cancellingNumbers.has(number.id) ? 1 : 1.05 }}
              whileTap={{ scale: cancellingNumbers.has(number.id) ? 1 : 0.95 }}
              onClick={() => handleCancelQueue(number)}
              disabled={cancellingNumbers.has(number.id)}
              className="inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-red-50 to-red-100 text-red-600 rounded-lg hover:from-red-100 hover:to-red-200 transition-all duration-200 group ring-1 ring-red-100 relative z-20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cancellingNumbers.has(number.id) ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <XCircle className="h-4 w-4 mr-1.5" />}
              Cancel
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
          {/* Edit button for coordinators and admins */}
          {/* Admin can edit all numbers; coordinator limited by status */}
          {/* Explicitly excludes agents - robust permission check */}
          {canEditNumbers() && (
              isAdmin() ||
            (isCoordinator() &&
                ['rejected', 'pending_verification', 'non_verified', 'follow_up', 'follow_verification', 'open', 'reserved'].includes(number.status))
            ) && (
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
    </tr>
  );
              })}
            </tbody>
          </table>
        </div>
        )}

        {/* Enhanced Pagination with Firebase Integration - Mobile Optimized */}
        {!loading && paginatedNumbers.length > 0 && (
          <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border-t border-gray-200">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-700">
                {debouncedSearchTerm.trim() ? (
                  `Showing ${searchResults.length} of ${fullSearchResultsRef.current.length} search results`
                ) : selectedCategory ? (
                  `${selectedCategory}: Page ${displayPagination.currentPage} of ${displayPagination.totalPages} (${displayPagination.totalItems} total)`
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
                    onClick={() => {
                      if (typeof page === 'number') {
                        if (debouncedSearchTerm.trim()) {
                          goToSearchPage(page);
                        } else {
                          goToPage(page);
                        }
                      }
                    }}
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

                {/* Last Page Button - Show for both browse and search mode */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => debouncedSearchTerm.trim() ? goToSearchPage(displayPagination.totalPages) : goToPage(displayPagination.totalPages)}
                  disabled={displayPagination.currentPage === displayPagination.totalPages || loading}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-r-lg hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex-shrink-0"
                  title="Last Page"
                >
                  <ChevronRight className="h-4 w-4" />
                  <ChevronRight className="h-4 w-4 -ml-1" />
                </motion.button>

                {/* Load More Button - Only show on last page when searching and more results available */}
                {debouncedSearchTerm.trim() && 
                 searchHasMore && 
                 displayPagination.currentPage === displayPagination.totalPages && (
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => performSearch(true)}
                    disabled={isLoadingMore || isSearching}
                    className="inline-flex items-center px-3 py-2 text-xs font-medium text-white bg-indigo-600 border border-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex-shrink-0 ml-1"
                    title="Load More Results"
                  >
                    {isLoadingMore ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3 mr-1" />
                        Load More
                      </>
                    )}
                  </motion.button>
                )}
                </div>
              </div>
            </div>
          </div>
        )}

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

        {/* My Claims Dialog */}
        {showMyClaimsDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 max-w-xl w-full mx-4 shadow-2xl">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">My Claim Quota</h3>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-semibold">
                      Used: {userClaimCount} / {MAX_CLAIMS_PER_24H}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
                      Available: {Math.max(0, MAX_CLAIMS_PER_24H - userClaimCount)}
                    </span>
                  </div>
                  <div className="mt-2 text-[11px] text-gray-800 leading-snug bg-gradient-to-r from-indigo-50 via-purple-50 to-blue-50 border border-indigo-100 rounded-md px-3 py-2">
                    <div>• Max 10 claims per day</div>
                    <div>• Per-number queue cap: 3</div>
                    <div>• Claim window: 8 AM–10:30 PM (UAE time)</div>
                  </div>
                  <div className="mt-2 text-[11px] text-gray-600 leading-snug border border-gray-200 rounded-md px-3 py-2 bg-gray-50">
                    <div className="font-medium text-gray-700 mb-1">In number pool, status badges show:</div>
                    <div><strong>(R)</strong> Reservations — times this number has been reserved</div>
                    <div><strong>(C)</strong> Claim queue — agents in line to claim this number</div>
                    <div><strong>(S)</strong> Strikes — agents who have struck (pending Strikes) this number</div>
                  </div>
                  </div>
                <button
                  onClick={() => setShowMyClaimsDialog(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-purple-600" />
                    <h4 className="text-sm font-semibold text-gray-800">Being claimed</h4>
                  </div>
                  {myBeingClaimedAll.length === 0 ? (
                    <p className="text-sm text-gray-500">No numbers currently being claimed by you.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {myBeingClaimedAll.map((n) => {
                        const queueSize = n.claimQueue?.length || 0;
                        const timeLeft = computeUserWaitMs(n);
                        return (
                          <div key={n.id} className="border border-purple-200 bg-purple-50 rounded-lg px-3 py-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-purple-900">{n.number}</span>
                              {n.group && <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">{n.group}</span>}
                            </div>
                            <div className="text-xs text-purple-700">Queue size: {queueSize}</div>
                            {timeLeft != null && (
                              <div className="text-[11px] text-purple-700 mt-1">
                                Remaining: {formatCountdown(timeLeft)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reserve Conflict Dialog */}
        {showReserveConflictDialog && reserveConflictInfo && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl transform transition-all">
              <div className="flex items-center justify-center mb-6">
                <div className="p-3 rounded-full bg-amber-100">
                  <AlertCircle className="h-8 w-8 text-amber-600" />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">
                Number Already Reserved
              </h3>
              <p className="text-gray-500 text-center mb-6">
                The number <span className="font-semibold text-gray-900">{reserveConflictInfo.number}</span> is currently{' '}
                {formatStatusLabel(reserveConflictInfo.status)}.
                <br />
                We've refreshed the latest status so you can claim the number.
              </p>
              <div className="flex justify-center">
                <button
                  onClick={() => {
                    setShowReserveConflictDialog(false);
                    setReserveConflictInfo(null);
                  }}
                  className="px-6 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
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
                {strikeBlockedSameTeam ? (
                  <span className="text-amber-700 font-medium">
                    This lead belongs to your team. You cannot strike on this number.
                  </span>
                ) : ['pending_verification', 'assigned', 'verified', 'follow_up'].includes(numberToClaim.status) ? (
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
                  onClick={() => {
                    setShowClaimDialog(false);
                    setStrikeBlockedSameTeam(false);
                    setOpeningStrikeModalId(null);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                {!strikeBlockedSameTeam && (
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
                )}
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

        {/* Reservation Limit - Can't Claim Dialog (shown when clicking triangle on reserved numbers) */}
        {showReservationLimitClaimDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-8 max-w-lg w-full mx-4 shadow-xl transform transition-all">
              <div className="flex items-center justify-center mb-6">
                <div className="p-4 rounded-full bg-amber-100">
                  <AlertTriangle className="h-10 w-10 text-amber-600" />
                </div>
              </div>
              <h3 className="text-2xl font-semibold text-gray-900 text-center mb-4">
                Reservation Limit Reached
              </h3>
              <p className="text-lg text-gray-600 text-center mb-8 leading-relaxed">
                You have already three numbers reserved. You can&apos;t reserve more.
                <br /><br />
                Please release a number first in order to claim.
              </p>
              <div className="flex justify-center">
                <button
                  onClick={() => setShowReservationLimitClaimDialog(false)}
                  className="px-6 py-3 text-base font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors"
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

        {/* Duplicate Numbers Dialog */}
        {showDuplicateDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
              >
                {/* Header */}
              <div className="bg-gradient-to-r from-orange-500 to-red-600 text-white p-6">
                  <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <FileWarning className="h-6 w-6" />
                    <h2 className="text-2xl font-bold">Duplicate Numbers</h2>
                    {duplicateNumbers.length > 0 && (
                      <span className="bg-white bg-opacity-20 px-3 py-1 rounded-full text-sm">
                        {duplicateNumbers.length} duplicate(s) found
                      </span>
                    )}
                    </div>
                  <button
                    onClick={() => {
                      setShowDuplicateDialog(false);
                      setSelectedDuplicateEntries(new Set());
                    }}
                    className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors"
                  >
                    <X className="h-6 w-6" />
                  </button>
                  </div>
                </div>

                {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {duplicateNumbers.length === 0 ? (
                  <div className="text-center py-12">
                    <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      No Duplicates Found
                    </h3>
                    <p className="text-gray-500">
                      All numbers in the pool are unique.
                    </p>
                    </div>
                ) : (
                  <div className="space-y-6">
                    {duplicateNumbers.map((duplicate, index) => (
                      <motion.div
                        key={duplicate.number}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="bg-red-50 border-2 border-red-200 rounded-xl p-6"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center space-x-3">
                            <div className="bg-red-100 p-2 rounded-lg">
                              <FileWarning className="h-5 w-5 text-red-600" />
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-gray-900">
                                Number: {duplicate.number}
                    </h3>
                              <p className="text-sm text-gray-600">
                                Found {duplicate.entries.length} duplicate entries
                              </p>
                            </div>
                  </div>
                </div>

                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                                  <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    checked={duplicate.entries.every(e => selectedDuplicateEntries.has(e.id))}
                                    onChange={(e) => {
                                      const newSelected = new Set(selectedDuplicateEntries);
                                      if (e.target.checked) {
                                        duplicate.entries.forEach(entry => newSelected.add(entry.id));
                                      } else {
                                        duplicate.entries.forEach(entry => newSelected.delete(entry.id));
                                      }
                                      setSelectedDuplicateEntries(newSelected);
                                    }}
                                  />
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  ID
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Category
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Code
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Group
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Status
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Reserved By
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Created At
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {duplicate.entries.map((entry) => {
                                const statusStyle = STATUS_STYLES[entry.status as keyof typeof STATUS_STYLES] || STATUS_STYLES.open;
                                const StatusIcon = statusStyle?.icon || CheckCircle2;
                                
                                const isSelected = selectedDuplicateEntries.has(entry.id);
                                
                                return (
                                  <tr key={entry.id} className={`hover:bg-gray-50 ${isSelected ? 'bg-indigo-50' : ''}`}>
                                    <td className="px-4 py-3">
                                      <input
                                        type="checkbox"
                                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        checked={isSelected}
                                        onChange={(e) => {
                                          const newSelected = new Set(selectedDuplicateEntries);
                                          if (e.target.checked) {
                                            newSelected.add(entry.id);
                                          } else {
                                            newSelected.delete(entry.id);
                                          }
                                          setSelectedDuplicateEntries(newSelected);
                                        }}
                                      />
                                    </td>
                                    <td className="px-4 py-3 text-sm font-mono text-gray-900">
                                      {entry.id.substring(0, 8)}...
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900">
                                      {entry.category}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900">
                                      {entry.code || 'N/A'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900">
                                      {entry.group || 'N/A'}
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                                        <StatusIcon className="h-3 w-3 mr-1" />
                                        {formatStatusLabel(entry.status)}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900">
                                      {entry.reservedBy ? (
                                        <span className="font-medium">{entry.reservedBy.substring(0, 8)}...</span>
                                      ) : (
                                        <span className="text-gray-400">None</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-500">
                                      {entry.createdAt ? (() => {
                                        try {
                                          let date: Date;
                                          const createdAt = entry.createdAt as any;
                                          
                                          if (typeof createdAt?.toDate === 'function') {
                                            // Firestore Timestamp
                                            date = createdAt.toDate();
                                          } else if (createdAt instanceof Date) {
                                            // Already a Date object
                                            date = createdAt;
                                          } else if (createdAt?.seconds) {
                                            // Firestore Timestamp with seconds
                                            date = new Date(createdAt.seconds * 1000);
                                          } else if (typeof createdAt === 'string') {
                                            // ISO string
                                            date = new Date(createdAt);
                                          } else if (typeof createdAt === 'number') {
                                            // Unix timestamp
                                            date = new Date(createdAt);
                                          } else {
                                            return 'N/A';
                                          }
                                          
                                          return date.toLocaleDateString();
                                        } catch {
                                          return 'N/A';
                                        }
                                      })() : 'N/A'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-gray-200 p-6 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    {selectedDuplicateEntries.size > 0 && (
                      <span className="font-medium text-gray-900">
                        {selectedDuplicateEntries.size} entry/entries selected
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3">
                    {selectedDuplicateEntries.size > 0 && (
                      <button
                        onClick={() => setShowDeleteDuplicatesDialog(true)}
                        disabled={isDeletingDuplicates}
                        className="px-6 py-2 text-sm font-medium text-white bg-gradient-to-r from-red-500 to-red-600 rounded-lg hover:from-red-600 hover:to-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Selected ({selectedDuplicateEntries.size})
                      </button>
                    )}
                    <button
                    onClick={() => {
                        setShowDuplicateDialog(false);
                        setSelectedDuplicateEntries(new Set());
                      }}
                      className="px-6 py-2 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-red-600 rounded-lg hover:from-orange-600 hover:to-red-700 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Delete Duplicates Confirmation Dialog */}
        {showDeleteDuplicatesDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl"
            >
              <div className="flex items-center justify-center mb-6">
                <div className="p-3 rounded-full bg-red-100">
                  <Trash2 className="h-8 w-8 text-red-600" />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">
                Delete Selected Duplicates
              </h3>
              <p className="text-gray-500 text-center mb-6">
                Are you sure you want to delete <span className="font-semibold text-gray-900">{selectedDuplicateEntries.size}</span> duplicate entry/entries?
                <br />
                <span className="text-sm mt-2 block text-red-600">
                  This action cannot be undone.
                </span>
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowDeleteDuplicatesDialog(false)}
                  disabled={isDeletingDuplicates}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                </button>
                <button
                  onClick={handleDeleteSelectedDuplicates}
                  disabled={isDeletingDuplicates}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
                >
                  {isDeletingDuplicates && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {isDeletingDuplicates ? 'Deleting...' : 'Delete'}
                </button>
                </div>
              </motion.div>
          </div>
          )}
        </motion.div>
        
        {/* Agent Notepad - Floating Panel */}
        <AnimatePresence>
          {showNotepad && user?.role === 'agent' && (
            <motion.div
              initial={{ opacity: 0, x: 300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 300 }}
              transition={{ duration: 0.3 }}
              onMouseEnter={() => setShowNotepad(true)}
              onMouseLeave={() => setShowNotepad(false)}
              className="fixed right-4 top-24 w-96 bg-white rounded-lg shadow-2xl border border-gray-200 z-50 overflow-hidden"
            >
              {/* Notepad Header */}
              <div className="bg-gradient-to-r from-blue-500 to-indigo-600 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center">
                  <StickyNote className="w-5 h-5 text-white mr-2" />
                  <h3 className="text-white font-semibold">Quick Notes</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowInstructions(!showInstructions)}
                    className="text-white hover:bg-white/20 rounded p-1 transition-colors"
                    title="Show/Hide Instructions"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowNotepad(false)}
                    className="text-white hover:bg-white/20 rounded p-1 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              {/* Help Button */}
              {!showInstructions && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="px-4 pt-3"
                >
                  <motion.button
                    onClick={() => setShowInstructions(true)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full bg-gradient-to-r from-blue-100 to-indigo-100 hover:from-blue-200 hover:to-indigo-200 border border-blue-300 text-blue-700 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    <Info className="w-4 h-4" />
                    <span>For help click on me</span>
                  </motion.button>
                </motion.div>
              )}
              
              {/* Instructions Section */}
              <AnimatePresence>
                {showInstructions && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden bg-blue-50 border-b border-blue-200"
                  >
                    {/* Instructions Header with Close Button */}
                    <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-blue-200">
                      <h4 className="text-sm font-semibold text-gray-900 flex items-center">
                        <Info className="w-4 h-4 mr-2 text-blue-600" />
                        Instructions
                      </h4>
                      <button
                        onClick={() => setShowInstructions(false)}
                        className="text-gray-500 hover:text-gray-700 hover:bg-blue-100 rounded p-1 transition-colors"
                        title="Close Instructions"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="p-4 space-y-4">
                      {/* Bulk Copy Instructions */}
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center">
                          <Clipboard className="w-4 h-4 mr-2 text-blue-600" />
                          Bulk Copy Feature
                        </h4>
                        <ol className="text-xs text-gray-700 space-y-1.5 ml-6 list-decimal">
                          <li>Click the <strong>"Bulk Copy"</strong> button in the header (left side)</li>
                          <li>Button turns <span className="text-blue-600 font-semibold">blue</span> - checkboxes appear next to each number</li>
                          <li>Click checkboxes to select numbers you want</li>
                          <li>Selected numbers are <strong>automatically added</strong> to this notepad</li>
                          <li>You can select numbers across multiple pages</li>
                          <li>Click <span className="text-green-600 font-semibold">"Done (X)"</span> when finished - checkboxes disappear</li>
                          <li>All selected numbers remain saved in the notepad</li>
                        </ol>
                      </div>
                      
                      {/* Notepad Instructions */}
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center">
                          <StickyNote className="w-4 h-4 mr-2 text-blue-600" />
                          Notepad Features
                        </h4>
                        <ol className="text-xs text-gray-700 space-y-1.5 ml-6 list-decimal">
                          <li><strong>Auto Line Break:</strong> Type 10 digits and it automatically moves to next line</li>
                          <li><strong>Manual Typing:</strong> You can also type numbers manually, one per line</li>
                          <li><strong>Duplicate Prevention:</strong> Same number won't be added twice automatically</li>
                          <li><strong>Auto-Save:</strong> Everything saves automatically to your browser</li>
                          <li><strong>Blank Lines Toggle:</strong> Turn ON/OFF empty lines between numbers for WhatsApp</li>
                          <li><strong>Copy for WhatsApp:</strong> Formats numbers with bold (*number*) and copies to clipboard</li>
                          <li><strong>Clear Notes:</strong> Remove all content (with confirmation)</li>
                        </ol>
                      </div>
                      
                      {/* Quick Tips */}
                      <div className="bg-blue-100 rounded p-2">
                        <p className="text-xs font-semibold text-blue-900 mb-1">💡 Quick Tips:</p>
                        <ul className="text-xs text-blue-800 space-y-0.5 ml-4 list-disc">
                          <li>Hover over "Notes" button to auto-open notepad</li>
                          <li>Numbers are saved per-user in your browser</li>
                          <li>Use "Blank Lines" toggle for better WhatsApp readability</li>
                          <li>You can edit notepad content manually anytime</li>
                        </ul>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              
              {/* Notepad Content */}
              <div className="p-4">
                <textarea
                  value={notepadContent}
                  onChange={handleNotepadInput}
                  placeholder="Jot down numbers, notes, or anything else... (Auto line break after 10 digits)"
                  className="w-full h-96 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm font-mono"
                  style={{ lineHeight: '1.5' }}
                />
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-gray-500">
                      <Check className="w-3 h-3 inline mr-1" />
                      Auto-saved locally
                    </p>
                  <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setWhatsappBlankLines(!whatsappBlankLines)}
                      className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded transition-all duration-300 ${
                        whatsappBlankLines
                          ? 'bg-blue-100 text-blue-700 border border-blue-300'
                          : 'bg-gray-100 text-gray-600 border border-gray-300'
                      }`}
                      title={whatsappBlankLines ? 'Blank lines ON (for WhatsApp)' : 'Blank lines OFF'}
                    >
                      <span className="mr-1">{whatsappBlankLines ? '✓' : '○'}</span>
                      Blank Lines
                    </motion.button>
                  </div>
                  <div className="flex items-center gap-3">
                    <motion.button
                      onClick={copyNotepadContent}
                      disabled={!notepadContent.trim() || isCopyingNotepad}
                      whileHover={notepadContent.trim() ? { scale: 1.05 } : {}}
                      whileTap={notepadContent.trim() ? { scale: 0.95 } : {}}
                      className="inline-flex items-center px-3 py-1 text-xs font-medium bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded hover:from-green-600 hover:to-emerald-700 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                      <AnimatePresence mode="wait">
                        {isCopyingNotepad ? (
                          <motion.span
                            key="copying"
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 5 }}
                            transition={{ duration: 0.2 }}
                            className="inline-flex items-center"
                          >
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            Copying...
                          </motion.span>
                        ) : notepadCopied ? (
                          <motion.span
                            key="copied"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            transition={{ duration: 0.2 }}
                            className="inline-flex items-center"
                          >
                            <Check className="w-3 h-3 mr-1" />
                            Copied!
                          </motion.span>
                        ) : (
                          <motion.span
                            key="copy"
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 5 }}
                            transition={{ duration: 0.2 }}
                            className="inline-flex items-center"
                          >
                            <Clipboard className="w-3 h-3 mr-1" />
                            Copy for WhatsApp
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        if (window.confirm('Clear all notes?')) {
                          setNotepadContent('');
                        }
                      }}
                      className="text-xs text-red-600 hover:text-red-700 font-medium transition-colors"
                    >
                      Clear Notes
                  </motion.button>
                  </div>
                </div>
                </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Number Status Checker Modal */}
      {showNumberStatusChecker && (
        <div
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4"
          onClick={() => {
            if (!checkingNumbers) setShowNumberStatusChecker(false);
          }}
          style={{ zIndex: 9999 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-4xl max-h-[95vh] sm:max-h-[90vh] flex flex-col"
            style={{ position: 'relative', zIndex: 10000 }}
          >
            <div className="flex items-center justify-between p-3 sm:p-4 md:p-6 border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50">
              <div className="flex-1 min-w-0">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 flex items-center gap-1.5 sm:gap-2">
                  <Clipboard className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 flex-shrink-0" />
                  <span className="truncate">Check Your List</span>
                </h3>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1 hidden sm:block">Paste numbers in any format (newlines, commas, or spaces) to check their status</p>
              </div>
              <button
                onClick={() => setShowNumberStatusChecker(false)}
                className="text-gray-500 hover:text-gray-700 flex-shrink-0 ml-2"
                disabled={checkingNumbers}
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4">
              {/* Input Area */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                  Paste Numbers
                </label>
                <textarea
                  value={pastedNumbers}
                  onChange={(e) => setPastedNumbers(e.target.value)}
                  placeholder="Paste numbers (any format)&#10;0501234567&#10;0509876543"
                  className="w-full h-24 sm:h-32 md:h-36 px-3 sm:px-4 py-2 sm:py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono text-xs sm:text-sm"
                  disabled={checkingNumbers}
                />
                <div className="mt-1.5 sm:mt-2 flex items-start gap-1.5 sm:gap-2">
                  <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <p className="text-[10px] sm:text-xs text-gray-500 leading-tight">
                    Numbers can be separated by newlines, commas, or spaces. Only 10-digit numbers will be processed.
                  </p>
                </div>
                
                {/* Show valid parsed numbers count below the input */}
                {validPastedNumbers.length > 0 && (
                  <div className="mt-2 sm:mt-3 p-2 sm:p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs sm:text-sm font-semibold text-indigo-900">
                        Valid: {validPastedNumbers.length}
                      </span>
                      <button
                        onClick={() => {
                          const numbersText = validPastedNumbers.join('\n');
                          copyNumber(numbersText);
                          toast.success(`Copied ${validPastedNumbers.length} number(s)`);
                        }}
                        className="text-[10px] sm:text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-white hover:bg-indigo-100 rounded transition-colors"
                      >
                        <Copy className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        <span className="hidden sm:inline">Copy All</span>
                        <span className="sm:hidden">Copy</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Check Button */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCheckNumbers}
                  disabled={checkingNumbers || !pastedNumbers.trim()}
                  className="inline-flex items-center px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-indigo-600 text-white text-xs sm:text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {checkingNumbers ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 animate-spin" />
                      <span className="hidden sm:inline">Checking...</span>
                      <span className="sm:hidden">Checking</span>
                    </>
                  ) : (
                    <>
                      <span className="hidden sm:inline">Check Your List</span>
                      <span className="sm:hidden">Check</span>
                    </>
                  )}
                </button>
              </div>

              {/* Results */}
              {numberStatusResults.length > 0 && (
                <div className="space-y-5">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-2 sm:p-3 text-center">
                      <div className="text-lg sm:text-xl md:text-2xl font-bold text-green-700">
                        {numberStatusResults.filter(r => r.found && r.data?.status === 'open').length}
                      </div>
                      <div className="text-[10px] sm:text-xs text-green-600 mt-0.5 sm:mt-1">Open</div>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 sm:p-3 text-center">
                      <div className="text-lg sm:text-xl md:text-2xl font-bold text-amber-700">
                        {numberStatusResults.filter(r => r.found && r.data?.status === 'reserved').length}
                      </div>
                      <div className="text-[10px] sm:text-xs text-amber-600 mt-0.5 sm:mt-1">Reserved</div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3 text-center">
                      <div className="text-lg sm:text-xl md:text-2xl font-bold text-blue-700">
                        {numberStatusResults.filter(r => r.found && r.data?.status !== 'open' && r.data?.status !== 'reserved').length}
                      </div>
                      <div className="text-[10px] sm:text-xs text-blue-600 mt-0.5 sm:mt-1">Other</div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-2 sm:p-3 text-center">
                      <div className="text-lg sm:text-xl md:text-2xl font-bold text-red-700">
                        {numberStatusResults.filter(r => !r.found).length}
                      </div>
                      <div className="text-[10px] sm:text-xs text-red-600 mt-0.5 sm:mt-1">Not Found</div>
                    </div>
                  </div>

                  {/* Open & Reserved Numbers Section */}
                  {(numberStatusResults.filter(r => r.found && (r.data?.status === 'open' || r.data?.status === 'reserved')).length > 0) && (
                    <div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-2 sm:mb-3">
                        <h4 className="text-xs sm:text-sm font-semibold text-gray-900 flex items-center gap-1.5 sm:gap-2">
                          <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0" />
                          <span className="truncate">Open & Reserved ({numberStatusResults.filter(r => r.found && (r.data?.status === 'open' || r.data?.status === 'reserved')).length})</span>
                        </h4>
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          {numberStatusResults.filter(r => r.found && r.data?.status === 'open').length > 0 && (
                            <motion.button
                              whileHover={{ scale: copiedFeedback?.type === 'open' ? 1 : 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => {
                                const openNumbers = numberStatusResults
                                  .filter(r => r.found && r.data?.status === 'open')
                                  .map(r => r.number);
                                const count = openNumbers.length;
                                const numbersText = openNumbers.join('\n');
                                copyNumber(numbersText);
                                setCopiedFeedback({ type: 'open', timestamp: Date.now() });
                                setTimeout(() => setCopiedFeedback(null), 2000);
                                toast.success(`Copied ${count} open number${count !== 1 ? 's' : ''}!`, {
                                  duration: 2000,
                                  icon: '✅',
                                });
                              }}
                              className="text-[10px] sm:text-xs font-medium flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg transition-all"
                              style={{
                                backgroundColor: copiedFeedback?.type === 'open' ? '#10b981' : '#f0fdf4',
                                color: copiedFeedback?.type === 'open' ? 'white' : '#059669',
                              }}
                            >
                              {copiedFeedback?.type === 'open' ? (
                                <>
                                  <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                  <span className="hidden sm:inline">Copied!</span>
                                  <span className="sm:hidden">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                  <span className="hidden sm:inline">Copy Open ({numberStatusResults.filter(r => r.found && r.data?.status === 'open').length})</span>
                                  <span className="sm:hidden">Open ({numberStatusResults.filter(r => r.found && r.data?.status === 'open').length})</span>
                                </>
                              )}
                            </motion.button>
                          )}
                          {numberStatusResults.filter(r => r.found && r.data?.status === 'reserved').length > 0 && (
                            <motion.button
                              whileHover={{ scale: copiedFeedback?.type === 'reserved' ? 1 : 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => {
                                const reservedNumbers = numberStatusResults
                                  .filter(r => r.found && r.data?.status === 'reserved')
                                  .map(r => r.number);
                                const count = reservedNumbers.length;
                                const numbersText = reservedNumbers.join('\n');
                                copyNumber(numbersText);
                                setCopiedFeedback({ type: 'reserved', timestamp: Date.now() });
                                setTimeout(() => setCopiedFeedback(null), 2000);
                                toast.success(`Copied ${count} reserved number${count !== 1 ? 's' : ''}!`, {
                                  duration: 2000,
                                  icon: '✅',
                                });
                              }}
                              className="text-[10px] sm:text-xs font-medium flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg transition-all"
                              style={{
                                backgroundColor: copiedFeedback?.type === 'reserved' ? '#f59e0b' : '#fffbeb',
                                color: copiedFeedback?.type === 'reserved' ? 'white' : '#d97706',
                              }}
                            >
                              {copiedFeedback?.type === 'reserved' ? (
                                <>
                                  <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                  <span className="hidden sm:inline">Copied!</span>
                                  <span className="sm:hidden">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                  <span className="hidden sm:inline">Copy Reserved ({numberStatusResults.filter(r => r.found && r.data?.status === 'reserved').length})</span>
                                  <span className="sm:hidden">Reserved ({numberStatusResults.filter(r => r.found && r.data?.status === 'reserved').length})</span>
                                </>
                              )}
                            </motion.button>
                          )}
                          <motion.button
                            whileHover={{ scale: copiedFeedback?.type === 'all' ? 1 : 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              const allNumbers = numberStatusResults
                                .filter(r => r.found && (r.data?.status === 'open' || r.data?.status === 'reserved'))
                                .map(r => r.number);
                              const count = allNumbers.length;
                              const numbersText = allNumbers.join('\n');
                              copyNumber(numbersText);
                              setCopiedFeedback({ type: 'all', timestamp: Date.now() });
                              setTimeout(() => setCopiedFeedback(null), 2000);
                              toast.success(`Copied ${count} number${count !== 1 ? 's' : ''} (open + reserved)!`, {
                                duration: 2000,
                                icon: '✅',
                              });
                            }}
                            className="text-[10px] sm:text-xs font-medium flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg transition-all"
                            style={{
                              backgroundColor: copiedFeedback?.type === 'all' ? '#6366f1' : '#eef2ff',
                              color: copiedFeedback?.type === 'all' ? 'white' : '#4f46e5',
                            }}
                          >
                            {copiedFeedback?.type === 'all' ? (
                              <>
                                <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                <span className="hidden sm:inline">Copied!</span>
                                <span className="sm:hidden">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                <span className="hidden sm:inline">Copy Open & Reserved ({numberStatusResults.filter(r => r.found && (r.data?.status === 'open' || r.data?.status === 'reserved')).length})</span>
                                <span className="sm:hidden">Open & Reserved ({numberStatusResults.filter(r => r.found && (r.data?.status === 'open' || r.data?.status === 'reserved')).length})</span>
                              </>
                            )}
                          </motion.button>
                        </div>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-2 sm:p-3 md:p-4 space-y-1.5 sm:space-y-2 max-h-64 sm:max-h-80 overflow-y-auto">
                        {numberStatusResults
                          .filter(r => r.found && (r.data?.status === 'open' || r.data?.status === 'reserved'))
                          .sort((a, b) => {
                            // Sort: open first, then reserved
                            if (a.data?.status === 'open' && b.data?.status !== 'open') return -1;
                            if (a.data?.status !== 'open' && b.data?.status === 'open') return 1;
                            return 0;
                          })
                          .map((result, idx) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              onClick={() => {
                                copyNumber(result.number);
                                toast.success(`Copied ${result.number}`);
                              }}
                              className={`flex items-center justify-between bg-white rounded-lg p-2 sm:p-2.5 md:p-3 border ${
                                result.data?.status === 'open' 
                                  ? 'border-green-200 hover:border-green-300' 
                                  : result.data?.status === 'reserved'
                                  ? 'border-amber-200 hover:border-amber-300'
                                  : 'border-gray-200 hover:border-gray-300'
                              } hover:shadow-md transition-all cursor-pointer group active:scale-[0.98]`}
                            >
                              <div className="flex-1 min-w-0 flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="font-mono text-xs sm:text-sm font-semibold text-gray-900">{result.number}</div>
                                  {result.data && (
                                    <div className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                      <span className="bg-green-100 text-green-700 px-1.5 sm:px-2 py-0.5 rounded-full font-medium text-[10px] sm:text-xs">
                                        {result.data.category}
                                      </span>
                                      {result.data.group && (
                                        <span className="text-gray-600 text-[10px] sm:text-xs">Group: {result.data.group}</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                {result.data && (
                                  <div className="flex-shrink-0">
                                    <span className={`${
                                      result.data.status === 'open' 
                                        ? 'bg-green-500 text-white' 
                                        : result.data.status === 'reserved'
                                        ? 'bg-amber-500 text-white'
                                        : 'bg-gray-500 text-white'
                                    } px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold flex items-center gap-0.5 sm:gap-1`}>
                                      {result.data.status === 'open' ? (
                                        <CheckCircle2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                      ) : result.data.status === 'reserved' ? (
                                        <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                      ) : null}
                                      <span className="hidden sm:inline">{formatStatusLabel(result.data.status)}</span>
                                      <span className="sm:hidden">{result.data.status === 'open' ? 'Open' : result.data.status === 'reserved' ? 'Reserved' : formatStatusLabel(result.data.status)}</span>
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className={`ml-2 sm:ml-3 flex-shrink-0 p-1.5 sm:p-2 rounded-lg transition-colors ${
                                result.data?.status === 'open' 
                                  ? 'bg-green-100 group-hover:bg-green-200' 
                                  : result.data?.status === 'reserved'
                                  ? 'bg-amber-100 group-hover:bg-amber-200'
                                  : 'bg-gray-100 group-hover:bg-gray-200'
                              }`}>
                                <Copy className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${
                                  result.data?.status === 'open' 
                                    ? 'text-green-700' 
                                    : result.data?.status === 'reserved'
                                    ? 'text-amber-700'
                                    : 'text-gray-700'
                                }`} />
                              </div>
                            </motion.div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Other Numbers Section */}
                  {numberStatusResults.filter(r => !(r.found && (r.data?.status === 'open' || r.data?.status === 'reserved'))).length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2 sm:mb-3">
                        <h4 className="text-xs sm:text-sm font-semibold text-gray-900 flex items-center gap-1.5 sm:gap-2">
                          <Info className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 flex-shrink-0" />
                          <span className="truncate">Other Numbers ({numberStatusResults.filter(r => !(r.found && (r.data?.status === 'open' || r.data?.status === 'reserved'))).length})</span>
                        </h4>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 sm:p-3 md:p-4 space-y-1.5 sm:space-y-2 max-h-64 sm:max-h-96 overflow-y-auto">
                        {numberStatusResults
                          .filter(r => !(r.found && (r.data?.status === 'open' || r.data?.status === 'reserved')))
                          .map((result, idx) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              className="flex items-center justify-between bg-white rounded-lg p-2 sm:p-2.5 md:p-3 border border-gray-200 hover:shadow-md transition-all"
                            >
                              <div className="flex-1 min-w-0 flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="font-mono text-xs sm:text-sm font-semibold text-gray-900">{result.number}</div>
                                  {result.found && result.data ? (
                                    <div className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                      <span className="bg-blue-100 text-blue-700 px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs">
                                        {result.data.category}
                                      </span>
                                      {result.data.group && (
                                        <span className="text-gray-600 text-[10px] sm:text-xs">Group: {result.data.group}</span>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-[10px] sm:text-xs text-red-600 mt-0.5 sm:mt-1 font-medium flex items-center gap-1">
                                      <XCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                      <span className="hidden sm:inline">Not found in number pool</span>
                                      <span className="sm:hidden">Not found</span>
                                    </div>
                                  )}
                                </div>
                                {result.found && result.data && (
                                  <div className="flex-shrink-0">
                                    <span className="bg-gray-600 text-white px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold">
                                      <span className="hidden sm:inline">{formatStatusLabel(result.data.status)}</span>
                                      <span className="sm:hidden">{result.data.status === 'verified' ? 'Verified' : result.data.status === 'assigned' ? 'Assigned' : formatStatusLabel(result.data.status).substring(0, 6)}</span>
                                    </span>
                                  </div>
                                )}
                              </div>
                              {result.found && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyNumber(result.number);
                                  }}
                                  className="ml-2 sm:ml-3 p-1.5 sm:p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex-shrink-0"
                                  title="Copy number"
                                >
                                  <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-700" />
                                </button>
                              )}
                            </motion.div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Export Modal - Moved to root level */}
      {isAdmin() && showExportModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 px-4"
          onClick={() => {
            if (!exportingNumbers) setShowExportModal(false);
          }}
          style={{ zIndex: 9999 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4"
            style={{ position: 'relative', zIndex: 10000 }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Export Number Pool</h3>
                <p className="text-sm text-gray-500">Choose the columns to include in the Excel file.</p>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-gray-500 hover:text-gray-700"
                disabled={exportingNumbers}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {exportFields.map(field => (
                <label key={field.key} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    checked={selectedExportFields.includes(field.key)}
                    onChange={() => toggleExportField(field.key)}
                    disabled={exportingNumbers}
                  />
                  {field.label}
                </label>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs text-gray-500">
              <button
                type="button"
                className="underline"
                onClick={() => setSelectedExportFields(exportFields.map(f => f.key))}
                disabled={exportingNumbers}
              >
                Select all
              </button>
              <span>Exports current number pool snapshot</span>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                onClick={() => setShowExportModal(false)}
                disabled={exportingNumbers}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                onClick={handleExportNumbers}
                disabled={exportingNumbers || selectedExportFields.length === 0}
              >
                {exportingNumbers ? 'Exporting...' : 'Export to Excel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Copy Warning Modal */}
      <AnimatePresence>
        {showBulkCopyWarning && (
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/20 p-4"
            onClick={() => setShowBulkCopyWarning(false)}
            style={{ zIndex: 10000 }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-4 sm:p-5 border border-amber-200"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="flex-shrink-0 p-2 bg-amber-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-1">
                    Status Warning
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
                    {bulkCopyWarningMessage}
                  </p>
                </div>
                <button
                  onClick={() => setShowBulkCopyWarning(false)}
                  className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
              <div className="flex justify-end mt-4">
                <button
                  onClick={() => setShowBulkCopyWarning(false)}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
                >
                  Understood
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  ) : null;
}