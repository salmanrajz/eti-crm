import type { NumberPool } from '../types';
import { chunk } from './array';

const DB_NAME = 'crms';
const DB_VERSION = 4;
const NUMBERS_STORE = 'numbers';
const SEARCH_INDEX_STORE = 'searchIndex';
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const BATCH_SIZE = 500; // Reduced batch size for better performance
const INITIAL_LOAD_SIZE = 10000; // Increased to handle large number pools efficiently

interface CacheMetadata {
  timestamp: number;
  category: string;
  totalCount: number;
  lastLoadedIndex: number;
}

interface CachedNumberPool extends NumberPool {
  metadata: CacheMetadata;
}

export async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(NUMBERS_STORE)) {
        createNumbersStore(db);
      } else if (event.oldVersion < 3) {
        // Delete and recreate the store with new indexes
        db.deleteObjectStore(NUMBERS_STORE);
        createNumbersStore(db);
      }
      
      // Create search index store for version 4+
      if (event.oldVersion < 4 && !db.objectStoreNames.contains(SEARCH_INDEX_STORE)) {
        createSearchIndexStore(db);
      }
    };
  });
}

function createNumbersStore(db: IDBDatabase) {
  const store = db.createObjectStore(NUMBERS_STORE, { keyPath: 'id' });
  store.createIndex('category', 'category', { unique: false });
  store.createIndex('status', 'status', { unique: false });
  store.createIndex('number', 'number', { unique: false });
  store.createIndex('categoryTimestamp', ['category', 'metadata.timestamp'], { unique: false });
  store.createIndex('categoryStatus', ['category', 'status'], { unique: false });
  store.createIndex('numberSearch', 'number', { unique: false });
  store.createIndex('reservedBy', 'reservedBy', { unique: false });
}

function createSearchIndexStore(db: IDBDatabase) {
  const store = db.createObjectStore(SEARCH_INDEX_STORE, { keyPath: 'id' });
  store.createIndex('category', 'category', { unique: false });
  store.createIndex('searchTerms', 'searchTerms', { unique: false });
  store.createIndex('timestamp', 'timestamp', { unique: false });
}

/**
 * Clear all numbers for a specific category before caching new ones
 */
