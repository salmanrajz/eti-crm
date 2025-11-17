// ✅ ENHANCED: Advanced pagination utilities for Firebase with optimal performance
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  startAfter, 
  endBefore, 
  limitToLast,
  DocumentSnapshot,
  QueryDocumentSnapshot,
  getDocs,
  startAt,
  endAt,
  onSnapshot,
  Unsubscribe,
  where,
  WhereFilterOp,
  getCountFromServer
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { NumberPool } from '../types';

export interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  lastDoc: QueryDocumentSnapshot | null;
  firstDoc: QueryDocumentSnapshot | null;
}

export interface PaginationOptions {
  pageSize?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  filters?: Array<{
    field: string;
    operator: WhereFilterOp;
    value: any;
  }>;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationState;
  unsubscribe?: Unsubscribe;
}

export class FirebasePagination<T> {
  private collectionName: string;
  private options: Required<PaginationOptions>;
  private currentState: PaginationState;
  private unsubscribe?: Unsubscribe;

  constructor(collectionName: string, options: PaginationOptions = {}) {
    this.collectionName = collectionName;
    this.options = {
      pageSize: options.pageSize || 50,
      orderBy: options.orderBy || 'lastStatusChange',
      orderDirection: options.orderDirection || 'asc',
      filters: options.filters || []
    };
    
    this.currentState = {
      currentPage: 1,
      pageSize: this.options.pageSize,
      totalPages: 0,
      totalItems: 0,
      hasNextPage: false,
      hasPreviousPage: false,
      lastDoc: null,
      firstDoc: null
    };
  }

  // Build the base query with filters and ordering
  private buildBaseQuery() {
    console.log('🔧 Building base query for collection:', this.collectionName);
    console.log('🔧 Options:', this.options);
    
    let q = query(collection(db, this.collectionName));
    
    // Apply filters
    this.options.filters.forEach(filter => {
      console.log('🔧 Adding filter:', filter);
      q = query(q, where(filter.field, filter.operator, filter.value));
    });
    
    // Apply ordering
    console.log('🔧 Adding orderBy:', this.options.orderBy, this.options.orderDirection);
    q = query(q, orderBy(this.options.orderBy, this.options.orderDirection));
    
    return q;
  }

  // Get total count efficiently (cached)
  async getTotalCount(): Promise<number> {
    const q = this.buildBaseQuery();
    const countSnap = await getCountFromServer(q);
    return Number(countSnap.data().count || 0);
  }

  // Load first page
  async loadFirstPage(): Promise<PaginatedResult<T>> {
    console.log('🔥 Building query for first page...');
    const base = this.buildBaseQuery();
    const q = query(base, limit(this.options.pageSize));

    console.log('📊 Executing Firebase query...');
    const [snapshot, countSnap] = await Promise.all([
      getDocs(q),
      getCountFromServer(base)
    ]);
    const totalItems = Number(countSnap.data().count || 0);
    console.log('📈 Query result:', snapshot.docs.length, 'documents');
    console.log('📈 Total items (count):', totalItems);

    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as T[];

    const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
    const firstDoc = snapshot.docs[0] || null;

    this.currentState = {
      currentPage: 1,
      pageSize: this.options.pageSize,
      totalPages: Math.ceil(totalItems / this.options.pageSize),
      totalItems,
      hasNextPage: totalItems > this.options.pageSize,
      hasPreviousPage: false,
      lastDoc,
      firstDoc
    };

    console.log('📊 Pagination state:', this.currentState);

    return {
      data,
      pagination: { ...this.currentState }
    };
  }

  // Load next page
  async loadNextPage(): Promise<PaginatedResult<T>> {
    if (!this.currentState.hasNextPage || !this.currentState.lastDoc) {
      throw new Error('No next page available');
    }

    const q = query(
      this.buildBaseQuery(),
      startAfter(this.currentState.lastDoc),
      limit(this.options.pageSize)
    );

    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as T[];

    const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;

    this.currentState = {
      ...this.currentState,
      currentPage: this.currentState.currentPage + 1,
      hasNextPage: snapshot.docs.length === this.options.pageSize,
      hasPreviousPage: true,
      lastDoc
    };

    return {
      data,
      pagination: { ...this.currentState }
    };
  }

  // Load last page efficiently
  async loadLastPage(): Promise<PaginatedResult<T>> {
    const base = this.buildBaseQuery();
    const [snapshot, countSnap] = await Promise.all([
      getDocs(query(base, limitToLast(this.options.pageSize))),
      getCountFromServer(base)
    ]);

    const totalItems = Number(countSnap.data().count || 0);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as T[];
    const firstDoc = snapshot.docs[0] || null;
    const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;

    const totalPages = Math.max(1, Math.ceil(totalItems / this.options.pageSize));

    this.currentState = {
      currentPage: totalPages,
      pageSize: this.options.pageSize,
      totalPages,
      totalItems,
      hasNextPage: false,
      hasPreviousPage: totalPages > 1,
      firstDoc,
      lastDoc
    };

    return { data, pagination: { ...this.currentState } };
  }

