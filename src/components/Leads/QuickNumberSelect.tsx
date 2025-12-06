/**
 * ===============================================================================
 * QUICK NUMBER SELECT COMPONENT - OPTIMIZED NUMBER SELECTION
 * ===============================================================================
 * 
 * This component provides an optimized interface for quick number selection
 * from the number pool, featuring advanced search capabilities, caching,
 * and reserved number management for enhanced user experience.
 * 
 * FEATURES:
 * 
 * 1. ADVANCED SEARCH CAPABILITIES
 *    - N-gram tokenized search for fast partial matching
 *    - Cache-first search approach for optimal performance
 *    - Substring matching with secondary scan capabilities
 *    - Debounced search with minimum length requirements
 * 
 * 2. RESERVED NUMBER MANAGEMENT
 *    - Real-time display of user-reserved numbers
 *    - Separate handling for reserved vs available numbers
 *    - User-specific number reservation tracking
 * 
 * 3. PERFORMANCE OPTIMIZATION
 *    - IndexedDB caching with fast search algorithms
 *    - Multiple search strategies (exact, cached, live queries)
 *    - Efficient query limiting and result management
 *    - Real-time updates with snapshot listeners
 * 
 * 4. CATEGORY AND FILTERING
 *    - Category-based number filtering and selection
 *    - Visual category picker with dropdown interface
 *    - Dynamic category switching with appropriate filtering
 * 
 * USAGE:
 * This component is used in lead creation workflows to provide agents with
 * a fast and efficient interface for selecting phone numbers, with special
 * emphasis on their reserved numbers and quick search capabilities.
 * ===============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, orderBy, limit, onSnapshot, arrayContains, arrayContainsAny } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { NumberPool } from '../../types';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';
import { clsx } from 'clsx';
import { useAuthStore } from '../../store/authStore';
import { searchCachedNumbersFast, searchCachedNumbersByTokens } from '../../utils/indexedDB';

interface QuickNumberSelectProps {
  onSelect: (number: NumberPool) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

const SEARCH_DEBOUNCE = 300;
const MIN_SEARCH_LENGTH = 3;
const SEARCH_LIMIT = 20;
const SECONDARY_SCAN_LIMIT = 200; // broader scan to support substring matching
//const INITIAL_LOAD_SIZE = 10; // Initial numbers to show when no search term

const numberCategories = ['Standard', 'Silver', 'Silver plus', 'Gold', 'Gold plus', 'Platinum'] as const;

export function QuickNumberSelect({ onSelect, selectedCategory, onCategoryChange }: QuickNumberSelectProps) {
  const { user, isAdmin } = useAuthStore();
  const [numbers, setNumbers] = useState<NumberPool[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCategories, setShowCategories] = useState(false);
  const [reservedNumbers, setReservedNumbers] = useState<NumberPool[]>([]);
  const debouncedSearch = useDebounce(searchTerm, SEARCH_DEBOUNCE);

  // Visibility guard filter for team-restricted numbers based on user role
  const filterByVisibility = useCallback((list: NumberPool[]): NumberPool[] => {
    // Admin/manager/coordinator see everything
    if (isAdmin() || user?.role === 'manager' || user?.role === 'coordinator') return list;
    // Agents: if number has teamVisibility, it must match user's team; if missing, it's public
    // Also hide activated numbers from agents (consistent with NumberPool)
    if (user?.role === 'agent' && user.teamId) {
      return list.filter(n => {
        if (n.status === 'activated') return false;
        return !n.teamVisibility || n.teamVisibility === user.teamId;
      });
    }
    return list;
  }, [isAdmin, user?.role, user?.teamId]);

  // Load reserved numbers for the current user
  const loadReservedNumbers = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const reservedQuery = query(
        collection(db, 'numberPool'),
        where('category', '==', selectedCategory),
        where('reservedBy', '==', user.id),
        where('status', '==', 'reserved'),
        orderBy('number', 'asc')
      );

      const unsubscribe = onSnapshot(reservedQuery, (snapshot) => {
        const reservedNumbers = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as NumberPool[];

        // Apply same visibility rules as NumberPool
        setReservedNumbers(filterByVisibility(reservedNumbers));
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error setting up reserved numbers listener:', error);
    } finally {
      setLoading(false);
    }
  }, [user, selectedCategory, filterByVisibility]);

  // Search numbers with cache-first approach and ngram support
  const searchNumbers = useCallback(async (term: string) => {
    if (!term || term.length < MIN_SEARCH_LENGTH) {
      setNumbers(filterByVisibility(reservedNumbers));
      return;
    }

    setLoading(true);
    try {
      // 1) Try cache-first search with ngram support
      const exactCached = await searchCachedNumbersFast(term, selectedCategory, SEARCH_LIMIT);
      if (exactCached && exactCached.length > 0) {
        const isNumeric = /^\d+$/.test(term);
        const filteredResults = isNumeric
          ? exactCached.filter(n => n.number?.toString() === term || n.number?.toString().includes(term))
          : exactCached;
        
        // Filter by status and add status checks for G4/G5 numbers
        const statusFiltered = filteredResults.filter(n => 
          ['open', 'pending_verification', 'verified', 'assigned', 'reserved'].includes(n.status)
        );
        
        await addStatusChecks(filterByVisibility(statusFiltered));
        return;
      }

      // 2) Multi-token search from cache (e.g., "N garms" or partial numbers like "054 798")
      const tokens = term.split(/\s+/).filter(Boolean);
      if (tokens.length > 1) {
        const tokenResults = await searchCachedNumbersByTokens(tokens, selectedCategory, SEARCH_LIMIT);
        if (tokenResults && tokenResults.length > 0) {
          const statusFiltered = tokenResults.filter(n => 
            ['open', 'pending_verification', 'verified', 'assigned', 'reserved'].includes(n.status)
          );
          
          await addStatusChecks(filterByVisibility(statusFiltered));
          return;
        }

        // 2b) Firebase ngram search for multi-token searches
        try {
          const firebaseTokenResults = await searchFirebaseByTokens(tokens, selectedCategory);
          if (firebaseTokenResults && firebaseTokenResults.length > 0) {
            await addStatusChecks(filterByVisibility(firebaseTokenResults));
            return;
          }
        } catch (error) {
          console.error('Firebase token search error:', error);
        }
      }

      // 2c) Single token Firebase ngram search
      if (tokens.length === 1) {
        try {
          const firebaseSingleTokenResults = await searchFirebaseBySingleToken(tokens[0], selectedCategory);
          if (firebaseSingleTokenResults && firebaseSingleTokenResults.length > 0) {
            await addStatusChecks(filterByVisibility(firebaseSingleTokenResults));
            return;
          }
        } catch (error) {
          console.error('Firebase single token search error:', error);
        }
      }

      // 3) Fallback to Firestore search (original logic)
      const numbersQuery = query(
        collection(db, 'numberPool'),
        where('category', '==', selectedCategory),
        where('number', '>=', term),
        where('number', '<=', term + '\uf8ff'),
        where('status', 'in', ['open', 'pending_verification', 'verified', 'assigned', 'reserved']),
        orderBy('number', 'asc'),
        limit(SEARCH_LIMIT)
      );

      const unsubscribe = onSnapshot(numbersQuery, async (snapshot) => {
        const prefixResults = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as NumberPool[];

        // Secondary scan to support substring matching (contains term anywhere)
        const secondaryQuery = query(
          collection(db, 'numberPool'),
          where('category', '==', selectedCategory),
          where('status', 'in', ['open', 'pending_verification', 'verified', 'assigned', 'reserved']),
          orderBy('number', 'asc'),
          limit(SECONDARY_SCAN_LIMIT)
        );
        const secondarySnapshot = await getDocs(secondaryQuery);
        const secondaryAll = secondarySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as NumberPool[];
        const containsResults = secondaryAll.filter(n => n.number?.toString().includes(term));

        // Merge results (unique by id) and cap to SEARCH_LIMIT
        const mergedMap = new Map<string, NumberPool>();
        [...prefixResults, ...containsResults].forEach(n => {
          if (!mergedMap.has(n.id)) mergedMap.set(n.id, n);
        });
        const mergedList = Array.from(mergedMap.values()).slice(0, SEARCH_LIMIT);

        await addStatusChecks(filterByVisibility(mergedList));
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error setting up search listener:', error);
      setNumbers(filterByVisibility(reservedNumbers));
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, reservedNumbers, filterByVisibility]);

  // Helper function to add status checks for G4/G5 numbers
  const addStatusChecks = async (numbers: NumberPool[]) => {
    const g4g5Numbers = numbers.filter(n => n.group?.includes('G4') || n.group?.includes('G5'));
    if (g4g5Numbers.length > 0) {
      const statusChecksQuery = query(
        collection(db, 'statusChecks'),
        where('numberId', 'in', g4g5Numbers.map(n => n.id)),
        where('status', '==', 'available')
      );
      const statusChecksSnapshot = await getDocs(statusChecksQuery);
      const now = new Date();
      const availableChecks = new Set(
        statusChecksSnapshot.docs
          .filter(doc => {
            const data = doc.data();
            return data.expiresAt?.toDate() > now;
          })
          .map(doc => doc.data().numberId)
      );
      const numbersWithStatus = numbers.map(number => ({
        ...number,
        statusCheck: (number.group?.includes('G4') || number.group?.includes('G5')) && availableChecks.has(number.id)
          ? { status: 'available' as const }
          : undefined
      }));
      setNumbers(numbersWithStatus);
    } else {
      setNumbers(numbers);
    }
  };

  // Firebase ngram search for multiple tokens (AND logic)
  const searchFirebaseByTokens = async (tokens: string[], category: string): Promise<NumberPool[]> => {
    const baseQuery = query(
      collection(db, 'numberPool'),
      where('category', '==', category),
      where('status', 'in', ['open', 'pending_verification', 'verified', 'assigned', 'reserved']),
      where('numberTokens', 'array-contains-any', tokens),
      limit(SEARCH_LIMIT)
    );

    const snapshot = await getDocs(baseQuery);
    const results = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as NumberPool[];

    // Filter results to ensure ALL tokens are present (AND logic)
    return results.filter(number => {
      const numberTokens = number.numberTokens || [];
      return tokens.every(token => numberTokens.includes(token));
    });
  };

  // Firebase ngram search for single token
  const searchFirebaseBySingleToken = async (token: string, category: string): Promise<NumberPool[]> => {
    const baseQuery = query(
      collection(db, 'numberPool'),
      where('category', '==', category),
      where('status', 'in', ['open', 'pending_verification', 'verified', 'assigned', 'reserved']),
      where('numberTokens', 'array-contains', token),
      limit(SEARCH_LIMIT)
    );

    const snapshot = await getDocs(baseQuery);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as NumberPool[];
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    async function setupListener() {
      unsubscribe = await loadReservedNumbers();
    }

    setupListener();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [loadReservedNumbers]);

  // Trigger search when debounced search term changes
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    async function setupSearchListener() {
      if (debouncedSearch) {
        unsubscribe = await searchNumbers(debouncedSearch);
        return;
      }

      // No search term: show initial list for selected category up to INITIAL_LOAD_SIZE
      try {
        setLoading(true);
        const initialQuery = query(
          collection(db, 'numberPool'),
          where('category', '==', selectedCategory),
          where('status', 'in', ['open', 'pending_verification', 'verified', 'assigned', 'reserved']),
          orderBy('number', 'asc'),
          limit(INITIAL_LOAD_SIZE)
        );

        unsubscribe = onSnapshot(initialQuery, (snapshot) => {
          const availableRaw = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as NumberPool[];
          const available = filterByVisibility(availableRaw);
          // Combine: show user's reserved first, then fill with available non-duplicates up to INITIAL_LOAD_SIZE
          const combined: NumberPool[] = [];
          const seen = new Set<string>();
          for (const n of reservedNumbers) {
            if (!seen.has(n.id)) {
              combined.push(n);
              seen.add(n.id);
            }
          }
          for (const n of available) {
            if (combined.length >= INITIAL_LOAD_SIZE) break;
            if (!seen.has(n.id)) {
              combined.push(n);
              seen.add(n.id);
            }
          }
          setNumbers(combined);
          setLoading(false);
        }, () => {
          setLoading(false);
        });
      } catch {
        setNumbers(reservedNumbers);
        setLoading(false);
      }
    }

    setupSearchListener();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [debouncedSearch, searchNumbers, reservedNumbers, selectedCategory]);

  // Update the selection logic
  const isSelectable = (number: NumberPool) => {
    const isReservedByUser = number.status === 'reserved' && number.reservedBy === user?.id;
    const isOpen = number.status === 'open';
    const isG4OrG5 = number.group?.includes('G4') || number.group?.includes('G5');
    const hasAvailableStatusCheck = number.statusCheck?.status === 'available';

    // For G4 and G5 numbers, they must have an available status check regardless of reservation status
    if (isG4OrG5) {
      return hasAvailableStatusCheck && (isOpen || isReservedByUser);
    }

    // For other numbers, they just need to be open or reserved by the user
    return isOpen || isReservedByUser;
  };

  return (
    <div className="space-y-4">
      {/* Category Selection */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowCategories(!showCategories)}
          className="w-full flex items-center justify-between px-4 py-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50"
        >
          <span className="text-sm font-medium text-gray-700">{selectedCategory}</span>
          {showCategories ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
        </button>
        {showCategories && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
            {numberCategories.map(category => (
              <button
                key={category}
                type="button"
                onClick={() => {
                  onCategoryChange(category);
                  setShowCategories(false);
                }}
                className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50"
              >
                {category}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={`Enter at least ${MIN_SEARCH_LENGTH} digits to search`}
          className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
        />
      </div>

      {/* Numbers List */}
      <div className="h-[100px] overflow-y-auto space-y-2 bg-white rounded-lg border border-gray-200 p-4">
        {loading ? (
          <div className="text-center py-4 text-sm text-gray-500">
            {searchTerm ? 'Searching numbers...' : 'Loading numbers...'}
          </div>
        ) : searchTerm.length > 0 && searchTerm.length < MIN_SEARCH_LENGTH ? (
          <div className="text-center py-4 text-sm text-gray-500">
            Please enter at least {MIN_SEARCH_LENGTH} digits to search
          </div>
        ) : numbers.length > 0 ? (
          numbers.map((number) => {
            const selectable = isSelectable(number);
            const isG4OrG5 = number.group?.includes('G4') || number.group?.includes('G5');
            
            return (
              <button
                key={number.id}
                type="button"
                onClick={() => selectable ? onSelect(number) : null}
                disabled={!selectable}
                className={clsx(
                  "w-full p-3 text-left rounded-lg border transition-all",
                  selectable 
                    ? "hover:border-indigo-200 hover:bg-gray-50" 
                    : "opacity-50 cursor-not-allowed"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{number.number}</p>
                        <p className="text-sm text-gray-500">{number.category}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {isG4OrG5 && (
                      <span className={clsx(
                        "px-2.5 py-1 rounded-full text-xs font-medium",
                        number.statusCheck?.status === 'available'
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      )}>
                        {number.statusCheck?.status === 'available' ? 'Available' : 'Check with coordinator'}
                      </span>
                    )}
                    <span className={clsx(
                      "px-2.5 py-1 rounded-full text-xs font-medium",
                      number.status === 'open' ? "bg-emerald-100 text-emerald-800" :
                      number.status === 'reserved' ? "bg-amber-100 text-amber-800" :
                      number.status === 'pending_verification' ? "bg-blue-100 text-blue-800" :
                      number.status === 'verified' ? "bg-violet-100 text-violet-800" :
                      number.status === 'assigned' ? "bg-indigo-100 text-indigo-800" :
                      number.status === 'rejected' ? "bg-rose-100 text-rose-800" :
                      number.status === 'follow_up' ? "bg-orange-100 text-orange-800" :
                      "bg-gray-100 text-gray-800"
                    )}>
                      {number.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        ) : (
          <div className="text-center py-4">
            {searchTerm ? (
              <p className="text-sm text-gray-500">No numbers found matching your search</p>
            ) : (
              <p className="text-sm">
                <span className="text-gray-600">You don't have any number reserved from the </span>
                <span className="font-semibold text-indigo-600">{selectedCategory}</span>
                <span className="text-gray-600"> category</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 
