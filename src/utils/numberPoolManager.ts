// Global NumberPool manager to persist pagination state and minimize reads
import { SmartPagination } from './smartPagination';
import { NumberPool } from '../types';
import { getCachedPaginatedNumbers, cachePaginatedNumbers, searchCachedNumbersFast, searchCachedNumbersByTokens, buildSearchIndex } from './indexedDB';
import { onSnapshot, doc, collection, query, where, getDocs, orderBy, startAt, endAt, limit as fbLimit } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface NumberPoolState {
  numbers: NumberPool[];
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  selectedCategory: string | null;
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
  private needsReload(category: string | null, pageSize: number): boolean {
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();
    
    return (
      !this.isInitialized ||
      this.state.selectedCategory !== category ||
      this.state.pageSize !== pageSize ||
      (now - this.state.lastLoadTime) > CACHE_DURATION ||
      this.state.numbers.length === 0
    );
  }

  // Store current user role for filtering
  private currentUserRole: string | undefined;

  // Set current user role
  setUserRole(role: string | undefined) {
    this.currentUserRole = role;
  }

  // Get current user role
  private getCurrentUserRole(): string | undefined {
    return this.currentUserRole;
  }

  // Filter numbers based on user role and visibility settings
  private filterNumbersByRole(numbers: NumberPool[], userRole?: string): NumberPool[] {
    if (!userRole || userRole !== 'freelancer') {
      return numbers; // All other roles can see all numbers
    }
    
    // Freelancers can see numbers unless explicitly hidden (visibleToFreelancers === false)
    return numbers.filter(number => number.visibleToFreelancers !== false);
  }

  // Initialize or get existing data
  async initialize(category: string | null = null, pageSize: number = 50, userId?: string, userRole?: string): Promise<void> {
    console.log('📋 NumberPoolManager.initialize called');
    
    if (!this.needsReload(category, pageSize)) {
      console.log('✅ Using existing data, no reload needed');
      return;
    }

    this.updateState({ isLoading: true });

    try {
      // Update pagination instance if needed
      if (!this.pagination || this.state.selectedCategory !== category || this.state.pageSize !== pageSize) {
        if (this.pagination) {
          this.pagination.clearCache();
        }

        const filters: Array<{ field: string; operator: any; value: any }> = [];
        if (category && category !== 'all') {
          filters.push({ field: 'category', operator: '==' as const, value: category });
        }
        // Do NOT add a strict filter here; rules now allow missing field. We'll filter client-side.

        this.pagination = new SmartPagination<NumberPool>('numberPool', {
          pageSize,
          orderBy: 'lastStatusChange',
          orderDirection: 'desc',
          filters
        });
      }

      // Try cache first
      const cachedNumbers = await getCachedPaginatedNumbers(category || 'all', 1, pageSize);
      if (cachedNumbers && cachedNumbers.length > 0) {
        console.log('✅ Found cached numbers:', cachedNumbers.length);
        const filteredNumbers = this.filterNumbersByRole(cachedNumbers, userRole);
        this.updateState({
          numbers: filteredNumbers,
          currentPage: 1,
          pageSize,
          selectedCategory: category,
          lastLoadTime: Date.now(),
          isLoading: false
        });

        // Ensure listeners are set up for the visible cached data
        this.setupPageListener();

        // Rebuild search index proactively so token search works on cached data
        await buildSearchIndex(category || 'all');

        // Mark as initialized and exit early to avoid re-reading
        this.isInitialized = true;
        console.log('⏩ Using cached paginated numbers. Skipping Firebase read.');
        return;
      }

      // Load from Firebase
      let result: { data: NumberPool[]; hasNextPage: boolean; hasPreviousPage: boolean } | null = null;
      try {
        result = await this.pagination.loadPage(1);
      console.log('📊 Loaded from Firebase:', result.data.length, 'numbers');
      } catch (e: any) {
        // Gracefully handle empty datasets (e.g., freelancer with no visible numbers)
        if (typeof e?.message === 'string' && e.message.includes('Page does not exist')) {
          console.warn('ℹ️ No pages exist for current filters. Initializing empty state.');
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

      this.updateState({
        numbers: result.data,
        currentPage: 1,
        pageSize,
        totalPages: this.pagination.getTotalPages(),
        totalItems: this.pagination.getTotalItems(),
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage,
        selectedCategory: category,
        lastLoadTime: Date.now(),
        isLoading: false
      });

      // Cache the results
      if (result.data.length > 0) {
        await cachePaginatedNumbers(result.data as NumberPool[], category || 'all', 1, pageSize);
        // Rebuild search index for this category so token searches work
        await buildSearchIndex(category || 'all');
      }

      // Set up page-specific real-time listener
      this.setupPageListener();
      
      // Set up user-scoped listeners
      if (userId) {
        this.setupUserListeners(userId);
      }

      this.isInitialized = true;
      console.log('✅ NumberPoolManager initialized successfully');

    } catch (error) {
      console.error('❌ NumberPoolManager initialization failed:', error);
      this.updateState({ isLoading: false });
    }
  }

  // Navigate to next page
  async nextPage(): Promise<void> {
    if (!this.pagination || !this.state.hasNextPage || this.state.isLoading) return;

    this.updateState({ isLoading: true });

    try {
      // Try cache first for the target page
      const targetPage = this.pagination.getCurrentPage() + 1;
      const cached = await getCachedPaginatedNumbers(this.state.selectedCategory || 'all', targetPage, this.state.pageSize);
      if (cached && cached.length > 0) {
        const filteredNumbers = this.filterNumbersByRole(cached, this.getCurrentUserRole());
        this.updateState({
          numbers: filteredNumbers,
          currentPage: targetPage,
          hasNextPage: true, // conservative; real value updated when Firebase read happens later
          hasPreviousPage: true,
          lastLoadTime: Date.now(),
          isLoading: false
        });
        // OPTIMIZATION: Only set up listeners for first few pages to reduce Firebase allows
        if (targetPage <= 3) {
          this.setupVisibleListeners(cached);
        }
        console.log('⏩ Using cached next page. Skipping Firebase read.');
        return;
      }

      const result = await this.pagination.nextPage();
      const filteredNumbers = this.filterNumbersByRole(result.data, this.getCurrentUserRole());
      
      this.updateState({
        numbers: filteredNumbers,
        currentPage: this.pagination.getCurrentPage(),
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage,
        lastLoadTime: Date.now(),
        isLoading: false
      });

      // OPTIMIZATION: Only set up listeners for first few pages to reduce Firebase allows
      if (this.pagination.getCurrentPage() <= 3) {
      this.setupVisibleListeners(result.data);
      }

      // Persist page to IndexedDB for future visits
      if (result.data.length > 0) {
        await cachePaginatedNumbers(result.data as NumberPool[], this.state.selectedCategory || 'all', this.state.currentPage, this.state.pageSize);
        await buildSearchIndex(this.state.selectedCategory || 'all');
      }

    } catch (error) {
      console.error('Error loading next page:', error);
      this.updateState({ isLoading: false });
    }
  }

  // Navigate to previous page
  async previousPage(): Promise<void> {
    if (!this.pagination || !this.state.hasPreviousPage || this.state.isLoading) return;

    this.updateState({ isLoading: true });

    try {
      // Try cache first for the target page
      const targetPage = Math.max(1, this.pagination.getCurrentPage() - 1);
      const cached = await getCachedPaginatedNumbers(this.state.selectedCategory || 'all', targetPage, this.state.pageSize);
      if (cached && cached.length > 0) {
        const filteredNumbers = this.filterNumbersByRole(cached, this.getCurrentUserRole());
        this.updateState({
          numbers: filteredNumbers,
          currentPage: targetPage,
          hasNextPage: true,
          hasPreviousPage: targetPage > 1,
          lastLoadTime: Date.now(),
          isLoading: false
        });
        // OPTIMIZATION: Only set up listeners for first few pages to reduce Firebase allows
        if (targetPage <= 3) {
          this.setupVisibleListeners(cached);
        }
        console.log('⏩ Using cached previous page. Skipping Firebase read.');
        return;
      }

      const result = await this.pagination.previousPage();
      const filteredNumbers = this.filterNumbersByRole(result.data, this.getCurrentUserRole());
      
      this.updateState({
        numbers: filteredNumbers,
        currentPage: this.pagination.getCurrentPage(),
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage,
        lastLoadTime: Date.now(),
        isLoading: false
      });

      // OPTIMIZATION: Only set up listeners for first few pages to reduce Firebase allows
      if (this.pagination.getCurrentPage() <= 3) {
      this.setupVisibleListeners(result.data);
      }

      // Persist page to IndexedDB for future visits
      if (result.data.length > 0) {
        await cachePaginatedNumbers(result.data as NumberPool[], this.state.selectedCategory || 'all', this.state.currentPage, this.state.pageSize);
        await buildSearchIndex(this.state.selectedCategory || 'all');
      }

    } catch (error) {
      console.error('Error loading previous page:', error);
      this.updateState({ isLoading: false });
    }
  }

  // Go to specific page
  async goToPage(page: number): Promise<void> {
    if (!this.pagination || page < 1 || this.state.isLoading) return;

    this.updateState({ isLoading: true });

    try {
      // Try cache first for requested page
      const cached = await getCachedPaginatedNumbers(this.state.selectedCategory || 'all', page, this.state.pageSize);
      if (cached && cached.length > 0) {
        const filteredNumbers = this.filterNumbersByRole(cached, this.getCurrentUserRole());
        this.updateState({
          numbers: filteredNumbers,
          currentPage: page,
          // totalPages/totalItems remain as is; they will be corrected when a fresh load happens
          hasNextPage: true,
          hasPreviousPage: page > 1,
          lastLoadTime: Date.now(),
          isLoading: false
        });
        // OPTIMIZATION: Only set up listeners for first few pages to reduce Firebase allows
        if (page <= 3) {
          this.setupVisibleListeners(cached);
          this.setupPageListener(); // Set up listeners for new page
        }
        console.log('⏩ Using cached page', page, '. Skipping Firebase read.');
        return;
      }

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
        console.log(`📡 Skipping listeners for page ${page} to reduce Firebase allows`);
      }

      // Persist page to IndexedDB for future visits
      if (result.data.length > 0) {
        await cachePaginatedNumbers(result.data as NumberPool[], this.state.selectedCategory || 'all', this.state.currentPage, this.state.pageSize);
        await buildSearchIndex(this.state.selectedCategory || 'all');
      }

    } catch (error) {
      console.error('Error loading page:', error);
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
      console.log('🔍 Empty search term - returning empty results');
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
      console.error('Search error:', error);
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
    const statuses = ['open', 'reserved', 'pending_verification', 'verified', 'assigned', 'activated', 'follow_up', 'rejected', 'claimed', 'follow_verification'];

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

    console.log('📡 Setting up performance-optimized real-time listener...');
    
    // OPTIMIZATION: Instead of listening to entire collection, use individual document listeners
    // This is more efficient for paginated data as we only listen to current page documents
    if (this.state.numbers.length > 0) {
      console.log(`📡 Setting up listeners for current page (${this.state.numbers.length} documents)`);
      this.setupPageDocumentListeners();
    }
    
    // Set up listeners for visible documents only (if enabled)
    if (this.enableVisibleListeners) {
    this.setupVisibleListeners(this.state.numbers);
    } else {
      console.log('🔇 Visible document listeners disabled');
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
      });

      listeners.push(unsub);
    });

    // Store cleanup function for all page listeners
    this.pageListener = () => {
      listeners.forEach(unsub => unsub());
    };

    console.log(`📡 Set up ${listeners.length} individual document listeners for current page (max ${maxListeners})`);
  }



  // Set up real-time listeners for visible documents (OPTIMIZED - limited to critical statuses)
  private setupVisibleListeners(numbers: NumberPool[]) {
    // Clean up existing listeners
    this.visibleListeners.forEach(unsub => unsub());
    this.visibleListeners.clear();

    // OPTIMIZATION: Only set up listeners for critical status documents to reduce Firebase allows
    const criticalStatuses = ['reserved', 'pending_verification', 'claimed'];
    const documentsToListen = numbers.filter(number => criticalStatuses.includes(number.status));
    
    // OPTIMIZATION: Limit to maximum 5 critical listeners
    const maxCriticalListeners = 5;
    const limitedDocuments = documentsToListen.slice(0, maxCriticalListeners);
    
    console.log(`📡 Setting up ${limitedDocuments.length} critical status listeners (max ${maxCriticalListeners})`);

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
      });

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
    console.log('🔄 Manual refresh triggered - updating data without listeners');
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
    console.log(`📡 Real-time listeners ${enabled ? 'enabled' : 'disabled'}`);
    
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
  
  // Immediate listener setup (internal) - OPTIMIZED with limited listeners
  private setupSearchListenerImmediate(searchTerm: string, category: string, pageSize: number) {
    const cacheKey = `${searchTerm}_${category}_${pageSize}`;
    
    // Only set up listener if this is still the current search term
    if (searchTerm !== this.currentSearchTerm) {
      return;
    }
    
    // Clean up ALL existing search listeners to avoid multiple listeners
    this.clearAllSearchListeners();

    // Set up new listener based on search type (OPTIMIZED - only for exact matches)
    const term = searchTerm.trim();
    const lower = term.toLowerCase();
    
    // Only set up listeners for exact matches to reduce Firebase allows
    // Category search listener (exact match only)
    const categories = ['standard', 'silver', 'silver plus', 'gold', 'gold plus', 'platinum'];
    if (categories.includes(lower)) {
      const categoryValue = categories.find(c => c === lower)!.replace(/\b\w/g, (m) => m.toUpperCase());
      const listener = onSnapshot(
        query(collection(db, 'numberPool'), where('category', '==', categoryValue)),
        (snapshot) => {
          const updatedResults = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as NumberPool[];
          this.updateSearchCache(cacheKey, updatedResults, searchTerm);
        },
        (error) => console.error('Search listener error:', error)
      );
      this.searchListeners.set(cacheKey, listener);
      console.log(`📡 Set up category listener for: ${categoryValue}`);
      return;
    }

    // Status search listener (exact match only)
    const statuses = ['open', 'reserved', 'pending_verification', 'verified', 'assigned', 'activated', 'follow_up', 'rejected', 'claimed', 'follow_verification'];
    if (statuses.includes(lower)) {
      const listener = onSnapshot(
        query(collection(db, 'numberPool'), where('status', '==', lower)),
        (snapshot) => {
          const updatedResults = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as NumberPool[];
          this.updateSearchCache(cacheKey, updatedResults, searchTerm);
        },
        (error) => console.error('Search listener error:', error)
      );
      this.searchListeners.set(cacheKey, listener);
      console.log(`📡 Set up status listener for: ${lower}`);
      return;
    }

    // Number search listener (exact match only)
    if (/^\d+$/.test(term)) {
      const listener = onSnapshot(
        query(collection(db, 'numberPool'), where('number', '==', term)),
        (snapshot) => {
          const updatedResults = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as NumberPool[];
          this.updateSearchCache(cacheKey, updatedResults, searchTerm);
        },
        (error) => console.error('Search listener error:', error)
      );
      this.searchListeners.set(cacheKey, listener);
      console.log(`📡 Set up number listener for: ${term}`);
      return;
    }

    // Code search listener (exact match only)
    if (/^[a-z0-9]+$/i.test(term)) {
      const variants = [term, term.toUpperCase(), term.toLowerCase()];
      
      for (const variant of variants) {
        const listener = onSnapshot(
          query(collection(db, 'numberPool'), where('code', '==', variant)),
          (snapshot) => {
            if (!snapshot.empty) {
              const updatedResults = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as NumberPool[];
              this.updateSearchCache(cacheKey, updatedResults, searchTerm);
            }
          },
          (error) => console.error('Search listener error:', error)
        );
        this.searchListeners.set(cacheKey, listener);
        console.log(`📡 Set up code listener for: ${variant}`);
        break; // Use first successful listener
      }
    }
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
      console.log(`🔍 Search started from page ${this.preSearchPage}`);
    }
    this.currentSearchTerm = searchTerm;
  }

  // Handle search clear - return to original page
  async onSearchClear() {
    if (this.currentSearchTerm) {
      console.log(`🔍 Search cleared, returning to page ${this.preSearchPage}`);
      console.log(`🔍 Current state before clear:`, {
        currentPage: this.state.currentPage,
        numbersCount: this.state.numbers.length,
        preSearchPage: this.preSearchPage
      });
      
      // Clear search cache and listeners
      this.clearSearchCache();
      
      // Clear any search-related state in the manager
      this.updateState({
        numbers: [], // Clear current numbers to force refresh
        isLoading: true
      });
      
      // Return to the page where search started and refresh data
      if (this.preSearchPage !== this.state.currentPage) {
        console.log(`🔍 Navigating to page ${this.preSearchPage}`);
        await this.goToPage(this.preSearchPage);
      } else {
        console.log(`🔍 Refreshing current page ${this.state.currentPage}`);
        // Even if we're on the same page, refresh the data to ensure we show the full page
        await this.refresh(this.state.selectedCategory, this.state.pageSize);
      }
      
      console.log(`🔍 State after clear:`, {
        currentPage: this.state.currentPage,
        numbersCount: this.state.numbers.length
      });
    }
  }

  // Clear search cache and listeners
  clearSearchCache() {
    console.log('🔍 Clearing search cache and listeners');
    // Clear timeout
    if (this.listenerSetupTimeout) {
      clearTimeout(this.listenerSetupTimeout);
      this.listenerSetupTimeout = null;
    }
    // Clean up all search listeners
    this.clearAllSearchListeners();
    this.searchCache.clear();
    this.currentSearchTerm = '';
    console.log('🔍 Search cache cleared');
  }

  // Clear listeners for specific search term (when search changes)
  clearSearchListenersForTerm(searchTerm: string) {
    if (searchTerm !== this.currentSearchTerm) {
      this.clearAllSearchListeners();
      this.currentSearchTerm = '';
    }
  }

  // Cleanup
  destroy() {
    if (this.pagination) {
      this.pagination.clearCache();
      this.pagination = null;
    }
    if (this.pageListener) {
      this.pageListener();
      this.pageListener = null;
    }
    this.visibleListeners.forEach(unsub => unsub());
    this.visibleListeners.clear();
    this.userListeners.forEach(unsub => unsub());
    this.userListeners = [];
    this.clearAllSearchListeners();
    this.subscribers.clear();
    this.searchCache.clear();
    if (this.listenerSetupTimeout) {
      clearTimeout(this.listenerSetupTimeout);
      this.listenerSetupTimeout = null;
    }
    this.currentSearchTerm = '';
    this.isInitialized = false;
  }
}

export const numberPoolManager = NumberPoolManager.getInstance();