  // Load previous page
  async loadPreviousPage(): Promise<PaginatedResult<T>> {
    if (!this.currentState.hasPreviousPage || !this.currentState.firstDoc) {
      throw new Error('No previous page available');
    }

    const q = query(
      this.buildBaseQuery(),
      endBefore(this.currentState.firstDoc),
      limitToLast(this.options.pageSize)
    );

    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as T[];

    const firstDoc = snapshot.docs[0] || null;
    const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;

    this.currentState = {
      ...this.currentState,
      currentPage: this.currentState.currentPage - 1,
      hasNextPage: true,
      hasPreviousPage: this.currentState.currentPage > 2,
      firstDoc,
      lastDoc
    };

    return {
      data,
      pagination: { ...this.currentState }
    };
  }

  // Load specific page with smart navigation strategy
  async loadPage(pageNumber: number): Promise<PaginatedResult<T>> {
    if (pageNumber < 1) {
      throw new Error('Page number must be greater than 0');
    }

    if (pageNumber === 1) {
      return this.loadFirstPage();
    }

    // Get total count for proper last page detection
    const base = this.buildBaseQuery();
    const countSnap = await getCountFromServer(base);
    const totalItems = Number(countSnap.data().count || 0);
    const totalPages = Math.ceil(totalItems / this.options.pageSize);

    if (pageNumber === totalPages) {
      return this.loadLastPage();
    }

    // For middle pages, check if we can navigate efficiently from current position
    const currentPage = this.currentState.currentPage;
    const pageDiff = Math.abs(pageNumber - currentPage);
    
    // If we're close to current page and have cursors, use cursor navigation
    if (pageDiff <= 3 && this.currentState.firstDoc && this.currentState.lastDoc) {
      if (pageNumber > currentPage) {
        // Navigate forward step by step
        let result = { data: [], pagination: this.currentState } as PaginatedResult<T>;
        for (let i = 0; i < pageDiff; i++) {
          result = await this.loadNextPage();
        }
        return result;
      } else {
        // Navigate backward step by step
        let result = { data: [], pagination: this.currentState } as PaginatedResult<T>;
        for (let i = 0; i < pageDiff; i++) {
          result = await this.loadPreviousPage();
        }
        return result;
      }
    }

    // For distant pages, use skip-based approach with safety limits
    const skipCount = (pageNumber - 1) * this.options.pageSize;
    
    // Firestore limit safety check
    if (skipCount + this.options.pageSize > 10000) {
      // For very high pages, load from the end and work backward
      const pagesFromEnd = totalPages - pageNumber;
      if (pagesFromEnd <= 5) {
        // Load last page then navigate backward
        await this.loadLastPage();
        for (let i = 0; i < pagesFromEnd; i++) {
          await this.loadPreviousPage();
        }
        return { data: [], pagination: this.currentState } as PaginatedResult<T>;
      } else {
        throw new Error('Page too far to load directly. Use navigation buttons.');
      }
    }

    // Standard skip-based loading for reasonable page numbers
    const q = query(base, limit(skipCount + this.options.pageSize));
    const snapshot = await getDocs(q);
    const allDocs = snapshot.docs;

    if (allDocs.length <= skipCount && totalItems > 0) {
      throw new Error('Page does not exist');
    }

    const pageDocs = allDocs.slice(skipCount, skipCount + this.options.pageSize);
    const data = pageDocs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as T[];

    const firstDoc = pageDocs[0] || null;
    const lastDoc = pageDocs[pageDocs.length - 1] || null;

    this.currentState = {
      currentPage: pageNumber,
      pageSize: this.options.pageSize,
      totalPages,
      totalItems,
      hasNextPage: pageNumber < totalPages,
      hasPreviousPage: pageNumber > 1,
      firstDoc,
      lastDoc
    };

    return {
      data,
      pagination: { ...this.currentState }
    };
  }

