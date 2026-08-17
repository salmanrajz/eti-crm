/**
 * ===============================================================================
 * CREATE LEAD COMPONENT - LEAD CREATION FORM
 * ===============================================================================
 * 
 * This component provides a comprehensive form for creating new leads in the CRM
 * system. It handles customer information collection, number selection, plan
 * configuration, and integrates with WhatsApp verification workflows.
 * 
 * FEATURES:
 * 
 * 1. COMPREHENSIVE LEAD CREATION
 *    - Customer information collection (name, phone, address, demographics)
 *    - Number selection from available number pool with category filtering
 *    - Plan selection with dynamic benefits from Firebase configuration
 *    - Location-specific data (emirates) for UAE market
 * 
 * 2. PHONE NUMBER VALIDATION
 *    - UAE-specific phone number validation (must start with "05")
 *    - Exactly 10-digit requirement with visual prefix display
 *    - Real-time validation and error messaging
 * 
 * 3. WHATSAPP INTEGRATION
 *    - Automatic WhatsApp verification message sending
 *    - Configurable verification templates and messaging
 *    - Integration with WhatsApp Business API
 * 
 * 4. DYNAMIC FORM HANDLING
 *    - Responsive form sections with conditional visibility
 *    - Real-time form validation and error handling
 *    - Plan category filtering and dynamic options
 * 
 * 5. DATA INTEGRATION
 *    - Firestore integration for lead storage
 *    - Number pool status updates and logging
 *    - User authentication and role-based access
 * 
 * USAGE:
 * This component is used by agents to create new leads and initiate the
 * customer verification and onboarding process.
 * ===============================================================================
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, query, where, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { User, NumberPool, Lead } from '../../types';
import { toast } from 'react-hot-toast';
import { logNumberAction } from '../../utils/numberLogging';
import { poolFieldsWhenAttachingToLead, getStrikeWindowMs, claimQueueWouldConvertToStrikes, notifyOwnerOfClaimToStrikeConversion } from '../../utils/strikeQueue';
import { logLeadAction } from '../../utils/leadLogging';
import { format, addMinutes } from 'date-fns';
import { getPlanCategoriesWithPlans, PlanCategoryGroup, getPlans, Plan } from '../../utils/planService';
// import { countries } from 'countries-list';
import { FormSection } from './FormSection';
import { FormInput } from './FormInput';
import { FormSelect } from './FormSelect';
// import { NumberPool as NumberPoolComponent } from '../../pages/numbers/NumberPool';
import {
  User2,
  Phone,
  Globe,
  Calendar,
  MapPin,
  // CreditCard,
  Languages,
  Users,
  Package,
  MessageSquare,
  Building2,
  XCircle,
  Plus,
  Mail
} from 'lucide-react';
import { QuickNumberSelect } from './QuickNumberSelect';
import { countryList } from '../../utils/countries';
// import { planBenefits } from '../../utils/planBenefits'; // Now using dynamic benefits from Firebase
import { collection as fbCollection, setDoc, doc as fbDoc, serverTimestamp as fbServerTimestamp } from 'firebase/firestore';
import { logOutboundVerificationMessage } from '../../utils/whatsappVerification';
import { SuccessPopup } from '../SuccessPopup';
import { getWhatsAppVerificationEnabled, getNumberActiveCheckEnabled, getForcedGroupEnabled, getForcedGroup } from '../../utils/configService';

// ===============================================================================
// WHATSAPP INTEGRATION CONFIGURATION
// ===============================================================================

/**
 * WhatsApp Business API configuration constants
 * These are now fetched from Firebase via configService
 * Legacy constants removed - use getWhatsAppCredentials() from configService
 */

// ===============================================================================
// UAE LOCATION CONFIGURATION
// ===============================================================================

/**
 * UAE Emirates list for customer location selection
 * Covers all seven emirates of the United Arab Emirates
 */
const emirates = [
  'Abu Dhabi',
  'Al Ain',
  'Dubai',
  'Sharjah',
  'Ajman',
  'Umm Al Quwain',
  'Ras Al Khaimah',
  'Fujairah'
];


// ===============================================================================
// FORM OPTIONS CONFIGURATION
// ===============================================================================

/**
 * Supported languages for customer communication
 * Reflects the multilingual nature of the UAE market
 */
const languages = ['Arabic', 'English', 'Hindi/Urdu'];

/**
 * Product types for lead categorization
 * Distinguishes between new activations and port-in requests
 */
const productTypes = ['New', 'MNP', 'Prepaid to postpaid', 'Home Wifi'];
// const numberTypes = ['Gold', 'Gold Plus', 'Platinum', 'Silver', 'Silver Plus', 'Standard'];
// const numberCategories = ['Standard', 'Silver', 'Silver Plus', 'Gold', 'Gold Plus', 'Platinum'] as const;

const plans = {
  newFreedom: [
    'NewFreedom125-12M-Local',
    'NewFreedom150-NC-Local',
    'NewFreedom150-NC-Flexi',
    'NewFreedom200-12M-Flexi',
    'NewFreedom225-NC-Local',
    'NewFreedomPlan225-NC-Flexi',
    'NewFreedomPlan375-NC-Flexi',
    'NewFreedomPlan375-NC-Local',
    'NewFreedomPlan700-NC-Unlimited Flexi',
    'NewFreedomPlan1300-NC-Unlimited Flexi & Unlimited local Data',
    'NewFreedomPlan325-12M-Flexi',
    'NewFreedomPlan325-12M-Local',
    'NewFreedomPlan600-12M-Unlimited Flexi',
    'NewFreedomPlan1200-12M-Unlimited Flexi & Unlimited local Data',
    'New Freedom 50 Flexi Minutes',
    'New Freedom 200 - FLEXIBLE',
    'New Freedom 200 - LOCAL',
    'New Freedom 250 - 12 M - 3 Mbps - Unlimited Data - 1000 Local mins',
    'New Freedom 250 - 12 M - 3 Mbps - Unlimited Data - 1000 Local mins (SS)',
    'New Freedom 250 - 12 M - 3 Mbps - Unlimited Data - 500 Flexible Mint',
    'New Freedom 250 - 12 M - 3 Mbps - Unlimited Data - 500 Flexible Mins (SS)',
    'New Freedom 250 - 12 M - 3 Mbps - Unlimited Data - 500 Flexible Mins NC',
    'New Freedom 325 Flexi minutes 12 months commitment',
    'New Freedom 325 Local minutes 12 months commitment',
    'New Freedom 325 - 12 M - 10 Mbps - Unlimited Data 900 Flexi Mins',
    'New Freedom 325 - 12 M - 10 Mbps - Unlimited Data 900 Flexi Mins (SS)',
    'New Freedom 325 - 12 M - 10 Mbps - Unlimited Data 1800 Local Mins',
    'New Freedom 325 - 12 M - 10 Mbps - Unlimited Data 1800 Local Mins (SS)',
    'New Freedom 500 - 12 M - 20 Mbps - Unlimited Data 1500 Flexi Mins',
    'New Freedom 500 - 12 M - 20 Mbps - Unlimited Data 1500 Flexi Mins (SS)',
    'New Fredoom 500 - 12 M - 20 Mbps - Unlimited Data 3000 Local Mins',
    'New Fredoom 500 - 12 M - 20 Mbps - Unlimited Data 3000 Local Mins (SS)',
    'New Freedom 600 - NC - 20 Mbps - Unlimited Data 1500 Flexi Mins',
    'New Fredoom 600 - NC - 20 Mbps - Unlimited Data 3000 Local Mins',
    'New Freedom 600 unlimited 12 months commitment',
    'New Freedom 1200 unlimited 12 months commitment',
    'New Freedom 260 With Unlimited Country to 1 Preffered International Number Local',
    'New Freedom 260 With Unlimited Country to 1 Preffered International Number Flexi',
    'New freedom 500 non stop data (24 months) - Local',
    'New freedom 500 non stop data (24 months) - Flexi'
  ],
  oldFreedom: [
    'FreedomPlan200-NC-Flexi (old)',
    'FreedomPlan200-NC-Local (old)',
    'FreedomPlan250-NC-Flexi (old)',
    'FreedomPlan250-NC-Local (old)',
    'FreedomPlan300-NC-Flexi (old)',
    'FreedomPlan300-NC-Local (old)',
    'FreedomPlan600-NC-Local (old)',
    'FreedomPlan600-NC-Flexi (old)',
    'FreedomPlan1200-NC-Flexi (Old)',
    'FreedomPlan1200-NC-Local (Old)',
    'FreedomPlan1000-12M-Local (Old)',
    'FreedomPlan1000-12M-Flexi (Old)',
    'FreedomPlan500-12M-Flexi (old)',
    'FreedomPlan500-12M-Local (old)',
    'FreedomPlan275-12M-Local (old)',
    'FreedomPlan275-12M-Flexi (old)',
    'FreedomPlan225-12M-Flexi (old)',
    'FreedomPlan225-12M-Local (old)',
    'FreedomPlan175-12M-Local (old)',
    'FreedomPlan175-12M-Flexi (Old)',
    'Freedom Plan 275 local (Old)',
    'Freedom Plan 275 Flexible',
    'Freedom plan 275 - Local plan 12 months contract',
    'Freedom plan 500 - Flexi plan 12 months contract',
    'Freedom plan 500 - Local plan 12 months contract',
    'Freedom plan 1000 Flexi plan 12 months contract',
    'Freedom plan 1000 - Local plan 12 months contract'
  ],
  smart: [
    'Smart 250-NC (1 preferred number local)',
    'Smart 250-12M (1 preferred number local)',
    'Smart250-24M (1 preferred number local)',
    'Smart600-NC (2 preferred number local)',
    'Smart600-12M (2 preferred number local)',
    'Smart600-24M (2 preferred number local)',
    'Smart1000-NC (3 preferred number local)'
  ],
  emirati: [
    'Emirati150-12M',
    'Emirati150-24M',
    'Emirati 250-NC (1 preferred number local)',
    'Emirati 250-24M (1 preferred number local)',
    'Emirati 600-NC (2 preferred number local)',
    'Emirati 1000-NC (3 preferred number local)',
    'Emirati freedom plan 750',
    'Emirati Freedom Plan 250 - 12 Months',
    'Emirati Freedom 400',
    'Emirati Freedom 450 - No Contract',
    'Emirati Freedom 1500',
    'Emirati Freedom 1600 - No Contract',
    'Emirati Freedom 250 - 12 Months contract'
  ],
  premium: [
    'Premium Postpaid Local 500-24M (GOLD)',
    'Premium Postpaid Flexi 500-24M (GOLD)',
    'Premium Postpaid Local 1000-24M (PLATINUM)',
    'Premium Postpaid Flexi 1000-24M (PLATINUM)',
    'PREMIUM AED 1000',
    'PREMIUM AED 1000 FLEXI'
  ],
  homeWifi: [
    'Basic Home WiFi',
    'Standard Home WiFi',
    'Premium Home WiFi',
    'VIP Home WiFi'
  ]
};

