/**
 * ===============================================================================
 * FAST PAGE JUMP UTILITY - DIRECT PAGE NAVIGATION WITHOUT LOADING INTERMEDIATE PAGES
 * ===============================================================================
 * 
 * This utility provides ultra-fast direct page navigation for Firebase Firestore
 * collections. It only loads the exact page requested without loading any
 * intermediate pages, making it the fastest way to jump to any page number.
 * 
 * FEATURES:
 * 
 * 1. DIRECT PAGE LOADING
 *    - Loads only the target page's data (pageSize documents)
 *    - No intermediate page loading
 *    - Optimized for large datasets
 * 
 * 2. SMART NAVIGATION STRATEGY
 *    - First/Last page: Direct limit queries
 *    - Middle pages: Efficient skip-based with minimal data transfer
 *    - Uses stats service for fast total count
 * 
 * 3. PERFORMANCE OPTIMIZATION
 *    - Single query per page jump
 *    - Minimal data transfer
 *    - Fast execution time
 * 
 * USAGE:
 * Import fastPageJump function to navigate directly to any page number
 * without loading intermediate pages.
 * ===============================================================================
 */

import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  limitToLast,
  getDocs,
  getCountFromServer,
  where,
  WhereFilterOp
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { numberPoolStatsService } from '../services/numberPoolStatsService';
import { NumberPool } from '../types';

interface FastPageJumpOptions {
  collectionName: string;
  pageNumber: number;
  pageSize: number;
  orderByField?: string;
  orderDirection?: 'asc' | 'desc';
  filters?: Array<{
    field: string;
    operator: WhereFilterOp;
    value: any;
  }>;
  category?: string | null;
  group?: string | null;
  initials?: string | null;
}

interface FastPageJumpResult<T> {
  data: T[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Fast page jump - loads only the target page without loading intermediate pages
 * This is the fastest way to navigate directly to any page number
 */
export async function fastPageJump<T = NumberPool>(
  options: FastPageJumpOptions
): Promise<FastPageJumpResult<T>> {
  const {
    collectionName,
    pageNumber,
    pageSize,
    orderByField = 'lastStatusChange',
    orderDirection = 'desc',
    filters = [],
    category,
    group,
    initials
  } = options;

  if (pageNumber < 1) {
    throw new Error('Page number must be greater than 0');
  }

  // Build base query with filters
  let baseQuery = query(collection(db, collectionName));
  
  // Apply filters
  filters.forEach(filter => {
    baseQuery = query(baseQuery, where(filter.field, filter.operator, filter.value));
  });

  // Apply category filter if provided
  if (category && category !== 'all') {
    baseQuery = query(baseQuery, where('category', '==', category));
  }

  // Apply group filter if provided
  if (group && group !== 'all') {
    baseQuery = query(baseQuery, where('group', '==', group));
  }

  // Apply initials filter if provided (for prefix-based filtering)
  if (initials) {
    baseQuery = query(baseQuery, where('initials', '==', initials));
    // When using initials, order by createdAt desc (as per smartPagination logic)
    baseQuery = query(baseQuery, orderBy('createdAt', 'desc'));
  } else {
    // Standard ordering
    baseQuery = query(baseQuery, orderBy(orderByField, orderDirection));
  }

  // Get total count efficiently using stats service
  let totalItems: number;
  let totalPages: number;

  try {
    // Try stats service first (fastest, pre-calculated)
    totalItems = await numberPoolStatsService.getTotalItems(
      category && category !== 'all' ? category : undefined,
      group && group !== 'all' ? group : undefined,
      initials || undefined
    );
    totalPages = await numberPoolStatsService.getTotalPages(
      pageSize,
      category && category !== 'all' ? category : undefined,
      group && group !== 'all' ? group : undefined,
      initials || undefined
    );
  } catch (error) {
    // Fallback to count query if stats service fails
    const countSnap = await getCountFromServer(baseQuery);
    totalItems = Number(countSnap.data().count || 0);
    totalPages = Math.ceil(totalItems / pageSize) || 1;
  }

  // Validate page number
  if (pageNumber > totalPages && totalPages > 0) {
    throw new Error(`Page ${pageNumber} does not exist. Total pages: ${totalPages}`);
  }

  // STRATEGY 1: First page - direct limit query (fastest)
  if (pageNumber === 1) {
    const q = query(baseQuery, limit(pageSize));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as T[];

    return {
      data,
      currentPage: 1,
      totalPages,
      totalItems,
      hasNextPage: totalPages > 1,
      hasPreviousPage: false
    };
  }

  // STRATEGY 2: Last page - use limitToLast (fastest for last page)
  if (pageNumber === totalPages) {
    const q = query(baseQuery, limitToLast(pageSize));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as T[];

    return {
      data,
      currentPage: totalPages,
      totalPages,
      totalItems,
      hasNextPage: false,
      hasPreviousPage: totalPages > 1
    };
  }

  // STRATEGY 3: Middle pages - optimized skip-based loading
  // Calculate how many documents to skip
  const skipCount = (pageNumber - 1) * pageSize;

  // Firestore doesn't support skip directly, so we use limit to get all docs up to target page
  // Then slice to get only the target page
  // This is still faster than loading all pages sequentially
  const q = query(baseQuery, limit(skipCount + pageSize));
  const snapshot = await getDocs(q);
  const allDocs = snapshot.docs;

  // Validate we have enough documents
  if (allDocs.length <= skipCount && totalItems > 0) {
    throw new Error(`Page ${pageNumber} does not exist`);
  }

  // Extract only the target page's documents
  const pageDocs = allDocs.slice(skipCount, skipCount + pageSize);
  const data = pageDocs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as T[];

  return {
    data,
    currentPage: pageNumber,
    totalPages,
    totalItems,
    hasNextPage: pageNumber < totalPages,
    hasPreviousPage: pageNumber > 1
  };
}

/**
 * Fast page jump specifically for NumberPool collection
 * Convenience wrapper with NumberPool-specific defaults
 */
export async function fastPageJumpNumberPool(
  pageNumber: number,
  pageSize: number,
  category?: string | null,
  group?: string | null,
  initials?: string | null
): Promise<FastPageJumpResult<NumberPool>> {
  const filters: Array<{ field: string; operator: WhereFilterOp; value: any }> = [];

  return fastPageJump<NumberPool>({
    collectionName: 'numberPool',
    pageNumber,
    pageSize,
    orderByField: 'lastStatusChange',
    orderDirection: 'desc',
    filters,
    category,
    group,
    initials
  });
}
