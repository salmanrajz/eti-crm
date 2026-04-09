import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, where, getDocs, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { NumberPool } from '../../types';
import { Search, CheckCircle2, Star, Loader2, MousePointerClick, ChevronDown } from 'lucide-react';
import { useDebounce } from '../../hooks/useDebounce';
import { clsx } from 'clsx';
import { useAuthStore } from '../../store/authStore';
import { searchCachedNumbersFast, searchCachedNumbersByTokens } from '../../utils/indexedDB';

interface QuickNumberSelectProps {
  onSelect: (number: NumberPool) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  selectedNumberId?: string;
}

const SEARCH_DEBOUNCE = 300;
const MIN_SEARCH_LENGTH = 3;
const SEARCH_LIMIT = 20;
const SECONDARY_SCAN_LIMIT = 200;

const numberCategories = ['Standard', 'Silver', 'Silver plus', 'Gold', 'Gold plus', 'Platinum'] as const;

const categoryColors: Record<string, string> = {
  Platinum:     'bg-purple-100 text-purple-800 border-purple-300',
  Gold:         'bg-yellow-100 text-yellow-800 border-yellow-300',
  'Gold plus':  'bg-amber-100  text-amber-800  border-amber-300',
  'Gold Plus':  'bg-amber-100  text-amber-800  border-amber-300',
  'Silver plus':'bg-sky-100    text-sky-800    border-sky-300',
  'Silver Plus':'bg-sky-100    text-sky-800    border-sky-300',
  Silver:       'bg-blue-100   text-blue-800   border-blue-300',
  Standard:     'bg-gray-100   text-gray-700   border-gray-300',
};

const statusColors: Record<string, string> = {
  open:                 'bg-emerald-100 text-emerald-700',
  reserved:             'bg-amber-100   text-amber-700',
  pending_verification: 'bg-blue-100    text-blue-700',
  verified:             'bg-violet-100  text-violet-700',
  assigned:             'bg-indigo-100  text-indigo-700',
};