async function clearCategoryNumbers(db: IDBDatabase, category: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(NUMBERS_STORE, 'readwrite');
    const store = tx.objectStore(NUMBERS_STORE);
    const index = store.index('category');
    const request = index.openCursor(IDBKeyRange.only(category));
    
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Exported helper to clear cache for a specific category
export async function clearCategoryCache(category: string): Promise<void> {
  const db = await openDB();
  try {
    await clearCategoryNumbers(db, category);
  } finally {
    db.close();
  }
}

export async function cacheNumbers(numbers: NumberPool[], category: string): Promise<void> {
  const db = await openDB();
  
  try {
    // Clear existing numbers for this category first
    await clearCategoryNumbers(db, category);
    
    // Add metadata to track when the cache was created
    const metadata: CacheMetadata = {
      timestamp: Date.now(),
      category,
      totalCount: numbers.length,
      lastLoadedIndex: 0
    };

    // Process in smaller batches for better performance
    const batches = chunk(numbers, BATCH_SIZE);
    const promises = batches.map((batch, index) => {
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(NUMBERS_STORE, 'readwrite');
        const store = tx.objectStore(NUMBERS_STORE);

        // Store each number in the batch with metadata
        for (const number of batch) {
          store.put({ 
            ...number, 
            metadata: {
              ...metadata,
              lastLoadedIndex: index * BATCH_SIZE
            }
          });
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    });

    // Wait for all batches to complete
    await Promise.all(promises);
  } finally {
    db.close();
  }
}

export async function getCachedNumbers(category: string, limit: number = INITIAL_LOAD_SIZE): Promise<NumberPool[] | null> {
  const db = await openDB();
  
  try {
    const tx = db.transaction(NUMBERS_STORE, 'readonly');
    const store = tx.objectStore(NUMBERS_STORE);
    const index = store.index('categoryTimestamp');

    // Use IDBKeyRange to filter by category and timestamp
    const now = Date.now();
    const validTimestamp = now - CACHE_DURATION;
    const keyRange = IDBKeyRange.bound(
      [category, validTimestamp],
      [category, now]
    );

    // Use getAll with keyRange for better performance
    const request = index.getAll(keyRange, limit);
    const numbers = await new Promise<CachedNumberPool[]>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    // If no valid cached data found, return null
    if (numbers.length === 0) {
      return null;
    }

    // Sort by lastLoadedIndex to ensure correct order
    const sortedNumbers = numbers.sort((a, b) => 
      (a.metadata?.lastLoadedIndex || 0) - (b.metadata?.lastLoadedIndex || 0)
    );

    // Remove metadata and return the results
    return sortedNumbers.map(({ metadata, ...number }) => number);
  } finally {
    db.close();
  }
}

export async function searchCachedNumbers(searchTerm: string, category: string, limit: number = 20): Promise<NumberPool[] | null> {
  const db = await openDB();
  
  try {
    const tx = db.transaction(NUMBERS_STORE, 'readonly');
    const store = tx.objectStore(NUMBERS_STORE);
    const index = store.index('category');
    
    // Get all numbers for this category
    const request = index.getAll(IDBKeyRange.only(category));
    const numbers = await new Promise<CachedNumberPool[]>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    
    if (numbers.length === 0) {
      return null;
    }
    
    // Filter by search term
    const filteredNumbers = numbers.filter(number => 
      number.number.includes(searchTerm)
    ).slice(0, limit);
    
    // Remove metadata and return the results
    return filteredNumbers.map(({ metadata, ...number }) => number);
  } finally {
    db.close();
  }
}

export async function getCachedNumbersByStatus(category: string, statuses: string[], limit: number = INITIAL_LOAD_SIZE): Promise<NumberPool[] | null> {
  const db = await openDB();
  
  try {
    const tx = db.transaction(NUMBERS_STORE, 'readonly');
    const store = tx.objectStore(NUMBERS_STORE);
    const index = store.index('category');
    
    // Get all numbers for this category
    const request = index.getAll(IDBKeyRange.only(category));
    const numbers = await new Promise<CachedNumberPool[]>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    
    if (numbers.length === 0) {
      return null;
    }
    
    // Filter by status
    const filteredNumbers = numbers
      .filter(number => statuses.includes(number.status))
      .slice(0, limit);
    
    // Remove metadata and return the results
    return filteredNumbers.map(({ metadata, ...number }) => number);
  } finally {
    db.close();
  }
}

export async function getCachedReservedNumbers(userId: string, category: string): Promise<NumberPool[] | null> {
  const db = await openDB();
  
  try {
    const tx = db.transaction(NUMBERS_STORE, 'readonly');
    const store = tx.objectStore(NUMBERS_STORE);
    const index = store.index('reservedBy');
    
    // Get all numbers reserved by this user
    const request = index.getAll(IDBKeyRange.only(userId));
    const numbers = await new Promise<CachedNumberPool[]>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    
    if (numbers.length === 0) {
      return null;
    }
    
    // Filter by category
    const filteredNumbers = numbers.filter(number => 
      number.category === category
    );
    
    // Remove metadata and return the results
    return filteredNumbers.map(({ metadata, ...number }) => number);
  } finally {
    db.close();
  }
}

export async function getMoreCachedNumbers(category: string, offset: number, limit: number): Promise<NumberPool[] | null> {
  const db = await openDB();
  
  try {
    const tx = db.transaction(NUMBERS_STORE, 'readonly');
    const store = tx.objectStore(NUMBERS_STORE);
    const index = store.index('categoryTimestamp');

    // Use IDBKeyRange to filter by category and timestamp
    const now = Date.now();
    const validTimestamp = now - CACHE_DURATION;
    const keyRange = IDBKeyRange.bound(
      [category, validTimestamp],
      [category, now]
    );

    // Use getAll with keyRange for better performance
    const request = index.getAll(keyRange);
    const numbers = await new Promise<CachedNumberPool[]>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    // If no valid cached data found, return null
    if (numbers.length === 0) {
      return null;
    }

    // Sort by lastLoadedIndex to ensure correct order
    const sortedNumbers = numbers.sort((a, b) => 
      (a.metadata?.lastLoadedIndex || 0) - (b.metadata?.lastLoadedIndex || 0)
    );

    // Remove metadata and get the requested slice
    return sortedNumbers
      .map(({ metadata, ...number }) => number)
      .slice(offset, offset + limit);
  } finally {
    db.close();
  }
}

export async function clearNumbersCache(): Promise<void> {
  try {
    const db = await openDB();
    
    // Delete the old database and create a new one
    db.close();
    await new Promise<void>((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(DB_NAME);
      deleteRequest.onerror = () => reject(deleteRequest.error);
      deleteRequest.onsuccess = () => resolve();
    });
    
    // Reopen the database to create new stores
    await openDB();
  } catch (error) {
  }
}

export async function updateCachedNumber(number: NumberPool): Promise<void> {
  const db = await openDB();
  
  try {
    const tx = db.transaction(NUMBERS_STORE, 'readwrite');
    const store = tx.objectStore(NUMBERS_STORE);
    
    // Get the existing number to preserve metadata
    const request = store.get(number.id);
    const existingNumber = await new Promise<CachedNumberPool | undefined>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    
    if (existingNumber) {
      // Update the number while preserving metadata
      store.put({
        ...number,
        metadata: existingNumber.metadata
      });
    } else {
      // Add new number with fresh metadata
      store.put({
        ...number,
        metadata: {
          timestamp: Date.now(),
          category: number.category,
          totalCount: 1,
          lastLoadedIndex: 0
        }
      });
    }
    
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// NEW: Batch update multiple numbers for better performance
export async function batchUpdateCachedNumbers(numbers: NumberPool[]): Promise<void> {
  if (numbers.length === 0) return;
  
  const db = await openDB();
  
  try {
    const tx = db.transaction(NUMBERS_STORE, 'readwrite');
    const store = tx.objectStore(NUMBERS_STORE);
    
    // Process in batches to avoid blocking the UI
    const batchSize = 50;
    for (let i = 0; i < numbers.length; i += batchSize) {
      const batch = numbers.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (number) => {
        // Get existing number to preserve metadata
        const existingRequest = store.get(number.id);
        const existingNumber = await new Promise<CachedNumberPool | undefined>((resolve, reject) => {
          existingRequest.onerror = () => reject(existingRequest.error);
          existingRequest.onsuccess = () => resolve(existingRequest.result);
        });
        
        if (existingNumber) {
          // Update while preserving metadata
          store.put({
            ...number,
            metadata: {
              ...existingNumber.metadata,
              timestamp: Date.now() // Update timestamp
            }
          });
        } else {
          // Add new number
          store.put({
            ...number,
            metadata: {
              timestamp: Date.now(),
              category: number.category,
              totalCount: 1,
              lastLoadedIndex: 0
            }
          });
        }
      }));
    }
    
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// NEW: Handle incremental cache updates from real-time listeners
export async function handleIncrementalCacheUpdate(changes: Array<{
  type: 'added' | 'modified' | 'removed';
  number: NumberPool;
}>): Promise<void> {
  if (changes.length === 0) return;
  
  const db = await openDB();
  
  try {
    const tx = db.transaction(NUMBERS_STORE, 'readwrite');
    const store = tx.objectStore(NUMBERS_STORE);
    
    for (const change of changes) {
      switch (change.type) {
        case 'added':
        case 'modified':
          // Get existing to preserve metadata
          const existingRequest = store.get(change.number.id);
          const existingNumber = await new Promise<CachedNumberPool | undefined>((resolve, reject) => {
            existingRequest.onerror = () => reject(existingRequest.error);
            existingRequest.onsuccess = () => resolve(existingRequest.result);
          });
          
          store.put({
            ...change.number,
            metadata: existingNumber ? {
              ...existingNumber.metadata,
              timestamp: Date.now()
            } : {
              timestamp: Date.now(),
              category: change.number.category,
              totalCount: 1,
              lastLoadedIndex: 0
            }
          });
          break;
          
        case 'removed':
          store.delete(change.number.id);
          break;
      }
    }
    
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// NEW: Get cached numbers with real-time merge capability
export async function getCachedNumbersWithMerge(
  category: string, 
  limit: number = INITIAL_LOAD_SIZE
): Promise<{
  numbers: NumberPool[];
  isStale: boolean;
  lastUpdate: number;
} | null> {
  const db = await openDB();
  
  try {
    const tx = db.transaction(NUMBERS_STORE, 'readonly');
    const store = tx.objectStore(NUMBERS_STORE);
    const index = store.index('categoryTimestamp');

    const now = Date.now();
    const validTimestamp = now - CACHE_DURATION;
    const staleThreshold = now - (5 * 60 * 1000); // 5 minutes for stale check
    
    const keyRange = IDBKeyRange.bound(
      [category, validTimestamp],
      [category, now]
    );

    const request = index.getAll(keyRange, limit);
    const numbers = await new Promise<CachedNumberPool[]>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    if (numbers.length === 0) {
      return null;
    }

    // Check if data is stale
    const latestTimestamp = Math.max(...numbers.map(n => n.metadata?.timestamp || 0));
    const isStale = latestTimestamp < staleThreshold;

    // Sort and return
    const sortedNumbers = numbers.sort((a, b) => 
      (a.metadata?.lastLoadedIndex || 0) - (b.metadata?.lastLoadedIndex || 0)
    );

    return {
      numbers: sortedNumbers.map(({ metadata, ...number }) => number),
      isStale,
      lastUpdate: latestTimestamp
    };
  } finally {
    db.close();
  }
}

// NEW: Smart cache invalidation
export async function invalidateStaleCache(category: string): Promise<void> {
  const db = await openDB();
  
  try {
    const tx = db.transaction(NUMBERS_STORE, 'readwrite');
    const store = tx.objectStore(NUMBERS_STORE);
    const index = store.index('categoryTimestamp');

    const now = Date.now();
    const staleTimestamp = now - CACHE_DURATION;
    
    const keyRange = IDBKeyRange.upperBound([category, staleTimestamp]);
    
    // Delete stale entries
    const request = index.openCursor(keyRange);
    
    await new Promise<void>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  } finally {
    db.close();
  }
}

// NEW: Pagination-aware cache functions
export async function cachePaginatedNumbers(
  numbers: NumberPool[], 
  category: string, 
  page: number, 
  pageSize: number
): Promise<void> {
  const db = await openDB();
  
  try {
    const tx = db.transaction(NUMBERS_STORE, 'readwrite');
    const store = tx.objectStore(NUMBERS_STORE);
    
    // Add pagination metadata
    const metadata: CacheMetadata = {
      timestamp: Date.now(),
      category,
      totalCount: numbers.length,
      lastLoadedIndex: (page - 1) * pageSize
    };

    // Store each number with pagination info
    for (const number of numbers) {
      store.put({ 
        ...number, 
        metadata: {
          ...metadata,
          page,
          pageSize
        }
      });
    }
    
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getCachedPaginatedNumbers(
  category: string, 
  page: number, 
  pageSize: number
): Promise<NumberPool[] | null> {
  const db = await openDB();
  
  try {
    const tx = db.transaction(NUMBERS_STORE, 'readonly');
    const store = tx.objectStore(NUMBERS_STORE);
    const index = store.index('categoryTimestamp');

    const now = Date.now();
    const validTimestamp = now - CACHE_DURATION;
    const keyRange = IDBKeyRange.bound(
      [category, validTimestamp],
      [category, now]
    );

    const request = index.getAll(keyRange);
    const numbers = await new Promise<CachedNumberPool[]>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    if (numbers.length === 0) {
      return null;
    }

    // Filter by page and pageSize
    const paginatedNumbers = numbers.filter(number => 
      number.metadata?.page === page && 
      number.metadata?.pageSize === pageSize
    );

    if (paginatedNumbers.length === 0) {
      return null;
    }

    // Sort by lastLoadedIndex to ensure correct order
    const sortedNumbers = paginatedNumbers.sort((a, b) => 
      (a.metadata?.lastLoadedIndex || 0) - (b.metadata?.lastLoadedIndex || 0)
    );

    // Remove metadata and return the results
    return sortedNumbers.map(({ metadata, ...number }) => number);
  } finally {
    db.close();
  }
}

// NEW: Search index for fast searching across all cached data
export async function buildSearchIndex(category: string): Promise<void> {
  const db = await openDB();
  
  try {
    const tx = db.transaction(NUMBERS_STORE, 'readonly');
    const store = tx.objectStore(NUMBERS_STORE);
    const numbers: CachedNumberPool[] = await new Promise((resolve, reject) => {
      if (category === 'all') {
        const req = store.getAll();
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result as CachedNumberPool[]);
      } else {
        const index = store.index('category');
        const req = index.getAll(IDBKeyRange.only(category));
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result as CachedNumberPool[]);
      }
    });
    
    // Create search index in a separate store
    const searchTx = db.transaction(['searchIndex'], 'readwrite');
    const searchStore = searchTx.objectStore('searchIndex');
    
    // Clear existing search index for this category (or all)
    await new Promise<void>((resolve, reject) => {
      if (category === 'all') {
        const clearRequest = searchStore.clear();
        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = () => reject(clearRequest.error);
      } else {
        const catIndex = searchStore.index('category');
        const cursorReq = catIndex.openCursor(IDBKeyRange.only(category));
        cursorReq.onerror = () => reject(cursorReq.error);
        cursorReq.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            resolve();
          }
        };
      }
    });
    
    // Build search index
    for (const number of numbers) {
      const code = (number as any).code || '';
      const codeNormalized = (number as any).codeNormalized || code?.toString().toLowerCase() || '';
      const codeTokens: string[] = ((number as any).codeTokens || []) as string[];

      const numberNormalized = (number as any).numberNormalized || number.number?.toString().toLowerCase() || '';
      const numberTokens: string[] = ((number as any).numberTokens || []) as string[];

      const group = (number as any).group || '';

      const searchTerms = [
        number.number,
        numberNormalized,
        ...numberTokens,
        number.category,
        group,
        number.status,
        code,
        codeNormalized,
        ...codeTokens,
        number.reservedBy || '',
        number.claimingAgentId || ''
      ]
        .filter(term => term)
        .join(' ')
        .toLowerCase();
      
      await new Promise<void>((resolve, reject) => {
        const putRequest = searchStore.put({
          id: number.id,
          searchTerms,
          category,
          timestamp: Date.now()
        });
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      });
    }

    await new Promise<void>((resolve, reject) => {
      searchTx.oncomplete = () => resolve();
      searchTx.onerror = () => reject(searchTx.error);
    });
  } finally {
    db.close();
  }
}

export async function searchCachedNumbersFast(
  searchTerm: string, 
  category: string, 
  limit: number = 20
): Promise<NumberPool[] | null> {
  const db = await openDB();
  
  try {
    // First check if search index exists
    if (!db.objectStoreNames.contains('searchIndex')) {
      return null;
    }
    
    const tx = db.transaction(['searchIndex', NUMBERS_STORE], 'readonly');
    const searchStore = tx.objectStore('searchIndex');
    const numbersStore = tx.objectStore(NUMBERS_STORE);
    
    // Get all search index entries
    const searchRequest = searchStore.getAll();
    const searchEntries = await new Promise<any[]>((resolve, reject) => {
      searchRequest.onerror = () => reject(searchRequest.error);
      searchRequest.onsuccess = () => resolve(searchRequest.result);
    });
    
    // Filter by search term (no category restriction when category === 'all')
    const lower = searchTerm.toLowerCase();
    const matchingEntries = searchEntries
      .filter(entry => entry.searchTerms.includes(lower))
      .filter(entry => category === 'all' ? true : entry.category === category)
      .slice(0, limit);
    
    if (matchingEntries.length === 0) {
      return null;
    }
    
    // Get the actual number data
    const numbers: NumberPool[] = [];
    for (const entry of matchingEntries) {
      const numberRequest = numbersStore.get(entry.id);
      const number = await new Promise<CachedNumberPool | undefined>((resolve, reject) => {
        numberRequest.onerror = () => reject(numberRequest.error);
        numberRequest.onsuccess = () => resolve(numberRequest.result);
      });
      
      if (number) {
        const { metadata, ...numberData } = number;
        numbers.push(numberData);
      }
    }
    
    return numbers;
  } finally {
    db.close();
  }
}

// NEW: Multi-token cached search (AND semantics) over the searchIndex
export async function searchCachedNumbersByTokens(
  tokens: string[],
  category: string,
  limit: number = 50
): Promise<NumberPool[] | null> {
  const db = await openDB();
  try {
    if (!db.objectStoreNames.contains('searchIndex')) {
      return null;
    }

    const lowerTokens = tokens.map(t => t.toLowerCase()).filter(Boolean);
    if (lowerTokens.length === 0) return null;

    const tx = db.transaction(['searchIndex', NUMBERS_STORE], 'readonly');
    const searchStore = tx.objectStore('searchIndex');
    const numbersStore = tx.objectStore(NUMBERS_STORE);

    const searchRequest = searchStore.getAll();
    const searchEntries = await new Promise<any[]>((resolve, reject) => {
      searchRequest.onerror = () => reject(searchRequest.error);
      searchRequest.onsuccess = () => resolve(searchRequest.result);
    });

    const matches = searchEntries
      .filter(entry => category === 'all' ? true : entry.category === category)
      .filter(entry => lowerTokens.every(tok => entry.searchTerms.includes(tok)))
      .slice(0, limit);

    if (matches.length === 0) return null;

    const results: NumberPool[] = [];
    for (const entry of matches) {
      const numberRequest = numbersStore.get(entry.id);
      const number = await new Promise<CachedNumberPool | undefined>((resolve, reject) => {
        numberRequest.onerror = () => reject(numberRequest.error);
        numberRequest.onsuccess = () => resolve(numberRequest.result);
      });
      if (number) {
        const { metadata, ...numberData } = number;
        results.push(numberData);
      }
    }

    return results;
  } finally {
    db.close();
  }
}