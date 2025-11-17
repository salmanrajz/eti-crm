/**
 * ===============================================================================
 * NUMBER POOL PAGINATED COMPONENT - PAGINATED NUMBER POOL MANAGEMENT INTERFACE
 * ===============================================================================
 * 
 * This component provides a paginated interface for managing phone numbers in the
 * CRM system's number pool. It supports efficient data loading, search functionality,
 * real-time updates, and number reservation operations with proper pagination.
 * 
 * FEATURES:
 * 
 * 1. PAGINATION SYSTEM
 *    - Efficient server-side pagination for large datasets
 *    - Configurable page sizes with automatic optimization
 *    - Navigation controls (next, previous, direct page access)
 *    - Total count and page information display
 * 
 * 2. SEARCH AND FILTERING
 *    - Real-time search with debounced input
 *    - Filter by category and status
 *    - Unified search across cached and live data
 *    - Real-time updates for search results
 * 
 * 3. NUMBER MANAGEMENT
 *    - Number reservation with transaction safety
 *    - Status checking before reservation
 *    - Real-time countdown timers for reservations
 *    - Agent and team information display
 * 
 * 4. PERFORMANCE OPTIMIZATION
 *    - IndexedDB caching for faster load times
 *    - Debounced search to reduce API calls
 *    - Optimized re-renders with useMemo and useCallback
 *    - Real-time snapshots only for visible data
 * 
 * 5. USER EXPERIENCE
 *    - Loading states and error handling
 *    - Toast notifications for user feedback
 *    - Responsive design with proper mobile support
 *    - Chat integration for number-specific communications
 * 
 * USAGE:
 * This component is used in number management interfaces where efficient
 * pagination is required for large number pools with thousands of entries.
 * ===============================================================================
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp, deleteDoc, orderBy, onSnapshot, writeBatch, getDoc, addDoc, arrayUnion, runTransaction, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
// ===============================================================================
// IMPORT DEPENDENCIES - CACHING, PAGINATION, AND UTILITIES
// ===============================================================================

// IndexedDB caching utilities for performance optimization
import { 
  getCachedPaginatedNumbers, 
  cachePaginatedNumbers, 
  searchCachedNumbersFast,
  buildSearchIndex,
  updateCachedNumber,
  batchUpdateCachedNumbers
} from '../../utils/indexedDB';

// Pagination system for efficient data loading
import { NumberPoolPagination, paginationUtils } from '../../utils/pagination';

// Unified search functionality for consistent results
import { unifiedSearch } from '../../utils/unifiedSearch';

// Authentication and state management
import { useAuthStore } from '../../store/authStore';
import { numberPoolStatsService } from '../../services/numberPoolStatsService';

// Type definitions for number pool and status
import { NumberPool as NumberPoolType, NumberStatus } from '../../types';

// User interface and notification utilities
import { toast } from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { useDebounce } from '../../hooks/useDebounce';

// Action logging for audit trail
import { logNumberAction } from '../../utils/numberLogging';
import { resolveUserName } from '../../utils/numberLogging';
// UI component imports for icons, styling, and animations
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
  Edit
} from 'lucide-react';
import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatBox } from '../../components/ChatBox';
import { formatDistanceToNow } from 'date-fns';

// ===============================================================================
// AGENT TEAM INFO COMPONENT - DISPLAYS AGENT AND TEAM INFORMATION
// ===============================================================================

/**
 * AgentTeamInfo Component
 * 
 * Displays agent name and team information for a given agent ID. Handles
 * permission-based data access and provides fallback values for missing data.
 * 
 * @param agentId - The ID of the agent to fetch information for
 */