interface PlanOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface PlanCategory {
  label: string;
  options: PlanOption[];
}

// Dynamic plan categories will be loaded from Firebase

// LocalStorage key for saving form drafts
const FORM_DRAFT_KEY = 'createLeadFormDraft';

interface PlanSelection {
  numberId: string;
  number: string;
  plan: string;
  category: string;
  group?: string;
  type?: string;
  status?: string;
}

interface FormData {
  customerName: string;
  customerNumber: string;
  customerAddress: string;
  country: string;
  customerAge: string;
  productType: string;
  homeWifiEmail?: string;
  homeWifiId?: string;
  gender: string;
  emirate: string;
  hasEmirateId: boolean;
  advancePayment: boolean;
  language: string;
  sharedWith: string;
  locationUrl: string;
  confirmLocationUrl: boolean;
  startDate: string;
  startTime: string;
  numberType: string;
  remarks: string;
}

interface FormErrors {
  customerName?: string;
  customerNumber?: string;
  customerAge?: string;
  agentId?: string;
  homeWifiEmail?: string;
  homeWifiId?: string;
  locationUrl?: string;
  plans?: string;
  selectedNumber?: string; // Error for number selection
  customerAddress?: string;
  [key: string]: string | undefined;
}

interface CreateLeadProps {
  isEditing?: boolean;
  initialData?: Lead;
  onSave?: (data: Partial<Lead>) => Promise<void>;
  onCancel?: () => void;
}

// const INITIAL_LOAD_SIZE = 50;
// const SEARCH_DEBOUNCE = 150;

const DRAFT_TTL_MS = 3 * 60 * 1000; // 3 minutes

// Helper to load saved form draft from localStorage — returns null if missing or expired
function loadFormDraft() {
  try {
    const saved = localStorage.getItem(FORM_DRAFT_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const age = Date.now() - new Date(parsed.timestamp).getTime();
      if (age > DRAFT_TTL_MS) {
        localStorage.removeItem(FORM_DRAFT_KEY);
        return null;
      }
      return parsed;
    }
  } catch (error) {
    console.error('Error loading form draft:', error);
  }
  return null;
}

