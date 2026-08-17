// Global NumberPool manager to persist pagination state and minimize reads
import { SmartPagination } from './smartPagination';
import { NumberPool } from '../types';
// IndexedDB caching removed - using memory-only cache for simplicity
import { onSnapshot, doc, collection, query, where, getDocs, orderBy, startAt, endAt, limit as fbLimit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { numberPoolStatsService } from '../services/numberPoolStatsService';

interface NumberPoolState {
  numbers: NumberPool[];
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  selectedCategory: string | null;
  selectedGroup: string | null;
  selectedInitials: string | null;
  lastLoadTime: number;
  isLoading: boolean;
}

class NumberPoolManager {
  private static instance: NumberPoolManager;
  private pagination: SmartPagination<NumberPool> | null = null;
  private state: NumberPoolState = {
    numbers: [],
    currentPage: 1,
    pageSize: 50,
    totalPages: 0,
    totalItems: 0,
    hasNextPage: false,
    hasPreviousPage: false,
    selectedCategory: null,
    selectedGroup: null,
    selectedInitials: null,
    lastLoadTime: 0,
    isLoading: false
  };
  private subscribers = new Set<(state: NumberPoolState) => void>();
  private visibleListeners = new Map<string, () => void>();
  private userListeners: (() => void)[] = [];
  private pageListener: (() => void) | null = null;
  private isInitialized = false;
  private searchCache = new Map<string, { 
    results: NumberPool[], 
    totalItems: number, 
    cursors: Map<number, any>,
    lastQuery: string 
  }>();
  private searchListeners = new Map<string, () => void>();
  private currentSearchTerm = '';
  private listenerSetupTimeout: NodeJS.Timeout | null = null;
  private enableVisibleListeners = true; // Real-time updates for visible documents
  private preSearchPage = 1; // Remember the page before search started
  private pendingRetryTimeout: NodeJS.Timeout | null = null; // Track pending retry timeout
  private isDestroyed = false; // Flag to prevent retries after destroy

  static getInstance(): NumberPoolManager {
    if (!NumberPoolManager.instance) {
      NumberPoolManager.instance = new NumberPoolManager();
    }
    return NumberPoolManager.instance;
  }

  // Subscribe to state changes
  subscribe(callback: (state: NumberPoolState) => void): () => void {
    this.subscribers.add(callback);
    // Immediately call with current state
    callback({ ...this.state });
    
    return () => {
      this.subscribers.delete(callback);
    };
  }

  private notifySubscribers() {
    this.subscribers.forEach(callback => callback({ ...this.state }));
  }


  // Check if we need to reload data
  private needsReload(category: string | null, pageSize: number, userId?: string, userRole?: string, group?: string | null, initials?: string | null): boolean {
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();
    
    // Always reload if user changed
    if (this.checkUserChange(userId, userRole)) {
      return true;
    }
    
    return (
      !this.isInitialized ||
      this.state.selectedCategory !== category ||
      this.state.selectedGroup !== (group || null) ||
      this.state.selectedInitials !== (initials || null) ||
      this.state.pageSize !== pageSize ||
      (now - this.state.lastLoadTime) > CACHE_DURATION
      // Removed: this.state.numbers.length === 0
      // This was causing infinite reinitialization when filters returned no results
      // Empty results are a valid state and should not trigger reload
    );
  }

  // Store current user role and ID for filtering and change detection
  private currentUserRole: string | undefined;
  private currentUserId: string | undefined;

  private handleSnapshotError(error: any, context: string) {
    if (error?.code === 'permission-denied') {
      // Silent cleanup on permission denied (user logged out or lost permissions)
      try {
        this.destroy();
        this.updateState({
          numbers: [],
          currentPage: 1,
          pageSize: this.state.pageSize,
          totalPages: 0,
          totalItems: 0,
          hasNextPage: false,
          hasPreviousPage: false,
          selectedCategory: null,
          lastLoadTime: 0,
          isLoading: false
        });
      } catch (cleanupError) {
        // Silent cleanup error handling
      }
      return;
    }

    // Log non-permission errors as they might indicate real issues
    console.error(`[NumberPoolManager] Snapshot error (${context}):`, error);
  }

  // Set current user role
  setUserRole(role: string | undefined) {
    this.currentUserRole = role;
  }

  // Get current user role
  private getCurrentUserRole(): string | undefined {
    return this.currentUserRole;
  }

  // Check if user has changed and force reset if needed
  private checkUserChange(userId?: string, userRole?: string): boolean {
    // Don't treat undefined -> userId as a change (initial load)
    // Only treat it as a change if we had a previous user
    const hadPreviousUser = this.currentUserId !== undefined;
    const userChanged = hadPreviousUser && (this.currentUserId !== userId || this.currentUserRole !== userRole);
    
    if (userChanged) {
      console.log('[NumberPoolManager] User changed, forcing reset', {
        oldUserId: this.currentUserId,
        newUserId: userId,
        oldRole: this.currentUserRole,
        newRole: userRole
      });
      // Clear any pending retry timeout when user changes
      if (this.pendingRetryTimeout) {
        clearTimeout(this.pendingRetryTimeout);
        this.pendingRetryTimeout = null;
      }
      // Force reset all state when user changes
      this.currentUserId = userId;
      this.currentUserRole = userRole;
      this.isInitialized = false;
      // Clear all listeners safely
      try {
        if (this.pageListener) {
          this.pageListener();
          this.pageListener = null;
        }
        this.visibleListeners.forEach(unsub => {
          try {
            unsub();
          } catch (e) {
            console.warn('[NumberPoolManager] Error unsubscribing visible listener:', e);
          }
        });
        this.visibleListeners.clear();
        this.userListeners.forEach(unsub => {
          try {
            unsub();
          } catch (e) {
            console.warn('[NumberPoolManager] Error unsubscribing user listener:', e);
          }
        });
        this.userListeners = [];
        this.clearAllSearchListeners();
        // Reset pagination
        if (this.pagination) {
          this.pagination.clearCache();
          this.pagination = null;
        }
      } catch (error) {
        console.error('[NumberPoolManager] Error during user change cleanup:', error);
      }
      // Reset state
      this.updateState({
        numbers: [],
        currentPage: 1,
        pageSize: this.state.pageSize,
        totalPages: 0,
        totalItems: 0,
        hasNextPage: false,
        hasPreviousPage: false,
        selectedCategory: null,
        lastLoadTime: 0,
        isLoading: false
      });
      return true;
    } else if (!hadPreviousUser && userId) {
      // First time setting user (initial load) - just update tracking
      this.currentUserId = userId;
      this.currentUserRole = userRole;
    }
    return false;
  }

  // Filter numbers based on user role and visibility settings
  private filterNumbersByRole(numbers: NumberPool[], userRole?: string): NumberPool[] {
    if (!userRole) {
      return numbers;
    }

    // Agents should not see activated numbers
    if (userRole === 'agent') {
      return numbers.filter(number => number.status !== 'activated');
    }

    // Freelancers can see numbers unless explicitly hidden (visibleToFreelancers === false)
    if (userRole === 'freelancer') {
      return numbers.filter(number => number.visibleToFreelancers !== false);
    }

    // All other roles see everything
    return numbers;
  }

  /**
   * Validate if IndexedDB cache is still fresh by comparing with Firestore stats timestamp
   * Returns true if cache is valid, false if it should be invalidated
   */
  private async validateCacheTimestamp(category: string): Promise<boolean> {
    // No cache with memory-only mode - always return false
        return false;
  }

  // Initialize or get existing data
  async initialize(category: string | null = null, pageSize: number = 50, userId?: string, userRole?: string, group?: string | null, initials?: string | null): Promise<void> {
    
    // Don't initialize if manager has been destroyed and no user is provided (user logged out)
    if (this.isDestroyed && !userId) {
      return;
    }
    
    // Reset destroyed flag if we have a valid user (new login after previous logout)
    if (userId && this.isDestroyed) {
      // New user login after destroy - reset the flag to allow initialization
      this.isDestroyed = false;
    }
    
    // Check user change first - this will force reset if user changed
    const userChanged = this.checkUserChange(userId, userRole);
    
    if (!userChanged && !this.needsReload(category, pageSize, userId, userRole, group, initials)) {
      return;
    }

    // Update user tracking
    this.currentUserId = userId;
    this.currentUserRole = userRole;

    this.updateState({ isLoading: true });

    // Add timeout mechanism to prevent infinite loading
    const timeoutId = setTimeout(() => {
      console.warn('NumberPool initialization timeout - resetting loading state');
      this.updateState({ isLoading: false });
    }, 30000); // 30 second timeout

    try {
      // Track if filters changed to recreate pagination
      const categoryChanged = this.state.selectedCategory !== category;
      const groupChanged = this.state.selectedGroup !== (group || null);
      const initialsChanged = this.state.selectedInitials !== (initials || null);
      
      // Update pagination instance if needed (when any filter or pageSize changes)
      if (!this.pagination || categoryChanged || groupChanged || this.state.pageSize !== pageSize) {
        if (this.pagination) {
          this.pagination.clearCache();
        }

        const filters: Array<{ field: string; operator: any; value: any }> = [];
        if (category && category !== 'all') {
          filters.push({ field: 'category', operator: '==' as const, value: category });
        }
        if (group && group !== 'all') {
          filters.push({ field: 'group', operator: '==' as const, value: group });
        }
        // Initials filtering will be done client-side after fetching (Firestore doesn't support regex easily)
        // Do NOT add a strict filter here; rules now allow missing field. We'll filter client-side.

        this.pagination = new SmartPagination<NumberPool>('numberPool', {
          pageSize,
          orderBy: 'createdAt',
          orderDirection: 'desc', // DESC to show newest numbers first
          filters,
          initials: initials || null // Pass initials for stats service
        });
        
        // No cache to clear with memory-only mode
      } else if (initialsChanged && this.pagination) {
        // If only initials changed, update it and reload data
        this.pagination.updateInitials(initials || null);
        this.pagination.clearCache();
        // Force reload page 1 with new initials filter
      }

      // No cache with memory-only mode - always fetch fresh data from Firestore

      // Load from Firebase
      let result: { data: NumberPool[]; hasNextPage: boolean; hasPreviousPage: boolean } | null = null;
      try {
        result = await this.pagination.loadPage(1);
      } catch (e: any) {
        // Gracefully handle empty datasets (e.g., freelancer with no visible numbers)
        if (typeof e?.message === 'string' && e.message.includes('Page does not exist')) {
          this.updateState({
            numbers: [],
            currentPage: 1,
            pageSize,
            totalPages: 0,
            totalItems: 0,
            hasNextPage: false,
            hasPreviousPage: false,
            selectedCategory: category,
            lastLoadTime: Date.now(),
            isLoading: false
          });
          this.isInitialized = true;
          return;
        }
        throw e;
      }

      // Filter by role first
      let filteredNumbers = this.filterNumbersByRole(result.data, userRole);
      
      // If no numbers match after filtering, stop pagination and show empty state
      const hasResults = filteredNumbers.length > 0;
      const effectiveTotalPages = hasResults ? this.pagination.getTotalPages() : 0;
      const effectiveTotalItems = hasResults ? this.pagination.getTotalItems() : 0;
      
      this.updateState({
        numbers: filteredNumbers,
        currentPage: 1,
        pageSize,
        totalPages: effectiveTotalPages,
        totalItems: effectiveTotalItems,
        hasNextPage: hasResults && result.hasNextPage,
        hasPreviousPage: false, // Always false for page 1
        selectedCategory: category,
        selectedGroup: group || null,
        selectedInitials: initials || null,
        lastLoadTime: Date.now(),
        isLoading: false
      });

      this.isInitialized = true;

      // Attach listeners after the first page is visible so they do not compete with the load.
      const listenerUserId = userId;
      queueMicrotask(() => {
        if (this.isDestroyed || this.currentUserId !== listenerUserId) return;
        this.setupPageListener();
        if (listenerUserId) {
          this.setupUserListeners(listenerUserId);
        }
      });

    } catch (error: any) {
      console.error('[NumberPoolManager] Error initializing NumberPool:', error);
      // Mark as not initialized so next attempt will retry
      this.isInitialized = false;
      this.updateState({ 
        isLoading: false,
        numbers: [],
        currentPage: 1,
        totalPages: 0,
        totalItems: 0,
        hasNextPage: false,
        hasPreviousPage: false,
        selectedCategory: category
      });
      
      // Check if error is a permission error (indicates user logged out)
      const isPermissionError = error?.code === 'permission-denied' || 
                                error?.code === 'PERMISSION_DENIED' ||
                                error?.message?.includes('Missing or insufficient permissions') ||
                                error?.message?.includes('permission-denied');
      
      // Don't retry if:
      // 1. It's a permission error (user logged out)
      // 2. Manager has been destroyed
      // 3. User has changed (logout happened)
      if (isPermissionError || this.isDestroyed || this.currentUserId !== userId) {
        console.log('[NumberPoolManager] Skipping retry - permission error or user logged out');
        return;
      }
      
      // Clear any existing retry timeout
      if (this.pendingRetryTimeout) {
        clearTimeout(this.pendingRetryTimeout);
        this.pendingRetryTimeout = null;
      }
      
      // Auto-retry after a delay if initialization failed (only for non-permission errors)
      this.pendingRetryTimeout = setTimeout(() => {
        this.pendingRetryTimeout = null;
        // Only retry if:
        // 1. Still not initialized
        // 2. User unchanged and still present
        // 3. Manager not destroyed
        // 4. Not a permission error
        if (!this.isDestroyed && !this.isInitialized && userId && this.currentUserId === userId) {
          console.log('[NumberPoolManager] Auto-retrying initialization after error');
          this.initialize(category, pageSize, userId, userRole, group, initials).catch(err => {
            console.error('[NumberPoolManager] Retry initialization failed:', err);
          });
        }
      }, 2000);
    } finally {
      // Always clear the timeout
      clearTimeout(timeoutId);
    }
  }

  // Navigate to next page
  async nextPage(): Promise<void> {
    if (!this.pagination || !this.state.hasNextPage || this.state.isLoading) return;

    this.updateState({ isLoading: true });

    // Add timeout protection
    const timeoutId = setTimeout(() => {
      console.warn('Next page loading timeout - resetting loading state');
      this.updateState({ isLoading: false });
    }, 15000); // 15 second timeout

    try {
      // No cache with memory-only mode - always fetch fresh data
      const result = await this.pagination.nextPage();
      const filteredNumbers = this.filterNumbersByRole(result.data, this.getCurrentUserRole());
      
      // If no numbers match after filtering, stop pagination
      const hasResults = filteredNumbers.length > 0;
      
      this.updateState({
        numbers: filteredNumbers,
        currentPage: this.pagination.getCurrentPage(),
        hasNextPage: hasResults && result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage,
        lastLoadTime: Date.now(),
        isLoading: false
      });

      // OPTIMIZATION: Only set up listeners for first few pages to reduce Firebase allows
      if (this.pagination.getCurrentPage() <= 3) {
      this.setupVisibleListeners(result.data);
      }

      // No caching with memory-only mode

    } catch (error) {
      console.error('Error loading next page:', error);
      this.updateState({ isLoading: false });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Navigate to previous page
  async previousPage(): Promise<void> {
    if (!this.pagination || !this.state.hasPreviousPage || this.state.isLoading) return;

    this.updateState({ isLoading: true });

    try {
      // No cache with memory-only mode - always fetch fresh data
      const result = await this.pagination.previousPage();
      let filteredNumbers = this.filterNumbersByRole(result.data, this.getCurrentUserRole());
      
      // Apply initials filter if set
      if (this.state.selectedInitials && this.state.selectedInitials !== 'all') {
        filteredNumbers = filteredNumbers.filter(n => {
          if (!n.number) return false;
          const numStr = n.number.toString().trim();
          const match = numStr.match(/^(\d{3})/);
          return match && match[1] === this.state.selectedInitials;
        });
      }
      
      // If no numbers match after filtering, stop pagination
      const hasResults = filteredNumbers.length > 0;
      
      this.updateState({
        numbers: filteredNumbers,
        currentPage: this.pagination.getCurrentPage(),
        hasNextPage: hasResults && result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage,
        lastLoadTime: Date.now(),
        isLoading: false
      });

      // OPTIMIZATION: Only set up listeners for first few pages to reduce Firebase allows
      if (this.pagination.getCurrentPage() <= 3) {
      this.setupVisibleListeners(result.data);
      }

      // No caching with memory-only mode

    } catch (error) {
      this.updateState({ isLoading: false });
    }
  }

  // Go to specific page
  async goToPage(page: number): Promise<void> {
    if (!this.pagination || page < 1 || this.state.isLoading) return;

    this.updateState({ isLoading: true });

    try {
      // No cache with memory-only mode - always fetch fresh data
      const result = await this.pagination.loadPage(page);
      const filteredNumbers = this.filterNumbersByRole(result.data, this.getCurrentUserRole());
      
      this.updateState({
        numbers: filteredNumbers,
        currentPage: this.pagination.getCurrentPage(),
        totalPages: this.pagination.getTotalPages(),
        totalItems: this.pagination.getTotalItems(),
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage,
        lastLoadTime: Date.now(),
        isLoading: false
      });

      // OPTIMIZATION: Only set up listeners for first few pages to reduce Firebase allows
      if (page <= 3) {
      this.setupVisibleListeners(result.data);
        this.setupPageListener(); // Set up listeners for new page
      } else {
      }

      // No caching with memory-only mode

    } catch (error) {
      this.updateState({ isLoading: false });
    }
  }

  // Search numbers with cache-first strategy and optimized pagination
  async search(searchTerm: string, page: number = 1, pageSize: number = 50): Promise<{
    data: NumberPool[];
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    currentPage: number;
    totalItems: number;
  }> {
    const term = searchTerm.trim();
    if (!term) {
      return { data: [], hasNextPage: false, hasPreviousPage: false, currentPage: 1, totalItems: 0 };
    }

    try {
      const category = this.state.selectedCategory || 'all';
      const cacheKey = `${term}_${category}_${pageSize}`;
      
      // Check if we have cached results for this query
      const cached = this.searchCache.get(cacheKey);
      if (cached && page <= cached.results.length / pageSize) {
        const filteredResults = this.filterNumbersByRole(cached.results, this.getCurrentUserRole());
        const offset = (page - 1) * pageSize;
        const paginatedResults = filteredResults.slice(offset, offset + pageSize);
        
        // Set up listener for cached results (only if not already listening)
        if (!this.searchListeners.has(cacheKey)) {
          this.setupSearchListener(term, category, pageSize);
        }
        
        return {
          data: paginatedResults,
          hasNextPage: offset + pageSize < filteredResults.length,
          hasPreviousPage: page > 1,
          currentPage: page,
          totalItems: filteredResults.length
        };
      }

      // For first page, get all results and cache them
      if (page === 1) {
        return await this.performFirstPageSearch(term, category, pageSize);
      } else {
        // For subsequent pages, use optimized pagination
        return await this.performPaginatedSearch(term, category, page, pageSize);
      }
    } catch (error) {
      return { data: [], hasNextPage: false, hasPreviousPage: false, currentPage: 1, totalItems: 0 };
    }
  }

  // Perform first page search and cache results
  private async performFirstPageSearch(term: string, category: string, pageSize: number): Promise<{
    data: NumberPool[];
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    currentPage: number;
    totalItems: number;
  }> {
    const lower = term.toLowerCase();

    // 0) Category or Status searches (no n-grams)
    const categories = ['standard', 'silver', 'silver plus', 'gold', 'gold plus', 'platinum'];
    const statuses = ['open', 'reserved', 'pending_verification', 'verified', 'assigned', 'activated', 'follow_up', 'later', 'rejected', 'claimed', 'non_verified'];

    // Category exact match (case-insensitive)
    if (categories.includes(lower)) {
      let base = query(collection(db, 'numberPool'));
      try {
        const snap = await getDocs(query(base, where('category', '==', categories.find(c => c === lower)!.replace(/\b\w/g, (m) => m.toUpperCase())), fbLimit(200)));
        const allResults = snap.docs.map(d => ({ id: d.id, ...d.data() })) as NumberPool[];
        const filteredResults = this.filterNumbersByRole(allResults, this.getCurrentUserRole());
        
        // Cache results for future pagination
        const cacheKey = `${term}_${category}_${pageSize}`;
        this.searchCache.set(cacheKey, { 
          results: filteredResults, 
          totalItems: filteredResults.length, 
          cursors: new Map(),
          lastQuery: term 
        });
        
        // Set up real-time listener for this search
        this.setupSearchListener(term, category, pageSize);
        
        return {
          data: filteredResults.slice(0, pageSize),
          hasNextPage: filteredResults.length > pageSize,
          hasPreviousPage: false,
          currentPage: 1,
          totalItems: filteredResults.length
        };
      } catch (_) {}
    }

    // Status exact match (case-insensitive)
    if (statuses.includes(lower)) {
      let base = query(collection(db, 'numberPool'));
      try {
        const snap = await getDocs(query(base, where('status', '==', lower), fbLimit(200)));
        const allResults = snap.docs.map(d => ({ id: d.id, ...d.data() })) as NumberPool[];
        const filteredResults = this.filterNumbersByRole(allResults, this.getCurrentUserRole());
        
        // Cache results for future pagination
        const cacheKey = `${term}_${category}_${pageSize}`;
        this.searchCache.set(cacheKey, { 
          results: filteredResults, 
          totalItems: filteredResults.length, 
          cursors: new Map(),
          lastQuery: term 
        });
        
        // Set up real-time listener for this search
        this.setupSearchListener(term, category, pageSize);
        
        return {
          data: filteredResults.slice(0, pageSize),
          hasNextPage: filteredResults.length > pageSize,
          hasPreviousPage: false,
          currentPage: 1,
          totalItems: filteredResults.length
        };
      } catch (_) {}
    }

    // 0.5) Exact code search (no n-grams)
    if (/^[a-z0-9]+$/i.test(term)) {
      let base = query(collection(db, 'numberPool'));
      // Try exact 'code' equality in common casings
      const variants = [term, term.toUpperCase(), term.toLowerCase()];
      for (const v of variants) {
        try {
          const snap = await getDocs(query(base, where('code', '==', v), fbLimit(200)));
          if (!snap.empty) {
            const allResults = snap.docs.map(d => ({ id: d.id, ...d.data() })) as NumberPool[];
        const roleFilteredResults = this.filterNumbersByRole(allResults, this.getCurrentUserRole());
            
            // Cache results for future pagination
            const cacheKey = `${term}_${category}_${pageSize}`;
            this.searchCache.set(cacheKey, { 
              results: roleFilteredResults, 
              totalItems: roleFilteredResults.length, 
              cursors: new Map(),
              lastQuery: term 
            });
            
            // Set up real-time listener for this search
            this.setupSearchListener(term, category, pageSize);
            
            return {
          data: roleFilteredResults.slice(0, pageSize),
          hasNextPage: roleFilteredResults.length > pageSize,
              hasPreviousPage: false,
              currentPage: 1,
              totalItems: roleFilteredResults.length
            };
          }
        } catch (_) {}
      }
      // If documents have codeNormalized, try that as well (exact)
      try {
        const snap = await getDocs(query(base, where('codeNormalized', '==', lower), fbLimit(200)));
        if (!snap.empty) {
          const allResults = snap.docs.map(d => ({ id: d.id, ...d.data() })) as NumberPool[];
        const roleFilteredResults = this.filterNumbersByRole(allResults, this.getCurrentUserRole());
          
          // Cache results for future pagination
          const cacheKey = `${term}_${category}_${pageSize}`;
          this.searchCache.set(cacheKey, { 
            results: roleFilteredResults, 
            totalItems: roleFilteredResults.length, 
            cursors: new Map(),
            lastQuery: term 
          });
          
          // Set up real-time listener for this search
          this.setupSearchListener(term, category, pageSize);
          
          return {
          data: roleFilteredResults.slice(0, pageSize),
          hasNextPage: roleFilteredResults.length > pageSize,
            hasPreviousPage: false,
            currentPage: 1,
            totalItems: roleFilteredResults.length
          };
        }
      } catch (_) {}
    }

    // 1) Cache/index first. If numeric term, constrain to number field; otherwise return all cached matches
    const exactCached = await searchCachedNumbersFast(term, category, 50);
    if (exactCached && exactCached.length > 0) {
      const isNumeric = /^\d+$/.test(term);
      const numberFiltered = isNumeric
        ? exactCached.filter(n => n.number?.toString() === term || n.number?.toString().includes(term))
        : exactCached;
      const filteredResults = this.filterNumbersByRole(numberFiltered, this.getCurrentUserRole());
      
      // Cache results for future pagination
      const cacheKey = `${term}_${category}_${pageSize}`;
      this.searchCache.set(cacheKey, { 
        results: filteredResults, 
        totalItems: filteredResults.length, 
        cursors: new Map(),
        lastQuery: term 
      });
      
      // Only set up real-time listener for exact numeric matches (not cached results)
      // Cached results are already from IndexedDB, so no need for real-time updates
      if (/^\d+$/.test(term)) {
        this.setupSearchListener(term, category, pageSize);
      }
      
      return {
        data: filteredResults.slice(0, pageSize),
        hasNextPage: filteredResults.length > pageSize,
        hasPreviousPage: false,
        currentPage: 1,
        totalItems: filteredResults.length
      };
    }

    // 2) Multi-token search from cache (e.g., "N garms")
    const tokens = term.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) {
      const tokenResults = await searchCachedNumbersByTokens(tokens, category, 100);
      if (tokenResults && tokenResults.length > 0) {
        const filteredResults = this.filterNumbersByRole(tokenResults, this.getCurrentUserRole());
        // Cache results for future pagination
        const cacheKey = `${term}_${category}_${pageSize}`;
        this.searchCache.set(cacheKey, { 
          results: filteredResults, 
          totalItems: filteredResults.length, 
          cursors: new Map(),
          lastQuery: term 
        });
        
        // Don't set up real-time listener for multi-token searches (cached results)
        // These are already from IndexedDB search index
        
        return {
          data: filteredResults.slice(0, pageSize),
          hasNextPage: filteredResults.length > pageSize,
          hasPreviousPage: false,
          currentPage: 1,
          totalItems: filteredResults.length
        };
      }
    }

    // 3) Firestore exact match on number
    {
      let base = query(collection(db, 'numberPool'));
      if (category !== 'all') {
        base = query(base, where('category', '==', category));
      }
      // Try exact equality first
      try {
        const eqSnap = await getDocs(query(base, where('number', '==', term)));
        if (!eqSnap.empty) {
          const allResults = eqSnap.docs.map(d => ({ id: d.id, ...d.data() })) as NumberPool[];
          const roleFilteredResults = this.filterNumbersByRole(allResults, this.getCurrentUserRole());
          
          // Cache results for future pagination
          const cacheKey = `${term}_${category}_${pageSize}`;
          this.searchCache.set(cacheKey, { 
            results: roleFilteredResults, 
            totalItems: roleFilteredResults.length, 
            cursors: new Map(),
            lastQuery: term 
          });
          
          // Set up real-time listener for this search
          this.setupSearchListener(term, category, pageSize);
          
          return {
          data: roleFilteredResults.slice(0, pageSize),
          hasNextPage: roleFilteredResults.length > pageSize,
            hasPreviousPage: false,
            currentPage: 1,
            totalItems: roleFilteredResults.length
          };
        }
      } catch (_) {}

      // Then try prefix search
      try {
        const prefSnap = await getDocs(query(base, orderBy('number'), startAt(term), endAt(term + '\uf8ff'), fbLimit(100)));
        const pref = prefSnap.docs.map(d => ({ id: d.id, ...d.data() })) as NumberPool[];
        if (pref.length > 0) {
          // Cache results for future pagination
          const cacheKey = `${term}_${category}_${pageSize}`;
          this.searchCache.set(cacheKey, { 
            results: pref, 
            totalItems: pref.length, 
            cursors: new Map(),
            lastQuery: term 
          });
          
          // Set up real-time listener for this search
          this.setupSearchListener(term, category, pageSize);
          
          return {
            data: pref.slice(0, pageSize),
            hasNextPage: pref.length > pageSize,
            hasPreviousPage: false,
            currentPage: 1,
            totalItems: pref.length
          };
        }
      } catch (_) {}
    }

    return { data: [], hasNextPage: false, hasPreviousPage: false, currentPage: 1, totalItems: 0 };
  }

  // Perform paginated search for subsequent pages (uses cached results)
  private async performPaginatedSearch(term: string, category: string, page: number, pageSize: number): Promise<{
    data: NumberPool[];
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    currentPage: number;
    totalItems: number;
  }> {
    const cacheKey = `${term}_${category}_${pageSize}`;
    const cached = this.searchCache.get(cacheKey);
    
    if (!cached) {
      // If no cache, fall back to first page search
      return await this.performFirstPageSearch(term, category, pageSize);
    }
    
    const offset = (page - 1) * pageSize;
    const paginatedResults = cached.results.slice(offset, offset + pageSize);
    
    return {
      data: paginatedResults,
      hasNextPage: offset + pageSize < cached.results.length,
      hasPreviousPage: page > 1,
      currentPage: page,
      totalItems: cached.totalItems
    };
  }

  // Set up page-specific real-time listener (optimized for performance)
  private setupPageListener() {
    if (this.pageListener) {
      this.pageListener();
    }

    
    // OPTIMIZATION: Instead of listening to entire collection, use individual document listeners
    // This is more efficient for paginated data as we only listen to current page documents
    if (this.state.numbers.length > 0) {
      this.setupPageDocumentListeners();
    }
    
    // Set up listeners for visible documents only (if enabled)
    if (this.enableVisibleListeners) {
    this.setupVisibleListeners(this.state.numbers);
    } else {
    }
  }

  // Set up individual document listeners for current page (OPTIMIZED - limited listeners)
  private setupPageDocumentListeners() {
    // Clean up existing page listeners
    if (this.pageListener) {
      this.pageListener();
    }

    const currentPageNumbers = this.state.numbers;
    const listeners: (() => void)[] = [];
    
    // OPTIMIZATION: Limit to maximum 10 listeners to control Firebase allows
    const maxListeners = 10;
    const numbersToListen = currentPageNumbers.slice(0, maxListeners);
    
    // Create individual listeners for limited documents on current page
    numbersToListen.forEach(number => {
      const unsub = onSnapshot(doc(db, 'numberPool', number.id), (snap) => {
        if (!snap.exists()) {
          // Document deleted - remove from current numbers
          this.updateState({
            numbers: this.state.numbers.filter(n => n.id !== number.id)
          });
          return;
        }

        const data = snap.data();
        const updated: NumberPool = {
          id: snap.id,
          ...data,
          lastStatusChange: data.lastStatusChange?.toDate?.() || data.lastStatusChange,
          reservedAt: data.reservedAt?.toDate?.() || data.reservedAt,
          expiresAt: data.expiresAt?.toDate?.() || data.expiresAt,
          claimingStartedAt: data.claimingStartedAt?.toDate?.() || data.claimingStartedAt,
          claimingExpiresAt: data.claimingExpiresAt?.toDate?.() || data.claimingExpiresAt
        } as NumberPool;

        // Update the number in current page
        this.updateState({
          numbers: this.state.numbers.map(n => n.id === updated.id ? updated : n)
        });
      }, (error) => this.handleSnapshotError(error, `page-document:${number.id}`));

      listeners.push(unsub);
    });

    // Store cleanup function for all page listeners
    this.pageListener = () => {
      listeners.forEach(unsub => unsub());
    };

  }



  // Set up real-time listeners for visible documents (OPTIMIZED - limited to critical statuses)
  private setupVisibleListeners(numbers: NumberPool[]) {
    // Clean up existing listeners
    this.visibleListeners.forEach(unsub => unsub());
    this.visibleListeners.clear();

    // OPTIMIZATION: Only set up listeners for critical status documents to reduce Firebase allows
    const criticalStatuses = ['reserved', 'pending_verification', 'claimed'];
    const documentsToListen = numbers.filter(number => criticalStatuses.includes(number.status));
    
    // OPTIMIZATION: Limit to maximum 2 critical listeners for mobile performance
    const maxCriticalListeners = 2;
    const limitedDocuments = documentsToListen.slice(0, maxCriticalListeners);
    

    // Set up new listeners for critical status documents only
    limitedDocuments.forEach(number => {
      const unsub = onSnapshot(doc(db, 'numberPool', number.id), (snap) => {
        if (!snap.exists()) {
          // Document deleted - remove from current numbers
          this.updateState({
            numbers: this.state.numbers.filter(n => n.id !== number.id)
          });
          return;
        }

        const data = snap.data();
        const updated: NumberPool = {
          id: snap.id,
          ...data,
          lastStatusChange: data.lastStatusChange?.toDate?.() || data.lastStatusChange,
          reservedAt: data.reservedAt?.toDate?.() || data.reservedAt,
          expiresAt: data.expiresAt?.toDate?.() || data.expiresAt,
          claimingStartedAt: data.claimingStartedAt?.toDate?.() || data.claimingStartedAt,
          claimingExpiresAt: data.claimingExpiresAt?.toDate?.() || data.claimingExpiresAt
        } as NumberPool;

        // Update the number in current page
        this.updateState({
          numbers: this.state.numbers.map(n => n.id === updated.id ? updated : n)
        });
      }, (error) => this.handleSnapshotError(error, `visible-document:${number.id}`));

      this.visibleListeners.set(number.id, unsub);
    });
  }

  // Set up real-time listeners for user-specific numbers
  private setupUserListeners(_userId: string) {
    // Clean up existing user listeners
    this.userListeners.forEach(unsub => unsub());
    this.userListeners = [];

    // Set up new user listeners - these will be implemented when needed
    // For now, we rely on visible listeners
  }

  // Set up listener for a specific document
  // (removed unused setupDocumentListener)

  // Update a specific number in the current state
  updateNumber(updatedNumber: NumberPool) {
    const updatedNumbers = this.state.numbers.map(n => 
      n.id === updatedNumber.id ? updatedNumber : n
    );
    this.updateState({ numbers: updatedNumbers });
  }

  // Get current state
  getState(): NumberPoolState {
    return { ...this.state };
  }

  // Force refresh
  async refresh(category: string | null = null, pageSize: number = 50, userId?: string): Promise<void> {
    this.state.lastLoadTime = 0; // Force reload
    await this.initialize(category, pageSize, userId);
  }

  // Manual refresh for real-time updates (replaces listeners)
  async manualRefresh(): Promise<void> {
    this.state.lastLoadTime = 0; // Force reload
    await this.refresh(this.state.selectedCategory, this.state.pageSize);
    
    // Set up listeners for current page if it's within the first 3 pages
    if (this.state.currentPage <= 3) {
      this.setupVisibleListeners(this.state.numbers);
      this.setupPageListener();
    }
  }

  // Control real-time listeners
  setRealTimeListenersEnabled(enabled: boolean) {
    this.enableVisibleListeners = enabled;
    
    if (enabled) {
      // Re-setup listeners if enabled
      this.setupVisibleListeners(this.state.numbers);
    } else {
      // Clean up listeners if disabled
      this.visibleListeners.forEach(unsub => unsub());
      this.visibleListeners.clear();
    }
  }

  // Get the page where search was started from
  getPreSearchPage(): number {
    return this.preSearchPage;
  }

  // Set up real-time listener for search results (debounced)
  private setupSearchListener(searchTerm: string, category: string, pageSize: number) {
    // Clear existing timeout
    if (this.listenerSetupTimeout) {
      clearTimeout(this.listenerSetupTimeout);
    }
    
    // Update current search term
    this.currentSearchTerm = searchTerm;
    
    // Debounce listener setup to avoid multiple listeners for rapid searches
    this.listenerSetupTimeout = setTimeout(() => {
      this.setupSearchListenerImmediate(searchTerm, category, pageSize);
    }, 1000); // 1 second debounce to reduce rapid listener creation
  }
  
  // DISABLED: Search listeners - unifiedSearch already provides fresh data
  // This prevents "400 Bad Request" errors from too many concurrent Firebase connections
  private setupSearchListenerImmediate(searchTerm: string, category: string, pageSize: number) {
    // Clean up any existing search listeners
    this.clearAllSearchListeners();
    // No new listeners created - search is handled by unifiedSearch with fresh queries
  }

  // Update search cache with new results and notify subscribers
  private updateSearchCache(cacheKey: string, updatedResults: NumberPool[], searchTerm: string) {
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      cached.results = updatedResults;
      cached.totalItems = updatedResults.length;
      cached.lastQuery = searchTerm;
      
      // Notify all subscribers about the update
      this.notifySubscribers();
    }
  }

  // Update state manually (for search results)
  public updateState(updates: Partial<NumberPoolState>) {
    this.state = { ...this.state, ...updates };
    this.notifySubscribers();
  }

  // Clear all search listeners
  private clearAllSearchListeners() {
    this.searchListeners.forEach(unsub => unsub());
    this.searchListeners.clear();
  }

  // Handle search start - remember current page
  onSearchStart(searchTerm: string) {
    if (searchTerm.trim() && !this.currentSearchTerm) {
      // Remember the page we were on before search started
      this.preSearchPage = this.state.currentPage;
    }
    this.currentSearchTerm = searchTerm;
  }

  // Handle search clear - return to original page
  async onSearchClear() {
    if (this.currentSearchTerm) {
      // Clear search cache and listeners
      this.clearSearchCache();
      
      // Clear any search-related state in the manager
      this.updateState({
        numbers: [], // Clear current numbers to force refresh
        isLoading: true
      });
      
      // Return to the page where search started and refresh data
      if (this.preSearchPage !== this.state.currentPage) {
        await this.goToPage(this.preSearchPage);
      } else {
        // Even if we're on the same page, refresh the data to ensure we show the full page
        await this.refresh(this.state.selectedCategory, this.state.pageSize);
      }
    }
  }

  // Clear search cache and listeners
  clearSearchCache() {
    // Clear timeout
    if (this.listenerSetupTimeout) {
      clearTimeout(this.listenerSetupTimeout);
      this.listenerSetupTimeout = null;
    }
    // Clean up all search listeners
    this.clearAllSearchListeners();
    this.searchCache.clear();
    this.currentSearchTerm = '';
  }

  // Clear listeners for specific search term (when search changes)
  clearSearchListenersForTerm(searchTerm: string) {
    if (searchTerm !== this.currentSearchTerm) {
      this.clearAllSearchListeners();
      this.currentSearchTerm = '';
    }
  }

  // Force reset loading state - useful when loading gets stuck
  forceResetLoading(): void {
    console.warn('[NumberPoolManager] Force resetting loading state and attempting recovery');
    this.updateState({ isLoading: false });
    
    // If we're stuck with no numbers but should have them, force re-initialization
    if (this.state.numbers.length === 0 && this.isInitialized && this.currentUserId) {
      console.warn('[NumberPoolManager] Stuck state detected - forcing re-initialization');
      this.isInitialized = false;
      // Try to re-initialize with current parameters
      const category = this.state.selectedCategory;
      const pageSize = this.state.pageSize;
      const userId = this.currentUserId;
      const userRole = this.currentUserRole;
      
      // Delay slightly to avoid immediate re-trigger
      setTimeout(() => {
        if (userId) {
          this.initialize(category, pageSize, userId, userRole).catch(error => {
            console.error('[NumberPoolManager] Recovery initialization failed:', error);
          });
        }
      }, 1000);
    }
  }
  
  // Force complete reset - use when user changes or critical errors occur
  forceReset(): void {
    console.warn('[NumberPoolManager] Force reset - clearing all state');
    try {
      this.destroy();
    } catch (error) {
      console.error('[NumberPoolManager] Error during destroy in forceReset:', error);
      // Continue with reset even if destroy fails
    }
    
    try {
      this.updateState({
        numbers: [],
        currentPage: 1,
        pageSize: 50,
        totalPages: 0,
        totalItems: 0,
        hasNextPage: false,
        hasPreviousPage: false,
        selectedCategory: null,
        lastLoadTime: 0,
        isLoading: false
      });
    } catch (error) {
      console.error('[NumberPoolManager] Error updating state in forceReset:', error);
    }
  }

  // Cleanup
  destroy() {
    try {
      // Mark as destroyed to prevent any retries
      this.isDestroyed = true;
      
      // Clear any pending retry timeout
      if (this.pendingRetryTimeout) {
        clearTimeout(this.pendingRetryTimeout);
        this.pendingRetryTimeout = null;
      }
      
    if (this.pagination) {
        try {
      this.pagination.clearCache();
        } catch (e) {
          console.warn('[NumberPoolManager] Error clearing pagination cache:', e);
        }
      this.pagination = null;
    }
    if (this.pageListener) {
        try {
      this.pageListener();
        } catch (e) {
          console.warn('[NumberPoolManager] Error unsubscribing page listener:', e);
        }
      this.pageListener = null;
    }
      this.visibleListeners.forEach(unsub => {
        try {
          unsub();
        } catch (e) {
          console.warn('[NumberPoolManager] Error unsubscribing visible listener:', e);
        }
      });
    this.visibleListeners.clear();
      this.userListeners.forEach(unsub => {
        try {
          unsub();
        } catch (e) {
          console.warn('[NumberPoolManager] Error unsubscribing user listener:', e);
        }
      });
    this.userListeners = [];
    this.clearAllSearchListeners();
      // Don't clear subscribers - they should remain to receive updates
      // this.subscribers.clear();
    this.searchCache.clear();
    if (this.listenerSetupTimeout) {
      clearTimeout(this.listenerSetupTimeout);
      this.listenerSetupTimeout = null;
    }
    this.currentSearchTerm = '';
    this.isInitialized = false;
      this.currentUserId = undefined;
      this.currentUserRole = undefined;
    } catch (error) {
      console.error('[NumberPoolManager] Error in destroy:', error);
      // Ensure critical state is reset even if cleanup fails
      this.isInitialized = false;
      this.currentUserId = undefined;
      this.currentUserRole = undefined;
      this.isDestroyed = true;
    }
  }
}

export const numberPoolManager = NumberPoolManager.getInstance();