const AgentTeamInfo = ({ agentId }: { agentId: string }) => {
  // State for storing agent and team information
  const [agentInfo, setAgentInfo] = useState<{ name: string; teamName: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, isAdmin } = useAuthStore();

  // Fetch agent and team information when agentId changes
  useEffect(() => {
    const fetchAgentInfo = async () => {
      try {
        setLoading(true);
        
        // Fetch user document from Firestore
        const userDoc = await getDoc(doc(db, 'users', agentId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          // Use name, email as fallback, or default to 'Unknown Agent'
          const agentName = userData.name || userData.email || 'Unknown Agent';
          
          // Get team information with permission checking
          // Only admins, coordinators, and managers can see team details
          let teamName = 'No Team';
          if (userData.teamId && (isAdmin() || user?.role === 'coordinator' || user?.role === 'manager')) {
            try {
              const teamDoc = await getDoc(doc(db, 'teams', userData.teamId));
              if (teamDoc.exists()) {
                teamName = teamDoc.data().name || 'Unknown Team';
              }
            } catch (teamError) {
              // Handle permission errors gracefully
              console.warn('No permission to read team data:', teamError);
              teamName = 'No Team';
            }
          }
          
          setAgentInfo({ name: agentName, teamName });
        }
      } catch (error) {
        console.error('Error fetching agent info:', error);
        // Set error state for display
        setAgentInfo({ name: 'Error', teamName: 'Error' });
      } finally {
        setLoading(false);
      }
    };

    // Only fetch if agentId is provided
    if (agentId) {
      fetchAgentInfo();
    }
  }, [agentId, isAdmin, user?.role]);

  // Loading state with skeleton animation
  if (loading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="h-4 w-4 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-3 w-16 bg-gray-200 rounded animate-pulse"></div>
      </div>
    );
  }

  // Error state for missing data
  if (!agentInfo) {
    return <span className="text-gray-400">Unknown</span>;
  }

  // Render agent name and team information
  return (
    <div className="flex flex-col">
      <span className="font-medium text-sm">{agentInfo.name}</span>
      <span className="text-xs text-gray-500">{agentInfo.teamName}</span>
    </div>
  );
};

// ===============================================================================
// COMPONENT INTERFACES AND CONSTANTS
// ===============================================================================

/**
 * Props interface for NumberPoolPaginated component
 * 
 * @param onNumberSelect - Callback function when a number is selected for assignment
 * @param selectedCategory - Pre-selected category filter to apply on load
 * @param onCategoryChange - Callback when category filter changes
 */
interface NumberPoolProps {
  onNumberSelect?: (number: NumberPoolType) => void;
  selectedCategory?: string;
  onCategoryChange?: (category: string) => void;
}

/**
 * Maximum number of reservations allowed per user
 * Prevents agent overload and ensures fair number distribution
 */
const MAX_RESERVATIONS = 3;

/**
 * ===============================================================================
 * MAIN COMPONENT - NUMBER POOL PAGINATED
 * ===============================================================================
 * 
 * Main component function that renders the paginated number pool interface.
 * Manages state, handles pagination, search, and number operations.
 */
