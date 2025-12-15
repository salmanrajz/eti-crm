/**
 * ===============================================================================
 * NUMBER SELECT COMPONENT - NUMBER POOL SELECTION INTERFACE
 * ===============================================================================
 * 
 * This component provides a searchable interface for selecting phone numbers
 * from the number pool. It features real-time search, caching optimization,
 * and status filtering for efficient number selection workflows.
 * 
 * FEATURES:
 * 
 * 1. REAL-TIME NUMBER SEARCH
 *    - Debounced search functionality with optimized performance
 *    - Number and code-based search capabilities
 *    - Real-time updates via Firestore snapshot listeners
 * 
 * 2. CACHING AND PERFORMANCE OPTIMIZATION
 *    - IndexedDB caching for offline and fast access
 *    - Initial load size optimization for responsive UI
 *    - Efficient query limiting and result pagination
 * 
 * 3. STATUS AND CATEGORY FILTERING
 *    - Filtering by number availability status (open, pending, verified, assigned)
 *    - Category-based filtering for different number types
 *    - Group-specific status checking for G4 and G5 numbers
 * 
 * 4. USER EXPERIENCE
 *    - Search suggestions with limited results for performance
 *    - Visual feedback for loading states and selections
 *    - Integration with existing number editing workflows
 * 
 * USAGE:
 * This component is used in lead creation and editing forms to provide
 * agents with an efficient interface for selecting available phone numbers
 * from the number pool based on category and availability.
 * ===============================================================================
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, query, where, getDocs, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { NumberPool } from '../../types';
import { Search, Tag } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';
import { getCachedNumbers, cacheNumbers } from '../../utils/indexedDB';
import { clsx } from 'clsx';
import { useAuthStore } from '../../store/authStore';

interface NumberSelectProps {
  value: string;
  onChange: (value: string, number: NumberPool | null) => void;
  numberType: string;
  existingNumberId?: string;
  isEditing?: boolean;
}

const INITIAL_LOAD_SIZE = 50;
const SEARCH_DEBOUNCE = 150;

export function NumberSelect({ value, onChange, numberType, existingNumberId, isEditing }: NumberSelectProps) {
  const [numbers, setNumbers] = useState<NumberPool[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, SEARCH_DEBOUNCE);
  const { user, isAdmin } = useAuthStore();
  const agentAllowedGroups = user?.role === 'agent' && user?.allowedGroups?.length ? user.allowedGroups : null;

  const applyAllowedGroups = useCallback((list: NumberPool[]) => {
    if (agentAllowedGroups && agentAllowedGroups.length > 0) {
      return list.filter(n => agentAllowedGroups.includes(n.group || ''));
    }
    return list;
  }, [agentAllowedGroups]);

  // Optimize search with useCallback
  const searchNumbers = useCallback((list: NumberPool[], term: string) => {
    const numbers = applyAllowedGroups(list);
    if (!term) return numbers.slice(0, 3);
    const searchLower = term.toLowerCase();
    return numbers
      .filter(n => 
        n.number.toLowerCase().includes(searchLower) ||
        n.code.toLowerCase().includes(searchLower)
      )
      .slice(0, 3);
  }, []);

  // Memoize filtered numbers
  const filteredNumbers = useMemo(() => {
    return searchNumbers(numbers, debouncedSearch);
  }, [numbers, debouncedSearch, searchNumbers]);

  // Optimize number loading
  useEffect(() => {
    let unsubscribe: () => void;

    async function setupListener() {
    setLoading(true);
    try {
      // Try to get numbers from cache first
      const cachedNumbers = await getCachedNumbers(numberType, INITIAL_LOAD_SIZE);
      if (cachedNumbers) {
        const cachedList = Array.isArray(cachedNumbers) ? cachedNumbers : (cachedNumbers as any).numbers;
        setNumbers(applyAllowedGroups(cachedList || []));
      }

        // Set up real-time listener
      // For admins editing, include 'activated' status numbers
      const statusList = isAdmin() && isEditing 
        ? ['open', 'pending_verification', 'verified', 'assigned', 'activated']
        : ['open', 'pending_verification', 'verified', 'assigned'];
      const constraints: any[] = [
        where('status', 'in', statusList),
        where('category', '==', numberType),
      ];
      if (agentAllowedGroups && agentAllowedGroups.length === 1) {
        constraints.push(where('group', '==', agentAllowedGroups[0]));
      } else if (agentAllowedGroups && agentAllowedGroups.length > 1) {
        constraints.push(where('group', 'in', agentAllowedGroups.slice(0, 10)));
      }
      constraints.push(orderBy('number', 'asc'));
      constraints.push(limit(INITIAL_LOAD_SIZE));

      const numbersQuery = query(
        collection(db, 'numberPool'),
        ...(constraints as any)
      );

        unsubscribe = onSnapshot(numbersQuery, async (snapshot) => {
      const availableNumbers = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as NumberPool[];

      const allowedFiltered = applyAllowedGroups(availableNumbers);

      // Get status checks for G4 and G5 numbers
      const g4g5Numbers = allowedFiltered.filter(n => n.group?.includes('G4') || n.group?.includes('G5'));
      if (g4g5Numbers.length > 0) {
        const statusChecksQuery = query(
          collection(db, 'statusChecks'),
          where('numberId', 'in', g4g5Numbers.map(n => n.id)),
          where('status', '==', 'available')
        );
        
        const statusChecksSnapshot = await getDocs(statusChecksQuery);
        const now = new Date();
        
        // Filter out expired status checks
        const availableChecks = new Set(
          statusChecksSnapshot.docs
            .filter(doc => {
              const data = doc.data();
              return data.expiresAt?.toDate() > now;
            })
            .map(doc => doc.data().numberId)
        );
        
        // Add status check info to the numbers
        const numbersWithStatus = allowedFiltered.map(number => ({
          ...number,
          statusCheck: (number.group?.includes('G4') || number.group?.includes('G5')) && availableChecks.has(number.id)
            ? { status: 'available' as const }
            : undefined
        }));
        
        // Cache the fetched numbers
        cacheNumbers(numbersWithStatus, numberType);
        setNumbers(applyAllowedGroups(numbersWithStatus));
      } else {
        // Cache the fetched numbers
        cacheNumbers(allowedFiltered, numberType);
        setNumbers(applyAllowedGroups(allowedFiltered));
      }
        });
    } catch (error) {
        console.error('Error setting up number select listener:', error);
    } finally {
      setLoading(false);
    }
  }

    setupListener();

    // Cleanup listener on unmount
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [agentAllowedGroups, numberType]);

  // Check if a number is selectable
  const isSelectable = (number: NumberPool) => {
    const isG4OrG5 = number.group?.includes('G4') || number.group?.includes('G5');
    const hasAvailableStatusCheck = number.statusCheck?.status === 'available';

    // For G4 and G5 numbers, they must have an available status check
    if (isG4OrG5) {
      return hasAvailableStatusCheck;
    }

    // For admins editing, allow selection of activated numbers
    if (isAdmin() && isEditing && number.status === 'activated') {
      return true;
    }

    // For other numbers, they are selectable if they're in the available list
    return true;
  };

  return (
    <div className="form-field">
      <label className="form-label">
        Select Number
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search numbers..."
          className="form-input"
        />
      </div>

      {loading ? (
        <div className="mt-2 text-sm text-gray-500">Loading numbers...</div>
      ) : filteredNumbers.length > 0 ? (
        <div className="mt-2 space-y-2">
          {filteredNumbers.map((number) => {
            const selectable = isSelectable(number);
            const isG4OrG5 = number.group?.includes('G4') || number.group?.includes('G5');
            
            return (
              <button
                key={number.id}
                type="button"
                onClick={() => {
                  if (selectable) {
                    onChange(number.number, number);
                    setSearchTerm('');
                  }
                }}
                disabled={!selectable}
                className={clsx(
                  "w-full p-3 text-left rounded-lg border transition-all",
                  value === number.number
                    ? "border-indigo-500 bg-indigo-50"
                    : selectable
                    ? "border-gray-200 hover:border-indigo-200 hover:bg-gray-50"
                    : "border-gray-200 opacity-50 cursor-not-allowed"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <span className="text-sm font-medium text-gray-900">{number.number}</span>
                    {isG4OrG5 && (
                      <span className={clsx(
                        "ml-2 px-2 py-1 rounded-full text-xs font-medium",
                        number.statusCheck?.status === 'available'
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-amber-100 text-amber-800"
                      )}>
                        {number.statusCheck?.status === 'available' ? 'Available' : 'Check with coordinator'}
                      </span>
                    )}
                    {isAdmin() && isEditing && number.status === 'activated' && (
                      <span className="ml-2 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                        Active
                      </span>
                    )}
                  </div>
                  <span className={clsx(
                    "px-2 py-1 rounded-full text-xs font-medium inline-flex items-center",
                    number.category === 'Platinum' ? 'bg-purple-100 text-purple-800' :
                    number.category === 'Gold' ? 'bg-yellow-100 text-yellow-800' :
                    number.category === 'Gold Plus' ? 'bg-amber-100 text-amber-800' :
                    number.category === 'Silver Plus' ? 'bg-blue-200 text-blue-800' :
                    number.category === 'Silver' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  )}>
                    <Tag className="h-3 w-3 mr-1" />
                    {number.category}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-500">Code: {number.code}</div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-2 text-sm text-gray-500">No numbers available</div>
      )}
    </div>
  );
}