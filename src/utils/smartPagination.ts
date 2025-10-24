// Smart pagination that maintains cursor cache for efficient navigation
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  startAfter, 
  endBefore, 
  limitToLast,
  QueryDocumentSnapshot,
  getDocs,
  getCountFromServer,
  where,
  WhereFilterOp
} from 'firebase/firestore';
import { db } from '../lib/firebase';

interface PageCursor {
  page: number;
  firstDoc: QueryDocumentSnapshot | null;
  lastDoc: QueryDocumentSnapshot | null;
  timestamp: number;
}

interface SmartPaginationOptions {
  pageSize?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  filters?: Array<{
    field: string;
    operator: WhereFilterOp;
    value: any;
  }>;
}

export class SmartPagination<T> {
  private collectionName: string;
  private options: Required<SmartPaginationOptions>;
  private cursorCache = new Map<number, PageCursor>(); // Cache cursors for visited pages
  private totalItems = 0;
  private totalPages = 0;
  private currentPage = 1;

  constructor(collectionName: string, options: SmartPaginationOptions = {}) {
    this.collectionName = collectionName;
    this.options = {
      pageSize: options.pageSize || 50,
      orderBy: options.orderBy || 'lastStatusChange',
      orderDirection: options.orderDirection || 'desc',
      filters: options.filters || []
    };
  }

  private buildBaseQuery() {
    let q = query(collection(db, this.collectionName));
    
    this.options.filters.forEach(filter => {
      q = query(q, where(filter.field, filter.operator, filter.value));
    });
    
    q = query(q, orderBy(this.options.orderBy, this.options.orderDirection));
    
    return q;
  }

  private async updateTotalCount() {
    const countSnap = await getCountFromServer(this.buildBaseQuery());
    this.totalItems = Number(countSnap.data().count || 0);
    this.totalPages = Math.ceil(this.totalItems / this.options.pageSize);
  }

  private cacheCursor(page: number, firstDoc: QueryDocumentSnapshot | null, lastDoc: QueryDocumentSnapshot | null) {
    this.cursorCache.set(page, {
      page,
      firstDoc,
      lastDoc,
      timestamp: Date.now()
    });
  }

  private getCachedCursor(page: number): PageCursor | null {
    const cached = this.cursorCache.get(page);
    if (!cached) return null;
    
    // Cache expires after 5 minutes
    if (Date.now() - cached.timestamp > 5 * 60 * 1000) {
      this.cursorCache.delete(page);
      return null;
    }
    
    return cached;
  }

