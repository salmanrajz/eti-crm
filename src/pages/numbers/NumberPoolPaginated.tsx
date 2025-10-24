import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, serverTimestamp, deleteDoc, orderBy, onSnapshot, writeBatch, getDoc, addDoc, arrayUnion, runTransaction, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  getCachedPaginatedNumbers, 
  cachePaginatedNumbers, 
  searchCachedNumbersFast,
  buildSearchIndex,
  updateCachedNumber,
  batchUpdateCachedNumbers
} from '../../utils/indexedDB';
import { NumberPoolPagination, paginationUtils } from '../../utils/pagination';
import { useAuthStore } from '../../store/authStore';
import { NumberPool as NumberPoolType, NumberStatus } from '../../types';
import { toast } from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { useDebounce } from '../../hooks/useDebounce';
import { logNumberAction } from '../../utils/numberLogging';
import { resolveUserName } from '../../utils/numberLogging';
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

// Component to display agent and team information
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
              console.warn('No permission to read team data:', teamError);
              teamName = 'No Team';
            }
          }
          
          setAgentInfo({ name: agentName, teamName });
        }
      } catch (error) {
        console.error('Error fetching agent info:', error);
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
    return <span className="text-gray-400">Unknown</span>;
  }

  return (
    <div className="flex flex-col">
      <span className="font-medium text-sm">{agentInfo.name}</span>
      <span className="text-xs text-gray-500">{agentInfo.teamName}</span>
    </div>
  );
};

interface NumberPoolProps {
  onNumberSelect?: (number: NumberPoolType) => void;
  selectedCategory?: string;
  onCategoryChange?: (category: string) => void;
}

const MAX_RESERVATIONS = 3;