export function NumberPoolPaginated({ onNumberSelect, selectedCategory: propSelectedCategory, onCategoryChange }: NumberPoolProps = {}) {
  // ===============================================================================
  // STATE MANAGEMENT - CORE DATA AND UI STATE
  // ===============================================================================
  
  // Core number data and loading states
  const [numbers, setNumbers] = useState<NumberPoolType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPool, setShowPool] = useState(true);
  const { user, isAdmin } = useAuthStore();
  
  // Pagination state management
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(paginationUtils.calculateOptimalPageSize());
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [statsTotalPages, setStatsTotalPages] = useState<number>(0);
  const [statsTotalItems, setStatsTotalItems] = useState<number>(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  
  // Search and filtering state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(propSelectedCategory || 'all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'lastStatusChange' | 'number' | 'status'>('lastStatusChange');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Number reservation tracking and countdown management
  const [hasReservation, setHasReservation] = useState(false);
  const [reservedNumbers, setReservedNumbers] = useState<NumberPoolType[]>([]);
  const [reservationCountdowns, setReservationCountdowns] = useState<Record<string, number>>({});
  
  // UI modal and dialog states
  const [showReserveDialog, setShowReserveDialog] = useState(false);
  const [showReleaseDialog, setShowReleaseDialog] = useState(false);
  const [showReserveLimitDialog, setShowReserveLimitDialog] = useState(false);
  const [showNumberActiveDialog, setShowNumberActiveDialog] = useState(false);
  const [activeNumberInfo, setActiveNumberInfo] = useState<{number: string, etiStatus: number, message: string} | null>(null);
  const [selectedNumber, setSelectedNumber] = useState<NumberPoolType | null>(null);
  const [claimTimer, setClaimTimer] = useState<NodeJS.Timeout | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [selectedNumberForChat, setSelectedNumberForChat] = useState<NumberPoolType | null>(null);
  
  // Pagination and search state
  const paginationRef = useRef<NumberPoolPagination | null>(null);
  const [searchResults, setSearchResults] = useState<NumberPoolType[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Debounced search term for performance optimization
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  
  // URL parameter handling for direct number access
  const [searchParams, setSearchParams] = useSearchParams();
  const numberIdFromUrl = searchParams.get('numberId');

  // ===============================================================================
  // PAGINATION INITIALIZATION AND CONFIGURATION
  // ===============================================================================
  
  /**
   * Initialize pagination system with current filters and configuration
   * Recreates pagination instance when filters or configuration change
   */
  useEffect(() => {
    // Build filter array based on selected filters
    const filters = [];
    if (selectedCategory !== 'all') {
      filters.push({ field: 'category', operator: '==' as const, value: selectedCategory });
    }
    if (selectedStatus !== 'all') {
      filters.push({ field: 'status', operator: '==' as const, value: selectedStatus });
    }

    // Create new pagination instance with current configuration
    paginationRef.current = new NumberPoolPagination({
      pageSize,
      orderBy: sortBy,
      orderDirection: sortOrder,
      filters
    });

    // Cleanup function to destroy pagination instance on unmount or config change
    return () => {
      if (paginationRef.current) {
        paginationRef.current.destroy();
      }
    };
  }, [pageSize, selectedCategory, selectedStatus, sortBy, sortOrder]);

  // Live stats for total pages/items to avoid stale cache and hard refreshes
  useEffect(() => {
    let isMounted = true;
    let unsub: (() => void) | undefined;

    const hydrate = async () => {
      try {
        const pages = await numberPoolStatsService.getTotalPages(pageSize, selectedCategory || undefined);
        const items = await numberPoolStatsService.getTotalItems(selectedCategory || undefined);
        if (!isMounted) return;
        setStatsTotalPages(pages || 0);
        setStatsTotalItems(items || 0);
      } catch {}
    };

    hydrate();
    unsub = numberPoolStatsService.subscribeToStats(async () => {
      if (!isMounted) return;
      await hydrate();
    });

    const onFocus = () => {
      numberPoolStatsService.clearCache();
      hydrate();
    };
    const visHandler = () => { if (document.visibilityState === 'visible') onFocus(); };
    const storageHandler = (e: StorageEvent) => {
      if (e.key === 'npInvalidate') {
        numberPoolStatsService.clearCache();
        hydrate();
      }
    };
    window.addEventListener('visibilitychange', visHandler);
    window.addEventListener('storage', storageHandler);

    return () => {
      isMounted = false;
      if (unsub) unsub();
      window.removeEventListener('visibilitychange', visHandler);
      window.removeEventListener('storage', storageHandler);
    };
  }, [pageSize, selectedCategory]);

  /**
   * Load initial page data with caching optimization
   * Attempts to load from cache first, then falls back to Firebase
   */
  useEffect(() => {
    if (!paginationRef.current) return;

    const loadInitialPage = async () => {
      try {
        setLoading(true);
        
        // Check cache first for improved performance
        const cachedNumbers = await getCachedPaginatedNumbers(selectedCategory, currentPage, pageSize);
        if (cachedNumbers && cachedNumbers.length > 0) {
          setNumbers(cachedNumbers);
          setLoading(false);
        }

        // Load fresh data from Firebase for consistency
        const result = await paginationRef.current!.loadFirstPage();
        setNumbers(result.data);
        setTotalPages(result.pagination.totalPages);
        setTotalItems(result.pagination.totalItems);
        setHasNextPage(result.pagination.hasNextPage);
        setHasPreviousPage(result.pagination.hasPreviousPage);
        
        // Cache the fresh results for future use
        await cachePaginatedNumbers(result.data, selectedCategory, currentPage, pageSize);
        
        setLoading(false);
      } catch (error) {
        console.error('Error loading initial page:', error);
        toast.error('Failed to load numbers');
        setLoading(false);
      }
    };

    loadInitialPage();
  }, [selectedCategory, selectedStatus, sortBy, sortOrder, pageSize]);

  /**
   * Handle search functionality with debounced input
   * Uses unified search to ensure consistent results across cached and live data
   */
  useEffect(() => {
    // Clear search results when search term is empty
    if (!debouncedSearchTerm.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const performSearch = async () => {
      setIsSearching(true);
      try {
        // Use unified search for consistent results across all data sources
        const result = await unifiedSearch.search(debouncedSearchTerm, {
          category: selectedCategory,
          limit: 100,
          includeStale: false
        });
        
        setSearchResults(result.data);
        
        // Log search performance for debugging and optimization
        console.log(`Search "${debouncedSearchTerm}": ${result.source} source, ${result.data.length} results, complete: ${result.isComplete}`);
        
        if (!result.isComplete) {
          console.warn('Search may be incomplete - some results might be missing');
        }
      } catch (error) {
        console.error('Search error:', error);
        toast.error('Search failed');
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedSearchTerm, selectedCategory, selectedStatus]);

  /**
   * Real-time updates for search results
   * Sets up Firestore snapshot listeners to keep search results updated in real-time
   */
  useEffect(() => {
    if (!debouncedSearchTerm.trim() || searchResults.length === 0) {
      return;
    }

    // Set up snapshot listeners for each search result number
    const unsubscribeFunctions: (() => void)[] = [];
    
    searchResults.forEach(number => {
      const numberRef = doc(db, 'numberPool', number.id);
      const unsubscribe = onSnapshot(numberRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
          const updatedNumber = { id: docSnapshot.id, ...docSnapshot.data() } as NumberPoolType;
          
          // Update search results with fresh data
          setSearchResults(prevResults => 
            prevResults.map(n => n.id === updatedNumber.id ? updatedNumber : n)
          );
        }
      });
      
      unsubscribeFunctions.push(unsubscribe);
    });

    // Cleanup function to unsubscribe from all listeners
    return () => {
      unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    };
  }, [debouncedSearchTerm, searchResults]);

  // ===============================================================================
  // NAVIGATION AND PAGINATION FUNCTIONS
  // ===============================================================================
  /**
   * Navigate to the next page of results
   * Loads next page data and updates UI state accordingly
   */
  const goToNextPage = useCallback(async () => {
    if (!paginationRef.current || !hasNextPage) return;

    try {
      setLoading(true);
      const result = await paginationRef.current.loadNextPage();
      setNumbers(result.data);
      setCurrentPage(result.pagination.currentPage);
      setHasNextPage(result.pagination.hasNextPage);
      setHasPreviousPage(result.pagination.hasPreviousPage);
      
      // Cache the results for improved performance on revisit
      await cachePaginatedNumbers(result.data, selectedCategory, result.pagination.currentPage, pageSize);
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading next page:', error);
      toast.error('Failed to load next page');
      setLoading(false);
    }
  }, [hasNextPage, selectedCategory, pageSize]);

  /**
   * Navigate to the previous page of results
   * Loads previous page data and updates UI state accordingly
   */
  const goToPreviousPage = useCallback(async () => {
    if (!paginationRef.current || !hasPreviousPage) return;

    try {
      setLoading(true);
      const result = await paginationRef.current.loadPreviousPage();
      setNumbers(result.data);
      setCurrentPage(result.pagination.currentPage);
      setHasNextPage(result.pagination.hasNextPage);
      setHasPreviousPage(result.pagination.hasPreviousPage);
      
      // Cache the results for improved performance on revisit
      await cachePaginatedNumbers(result.data, selectedCategory, result.pagination.currentPage, pageSize);
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading previous page:', error);
      toast.error('Failed to load previous page');
      setLoading(false);
    }
  }, [hasPreviousPage, selectedCategory, pageSize]);

  /**
   * Navigate directly to a specific page
   * Validates page number and loads the requested page
   */
  const goToPage = useCallback(async (page: number) => {
    if (!paginationRef.current || page < 1 || page > totalPages) return;

    try {
      setLoading(true);
      const result = await paginationRef.current.loadPage(page);
      setNumbers(result.data);
      setCurrentPage(result.pagination.currentPage);
      setHasNextPage(result.pagination.hasNextPage);
      setHasPreviousPage(result.pagination.hasPreviousPage);
      
      // Cache the results for improved performance on revisit
      await cachePaginatedNumbers(result.data, selectedCategory, result.pagination.currentPage, pageSize);
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading page:', error);
      toast.error('Failed to load page');
      setLoading(false);
    }
  }, [totalPages, selectedCategory, pageSize]);

  /**
   * Reset to first page when filters change
   * Ensures user sees the first page when applying new filters
   */
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, selectedStatus, sortBy, sortOrder, pageSize]);

  /**
   * Update reserved numbers tracking
   * Filters and tracks user's reserved numbers and checks reservation limits
   */
  useEffect(() => {
    const userReservedNumbers = numbers.filter(n => n.status === 'reserved' && n.reservedBy === user?.id);
    setReservedNumbers(userReservedNumbers);
    setHasReservation(userReservedNumbers.length >= MAX_RESERVATIONS);
  }, [numbers, user?.id]);

  /**
   * Update countdown timers for reserved numbers
   * Handles real-time countdown updates for number reservation expiration
   * Supports multiple date formats from Firestore and handles timezone conversion
   */
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const newReservationCountdowns: Record<string, number> = {};

      // Combine all numbers including search results for comprehensive coverage
      const allNumbers = [...numbers, ...searchResults];
      
      allNumbers.forEach(number => {
        if (number.status === 'reserved' && number.expiresAt) {
          let expiresAt: number;
          
          // Handle different date formats that can come from Firestore
          if (typeof number.expiresAt === 'object' && typeof (number.expiresAt as any)?.toDate === 'function') {
            // Firestore Timestamp object
            expiresAt = (number.expiresAt as any).toDate().getTime();
          } else if (number.expiresAt instanceof Date) {
            // Already a Date object
            expiresAt = number.expiresAt.getTime();
          } else if (typeof number.expiresAt === 'string') {
            // ISO string format
            expiresAt = new Date(number.expiresAt).getTime();
          } else if (typeof number.expiresAt === 'number') {
            // Unix timestamp
            expiresAt = number.expiresAt;
          } else {
            // Try to parse as date for edge cases
            expiresAt = new Date(number.expiresAt as any).getTime();
          }
          
          // Calculate remaining time and store if valid
          const timeLeft = Math.max(0, expiresAt - now);
          if (timeLeft > 0 && !Number.isNaN(expiresAt)) {
            newReservationCountdowns[number.id] = timeLeft;
          }
        }
      });

      setReservationCountdowns(newReservationCountdowns);
    }, 1000);

    // Cleanup interval on unmount or dependency change
    return () => clearInterval(interval);
  }, [numbers, searchResults]);

  /**
   * Handle number selection from URL parameters
   * Opens chat for specific number when accessed via direct URL
   */
  useEffect(() => {
    if (numberIdFromUrl && numbers.length > 0) {
      const number = numbers.find(n => n.id === numberIdFromUrl);
      if (number) {
        setSelectedNumberForChat(number);
        setShowChat(true);
      }
    }
  }, [numberIdFromUrl, numbers]);

  /**
   * Handle number reservation with validation and transaction safety
   * Checks number availability, user limits, and performs atomic reservation
   */
  const handleReserve = useCallback(async (number: NumberPoolType) => {
    // Validate user authentication
    if (!user?.id) {
      toast.error('You must be logged in to reserve numbers');
      return;
    }

    // Check user's current reservation count
    const userReservedNumbers = numbers.filter(n => n.status === 'reserved' && n.reservedBy === user.id);
    
    if (userReservedNumbers.length >= MAX_RESERVATIONS) {
      setShowReserveLimitDialog(true);
      return;
    }

    try {
      // Show checking status to user
      toast.loading('Checking number status...', { id: 'number-check' });
      
      // Verify number is available before attempting reservation
      const { NumberCheckService } = await import('../../services/numberCheckService');
      const canReserve = await NumberCheckService.canReserveNumber(number.number);
      
      // Dismiss loading toast
      toast.dismiss('number-check');
      
      if (!canReserve) {
        // Number is active, show dialog instead of toast
        setActiveNumberInfo({
          number: number.number,
          etiStatus: 200, // ETI API returned 200 for active numbers
          message: 'Number is active'
        });
        setShowNumberActiveDialog(true);
        return;
      }
      
      const numberRef = doc(db, 'numberPool', number.id);
      
      // Use transaction to ensure atomic reservation
      await runTransaction(db, async (transaction) => {
        const numberDoc = await transaction.get(numberRef);
        if (!numberDoc.exists()) {
          throw new Error('Number not found');
        }
        
        const numberData = numberDoc.data();
        if (numberData.reservedBy) {
          throw new Error('Number has already been reserved by another agent');
        }
        
        // Double-check reservation limit within transaction
        if (userReservedNumbers.length >= MAX_RESERVATIONS) {
          throw new Error(`You can only reserve up to ${MAX_RESERVATIONS} numbers at a time`);
        }
        
        // Prepare the update data for reservation
        const updateData = {
          status: 'reserved' as NumberStatus,
          reservedBy: user.id,
          reservedAt: serverTimestamp(),
          lastStatusChange: serverTimestamp(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
          claimQueue: [],
          claimCount: 0
        };
        
        transaction.update(numberRef, updateData);
        
        return updateData;
      });

      // Update local state immediately for responsive UI
      const updatedNumber: NumberPoolType = {
        ...number,
        status: 'reserved',
        reservedBy: user.id,
        reservedAt: new Date(),
        lastStatusChange: new Date(),
        expiresAt: new Date(Date.now() + 2 * 60 * 1000), // 2 minutes (for testing)
        claimQueue: [],
        claimCount: 0
      };

      setNumbers(prev => prev.map(n => 
        n.id === number.id ? updatedNumber : n
      ));
      setReservedNumbers(prev => [...prev, updatedNumber]);
      
      // Update cache for offline access
      await updateCachedNumber(updatedNumber);
      
      // Log the reservation action for audit trail
      await logNumberAction(
        number.id,
        number.number,
        'reserved',
        number,
        updatedNumber
      );

      toast.success(`Number ${number.number} reserved successfully`);
    } catch (error) {
      console.error('Error reserving number:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to reserve number');
    }
  }, [user, numbers]);

  // ===============================================================================
  // RENDER UTILITIES AND UI COMPONENTS
  // ===============================================================================
  
  /**
   * Get display numbers based on current state
   * Returns search results if searching, otherwise returns paginated numbers
   */
  const displayNumbers = useMemo(() => {
    if (debouncedSearchTerm.trim() && searchResults.length > 0) {
      return searchResults;
    }
    return numbers;
  }, [debouncedSearchTerm, searchResults, numbers]);

  /**
   * Render pagination controls with navigation buttons and page numbers
   * Shows different UI for search results vs paginated results
   */
  const renderPaginationControls = () => {
    if (debouncedSearchTerm.trim()) {
      return (
        <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200">
          <div className="text-sm text-gray-700">
            Showing {searchResults.length} search results
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200">
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-700">
            Page {currentPage} of {statsTotalPages > 0 ? statsTotalPages : totalPages} ({statsTotalItems > 0 ? statsTotalItems : totalItems} total)
          </span>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={goToPreviousPage}
            disabled={!hasPreviousPage || loading}
            className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          
          {/* Page numbers */}
          <div className="flex space-x-1">
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
              if (pageNum > totalPages) return null;
              
              return (
                <button
                  key={pageNum}
                  onClick={() => goToPage(pageNum)}
                  disabled={loading}
                  className={clsx(
                    'px-3 py-1 text-sm border rounded',
                    pageNum === currentPage
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'border-gray-300 hover:bg-gray-50'
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>
          
          <button
            onClick={goToNextPage}
            disabled={!hasNextPage || loading}
            className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  /**
   * Render search and filter controls
   * Provides search input, category filter, status filter, and sorting options
   */
  const renderControls = () => (
    <div className="bg-white p-4 border-b border-gray-200 space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search numbers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <select
          value={selectedCategory}
          onChange={(e) => {
            setSelectedCategory(e.target.value);
            onCategoryChange?.(e.target.value);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Categories</option>
          <option value="premium">Premium</option>
          <option value="standard">Standard</option>
          <option value="basic">Basic</option>
        </select>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="reserved">Reserved</option>
          <option value="claimed">Claimed</option>
        </select>

        <select
          value={`${sortBy}-${sortOrder}`}
          onChange={(e) => {
            const [field, order] = e.target.value.split('-');
            setSortBy(field as any);
            setSortOrder(order as any);
          }}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="lastStatusChange-desc">Newest First</option>
          <option value="lastStatusChange-asc">Oldest First</option>
          <option value="number-asc">Number A-Z</option>
          <option value="number-desc">Number Z-A</option>
          <option value="status-asc">Status A-Z</option>
          <option value="status-desc">Status Z-A</option>
        </select>
      </div>
    </div>
  );

  // ===============================================================================
  // MAIN COMPONENT RENDER
  // ===============================================================================
  
  return (
    <div className="flex flex-col h-full">
      {/* Render search and filter controls */}
      {renderControls()}
      
      {/* Main numbers list with pagination */}
      <div className="flex-1 overflow-auto">
        {/* Loading state */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : displayNumbers.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <div className="text-center">
              <Hash className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No numbers found</p>
              {debouncedSearchTerm.trim() && (
                <p className="text-sm">Try adjusting your search terms</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2 p-4">
            {displayNumbers.map((number) => (
              <div
                key={number.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4">
                      <span className="font-mono text-lg font-semibold">{number.number}</span>
                      <span className={clsx(
                        'px-2 py-1 text-xs rounded-full',
                        number.status === 'open' && 'bg-green-100 text-green-800',
                        number.status === 'reserved' && 'bg-yellow-100 text-yellow-800',
                        number.status === 'claimed' && 'bg-blue-100 text-blue-800'
                      )}>
                        {number.status}
                      </span>
                      <span className="text-sm text-gray-500">{number.category}</span>
                    </div>
                    
                    {number.reservedBy && (
                      <div className="mt-2">
                        <AgentTeamInfo agentId={number.reservedBy} />
                      </div>
                    )}
                    
                    {/* Add countdown timer for reserved numbers */}
                    {number.status === 'reserved' && (() => {
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
                        <div className="mt-2">
                          <div className="flex items-center space-x-2 bg-gradient-to-br from-green-50 to-green-100 rounded-lg px-3 py-2 inline-flex">
                            <Clock className="h-4 w-4 text-green-600" />
                            <div>
                              <p className="text-xs text-green-600 font-medium">Expires In</p>
                              <p className="text-sm font-semibold text-green-700">
                                {(() => {
                                  const totalSeconds = Math.ceil(timeLeft / 1000);
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
                                })()}
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {number.status === 'open' && (
                      <button
                        onClick={() => handleReserve(number)}
                        disabled={hasReservation}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Reserve
                      </button>
                    )}
                    
                    {onNumberSelect && (
                      <button
                        onClick={() => onNumberSelect(number)}
                        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Select
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Render pagination controls */}
      {renderPaginationControls()}
      
      {/* Chat Modal - Opens for number-specific communication */}
      {showChat && selectedNumberForChat && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-4xl h-5/6 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Chat with {selectedNumberForChat.number}</h3>
              <button
                onClick={() => setShowChat(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="flex-1">
              <ChatBox 
                numberId={selectedNumberForChat.id}
                originalAgentId={selectedNumberForChat.reservedBy || ''}
                claimingAgentId={selectedNumberForChat.claimingAgentId || ''}
                onClose={() => setShowChat(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Number Active Dialog - Shows when attempting to reserve an active number */}
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
    </div>
  );
}