  // Set up real-time listener for current page
  setupRealtimeListener(
    onUpdate: (result: PaginatedResult<T>) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    const q = query(
      this.buildBaseQuery(),
      limit(this.options.pageSize)
    );

    this.unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as T[];

      const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
      const firstDoc = snapshot.docs[0] || null;

      this.currentState = {
        ...this.currentState,
        totalItems: snapshot.size,
        totalPages: Math.ceil(snapshot.size / this.options.pageSize),
        hasNextPage: snapshot.docs.length === this.options.pageSize,
        lastDoc,
        firstDoc
      };

      onUpdate({
        data,
        pagination: { ...this.currentState }
      });
    }, (error) => {
      console.error('Pagination listener error:', error);
      onError?.(error);
    });

    return this.unsubscribe;
  }

  // Search across all data (separate from pagination)
  async searchAll(
    searchTerm: string,
    searchFields: string[],
    limitResults: number = 100
  ): Promise<T[]> {
    // Use prefix search for 'number' field when possible; fallback to in-memory filter
    const lower = searchTerm.toLowerCase();
    const isNumericish = /^[0-9+\-\s]*$/.test(searchTerm);

    // Build a base with filters only (ignore current orderBy so we can order by 'number')
    let base = query(collection(db, this.collectionName));
    this.options.filters.forEach(filter => {
      base = query(base, where(filter.field, filter.operator, filter.value));
    });

    if (searchFields.includes('number') && isNumericish) {
      try {
        const start = lower;
        const end = lower + '\uf8ff';
        const qPrefix = query(base, orderBy('number'), startAt(start), endAt(end), limit(limitResults));
        const shot = await getDocs(qPrefix);
        const pref = shot.docs.map(d => ({ id: d.id, ...d.data() })) as T[];
        if (pref.length > 0) return pref.slice(0, limitResults);
      } catch (_) {
        // ignore and fallback
      }
    }

    // Fallback: bounded fetch + in-memory filter (normalize numbers too)
    const q = query(this.buildBaseQuery(), limit(Math.max(limitResults, 200)));
    const snapshot = await getDocs(q);
    const allData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

    const normalize = (s: any) => (typeof s === 'string' ? s.replace(/[^0-9a-zA-Z]/g, '').toLowerCase() : '');
    const normSearch = normalize(searchTerm);

    const filtered = allData.filter(item => {
      return searchFields.some(field => {
        const val = (item as any)[field];
        if (typeof val === 'string') {
          const v = val.toLowerCase();
          if (v.includes(lower)) return true;
          if (field === 'number') {
            return normalize(val).includes(normSearch);
          }
        }
        return false;
      });
    });

    return filtered.slice(0, limitResults) as T[];
  }

  // Update filters and reset pagination
  updateFilters(filters: Array<{ field: string; operator: WhereFilterOp; value: any }>) {
    this.options.filters = filters;
    this.currentState = {
      currentPage: 1,
      pageSize: this.options.pageSize,
      totalPages: 0,
      totalItems: 0,
      hasNextPage: false,
      hasPreviousPage: false,
      lastDoc: null,
      firstDoc: null
    };
  }

  // Cleanup
  destroy() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
  }

  // Get current state
  getCurrentState(): PaginationState {
    return { ...this.currentState };
  }
}

// Specialized NumberPool pagination
export class NumberPoolPagination extends FirebasePagination<NumberPool> {
  constructor(options: PaginationOptions = {}) {
    super('numberPool', {
      orderBy: 'lastStatusChange',
      orderDirection: 'asc',
      pageSize: options.pageSize || 50,
      ...options
    });
  }

  // Ultra-fast search path: exact + prefix on indexed fields in parallel
  async searchNumbersFast(
    searchTerm: string,
    category?: string,
    limitResults: number = 50
  ): Promise<NumberPool[]> {
    const term = searchTerm.trim();
    if (!term) return [];

    // Build base with optional category filter
    let base = query(collection(db, 'numberPool'));
    if (category && category !== 'all') {
      base = query(base, where('category', '==', category));
    }

    const queries: Promise<ReturnType<typeof getDocs>>[] = [];

    // Exact equals on 'number' and 'code' (case-sensitive)
    queries.push(getDocs(query(base, where('number', '==', term), limit(limitResults))));
    queries.push(getDocs(query(base, where('code', '==', term), limit(limitResults))));

    // Prefix by 'number' (only if term looks numeric-ish)
    const numericish = /^[0-9+\-\s]+$/.test(term);
    if (numericish) {
      queries.push(getDocs(query(base, orderBy('number'), startAt(term), endAt(term + '\uf8ff'), limit(limitResults))));
    }

    // Prefix by 'code' (alpha-ish)
    const alphish = /[a-zA-Z]/.test(term);
    if (alphish) {
      queries.push(getDocs(query(base, orderBy('code'), startAt(term), endAt(term + '\uf8ff'), limit(limitResults))));
    }

    // Substring contains via tokens (normalized) for length >= 3
    const normalized = term.replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
    if (normalized.length >= 3) {
      // For phone numbers, also try searching with last 7 digits pattern
      queries.push(getDocs(query(base, where('numberTokens', 'array-contains', normalized), limit(limitResults))));
      
      // For codes, search the full normalized term
      if (/[a-zA-Z]/.test(term)) {
        queries.push(getDocs(query(base, where('codeTokens', 'array-contains', normalized), limit(limitResults))));
      }
    }

    const shots = await Promise.allSettled(queries);
    const map = new Map<string, NumberPool>();

    const pushDocs = (docs: any[]) => {
      for (const d of docs) {
        if (!map.has(d.id)) map.set(d.id, { id: d.id, ...d.data() } as NumberPool);
        if (map.size >= limitResults) break;
      }
    };

    // Priority: exact matches first
    if (shots[0].status === 'fulfilled') pushDocs(shots[0].value.docs);
    if (shots[1].status === 'fulfilled') pushDocs(shots[1].value.docs);
    // Then prefix results
    for (let i = 2; i < shots.length; i++) {
      const s = shots[i];
      if (s.status === 'fulfilled') pushDocs(s.value.docs);
      if (map.size >= limitResults) break;
    }

    return Array.from(map.values());
  }

