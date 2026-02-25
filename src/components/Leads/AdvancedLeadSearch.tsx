/**
 * ===============================================================================
 * ADVANCED LEAD SEARCH COMPONENT - ADMIN-ONLY ADVANCED FILTERING
 * ===============================================================================
 * 
 * This component provides comprehensive filtering capabilities for leads,
 * exclusively available to admin users. It includes filters for all lead
 * attributes including plan details, dates, customer information, and more.
 * 
 * FEATURES:
 * 
 * 1. COMPREHENSIVE FILTERING
 *    - Customer information filters (name, phone, address)
 *    - Plan and number filters (plan name, number category, group)
 *    - Date range filters (created, updated, follow-up dates)
 *    - Status and assignment filters
 *    - Location and demographic filters
 * 
 * 2. ADVANCED SEARCH OPTIONS
 *    - Multiple filter combinations
 *    - Exact match and partial match options
 *    - Date range pickers with presets
 *    - Multi-select dropdowns for categories
 * 
 * 3. ADMIN-ONLY ACCESS
 *    - Restricted to admin role only
 *    - Comprehensive access to all lead data
 *    - Advanced analytics and reporting capabilities
 * 
 * 4. PERFORMANCE OPTIMIZED
 *    - Debounced search inputs
 *    - Efficient filter application
 *    - Real-time filter updates
 * 
 * USAGE:
 * This component is used by admin users to perform detailed lead analysis
 * and filtering across all available lead attributes.
 * ===============================================================================
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, getDocs, query, where, orderBy, Timestamp, startAfter, QueryDocumentSnapshot, DocumentData, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { Lead } from '../../types';
import { 
  Search, 
  Calendar, 
  Package, 
  Clock,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Settings,
  Download,
  RefreshCw,
  Tag,
  Users,
  ChevronDown as ChevronDownIcon,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

interface AdvancedSearchFilters {
  // Customer Information
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  customerAge: {
    min: number | '';
    max: number | '';
  };
  gender: string;
  language: string;
  hasEmirateId: string; // 'all' | 'yes' | 'no'
  
  // Plan and Number Information
  planName: string[];
  numberCategory: string[];
  numberGroup: string[];
  numberType: string;
  productType: string;
  
  // Status and Assignment
  status: string[];
  agentId: string;
  coordinatorId: string;
  verifierId: string;
  teamId: string;
  managerId: string;
  
  // Location Information
  emirate: string;
  area: string;
  country: string;
  
  // Date Filters
  createdDateRange: {
    from: string;
    to: string;
  };
  activatedDateRange: {
    from: string;
    to: string;
  };
  followUpDateRange: {
    from: string;
    to: string;
  };
  startDateRange: {
    from: string;
    to: string;
  };
  
  // Payment and Business
  advancePayment: string; // 'all' | 'yes' | 'no'
  
  // Verification
  hasVerificationMedia: string; // 'all' | 'yes' | 'no'
  verificationNotes: string;
  coordinatorNotes: string;
  
  // Performance
  sharedWith: string;
  
  // Time-based
  startTime: string;
}

interface AdvancedLeadSearchProps {
  leads: Lead[];
  onFiltersChange: (filters: AdvancedSearchFilters) => void;
  onExportResults: (filteredLeads: Lead[]) => void;
  onExportEtisalatSheets?: (filteredLeads: Lead[]) => void;
  isVisible: boolean;
  onClose: () => void;
}

const NUMBER_CATEGORIES = [
  'Standard', 'Silver', 'Silver Plus', 'Gold', 'Gold Plus', 'Platinum'
];

const NUMBER_GROUPS = [
  'G1', 'G2', 'G3', 'G4', 'G5'
];

const STATUS_OPTIONS = [
  'verified', 'pending', 'assigned', 'activated', 'activated_non_verified', 'rejected', 'follow_up'
];

function getStatusDisplayText(status: string | undefined): string {
  if (!status) return 'UNKNOWN';
  // Convert "assigned" to "Processed with Etisalat" for UI display only
  if (status === 'assigned') {
    return 'PROCESSED WITH ETISALAT';
  }
  // Convert "assigned_to_cord" to "ASSIGNED TO ACTIVATION" for UI display only
  if (status === 'assigned_to_cord') {
    return 'ASSIGNED TO ACTIVATION';
  }
  return status.replace(/_/g, ' ').toUpperCase();
}

export function AdvancedLeadSearch({ 
  leads, 
  onFiltersChange, 
  onExportResults, 
  onExportEtisalatSheets, 
  isVisible, 
  onClose 
}: AdvancedLeadSearchProps) {
  const { isAdmin, isCoordinator } = useAuthStore();
  const [filters, setFilters] = useState<AdvancedSearchFilters>({
    // Customer Information
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    customerAge: { min: '', max: '' },
    gender: '',
    language: '',
    hasEmirateId: 'all',
    
      // Plan and Number Information
      planName: [],
      numberCategory: [],
      numberGroup: [],
    numberType: '',
    productType: '',
    
    // Status and Assignment
    status: [],
    agentId: '',
    coordinatorId: '',
    verifierId: '',
    teamId: '',
    managerId: '',
    
    // Location Information
    emirate: '',
    area: '',
    country: '',
    
    // Date Filters
    createdDateRange: { from: '', to: '' },
    activatedDateRange: { from: '', to: '' },
    followUpDateRange: { from: '', to: '' },
    startDateRange: { from: '', to: '' },
    
    // Payment and Business
    advancePayment: 'all',
    
    // Verification
    hasVerificationMedia: 'all',
    verificationNotes: '',
    coordinatorNotes: '',
    
    // Performance
    sharedWith: '',
    
    // Time-based
    startTime: ''
  });

  const [expandedSections, setExpandedSections] = useState({
    plan: true
  });

  const [showResults, setShowResults] = useState(false);
  const [availablePlanNames, setAvailablePlanNames] = useState<string[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [fetchedLeads, setFetchedLeads] = useState<Lead[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(false);

  // Only render for admin and coordinator roles
  if (!isAdmin() && !isCoordinator()) {
    return null;
  }

  // Fetch plan names from Firebase
  useEffect(() => {
    const fetchPlanNames = async () => {
      setLoadingPlans(true);
      try {
        const plansQuery = query(collection(db, 'plans'));
        const plansSnapshot = await getDocs(plansQuery);
        const planNames: string[] = [];
        
        plansSnapshot.forEach((doc) => {
          const planData = doc.data();
          if (planData.name) {
            planNames.push(planData.name);
          }
        });
        
        // Deduplicate plan names and sort
        const uniquePlanNames = Array.from(new Set(planNames)).sort();
        setAvailablePlanNames(uniquePlanNames);
      } catch (error) {
        console.error('Error fetching plan names:', error);
        toast.error('Failed to load plan names');
      } finally {
        setLoadingPlans(false);
      }
    };

    fetchPlanNames();
  }, []);

  // Fetch all leads from Firebase based on filters
  const fetchLeadsFromFirebase = useCallback(async (searchFilters: AdvancedSearchFilters) => {
    setLoadingLeads(true);
    try {
      let baseQuery = collection(db, 'leads');
      let constraints: any[] = [];

      // Build Firestore query constraints based on filters
      // Status filter - support multiple statuses
      if (searchFilters.status && searchFilters.status.length > 0) {
        if (searchFilters.status.length === 1) {
          constraints.push(where('status', '==', searchFilters.status[0]));
        } else {
          // Firestore 'in' operator supports up to 10 values
          const statusChunks = [];
          for (let i = 0; i < searchFilters.status.length; i += 10) {
            statusChunks.push(searchFilters.status.slice(i, i + 10));
          }
          // For now, we'll use the first chunk. For more than 10, we'd need to combine queries
          if (statusChunks.length > 0) {
            constraints.push(where('status', 'in', statusChunks[0]));
          }
        }
      }

      // Date range filters - these can be added to Firestore queries
      if (searchFilters.createdDateRange.from) {
        const fromDate = new Date(searchFilters.createdDateRange.from);
        fromDate.setHours(0, 0, 0, 0);
        constraints.push(where('createdAt', '>=', Timestamp.fromDate(fromDate)));
      }
      if (searchFilters.createdDateRange.to) {
        const toDate = new Date(searchFilters.createdDateRange.to);
        toDate.setHours(23, 59, 59, 999);
        constraints.push(where('createdAt', '<=', Timestamp.fromDate(toDate)));
      }

      // Agent filter
      if (searchFilters.agentId) {
        constraints.push(where('agentId', '==', searchFilters.agentId));
      }

      // Coordinator filter
      if (searchFilters.coordinatorId) {
        constraints.push(where('coordinatorId', '==', searchFilters.coordinatorId));
      }

      // Team filter
      if (searchFilters.teamId) {
        constraints.push(where('teamId', '==', searchFilters.teamId));
      }

      // Add ordering
      constraints.push(orderBy('createdAt', 'desc'));

      // Fetch all leads with pagination to ensure we get ALL matching leads
      let allLeads: Lead[] = [];
      let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
      const BATCH_SIZE = 1000; // Firestore can handle up to several thousand, but we'll paginate to be safe
      let hasMore = true;
      let batchIndex = 0;

      while (hasMore) {
        let batchConstraints = [...constraints];
        
        // Add pagination if we have a last document
        if (lastDoc) {
          batchConstraints.push(startAfter(lastDoc));
        }
        
        // Add limit for this batch
        batchConstraints.push(limit(BATCH_SIZE));

        const q = query(baseQuery, ...batchConstraints);
        const snapshot = await getDocs(q);

        // Convert Firestore documents to Lead objects
        const batchLeads = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
          } as Lead;
        });

        allLeads = [...allLeads, ...batchLeads];

        // Check if there are more documents to fetch
        hasMore = snapshot.docs.length === BATCH_SIZE;
        if (hasMore && snapshot.docs.length > 0) {
          lastDoc = snapshot.docs[snapshot.docs.length - 1];
        } else {
          hasMore = false;
        }
        batchIndex += 1;
      }
      // Apply in-memory filters for complex queries that can't be done in Firestore
      // (plan names, number categories, number groups, customer info, etc.)
      allLeads = allLeads.filter(lead => {
        // Plan Name filter
        if (searchFilters.planName.length > 0 && !lead.plans?.some(plan => 
          searchFilters.planName.some(selectedPlan => 
            plan.plan?.toLowerCase().includes(selectedPlan.toLowerCase())
          )
        )) {
          return false;
        }

        // Number Category filter
        if (searchFilters.numberCategory.length > 0 && !lead.plans?.some(plan => 
          searchFilters.numberCategory.includes(plan.category)
        )) {
          return false;
        }

        // Number Group filter
        if (searchFilters.numberGroup.length > 0 && !lead.plans?.some(plan => 
          plan.group && searchFilters.numberGroup.includes(plan.group)
        )) {
          return false;
        }

        // Customer Name filter
        if (searchFilters.customerName && !lead.customerName?.toLowerCase().includes(searchFilters.customerName.toLowerCase())) {
          return false;
        }

        // Customer Phone filter
        if (searchFilters.customerPhone && !lead.customerNumber?.includes(searchFilters.customerPhone) && !lead.customerPhone?.includes(searchFilters.customerPhone)) {
          return false;
        }

        // Customer Address filter
        if (searchFilters.customerAddress && !lead.customerAddress?.toLowerCase().includes(searchFilters.customerAddress.toLowerCase())) {
          return false;
        }

        // Activated Date Range filter (in-memory since we can only have one range query in Firestore)
        if (searchFilters.activatedDateRange.from || searchFilters.activatedDateRange.to) {
          const activatedAtRaw: any = (lead as any).activatedAt || lead.updatedAt;
          if (!activatedAtRaw) return false;
          
          // Handle Firestore timestamp conversion
          const leadActivatedAt = typeof activatedAtRaw.toDate === 'function'
            ? activatedAtRaw.toDate()
            : activatedAtRaw instanceof Date
              ? activatedAtRaw
              : new Date(activatedAtRaw);
          
        if (searchFilters.activatedDateRange.from) {
          const fromDate = new Date(searchFilters.activatedDateRange.from);
            fromDate.setHours(0, 0, 0, 0);
            if (leadActivatedAt < fromDate) return false;
        }
        if (searchFilters.activatedDateRange.to) {
          const toDate = new Date(searchFilters.activatedDateRange.to);
          toDate.setHours(23, 59, 59, 999);
            if (leadActivatedAt > toDate) return false;
          }
        }

        // Follow-up Date Range filter
        if (searchFilters.followUpDateRange.from || searchFilters.followUpDateRange.to) {
          const followUpDate = (lead as any).followUpDate;
          if (!followUpDate) return false;
          const leadFollowUpDate = new Date(followUpDate);
          if (searchFilters.followUpDateRange.from) {
            const fromDate = new Date(searchFilters.followUpDateRange.from);
            if (leadFollowUpDate < fromDate) return false;
          }
          if (searchFilters.followUpDateRange.to) {
            const toDate = new Date(searchFilters.followUpDateRange.to);
            toDate.setHours(23, 59, 59, 999);
            if (leadFollowUpDate > toDate) return false;
          }
        }

        // Emirate filter
        if (searchFilters.emirate && (lead as any).emirate !== searchFilters.emirate) {
          return false;
        }

        // Area filter
        if (searchFilters.area && (lead as any).area !== searchFilters.area) {
          return false;
        }

        // Gender filter
        if (searchFilters.gender && (lead as any).gender !== searchFilters.gender) {
          return false;
        }

        // Language filter
        if (searchFilters.language && (lead as any).language !== searchFilters.language) {
          return false;
        }

        // Has Emirate ID filter
        if (searchFilters.hasEmirateId === 'yes' && !(lead as any).emirateId) {
          return false;
        }
        if (searchFilters.hasEmirateId === 'no' && (lead as any).emirateId) {
          return false;
        }

        // Advance Payment filter
        if (searchFilters.advancePayment === 'yes' && !(lead as any).advancePayment) {
          return false;
        }
        if (searchFilters.advancePayment === 'no' && (lead as any).advancePayment) {
          return false;
        }

        // Has Verification Media filter
        if (searchFilters.hasVerificationMedia === 'yes' && !(lead as any).verificationMedia) {
          return false;
        }
        if (searchFilters.hasVerificationMedia === 'no' && (lead as any).verificationMedia) {
          return false;
        }

        // Verification Notes filter
        if (searchFilters.verificationNotes && !(lead as any).verificationNotes?.toLowerCase().includes(searchFilters.verificationNotes.toLowerCase())) {
          return false;
        }

        // Coordinator Notes filter
        if (searchFilters.coordinatorNotes && !(lead as any).coordinatorNotes?.toLowerCase().includes(searchFilters.coordinatorNotes.toLowerCase())) {
          return false;
        }

        return true;
      });

      setFetchedLeads(allLeads);
      return allLeads;
    } catch (error) {
      console.error('[ADV SEARCH] Error fetching leads from Firebase:', error);
      toast.error('Failed to fetch leads. Please try again.');
      setFetchedLeads([]);
      return [];
    } finally {
      setLoadingLeads(false);
    }
  }, []);

  // Apply filters and get filtered leads
  const filteredLeads = useMemo(() => {
    // If filters have been applied (showResults is true) or we are loading, ALWAYS use fetchedLeads
    // Never fall back to the local 200-lead cache once search is active
    let leadsToFilter: Lead[];
    if (showResults || loadingLeads) {
      leadsToFilter = fetchedLeads;

      // If we're showing results and not loading, but fetchedLeads is empty, return empty to avoid 200-limit cache
      if (!loadingLeads && fetchedLeads.length === 0) {
        return [];
      }
    } else {
      // Before filters are applied, use leads prop for preview
      leadsToFilter = leads;
    }
    
    const result = leadsToFilter.filter(lead => {
      // Plan and Number Filters
      if (filters.planName.length > 0 && !lead.plans?.some(plan => 
        filters.planName.some(selectedPlan => 
          plan.plan?.toLowerCase().includes(selectedPlan.toLowerCase())
        )
      )) {
        return false;
      }
      if (filters.numberCategory.length > 0 && !lead.plans?.some(plan => 
        filters.numberCategory.includes(plan.category)
      )) {
        return false;
      }
      if (filters.numberGroup.length > 0 && !lead.plans?.some(plan => 
        plan.group && filters.numberGroup.includes(plan.group)
      )) {
        return false;
      }

      // Status Filter
      if (filters.status.length > 0 && !filters.status.includes(lead.status)) {
        return false;
      }

      // Date Filters
      if (filters.createdDateRange.from) {
        const createdDate = new Date(lead.createdAt);
        const fromDate = new Date(filters.createdDateRange.from);
        if (createdDate < fromDate) return false;
      }
      if (filters.createdDateRange.to) {
        const createdDate = new Date(lead.createdAt);
        const toDate = new Date(filters.createdDateRange.to);
        if (createdDate > toDate) return false;
      }
      if (filters.activatedDateRange.from || filters.activatedDateRange.to) {
        const activatedAtRaw: any = (lead as any).activatedAt || lead.updatedAt;
        if (!activatedAtRaw) return false;
        
        // Handle Firestore timestamp conversion
        const leadActivatedAt = typeof activatedAtRaw.toDate === 'function'
          ? activatedAtRaw.toDate()
          : activatedAtRaw instanceof Date
            ? activatedAtRaw
            : new Date(activatedAtRaw);
        
      if (filters.activatedDateRange.from) {
        const fromDate = new Date(filters.activatedDateRange.from);
          fromDate.setHours(0, 0, 0, 0);
          if (leadActivatedAt < fromDate) return false;
      }
      if (filters.activatedDateRange.to) {
        const toDate = new Date(filters.activatedDateRange.to);
          toDate.setHours(23, 59, 59, 999);
          if (leadActivatedAt > toDate) return false;
        }
      }

      return true;
    });
    return result;
  }, [leads, filters, fetchedLeads, showResults, loadingLeads]);

  const handleFilterChange = (key: keyof AdvancedSearchFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleNestedFilterChange = (parentKey: keyof AdvancedSearchFilters, childKey: string, value: any) => {
    setFilters(prev => ({
      ...prev,
      [parentKey]: {
        ...(prev[parentKey] as any),
        [childKey]: value
      }
    }));
  };

  const clearAllFilters = () => {
    setFilters({
      customerName: '',
      customerPhone: '',
      customerAddress: '',
      customerAge: { min: '', max: '' },
      gender: '',
      language: '',
      hasEmirateId: 'all',
      planName: [],
      numberCategory: [],
      numberGroup: [],
      numberType: '',
      productType: '',
      status: '',
      agentId: '',
      coordinatorId: '',
      verifierId: '',
      teamId: '',
      managerId: '',
      emirate: '',
      area: '',
      country: '',
      createdDateRange: { from: '', to: '' },
      activatedDateRange: { from: '', to: '' },
      followUpDateRange: { from: '', to: '' },
      startDateRange: { from: '', to: '' },
      advancePayment: 'all',
      hasVerificationMedia: 'all',
      verificationNotes: '',
      coordinatorNotes: '',
      sharedWith: '',
      startTime: ''
    });
    setFetchedLeads([]);
    setShowResults(false);
  };

  // Multi-select helper functions
  const toggleArrayFilter = (field: 'planName' | 'numberCategory' | 'numberGroup' | 'status', value: string) => {
    setFilters(prev => ({
      ...prev,
      [field]: prev[field].includes(value) 
        ? prev[field].filter(item => item !== value)
        : [...prev[field], value]
    }));
  };

  const removeFromArrayFilter = (field: 'planName' | 'numberCategory' | 'numberGroup' | 'status', value: string) => {
    setFilters(prev => ({
      ...prev,
      [field]: prev[field].filter(item => item !== value)
    }));
  };

  const applyFilters = async () => {
    // Clear previous results and immediately mark that we're showing results
    setFetchedLeads([]);
    setShowResults(true);
    
    // Fetch all leads from Firebase based on filters
    await fetchLeadsFromFirebase(filters);
    onFiltersChange(filters);
  };

  // Export handler that guarantees Firebase fetch (all leads) before exporting
  const handleExport = useCallback(async () => {
    setLoadingLeads(true);
    // Always fetch fresh from Firebase to avoid 200-lead cache
    const firebaseLeads = await fetchLeadsFromFirebase(filters);
    const leadsToExport = firebaseLeads && firebaseLeads.length > 0 ? firebaseLeads : fetchedLeads;
    onExportResults(leadsToExport);
    setLoadingLeads(false);
  }, [fetchLeadsFromFirebase, filters, fetchedLeads, onExportResults]);

  // Export Etisalat sheets (G1, G2, G3 group-wise)
  const handleExportEtisalatSheets = useCallback(async () => {
    if (!onExportEtisalatSheets) return;
    setLoadingLeads(true);
    const firebaseLeads = await fetchLeadsFromFirebase(filters);
    const leadsToExport = firebaseLeads && firebaseLeads.length > 0 ? firebaseLeads : fetchedLeads;
    await onExportEtisalatSheets(leadsToExport);
    setLoadingLeads(false);
  }, [fetchLeadsFromFirebase, filters, fetchedLeads, onExportEtisalatSheets]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const getDatePresets = () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastMonth = new Date(today);
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    return {
      today: today.toISOString().split('T')[0],
      yesterday: yesterday.toISOString().split('T')[0],
      lastWeek: lastWeek.toISOString().split('T')[0],
      lastMonth: lastMonth.toISOString().split('T')[0]
    };
  };

  const datePresets = getDatePresets();

  if (!isVisible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] p-0 sm:p-4"
    >
      <motion.div
        initial={{ scale: 0.98, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.98, y: 20 }}
        className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full max-w-6xl max-h-[100dvh] sm:max-h-[95vh] h-[95dvh] sm:h-[95vh] flex flex-col overflow-hidden"
      >
        {/* Header - compact on mobile */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-3 py-3 sm:px-6 sm:py-4 pt-[max(0.75rem,env(safe-area-inset-top))] flex-shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <Settings className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0" />
              <h2 className="text-lg sm:text-2xl font-bold truncate">Advanced Lead Search</h2>
              <span className="bg-white/20 px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-xs sm:text-sm flex-shrink-0 whitespace-nowrap">
                Admin &amp; Coordinator
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 p-1.5 sm:p-2 rounded-lg transition-colors flex-shrink-0 touch-manipulation"
              aria-label="Close"
            >
              <X className="h-5 w-5 sm:h-6 sm:w-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
          <div className="p-3 sm:p-6">

          {/* Plan and Number Information Section - compact on mobile */}
          <div className="mb-4 sm:mb-8">
            <button
              onClick={() => toggleSection('plan')}
              className="flex items-center justify-between w-full p-3 sm:p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl sm:rounded-2xl hover:from-blue-100 hover:to-indigo-100 transition-all duration-200 border border-blue-200 shadow-sm touch-manipulation"
            >
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                  <Package className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                </div>
                <div className="text-left min-w-0">
                  <h3 className="text-base sm:text-xl font-bold text-gray-900">Plan & Number Information</h3>
                  <p className="text-xs sm:text-sm text-gray-600 truncate">Filter by plan and number details</p>
                </div>
              </div>
              {expandedSections.plan ? <ChevronUp className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 flex-shrink-0" /> : <ChevronDown className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 flex-shrink-0" />}
            </button>
            
            <AnimatePresence>
              {expandedSections.plan && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-gradient-to-br from-white to-blue-50 rounded-xl sm:rounded-2xl border border-blue-200 shadow-lg p-4 sm:p-8 mt-3 sm:mt-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
                    {/* Plan Name */}
                    <div className="space-y-1.5 sm:space-y-3">
                      <label className="block text-xs sm:text-sm font-semibold text-gray-800 mb-1.5 sm:mb-3 flex items-center">
                        <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 text-blue-600 flex-shrink-0" />
                        Plan Name
                      </label>
                      
                      {/* Selected Plans */}
                      {filters.planName.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                          {filters.planName.map((plan, index) => (
                            <span
                              key={`selected-plan-${index}-${plan}`}
                              className="inline-flex items-center px-2 py-0.5 sm:px-3 sm:py-1 bg-blue-100 text-blue-800 text-xs sm:text-sm rounded-full max-w-full truncate"
                            >
                              <span className="truncate">{plan}</span>
                              <button
                                onClick={() => removeFromArrayFilter('planName', plan)}
                                className="ml-1.5 hover:bg-blue-200 rounded-full p-0.5 flex-shrink-0 touch-manipulation"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {/* Plan Selection Dropdown */}
                      <div className="relative">
                        <select
                          onChange={(e) => {
                            if (e.target.value && !filters.planName.includes(e.target.value)) {
                              toggleArrayFilter('planName', e.target.value);
                            }
                            e.target.value = ''; // Reset selection
                          }}
                          disabled={loadingPlans}
                          className="w-full px-3 py-2 sm:px-4 sm:py-3 bg-white border border-gray-200 sm:border-2 rounded-lg sm:rounded-xl focus:ring-2 sm:focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all duration-200 appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base min-h-[40px] sm:min-h-0"
                        >
                          <option value="">
                            {loadingPlans ? 'Loading plans...' : 'Select Plan Names'}
                          </option>
                          {availablePlanNames
                            .filter(planName => !filters.planName.includes(planName))
                            .map((planName, index) => (
                              <option key={`plan-${index}-${planName}`} value={planName}>{planName}</option>
                            ))}
                        </select>
                        <ChevronDownIcon className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400 pointer-events-none" />
                      </div>
                    </div>

                    {/* Number Category */}
                    <div className="space-y-1.5 sm:space-y-3">
                      <label className="block text-xs sm:text-sm font-semibold text-gray-800 mb-1.5 sm:mb-3 flex items-center">
                        <Tag className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 text-green-600 flex-shrink-0" />
                        Number Category
                      </label>
                      
                      {/* Selected Categories */}
                      {filters.numberCategory.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                          {filters.numberCategory.map(category => (
                            <span
                              key={category}
                              className="inline-flex items-center px-2 py-0.5 sm:px-3 sm:py-1 bg-green-100 text-green-800 text-xs sm:text-sm rounded-full"
                            >
                              {category}
                              <button
                                onClick={() => removeFromArrayFilter('numberCategory', category)}
                                className="ml-1.5 hover:bg-green-200 rounded-full p-0.5 flex-shrink-0 touch-manipulation"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {/* Category Selection Dropdown */}
                      <div className="relative">
                        <select
                          onChange={(e) => {
                            if (e.target.value && !filters.numberCategory.includes(e.target.value)) {
                              toggleArrayFilter('numberCategory', e.target.value);
                            }
                            e.target.value = ''; // Reset selection
                          }}
                          className="w-full px-3 py-2 sm:px-4 sm:py-3 bg-white border border-gray-200 sm:border-2 rounded-lg sm:rounded-xl focus:ring-2 sm:focus:ring-4 focus:ring-green-100 focus:border-green-500 transition-all duration-200 appearance-none cursor-pointer text-sm sm:text-base min-h-[40px] sm:min-h-0"
                        >
                          <option value="">Select Categories</option>
                          {NUMBER_CATEGORIES
                            .filter(category => !filters.numberCategory.includes(category))
                            .map(category => (
                              <option key={category} value={category}>{category}</option>
                            ))}
                        </select>
                        <ChevronDownIcon className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400 pointer-events-none" />
                      </div>
                    </div>

                    {/* Number Group */}
                    <div className="space-y-1.5 sm:space-y-3">
                      <label className="block text-xs sm:text-sm font-semibold text-gray-800 mb-1.5 sm:mb-3 flex items-center">
                        <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 text-purple-600 flex-shrink-0" />
                        Number Group
                      </label>
                      
                      {/* Selected Groups */}
                      {filters.numberGroup.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                          {filters.numberGroup.map(group => (
                            <span
                              key={group}
                              className="inline-flex items-center px-2 py-0.5 sm:px-3 sm:py-1 bg-purple-100 text-purple-800 text-xs sm:text-sm rounded-full"
                            >
                              {group}
                              <button
                                onClick={() => removeFromArrayFilter('numberGroup', group)}
                                className="ml-1.5 hover:bg-purple-200 rounded-full p-0.5 flex-shrink-0 touch-manipulation"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {/* Group Selection Dropdown */}
                      <div className="relative">
                        <select
                          onChange={(e) => {
                            if (e.target.value && !filters.numberGroup.includes(e.target.value)) {
                              toggleArrayFilter('numberGroup', e.target.value);
                            }
                            e.target.value = ''; // Reset selection
                          }}
                          className="w-full px-3 py-2 sm:px-4 sm:py-3 bg-white border border-gray-200 sm:border-2 rounded-lg sm:rounded-xl focus:ring-2 sm:focus:ring-4 focus:ring-purple-100 focus:border-purple-500 transition-all duration-200 appearance-none cursor-pointer text-sm sm:text-base min-h-[40px] sm:min-h-0"
                        >
                          <option value="">Select Groups</option>
                          {NUMBER_GROUPS
                            .filter(group => !filters.numberGroup.includes(group))
                            .map(group => (
                              <option key={group} value={group}>{group}</option>
                            ))}
                        </select>
                        <ChevronDownIcon className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400 pointer-events-none" />
                      </div>
                    </div>

                    {/* Status */}
                    <div className="space-y-1.5 sm:space-y-3">
                      <label className="block text-xs sm:text-sm font-semibold text-gray-800 mb-1.5 sm:mb-3 flex items-center">
                        <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 text-orange-600 flex-shrink-0" />
                        Status
                      </label>
                      
                      {/* Selected Statuses */}
                      {filters.status.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                          {filters.status.map(status => (
                            <span
                              key={status}
                              className="inline-flex items-center px-2 py-0.5 sm:px-3 sm:py-1 bg-orange-100 text-orange-800 text-xs sm:text-sm rounded-full"
                            >
                              <span className="max-w-[100px] sm:max-w-none truncate">{status.replace(/_/g, ' ').toUpperCase()}</span>
                              <button
                                onClick={() => removeFromArrayFilter('status', status)}
                                className="ml-1.5 hover:bg-orange-200 rounded-full p-0.5 flex-shrink-0 touch-manipulation"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {/* Status Selection Dropdown */}
                      <div className="relative">
                        <select
                          onChange={(e) => {
                            if (e.target.value && !filters.status.includes(e.target.value)) {
                              toggleArrayFilter('status', e.target.value);
                            }
                            e.target.value = ''; // Reset selection
                          }}
                          className="w-full px-3 py-2 sm:px-4 sm:py-3 bg-white border border-gray-200 sm:border-2 rounded-lg sm:rounded-xl focus:ring-2 sm:focus:ring-4 focus:ring-orange-100 focus:border-orange-500 transition-all duration-200 appearance-none cursor-pointer text-sm sm:text-base min-h-[40px] sm:min-h-0"
                        >
                          <option value="">Select Statuses</option>
                          {STATUS_OPTIONS
                            .filter(status => !filters.status.includes(status))
                            .map(status => (
                              <option key={status} value={status}>{status.replace(/_/g, ' ').toUpperCase()}</option>
                          ))}
                        </select>
                        <ChevronDownIcon className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400 pointer-events-none" />
                      </div>
                    </div>

                    {/* Created Date Range - hidden on phones */}
                    <div className="hidden sm:block space-y-1.5 sm:space-y-3">
                      <label className="block text-xs sm:text-sm font-semibold text-gray-800 mb-1.5 sm:mb-3 flex items-center">
                        <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 text-indigo-600 flex-shrink-0" />
                        Created Date Range
                      </label>
                      <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 sm:border-2 p-3 sm:p-4 space-y-2 sm:space-y-3">
                        <div className="grid grid-cols-[auto_1fr] items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 flex-shrink-0" />
                          <input
                            type="date"
                            value={filters.createdDateRange.from}
                            onChange={(e) => handleNestedFilterChange('createdDateRange', 'from', e.target.value)}
                            className="w-full min-w-0 px-2.5 py-1.5 sm:px-3 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm sm:text-base"
                            placeholder="From"
                          />
                        </div>
                        <div className="grid grid-cols-[auto_1fr] items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 flex-shrink-0" />
                          <input
                            type="date"
                            value={filters.createdDateRange.to}
                            onChange={(e) => handleNestedFilterChange('createdDateRange', 'to', e.target.value)}
                            className="w-full min-w-0 px-2.5 py-1.5 sm:px-3 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm sm:text-base"
                            placeholder="To"
                          />
                        </div>
                        <div className="flex gap-1.5 sm:gap-2">
                          <button
                            onClick={() => handleNestedFilterChange('createdDateRange', 'from', datePresets.today)}
                            className="flex-1 px-2 py-1.5 sm:px-3 sm:py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors text-xs sm:text-sm font-medium touch-manipulation"
                          >
                            Today
                          </button>
                          <button
                            onClick={() => handleNestedFilterChange('createdDateRange', 'from', datePresets.lastWeek)}
                            className="flex-1 px-2 py-1.5 sm:px-3 sm:py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors text-xs sm:text-sm font-medium touch-manipulation"
                          >
                            Last Week
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Activated Date Range */}
                    <div className="space-y-1.5 sm:space-y-3">
                      <label className="block text-xs sm:text-sm font-semibold text-gray-800 mb-1.5 sm:mb-3 flex items-center">
                        <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 text-pink-600 flex-shrink-0" />
                        Activated Date Range
                      </label>
                      <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 sm:border-2 p-3 sm:p-4 space-y-2 sm:space-y-3">
                        <div className="grid grid-cols-[auto_1fr] items-center gap-2">
                          <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 flex-shrink-0" />
                          <input
                            type="date"
                            value={filters.activatedDateRange.from}
                            onChange={(e) => handleNestedFilterChange('activatedDateRange', 'from', e.target.value)}
                            className="w-full min-w-0 px-2.5 py-1.5 sm:px-3 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 text-sm sm:text-base"
                            placeholder="From"
                          />
                        </div>
                        <div className="grid grid-cols-[auto_1fr] items-center gap-2">
                          <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400 flex-shrink-0" />
                          <input
                            type="date"
                            value={filters.activatedDateRange.to}
                            onChange={(e) => handleNestedFilterChange('activatedDateRange', 'to', e.target.value)}
                            className="w-full min-w-0 px-2.5 py-1.5 sm:px-3 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-pink-500 text-sm sm:text-base"
                            placeholder="To"
                          />
                        </div>
                        <div className="flex gap-1.5 sm:gap-2">
                          <button
                            onClick={() => handleNestedFilterChange('activatedDateRange', 'from', datePresets.today)}
                            className="flex-1 px-2 py-1.5 sm:px-3 sm:py-2 bg-pink-100 text-pink-700 rounded-lg hover:bg-pink-200 transition-colors text-xs sm:text-sm font-medium touch-manipulation"
                          >
                            Today
                          </button>
                          <button
                            onClick={() => handleNestedFilterChange('activatedDateRange', 'from', datePresets.lastWeek)}
                            className="flex-1 px-2 py-1.5 sm:px-3 sm:py-2 bg-pink-100 text-pink-700 rounded-lg hover:bg-pink-200 transition-colors text-xs sm:text-sm font-medium touch-manipulation"
                          >
                            Last Week
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          </div>
        </div>

        {/* Results Section */}
        {showResults && (
          <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-t border-gray-200">
            {/* Results Header */}
            <div className="px-3 py-4 sm:px-6 sm:py-6 bg-white border-b border-gray-200">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-lg sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2 truncate">
                    Search Results
                  </h3>
                  {loadingLeads ? (
                    <p className="text-gray-600">
                      <span className="inline-flex items-center">
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin text-blue-600" />
                        Fetching all leads from Firebase...
                      </span>
                    </p>
                  ) : (
                    <p className="text-gray-600">
                      Found <span className="font-semibold text-blue-600">{filteredLeads.length}</span> leads matching your criteria
                    </p>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  {loadingLeads ? (
                    <>
                      <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-sm text-gray-600">Loading...</span>
                    </>
                  ) : (
                    <>
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                      <span className="text-sm text-gray-600">Live Results</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            {loadingLeads ? (
              <div className="px-6 py-12">
                <div className="text-center">
                  <RefreshCw className="h-12 w-12 text-blue-600 animate-spin mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Fetching Leads</h3>
                  <p className="text-gray-600">Loading all matching leads from Firebase. This may take a moment...</p>
                </div>
              </div>
            ) : filteredLeads.length > 0 ? (
              <div className="px-3 py-4 sm:px-6 sm:py-6 max-h-[50vh] overflow-y-auto overflow-x-auto">
                {/* Table Header */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Lead ID
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Customer
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Phone
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Team / Agent
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Etisalat ID
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Activation / SR
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Plans
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Plan Details
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Created
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Updated
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredLeads.map((lead) => {
                          const anyLead = lead as any;
                          // Get activatedAt with fallback to updatedAt, handle Firestore timestamp
                          const activatedAtRaw = anyLead.activatedAt || lead.updatedAt;
                          const activationDate = activatedAtRaw
                            ? (typeof activatedAtRaw.toDate === 'function'
                                ? activatedAtRaw.toDate()
                                : activatedAtRaw instanceof Date
                                  ? activatedAtRaw
                                  : new Date(activatedAtRaw))
                            : null;
                          const srNumber = anyLead.srNumber || anyLead.srNo || anyLead.sr;

                          return (
                          <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                              {/* Lead ID */}
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {lead.leadNumber || lead.id}
                              </td>
                            {/* Customer Name */}
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm mr-3">
                                  {lead.customerName?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {lead.customerName || 'Unknown Customer'}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Customer Phone */}
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {lead.customerNumber || lead.customerPhone || 'N/A'}
                              </div>
                            </td>

                            {/* Status */}
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                lead.status === 'verified' ? 'bg-green-100 text-green-800' :
                                lead.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                lead.status === 'activated' ? 'bg-blue-100 text-blue-800' :
                                lead.status === 'assigned' ? 'bg-purple-100 text-purple-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {getStatusDisplayText(lead.status)}
                              </span>
                            </td>

                              {/* Team / Agent */}
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">
                                  {lead.agentName || 'Unknown Agent'}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {lead.teamName || lead.teamId || 'N/A'}
                                </div>
                              </td>

                              {/* Etisalat ID */}
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {lead.etisalatLeadId || 'N/A'}
                              </td>

                              {/* Activation Date / SR Number */}
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                <div>
                                  <span className="font-medium">Activation:&nbsp;</span>
                                  {activationDate ? new Date(activationDate).toLocaleDateString() : 'N/A'}
                                </div>
                                <div className="text-xs text-gray-600 mt-1">
                                  <span className="font-medium">SR:&nbsp;</span>
                                  {srNumber || 'N/A'}
                                </div>
                            </td>

                            {/* Plans Count */}
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                Plans ({lead.plans?.length || 0})
                              </div>
                            </td>

                            {/* Plan Details */}
                            <td className="px-6 py-4">
                              <div className="text-sm text-gray-900">
                                {lead.plans?.map((plan, planIndex) => (
                                  <div key={planIndex} className="mb-2 last:mb-0">
                                    <div className="font-medium">{plan.plan}</div>
                                    <div className="text-xs text-gray-600">
                                      Number: {plan.number}
                                    </div>
                                    <div className="flex space-x-1 mt-1">
                                      <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                                        {plan.category}
                                      </span>
                                      {plan.group && (
                                        <span className="inline-block px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">
                                          {plan.group}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>

                            {/* Created Date */}
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : 'N/A'}
                            </td>

                            {/* Updated Date */}
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {lead.updatedAt ? new Date(lead.updatedAt).toLocaleDateString() : 'N/A'}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Results Summary */}
                <div className="mt-4 sm:mt-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg sm:rounded-xl p-4 sm:p-6 text-white">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-base sm:text-xl font-bold mb-1 sm:mb-2">Search Summary</h4>
                      <p className="text-blue-100 text-xs sm:text-sm truncate">Leads matching criteria</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-2xl sm:text-4xl font-bold">{filteredLeads.length}</div>
                      <div className="text-blue-200 text-xs sm:text-sm">Leads</div>
                    </div>
                  </div>
                  
                  {/* Status Breakdown */}
                  <div className="mt-4 sm:mt-6 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                    {['verified', 'pending', 'activated', 'assigned'].map(status => {
                      const count = filteredLeads.filter(lead => lead.status === status).length;
                      return (
                        <div key={status} className="bg-white/20 rounded-lg p-2 sm:p-3 text-center">
                          <div className="text-lg sm:text-2xl font-bold">{count}</div>
                          <div className="text-[10px] sm:text-xs text-blue-200 capitalize truncate">{status.replace('_', ' ')}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-6 py-12">
                <div className="text-center">
                  <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Search className="h-12 w-12 text-gray-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">No Results Found</h3>
                  <p className="text-gray-600 mb-6">Try adjusting your search criteria to find more leads</p>
                  <button
                    onClick={clearAllFilters}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Clear All Filters
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer - stacked on mobile, row on desktop; safe-area for notched phones */}
        <div className="bg-gray-50 px-3 py-3 sm:px-6 sm:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between flex-shrink-0 border-t border-gray-200">
          <div className="hidden sm:flex justify-center sm:justify-start order-2 sm:order-1">
            <button
              onClick={clearAllFilters}
              className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 text-gray-600 hover:text-gray-800 transition-colors text-sm touch-manipulation"
            >
              <RefreshCw className="h-4 w-4 flex-shrink-0" />
              <span>Clear All</span>
            </button>
          </div>
          
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 order-1 sm:order-2 w-full sm:w-auto">
            <button
              onClick={applyFilters}
              disabled={loadingLeads}
              className="hidden sm:flex w-full sm:w-auto items-center justify-center gap-1.5 sm:gap-2 px-4 py-2.5 sm:px-6 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base font-medium touch-manipulation min-h-[44px] sm:min-h-0"
            >
              {loadingLeads ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 flex-shrink-0" />
                  <span>Apply Filters</span>
                </>
              )}
            </button>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
              <button
                onClick={handleExport}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2.5 sm:px-4 sm:py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm touch-manipulation min-h-[44px] sm:min-h-0"
                disabled={loadingLeads}
              >
                {loadingLeads ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">Export Results</span>
                  </>
                )}
              </button>
              {onExportEtisalatSheets && (
                <button
                  onClick={handleExportEtisalatSheets}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-2.5 sm:px-4 sm:py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm touch-manipulation min-h-[44px] sm:min-h-0"
                  disabled={loadingLeads}
                >
                  {loadingLeads ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin flex-shrink-0" />
                      <span>Exporting...</span>
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">Etisalat Sheets</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