function CreateLead({ isEditing, initialData, onSave, onCancel }: CreateLeadProps) {
  const navigate = useNavigate();
  const { user, isVerifier, isCoordinator, isAdmin } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  
  // Load saved draft only if not editing
  const savedDraft = !isEditing && !initialData ? loadFormDraft() : null;
  
  const [selectedPlans, setSelectedPlans] = useState<PlanSelection[]>(
    initialData?.plans || savedDraft?.selectedPlans || []
  );
  // When editing, existing numbers are already in selectedPlans — currentNumber is only for staging a new addition
  const [currentNumber, setCurrentNumber] = useState(
    isEditing ? '' : (initialData?.plans?.[0]?.number || '')
  );
  const [currentPlan, setCurrentPlan] = useState<string>('');
  const [currentNumberData, setCurrentNumberData] = useState<NumberPool | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>(
    initialData?.plans?.[0]?.category || 'Standard'
  );
  // When editing a lead that already has plans, start with picker closed
  const [showNumberPool, setShowNumberPool] = useState(
    !(isEditing && (initialData?.plans?.length ?? 0) > 0)
  );
  const [selectedAgentId, setSelectedAgentId] = useState<string>(user?.id || '');
  const [managedAgents, setManagedAgents] = useState<User[]>([]);
  const [teamManagerId, setTeamManagerId] = useState<string | null>(null);
  const planErrorRef = useRef<HTMLDivElement | null>(null);
  const numberSectionRef = useRef<HTMLDivElement | null>(null);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [whatsappVerificationEnabled, setWhatsappVerificationEnabled] = useState(true);
  const [planCategories, setPlanCategories] = useState<PlanCategoryGroup[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [showNumberActiveDialog, setShowNumberActiveDialog] = useState(false);
  const [activeNumberInfo, setActiveNumberInfo] = useState<{number: string, etiStatus: number, message: string} | null>(null);
  const [showNumberNotInPoolPopup, setShowNumberNotInPoolPopup] = useState(false);
  const [numberNotInPoolInfo, setNumberNotInPoolInfo] = useState<{ numbers: string[]; message: string } | null>(null);
  const [isCheckingNumber, setIsCheckingNumber] = useState(false);
  const [numberActiveCheckEnabled, setNumberActiveCheckEnabled] = useState(true); // Default to enabled

  // Helper functions to convert between 24-hour (HH:mm) and 12-hour (h:mm AM/PM) formats
  const convertTo12Hour = (time24: string): string => {
    if (!time24 || !time24.includes(':')) return '';
    const [hours, minutes] = time24.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) return '';
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const convertTo24Hour = (time12: string): string => {
    if (!time12) return '';
    // Match patterns like "12:34 PM" or "1:23 AM"
    const match = time12.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return time12; // Return as-is if doesn't match 12-hour format
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period = match[3].toUpperCase();
    
    if (period === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }
    
    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  };

  // Helper to normalize category names for comparison
  const normalizeCategory = useCallback((cat?: string): string => {
    if (!cat) return '';
    let normalized = cat.toLowerCase().trim();
    if (normalized.includes('sillver') || normalized.includes('siver')) {
      normalized = 'silver';
    }
    return normalized;
  }, []);

  // Load all plans separately to access their category field
  useEffect(() => {
    async function loadAllPlans() {
      try {
        const plans = await getPlans();
        setAllPlans(plans);
      } catch (error) {
        // Error loading plans
      }
    }
    loadAllPlans();
  }, []);

  // Keep selectedPlans in sync when editing and initialData changes
  useEffect(() => {
    if (isEditing && initialData?.plans) {
      setSelectedPlans(initialData.plans as unknown as PlanSelection[]);
    }
  }, [isEditing, initialData?.plans]);

  // Auto-advance the time field every minute so it never falls into the past
  useEffect(() => {
    if (isEditing) return;

    const tick = () => {
      setFormData(prev => {
        const today = format(new Date(), 'yyyy-MM-dd');
        if (prev.startDate !== today) return prev; // only auto-update for today

        const [h, m] = prev.startTime.split(':').map(Number);
        const stored = new Date();
        stored.setHours(h, m, 0, 0);
        const now = new Date();

        if (stored <= now) {
          // Bump to current time + 1 min
          const updated = addMinutes(now, 1);
          return { ...prev, startTime: format(updated, 'HH:mm') };
        }
        return prev;
      });
      // Also clear any stale "in the past" error
      setFormErrors(prev => prev.startTime ? { ...prev, startTime: '' } : prev);
    };

    tick(); // run immediately on mount / date change
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [isEditing]);

  // Load agents from managed teams for multi-team managers
  useEffect(() => {
    const loadManagedAgents = async () => {
      if (user?.role === 'manager' && user.managedTeams && user.managedTeams.length > 0) {
        try {
          const agentsRef = collection(db, 'users');
          const agentsQuery = query(
            agentsRef,
            where('role', '==', 'agent'),
            where('teamId', 'in', user.managedTeams)
          );
          const agentsSnapshot = await getDocs(agentsQuery);
          const agents = agentsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as User));
          setManagedAgents(agents);
        } catch (error) {
          console.error('Error loading managed agents:', error);
          toast.error('Failed to load agents');
        }
      }
    };

    loadManagedAgents();
  }, [user]);

  // Filter and group plans based on their category field from Firebase
  // The plan's `category` field stores the number category (e.g., "Standard", "Silver", "Gold", "Platinum")
  // Plans should be grouped by this category field to show proper headings
  const filteredPlanCategories = useMemo(() => {
    // Normalize category strings for comparison (handles typos and variations)
    const normalizeCategory = (cat: string): string => {
      if (!cat) return '';
      // Normalize to lowercase and handle common typos
      let normalized = cat.toLowerCase().trim();
      // Handle common typos: "Sillver" -> "Silver", "Siver" -> "Silver"
      if (normalized.includes('sillver') || normalized.includes('siver') || normalized === 'silver') {
        normalized = 'silver';
      }
      return normalized;
    };

    // Filter plans if a number category is selected
    let filteredPlans = allPlans;
    if (selectedCategory) {
      const normalizedSelected = normalizeCategory(selectedCategory);
      filteredPlans = allPlans.filter(plan => {
        if (!plan.category) return false;
        return normalizeCategory(plan.category) === normalizedSelected;
      });
    }

    // Group plans by their category field (number category like "Silver", "Gold", etc.)
    const plansByCategory = new Map<string, typeof filteredPlans>();
    filteredPlans.forEach(plan => {
      const category = plan.category || 'Other';
      if (!plansByCategory.has(category)) {
        plansByCategory.set(category, []);
      }
      plansByCategory.get(category)!.push(plan);
    });

    // Convert to PlanCategoryGroup format with proper headings based on plan category
    const grouped: PlanCategoryGroup[] = [];
    // Sort categories for consistent display order
    const sortedCategories = Array.from(plansByCategory.keys()).sort((a, b) => {
      // Sort order: Standard, Silver, Gold, Platinum, then others
      const order: { [key: string]: number } = {
        'Standard': 1,
        'Silver': 2,
        'Sillver': 2, // Handle typo
        'Gold': 3,
        'Platinum': 4
      };
      return (order[a] || 99) - (order[b] || 99);
    });

    sortedCategories.forEach(category => {
      const plansInCategory = plansByCategory.get(category)!;
      // Capitalize first letter of category name
      const normalizedCat = normalizeCategory(category);
      // Handle special case for typo "Sillver" -> "Silver"
      let displayCategory = category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
      if (normalizedCat === 'silver') {
        displayCategory = 'Silver';
      }
      
      // Remove duplicates: first by ID (preferred), then by name if no ID
      // Keep only one instance of each plan to avoid duplicate keys
      const uniquePlansMap = new Map<string, typeof plansInCategory[0]>();
      plansInCategory.forEach(plan => {
        if (plan.id) {
          // Use ID as key to ensure uniqueness
          if (!uniquePlansMap.has(plan.id)) {
            uniquePlansMap.set(plan.id, plan);
          }
        } else {
          // If no ID, use name as key (but this might cause duplicates)
          const key = plan.name;
          if (!uniquePlansMap.has(key)) {
            uniquePlansMap.set(key, plan);
          }
        }
      });
      const uniquePlans = Array.from(uniquePlansMap.values());
      
      grouped.push({
        label: `✅ ${displayCategory}`, // Use the plan's category field as the heading with ✅ emoji
        categoryName: category,
        options: uniquePlans.map((plan, index) => ({
          value: plan.id ? `${plan.id}|${plan.name}` : `${category}|${plan.name}|${index}`, // Use plan ID to ensure uniqueness
          label: plan.name
        }))
      });
    });

    return grouped;
  }, [selectedCategory, allPlans]);

  const [formData, setFormData] = useState<FormData>(() => {
    const defaultStartDateTime = addMinutes(new Date(), 5);

    const resolvedStartDate = initialData?.startDate
      ? format(initialData.startDate, 'yyyy-MM-dd')
      : (savedDraft?.formData?.startDate || format(defaultStartDateTime, 'yyyy-MM-dd'));

    const resolvedStartTime = initialData?.startTime
      ? initialData.startTime
      : format(defaultStartDateTime, 'HH:mm');

    return {
    customerName: initialData?.customerName || savedDraft?.formData?.customerName || '',
    customerNumber: initialData?.customerNumber || savedDraft?.formData?.customerNumber || '',
    customerAddress: initialData?.customerAddress || savedDraft?.formData?.customerAddress || '',
    country: initialData?.country || savedDraft?.formData?.country || 'AE',
    customerAge: initialData?.customerAge?.toString() || savedDraft?.formData?.customerAge || '',
    productType: initialData?.productType || savedDraft?.formData?.productType || 'New',
    homeWifiEmail: initialData?.homeWifiEmail || savedDraft?.formData?.homeWifiEmail || '',
    homeWifiId: initialData?.homeWifiId || savedDraft?.formData?.homeWifiId || '',
    gender: initialData?.gender || savedDraft?.formData?.gender || 'Male',
    emirate: initialData?.emirate || savedDraft?.formData?.emirate || 'Dubai',
    hasEmirateId: initialData?.hasEmirateId ?? savedDraft?.formData?.hasEmirateId ?? false,
    advancePayment: initialData?.advancePayment ?? savedDraft?.formData?.advancePayment ?? false,
    language: initialData?.language || savedDraft?.formData?.language || 'English',
    sharedWith: initialData?.sharedWith?.[0] || savedDraft?.formData?.sharedWith || '',
    locationUrl: initialData?.locationUrl || savedDraft?.formData?.locationUrl || '',
    confirmLocationUrl: initialData?.confirmLocationUrl ?? savedDraft?.formData?.confirmLocationUrl ?? false,
      startDate: resolvedStartDate,
      startTime: resolvedStartTime,
    numberType: initialData?.numberType || savedDraft?.formData?.numberType || 'Standard',
    remarks: (initialData?.remarks && initialData.remarks.trim() !== '') ? initialData.remarks : (savedDraft?.formData?.remarks || 'Please Verify')
    };
  });

  const isNoNumberProduct = useMemo(() => {
    return (
      formData.productType === 'MNP' ||
      formData.productType === 'Prepaid to postpaid' ||
      formData.productType === 'Home Wifi'
    );
  }, [formData.productType]);

  const maxNumbersReached = useMemo(() => {
    if (isNoNumberProduct) return false;
    const realNumbersCount = selectedPlans.filter(p => !p.numberId?.startsWith('virtual-')).length;
    return realNumbersCount >= 5;
  }, [isNoNumberProduct, selectedPlans]);

  useEffect(() => {
    if (!isEditing && !user?.teamId) {
      toast.error('You must be assigned to a team to create leads');
      navigate('/dashboard');
      return;
    }

    loadTeamMembers();
    loadPlanCategories();
    loadWhatsAppSetting();
    
    // Show notification if draft was loaded
    if (savedDraft) {
      toast.success('Draft form data restored', { duration: 3000 });
    }
  }, [user, navigate, isEditing]);

  // Auto-save form data to localStorage (only when creating new leads, not editing)
  useEffect(() => {
    if (isEditing) return;
    try {
      const { startTime, ...formDataWithoutTime } = formData;
      const draftData = {
        formData: formDataWithoutTime,
        selectedPlans,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(draftData));
    } catch (error) {
      console.error('Error saving form draft:', error);
    }
  }, [formData, selectedPlans, isEditing]);

  // Auto-expire draft after 3 minutes — clear localStorage so next open starts fresh
  useEffect(() => {
    if (isEditing) return;
    const saved = localStorage.getItem(FORM_DRAFT_KEY);
    if (!saved) return;
    try {
      const { timestamp } = JSON.parse(saved);
      const remaining = DRAFT_TTL_MS - (Date.now() - new Date(timestamp).getTime());
      if (remaining <= 0) {
        localStorage.removeItem(FORM_DRAFT_KEY);
        return;
      }
      const timer = setTimeout(() => {
        localStorage.removeItem(FORM_DRAFT_KEY);
      }, remaining);
      return () => clearTimeout(timer);
    } catch {
      localStorage.removeItem(FORM_DRAFT_KEY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  const loadWhatsAppSetting = async () => {
    try {
      const [whatsappEnabled, numberCheckEnabled] = await Promise.all([
        getWhatsAppVerificationEnabled(),
        getNumberActiveCheckEnabled()
      ]);
      setWhatsappVerificationEnabled(whatsappEnabled);
      setNumberActiveCheckEnabled(numberCheckEnabled);
    } catch (error) {
      // Keep default value (true) on error
    }
  };

  async function loadPlanCategories() {
    try {
      setLoadingPlans(true);
      const categories = await getPlanCategoriesWithPlans();
      setPlanCategories(categories);
    } catch (error) {
      toast.error('Failed to load plans');
    } finally {
      setLoadingPlans(false);
    }
  }

  async function loadTeamMembers() {
    try {
      if (!user?.teamId) return;

      // First get the team to get the manager ID
      const teamRef = doc(db, 'teams', user.teamId);
      const teamDoc = await getDoc(teamRef);
      
      if (!teamDoc.exists()) {
        return;
      }

      const teamData = teamDoc.data();
      
      // Then get team members
      const teamQuery = query(
        collection(db, 'users'),
        where('teamId', '==', user.teamId),
        where('role', 'in', ['agent', 'verifier', 'coordinator'])
      );
      const snapshot = await getDocs(teamQuery);
      const members = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as User))
        .filter(member => member.id !== user.id);
      setTeamMembers(members);

      // Store the team's manager ID
      setTeamManagerId(teamData.managerId);
    } catch (error) {
      toast.error('Failed to load team members');
    }
  }

  const handleNumberSelect = useCallback((number: NumberPool) => {
    setCurrentNumber(number.number);
    setCurrentNumberData(number);
    const previousCategory = selectedCategory;
    setSelectedCategory(number.category);
    setShowNumberPool(false);
    // Reset current plan only if category actually changed
    if (previousCategory !== number.category) {
      setCurrentPlan('');
    }
    setFormErrors(prev => {
      const { plans, selectedNumber, ...rest } = prev;
      return rest;
    });
  }, [selectedCategory]);

  const handlePlanSelect = useCallback((plan: string) => {
    // Prevent selection of category headers (values starting with "category-")
    if (plan.startsWith('category-')) {
      return;
    }
    
    // If plan is just a name, we need to find the full value from options
    // The plan value format is either "planId|planName" or "category|planName|index"
    // But we also need to handle when it's passed directly as the full value
    setCurrentPlan(plan);
    setFormErrors(prev => {
      const { plans, ...rest } = prev;
      return rest;
    });
  }, []);

  const clearLocationUrlError = useCallback(() => {
    setFormErrors(prev => {
      if (!prev.locationUrl) return prev;
      const { locationUrl, ...rest } = prev;
      return rest;
    });
  }, []);

  const handleLocationUrlChange = useCallback((value: string) => {
    setFormData(prev => ({ ...prev, locationUrl: value }));
    clearLocationUrlError();
  }, [clearLocationUrlError]);

  const handleLocationUrlBlur = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      clearLocationUrlError();
      return;
    }

    try {
      // eslint-disable-next-line no-new
      new URL(trimmed);
      clearLocationUrlError();
    } catch {
      setFormErrors(prev => ({
        ...prev,
        locationUrl: 'Please enter a valid URL'
      }));
    }
  }, [clearLocationUrlError]);

  const handleAddPlan = useCallback(async () => {
    // Validate both fields and show inline errors rather than just toasts
    let hasError = false;
    if (!isNoNumberProduct && !currentNumber) {
      setFormErrors(prev => ({
        ...prev,
        selectedNumber: 'Please select a number first before adding a plan',
      }));
      hasError = true;
    }
    if (!currentPlan || currentPlan === '') {
      setFormErrors(prev => ({
        ...prev,
        plans: 'Please select a plan',
      }));
      hasError = true;
    }
    if (hasError) return;

    // Enforce maximum of 5 numbers per lead (for number-based products)
    if (!isNoNumberProduct) {
      const realNumbersCount = selectedPlans.filter(p => !p.numberId?.startsWith('virtual-')).length;
      if (realNumbersCount >= 5) {
        toast.error('You can attach a maximum of 5 numbers to a lead.');
        return;
      }
    }

    // Extract plan name from value if it contains plan ID (format: "planId|planName" or "category|planName|index")
    const planName = currentPlan.includes('|') 
      ? currentPlan.split('|')[1] 
      : currentPlan;

    // If product type does not require number, add a virtual entry
    if (isNoNumberProduct) {
      let label = 'MNP';
      if (formData.productType === 'Prepaid to postpaid') {
        label = 'P2P';
      } else if (formData.productType === 'Home Wifi') {
        label = 'Home Wifi';
      }
      const virtualId = `virtual-${formData.productType === 'Home Wifi' ? 'home-wifi' : label.toLowerCase()}`;
      const existingIndex = selectedPlans.findIndex(p => p.numberId === virtualId);
      if (existingIndex !== -1) {
        setSelectedPlans(prev => prev.map((p, idx) => idx === existingIndex ? { ...p, plan: planName, category: selectedCategory, group: 'G2' } : p));
        toast.success('Plan updated successfully');
        
      } else {
        setSelectedPlans(prev => [...prev, {
          numberId: virtualId,
          number: label,
          plan: planName,
          category: selectedCategory,
          group: 'G2' // Default to G2 for MNP and Prepaid to postpaid
        } as any]);
        
      }
      setCurrentPlan('');
      // Reset number pool visibility so user can add more numbers
      setShowNumberPool(true);
      setFormErrors(prev => {
        const { plans, ...rest } = prev;
        return rest;
      });
      
      return;
    }

    // If a number is selected, check if it's already in selectedPlans
    if (currentNumber && currentNumberData) {
      const existingPlanIndex = selectedPlans.findIndex(p => p.numberId === currentNumberData.id);
      
      if (existingPlanIndex !== -1) {
        // Update the plan for existing number
        setSelectedPlans(prev => prev.map((plan, index) => 
          index === existingPlanIndex 
            ? { ...plan, plan: planName }
            : plan
        ));
        toast.success('Plan updated successfully');
        
      } else {
        // Check number status before adding - verify it's not active
        // Only check if the feature is enabled (admin can toggle this)
        if (numberActiveCheckEnabled) {
          setIsCheckingNumber(true);
          try {
            toast.loading('Checking number status...', { id: 'number-check' });
            const { NumberCheckService } = await import('../../services/numberCheckService');
            const canReserve = await NumberCheckService.canReserveNumber(currentNumber);
            toast.dismiss('number-check');
            setIsCheckingNumber(false);
            
            if (!canReserve) {
              // Number is active, show dialog
              setActiveNumberInfo({
                number: currentNumber,
                etiStatus: 200, // ETI API returned 200 for active numbers
                message: 'Number is active'
              });
              setShowNumberActiveDialog(true);
              return;
            }
          } catch (error: any) {
            console.error('Error checking number status:', error);
            toast.dismiss('number-check');
            setIsCheckingNumber(false);
            toast.error('Failed to verify number status. Please try again.', {
              duration: 3000
            });
            return;
          }
        }

        // Add new number with plan
        setSelectedPlans(prev => [...prev, {
          numberId: currentNumberData.id,
          number: currentNumber,
          plan: planName,
          category: currentNumberData.category,
          group: currentNumberData.group
        }]);
        
      }

      setCurrentNumber('');
      setCurrentPlan('');
      setCurrentNumberData(null);
      setSelectedCategory('Standard');
      // Hide number pool initially, show "Add Another Number" button first
      setShowNumberPool(false);
    } else {
      // If no number is selected, check if we have existing plans
      // Allow updating plan for the first existing plan if no number is selected
      if (selectedPlans.length > 0) {
        // Update the plan for the first existing number
        setSelectedPlans(prev => prev.map((plan, index) => 
          index === 0 
            ? { ...plan, plan: planName }
            : plan
        ));
        toast.success('Plan updated successfully');
        
        setCurrentPlan('');
        setFormErrors(prev => {
          const { plans, ...rest } = prev;
          return rest;
        });
      } else {
        // If no plans exist yet, require number selection
        toast.error('Please select a number');
        setFormErrors(prev => ({
          ...prev,
          selectedNumber: 'Please select a number.',
          plans: undefined // Clear plan error if there was one
        }));
        
        return;
      }
    }

    setFormErrors(prev => {
      const { plans, ...rest } = prev;
      return rest;
    });
    
  }, [currentNumber, currentNumberData, currentPlan, selectedPlans, selectedCategory, isNoNumberProduct, formData.productType]);

  const handleRemovePlan = useCallback((numberId: string) => {
    setSelectedPlans(prev => prev.filter(p => p.numberId !== numberId));
    setFormErrors(prev => {
      const { plans, ...rest } = prev;
      return rest;
    });
  }, []);

  const handleChangePlanFor = useCallback((numberId: string, planValue: string) => {
    // planValue may be in the format "planId|planName" or a plain name
    const planName = planValue.includes('|') ? planValue.split('|')[1] : planValue;
    setSelectedPlans(prev => prev.map(p => p.numberId === numberId ? { ...p, plan: planName } : p));
    setFormErrors(prev => {
      const { plans, ...rest } = prev;
      return rest;
    });
  }, []);

  const handleClearDraft = () => {
    if (window.confirm('Are you sure you want to clear the saved draft and start fresh?')) {
      try {
        localStorage.removeItem(FORM_DRAFT_KEY);
        toast.success('Draft cleared successfully');
        // Reload the page to reset the form
        window.location.reload();
      } catch (error) {
        console.error('Error clearing draft:', error);
        toast.error('Failed to clear draft');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent, isWhatsAppVerification = false) => {
    e.preventDefault();
    
    
    // Validate form data
    const errors: FormErrors = {};
    // Name
    if (!formData.customerName || formData.customerName.trim().length === 0) {
      errors.customerName = 'Customer name is required';
    }
    // Phone
    if (!formData.customerNumber || formData.customerNumber.trim().length === 0) {
      errors.customerNumber = 'Customer number is required';
    } else if (!/^05\d{8}$/.test(formData.customerNumber.trim())) {
      errors.customerNumber = 'Phone number must be exactly 10 digits starting with 05';
    }
    // Address
    if (!formData.customerAddress || formData.customerAddress.trim().length === 0) {
      errors.customerAddress = 'Customer address is required';
    }
    // Age
    if (!formData.customerAge || formData.customerAge.trim().length === 0) {
      errors.customerAge = 'Customer age is required';
    } else {
      const age = parseInt(formData.customerAge, 10);
      if (Number.isNaN(age) || age < 21) {
        errors.customerAge = 'Age must be 21 or above';
      }
    }

    // Agent selection for multi-team managers
    if (user?.role === 'manager' && user.managedTeams && user.managedTeams.length > 0) {
      if (!selectedAgentId || selectedAgentId.trim().length === 0) {
        errors.agentId = 'Please select an agent to assign this lead to';
      } else {
        // For multi-team managers, ensure the selected agent is either themselves or from their managed teams
        const isValidAgent = selectedAgentId === user.id ||
          managedAgents.some(agent => agent.id === selectedAgentId);
        if (!isValidAgent) {
          errors.agentId = 'Please select a valid agent from your managed teams';
        }
      }
    }
    // Date & Time (skip strict validation for coordinators when editing)
    const skipDateTimeValidation = isEditing && user?.role === 'coordinator';
    if (!skipDateTimeValidation) {
    if (!formData.startDate) {
      errors.startDate = 'Date is required';
      } else {
        // Check if date is in the past
        const selectedDate = new Date(formData.startDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        selectedDate.setHours(0, 0, 0, 0);
        
        if (selectedDate < today) {
          errors.startDate = 'Date cannot be in the past';
        } else if (!isEditing && selectedDate.getTime() === today.getTime() && formData.startTime) {
          // Only validate "time cannot be in the past" when NOT editing
          // Handle both 24-hour format (HH:mm) and 12-hour format (h:mm AM/PM)
          let time24 = formData.startTime;
          if (time24.match(/\d{1,2}:\d{2}\s*(AM|PM)/i)) {
            // It's in 12-hour format, convert it
            time24 = convertTo24Hour(time24);
          }
          if (time24 && time24.includes(':')) {
            const [hours, minutes] = time24.split(':').map(Number);
            if (!isNaN(hours) && !isNaN(minutes)) {
              const selectedDateTime = new Date();
              selectedDateTime.setHours(hours, minutes, 0, 0);
              const now = new Date();
              
              if (selectedDateTime < now) {
                errors.startTime = 'Time cannot be in the past';
              }
            }
          }
        }
      }
      // Time is only required when NOT editing
      if (!isEditing && !formData.startTime) {
      errors.startTime = 'Time is required';
      }
    }
    // Optional URL validation
    if (formData.locationUrl && formData.locationUrl.trim().length > 0) {
      try {
        // eslint-disable-next-line no-new
        new URL(formData.locationUrl.trim());
      } catch {
        errors.locationUrl = 'Please enter a valid URL';
      }
    }
    // Extra required fields for Home Wifi
    if (formData.productType === 'Home Wifi') {
      if (!formData.homeWifiEmail || formData.homeWifiEmail.trim().length === 0) {
        errors.homeWifiEmail = 'Email is required for Home Wifi';
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.homeWifiEmail.trim())) {
        errors.homeWifiEmail = 'Please enter a valid email address';
      }
      if (!formData.homeWifiId || formData.homeWifiId.trim().length === 0) {
        errors.homeWifiId = 'ID is required for Home Wifi';
      }
    }

    // Plans
    if (!selectedPlans.length) {
      errors.plans = 'At least one number and plan must be added';
      // Only show the "select a number first" error if no number is currently staged either
      if (!isNoNumberProduct && !currentNumber) {
        errors.selectedNumber = 'Select a number first, then add a plan';
      }
      console.warn('[CreateLead] Validation failed: no plans selected');
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      if (errors.selectedNumber && numberSectionRef.current) {
        // No number selected at all — scroll to the number picker section
        numberSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (errors.plans) {
        const planEl = document.getElementById('planSelect');
        if (planEl) {
          planEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          try { (planEl as HTMLElement).focus?.(); } catch {}
        } else if (planErrorRef.current) {
          planErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else {
        toast.error('Please correct the highlighted fields before submitting');
      }
      return;
    }

    setLoading(true);
    
    try {
      // Check if forced group is enabled - parallelize config calls
      const forcedGroupEnabled = await getForcedGroupEnabled();
      const forcedGroup = forcedGroupEnabled ? await getForcedGroup() : null;

      // Check if numbers are from different groups
      // If forced group is enabled, all plans will use the forced group
      const groups = forcedGroup 
        ? [forcedGroup] 
        : [...new Set(selectedPlans.map(plan => plan.group))];
      
      // If there are multiple groups, route to coordinator
      const hasDifferentGroups = groups.length > 1;

      // Find appropriate verifier based on group (non-blocking - don't wait for it)
      let assignedVerifierId: string | null = null;
      if (!hasDifferentGroups && groups.length === 1) {
        // Find verifier for this specific group (run in parallel, don't block lead creation)
        const targetGroup = (forcedGroup || groups[0])?.toLowerCase(); // Normalize to lowercase
        // Start verifier lookup but don't await it - we'll use it if ready, otherwise continue
        const verifierPromise = (async () => {
        try {
          const verifiersQuery = query(
            collection(db, 'users'),
            where('role', '==', 'verifier')
          );
          const verifiersSnapshot = await getDocs(verifiersQuery);
          const verifiers = verifiersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as User[];

          // Filter verifiers that can handle this group
          const eligibleVerifiers = verifiers.filter(v => {
            const verifierGroups = v.verifierGroups || [];
            const hasAllGroups = verifierGroups.includes('all') || verifierGroups.length === 0;
            if (hasAllGroups) return true;

            // Check if verifier's groups include the target group
            return verifierGroups.some(group => group.toLowerCase() === targetGroup);
          });

          // Prefer specific group verifiers over 'all' group verifiers
          const specificVerifier = eligibleVerifiers.find(v => {
            const verifierGroups = v.verifierGroups || [];
            return verifierGroups.some(group => group.toLowerCase() === targetGroup);
          });
          const allGroupVerifier = eligibleVerifiers.find(v => {
            const verifierGroups = v.verifierGroups || [];
            return verifierGroups.includes('all') || verifierGroups.length === 0;
          });

            return specificVerifier?.id || allGroupVerifier?.id || null;
        } catch (error) {
            return null;
          }
        })();
        
        // Try to get verifier quickly, but don't wait more than 500ms
        try {
          assignedVerifierId = await Promise.race([
            verifierPromise,
            new Promise<string | null>(resolve => setTimeout(() => resolve(null), 500))
          ]);
        } catch (error) {
          // Continue without verifier assignment
        }
      }

      // Clean up form data to remove any undefined values
      const cleanedFormData = Object.fromEntries(
        Object.entries(formData).filter(([_, value]) => value !== undefined)
      );

    // Preserve existing status when editing; new leads default to pending_verification
    const currentStatus = isEditing
      ? (initialData?.status || 'pending_verification')
      : 'pending_verification';

      // Get the first plan's group - all plans in the lead will use this group
      // If forced group is enabled, use the forced group instead
      const firstPlanGroup = forcedGroup || selectedPlans[0]?.group || (
        (formData.productType === 'MNP' ||
         formData.productType === 'Prepaid to postpaid' ||
         formData.productType === 'Home Wifi')
          ? 'G2' 
          : 'Standard'
      );

      // Get the first plan's number, numberId, and category for storing as separate fields
      const firstPlan = selectedPlans[0];
      const selectedNumber = firstPlan?.number || '';
      const selectedNumberId = firstPlan?.numberId || '';
      const selectedCategory = firstPlan?.category || 'Standard';

      const leadData: Partial<Lead> = {
        ...cleanedFormData,
        customerAddress: formData.customerAddress,
        customerAge: parseInt(formData.customerAge),
        numberId: selectedNumberId, // Store selected number ID at lead level
        numberType: selectedCategory, // Store category instead of "Standard"
        plans: selectedPlans.map((plan, index) => {
          // Default to G2 for MNP, Prepaid to postpaid and Home Wifi
          const defaultGroup = (
            formData.productType === 'MNP' ||
            formData.productType === 'Prepaid to postpaid' ||
            formData.productType === 'Home Wifi'
          ) 
            ? 'G2' 
            : 'Standard';
          
          // Use forced group if enabled, otherwise use first plan's group for all plans in the lead (only in lead document, not numberPool)
          const groupToUse = forcedGroup || (index === 0 
            ? (plan.group || defaultGroup)
            : firstPlanGroup); // All subsequent plans use the first plan's group
          
          const p: any = {
            numberId: plan.numberId,
            number: plan.number,
            plan: plan.plan,
            group: groupToUse,
            status: 'pending_verification'
          };
          if (plan.category !== undefined && plan.category !== null && plan.category !== '') {
            p.category = plan.category;
          }
          return p;
        }),
        agentId: selectedAgentId || user!.id,
        teamId: (() => {
          // For multi-team managers, use the selected agent's team
          if (user?.role === 'manager' && user.managedTeams && selectedAgentId !== user.id) {
            const selectedAgent = managedAgents.find(agent => agent.id === selectedAgentId);
            return selectedAgent?.teamId || user.teamId;
          }
          return user!.teamId;
        })(),
        managerId: teamManagerId || null,
        ...(assignedVerifierId && { verifierId: assignedVerifierId }),
        ...(isEditing ? {} : { createdAt: new Date() }),
        updatedAt: new Date(),
        startDate: new Date(formData.startDate),
        status: currentStatus,
      };

      // Add additional fields to leadData
      const finalLeadData = {
        ...leadData,
        sharedWith: formData.sharedWith ? [formData.sharedWith] : [],
        remarks: formData.remarks || 'Please Verify'
      };
      
      // Store selected number as separate field (using a custom field name since Lead interface doesn't have it)
      (finalLeadData as any).selectedNumber = selectedNumber;

      // Remove any remaining undefined values
      let cleanedLeadData = Object.fromEntries(
        Object.entries(finalLeadData).filter(([_, value]) => value !== undefined)
      ) as Partial<Lead>;
      
      // For coordinators editing, only include allowed fields: customerName, customerAddress, customerAge
      if (isCoordinatorEditing && isEditing) {
        cleanedLeadData = {
          customerName: formData.customerName,
          customerAddress: formData.customerAddress,
          customerAge: parseInt(formData.customerAge, 10),
          updatedAt: new Date()
        };
      }

      // Validate numbers only in numberPool: lead can be created only if number status is 'open'
      // OR number is 'reserved' by the same agent (selectedAgentId or current user).
      // Skip this check when verifier/coordinator/admin is editing – the number is already reserved for the agent.
      const skipNumberPoolCheck = isEditing && (isVerifier() || isCoordinator() || isAdmin());
      const plansToValidate = (finalLeadData.plans || []) as Array<{ numberId: string; number: string }>;
      const realPlansToValidate = plansToValidate.filter(p => !p.numberId?.startsWith('virtual-'));
      const currentAgentId = selectedAgentId || user?.id || '';
      if (!skipNumberPoolCheck && realPlansToValidate.length > 0) {
        const invalidNumbers: string[] = [];
        for (let i = 0; i < realPlansToValidate.length; i++) {
          const plan = realPlansToValidate[i];
          const poolSnap = await getDoc(doc(db, 'numberPool', plan.numberId));
          const displayNumber = plan.number || plan.numberId;
          if (!poolSnap.exists()) {
            invalidNumbers.push(displayNumber);
            continue;
          }
          const data = poolSnap.data();
          const status = data?.status;
          const reservedBy = data?.reservedBy;
          // Only two allowed cases: status must be exactly 'open', or exactly 'reserved' by this agent.
          // If reservedBy is same agent but status is something else (e.g. pending_verification), reject.
          const allowed =
            status === 'open' ||
            (status === 'reserved' && reservedBy === currentAgentId);
          if (!allowed) {
            invalidNumbers.push(displayNumber);
          }
        }
        if (invalidNumbers.length > 0) {
          setNumberNotInPoolInfo({
            numbers: invalidNumbers,
            message: 'The following number(s) are not in the number pool or are not available. A number must be open or reserved by you to create a lead.'
          });
          setShowNumberNotInPoolPopup(true);
          setLoading(false);
          return;
        }
      }

      if (isEditing && onSave) {
        try {
        await onSave(cleanedLeadData);
        } catch (error) {
          console.error('Error saving lead:', error);
          toast.error(error instanceof Error ? error.message : 'Failed to save lead. Please try again.');
          setLoading(false);
          return;
        }
      } else {
        const docRef = await addDoc(collection(db, 'leads'), cleanedLeadData);
        
        // Log lead creation (non-blocking - fire and forget)
        logLeadAction(
          docRef.id,
          finalLeadData.leadNumber || docRef.id,
          'created',
          undefined,
          { ...finalLeadData, id: docRef.id },
          `Lead created with ${finalLeadData.plans?.length || 0} plan(s)`
        ).catch(error => {
          console.error('Error logging lead creation:', error);
        });
        
        // Clear the form draft from localStorage on successful creation
        try {
          localStorage.removeItem(FORM_DRAFT_KEY);
        } catch (error) {
          console.error('Error clearing form draft:', error);
        }

        // Update all numbers in the lead's plans
        const plans = finalLeadData.plans as Array<{
          numberId: string;
          number: string;
          plan: string;
          category: string;
          group?: string;
          type: string;
          status: string;
        }>;

        if (plans && plans.length > 0) {
          
          // Only update numberPool for real numbers; skip virtual entries for MNP/P2P
          const realPlans = plans.filter(p => !p.numberId?.startsWith('virtual-'));
          
          // Batch read all number documents first (parallel)
          const numberDocsPromises = realPlans.map(plan => 
            getDoc(doc(db, 'numberPool', plan.numberId))
          );
          const numberDocs = await Promise.all(numberDocsPromises);
          
          // We already validated all numbers (exist in pool, open or reserved by agent) before creating the lead.
          const updatePromises = realPlans.map(async (plan, index) => {
            try {
              const numberRef = doc(db, 'numberPool', plan.numberId);
              const numberDoc = numberDocs[index];
              const oldData = numberDoc.exists() ? numberDoc.data() : null;
              const strikeWindowMs = await getStrikeWindowMs();
              const convertingClaims = claimQueueWouldConvertToStrikes(oldData);
              await updateDoc(numberRef, {
                status: 'pending_verification',
                lastStatusChange: new Date(),
                leadId: docRef.id,
                reservedBy: selectedAgentId || user?.id || null,
                ...poolFieldsWhenAttachingToLead(oldData, strikeWindowMs),
              });
              if (convertingClaims) {
                notifyOwnerOfClaimToStrikeConversion({
                  leadId: docRef.id,
                  numberId: plan.numberId,
                  number: plan.number,
                });
              }
              logNumberAction(
                plan.numberId,
                plan.number,
                'lead_created',
                oldData,
                { status: 'pending_verification', leadId: docRef.id },
                `Lead created with plan: ${plan.plan}`
              ).catch(err => {
                console.error(`Error logging number action for ${plan.numberId}:`, err);
              });
            } catch (err) {
              console.error(`Error updating number ${plan.numberId}:`, err);
              toast.error(`Could not update number ${plan.number || plan.numberId} in the pool. The lead was created.`);
            }
          });
          
          await Promise.all(updatePromises);
        }

        // Add initial remarks as a chat message if remarks exist (non-blocking)
        if (formData.remarks && formData.remarks.trim() !== '') {
          // Fire and forget - don't block lead creation
          (async () => {
          try {
            await addDoc(collection(db, 'chatMessages'), {
              leadId: docRef.id,
              userId: user?.id || '',
              userRole: user?.role || 'agent',
              message: formData.remarks.trim(),
              createdAt: new Date()
            });
            
              // Send WhatsApp notification for the initial chat message (non-blocking)
            try {
              // Fetch the created lead to get full lead data for notification
              // Retry logic to wait for lead number generation (Firestore trigger runs asynchronously)
              let leadData: Lead | null = null;
              let retryCount = 0;
              const maxRetries = 5;
              const leadRef = doc(db, 'leads', docRef.id);
              
              while (retryCount < maxRetries) {
                const leadDoc = await getDoc(leadRef);
              if (leadDoc.exists()) {
                  const fetchedData = { id: leadDoc.id, ...leadDoc.data() } as Lead;
                  leadData = fetchedData;
                  
                  // If lead number exists and is not just the ID, we have the generated number
                  if (fetchedData.leadNumber && fetchedData.leadNumber !== fetchedData.id) {
                    break; // Lead number is ready
                  }
                }
                
                // Wait before retrying (lead number generation might be in progress)
                if (retryCount < maxRetries - 1) {
                  await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
                }
                retryCount++;
              }
              
              if (leadData) {
                const { sendChatMessageWhatsAppNotification } = await import('../../utils/chatNotifications');
                await sendChatMessageWhatsAppNotification(
                  leadData,
                  formData.remarks.trim(),
                  user?.name || 'Unknown'
                );
              }
            } catch (notificationError) {
              console.error('Error sending WhatsApp notification for initial message:', notificationError);
            }
          } catch (chatError) {
            console.error('Error creating initial chat message:', chatError);
          }
          })();
        }

        // Show success popup
        const message = 'Lead created successfully'; // All leads go through normal verification
        
        setSuccessMessage(message);
        setShowSuccessPopup(true);
        
        // Navigate to the lead details page after popup
        setTimeout(() => {
          
          navigate(`/dashboard/leads/${docRef.id}`, { replace: true });
        }, 2000);

        // If WhatsApp verification is requested, mark method on lead and send the message
        if (isWhatsAppVerification) {
          // Format the phone number the same way as VerifierDashboard
          // Remove non-digits, remove leading 0, add 971 if not present
          let formattedNumber = formData.customerNumber;
          formattedNumber = formattedNumber.replace(/\D/g, ''); // Remove non-digits
          if (formattedNumber.startsWith('0')) {
            formattedNumber = formattedNumber.substring(1); // Remove leading 0
          }
          if (!formattedNumber.startsWith('971')) {
            formattedNumber = `971${formattedNumber}`; // Add 971 if not present
          }

          // Write routing map to ensure inbound replies map to this lead
          try {
            const routeDoc = fbDoc(db, 'whatsappRouting', formattedNumber.replace(/\D/g, ''));
            await setDoc(routeDoc, { leadId: docRef.id, sentAt: fbServerTimestamp() }, { merge: true });
          } catch (e) {
            // Error creating WhatsApp routing map
          }

          // Get the selected plan details from Firebase
          const selectedPlan = selectedPlans[0]?.plan;
          let planDetails = null;
          
          if (selectedPlan) {
            // Query Firebase directly using the plan name - don't require match in planCategories
              try {
                const plansQuery = query(collection(db, 'plans'), where('name', '==', selectedPlan));
                const plansSnapshot = await getDocs(plansQuery);
              
                if (!plansSnapshot.empty) {
                  const planDoc = plansSnapshot.docs[0];
                  const planData = planDoc.data();
                
                  planDetails = {
                    amount: planData.amount || 'N/A',
                    benefits: planData.benefits || 'N/A',
                    duration: planData.duration || 'N/A'
                  };
                }
              } catch (error) {
              // Error fetching plan details from Firebase
            }
          }
          
          // If we have plan details, send WhatsApp message
          if (planDetails) {
              const group = selectedPlans?.[0]?.group || undefined;
            
            const { triggerFlowExternal } = await import('../../utils/whatsappRouter');
            const language = formData.language || 'English';

              const amountDigits = (planDetails.amount || '').toString().match(/\d+/)?.[0];
              const monthlyLabel = amountDigits ? `${amountDigits} AED + 5% VAT` : planDetails.amount || 'N/A';
            const templateParameters = [
                  selectedPlans[0]?.number || 'N/A',
                  monthlyLabel,
                  planDetails.benefits,
                  planDetails.duration
            ];

            try {
              // Send WhatsApp verification message using Flow API (no Business Phone ID/Access Token needed)
              const sendResponse = await triggerFlowExternal({
                phoneNumber: formattedNumber,
                group,
                language,
                templateVariables: {
                  value1: templateParameters[0],
                  value2: templateParameters[1],
                  value3: templateParameters[2],
                  value4: templateParameters[3]
                }
              });
              
              // Log outbound verification message with messageId from response
              try {
                await logOutboundVerificationMessage(
                  docRef.id,
                  formattedNumber,
                  'verification_flow', // Template name for logging
                  templateParameters,
                  {
                    sendResponse
                  }
                );
              } catch (e) {
                // Error logging outbound message
                console.error('Failed to log outbound message:', e);
              }
              
              // Update whatsappInitiatedAt AFTER successfully sending the message
              try {
                await updateDoc(doc(db, 'leads', docRef.id), {
                  verificationMethod: 'whatsapp',
                  whatsappInitiatedAt: new Date()
                });
              } catch (e) {
                // Error updating lead with verification method
                console.error('Failed to update whatsappInitiatedAt:', e);
              }
              
              setSuccessMessage('Lead created and verification message sent to customer');
              setShowSuccessPopup(true);
              
              // Navigate to the lead details page after popup
              setTimeout(() => {
                navigate(`/dashboard/leads/${docRef.id}`, { replace: true });
              }, 2000);
            } catch (e: any) {
              // Check if it's a duplicate contact error - this is actually okay, contact exists
              const errorMessage = e?.message || '';
              const isDuplicateContact = errorMessage.includes('Duplicate entry') && errorMessage.includes('unique_shortcode');
              
              if (isDuplicateContact) {
                // Contact already exists, but flow should still work - treat as success
                try {
                await logOutboundVerificationMessage(
                  docRef.id,
                  formattedNumber,
                    'verification_flow',
                    templateParameters,
                    {
                      success: true,
                      warning: 'Contact already exists in system'
                    }
                  );
                } catch (logError) {
                  console.error('Failed to log outbound message:', logError);
                }
                
                // Update whatsappInitiatedAt even for duplicate contact
                try {
                  await updateDoc(doc(db, 'leads', docRef.id), {
                    verificationMethod: 'whatsapp',
                    whatsappInitiatedAt: new Date()
                  });
                } catch (updateError) {
                  console.error('Failed to update whatsappInitiatedAt:', updateError);
                }
                
                setSuccessMessage('Lead created and verification message sent to customer (contact already exists)');
                setShowSuccessPopup(true);
                
                // Navigate to the lead details page after popup
                setTimeout(() => {
                  navigate(`/dashboard/leads/${docRef.id}`, { replace: true });
                }, 2000);
              } else {
                // Real error - log it
                try {
                  await logOutboundVerificationMessage(
                    docRef.id,
                    formattedNumber,
                    'verification_flow',
                  templateParameters,
                  {
                    status: 'failed',
                    error: {
                      message: e?.message,
                      details: typeof e?.toString === 'function' ? e.toString() : undefined
                    }
                  }
                );
              } catch (logError) {
                console.error('Failed to log failed outbound message:', logError);
              }
              toast.error('Failed to send verification message to customer');
              }
            }
          }
        }
      }
    } catch (error) {
      // Error handling
      
      toast.error('Failed to save lead. Please try again.');
    } finally {
      setLoading(false);
      
    }
  };

  // Helper: Check if coordinator is editing - only allow name, address, age
  const isCoordinatorEditing = isCoordinator() && isEditing;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header - Now scrolls with page content */}
      <div className="bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4">
            {/* Header Content */}
            <div className="flex items-center justify-between">
              <div className="text-center sm:text-left">
                <h1 className="text-xl sm:text-3xl font-bold text-gray-900">
                  {isEditing ? 'Edit Lead' : 'Create New Lead'}
                </h1>
                <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600">
                  {isEditing ? 'Update lead information' : 'Fill in the customer details to create a new lead'}
                </p>
              </div>
              
              {/* Modern Cancel Button */}
              <button
                type="button"
                onClick={isEditing ? onCancel : () => navigate('/dashboard/leads')}
                className="flex items-center justify-center w-10 h-10 sm:w-auto sm:h-auto sm:px-4 sm:py-2 text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-full sm:rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                title="Cancel"
              >
                <svg className="w-5 h-5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="hidden sm:inline text-sm font-medium">Cancel</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isCoordinatorEditing && (
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> As a coordinator, you can only edit Customer Name, Address, and Age. All other fields are locked.
            </p>
          </div>
        )}
        <form onSubmit={(e) => handleSubmit(e)} className="space-y-8">
          <div className="grid grid-cols-1 gap-8">
          <FormSection
            icon={User2}
            title="Customer Information"
            description="Basic customer details"
          >
            <FormInput
              label="Full Name"
              icon={User2}
              type="text"
              required
              value={formData.customerName}
              onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
              error={formErrors.customerName}
            />

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Phone Number
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Phone className="h-5 w-5 text-gray-400" />
                </div>
                <div className="absolute inset-y-0 left-10 flex items-center pointer-events-none">
                  <span className="text-gray-900 text-sm sm:text-base">05</span>
                </div>
                <input
                  type="tel"
                  required
                  maxLength={8}
                  inputMode="numeric"
                  placeholder="XXXXXXXX"
                  value={formData.customerNumber.replace(/^05/, '')}
                  disabled={isCoordinatorEditing}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pastedText = e.clipboardData.getData('text');
                    // Remove all non-digits
                    const digitsOnly = pastedText.replace(/\D/g, '');
                    
                    // If pasted text is 10 digits and starts with "05", remove "05" and keep 8 digits
                    if (digitsOnly.length === 10 && digitsOnly.startsWith('05')) {
                      const remainingDigits = digitsOnly.slice(2); // Remove "05", keep remaining 8 digits
                      const fullNumber = '05' + remainingDigits;
                      setFormData(prev => ({ ...prev, customerNumber: fullNumber }));
                      
                      // Clear error if valid
                      if (/^05\d{8}$/.test(fullNumber)) {
                        setFormErrors(prev => {
                          const { customerNumber, ...rest } = prev;
                          return rest;
                        });
                      }
                    } else {
                      // For other cases, use normal onChange logic
                      const value = digitsOnly.slice(0, 8);
                      const fullNumber = '05' + value;
                      setFormData(prev => ({ ...prev, customerNumber: fullNumber }));
                    }
                  }}
                  onChange={(e) => {
                    // Only allow numeric input and max 8 digits (after "05")
                    const value = e.target.value.replace(/\D/g, '').slice(0, 8);
                    const fullNumber = '05' + value;
                    setFormData(prev => ({ ...prev, customerNumber: fullNumber }));
                    
                    // Real-time validation: show error if user has entered something but less than 10 digits
                    if (value.length > 0 && fullNumber.length < 10) {
                      setFormErrors(prev => ({
                        ...prev,
                        customerNumber: 'Phone number must be at least 10 digits'
                      }));
                    } else if (value.length === 8 && !/^05\d{8}$/.test(fullNumber)) {
                      setFormErrors(prev => ({
                        ...prev,
                        customerNumber: 'Phone number must be exactly 10 digits starting with 05'
                      }));
                    } else if (fullNumber.length === 10 && /^05\d{8}$/.test(fullNumber)) {
                      // Clear error if valid (exactly 10 digits and matches pattern)
                      setFormErrors(prev => {
                        const { customerNumber, ...rest } = prev;
                        return rest;
                      });
                    } else if (value.length === 0) {
                      // Clear error if field is empty (let onBlur handle required validation)
                      setFormErrors(prev => {
                        const { customerNumber, ...rest } = prev;
                        return rest;
                      });
                    }
                  }}
                  onBlur={(e) => {
                    // Validate on blur as well
                    const fullNumber = formData.customerNumber;
                    if (!fullNumber || fullNumber.trim().length === 0) {
                      setFormErrors(prev => ({
                        ...prev,
                        customerNumber: 'Customer number is required'
                      }));
                    } else if (fullNumber.length < 10) {
                      setFormErrors(prev => ({
                        ...prev,
                        customerNumber: 'Phone number must be at least 10 digits'
                      }));
                    } else if (!/^05\d{8}$/.test(fullNumber.trim())) {
                      setFormErrors(prev => ({
                        ...prev,
                        customerNumber: 'Phone number must be exactly 10 digits starting with 05'
                      }));
                    }
                  }}
                  className={`
                    block w-full pl-16 pr-3 py-2.5 sm:py-2 border rounded-lg shadow-sm focus:ring-2 focus:ring-offset-0 focus:outline-none transition-colors text-sm sm:text-base
                    ${formErrors.customerNumber 
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
                      : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
                    }
                  `}
                />
              </div>
              {formErrors.customerNumber && (
                <p className="text-sm text-red-600">{formErrors.customerNumber}</p>
              )}
            </div>

            <FormSelect
              label="Country"
              icon={Globe}
              options={countryList.map(country => ({
                value: country.code,
                label: country.name
              }))}
              value={formData.country}
              disabled={isCoordinatorEditing}
              onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
            />

            <FormInput
              label="Age"
              icon={User2}
              type="text"
              required
              maxLength={2}
              inputMode="numeric"
              value={formData.customerAge}
              onChange={(e) => {
                // Allow only digits and limit to 2 characters
                const digitsOnly = (e.target.value || '').replace(/\D/g, '').slice(0, 2);
                setFormData(prev => ({ ...prev, customerAge: digitsOnly }));
                // Live validate age and show error below the field
                const parsed = parseInt(digitsOnly, 10);
                setFormErrors(prev => ({
                  ...prev,
                  customerAge: !digitsOnly || digitsOnly.trim().length === 0
                    ? 'Customer age is required'
                    : Number.isNaN(parsed)
                      ? 'Please enter a valid age'
                      : parsed < 21
                        ? 'Age must be 21 or above'
                        : undefined
                }));
              }}
              error={formErrors.customerAge}
            />

            {formData.productType === 'Home Wifi' && (
              <>
                <FormInput
                  label="Email"
                  icon={Mail}
                  type="email"
                  required
                  value={formData.homeWifiEmail || ''}
                  disabled={isCoordinatorEditing}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, homeWifiEmail: e.target.value }))
                  }
                  error={formErrors.homeWifiEmail}
                />
                <FormInput
                  label="ID"
                  icon={Package}
                  type="text"
                  required
                  value={formData.homeWifiId || ''}
                  disabled={isCoordinatorEditing}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, homeWifiId: e.target.value }))
                  }
                  error={formErrors.homeWifiId}
                />
              </>
            )}

            <FormSelect
              label="Product Type"
              icon={Package}
              options={productTypes.map(type => ({ value: type, label: type }))}
              value={formData.productType}
              disabled={!!isEditing || isCoordinatorEditing}
              onChange={(e) => {
                if (isEditing) return; // Lock product type when editing existing lead
                const newType = e.target.value;
                setFormData(prev => ({ ...prev, productType: newType }));
                // Reset current selections when toggling type to avoid mismatches
                setCurrentNumber('');
                setCurrentPlan('');
                setCurrentNumberData(null);
                setSelectedCategory(newType === 'Home Wifi' ? 'Home Wifi' : 'Standard');
                // For MNP/P2P/Home Wifi, clear selected plans to re-add plan-only entries
                if (
                  newType === 'MNP' ||
                  newType === 'Prepaid to postpaid' ||
                  newType === 'Home Wifi'
                ) {
                  setSelectedPlans([]);
                }
              }}
            />

            <FormSelect
              label="Gender"
              icon={User2}
              options={[
                { value: 'Male', label: 'Male' },
                { value: 'Female', label: 'Female' },
                { value: 'Other', label: 'Other' }
              ]}
              value={formData.gender}
              disabled={isCoordinatorEditing}
              onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value }))}
            />
          </FormSection>

          {/* Agent Selection for Multi-Team Managers */}
          {user?.role === 'manager' && user.managedTeams && user.managedTeams.length > 0 && (
            <FormSection
              icon={Users}
              title="Agent Assignment"
              description="Select the agent this lead should be assigned to"
            >
              <FormSelect
                label="Assign to Agent"
                icon={Users}
                required
                options={[
                  { value: '', label: 'Select an agent...' },
                  ...managedAgents.map(agent => ({
                    value: agent.id,
                    label: `${agent.name} (${agent.email})`
                  }))
                ]}
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                error={formErrors.agentId}
              />
            </FormSection>
          )}

          <FormSection
            icon={Building2}
            title="Location Information"
            description="Customer location details"
          >
            <FormSelect
              label="Emirate"
              icon={MapPin}
              options={emirates.map(emirate => ({ value: emirate, label: emirate }))}
              value={formData.emirate}
              disabled={isCoordinatorEditing}
              onChange={(e) => {
                const newEmirate = e.target.value;
                setFormData(prev => ({
                  ...prev,
                  emirate: newEmirate
                }));
              }}
            />

            <FormInput
              label="Address"
              icon={MapPin}
              type="text"
              required
              value={formData.customerAddress}
              onChange={(e) => setFormData(prev => ({ ...prev, customerAddress: e.target.value }))}
              error={formErrors.customerAddress}
            />

            <div className="col-span-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:border-indigo-500 transition-colors duration-200">
                  <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                      className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    checked={formData.hasEmirateId}
                    disabled={isCoordinatorEditing}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      hasEmirateId: e.target.checked 
                    }))}
                  />
                    <div>
                      <span className="text-sm font-medium text-gray-900">Emirates ID Available</span>
                      <p className="text-xs text-gray-500">Customer has valid Emirates ID</p>
                    </div>
                </label>
                </div>

                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:border-indigo-500 transition-colors duration-200">
                  <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                      className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    checked={formData.advancePayment}
                    disabled={isCoordinatorEditing}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      advancePayment: e.target.checked 
                    }))}
                  />
                    <div>
                      <span className="text-sm font-medium text-gray-900">Advance Payment</span>
                      <p className="text-xs text-gray-500">Customer has made advance payment</p>
                    </div>
                </label>
                </div>
              </div>
            </div>

            <div className="col-span-2">
              <FormInput
                label="Location URL"
                icon={Globe}
                type="url"
                placeholder="https://maps.google.com/..."
                value={formData.locationUrl}
                disabled={isCoordinatorEditing}
                onChange={(e) => handleLocationUrlChange(e.target.value)}
                onBlur={(e) => handleLocationUrlBlur(e.target.value)}
                error={formErrors.locationUrl}
              />
            </div>
          </FormSection>

          <FormSection
            icon={Package}
            title="Number and Plan Selection"
            description="Pick a number, choose a plan, then add to lead"
          >
            <div className="col-span-2 space-y-5">

              {/* ── No-number product: category only ── */}
              {isNoNumberProduct && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                    <div className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-xs font-bold">!</span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-amber-900">No number required</p>
                      <p className="text-xs text-amber-700 mt-0.5">
                        <span className="font-semibold">{formData.productType}</span> doesn't need a number — choose a category and plan below.
                      </p>
                    </div>
                  </div>
                  <FormSelect
                    label="Category"
                    icon={Package}
                    options={
                      formData.productType === 'Home Wifi'
                        ? [{ value: 'Home Wifi', label: 'Home Wifi' }]
                        : [
                            { value: 'Standard', label: 'Standard' },
                            { value: 'Silver', label: 'Silver' },
                            { value: 'Silver Plus', label: 'Silver Plus' },
                            { value: 'Gold', label: 'Gold' },
                            { value: 'Gold Plus', label: 'Gold Plus' },
                            { value: 'Platinum', label: 'Platinum' },
                          ]
                    }
                    value={formData.productType === 'Home Wifi' ? 'Home Wifi' : selectedCategory}
                    disabled={isCoordinatorEditing}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  />
                </div>
              )}

              {/* ── Step 1: Number picker — hidden after plans added unless actively picking ── */}
              {!isNoNumberProduct && (currentNumber || showNumberPool || selectedPlans.length === 0) && (
                <div ref={numberSectionRef} className={`rounded-xl border bg-gray-50 overflow-hidden transition-colors ${formErrors.selectedNumber ? 'border-red-300' : 'border-gray-200'}`}>
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
                    <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold ${formErrors.selectedNumber ? 'bg-red-500' : 'bg-indigo-600'}`}>1</span>
                      Select Number
                    </span>
                    {currentNumber && !isEditing && (
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentNumber('');
                          setCurrentNumberData(null);
                          setSelectedCategory('Standard');
                          setCurrentPlan('');
                          setShowNumberPool(true);
                        }}
                        disabled={isCoordinatorEditing}
                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-40 transition-colors"
                      >
                        Change
                      </button>
                    )}
                  </div>

                  <div className="p-4">
                    {/* Selected number chip */}
                    {currentNumber && !showNumberPool ? (
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-indigo-100 flex-shrink-0">
                          <Phone className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-indigo-900 tracking-wide">{currentNumber}</p>
                          <p className="text-xs text-indigo-600">{selectedCategory}</p>
                        </div>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                          ✓ Selected
                        </span>
                        <button
                          type="button"
                          disabled={isCoordinatorEditing}
                          onClick={() => {
                            setCurrentNumber('');
                            setCurrentNumberData(null);
                            setCurrentPlan('');
                            setSelectedCategory('Standard');
                            setShowNumberPool(true);
                          }}
                          className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors flex-shrink-0"
                          title="Clear and pick again"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    ) : !showNumberPool ? (
                      <button
                        type="button"
                        onClick={() => setShowNumberPool(true)}
                        disabled={isCoordinatorEditing || maxNumbersReached}
                        className="w-full py-3 rounded-xl border-2 border-dashed border-indigo-300 text-sm font-medium text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50/60 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                      >
                        <Phone className="w-4 h-4" />
                        {selectedPlans.length > 0
                          ? (maxNumbersReached
                            ? 'Maximum 5 numbers reached'
                            : `Add ${selectedPlans.length + 1}${selectedPlans.length === 0 ? 'st' : selectedPlans.length === 1 ? 'nd' : selectedPlans.length === 2 ? 'rd' : 'th'} Number`)
                          : isEditing ? 'Add Another Number' : 'Search & Select a Number'}
                      </button>
                    ) : (
                      <div className={isCoordinatorEditing ? 'pointer-events-none opacity-50' : ''}>
                        <QuickNumberSelect
                          onSelect={handleNumberSelect}
                          selectedCategory={selectedCategory}
                          onCategoryChange={(category) => setSelectedCategory(category)}
                        />
                      </div>
                    )}

                    {formErrors.selectedNumber && (
                      <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                        {formErrors.selectedNumber}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* ── Step 2: Plan picker — only visible after a number is selected (or no-number product) ── */}
              {(currentNumber || isNoNumberProduct) ? (
                // number chosen → show the real plan picker
                <div className={`rounded-xl border bg-gray-50 overflow-hidden transition-colors ${formErrors.plans ? 'border-red-300' : 'border-gray-200'}`}>
                  <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-gray-200">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-bold ${formErrors.plans ? 'bg-red-500' : 'bg-purple-600'}`}>
                      {isNoNumberProduct ? '1' : '2'}
                    </span>
                    <span className="text-sm font-semibold text-gray-800">Select Plan</span>
                  </div>
                  <div className="p-4">
                    <div ref={planErrorRef} />
                    <FormSelect
                      label="Plan"
                      icon={Package}
                      id="planSelect"
                      options={[
                        { value: '', label: 'Select a plan' },
                        ...filteredPlanCategories.flatMap((category, categoryIndex) => [
                          { value: `category-${categoryIndex}`, label: category.label, disabled: true },
                          ...category.options.map((option) => ({
                            value: option.value,
                            label: option.label,
                          })),
                        ]),
                      ]}
                      value={currentPlan}
                      disabled={isCoordinatorEditing}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v.startsWith('category-') || !v) return;
                        setCurrentPlan(v);
                        setFormErrors(prev => { const { plans, ...rest } = prev; return rest; });
                      }}
                      error={formErrors.plans}
                    />
                  </div>
                </div>
              ) : !showNumberPool && selectedPlans.length === 0 ? (
                /* Step 2 placeholder — only on first load before anything is added */
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-3 flex items-center gap-2.5">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-gray-400 text-xs font-bold flex-shrink-0">2</span>
                  <p className="text-sm text-gray-400">Select Plan — choose a number above first</p>
                </div>
              ) : null}

              {/* ── Add button — only after number + plan both present ── */}
              {(currentNumber || isNoNumberProduct) && (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleAddPlan}
                    disabled={isCoordinatorEditing || isCheckingNumber}
                    className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    {isCheckingNumber ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Checking…
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        {isNoNumberProduct ? 'Add Plan' : 'Add Number with Plan'}
                      </>
                    )}
                  </button>

                </div>
              )}

              {/* Inline error: no number/plan added on submit */}
              {formErrors.plans && selectedPlans.length === 0 && !currentNumber && !isNoNumberProduct && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200">
                  <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm font-medium text-red-600">{formErrors.plans}</p>
                </div>
              )}

              {/* ── Selected plans list ── */}
              {selectedPlans.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-0.5">
                    Added ({selectedPlans.length})
                  </p>
                  {selectedPlans.map((plan, idx) => (
                    <div
                      key={plan.numberId}
                      className="flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-200 shadow-sm"
                    >
                      {/* Index bubble */}
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center">
                        <span className="text-xs font-bold text-indigo-700">{idx + 1}</span>
                      </div>

                      {/* Number + plan info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{plan.number || '—'}</p>
                        <p className="text-xs text-gray-400 truncate">{plan.category}</p>
                        {/* Plan selector */}
                        <select
                          className="mt-1.5 block w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={isCoordinatorEditing}
                          value={(() => {
                            const catNorm = normalizeCategory(plan.category);
                            const matching = allPlans.find(p => (!catNorm || normalizeCategory(p.category) === catNorm) && p.name === plan.plan);
                            if (matching?.id) return `${matching.id}|${matching.name}`;
                            return plan.plan || '';
                          })()}
                          onChange={(e) => handleChangePlanFor(plan.numberId, e.target.value)}
                        >
                          {allPlans.length === 0 && <option value="" disabled>Loading plans…</option>}
                          {allPlans.length > 0 && (
                            <>
                              <option value="" disabled>Select plan…</option>
                              {(() => {
                                const catNorm = normalizeCategory(plan.category);
                                const byCategory = catNorm ? allPlans.filter(p => normalizeCategory(p.category) === catNorm) : [];
                                const source = byCategory.length > 0 ? byCategory : allPlans;
                                return source.map((p, i) => (
                                  <option key={p.id || `${plan.category}-${p.name}-${i}`} value={p.id ? `${p.id}|${p.name}` : p.name}>
                                    {p.name}
                                  </option>
                                ));
                              })()}
                            </>
                          )}
                        </select>
                      </div>

                      {/* Remove */}
                      <button
                        type="button"
                        onClick={() => handleRemovePlan(plan.numberId)}
                        disabled={isCoordinatorEditing}
                        className="flex-shrink-0 p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                        title="Remove"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {/* Add another number link */}
                  {!isNoNumberProduct && !showNumberPool && !currentNumber && (
                    <button
                      type="button"
                      onClick={() => setShowNumberPool(true)}
                      disabled={isCoordinatorEditing || maxNumbersReached}
                      className="w-full py-2 rounded-xl border border-dashed border-gray-300 text-xs font-medium text-gray-500 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-40 transition-all"
                    >
                      {maxNumbersReached ? 'Maximum 5 numbers reached' : '+ Add another number'}
                    </button>
                  )}
                </div>
              )}

            </div>
          </FormSection>

          <FormSection
            icon={Users}
            title="Additional Information"
            description="Communication and scheduling preferences"
          >
            <FormSelect
              label="Language"
              icon={Languages}
              options={languages.map(lang => ({ value: lang, label: lang }))}
              value={formData.language}
              disabled={isCoordinatorEditing}
              onChange={(e) => setFormData(prev => ({ ...prev, language: e.target.value }))}
            />

            {/* Hide "Share With Team Member" field from verifier and coordinator roles */}
            {!isVerifier() && !isCoordinator() && (
            <FormSelect
              label="Share With Team Member"
              icon={Users}
              options={[
                { value: '', label: 'Select team member' },
                ...teamMembers.map(member => ({
                  value: member.id,
                  label: `${member.name} (${member.role})`
                }))
              ]}
              value={formData.sharedWith}
              onChange={(e) => setFormData(prev => ({ ...prev, sharedWith: e.target.value }))}
            />
            )}

            <FormInput
              label="Date"
              icon={Calendar}
              type="date"
              required
              value={formData.startDate}
              disabled={isCoordinatorEditing}
              onChange={(e) => {
                const selectedDate = e.target.value;
                setFormData(prev => ({ ...prev, startDate: selectedDate }));
                
                // Only validate time if NOT editing
                if (!isEditing && selectedDate) {
                  const date = new Date(selectedDate);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  date.setHours(0, 0, 0, 0);
                  
                  if (date.getTime() === today.getTime() && formData.startTime) {
                    // Handle both 24-hour format (HH:mm) and 12-hour format (h:mm AM/PM)
                    let time24 = formData.startTime;
                    if (time24.match(/\d{1,2}:\d{2}\s*(AM|PM)/i)) {
                      // It's in 12-hour format, convert it
                      time24 = convertTo24Hour(time24);
                    }
                    if (time24 && time24.includes(':')) {
                      const [hours, minutes] = time24.split(':').map(Number);
                      if (!isNaN(hours) && !isNaN(minutes)) {
                        const selectedDateTime = new Date();
                        selectedDateTime.setHours(hours, minutes, 0, 0);
                        const now = new Date();
                        
                        if (selectedDateTime < now) {
                          setFormErrors(prev => ({ ...prev, startTime: 'Time cannot be in the past' }));
                        } else {
                          setFormErrors(prev => ({ ...prev, startTime: '' }));
                        }
                      }
                    }
                  }
                }
              }}
              min={new Date().toISOString().split('T')[0]}
              error={formErrors.startDate}
            />

            <FormInput
              label="Time"
              icon={Calendar}
              type="time"
              step="60"
              required={!isEditing}
              value={formData.startTime}
              disabled={isCoordinatorEditing}
              onChange={(e) => {
                const time24 = e.target.value;
                setFormData(prev => ({ ...prev, startTime: time24 }));
                
                // Only validate "time cannot be in the past" when NOT editing
                if (!isEditing && formData.startDate && time24) {
                  const selectedDate = new Date(formData.startDate);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  selectedDate.setHours(0, 0, 0, 0);
                  
                  if (selectedDate.getTime() === today.getTime() && time24.includes(':')) {
                    const [hours, minutes] = time24.split(':').map(Number);
                    const selectedDateTime = new Date();
                    selectedDateTime.setHours(hours, minutes, 0, 0);
                    const now = new Date();
                    
                    if (selectedDateTime < now) {
                      setFormErrors(prev => ({ ...prev, startTime: 'Time cannot be in the past' }));
                    } else {
                      setFormErrors(prev => ({ ...prev, startTime: '' }));
                    }
                  } else {
                    setFormErrors(prev => ({ ...prev, startTime: '' }));
                  }
                } else {
                  // Clear errors when editing
                  setFormErrors(prev => ({ ...prev, startTime: '' }));
                }
              }}
              error={formErrors.startTime}
            />
          </FormSection>

          <FormSection
            icon={MessageSquare}
            title="Remarks"
            description="Additional notes and comments"
          >
            <div className="col-span-2">
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-gray-200">
                  <h3 className="text-sm font-medium text-gray-900">Remarks</h3>
                </div>
                <div className="p-4">
              <textarea
                rows={4}
                  className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="Add any additional notes or remarks..."
                value={formData.remarks}
                disabled={isCoordinatorEditing}
                onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
              />
                </div>
              </div>
            </div>
          </FormSection>
          </div>

          {/* Bottom Action Buttons - Restored as requested */}
          <div className="flex justify-end space-x-4 mt-8">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading 
                    ? 'Saving Changes...'
                    : (user?.role === 'agent' && initialData?.status === 'non_verified' 
                        ? 'Save Changes and Resubmit' 
                        : 'Save Changes')}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/leads')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Cancel
                </button>
                {savedDraft && (
                  <button
                    type="button"
                    onClick={handleClearDraft}
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-300 rounded-lg hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Clear Draft
                  </button>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Creating Lead...' : 'Create Lead'}
                </button>
                {whatsappVerificationEnabled && (
                  <button
                    type="button"
                    onClick={(e) => handleSubmit(e as any, true)}
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Creating Lead...' : 'Verify via WhatsApp'}
                  </button>
                )}
              </>
            )}
          </div>
        </form>
      </div>
      
      {/* Success Popup */}
      <SuccessPopup
        isOpen={showSuccessPopup}
        onClose={() => setShowSuccessPopup(false)}
        title="Success!"
        message={successMessage}
        autoCloseDelay={2000}
      />

      {/* Number Active Dialog */}
      {showNumberActiveDialog && activeNumberInfo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl transform transition-all">
            <div className="flex items-center justify-center mb-6">
              <div className="p-3 rounded-full bg-red-100">
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">
              Number Already Active
            </h3>
            <p className="text-gray-500 text-center mb-6">
              The number <span className="font-semibold text-gray-900">{activeNumberInfo.number}</span> is currently active and cannot be attached to a lead.
            </p>
            <div className="flex justify-center">
              <button
                onClick={() => {
                  setShowNumberActiveDialog(false);
                  setActiveNumberInfo(null);
                }}
                className="px-6 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Number not in pool / not available popup - rendered in portal so it stays visible */}
      {showNumberNotInPoolPopup && numberNotInPoolInfo && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]" aria-modal="true" role="dialog">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl transform transition-all">
            <div className="flex items-center justify-center mb-6">
              <div className="p-3 rounded-full bg-red-100">
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">
              Number not in pool
            </h3>
            <p className="text-gray-500 text-center mb-3">
              {numberNotInPoolInfo.message}
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <ul className="list-disc list-inside space-y-1">
                {numberNotInPoolInfo.numbers.map((num, idx) => (
                  <li key={idx} className="text-red-800 font-mono text-sm">
                    {num}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-sm text-gray-500 text-center mb-6">
              Please select a number that is open or reserved by you.
            </p>
            <div className="flex justify-center">
              <button
                onClick={() => {
                  setShowNumberNotInPoolPopup(false);
                  setNumberNotInPoolInfo(null);
                }}
                className="px-6 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export { CreateLead };