export function NumberPoolPaginated({ onNumberSelect, selectedCategory: propSelectedCategory, onCategoryChange }: NumberPoolProps = {}) {
  // Core state
  const [numbers, setNumbers] = useState<NumberPoolType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPool, setShowPool] = useState(true);
  const { user, isAdmin } = useAuthStore();
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(paginationUtils.calculateOptimalPageSize());
  const [totalPages, setTotalPages] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  
  // Search and filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(propSelectedCategory || 'all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'lastStatusChange' | 'number' | 'status'>('lastStatusChange');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Reservation state
  const [hasReservation, setHasReservation] = useState(false);
  const [reservedNumbers, setReservedNumbers] = useState<NumberPoolType[]>([]);
  
  // UI state
  const [showReserveDialog, setShowReserveDialog] = useState(false);
  const [showReleaseDialog, setShowReleaseDialog] = useState(false);
  const [showReserveLimitDialog, setShowReserveLimitDialog] = useState(false);
  const [selectedNumber, setSelectedNumber] = useState<NumberPoolType | null>(null);
  const [claimTimer, setClaimTimer] = useState<NodeJS.Timeout | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [selectedNumberForChat, setSelectedNumberForChat] = useState<NumberPoolType | null>(null);
  
  // Pagination instance
  const paginationRef = useRef<NumberPoolPagination | null>(null);
  const [searchResults, setSearchResults] = useState<NumberPoolType[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Debounced search term
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  
  // URL params
  const [searchParams, setSearchParams] = useSearchParams();
  const numberIdFromUrl = searchParams.get('numberId');

  // Initialize pagination
  useEffect(() => {
    const filters = [];
    if (selectedCategory !== 'all') {
      filters.push({ field: 'category', operator: '==' as const, value: selectedCategory });
    }
    if (selectedStatus !== 'all') {
      filters.push({ field: 'status', operator: '==' as const, value: selectedStatus });
    }

    paginationRef.current = new NumberPoolPagination({
      pageSize,
      orderBy: sortBy,
      orderDirection: sortOrder,
      filters
    });

    return () => {
      if (paginationRef.current) {
        paginationRef.current.destroy();
      }
    };
  }, [pageSize, selectedCategory, selectedStatus, sortBy, sortOrder]);

  // Load initial page
  useEffect(() => {
    if (!paginationRef.current) return;

    const loadInitialPage = async () => {
      try {
        setLoading(true);
        
        // Check cache first
        const cachedNumbers = await getCachedPaginatedNumbers(selectedCategory, currentPage, pageSize);
        if (cachedNumbers && cachedNumbers.length > 0) {
          setNumbers(cachedNumbers);
          setLoading(false);
        }

        // Load from Firebase
        const result = await paginationRef.current!.loadFirstPage();
        setNumbers(result.data);
        setTotalPages(result.pagination.totalPages);
        setTotalItems(result.pagination.totalItems);
        setHasNextPage(result.pagination.hasNextPage);
        setHasPreviousPage(result.pagination.hasPreviousPage);
        
        // Cache the results
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

  // Handle search
  useEffect(() => {
    if (!debouncedSearchTerm.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const performSearch = async () => {
      setIsSearching(true);
      try {
        // First try cached search
        const cachedResults = await searchCachedNumbersFast(debouncedSearchTerm, selectedCategory, 50);
        if (cachedResults && cachedResults.length > 0) {
          setSearchResults(cachedResults);
          setIsSearching(false);
          return;
        }

        // If no cached results, search Firebase directly
        if (paginationRef.current) {
          const firebaseResults = await paginationRef.current.searchNumbers(
            debouncedSearchTerm,
            selectedCategory !== 'all' ? selectedCategory : undefined,
            selectedStatus !== 'all' ? selectedStatus : undefined,
            100
          );
          setSearchResults(firebaseResults);
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

  // Navigation functions
  const goToNextPage = useCallback(async () => {
    if (!paginationRef.current || !hasNextPage) return;

    try {
      setLoading(true);
      const result = await paginationRef.current.loadNextPage();
      setNumbers(result.data);
      setCurrentPage(result.pagination.currentPage);
      setHasNextPage(result.pagination.hasNextPage);
      setHasPreviousPage(result.pagination.hasPreviousPage);
      
      // Cache the results
      await cachePaginatedNumbers(result.data, selectedCategory, result.pagination.currentPage, pageSize);
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading next page:', error);
      toast.error('Failed to load next page');
      setLoading(false);
    }
  }, [hasNextPage, selectedCategory, pageSize]);

  const goToPreviousPage = useCallback(async () => {
    if (!paginationRef.current || !hasPreviousPage) return;

    try {
      setLoading(true);
      const result = await paginationRef.current.loadPreviousPage();
      setNumbers(result.data);
      setCurrentPage(result.pagination.currentPage);
      setHasNextPage(result.pagination.hasNextPage);
      setHasPreviousPage(result.pagination.hasPreviousPage);
      
      // Cache the results
      await cachePaginatedNumbers(result.data, selectedCategory, result.pagination.currentPage, pageSize);
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading previous page:', error);
      toast.error('Failed to load previous page');
      setLoading(false);
    }
  }, [hasPreviousPage, selectedCategory, pageSize]);

  const goToPage = useCallback(async (page: number) => {
    if (!paginationRef.current || page < 1 || page > totalPages) return;

    try {
      setLoading(true);
      const result = await paginationRef.current.loadPage(page);
      setNumbers(result.data);
      setCurrentPage(result.pagination.currentPage);
      setHasNextPage(result.pagination.hasNextPage);
      setHasPreviousPage(result.pagination.hasPreviousPage);
      
      // Cache the results
      await cachePaginatedNumbers(result.data, selectedCategory, result.pagination.currentPage, pageSize);
      
      setLoading(false);
    } catch (error) {
      console.error('Error loading page:', error);
      toast.error('Failed to load page');
      setLoading(false);
    }
  }, [totalPages, selectedCategory, pageSize]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, selectedStatus, sortBy, sortOrder, pageSize]);

  // Update reserved numbers
  useEffect(() => {
    const userReservedNumbers = numbers.filter(n => n.status === 'reserved' && n.reservedBy === user?.id);
    setReservedNumbers(userReservedNumbers);
    setHasReservation(userReservedNumbers.length >= MAX_RESERVATIONS);
  }, [numbers, user?.id]);

  // Handle number selection from URL
  useEffect(() => {
    if (numberIdFromUrl && numbers.length > 0) {
      const number = numbers.find(n => n.id === numberIdFromUrl);
      if (number) {
        setSelectedNumberForChat(number);
        setShowChat(true);
      }
    }
  }, [numberIdFromUrl, numbers]);

  // Reserve number function
  const handleReserve = useCallback(async (number: NumberPoolType) => {
    if (!user?.id) {
      toast.error('You must be logged in to reserve numbers');
      return;
    }

    const userReservedNumbers = numbers.filter(n => n.status === 'reserved' && n.reservedBy === user.id);
    
    if (userReservedNumbers.length >= MAX_RESERVATIONS) {
      setShowReserveLimitDialog(true);
      return;
    }

    try {
      const numberRef = doc(db, 'numberPool', number.id);
      
      await runTransaction(db, async (transaction) => {
        const numberDoc = await transaction.get(numberRef);
        if (!numberDoc.exists()) {
          throw new Error('Number not found');
        }
        
        const numberData = numberDoc.data();
        if (numberData.reservedBy) {
          throw new Error('Number has already been reserved by another agent');
        }
        
        // Check if user has reached maximum reservations
        if (userReservedNumbers.length >= MAX_RESERVATIONS) {
          throw new Error(`You can only reserve up to ${MAX_RESERVATIONS} numbers at a time`);
        }
        
        // Prepare the update data
        const updateData = {
          status: 'reserved' as NumberStatus,
          reservedBy: user.id,
          reservedAt: serverTimestamp(),
          lastStatusChange: serverTimestamp(),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          claimQueue: [],
          claimCount: 0
        };
        
        transaction.update(numberRef, updateData);
        
        return updateData;
      });

      // Update local state
      const updatedNumber: NumberPoolType = {
        ...number,
        status: 'reserved',
        reservedBy: user.id,
        reservedAt: new Date(),
        lastStatusChange: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        claimQueue: [],
        claimCount: 0
      };

      setNumbers(prev => prev.map(n => 
        n.id === number.id ? updatedNumber : n
      ));
      setReservedNumbers(prev => [...prev, updatedNumber]);
      
      // Update cache
      await updateCachedNumber(updatedNumber);
      
      // Log the reservation action
      await logNumberAction({
        numberId: number.id,
        number: number.number,
        action: 'reserved',
        agentId: user.id,
        agentName: user.name || user.email || 'Unknown',
        timestamp: new Date(),
        details: {
          category: number.category,
          previousStatus: number.status
        }
      });

      toast.success(`Number ${number.number} reserved successfully`);
    } catch (error) {
      console.error('Error reserving number:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to reserve number');
    }
  }, [user, numbers]);

  // Get display numbers (search results or paginated results)
  const displayNumbers = useMemo(() => {
    if (debouncedSearchTerm.trim() && searchResults.length > 0) {
      return searchResults;
    }
    return numbers;
  }, [debouncedSearchTerm, searchResults, numbers]);

  // Render pagination controls
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
            Page {currentPage} of {totalPages} ({totalItems} total)
          </span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="ml-4 px-2 py-1 border border-gray-300 rounded text-sm"
          >
            <option value={25}>25 per page</option>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
          </select>
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

  // Render search and filter controls
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

  return (
    <div className="flex flex-col h-full">
      {renderControls()}
      
      {/* Numbers List */}
      <div className="flex-1 overflow-auto">
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
      
      {renderPaginationControls()}
      
      {/* Chat Modal */}
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
              <ChatBox numberId={selectedNumberForChat.id} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