export function QuickNumberSelect({
  onSelect,
  selectedCategory,
  onCategoryChange,
  selectedNumberId,
}: QuickNumberSelectProps) {
  const { user, isAdmin } = useAuthStore();
  const [numbers, setNumbers] = useState<NumberPool[]>([]);
  const [reservedNumbers, setReservedNumbers] = useState<NumberPool[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showingReserved, setShowingReserved] = useState(true);
  const debouncedSearch = useDebounce(searchTerm, SEARCH_DEBOUNCE);
  const inputRef = useRef<HTMLInputElement>(null);
  const agentAllowedGroups = user?.role === 'agent' && user?.allowedGroups?.length
    ? user.allowedGroups
    : null;

  const filterByVisibility = useCallback((list: NumberPool[]): NumberPool[] => {
    if (isAdmin() || user?.role === 'manager' || user?.role === 'coordinator') return list;
    if (user?.role === 'agent') {
      return list.filter(n => {
        if (n.status === 'activated') return false;
        if (agentAllowedGroups && !agentAllowedGroups.includes(n.group || '')) return false;
        if (user.teamId && n.teamVisibility && n.teamVisibility !== user.teamId) return false;
        return true;
      });
    }
    return list;
  }, [isAdmin, user?.role, user?.teamId, agentAllowedGroups]);

  const addStatusChecks = useCallback(async (list: NumberPool[]) => {
    const g4g5 = list.filter(n => n.group?.includes('G4') || n.group?.includes('G5'));
    if (g4g5.length === 0) { setNumbers(list); return; }

    const q = query(
      collection(db, 'statusChecks'),
      where('numberId', 'in', g4g5.map(n => n.id)),
      where('status', '==', 'available')
    );
    const snap = await getDocs(q);
    const now = new Date();
    const available = new Set(
      snap.docs
        .filter(d => d.data().expiresAt?.toDate() > now)
        .map(d => d.data().numberId)
    );
    setNumbers(list.map(n => ({
      ...n,
      statusCheck: (n.group?.includes('G4') || n.group?.includes('G5')) && available.has(n.id)
        ? { status: 'available' as const }
        : undefined,
    })));
  }, []);

  // Load ALL reserved numbers for this user across all categories — no category filter
  // so the Reserved tab is instant regardless of which category is active
  const loadReservedNumbers = useCallback(() => {
    if (!user) return;
    const q = query(
      collection(db, 'numberPool'),
      where('reservedBy', '==', user.id),
      where('status', '==', 'reserved'),
      orderBy('number', 'asc')
    );
    const unsub = onSnapshot(q, snap => {
      setReservedNumbers(filterByVisibility(
        snap.docs.map(d => ({ id: d.id, ...d.data() })) as NumberPool[]
      ));
    });
    return unsub;
  }, [user, filterByVisibility]);

  useEffect(() => {
    const unsub = loadReservedNumbers();
    return () => { unsub?.(); };
  }, [loadReservedNumbers]);

  const searchFirebaseByTokens = useCallback(async (tokens: string[], category?: string) => {
    const constraints: any[] = [
      where('status', 'in', ['open', 'pending_verification', 'verified', 'assigned', 'reserved']),
      where('numberTokens', 'array-contains-any', tokens),
      limit(SEARCH_LIMIT),
    ];
    if (category) constraints.unshift(where('category', '==', category));
    const snap = await getDocs(query(collection(db, 'numberPool'), ...constraints));
    const results = snap.docs.map(d => ({ id: d.id, ...d.data() })) as NumberPool[];
    return results.filter(n => {
      const t = (n as any).numberTokens || [];
      return tokens.every(tok => t.includes(tok));
    });
  }, []);

  const searchFirebaseBySingleToken = useCallback(async (token: string, category?: string) => {
    const constraints: any[] = [
      where('status', 'in', ['open', 'pending_verification', 'verified', 'assigned', 'reserved']),
      where('numberTokens', 'array-contains', token),
      limit(SEARCH_LIMIT),
    ];
    if (category) constraints.unshift(where('category', '==', category));
    const snap = await getDocs(query(collection(db, 'numberPool'), ...constraints));
    return snap.docs.map(d => ({ id: d.id, ...d.data() })) as NumberPool[];
  }, []);

  // When searching from Reserved tab, search across all categories (cat = undefined)
  const searchNumbers = useCallback(async (term: string) => {
    if (!term || term.length < MIN_SEARCH_LENGTH) {
      setNumbers([]);
      return;
    }
    setLoading(true);
    const cat = showingReserved ? undefined : selectedCategory;
    try {
      // 1) cache fast search
      const cached = await searchCachedNumbersFast(term, cat || '', SEARCH_LIMIT);
      if (cached?.length) {
        const isNum = /^\d+$/.test(term);
        let filtered = isNum
          ? cached.filter(n => n.number?.toString().includes(term))
          : cached;
        if (!cat) filtered = filtered; // all categories
        const statusFiltered = filtered.filter(n =>
          ['open', 'pending_verification', 'verified', 'assigned', 'reserved'].includes(n.status)
        );
        if (statusFiltered.length) {
          await addStatusChecks(filterByVisibility(statusFiltered));
          return;
        }
      }

      // 2) multi-token cache
      const tokens = term.split(/\s+/).filter(Boolean);
      if (tokens.length > 1) {
        const tokenResults = await searchCachedNumbersByTokens(tokens, cat || '', SEARCH_LIMIT);
        if (tokenResults?.length) {
          const sf = tokenResults.filter(n =>
            ['open', 'pending_verification', 'verified', 'assigned', 'reserved'].includes(n.status)
          );
          if (sf.length) { await addStatusChecks(filterByVisibility(sf)); return; }
        }
        const fbResults = await searchFirebaseByTokens(tokens, cat).catch(() => []);
        if (fbResults.length) { await addStatusChecks(filterByVisibility(fbResults)); return; }
      }

      // 3) single token firebase
      if (tokens.length === 1) {
        const singleToken = tokens[0];

        // Full-number searches with initials (for example 0569865000) should
        // hit an exact number lookup first instead of falling through to the
        // slower token/prefix path.
        if (/^0\d{9}$/.test(singleToken)) {
          const exactSnap = await getDocs(
            query(
              collection(db, 'numberPool'),
              where('number', '==', singleToken),
              limit(SEARCH_LIMIT)
            )
          ).catch(() => null);

          if (exactSnap && !exactSnap.empty) {
            const exactResults = (exactSnap.docs.map(d => ({ id: d.id, ...d.data() })) as NumberPool[])
              .filter(n =>
                (!cat || n.category === cat) &&
                ['open', 'pending_verification', 'verified', 'assigned', 'reserved'].includes(n.status)
              );

            if (exactResults.length) {
              await addStatusChecks(filterByVisibility(exactResults));
              return;
            }
          }
        }

        const singleResults = await searchFirebaseBySingleToken(singleToken, cat).catch(() => []);
        if (singleResults.length) { await addStatusChecks(filterByVisibility(singleResults)); return; }
      }

      // 4) fallback prefix + substring Firestore scan
      const prefixConstraints: any[] = [
        where('number', '>=', term),
        where('number', '<=', term + '\uf8ff'),
        where('status', 'in', ['open', 'pending_verification', 'verified', 'assigned', 'reserved']),
        orderBy('number', 'asc'),
        limit(SEARCH_LIMIT),
      ];
      if (cat) prefixConstraints.unshift(where('category', '==', cat));
      const secondaryConstraints: any[] = [
        where('status', 'in', ['open', 'pending_verification', 'verified', 'assigned', 'reserved']),
        orderBy('number', 'asc'),
        limit(SECONDARY_SCAN_LIMIT),
      ];
      if (cat) secondaryConstraints.unshift(where('category', '==', cat));

      const prefixSnap = await getDocs(query(collection(db, 'numberPool'), ...prefixConstraints));
      const secondarySnap = await getDocs(query(collection(db, 'numberPool'), ...secondaryConstraints));
      const prefix = prefixSnap.docs.map(d => ({ id: d.id, ...d.data() })) as NumberPool[];
      const contains = (secondarySnap.docs.map(d => ({ id: d.id, ...d.data() })) as NumberPool[])
        .filter(n => n.number?.toString().includes(term));
      const merged = new Map<string, NumberPool>();
      [...prefix, ...contains].forEach(n => { if (!merged.has(n.id)) merged.set(n.id, n); });
      await addStatusChecks(filterByVisibility(Array.from(merged.values()).slice(0, SEARCH_LIMIT)));
    } catch (err) {
      console.error('Search error:', err);
      setNumbers([]);
    } finally {
      setLoading(false);
    }
  }, [showingReserved, selectedCategory, filterByVisibility, addStatusChecks, searchFirebaseByTokens, searchFirebaseBySingleToken]);

  useEffect(() => {
    searchNumbers(debouncedSearch);
  }, [debouncedSearch, searchNumbers]);

  const isSelectable = (n: NumberPool) => {
    const reservedByMe = n.status === 'reserved' && n.reservedBy === user?.id;
    const isOpen = n.status === 'open';
    const isG4G5 = n.group?.includes('G4') || n.group?.includes('G5');
    if (isG4G5) return n.statusCheck?.status === 'available' && (isOpen || reservedByMe);
    return isOpen || reservedByMe;
  };

  const isSearching = searchTerm.length >= MIN_SEARCH_LENGTH;
  const displayNumbers = isSearching ? numbers : [];

  // Filter reserved numbers by search term when actively searching
  const filteredReserved = isSearching
    ? reservedNumbers.filter(n => n.number?.toString().includes(searchTerm.replace(/\D/g, '')))
    : reservedNumbers;

  return (
    <div className="space-y-3">
      {/* ── Desktop: grid pills ── */}
      <div className="hidden sm:grid grid-cols-4 gap-1.5">
        <button
          type="button"
          onClick={() => { setShowingReserved(true); setSearchTerm(''); }}
          className={clsx(
            'w-full px-2 py-1.5 text-xs font-medium rounded-lg border transition-all flex items-center justify-center gap-1',
            showingReserved
              ? 'bg-amber-100 text-amber-800 border-amber-300 shadow-sm'
              : 'bg-white text-gray-500 border-gray-200 hover:border-amber-300 hover:text-amber-700'
          )}
        >
          <Star className={clsx('h-3 w-3', showingReserved ? 'fill-amber-500 text-amber-500' : 'text-gray-400')} />
          Reserved
          {reservedNumbers.length > 0 && (
            <span className={clsx(
              'ml-0.5 px-1.5 py-0 rounded-full text-[10px] font-bold',
              showingReserved ? 'bg-amber-200 text-amber-900' : 'bg-gray-100 text-gray-500'
            )}>
              {reservedNumbers.length}
            </span>
          )}
        </button>
        {numberCategories.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => { setShowingReserved(false); onCategoryChange(cat); setSearchTerm(''); }}
            className={clsx(
              'w-full px-2 py-1.5 text-xs font-medium rounded-lg border transition-all text-center',
              !showingReserved && selectedCategory === cat
                ? (categoryColors[cat] ?? 'bg-indigo-100 text-indigo-700 border-indigo-300') + ' shadow-sm'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* ── Mobile: Reserved toggle + category dropdown ── */}
      <div className="flex sm:hidden items-center gap-2">
        <button
          type="button"
          onClick={() => { setShowingReserved(true); setSearchTerm(''); }}
          className={clsx(
            'flex-shrink-0 px-3 py-2 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5',
            showingReserved
              ? 'bg-amber-100 text-amber-800 border-amber-300 shadow-sm'
              : 'bg-white text-gray-500 border-gray-200 active:border-amber-300'
          )}
        >
          <Star className={clsx('h-3.5 w-3.5', showingReserved ? 'fill-amber-500 text-amber-500' : 'text-gray-400')} />
          Reserved
          {reservedNumbers.length > 0 && (
            <span className={clsx(
              'px-1.5 py-0 rounded-full text-[10px] font-bold',
              showingReserved ? 'bg-amber-200 text-amber-900' : 'bg-gray-100 text-gray-500'
            )}>
              {reservedNumbers.length}
            </span>
          )}
        </button>

        <div className="relative flex-1">
          <select
            value={showingReserved ? '' : selectedCategory}
            onChange={(e) => {
              if (e.target.value) {
                setShowingReserved(false);
                onCategoryChange(e.target.value);
                setSearchTerm('');
              }
            }}
            className={clsx(
              'w-full appearance-none pl-3 pr-8 py-2 text-xs font-semibold rounded-lg border transition-all',
              !showingReserved
                ? (categoryColors[selectedCategory] ?? 'bg-indigo-100 text-indigo-700 border-indigo-300') + ' shadow-sm'
                : 'bg-white text-gray-500 border-gray-200'
            )}
          >
            <option value="" disabled>Select Category</option>
            {numberCategories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* ── Search input — always visible ── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder={showingReserved ? "Search across all categories…" : `Search ${selectedCategory} numbers…`}
          className="w-full pl-9 pr-9 py-2.5 text-sm border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white transition"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-500 animate-spin" />
        )}
        {searchTerm && !loading && (
          <button
            type="button"
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 hover:text-gray-600 transition"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Content area ── */}
      {searchTerm && searchTerm.length < MIN_SEARCH_LENGTH ? (
        <p className="text-sm text-gray-400 text-center py-4">
          Keep typing… {MIN_SEARCH_LENGTH - searchTerm.length} more digit{MIN_SEARCH_LENGTH - searchTerm.length !== 1 ? 's' : ''} needed
        </p>
      ) : isSearching ? (
        /* Search results — across all categories when on Reserved tab */
        <div>
          {loading ? null : (displayNumbers.length > 0 || filteredReserved.length > 0) ? (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
              {filteredReserved.map(n => (
                <NumberRow
                  key={n.id}
                  number={n}
                  selected={selectedNumberId === n.id}
                  selectable={isSelectable(n)}
                  isReservedByMe
                  onSelect={onSelect}
                />
              ))}
              {displayNumbers.filter(n => !filteredReserved.some(r => r.id === n.id)).map(n => (
                <NumberRow
                  key={n.id}
                  number={n}
                  selected={selectedNumberId === n.id}
                  selectable={isSelectable(n)}
                  isReservedByMe={n.status === 'reserved' && n.reservedBy === user?.id}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">No numbers found</p>
          )}
        </div>
      ) : showingReserved ? (
        /* Reserved tab — no search active */
        <div>
          {reservedNumbers.length > 0 ? (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
              <div className="flex items-center gap-2 px-2.5 py-1.5 mb-1 bg-indigo-50 border border-indigo-200 rounded-lg shadow-sm animate-pulse-ring">
                <MousePointerClick className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0 animate-bounce" />
                <span className="text-xs font-semibold text-indigo-600 tracking-wide animate-typewriter">Tap a number below to select it</span>
              </div>
              {reservedNumbers.map(n => (
                <NumberRow
                  key={n.id}
                  number={n}
                  selected={selectedNumberId === n.id}
                  selectable={isSelectable(n)}
                  isReservedByMe
                  onSelect={onSelect}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 py-6 text-center">
              <Star className="h-6 w-6 text-gray-300" />
              <p className="text-sm text-gray-400">You have no reserved numbers</p>
            </div>
          )}
        </div>
      ) : (
        /* Category tab — no search active: show prompt */
        <div>
          <div className="flex flex-col items-center gap-1.5 py-6 text-center">
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center">
              <Search className="h-5 w-5 text-indigo-400" />
            </div>
            <p className="text-sm text-gray-500">Search the <span className="font-medium text-indigo-600">{selectedCategory}</span> pool</p>
            <p className="text-xs text-gray-400">Enter at least 3 digits to see matching numbers</p>
          </div>
        </div>
      )}

    </div>
  );
}

function NumberRow({
  number: n,
  selected,
  selectable,
  isReservedByMe,
  onSelect,
}: {
  number: NumberPool;
  selected: boolean;
  selectable: boolean;
  isReservedByMe: boolean;
  onSelect: (n: NumberPool) => void;
}) {
  const isG4G5 = n.group?.includes('G4') || n.group?.includes('G5');

  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={() => selectable && onSelect(n)}
      className={clsx(
        'w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-all',
        selected
          ? 'border-indigo-400 bg-indigo-50 shadow-sm'
          : selectable
          ? 'border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40'
          : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
      )}
    >
      {/* Left: number + category */}
      <div className="flex items-center gap-2.5 min-w-0">
        {selected
          ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-indigo-600" />
          : isReservedByMe
          ? <Star className="h-4 w-4 flex-shrink-0 fill-amber-400 text-amber-400" />
          : <div className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-gray-300" />
        }
        <div className="min-w-0">
          <p className={clsx('text-sm font-semibold truncate', selected ? 'text-indigo-900' : 'text-gray-900')}>
            {n.number}
          </p>
          <p className="text-xs text-gray-400">{n.category}</p>
        </div>
      </div>

      {/* Right: badges */}
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
        {isG4G5 && (
          <span className={clsx(
            'px-2 py-0.5 rounded-full text-xs font-medium',
            n.statusCheck?.status === 'available'
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-orange-100 text-orange-700'
          )}>
            {n.statusCheck?.status === 'available' ? 'Avail.' : 'Ask coord.'}
          </span>
        )}
        <span className={clsx(
          'px-2 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide',
          statusColors[n.status] ?? 'bg-gray-100 text-gray-600'
        )}>
          {n.status === 'pending_verification' ? 'Pending' : n.status}
        </span>
        {selected && (
          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-600 text-white">
            ✓
          </span>
        )}
      </div>
    </button>
  );
}