  // Search numbers with optimized query
  async searchNumbers(
    searchTerm: string,
    category?: string,
    status?: string,
    limitResults: number = 100
  ): Promise<NumberPool[]> {
    const filters: Array<{ field: string; operator: WhereFilterOp; value: any }> = [];
    if (category && category !== 'all') {
      filters.push({ field: 'category', operator: '==', value: category });
    }
    if (status) {
      filters.push({ field: 'status', operator: '==', value: status });
    }
    this.updateFilters(filters);

    // Try exact equality on number first
    try {
      let baseEq = query(collection(db, 'numberPool'));
      filters.forEach(f => { baseEq = query(baseEq, where(f.field, f.operator, f.value)); });
      const eqSnap = await getDocs(query(baseEq, where('number', '==', searchTerm), limit(1)));
      if (!eqSnap.empty) {
        return eqSnap.docs.map(d => ({ id: d.id, ...d.data() })) as NumberPool[];
      }
    } catch (_) {}

    // Try a targeted number prefix search next
    if (/^[0-9+\-\s]*$/.test(searchTerm)) {
      try {
        const lower = searchTerm.toLowerCase();
        let base = query(collection(db, 'numberPool'));
        filters.forEach(f => { base = query(base, where(f.field, f.operator, f.value)); });
        const shot = await getDocs(query(base, orderBy('number'), startAt(lower), endAt(lower + '\uf8ff'), limit(limitResults)));
        const pref = shot.docs.map(d => ({ id: d.id, ...d.data() })) as NumberPool[];
        if (pref.length > 0) return pref;
      } catch (_) {}
    }

    // Fallback to general search
    return this.searchAll(searchTerm, ['number', 'category', 'status'], limitResults) as Promise<NumberPool[]>;
  }

  // Get numbers by category with pagination
  async getNumbersByCategory(
    category: string,
    pageSize: number = 50
  ): Promise<PaginatedResult<NumberPool>> {
    this.updateFilters([
      { field: 'category', operator: '==', value: category }
    ]);
    this.options.pageSize = pageSize;
    
    return this.loadFirstPage();
  }

  // Get numbers by status with pagination
  async getNumbersByStatus(
    status: string,
    pageSize: number = 50
  ): Promise<PaginatedResult<NumberPool>> {
    this.updateFilters([
      { field: 'status', operator: '==', value: status }
    ]);
    this.options.pageSize = pageSize;
    
    return this.loadFirstPage();
  }
}

// Utility functions for common pagination operations
export const paginationUtils = {
  // Calculate optimal page size based on screen size
  calculateOptimalPageSize(): number {
    const screenHeight = window.innerHeight;
    const itemHeight = 80; // Approximate height of each number item
    const headerHeight = 200; // Approximate height of headers and controls
    
    const availableHeight = screenHeight - headerHeight;
    const optimalSize = Math.floor(availableHeight / itemHeight);
    
    // Ensure minimum and maximum bounds
    return Math.max(10, Math.min(100, optimalSize));
  },

  // Prefetch next page for better UX
  async prefetchNextPage(pagination: FirebasePagination<any>): Promise<void> {
    try {
      const currentState = pagination.getCurrentState();
      if (currentState.hasNextPage) {
        // Prefetch but don't update state
        const nextPageResult = await pagination.loadNextPage();
        // Store in cache for instant loading
        // This would integrate with your existing cache system
      }
    } catch (error) {
      console.warn('Failed to prefetch next page:', error);
    }
  },

  // Smart cache key generation for paginated data
  generateCacheKey(
    collection: string,
    page: number,
    pageSize: number,
    filters: Array<{ field: string; operator: string; value: any }> = []
  ): string {
    const filterKey = filters
      .map(f => `${f.field}_${f.operator}_${f.value}`)
      .join('_');
    
    return `pagination_${collection}_page_${page}_size_${pageSize}_${filterKey}`;
  }
};
