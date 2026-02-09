/**
 * ===============================================================================
 * CUSTOMER PORTAL - PUBLIC CUSTOMER-FACING INTERFACE
 * ===============================================================================
 *
 * Premium customer portal where customers can:
 * - Search and select numbers from specified groups
 * - Select plans
 * - Enter customer details
 * - Submit lead information
 *
 * ===============================================================================
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, updateDoc, collection, addDoc, query, where, getDocs, limit, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AgentLink, NumberPool, Plan, Lead } from '../types';
import { SmartPagination } from '../utils/smartPagination';
import { unifiedSearch } from '../utils/unifiedSearch';
import { getPlans } from '../utils/planService';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Phone,
  CheckCircle,
  Loader2,
  ArrowRight,
  ChevronLeft,
  Shield,
  Zap,
  X,
  Smartphone,
  Check,
  ShoppingCart,
  AlertCircle,
  Key,
  Lock,
  Sparkles
} from 'lucide-react';
import { countryList } from '../utils/countries';
import clsx from 'clsx';
import { useDebounce } from '../hooks/useDebounce';

const uaeEmirates = [
  'Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'
];

interface SelectedNumber {
  numberId: string;
  number: string;
  plan: string;
  category: string;
  group?: string;
}

export function CustomerPortal() {
  const { linkId } = useParams<{ linkId: string }>();
  const navigate = useNavigate();

  const [agentLink, setAgentLink] = useState<AgentLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [enteredOTP, setEnteredOTP] = useState('');
  const [otpError, setOtpError] = useState('');
  const [step, setStep] = useState<'phone' | 'pool' | 'search' | 'plans' | 'details' | 'success'>('phone');

  // Trusted customers: pool numbers (same SmartPagination as NumberPool)
  const [poolNumbers, setPoolNumbers] = useState<NumberPool[]>([]);
  const [poolLoading, setPoolLoading] = useState(false);
  const [poolPage, setPoolPage] = useState(1);
  const [poolPageSize, setPoolPageSize] = useState(20);
  const [poolTotalPages, setPoolTotalPages] = useState(1);
  const [poolTotalItems, setPoolTotalItems] = useState(0);
  const poolPaginationRef = useRef<SmartPagination<NumberPool> | null>(null);
  const [poolSearchTerm, setPoolSearchTerm] = useState('');
  const [poolSearchResults, setPoolSearchResults] = useState<NumberPool[]>([]);
  const [poolSearching, setPoolSearching] = useState(false);

  const [enteredPhone, setEnteredPhone] = useState('');
  const [similarNumbers, setSimilarNumbers] = useState<NumberPool[]>([]);
  const [isLoadingSimilar, setIsLoadingSimilar] = useState(false);
  const [similarHasMore, setSimilarHasMore] = useState(false);
  const [similarLastDoc, setSimilarLastDoc] = useState<any>(null);
  const [isShowingFallback, setIsShowingFallback] = useState(false);
  const [fallbackMessage, setFallbackMessage] = useState('');
  const [fallbackPattern, setFallbackPattern] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<NumberPool[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLastDoc, setSearchLastDoc] = useState<any>(null);
  const [showingMostMatching, setShowingMostMatching] = useState(false);
  const [selectedNumbers, setSelectedNumbers] = useState<SelectedNumber[]>([]);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlans, setSelectedPlans] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    customerNumber: '',
    customerAddress: '',
    country: 'AE',
    customerAge: '',
    gender: '',
    emirate: '',
    area: '',
    nationality: '',
    language: 'English',
    hasEmirateId: false,
    advancePayment: false,
  });

  // Trusted customers: after OTP, go directly to pool (skip phone step)
  useEffect(() => {
    if (otpVerified && agentLink?.trustedCustomers) {
      setStep('pool');
    }
  }, [otpVerified, agentLink?.trustedCustomers]);

  // Pool filters key - recreate SmartPagination when this changes
  const poolFiltersKey = agentLink
    ? `${agentLink.allowedGroups?.join(',')}|${(agentLink.allowedCategories?.length ? agentLink.allowedCategories : ['Standard', 'Silver', 'Silver plus', 'Gold', 'Gold plus', 'Platinum']).join(',')}|${poolPageSize}`
    : '';

  // Load pool numbers using SmartPagination (same as NumberPool)
  const loadPoolNumbers = useCallback(async (page: number = 1) => {
    if (!agentLink) return;
    setPoolLoading(true);
    try {
      const groups = agentLink.allowedGroups.slice(0, 10);
      const rawCategories = (agentLink.allowedCategories && agentLink.allowedCategories.length > 0)
        ? agentLink.allowedCategories
        : ['Standard', 'Silver', 'Silver plus', 'Gold', 'Gold plus', 'Platinum'];
      // Normalize to DB format: "Silver Plus" -> "Silver plus", "Gold Plus" -> "Gold plus"
      const categories = rawCategories.map(normalizeCategoryForQuery);

      // Create SmartPagination instance (same as NumberPool) - recreate when filtersKey changes
      if (!poolPaginationRef.current) {
        const filters: Array<{ field: string; operator: '==' | 'in'; value: unknown }> = [
          { field: 'status', operator: '==', value: 'open' },
          { field: 'group', operator: 'in', value: groups },
        ];
        if (categories.length > 0) {
          filters.push({ field: 'category', operator: 'in', value: categories.slice(0, 10) });
        }
        poolPaginationRef.current = new SmartPagination<NumberPool>('numberPool', {
          pageSize: poolPageSize,
          orderBy: 'number',
          orderDirection: 'asc',
          filters,
        });
      }

      const result = await poolPaginationRef.current.loadPage(page);

      const pageData = result.data.map(d => ({
        ...d,
        createdAt: (d.createdAt as any)?.toDate?.() || d.createdAt,
      })) as NumberPool[];

      setPoolNumbers(pageData);
      setPoolTotalItems(poolPaginationRef.current.getTotalItems());
      setPoolTotalPages(poolPaginationRef.current.getTotalPages());
    } catch (err: any) {
      console.error('Pool load error:', err);
      toast.error('Failed to load numbers');
      setPoolNumbers([]);
      setPoolTotalItems(0);
      setPoolTotalPages(1);
    } finally {
      setPoolLoading(false);
    }
  }, [agentLink, poolPageSize]);

  // Recreate pagination when filters or page size change
  useEffect(() => {
    poolPaginationRef.current = null;
  }, [poolFiltersKey]);

  useEffect(() => {
    if (step === 'pool' && agentLink?.trustedCustomers) {
      loadPoolNumbers(poolPage);
    }
  }, [step, poolPage, agentLink?.trustedCustomers, loadPoolNumbers]);

  // Pool search: when user types in search bar, search across allowed groups/categories
  const debouncedPoolSearch = useDebounce(poolSearchTerm, 300);
  useEffect(() => {
    if (step !== 'pool' || !agentLink?.trustedCustomers) return;
    if (!debouncedPoolSearch.trim()) {
      setPoolSearchResults([]);
      setPoolSearching(false);
      return;
    }
    const runPoolSearch = async () => {
      setPoolSearching(true);
      try {
        let allResults: NumberPool[] = [];
        if (agentLink.allowedCategories && agentLink.allowedCategories.length > 0) {
          const categoryPromises = agentLink.allowedCategories.map(async (cat) => {
            const normalized = normalizeCategoryForQuery(cat);
            const result = await unifiedSearch.search(debouncedPoolSearch, {
              category: normalized,
              limit: 500,
              statusFilter: 'open',
            });
            return result;
          });
          const categoryResults = await Promise.all(categoryPromises);
          categoryResults.forEach((r) => allResults.push(...r.data));
          const uniqueMap = new Map<string, NumberPool>();
          allResults.forEach((n) => uniqueMap.set(n.id, n));
          allResults = Array.from(uniqueMap.values());
        } else {
          const result = await unifiedSearch.search(debouncedPoolSearch, {
            category: 'all',
            limit: 500,
            statusFilter: 'open',
          });
          allResults = result.data;
        }
        const filtered = allResults.filter((n) =>
          agentLink.allowedGroups.includes(n.group || 'Standard') && n.status === 'open'
        );
        setPoolSearchResults(filtered);
      } catch (err) {
        console.error('Pool search error:', err);
        toast.error('Search failed');
        setPoolSearchResults([]);
      } finally {
        setPoolSearching(false);
      }
    };
    runPoolSearch();
  }, [debouncedPoolSearch, step, agentLink]);

  // Check for existing OTP session on mount
  useEffect(() => {
    if (linkId) {
      const sessionKey = `otp_session_${linkId}`;
      const sessionData = sessionStorage.getItem(sessionKey);
      
      if (sessionData) {
        try {
          const { verified, timestamp } = JSON.parse(sessionData);
          // Check if session is still valid (24 hours)
          const sessionAge = Date.now() - timestamp;
          const twentyFourHours = 24 * 60 * 60 * 1000;
          
          if (verified && sessionAge < twentyFourHours) {
            setOtpVerified(true);
          } else {
            // Session expired, clear it
            sessionStorage.removeItem(sessionKey);
          }
        } catch (error) {
          console.error('Error parsing session data:', error);
          sessionStorage.removeItem(sessionKey);
        }
      }
    }
  }, [linkId]);

  useEffect(() => {
    loadAgentLink();
    loadPlans();
  }, [linkId]);

  const loadAgentLink = async () => {
    if (!linkId) {
      toast.error('Invalid link');
      navigate('/');
      return;
    }

    try {
      const q = query(
        collection(db, 'agentLinks'),
        where('linkId', '==', linkId),
        limit(1)
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        toast.error('Link not found or expired');
        navigate('/');
        return;
      }

      const linkDoc = snapshot.docs[0];
      const linkData = {
        id: linkDoc.id,
        ...linkDoc.data(),
        createdAt: linkDoc.data().createdAt?.toDate() || new Date(),
        updatedAt: linkDoc.data().updatedAt?.toDate() || new Date(),
        expiresAt: linkDoc.data().expiresAt?.toDate() || undefined,
        otpExpiresAt: linkDoc.data().otpExpiresAt?.toDate() || undefined,
        lastUsedAt: linkDoc.data().lastUsedAt?.toDate() || undefined,
        usageCount: linkDoc.data().usageCount || 0,
      } as AgentLink;

      if (!linkData.isActive) {
        toast.error('This link is no longer active');
        navigate('/');
        return;
      }

      // Track link access with IP and location (silently)
      try {
        // Get IP address and location
        let ipAddress = 'Unknown';
        let location = {
          country: 'Unknown',
          region: 'Unknown',
          city: 'Unknown',
          timezone: 'Unknown',
          latitude: null as number | null,
          longitude: null as number | null,
        };

        try {
          // Use ip-api.com for IP and location (CORS-friendly, no key required, 45 requests/minute)
          // This service supports CORS and works from any origin
          const ipResponse = await fetch('http://ip-api.com/json/?fields=status,message,country,regionName,city,timezone,lat,lon,query', {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
            },
          });
          
          if (ipResponse.ok) {
            const ipData = await ipResponse.json();
            if (ipData.status === 'success') {
              ipAddress = ipData.query || 'Unknown';
              location = {
                country: ipData.country || 'Unknown',
                region: ipData.regionName || 'Unknown',
                city: ipData.city || 'Unknown',
                timezone: ipData.timezone || 'Unknown',
                latitude: ipData.lat || null,
                longitude: ipData.lon || null,
              };
            }
          }
        } catch (ipError) {
          // Silent fail - don't block user if IP/location fetch fails
          // CORS errors or network issues won't prevent the portal from loading
        }

        // Store access analytics in linkAccessLogs subcollection
        const linkDocRef = doc(db, 'agentLinks', linkDoc.id);
        const accessLogData = {
          accessedAt: serverTimestamp(),
          ipAddress,
          location,
          userAgent: navigator.userAgent || 'Unknown',
          referrer: document.referrer || 'Direct',
          linkId: linkId,
        };

        await addDoc(collection(linkDocRef, 'linkAccessLogs'), accessLogData);

        // Increment usage count when link is accessed (track views)
        const newUsageCount = (linkData.usageCount || 0) + 1;
        await updateDoc(doc(db, 'agentLinks', linkDoc.id), {
          usageCount: newUsageCount,
          lastUsedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        // Update local state to reflect the new count
        linkData.usageCount = newUsageCount;
        linkData.lastUsedAt = new Date();
      } catch (error) {
        // Silent fail - don't block the user if tracking fails
      }

      // Check if OTP is required
      if (linkData.otp) {
        // OTP is required, check sessionStorage for existing verification
        const sessionKey = `otp_session_${linkId}`;
        const sessionData = sessionStorage.getItem(sessionKey);
        
        if (sessionData) {
          try {
            const { verified, timestamp } = JSON.parse(sessionData);
            // Check if session is still valid (24 hours)
            const sessionAge = Date.now() - timestamp;
            const twentyFourHours = 24 * 60 * 60 * 1000;
            
            if (verified && sessionAge < twentyFourHours) {
              setOtpVerified(true);
            } else {
              // Session expired, clear it
              sessionStorage.removeItem(sessionKey);
            }
          } catch (error) {
            console.error('Error parsing session data:', error);
            sessionStorage.removeItem(sessionKey);
          }
        }
        // If no valid session, otpVerified remains false
        setAgentLink(linkData);
      } else {
        // No OTP required, allow access
        setAgentLink(linkData);
        setOtpVerified(true);
      }
    } catch (error) {
      console.error('Error loading link:', error);
      toast.error('Failed to load portal');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const loadPlans = async () => {
    try {
      const plansData = await getPlans();
      setPlans(plansData.filter(p => p.isActive));
    } catch (error) {
      console.error('Error loading plans:', error);
    }
  };

  // Helper function to normalize category names for Firestore queries
  // Database uses "Silver plus" (lowercase p), but links might have "Silver Plus" (uppercase P)
  // Normalize to database format: "Silver plus", "Gold plus"
  const normalizeCategoryForQuery = (category: string): string => {
    const normalized = category.trim();
    const lower = normalized.toLowerCase();
    // Map to database format (lowercase 'p' in "plus")
    if (lower === 'silver plus' || lower === 'silverplus') return 'Silver plus';
    if (lower === 'gold plus' || lower === 'goldplus') return 'Gold plus';
    // For other categories, preserve original case (Standard, Silver, Gold, Platinum)
    return normalized;
  };

  const findSimilarNumbers = useCallback(async (phone: string) => {
    if (!phone.trim() || !agentLink) return;

    setIsSearching(true);
    setIsShowingFallback(false);
    setFallbackMessage('');
    setFallbackPattern('');
    try {
      const searchDigits = phone.replace(/\D/g, '');
      if (searchDigits.length < 3 || searchDigits.length > 5) {
        toast.error('Please enter 3 to 5 digits');
        return;
      }

      // Extract 3-digit tokens from the search digits for efficient Firebase querying
      // Use sliding window to get all possible 3-digit tokens
      const tokens: string[] = [];
      if (searchDigits.length >= 3) {
        for (let i = 0; i <= searchDigits.length - 3; i++) {
          tokens.push(searchDigits.substring(i, i + 3));
        }
      }

      // Use the last token (usually less common, better for query performance)
      // For "12345", tokens would be: ["123", "234", "345"] - use "345" (less common)
      const searchToken = tokens.length > 0 ? tokens[tokens.length - 1] : searchDigits.slice(-3);

      const results: NumberPool[] = [];
      const seenIds = new Set<string>();

      // Query Firestore using array-contains on numberTokens for fast search
      try {
        const q = query(
          collection(db, 'numberPool'),
          where('status', '==', 'open'),
          where('numberTokens', 'array-contains', searchToken),
          orderBy('number'),
          limit(5000) // Fetch more to show all matching results
        );

        const snapshot = await getDocs(q);

        snapshot.docs.forEach(doc => {
          const numData = {
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
            updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt,
          } as NumberPool;

          // Check if number contains the entered digits anywhere (substring match)
          const numberDigits = (numData.number || '').replace(/\D/g, '');
          // Strict check: number must contain the exact search digits
          if (numberDigits.includes(searchDigits) && !seenIds.has(numData.id)) {
            seenIds.add(numData.id);
            results.push(numData);
          }
        });
      } catch (error: any) {
        console.error('Token query error:', error);
        // Fallback: try with other tokens if first one fails
        if (tokens.length > 1) {
          try {
            const fallbackToken = tokens[0]; // Try first token
            const q = query(
              collection(db, 'numberPool'),
              where('status', '==', 'open'),
              where('numberTokens', 'array-contains', fallbackToken),
              orderBy('number'),
              limit(5000) // Fetch more to show all matching results
            );
            const snapshot = await getDocs(q);
            snapshot.docs.forEach(doc => {
              const numData = {
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
                updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt,
              } as NumberPool;
              const numberDigits = (numData.number || '').replace(/\D/g, '');
              // Strict validation: number must contain the exact search digits
              if (numberDigits.includes(searchDigits) && !seenIds.has(numData.id)) {
                seenIds.add(numData.id);
                results.push(numData);
      }
            });
          } catch (fallbackError) {
            console.error('Fallback token query error:', fallbackError);
          }
        }
      }

      // Filter by allowed groups and categories (case-insensitive matching)
      const filtered = results.filter(num => {
        const matchesGroup = agentLink.allowedGroups.includes(num.group || 'Standard');
        const numCategory = (num.category || 'Standard').toLowerCase();
        const matchesCategory =
          !agentLink.allowedCategories ||
          agentLink.allowedCategories.length === 0 ||
          agentLink.allowedCategories.some(cat => cat.toLowerCase() === numCategory);
        
        // Double-check: number must contain the search digits
        const numberDigits = (num.number || '').replace(/\D/g, '');
        const containsDigits = numberDigits.includes(searchDigits);
        
        return matchesGroup && matchesCategory && num.status === 'open' && containsDigits;
      });

      // Sort by relevance: numbers that contain digits at different positions
      filtered.sort((a, b) => {
        const aNumber = (a.number || '').replace(/\D/g, '');
        const bNumber = (b.number || '').replace(/\D/g, '');
        
        // Priority: starts with > ends with > contains anywhere
        const aStarts = aNumber.startsWith(searchDigits) ? 3 : 
                       aNumber.endsWith(searchDigits) ? 2 : 
                       aNumber.includes(searchDigits) ? 1 : 0;
        const bStarts = bNumber.startsWith(searchDigits) ? 3 : 
                       bNumber.endsWith(searchDigits) ? 2 : 
                       bNumber.includes(searchDigits) ? 1 : 0;
        
        if (aStarts !== bStarts) return bStarts - aStarts;
        
        // If same priority, sort by number naturally
        return aNumber.localeCompare(bNumber);
      });

      // If no results found, try partial matches (progressively shorter patterns)
      // Only trigger fallback if we actually have NO results
      if (filtered.length === 0 && searchDigits.length > 2) {
        setIsShowingFallback(true);
        
        // Try progressively shorter patterns: 0000 -> 000 -> 00
        let partialResults: NumberPool[] = [];
        let foundPartialMatch = false;
        let partialDigits = '';
        let partialMessage = '';
        
        // Try removing digits one by one until we find results or reach minimum length
        for (let removeCount = 1; removeCount < searchDigits.length - 1 && !foundPartialMatch; removeCount++) {
          partialDigits = searchDigits.slice(0, searchDigits.length - removeCount);
          
          if (partialDigits.length < 2) break; // Minimum 2 digits
          
          // Try searching with partial digits
          const partialTokens: string[] = [];
          if (partialDigits.length >= 3) {
            for (let i = 0; i <= partialDigits.length - 3; i++) {
              partialTokens.push(partialDigits.substring(i, i + 3));
            }
          } else if (partialDigits.length === 2) {
            // For 2-digit patterns, we need to search differently
            // Since numberTokens only contains 3-digit tokens, we can't query 2-digit directly
            // Instead, we'll search for numbers that contain this 2-digit pattern anywhere
            // We'll use a broader search and filter in memory
            partialTokens.push(partialDigits);
          }
          
          if (partialTokens.length > 0) {
            const partialToken = partialTokens[partialTokens.length - 1];
            const partialSeenIds = new Set<string>();
            
            try {
              let partialQ;
              
              // For 2-digit patterns, we can't use array-contains (tokens are 3-digit)
              // So we'll query by status only and filter strictly in memory
              if (partialDigits.length === 2) {
                partialQ = query(
                  collection(db, 'numberPool'),
                  where('status', '==', 'open'),
                  orderBy('number'),
                  limit(5000) // Fetch more to show all matching results
                );
              } else {
                // For 3+ digit patterns, use token search
                partialQ = query(
                  collection(db, 'numberPool'),
                  where('status', '==', 'open'),
                  where('numberTokens', 'array-contains', partialToken),
                  orderBy('number'),
                  limit(5000) // Fetch more to show all matching results
                );
      }

              const partialSnapshot = await getDocs(partialQ);
              
              partialSnapshot.docs.forEach(doc => {
                const numData = {
                  id: doc.id,
                  ...doc.data(),
                  createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
                  updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt,
                } as NumberPool;
                
                const numberDigits = (numData.number || '').replace(/\D/g, '');
                // Strict validation: number must contain the exact partial digits
                if (numberDigits.includes(partialDigits) && !partialSeenIds.has(numData.id)) {
                  partialSeenIds.add(numData.id);
                  partialResults.push(numData);
                }
              });
              
              // Filter by allowed groups and categories with strict validation (case-insensitive matching)
              const partialFiltered = partialResults.filter(num => {
                const matchesGroup = agentLink.allowedGroups.includes(num.group || 'Standard');
                const numCategory = (num.category || 'Standard').toLowerCase();
                const matchesCategory =
                  !agentLink.allowedCategories ||
                  agentLink.allowedCategories.length === 0 ||
                  agentLink.allowedCategories.some(cat => cat.toLowerCase() === numCategory);
                
                // Strict check: number must contain the partial digits
                const numberDigits = (num.number || '').replace(/\D/g, '');
                const containsDigits = numberDigits.includes(partialDigits);
                
                // Additional validation: ensure number actually contains the pattern
                if (!containsDigits) {
                  return false;
                }
                
                return matchesGroup && matchesCategory && num.status === 'open' && containsDigits;
              });
              
              if (partialFiltered.length > 0) {
                // Sort partial results
                partialFiltered.sort((a, b) => {
                  const aNumber = (a.number || '').replace(/\D/g, '');
                  const bNumber = (b.number || '').replace(/\D/g, '');
                  
                  const aStarts = aNumber.startsWith(partialDigits) ? 3 : 
                                 aNumber.endsWith(partialDigits) ? 2 : 
                                 aNumber.includes(partialDigits) ? 1 : 0;
                  const bStarts = bNumber.startsWith(partialDigits) ? 3 : 
                                 bNumber.endsWith(partialDigits) ? 2 : 
                                 bNumber.includes(partialDigits) ? 1 : 0;
                  
                  if (aStarts !== bStarts) return bStarts - aStarts;
                  return aNumber.localeCompare(bNumber);
                });
                
                partialResults = partialFiltered;
                foundPartialMatch = true;
                partialMessage = `No exact matches found for "${searchDigits}". Showing numbers with "${partialDigits}" pattern.`;
                break;
              }
            } catch (error) {
              console.error('Error finding partial matches:', error);
            }
          }
        }
        
        if (foundPartialMatch && partialResults.length > 0) {
          // Final validation: ensure all results actually contain the partial pattern
          const validatedPartialResults = partialResults.filter(num => {
            const numberDigits = (num.number || '').replace(/\D/g, '');
            return numberDigits.includes(partialDigits);
          });
          
          if (validatedPartialResults.length > 0) {
            setFallbackMessage(partialMessage);
            setFallbackPattern(partialDigits);
            setSimilarNumbers(validatedPartialResults); // Show all partial results
          } else {
            setSimilarNumbers([]);
            setIsShowingFallback(false);
            setFallbackMessage('');
            setFallbackPattern('');
          }
        } else {
          setSimilarNumbers([]);
          setIsShowingFallback(false);
          setFallbackMessage('');
          setFallbackPattern('');
        }
      } else {
        // Final validation: ensure all results actually contain the search digits
        const validatedFiltered = filtered.filter(num => {
          const numberDigits = (num.number || '').replace(/\D/g, '');
          const containsSearchDigits = numberDigits.includes(searchDigits);
          
          // Additional strict check: verify the number actually contains the pattern
          if (!containsSearchDigits) {
            return false;
          }
          
          return true;
      });

        // Set all results (no limit for recommended numbers)
        setSimilarNumbers(validatedFiltered);
        setSimilarHasMore(false); // No pagination for similar numbers
        setSimilarLastDoc(null); // No pagination for similar numbers
      }
    } catch (error) {
      console.error('Error finding similar numbers:', error);
      toast.error('Error searching for numbers');
    } finally {
      setIsSearching(false);
    }
  }, [agentLink]);

  const calculateMatchScore = (number: string, searchPattern: string): number => {
    const numberDigits = number.replace(/\D/g, '');
    const searchDigits = searchPattern.replace(/\D/g, '');
    
    if (!searchDigits || searchDigits.length === 0) return 0;
    
    let score = 0;
    
    // Check for exact pattern match (anywhere in number)
    if (numberDigits.includes(searchDigits)) {
      score += 100;
    }
    
    // Check for partial matches (substrings)
    for (let len = searchDigits.length - 1; len >= Math.max(2, Math.floor(searchDigits.length / 2)); len--) {
      for (let i = 0; i <= searchDigits.length - len; i++) {
        const substring = searchDigits.slice(i, i + len);
        if (numberDigits.includes(substring)) {
          score += len * 10; // Longer matches get higher scores
        }
    }
    }
    
    // Check suffix matching (from end)
    for (let i = 1; i <= Math.min(searchDigits.length, numberDigits.length); i++) {
      const searchSuffix = searchDigits.slice(-i);
      const numberSuffix = numberDigits.slice(-i);
      if (searchSuffix === numberSuffix) {
        score += i * 5; // Suffix matches get bonus points
      } else {
        break;
      }
    }
    
    // Check prefix matching (from start)
    for (let i = 1; i <= Math.min(searchDigits.length, numberDigits.length); i++) {
      const searchPrefix = searchDigits.slice(0, i);
      const numberPrefix = numberDigits.slice(0, i);
      if (searchPrefix === numberPrefix) {
        score += i * 3; // Prefix matches get some points
      } else {
        break;
      }
    }
    
    return score;
  };

  const findMostMatchingNumbers = async (searchPattern: string, limit: number = 20): Promise<NumberPool[]> => {
    if (!agentLink) return [];
    
    try {
      // Get all available numbers from allowed groups
      const allNumbers: NumberPool[] = [];
      
      // Search with different strategies to get a pool of numbers
      const searchStrategies = [
        { term: searchPattern, limit: 100 },
        { term: searchPattern.slice(-4), limit: 50 }, // Last 4 digits
        { term: searchPattern.slice(-3), limit: 50 }, // Last 3 digits
      ];
      
      for (const strategy of searchStrategies) {
        if (strategy.term.length >= 2) {
          let strategyResults: NumberPool[] = [];
          
          // If link has category filters, search within those categories
          if (agentLink.allowedCategories && agentLink.allowedCategories.length > 0) {
            // Search each allowed category separately (normalize category names)
            const categoryPromises = agentLink.allowedCategories.map(async (category) => {
              const normalizedCategory = normalizeCategoryForQuery(category);
              const result = await unifiedSearch.search(strategy.term, {
                category: normalizedCategory,
                limit: strategy.limit,
                statusFilter: 'open',
              });
              return result.data;
            });
            
            const categoryResultsArrays = await Promise.all(categoryPromises);
            strategyResults = categoryResultsArrays.flat();
          } else {
            // No category filter, search all categories
          const result = await unifiedSearch.search(strategy.term, {
            category: 'all',
            limit: strategy.limit,
            statusFilter: 'open',
          });
            strategyResults = result.data;
          }
          
          // Filter by allowed groups (category already filtered if categories were specified)
          const filtered = strategyResults.filter(num => {
            const matchesGroup = agentLink.allowedGroups.includes(num.group || 'Standard');
            return matchesGroup && num.status === 'open';
          });
          
          allNumbers.push(...filtered);
        }
      }
      
      // Remove duplicates
      const uniqueNumbers = Array.from(
        new Map(allNumbers.map(num => [num.id, num])).values()
      );
      
      // Calculate match scores for all numbers
      const scoredNumbers = uniqueNumbers.map(num => ({
        number: num,
        score: calculateMatchScore(num.number, searchPattern)
      }));
      
      // Sort by score (highest first) and take top results
      scoredNumbers.sort((a, b) => b.score - a.score);
      
      return scoredNumbers
        .filter(item => item.score > 0) // Only return numbers with some match
        .slice(0, limit)
        .map(item => item.number);
    } catch (error) {
      console.error('Error finding most matching numbers:', error);
      return [];
    }
  };

  const handleSearch = useCallback(async (loadMore: boolean = false, cursorDoc: any = null) => {
    if (!searchTerm.trim() || !agentLink) {
      setSearchResults([]);
      setSearchHasMore(false);
      setSearchLastDoc(null);
      setShowingMostMatching(false);
      return;
    }

    if (loadMore) {
      setIsLoadingMore(true);
    } else {
      setIsSearching(true);
      setSearchResults([]);
      setSearchLastDoc(null);
      setShowingMostMatching(false);
    }

    try {
      // If link has category filters, search within those categories for maximum results
      // Otherwise, search all categories
      let allResults: NumberPool[] = [];
      let hasMore = false;
      let lastDoc: any = null;
      
      if (agentLink.allowedCategories && agentLink.allowedCategories.length > 0) {
        // Search each allowed category separately to get maximum results (normalize category names)
        const categoryPromises = agentLink.allowedCategories.map(async (category) => {
          const normalizedCategory = normalizeCategoryForQuery(category);
          const result = await unifiedSearch.search(searchTerm, {
            category: normalizedCategory,
            limit: 5000,
            startAfter: loadMore ? cursorDoc : null,
            statusFilter: 'open',
          });
          return result;
        });
        
        const categoryResults = await Promise.all(categoryPromises);
        
        // Combine results from all categories
        categoryResults.forEach(result => {
          allResults.push(...result.data);
          if (result.hasMore) hasMore = true;
          if (result.lastDoc) lastDoc = result.lastDoc; // Use last doc from last category
        });
        
        // Remove duplicates
        const uniqueMap = new Map<string, NumberPool>();
        allResults.forEach(num => {
          if (!uniqueMap.has(num.id)) {
            uniqueMap.set(num.id, num);
          }
        });
        allResults = Array.from(uniqueMap.values());
      } else {
        // No category filter, search all categories
      const result = await unifiedSearch.search(searchTerm, {
        category: 'all',
          limit: 5000,
        startAfter: loadMore ? cursorDoc : null,
        statusFilter: 'open',
      });
        allResults = result.data;
        hasMore = result.hasMore || false;
        lastDoc = result.lastDoc || null;
      }

      // Filter by allowed groups (category already filtered if categories were specified)
      const filtered = allResults.filter(num => {
        const matchesGroup = agentLink.allowedGroups.includes(num.group || 'Standard');
        return matchesGroup && num.status === 'open';
      });

      if (loadMore) {
        setSearchResults(prev => [...prev, ...filtered]);
        setSearchHasMore(hasMore);
        setSearchLastDoc(lastDoc);
      } else {
        // If no exact results, find most matching numbers
        if (filtered.length === 0) {
          const mostMatching = await findMostMatchingNumbers(searchTerm, 20);
          setSearchResults(mostMatching);
          setShowingMostMatching(mostMatching.length > 0);
          setSearchHasMore(false);
          setSearchLastDoc(null);
        } else {
          setSearchResults(filtered);
          setShowingMostMatching(false);
          setSearchHasMore(hasMore);
          setSearchLastDoc(lastDoc);
        }
      }
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Search failed');
    } finally {
      setIsSearching(false);
      setIsLoadingMore(false);
    }
  }, [searchTerm, agentLink]);

  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && searchHasMore && searchLastDoc) {
      handleSearch(true, searchLastDoc);
    }
  }, [isLoadingMore, searchHasMore, searchLastDoc, handleSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm.trim().length >= 2) {
        handleSearch();
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, handleSearch]);

  const handlePhoneSubmit = async () => {
    const cleanPhone = enteredPhone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 3) {
      toast.error('Please enter at least 3 digits');
      return;
    }

    if (cleanPhone.length > 5) {
      toast.error('Please enter maximum 5 digits');
      return;
    }

    setFormData(prev => ({ ...prev, customerPhone: cleanPhone }));

    await findSimilarNumbers(cleanPhone);

    setStep('search');
  };

  const getMatchingDigitPositions = (number: string, enteredNumber: string): Set<number> => {
    const entered = enteredNumber.replace(/\D/g, '');
    const numberDigits = number.replace(/\D/g, '');
    const matchingPositions = new Set<number>();
    
    if (!entered || entered.length === 0) {
      return matchingPositions;
    }
    
    // Find all occurrences of the entered pattern in the number (anywhere in the number)
    // Try to find the pattern starting from different positions
    for (let startPos = 0; startPos <= numberDigits.length - entered.length; startPos++) {
      const substring = numberDigits.slice(startPos, startPos + entered.length);
      if (substring === entered) {
        // Mark all digits in this matching pattern
        for (let i = 0; i < entered.length; i++) {
          matchingPositions.add(startPos + i);
        }
      }
    }
    
    // Also check suffix matching (from the end) for better UX
    for (let i = 1; i <= Math.min(entered.length, numberDigits.length); i++) {
      const enteredSuffix = entered.slice(-i);
      const numberSuffix = numberDigits.slice(-i);
      if (enteredSuffix === numberSuffix) {
        // Mark the last i digits
        for (let j = numberDigits.length - i; j < numberDigits.length; j++) {
          matchingPositions.add(j);
        }
      } else {
        break;
      }
    }
    
    return matchingPositions;
  };

  const renderNumberWithHighlights = (number: string, enteredNumber: string) => {
    const matchingPositions = getMatchingDigitPositions(number, enteredNumber);
    
    if (matchingPositions.size === 0) {
      return <span>{number}</span>;
    }
    
    // Highlight all matching digits (anywhere in the number)
    const result = [];
    let digitIndex = 0;
    
    for (let i = 0; i < number.length; i++) {
      const char = number[i];
      if (/\d/.test(char)) {
        const isMatching = matchingPositions.has(digitIndex);
        if (isMatching) {
          result.push(
            <span key={i} className="bg-gradient-to-r from-amber-400 to-amber-500 text-white font-black px-0.5 rounded mr-0.5">
              {char}
            </span>
          );
        } else {
          result.push(<span key={i}>{char}</span>);
        }
        digitIndex++;
      } else {
        result.push(<span key={i}>{char}</span>);
      }
    }
    
    return <>{result}</>;
  };

  const getCategoryColor = (category: string) => {
    const lowerCategory = category.toLowerCase();
    if (lowerCategory.includes('silver')) {
      return {
        text: 'rgba(71, 85, 105, 1)', // slate-600
        bg: 'rgba(226, 232, 240, 0.9)', // slate-200 with opacity
        border: 'rgba(203, 213, 225, 0.6)' // slate-300 with opacity
      };
    } else if (lowerCategory.includes('gold')) {
      return {
        text: 'rgba(180, 83, 9, 1)', // amber-700
        bg: 'rgba(253, 230, 138, 0.9)', // amber-200 with opacity
        border: 'rgba(252, 211, 77, 0.6)' // amber-300 with opacity
      };
    } else if (lowerCategory.includes('platinum')) {
      return {
        text: 'rgba(107, 114, 128, 1)', // gray-600
        bg: 'rgba(229, 231, 235, 0.9)', // gray-200 with opacity
        border: 'rgba(209, 213, 219, 0.6)' // gray-300 with opacity
      };
    }
    return {
      text: 'rgba(194, 65, 12, 1)', // orange-700
      bg: 'rgba(255, 237, 213, 0.9)', // orange-100 with opacity
      border: 'rgba(254, 215, 170, 0.6)' // orange-200 with opacity
    };
  };

  const handleSelectNumber = (number: NumberPool) => {
    const uniqueId = number.number;
    if (selectedNumbers.some(n => n.numberId === uniqueId)) {
      setSelectedNumbers(prev => prev.filter(n => n.numberId !== uniqueId));
      setSelectedPlans(prev => {
        const newPlans = { ...prev };
        delete newPlans[uniqueId];
        return newPlans;
      });
      return;
    }

    setSelectedNumbers(prev => [...prev, {
      numberId: uniqueId,
      number: number.number,
      plan: '',
      category: number.category || '',
      group: number.group,
    }]);
  };

  const handlePlanSelect = (numberId: string, planName: string) => {
    setSelectedPlans(prev => ({
      ...prev,
      [numberId]: planName,
    }));

    setSelectedNumbers(prev => prev.map(n =>
      n.numberId === numberId ? { ...n, plan: planName } : n
    ));
  };

  const handleContinueToPlans = async () => {
    setLoadingPlans(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    setStep('plans');
    setLoadingPlans(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedNumbers.length === 0) {
      toast.error('Please select at least one number');
      return;
    }

    const numbersWithoutPlans = selectedNumbers.filter(n => !selectedPlans[n.numberId]);
    if (numbersWithoutPlans.length > 0) {
      toast.error('Please select a plan for all numbers');
      return;
    }

    if (!formData.customerName || !formData.customerPhone || !formData.customerAddress) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!agentLink) return;

    setIsSubmitting(true);
    try {
      const leadData: Partial<Lead> & { nationality?: string } = {
        customerName: formData.customerName,
        customerPhone: formData.customerPhone,
        customerNumber: formData.customerNumber || formData.customerPhone,
        customerAddress: formData.customerAddress,
        country: formData.country,
        customerAge: parseInt(formData.customerAge) || 0,
        gender: formData.gender,
        emirate: formData.emirate,
        area: formData.area,
        nationality: formData.nationality,
        language: formData.language,
        hasEmirateId: formData.hasEmirateId,
        advancePayment: formData.advancePayment,
        plans: selectedNumbers.map(n => ({
          numberId: n.numberId,
          number: n.number,
          plan: selectedPlans[n.numberId],
          category: n.category,
          group: n.group || 'Standard',
          status: 'pending_verification',
        })),
        agentId: agentLink.agentId,
        status: 'pending_verification',
        createdAt: new Date(),
        updatedAt: new Date(),
        startDate: new Date(),
        notes: 'Submitted via Customer Portal',
        followUpDate: new Date(),
        verificationNotes: '',
        coordinatorNotes: '',
        rejectionReason: '',
        numberType: selectedNumbers[0]?.category || 'Standard',
        remarks: 'Please Verify',
        sharedWith: [],
        latitude: 0,
        longitude: 0,
        locationUrl: '',
        confirmLocationUrl: false,
        startTime: '',
        productType: 'New Connection',
      };

      // Save to customer portal submissions collection instead of leads
      await addDoc(collection(db, 'customerPortalSubmissions'), {
        ...leadData,
        linkId: linkId,
        submittedAt: new Date(),
        status: 'pending', // pending, reviewed, converted
      });

      // Note: usageCount is already incremented when the link is first accessed
      // We only update lastUsedAt here to reflect the submission time
      if (agentLink.id) {
        await updateDoc(doc(db, 'agentLinks', agentLink.id), {
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        });
      }

      setStep('success');
      toast.success('Your request has been submitted successfully!');
    } catch (error) {
      console.error('Error submitting lead:', error);
      toast.error('Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50 to-amber-50 flex items-center justify-center">
        <div className="text-center">
          {/* Cube Pushing Animation - Perfect Diagonal Wave */}
          <div className="mb-6 flex flex-col items-center justify-center">
            {Array.from({ length: 5 }, (_, rowIndex) => (
              <div key={`row-${rowIndex}`} className="grid grid-cols-5 gap-1 sm:gap-1.5 mt-1 sm:mt-1.5 first:mt-0">
                {Array.from({ length: 5 }, (_, colIndex) => {
                  // Calculate diagonal distance from top-left corner
                  // This creates a smooth diagonal wave effect
                  const diagonalIndex = rowIndex + colIndex;
                  
                  // Base delay increases with diagonal distance - smoother timing
                  const baseDelay = diagonalIndex * 0.06;
                  
                  // Add row offset for smoother cascading effect
                  const rowOffset = rowIndex * 0.08;
                  
                  // Final delay with slight variation for natural flow
                  const delay = baseDelay + rowOffset;
                  
                  // Calculate push direction based on position
                  // Top-left to bottom-right diagonal flow
                  const pushDistance = 20;
                  const angle = Math.atan2(rowIndex - 2, colIndex - 2);
                  const pushX = Math.cos(angle) * pushDistance * 0.25;
                  const pushY = Math.sin(angle) * pushDistance * 0.25;
                  
                  return (
          <motion.div
                      key={`cube-${rowIndex}-${colIndex}`}
                      className="w-5 h-5 sm:w-6 sm:h-6 bg-gradient-to-br from-orange-500 via-orange-400 to-amber-500 rounded-sm shadow-md"
                      style={{
                        boxShadow: '0 2px 6px rgba(251, 146, 60, 0.3)'
                      }}
                      initial={{ 
                        scale: 0, 
                        opacity: 0, 
                        y: pushY,
                        x: pushX,
                        rotateZ: -10
                      }}
                      animate={{
                        scale: [0, 1.1, 1],
                        opacity: [0, 1, 1],
                        y: [pushY, 0, 0],
                        x: [pushX, 0, 0],
                        rotateZ: [-10, 2, 0]
                      }}
                      transition={{
                        duration: 0.5,
                        delay: delay,
                        repeat: Infinity,
                        repeatDelay: 2.2,
                        ease: [0.16, 1, 0.3, 1] // Smoother cubic bezier
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          
          {/* Enhanced Loading Text */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="space-y-2"
          >
            <motion.h2
              className="text-lg sm:text-xl font-semibold bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 bg-clip-text text-transparent"
              animate={{
                backgroundPosition: ['0%', '100%', '0%'],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "linear"
              }}
              style={{
                backgroundSize: '200% 100%'
              }}
            >
              Loading your experience
            </motion.h2>
            <div className="flex items-center justify-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-gradient-to-br from-orange-500 to-amber-500"
                  animate={{
                    scale: [1, 1.3, 1],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    delay: i * 0.2,
                    ease: "easeInOut"
                  }}
                />
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  const handleOTPSubmit = () => {
    if (!agentLink?.otp) {
      setOtpError('OTP is required to access this portal');
      return;
    }

    if (enteredOTP.trim() === '' || enteredOTP.length < 6) {
      setOtpError('Please enter the 6-digit OTP');
      return;
    }

    // Check if OTP is expired (skip if otpExpiresAt is null, meaning forever)
    if (agentLink.otpExpiresAt) {
      const now = new Date();
      const expiresAt = new Date(agentLink.otpExpiresAt);
      if (now > expiresAt) {
        setOtpError('OTP has expired. Please contact the agent for a new OTP.');
        setEnteredOTP('');
        return;
      }
    }

    if (enteredOTP.trim() !== agentLink.otp) {
      setOtpError('Invalid OTP. Please check and try again.');
      setEnteredOTP('');
      return;
    }

    setOtpVerified(true);
    setOtpError('');
    
    // Store OTP verification in sessionStorage
    if (linkId) {
      const sessionKey = `otp_session_${linkId}`;
      const sessionData = {
        verified: true,
        timestamp: Date.now(),
        linkId: linkId
      };
      sessionStorage.setItem(sessionKey, JSON.stringify(sessionData));
    }
    
    toast.success('Access granted!');
  };

  if (!agentLink) return null;

  // Show OTP verification screen if OTP is required and not verified
  if (agentLink.otp && !otpVerified) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-orange-100 flex items-center justify-center p-4 safe-area-inset">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="w-full max-w-md"
        >
          {/* Modern iOS Glass Design */}
          <div className="relative rounded-3xl overflow-hidden" style={{
            background: 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            boxShadow: '0 8px 32px 0 rgba(249, 115, 22, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.5)'
          }}>
            {/* Inner glow effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
            {/* Subtle border highlight */}
            <div className="absolute inset-0 rounded-3xl border border-white/50 pointer-events-none" />
            
            <div className="relative p-4 sm:p-6 md:p-8 lg:p-10">
              {/* Icon Section with enhanced animation */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
                className="flex justify-center mb-8"
              >
                <div className="relative">
                  {/* Pulsing glow effect */}
                  <motion.div
                    animate={{ scale: [1, 1.2, 1], opacity: [0.6, 0.3, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute inset-0 bg-gradient-to-br from-orange-400 to-amber-500 rounded-full blur-2xl"
                  />
                  {/* Main icon container */}
                  <div className="relative w-24 h-24 sm:w-28 sm:h-28 bg-gradient-to-br from-orange-500 via-orange-400 to-amber-500 rounded-3xl flex items-center justify-center shadow-2xl shadow-orange-500/50">
                    <Lock className="w-12 h-12 sm:w-14 sm:h-14 text-white" strokeWidth={2.5} />
                    <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent rounded-3xl" />
                    {/* Shine effect */}
                    <motion.div
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent rounded-3xl"
                    />
                  </div>
                </div>
              </motion.div>

              {/* Title and Description with better typography */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, type: "spring" }}
                className="text-center mb-8"
              >
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-gray-900 mb-3 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent">
                  Enter Access Code
                </h2>
                <p className="text-gray-600 text-base sm:text-lg font-medium leading-relaxed px-2">
                  Please enter the OTP provided by our sales agent to access the portal
                </p>
              </motion.div>

              {/* Enhanced OTP Input Section */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, type: "spring" }}
                className="mb-8"
              >
                <div className="flex justify-center gap-2 sm:gap-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.5, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ 
                        delay: 0.5 + index * 0.08, 
                        type: "spring", 
                        stiffness: 300,
                        damping: 20
                      }}
                      className="relative"
                    >
                      <input
                        id={`otp-${index}`}
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={enteredOTP[index] || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          if (!val && e.target.value) return;

                          const newOTP = enteredOTP.split('');
                          newOTP[index] = val;
                          const newOTPStr = newOTP.join('').slice(0, 6);
                          setEnteredOTP(newOTPStr);
                          setOtpError('');

                          if (val && index < 5) {
                            setTimeout(() => {
                              const nextInput = document.getElementById(`otp-${index + 1}`);
                              nextInput?.focus();
                            }, 50);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && !enteredOTP[index] && index > 0) {
                            const prevInput = document.getElementById(`otp-${index - 1}`);
                            prevInput?.focus();

                            const newOTP = enteredOTP.split('');
                            newOTP[index - 1] = '';
                            setEnteredOTP(newOTP.join(''));
                          }
                        }}
                        onFocus={(e) => {
                          e.target.select();
                        }}
                        className={clsx(
                          "w-11 h-13 sm:w-12 sm:h-16 md:w-14 md:h-18 text-center text-2xl sm:text-3xl font-black rounded-xl sm:rounded-2xl outline-none transition-all duration-300 relative border-2 touch-manipulation",
                          enteredOTP[index]
                            ? "bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/40 border-orange-400 scale-105"
                            : "bg-white border-gray-300 focus:border-orange-500 focus:bg-orange-50 focus:shadow-lg focus:scale-105"
                        )}
                      />
                      {!enteredOTP[index] && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                          <span className="text-2xl sm:text-3xl font-black text-gray-300 select-none">
                            •
                          </span>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
                {otpError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring" }}
                    className="mt-5 text-center"
                  >
                    <div className="inline-flex items-center gap-2 bg-red-50 border-2 border-red-200 rounded-xl px-4 py-3">
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                      <p className="text-red-600 text-sm font-bold">
                        {otpError}
                      </p>
                    </div>
                  </motion.div>
                )}
              </motion.div>

              {/* Enhanced Submit Button */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, type: "spring" }}
                className="flex justify-center mb-6"
              >
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleOTPSubmit}
                  className="relative group overflow-hidden touch-manipulation rounded-xl sm:rounded-2xl"
                >
                  {/* Gradient background layers - all with matching rounded corners */}
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 rounded-xl sm:rounded-2xl shadow-lg shadow-orange-500/30" />
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 rounded-xl sm:rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 rounded-xl sm:rounded-2xl" />
                  
                  {/* Button content with gradient text */}
                  <div className="relative py-2.5 sm:py-3 px-6 sm:px-8 flex items-center justify-center gap-2 z-10">
                    <Key className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                    <span className="bg-gradient-to-r from-white via-amber-50 to-white bg-clip-text text-transparent font-bold text-sm sm:text-base">
                      Verify & Access
                    </span>
                    <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-white group-hover:translate-x-1 transition-transform" />
                  </div>
                  
                  {/* Ripple effect on click - clipped to button shape */}
                  <motion.div
                    className="absolute inset-0 bg-white/20 rounded-xl sm:rounded-2xl opacity-0"
                    whileTap={{ opacity: 1, scale: 1.1 }}
                    transition={{ duration: 0.2 }}
                    style={{ clipPath: 'inset(0 round 0.75rem)' }}
                  />
                </motion.button>
              </motion.div>

              {/* Enhanced Info Card - Modern iOS Glass */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, type: "spring" }}
                className="rounded-2xl p-5 relative overflow-hidden" style={{
                  background: 'rgba(255, 247, 237, 0.6)',
                  backdropFilter: 'blur(20px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                  border: '1px solid rgba(255, 255, 255, 0.4)',
                  boxShadow: '0 4px 16px 0 rgba(249, 115, 22, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/50 via-transparent to-transparent pointer-events-none" />
                <div className="absolute inset-0 rounded-2xl border border-white/60 pointer-events-none" />
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center shadow-lg">
                    <Shield className="w-6 h-6 text-white" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm sm:text-base font-bold text-gray-900 mb-1.5">
                      Secure Access
                    </p>
                    <p className="text-xs sm:text-sm text-gray-700 leading-relaxed">
                      This portal is protected. Please contact our sales agent if you don't have the access code.
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .safe-area-inset {
          padding-top: env(safe-area-inset-top);
          padding-bottom: env(safe-area-inset-bottom);
        }
        .h-safe-top {
          height: env(safe-area-inset-top, 0px);
        }
        .pb-safe-bottom {
          padding-bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
        }
        .bottom-nav-fixed {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 50;
          padding: 1rem;
          padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
          transform: translateZ(0);
          -webkit-transform: translateZ(0);
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          max-height: 45vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .touch-manipulation {
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }
        input[type="tel"], input[type="text"], input[type="number"], select, textarea {
          font-size: 16px !important; /* Prevents zoom on iOS */
        }
        @media (max-width: 640px) {
          input[type="tel"], input[type="text"], input[type="number"], select, textarea {
            font-size: 16px !important;
          }
        }
      `}</style>
      <div className="min-h-screen bg-white relative overflow-hidden">
        {/* Native-like status bar area */}
        <div className="h-safe-top bg-white" />
      
      {/* Native app container - full width */}
      <div className="relative z-10 w-full min-h-screen flex flex-col">

        {/* Native-like header */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="sticky top-0 z-50 bg-white border-b border-gray-100"
        >
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {step !== 'phone' && step !== 'pool' && step !== 'success' && (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    if (step === 'search') setStep(agentLink?.trustedCustomers ? 'pool' : 'phone');
                    if (step === 'plans') setStep(agentLink?.trustedCustomers ? 'pool' : 'search');
                    if (step === 'details') setStep('plans');
                  }}
                        className="w-12 h-12 -ml-2 flex items-center justify-center rounded-full active:bg-gray-100 touch-manipulation min-w-[48px] min-h-[48px]"
                >
                  <ChevronLeft className="w-6 h-6 text-gray-700" strokeWidth={2} />
                </motion.button>
              )}
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <h1 className="font-bold text-lg text-gray-900">Premium Select</h1>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Content area with safe padding */}
        <div className="flex-1 px-4 pb-safe-bottom flex flex-col overflow-y-auto">
          <AnimatePresence mode="wait">

            {step === 'phone' && (
              <motion.div
                key="phone"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="flex flex-col flex-1 justify-center relative py-4 sm:py-6 md:py-8"
              >
                {/* Main Content Card - Enhanced Design */}
                <motion.div
                  initial={{ opacity: 0, y: 30, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 100 }}
                  className="relative z-10"
                >
                  <div className="relative">
                    {/* Enhanced glass morphism card */}
                    <div className="relative bg-white/90 backdrop-blur-xl rounded-3xl border-2 border-orange-200/50 shadow-2xl overflow-hidden">
                      {/* Animated gradient border */}
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-400/30 via-amber-400/30 to-orange-400/30 rounded-3xl p-[2px]">
                        <div className="h-full w-full bg-white/90 backdrop-blur-xl rounded-3xl" />
                      </div>
                      
                      <div className="relative p-4 sm:p-6 md:p-8 lg:p-10">
                        {/* Enhanced Icon Section */}
                        <motion.div
                          initial={{ scale: 0, rotate: -180 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 15 }}
                          className="flex justify-center mb-4 sm:mb-6 lg:mb-8"
                        >
                          <div className="relative">
                            {/* Pulsing glow effect */}
                            <motion.div
                              animate={{ scale: [1, 1.2, 1], opacity: [0.6, 0.3, 0.6] }}
                              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                              className="absolute inset-0 bg-gradient-to-br from-orange-400 to-amber-500 rounded-full blur-2xl"
                            />
                            {/* Icon container */}
                            <div className="relative w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-orange-500 via-orange-400 to-amber-500 rounded-2xl flex items-center justify-center shadow-xl shadow-orange-500/40">
                              <Phone className="w-8 h-8 sm:w-10 sm:h-10 text-white" strokeWidth={2.5} />
                              {/* Shine effect */}
                              <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent rounded-3xl" />
                              {/* Animated shine */}
                              <motion.div
                                animate={{ x: ['-100%', '200%'] }}
                                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent rounded-3xl"
                              />
                            </div>
                          </div>
                        </motion.div>

                        {/* Enhanced Title and Description - Mobile Optimized */}
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.4, type: "spring" }}
                          className="text-center mb-4 sm:mb-5 px-2"
                        >
                          <h2 className="text-base sm:text-lg md:text-xl font-bold text-gray-900 mb-2 leading-tight">
                            <span className="block">Enter Your Preferred Digits</span>
                            <span className="block text-orange-600">to Find Matching Numbers</span>
                          </h2>
                        </motion.div>

                        {/* Enhanced Phone Input Section - Compact & Elegant */}
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.5, type: "spring" }}
                          className="mb-5 sm:mb-6 lg:mb-8 px-4"
                        >
                           <div className="flex justify-center items-center w-full">
                             <div className="relative w-full max-w-[200px] sm:max-w-[240px]">
                               {/* Compact input container */}
                                  <div className="relative">
                                 {/* Subtle glow effect */}
                                 <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-400/50 via-amber-400/50 to-orange-400/50 rounded-lg blur-sm opacity-50 group-hover:opacity-75 transition duration-300"></div>
                                 
                                 {/* Compact input with elegant styling */}
                                    <input
                                      type="tel"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                   maxLength={5}
                                   value={enteredPhone}
                                      onChange={(e) => {
                                     const val = e.target.value.replace(/\D/g, '').slice(0, 5);
                                     setEnteredPhone(val);
                                      }}
                                      onFocus={(e) => {
                                        e.target.select();
                                      }}
                                   placeholder="000"
                                   className="relative w-full px-3 sm:px-4 py-2 sm:py-2.5 text-center text-xl sm:text-2xl font-bold rounded-lg border-2 border-orange-300 focus:border-orange-500 focus:bg-white focus:shadow-lg focus:shadow-orange-500/20 outline-none transition-all duration-200 bg-white/95 text-gray-900 placeholder-gray-300 touch-manipulation"
                                   style={{
                                     boxShadow: '0 2px 8px rgba(249, 115, 22, 0.1), inset 0 1px 2px rgba(255, 255, 255, 0.8)'
                                   }}
                                 />
                                 
                                 {enteredPhone.length > 0 && (
                                      <motion.div
                                     initial={{ scale: 0, rotate: -180 }}
                                     animate={{ scale: 1, rotate: 0 }}
                                     className="absolute -top-1.5 -right-1.5 bg-gradient-to-br from-orange-500 to-amber-500 text-white rounded-full w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center text-xs sm:text-sm font-bold shadow-md border-2 border-white z-10"
                                   >
                                     {enteredPhone.length}
                                   </motion.div>
                                    )}
                                  </div>
                             </div>
                          </div>
                        </motion.div>

                        {/* Enhanced Submit Button - Compact */}
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.7, type: "spring" }}
                          className="mb-6 sm:mb-8 flex justify-center px-4"
                        >
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handlePhoneSubmit}
                            disabled={enteredPhone.length < 3 || enteredPhone.length > 5 || isSearching}
                            className="relative group touch-manipulation"
                          >
                            {/* Button content with gradient background */}
                            <div className="relative inline-flex items-center justify-center gap-1.5 sm:gap-2 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden rounded-lg">
                              {/* Gradient background layers */}
                              <div className="absolute inset-0 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 rounded-lg shadow-md shadow-orange-500/30" />
                              <div className="absolute inset-0 bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 rounded-lg" />
                              
                              {/* Button text content - Compact */}
                              <div className="relative py-2 sm:py-2.5 px-4 sm:px-5 rounded-lg font-semibold text-sm sm:text-base text-white flex items-center justify-center gap-1.5 sm:gap-2 min-h-[40px] sm:min-h-[44px] z-10">
                                {isSearching ? (
                                  <>
                                    <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                                    <span className="text-xs sm:text-sm">Finding...</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-xs sm:text-sm md:text-base">Find Perfect Numbers</span>
                                    <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
                                  </>
                                )}
                              </div>
                              
                              {/* Ripple effect */}
                              <motion.div
                                className="absolute inset-0 bg-white/20 rounded-lg opacity-0"
                                whileTap={{ opacity: 1, scale: 1.05 }}
                                transition={{ duration: 0.2 }}
                              />
                            </div>
                          </motion.button>
                        </motion.div>

                        {/* Enhanced Information Cards */}
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.8, type: "spring" }}
                          className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4"
                        >
                          {/* Feature Card 1 - Instant Search - Modern iOS Glass */}
                          <div className="relative rounded-2xl overflow-hidden min-h-[110px] sm:min-h-[120px] flex flex-col justify-center p-4 sm:p-5" style={{
                            background: 'rgba(255, 247, 237, 0.6)',
                            backdropFilter: 'blur(20px) saturate(180%)',
                            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                            border: '1px solid rgba(255, 255, 255, 0.4)',
                            boxShadow: '0 4px 16px 0 rgba(249, 115, 22, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
                          }}>
                            <div className="absolute inset-0 bg-gradient-to-br from-white/50 via-transparent to-transparent pointer-events-none" />
                            <div className="absolute inset-0 rounded-2xl border border-white/60 pointer-events-none" />
                            
                            <div className="relative z-10 flex flex-col items-center text-center gap-2 justify-center h-full">
                              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center shadow-lg mb-1">
                                <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                              </div>
                              <h3 className="font-bold text-gray-900 text-xs sm:text-sm leading-tight">Instant Search</h3>
                              <p className="hidden sm:block text-xs text-gray-700 leading-tight px-1">
                                Find similar numbers instantly
                              </p>
                            </div>
                          </div>

                          {/* Feature Card 2 - Secure & Safe - Modern iOS Glass */}
                          <div className="relative rounded-2xl overflow-hidden min-h-[110px] sm:min-h-[120px] flex flex-col justify-center p-4 sm:p-5" style={{
                            background: 'rgba(255, 247, 237, 0.6)',
                            backdropFilter: 'blur(20px) saturate(180%)',
                            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                            border: '1px solid rgba(255, 255, 255, 0.4)',
                            boxShadow: '0 4px 16px 0 rgba(249, 115, 22, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
                          }}>
                            <div className="absolute inset-0 bg-gradient-to-br from-white/50 via-transparent to-transparent pointer-events-none" />
                            <div className="absolute inset-0 rounded-2xl border border-white/60 pointer-events-none" />
                            
                            <div className="relative z-10 flex flex-col items-center text-center gap-2 justify-center h-full">
                              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center shadow-lg mb-1">
                                <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                              </div>
                              <h3 className="font-bold text-gray-900 text-xs sm:text-sm leading-tight">Secure & Safe</h3>
                              <p className="hidden sm:block text-xs text-gray-700 leading-tight px-1">
                                Your data is protected
                              </p>
                            </div>
                          </div>

                          {/* Feature Card 3 - Best Matches - Modern iOS Glass */}
                          <div className="relative rounded-2xl overflow-hidden min-h-[110px] sm:min-h-[120px] flex flex-col justify-center p-4 sm:p-5" style={{
                            background: 'rgba(255, 247, 237, 0.6)',
                            backdropFilter: 'blur(20px) saturate(180%)',
                            WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                            border: '1px solid rgba(255, 255, 255, 0.4)',
                            boxShadow: '0 4px 16px 0 rgba(249, 115, 22, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.6)'
                          }}>
                            <div className="absolute inset-0 bg-gradient-to-br from-white/50 via-transparent to-transparent pointer-events-none" />
                            <div className="absolute inset-0 rounded-2xl border border-white/60 pointer-events-none" />
                            
                            <div className="relative z-10 flex flex-col items-center text-center gap-2 justify-center h-full">
                              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center shadow-lg mb-1">
                                <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                              </div>
                              <h3 className="font-bold text-gray-900 text-xs sm:text-sm leading-tight">Best Matches</h3>
                              <p className="hidden sm:block text-xs text-gray-700 leading-tight px-1">
                                Curated recommendations
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}

            {step === 'pool' && agentLink?.trustedCustomers && (
              <motion.div
                key="pool"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3 sm:space-y-4 pb-16 sm:pb-20"
              >
                <div className="pt-4 sm:pt-6 mb-3 sm:mb-4">
                  <h3 className="text-lg sm:text-xl lg:text-2xl font-black text-gray-900 uppercase tracking-wide flex items-center gap-2">
                    <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
                    Available Numbers
                  </h3>
                </div>

                {/* Search bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by number or code..."
                    value={poolSearchTerm}
                    onChange={(e) => setPoolSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-white"
                  />
                  {poolSearchTerm && (
                    <button
                      onClick={() => setPoolSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>

                {poolLoading || poolSearching ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                  </div>
                ) : (() => {
                  const displayNumbers = poolSearchTerm.trim() ? poolSearchResults : poolNumbers;
                  return displayNumbers.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <Phone className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="font-medium">
                        {poolSearchTerm.trim() ? 'No numbers matching your search' : 'No numbers available'}
                      </p>
                    </div>
                  ) : (
                  <>
                  <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm bg-white">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gradient-to-r from-orange-50 to-amber-50">
                        <tr>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Number</th>
                          <th className="px-4 sm:px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Category</th>
                          <th className="px-4 sm:px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Action</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {displayNumbers.map((num, i) => {
                          const isSelected = selectedNumbers.some(n => n.numberId === num.number);
                          const categoryColors = num.category ? getCategoryColor(num.category) : null;
                          return (
                            <motion.tr
                              key={num.id}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.03 }}
                              className={clsx(
                                "hover:bg-gray-50 transition-colors",
                                isSelected && "bg-orange-50 border-l-4 border-orange-500"
                              )}
                            >
                              <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                                <span className="text-base sm:text-lg font-mono font-bold text-gray-900">{num.number}</span>
                              </td>
                              <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                                {num.category && categoryColors && (
                                  <span
                                    className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider"
                                    style={{
                                      background: categoryColors.bg,
                                      color: categoryColors.text,
                                      border: `1px solid ${categoryColors.border}`,
                                    }}
                                  >
                                    {num.category}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-center">
                                <motion.button
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => handleSelectNumber(num)}
                                  className={clsx(
                                    "inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                                    isSelected
                                      ? "bg-orange-600 text-white shadow-lg"
                                      : "bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 shadow-md"
                                  )}
                                >
                                  {isSelected ? (
                                    <>
                                      <Check className="w-4 h-4 mr-2" />
                                      Selected
                                    </>
                                  ) : (
                                    <>
                                      Select
                                      <ArrowRight className="w-4 h-4 ml-2" />
                                    </>
                                  )}
                                </motion.button>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                {/* Page navigation - at bottom */}
                {!poolSearchTerm.trim() && (
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-gray-50 border border-gray-200">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-700">
                        Page {poolPage} of {poolTotalPages || 1}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={poolPageSize}
                        onChange={(e) => {
                          setPoolPageSize(Number(e.target.value));
                          setPoolPage(1);
                        }}
                        className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
                      >
                        <option value={10}>10 per page</option>
                        <option value={20}>20 per page</option>
                        <option value={40}>40 per page</option>
                        <option value={80}>80 per page</option>
                      </select>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setPoolPage(p => Math.max(1, p - 1))}
                          disabled={poolPage <= 1 || poolLoading}
                          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Prev
                        </button>
                        <button
                          onClick={() => setPoolPage(p => Math.min(poolTotalPages, p + 1))}
                          disabled={poolPage >= poolTotalPages || poolLoading}
                          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {poolSearchTerm.trim() && poolSearchResults.length > 0 && (
                  <p className="text-sm text-gray-500 text-center">
                    {poolSearchResults.length} result{poolSearchResults.length !== 1 ? 's' : ''} found
                  </p>
                )}
                  </>
                  );
                })()}
              </motion.div>
            )}

            {step === 'search' && (
              <motion.div
                key="search"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-3 sm:space-y-4 pb-16 sm:pb-20"
              >
                {/* Search Heading */}
                <div className="pt-4 sm:pt-6 mb-3 sm:mb-4">
                  <h3 className="text-lg sm:text-xl lg:text-2xl font-black text-gray-900 uppercase tracking-wide flex items-center gap-2">
                    <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
                    Search Numbers
                  </h3>
                </div>

                {/* Modern iOS Glass Search Container with Gradient Lines */}
                <div className="rounded-2xl p-[2px] relative" style={{
                  background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.5), rgba(251, 191, 36, 0.5), rgba(249, 115, 22, 0.5))',
                  boxShadow: '0 4px 16px 0 rgba(249, 115, 22, 0.15)'
                }}>
                  <div className="rounded-2xl p-2 sm:p-3 relative overflow-hidden" style={{
                    background: 'rgba(249, 250, 251, 0.6)',
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.6)'
                  }}>
                    <div className="absolute inset-0 bg-gradient-to-br from-white/50 via-transparent to-transparent pointer-events-none" />
                    <div className="absolute inset-0 rounded-2xl border border-white/60 pointer-events-none" />
                  
                  <div className="relative">
                    <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-orange-500 z-10" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search for Any other number of your choice."
                      className="w-full pl-10 sm:pl-12 pr-3 sm:pr-4 py-3 sm:py-4 rounded-xl sm:rounded-2xl text-gray-900 placeholder:text-gray-400 focus:outline-none font-medium text-sm sm:text-base touch-manipulation relative z-10" style={{
                        background: 'rgba(255, 255, 255, 0.8)',
                        backdropFilter: 'blur(10px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(10px) saturate(180%)',
                        border: '2px solid rgba(249, 115, 22, 0.3)',
                        boxShadow: '0 2px 8px 0 rgba(249, 115, 22, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
                        fontSize: '16px' // Prevent iOS zoom
                      }}
                      onFocus={(e) => {
                        e.target.style.border = '2px solid rgba(249, 115, 22, 0.6)';
                        e.target.style.boxShadow = '0 4px 12px 0 rgba(249, 115, 22, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.9)';
                      }}
                      onBlur={(e) => {
                        e.target.style.border = '2px solid rgba(249, 115, 22, 0.3)';
                        e.target.style.boxShadow = '0 2px 8px 0 rgba(249, 115, 22, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.9)';
                      }}
                    />
                    {isSearching && (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 z-20"
                      >
                        <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />
                      </motion.div>
                    )}
                  </div>
                  </div>
                </div>


                {!isSearching && !searchTerm && similarNumbers.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2 sm:mb-3 lg:mb-4">
                      <h3 className="text-sm sm:text-base lg:text-lg font-black text-gray-900 uppercase tracking-wide px-1">Recommended</h3>
                      {isShowingFallback && (
                          <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium" style={{
                            background: 'rgba(251, 191, 36, 0.15)',
                            backdropFilter: 'blur(10px) saturate(180%)',
                            WebkitBackdropFilter: 'blur(10px) saturate(180%)',
                            border: '1px solid rgba(251, 191, 36, 0.3)',
                            boxShadow: '0 2px 8px 0 rgba(251, 191, 36, 0.1)'
                          }}
                        >
                          <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 text-amber-600" />
                          <span className="text-amber-700 font-semibold">Partial Match</span>
                        </motion.div>
                      )}
                    </div>
                    {isShowingFallback && fallbackMessage && (
                      <motion.p
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4 px-1"
                      >
                        {fallbackMessage}
                      </motion.p>
                    )}
                    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm bg-white">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gradient-to-r from-orange-50 to-amber-50">
                          <tr>
                            <th className="px-4 sm:px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Number</th>
                            <th className="px-4 sm:px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Category</th>
                            <th className="px-4 sm:px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Action</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                      {similarNumbers.map((num, i) => {
                            const isSelected = selectedNumbers.some(n => n.numberId === num.number);
                            const categoryColors = num.category ? getCategoryColor(num.category) : null;
                        return (
                              <motion.tr
                            key={num.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.03 }}
                                  className={clsx(
                                  "hover:bg-gray-50 transition-colors",
                                  isSelected && "bg-orange-50 border-l-4 border-orange-500"
                                  )}
                                >
                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                                  <span className="text-base sm:text-lg font-mono font-bold text-gray-900">
                                    {renderNumberWithHighlights(num.number, isShowingFallback && fallbackPattern ? fallbackPattern : enteredPhone)}
                                  </span>
                                </td>
                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                                  {num.category && categoryColors && (
                                  <span 
                                      className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider"
                                      style={{
                                        background: categoryColors.bg,
                                        color: categoryColors.text,
                                        border: `1px solid ${categoryColors.border}`,
                                    }}
                                  >
                                    {num.category}
                                  </span>
                                  )}
                                </td>
                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-center">
                                  <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => handleSelectNumber(num)}
                              className={clsx(
                                      "inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                                      isSelected
                                        ? "bg-orange-600 text-white shadow-lg"
                                        : "bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 shadow-md"
                                    )}
                                  >
                                    {isSelected ? (
                                      <>
                                        <Check className="w-4 h-4 mr-2" />
                                        Selected
                                      </>
                                    ) : (
                                      <>
                                        Select
                                        <ArrowRight className="w-4 h-4 ml-2" />
                                      </>
                                    )}
                            </motion.button>
                                </td>
                              </motion.tr>
                        );
                      })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {searchResults.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2 sm:mb-3 lg:mb-4">
                      <h3 className="text-sm sm:text-base lg:text-lg font-black text-gray-900 uppercase tracking-wide px-1">Search Results</h3>
                      {showingMostMatching && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-medium" style={{
                            background: 'rgba(251, 191, 36, 0.15)',
                            backdropFilter: 'blur(10px) saturate(180%)',
                            WebkitBackdropFilter: 'blur(10px) saturate(180%)',
                            border: '1px solid rgba(251, 191, 36, 0.3)',
                            boxShadow: '0 2px 8px 0 rgba(251, 191, 36, 0.1)'
                          }}
                        >
                          <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 text-amber-600" />
                          <span className="text-amber-700 font-semibold">Most Matching Results</span>
                        </motion.div>
                      )}
                    </div>
                    {showingMostMatching && (
                      <motion.p
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4 px-1"
                      >
                        No exact matches found. Showing numbers with the most similar patterns to your search.
                      </motion.p>
                    )}
                    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm bg-white">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gradient-to-r from-orange-50 to-amber-50">
                          <tr>
                            <th className="px-4 sm:px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Number</th>
                            <th className="px-4 sm:px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Category</th>
                            <th className="px-4 sm:px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Action</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                      {searchResults.map((num, i) => {
                            const isSelected = selectedNumbers.some(n => n.numberId === num.number);
                            const categoryColors = num.category ? getCategoryColor(num.category) : null;
                        return (
                              <motion.tr
                            key={num.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.03 }}
                              className={clsx(
                                  "hover:bg-gray-50 transition-colors",
                                  isSelected && "bg-orange-50 border-l-4 border-orange-500"
                                )}
                              >
                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                                  <span className="text-base sm:text-lg font-mono font-bold text-gray-900">
                                    {searchTerm 
                                      ? renderNumberWithHighlights(num.number, searchTerm)
                                      : renderNumberWithHighlights(num.number, enteredPhone)
                                    }
                                  </span>
                                </td>
                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                                  {num.category && categoryColors && (
                                  <span 
                                      className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider"
                                      style={{
                                        background: categoryColors.bg,
                                        color: categoryColors.text,
                                        border: `1px solid ${categoryColors.border}`,
                                    }}
                                  >
                                    {num.category}
                                  </span>
                                  )}
                                </td>
                                <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-center">
                                  <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => handleSelectNumber(num)}
                              className={clsx(
                                      "inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                                      isSelected
                                        ? "bg-orange-600 text-white shadow-lg"
                                        : "bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-600 hover:to-amber-600 shadow-md"
                                    )}
                                  >
                                    {isSelected ? (
                                      <>
                                        <Check className="w-4 h-4 mr-2" />
                                        Selected
                                      </>
                                    ) : (
                                      <>
                                        Select
                                        <ArrowRight className="w-4 h-4 ml-2" />
                                      </>
                                    )}
                            </motion.button>
                                </td>
                              </motion.tr>
                        );
                      })}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Load More Button */}
                    {searchHasMore && (
                      <div className="flex justify-center mt-6">
                        <motion.button
                          whileHover={{ scale: 1.02, y: -2 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleLoadMore}
                          disabled={isLoadingMore}
                          className="relative group overflow-hidden"
                          style={{ maxWidth: '280px', width: '100%' }}
                        >
                          {/* Button background with glass morphism */}
                          <div className="absolute inset-0 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 rounded-xl sm:rounded-2xl shadow-xl sm:shadow-2xl shadow-orange-500/40" />
                          <div className="absolute inset-0 bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 rounded-xl sm:rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                          
                          {/* Shine effect */}
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                          
                          {/* Button content */}
                          <div className="relative py-3 sm:py-3.5 md:py-4 rounded-xl sm:rounded-2xl font-black text-sm sm:text-base md:text-lg text-white flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed px-6 sm:px-8">
                            {isLoadingMore ? (
                              <>
                                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                                <span className="text-xs sm:text-sm">Loading more...</span>
                              </>
                            ) : (
                              <>
                                <span>Load More Numbers</span>
                                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
                              </>
                            )}
                          </div>
                        </motion.button>
                      </div>
                    )}
                  </div>
                )}

                {/* No Results Message */}
                {searchTerm.trim() && !isSearching && searchResults.length === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center py-12 sm:py-16 px-4"
                  >
                    <div className="flex flex-col items-center text-center max-w-md">
                      <div className="p-4 rounded-full bg-gray-100 mb-4">
                        <Search className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" />
                      </div>
                      <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
                        No Numbers Found
                      </h3>
                      <p className="text-sm sm:text-base text-gray-600 mb-1">
                        No numbers matching "<span className="font-semibold text-gray-900">{searchTerm}</span>" were found in the available categories.
                      </p>
                      {agentLink?.allowedCategories && agentLink.allowedCategories.length > 0 && (
                        <p className="text-xs sm:text-sm text-gray-500 mt-2">
                          Available categories: {agentLink.allowedCategories.join(', ')}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

            {step === 'plans' && (
              <motion.div
                key="plans"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6 pb-40"
              >
                <div className="text-center mb-4 sm:mb-6">
                   <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-800">Choose Plan</h2>
                </div>

                {selectedNumbers.map((num, numIndex) => {
                  // Filter plans based on the number's category (case-insensitive)
                  const filteredPlans = plans.filter(plan => 
                    plan.category?.toLowerCase() === num.category?.toLowerCase()
                  );
                  
                  return (
                  <div key={num.numberId} className="space-y-4 mb-8">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-1 h-6 bg-gradient-to-b from-orange-500 to-amber-500 rounded-full"></div>
                        <h3 className="font-bold text-lg sm:text-xl text-slate-800">{num.number}</h3>
                        {num.category && (
                          <span className="text-xs font-bold text-orange-600 uppercase tracking-wider bg-orange-100 px-2 py-1 rounded-full">
                            {num.category}
                          </span>
                        )}
                    </div>

                    {filteredPlans.length === 0 ? (
                      <div className="p-6 bg-white/60 backdrop-blur-xl border border-white/60 rounded-2xl text-center shadow-lg">
                        <p className="text-slate-600 font-semibold">No plans available for {num.category} category</p>
                        <p className="text-sm text-slate-500 mt-1">Please contact support</p>
                      </div>
                    ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                        {filteredPlans.map((plan, i) => {
                          const isSelected = selectedPlans[num.numberId] === plan.name;
                          return (
                             <motion.button
                                key={plan.id}
                                type="button"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: (numIndex * 0.1) + (i * 0.05) }}
                                whileHover={{ scale: 1.02, y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => handlePlanSelect(num.numberId, plan.name)}
                                className={clsx(
                                    "relative p-4 sm:p-5 rounded-xl sm:rounded-2xl border transition-all duration-300 cursor-pointer text-left overflow-hidden backdrop-blur-2xl group",
                                    isSelected
                                        ? "bg-gradient-to-br from-orange-500/90 to-amber-500/90 border-orange-400/60 shadow-2xl shadow-orange-500/40"
                                        : "bg-white/60 border-orange-400/40 hover:border-orange-400/60 hover:shadow-2xl shadow-lg"
                                )}
                                style={{
                                  boxShadow: isSelected 
                                    ? '0 20px 25px -5px rgba(249, 115, 22, 0.3), 0 10px 10px -5px rgba(249, 115, 22, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
                                    : '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.5)'
                                }}
                             >
                                {/* Glass morphism overlays */}
                                <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-white/10 to-transparent rounded-xl sm:rounded-2xl pointer-events-none" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent rounded-xl sm:rounded-2xl pointer-events-none" />
                                <div className="absolute inset-0 rounded-xl sm:rounded-2xl border border-white/30 pointer-events-none" />
                                
                                {/* Shine effect on hover */}
                                {!isSelected && (
                                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 rounded-xl sm:rounded-2xl" />
                                )}
                                
                                {/* Selection indicator - top right */}
                                {isSelected && (
                                  <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="absolute top-2 right-2 w-6 h-6 sm:w-7 sm:h-7 bg-white rounded-full flex items-center justify-center shadow-lg z-10"
                                  >
                                    <Check className="w-4 h-4 text-orange-600" />
                                  </motion.div>
                                )}
                                
                                {/* Content */}
                                <div className="relative z-10">
                                    <h4 className={clsx(
                                      "font-bold text-base sm:text-lg mb-2",
                                      isSelected ? "text-white" : "text-slate-800"
                                    )}>
                                      {plan.name}
                                    </h4>
                                    <div className={clsx(
                                      "text-2xl sm:text-3xl font-black mb-2 flex items-baseline gap-1",
                                      isSelected ? "text-white" : "text-slate-800"
                                    )}>
                                        {plan.amount}
                                        <span className={clsx(
                                          "text-xs sm:text-sm font-bold",
                                          isSelected ? "text-white/80" : "text-slate-500"
                                        )}>
                                          AED/Month
                                        </span>
                                    </div>
                                    <p className={clsx(
                                      "text-xs sm:text-sm leading-relaxed mb-3 font-medium",
                                      isSelected ? "text-white/90" : "text-slate-600"
                                    )}>
                                      {plan.benefits}
                                    </p>
                                    {plan.duration && (
                                        <div className="flex items-center gap-1 sm:gap-2 flex-nowrap">
                                            <span className={clsx(
                                              "text-[9px] sm:text-xs font-semibold uppercase tracking-wide whitespace-nowrap",
                                              isSelected ? "text-white/80" : "text-slate-500"
                                            )}>
                                              Contract Duration:
                                            </span>
                                            <div className={clsx(
                                                "inline-block px-1.5 sm:px-2 lg:px-3 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[9px] sm:text-[10px] lg:text-xs font-bold uppercase tracking-wide backdrop-blur-sm border flex-shrink-0",
                                                isSelected
                                                  ? "bg-white/20 text-white border-white/30"
                                                  : "bg-orange-100/80 text-orange-700 border-orange-200/50 shadow-sm"
                                            )}>
                                                {plan.duration}
                                            </div>
                                        </div>
                                    )}
                                </div>
                             </motion.button>
                          );
                        })}
                    </div>
                    )}
                  </div>
                  );
                })}
              </motion.div>
            )}

            {step === 'details' && (
              <motion.div
                key="details"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-5"
              >
                <div className="text-center mb-6">
                   <h2 className="text-3xl font-black text-slate-800 mb-2">Your Details</h2>
                   <p className="text-slate-600 font-medium">Almost there! Just a few more details</p>
                </div>

                {/* Selected Numbers & Plans Summary */}
                <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl border-2 border-orange-200 p-5 mb-6">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-orange-600" />
                    Selected Numbers & Plans
                  </h3>
                  <div className="space-y-3">
                    {selectedNumbers.map((n) => {
                      const selectedPlan = plans.find(p => p.name === selectedPlans[n.numberId]);
                      return (
                        <motion.div
                          key={n.numberId}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-white rounded-xl border border-orange-200 p-4 shadow-sm"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg flex items-center justify-center">
                                <Phone className="w-5 h-5 text-white" />
                              </div>
                              <div>
                                <div className="font-bold text-slate-800 text-lg">{n.number}</div>
                                {n.category && (
                                  <div className="text-xs font-semibold text-orange-600 uppercase tracking-wide">
                                    {n.category}
                                  </div>
                                )}
                              </div>
                            </div>
                            {selectedPlan ? (
                              <div className="text-right">
                                <div className="font-bold text-orange-600 text-sm">{selectedPlan.name}</div>
                                <div className="text-xs text-slate-600 font-semibold">{selectedPlan.amount} AED/Month</div>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 font-semibold">No plan selected</span>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
                            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 block">Full Name</label>
                            <input
                                required
                                type="text"
                                value={formData.customerName}
                                onChange={e => setFormData({...formData, customerName: e.target.value})}
                                className="w-full bg-transparent text-gray-900 font-medium text-base focus:outline-none py-2 touch-manipulation"
                                placeholder="Mohammad"
                            />
                        </div>

                        <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
                            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 block">Contact Number</label>
                            <input
                                required
                                type="tel"
                                value={formData.customerPhone}
                                onChange={e => setFormData({...formData, customerPhone: e.target.value})}
                                className="w-full bg-transparent text-gray-900 font-medium text-base focus:outline-none py-2 touch-manipulation"
                                placeholder="050 000 0000"
                            />
                        </div>

                        <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
                            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 block">Delivery Address</label>
                            <input
                                required
                                type="text"
                                value={formData.customerAddress}
                                onChange={e => setFormData({...formData, customerAddress: e.target.value})}
                                className="w-full bg-transparent text-gray-900 font-medium text-base focus:outline-none py-2 touch-manipulation"
                                placeholder="Building, Street, Area"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                             <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
                                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 block">Emirate</label>
                                <select
                                    value={formData.emirate}
                                    onChange={e => setFormData({...formData, emirate: e.target.value})}
                                    className="w-full bg-transparent text-slate-800 font-medium focus:outline-none appearance-none py-2 touch-manipulation text-base"
                                >
                                    <option value="">Select</option>
                                    {uaeEmirates.map(e => <option key={e} value={e}>{e}</option>)}
                                </select>
                            </div>
                            <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
                                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 block">Nationality</label>
                                <select
                                    value={formData.nationality}
                                    onChange={e => setFormData({...formData, nationality: e.target.value})}
                                    className="w-full bg-transparent text-slate-800 font-medium focus:outline-none appearance-none py-2 touch-manipulation text-base"
                                >
                                    <option value="">Select</option>
                                    {countryList.map(c => <option key={c.code} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                             <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
                                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 block">Gender</label>
                                <select
                                    value={formData.gender}
                                    onChange={e => setFormData({...formData, gender: e.target.value})}
                                    className="w-full bg-transparent text-slate-800 font-medium focus:outline-none appearance-none py-2 touch-manipulation text-base"
                                >
                                    <option value="">Select</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                </select>
                            </div>
                            <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
                                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 block">Age</label>
                                <input
                                    type="number"
                                    value={formData.customerAge}
                                    onChange={e => setFormData({...formData, customerAge: e.target.value})}
                                    className="w-full bg-transparent text-slate-800 font-medium focus:outline-none"
                                    placeholder="25"
                                />
                            </div>
                        </div>

                         <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
                            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 block">Language</label>
                            <select
                                value={formData.language}
                                onChange={e => setFormData({...formData, language: e.target.value})}
                                className="w-full bg-transparent text-slate-800 font-medium focus:outline-none appearance-none"
                            >
                                <option value="English">English</option>
                                <option value="Arabic">Arabic</option>
                                <option value="Hindi">Hindi</option>
                                <option value="Urdu">Urdu</option>
                            </select>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border-2 border-gray-100 p-4 flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="eid"
                            checked={formData.hasEmirateId}
                            onChange={e => setFormData({...formData, hasEmirateId: e.target.checked})}
                            className="w-6 h-6 rounded border-2 border-slate-300 text-orange-500 focus:ring-orange-500 touch-manipulation cursor-pointer"
                        />
                        <label htmlFor="eid" className="text-sm font-bold text-slate-700">
                          I have a valid Emirates ID
                        </label>
                    </div>

                    <motion.button
                        whileHover={!isSubmitting ? { scale: 1.02 } : {}}
                        whileTap={!isSubmitting ? { scale: 0.98 } : {}}
                        type="submit"
                        disabled={isSubmitting}
                        className={`w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white py-5 rounded-2xl font-bold text-lg shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2 transition-all touch-manipulation min-h-[56px] ${
                          isSubmitting 
                            ? 'opacity-75 cursor-not-allowed' 
                            : 'active:scale-95 active:shadow-lg hover:shadow-2xl hover:shadow-orange-500/30'
                        }`}
                    >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Submitting...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-5 h-5" />
                            <span>Submit Request</span>
                          </>
                        )}
                    </motion.button>
                </form>
              </motion.div>
            )}

            {step === 'success' && (
               <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="flex flex-col items-center justify-center text-center py-16"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/30 mb-8"
                >
                    <CheckCircle className="w-12 h-12 text-white" strokeWidth={3} />
                </motion.div>
                <h2 className="text-4xl font-black text-slate-800 mb-3">All Set!</h2>
                <p className="text-slate-600 max-w-sm mx-auto mb-8 leading-relaxed font-medium">
                    Thank you, <span className="text-orange-600 font-bold">{formData.customerName}</span>. We'll contact you shortly on <span className="text-orange-600 font-bold">{formData.customerPhone}</span>.
                </p>
                <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-md p-5 flex items-center gap-3">
                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                      <Shield className="w-6 h-6 text-green-600" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-slate-800">Secure & Encrypted</p>
                      <p className="text-xs text-slate-600">Your data is protected</p>
                    </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        <AnimatePresence>
          {(step === 'search' || step === 'pool') && selectedNumbers.length > 0 && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-50 p-4"
            >
              <div className="max-w-md mx-auto px-2">
                <div className="relative">
                  {/* Glass morphism glow effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-500/30 to-amber-500/30 rounded-2xl sm:rounded-3xl blur-2xl"></div>
                  
                  {/* Main glass card */}
                  <div className="relative bg-white/70 backdrop-blur-2xl rounded-2xl sm:rounded-3xl border border-white/60 shadow-2xl overflow-hidden">
                    {/* Top gradient line */}
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500"></div>
                    
                    {/* Glass overlay effects */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-white/10 to-transparent rounded-2xl sm:rounded-3xl pointer-events-none"></div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent rounded-2xl sm:rounded-3xl pointer-events-none"></div>

                    <div className="relative p-3 sm:p-4">
                      {/* Header - Compact */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg">
                            <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                          </div>
                          <div>
                            <h3 className="text-xs sm:text-sm font-black text-gray-900 uppercase tracking-wide">Selected Numbers</h3>
                            <p className="text-[10px] sm:text-xs text-gray-600 font-semibold">{selectedNumbers.length} number{selectedNumbers.length > 1 ? 's' : ''} ready</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 bg-gradient-to-br from-orange-500 to-amber-500 text-white font-black text-base sm:text-lg px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl shadow-lg backdrop-blur-sm border border-white/30">
                          {selectedNumbers.length}
                          <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                      </div>

                      {/* Selected Numbers - Compact scrollable */}
                      <div className="mb-3 max-h-20 sm:max-h-24 overflow-y-auto scrollbar-hide">
                        <div className="flex flex-wrap gap-1.5 sm:gap-2">
                          {selectedNumbers.map((n, i) => (
                            <motion.div
                              key={n.numberId}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={{ delay: i * 0.02, type: "spring", stiffness: 400 }}
                              className="group relative"
                            >
                              <div className="bg-white/80 backdrop-blur-sm border border-gray-200/60 text-gray-900 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-sm hover:shadow-md transition-all">
                                <span className="text-orange-600 font-mono">{n.number}</span>
                                <motion.button
                                  whileHover={{ scale: 1.2, rotate: 90 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => handleSelectNumber({ id: n.numberId, number: n.number } as any)}
                                  className="w-4 h-4 sm:w-5 sm:h-5 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white transition-colors flex-shrink-0"
                                >
                                  <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                </motion.button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>

                      {/* Continue Button - Compact */}
                      <div className="flex justify-center">
                        <motion.button
                          whileHover={{ scale: 1.02, y: -1 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleContinueToPlans}
                          disabled={loadingPlans}
                          className="bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 hover:from-orange-600 hover:via-amber-600 hover:to-orange-600 text-white px-6 sm:px-8 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-sm sm:text-base shadow-xl shadow-orange-500/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 relative overflow-hidden group"
                        >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                        {loadingPlans ? (
                          <>
                            <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                            <span className="text-xs sm:text-sm">Preparing plans...</span>
                          </>
                        ) : (
                          <>
                            <span>Continue to Plans</span>
                            <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
                          </>
                        )}
                      </motion.button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {step === 'plans' && selectedNumbers.length > 0 && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-50 p-4"
            >
              <div className="max-w-md mx-auto">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-amber-500 rounded-3xl blur-xl opacity-40"></div>
                  <div className="relative bg-white/95 backdrop-blur-2xl rounded-3xl border-2 border-orange-200/60 shadow-2xl overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500"></div>

                    <div className="p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl flex items-center justify-center shadow-lg">
                            <ShoppingCart className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">Your Selection</h3>
                            <p className="text-xs text-slate-500 font-semibold">
                              {Object.keys(selectedPlans).length} of {selectedNumbers.length} plan{selectedNumbers.length > 1 ? 's' : ''} selected
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 bg-gradient-to-br from-orange-500 to-amber-500 text-white font-black text-lg px-4 py-2 rounded-2xl shadow-lg">
                          {Object.keys(selectedPlans).length}/{selectedNumbers.length}
                        </div>
                      </div>

                      <div className="mb-4 max-h-32 overflow-y-auto scrollbar-hide">
                        <div className="space-y-2">
                          {selectedNumbers.map((n, i) => {
                            const selectedPlan = plans.find(p => p.name === selectedPlans[n.numberId]);
                            return (
                              <motion.div
                                key={n.numberId}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.03, type: "spring", stiffness: 400 }}
                                className={clsx(
                                  "p-3 rounded-xl border-2 transition-all",
                                  selectedPlan
                                    ? "bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200"
                                    : "bg-slate-50 border-slate-200"
                                )}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Phone className="w-4 h-4 text-orange-600" />
                                    <span className="font-bold text-slate-800 text-sm">{n.number}</span>
                                  </div>
                                  {selectedPlan ? (
                                    <div className="flex items-center gap-2">
                                      <div className="text-right">
                                        <div className="text-xs font-bold text-orange-600">{selectedPlan.name}</div>
                                        <div className="text-xs text-slate-600">{selectedPlan.amount} AED/Month</div>
                                      </div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedPlans(prev => {
                                            const newPlans = { ...prev };
                                            delete newPlans[n.numberId];
                                            return newPlans;
                                          });
                                        }}
                                        className="w-6 h-6 bg-red-100 hover:bg-red-200 rounded-full flex items-center justify-center transition-colors group/x"
                                      >
                                        <X className="w-3 h-3 text-red-600 group-hover/x:text-red-700" />
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-400 font-semibold">Select a plan</span>
                                  )}
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>

                      {selectedNumbers.every(n => selectedPlans[n.numberId]) ? (
                        <motion.button
                          initial={{ scale: 0.95 }}
                          animate={{ scale: 1 }}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setStep('details')}
                          className="w-full bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 hover:from-orange-600 hover:via-amber-600 hover:to-orange-600 text-white py-4 rounded-2xl font-black text-base shadow-2xl shadow-orange-500/30 transition-all flex items-center justify-center gap-2 relative overflow-hidden group"
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                          <span>Continue to Details</span>
                          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </motion.button>
                      ) : (
                        <div className="w-full bg-slate-100 text-slate-400 py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 cursor-not-allowed">
                          <AlertCircle className="w-5 h-5" />
                          <span>Select plans for all numbers</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
    </>
  );
}