  async loadPage(pageNumber: number): Promise<{ data: T[]; hasNextPage: boolean; hasPreviousPage: boolean }> {
    if (pageNumber < 1) {
      throw new Error('Page number must be greater than 0');
    }

    await this.updateTotalCount();

    if (pageNumber > this.totalPages) {
      throw new Error('Page does not exist');
    }

    this.currentPage = pageNumber;

    // Handle first page
    if (pageNumber === 1) {
      const q = query(this.buildBaseQuery(), limit(this.options.pageSize));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as T[];
      
      const firstDoc = snapshot.docs[0] || null;
      const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
      this.cacheCursor(1, firstDoc, lastDoc);

      return {
        data,
        hasNextPage: this.totalPages > 1,
        hasPreviousPage: false
      };
    }

    // Handle last page
    if (pageNumber === this.totalPages) {
      const q = query(this.buildBaseQuery(), limitToLast(this.options.pageSize));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as T[];
      
      const firstDoc = snapshot.docs[0] || null;
      const lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
      this.cacheCursor(pageNumber, firstDoc, lastDoc);

      return {
        data,
        hasNextPage: false,
        hasPreviousPage: this.totalPages > 1
      };
    }

    // Try to navigate from cached cursors for middle pages
    const cachedCursor = this.getCachedCursor(pageNumber);
    if (cachedCursor) {
      // We have a cached cursor for this exact page
      const q = query(
        this.buildBaseQuery(),
        startAfter(cachedCursor.firstDoc),
        limit(this.options.pageSize)
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as T[];
      
      return {
        data,
        hasNextPage: pageNumber < this.totalPages,
        hasPreviousPage: pageNumber > 1
      };
    }

    // Look for nearby cached cursors
    let bestCursor: PageCursor | null = null;
    let bestDistance = Infinity;

    for (const cursor of this.cursorCache.values()) {
      const distance = Math.abs(cursor.page - pageNumber);
      if (distance < bestDistance && distance <= 10) { // Only use if within 10 pages
        bestDistance = distance;
        bestCursor = cursor;
      }
    }

    // Navigate from best cursor if found
    if (bestCursor) {
      const steps = pageNumber - bestCursor.page;
      let q;

      if (steps > 0) {
        // Navigate forward
        q = query(
          this.buildBaseQuery(),
          startAfter(bestCursor.lastDoc),
          limit(steps * this.options.pageSize)
        );
      } else {
        // Navigate backward
        q = query(
          this.buildBaseQuery(),
          endBefore(bestCursor.firstDoc),
          limitToLast(Math.abs(steps) * this.options.pageSize)
        );
      }

      const snapshot = await getDocs(q);
      const allDocs = snapshot.docs;
      
      // Extract the target page
      const startIndex = steps > 0 ? (Math.abs(steps) - 1) * this.options.pageSize : 0;
      const endIndex = startIndex + this.options.pageSize;
      const pageDocs = allDocs.slice(startIndex, endIndex);
      
      const data = pageDocs.map(doc => ({ id: doc.id, ...doc.data() })) as T[];
      const firstDoc = pageDocs[0] || null;
      const lastDoc = pageDocs[pageDocs.length - 1] || null;
      
      this.cacheCursor(pageNumber, firstDoc, lastDoc);

      return {
        data,
        hasNextPage: pageNumber < this.totalPages,
        hasPreviousPage: pageNumber > 1
      };
    }

    // Fallback: skip-based loading (less efficient but works)
    const skipCount = (pageNumber - 1) * this.options.pageSize;
    const q = query(this.buildBaseQuery(), limit(skipCount + this.options.pageSize));
    const snapshot = await getDocs(q);
    const allDocs = snapshot.docs;

    if (allDocs.length <= skipCount) {
      throw new Error('Page does not exist');
    }

    const pageDocs = allDocs.slice(skipCount, skipCount + this.options.pageSize);
    const data = pageDocs.map(doc => ({ id: doc.id, ...doc.data() })) as T[];
    
    const firstDoc = pageDocs[0] || null;
    const lastDoc = pageDocs[pageDocs.length - 1] || null;
    this.cacheCursor(pageNumber, firstDoc, lastDoc);

    return {
      data,
      hasNextPage: pageNumber < this.totalPages,
      hasPreviousPage: pageNumber > 1
    };
  }

  // Navigate to next page efficiently
  async nextPage(): Promise<{ data: T[]; hasNextPage: boolean; hasPreviousPage: boolean }> {
    if (this.currentPage >= this.totalPages) {
      throw new Error('No next page available');
    }

    return this.loadPage(this.currentPage + 1);
  }

  // Navigate to previous page efficiently  
  async previousPage(): Promise<{ data: T[]; hasNextPage: boolean; hasPreviousPage: boolean }> {
    if (this.currentPage <= 1) {
      throw new Error('No previous page available');
    }

    return this.loadPage(this.currentPage - 1);
  }

  // Get current page info
  getCurrentPage(): number {
    return this.currentPage;
  }

  getTotalPages(): number {
    return this.totalPages;
  }

  getTotalItems(): number {
    return this.totalItems;
  }

  // Clear cursor cache (call when data changes significantly)
  clearCache() {
    this.cursorCache.clear();
  }

  // Update filters and clear cache
  updateFilters(filters: Array<{ field: string; operator: WhereFilterOp; value: any }>) {
    this.options.filters = filters;
    this.clearCache();
    this.currentPage = 1;
  }
}
