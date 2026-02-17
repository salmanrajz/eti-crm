/**
 * ===============================================================================
 * LEAD DETAILS VIEW COMPONENT - COMPREHENSIVE LEAD MANAGEMENT
 * ===============================================================================
 * 
 * This component provides a detailed view and management interface for individual
 * leads in the CRM system. It enables comprehensive lead editing, status updates,
 * coordinator assignments, and verification workflows.
 * 
 * FEATURES:
 * 
 * 1. COMPREHENSIVE LEAD DISPLAY
 *    - Complete lead information display with organized sections
 *    - Customer details, contact information, and plan configuration
 *    - Real-time status updates and workflow progression tracking
 * 
 * 2. LEAD EDITING AND MANAGEMENT
 *    - Full lead editing capabilities with form validation
 *    - Number reassignment and plan modification options
 *    - Media upload and attachment management
 *    - Change tracking and audit capabilities
 * 
 * 3. COORDINATOR WORKFLOW INTEGRATION
 *    - Lead assignment to coordinators with group-specific filtering
 *    - Etisalat Lead ID and emirate selection for proper routing
 *    - Assignment message generation for copy-paste distribution
 *    - Integration with number pool and agent information
 * 
 * 4. VERIFICATION AND STATUS MANAGEMENT
 *    - Lead verification checklist and compliance tracking
 *    - Status updates with proper workflow progression
 *    - Rejection handling with reason tracking
 *    - Follow-up management and scheduling
 * 
 * 5. INTEGRATION FEATURES
 *    - WhatsApp integration for customer communication
 *    - Number logging and action tracking
 *    - User role-based access control and permissions
 *    - Real-time updates and data synchronization
 * 
 * USAGE:
 * This component is used throughout the system for detailed lead management,
 * coordinator workflows, and verification processes across all user roles.
 * ===============================================================================
 */

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { WhatsAppConversationView, WhatsAppMessage } from '../WhatsApp/WhatsAppConversationView';
import { normalizeTimestamp, getTimestampForSort } from '../../utils/timestampUtils';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { doc, updateDoc, addDoc, collection, getDoc, getDocs, query, where, serverTimestamp, onSnapshot, orderBy, deleteDoc, writeBatch, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { toast } from 'react-hot-toast';
import { logNumberAction, resolveUserName } from '../../utils/numberLogging';
import { logLeadAction } from '../../utils/leadLogging';
import { getPlans } from '../../utils/planService';
import { incrementVerifierCounters } from '../../utils/verifierCounters';
import { 
  UserIcon, Phone, MapPin, Calendar, Globe2, 
  Languages, Users, Clock, Package, Hash,
  FileText, CheckCircle, Building2, FileCheck,
  ChevronLeft, ChevronDown, AtSign, User2, CreditCard, Mail,
  MapPinned, FileSpreadsheet, Briefcase,
  Clock as ClockIcon, CheckCircle2, AlertCircle, AlertTriangle, ThumbsDown,
  MessageSquare, CheckCircle as CheckCircleIcon, XCircle, X,
  MessageCircle, Check, CheckCheck, Paperclip, RefreshCw, Trash2
} from 'lucide-react';
import { countryList } from '../../utils/countries';
import type { Lead, UserRole } from '../../types';
import { FormSection } from './FormSection';
import { FormInput } from './FormInput';
import { FormSelect } from './FormSelect';
import { NumberSelect } from './NumberSelect';
import { QuickNumberSelect } from './QuickNumberSelect';
import clsx from 'clsx';
import { MediaUpload } from './MediaUpload';
import { SplitLead } from './SplitLead';
import { Dialog } from '@headlessui/react';
// import { planBenefits } from '../../utils/planBenefits'; // Now using dynamic benefits from Firebase

// Use Lead type's verificationMedia definition from src/types

const emirates = [
  'Abu Dhabi',
  'Dubai',
  'Sharjah',
  'Ajman',
  'Umm Al Quwain',
  'Ras Al Khaimah',
  'Fujairah'
];

const areas = {
  'Abu Dhabi': ['Abu Dhabi City', 'Al Ain', 'Al Dhafra', 'Musaffah', 'Khalifa City'],
  'Dubai': ['Deira', 'Bur Dubai', 'Dubai Marina', 'JLT', 'Downtown Dubai'],
  'Sharjah': ['Al Majaz', 'Al Nahda', 'Al Qasimia', 'Al Taawun'],
  'Ajman': ['Ajman City', 'Al Jurf', 'Al Rashidiya'],
  'Umm Al Quwain': ['UAQ City', 'Al Salamah', 'Al Raas'],
  'Ras Al Khaimah': ['RAK City', 'Al Hamra', 'Al Nakheel'],
  'Fujairah': ['Fujairah City', 'Dibba', 'Al Faseel']
};

const languages = ['Arabic', 'English', 'Hindi', 'Urdu', 'Malayalam', 'Filipino', 'Bengali'];
const productTypes = ['New', 'Port In'];
const numberTypes = ['Gold', 'Gold Plus', 'Platinum', 'Silver', 'Silver Plus', 'Standard'];
const plans = ['Basic', 'Standard', 'Premium', 'VIP'];

const VERIFY_CHECKLIST = [
  {
    header: 'Number & Rental Explained',
    details: [
      'I have confirmed with the customer their selected mobile number.',
      'I have clearly explained the monthly rental amount, including 5% VAT.'
    ]
  },
  {
    header: 'Benefits & Contract Duration',
    details: [
      'I have informed the customer about the plan benefits (minutes, data, speed).',
      'I have explained the contract duration.'
    ]
  },
  {
    header: 'Early Cancellation Terms',
    details: [
      'I have informed the customer that early cancellation requires:',
      'Payment of all outstanding bills',
      'One extra month\'s rental + 5% VAT',
      'Number will be taken back by the telecom provider.'
    ]
  },
  {
    header: 'Number Ownership After Contract',
    details: [
      'I have explained that the number will become the customer\'s only after completing the contract.'
    ]
  },
  {
    header: 'Usage Restrictions During Contract',
    details: [
      'I have informed the customer that they cannot:',
      'Transfer ownership',
      'Port out to another telecom',
      'Upgrade/downgrade the plan',
      'Convert to prepaid',
      'Use multi-SIM with this plan'
    ]
  },
  {
    header: 'Pro-Rated Billing & 5-Day Cancellation Grace',
    details: [
      'I have explained that the plan is pro-rated based on usage days.',
      'I have informed them that cancellation is allowed within 5 days only in case of valid technical/network issues.'
    ]
  },
  {
    header: 'Acknowledgement of Terms',
    details: [
      'I have clearly stated that this communication serves as the valid terms of agreement.'
    ]
  }
];

// Plans that require the postpaid acquisition campaign checklist
const POSTPAID_CAMPAIGN_PLANS = [
  'New Freedom 250 Non-Stop Data - Flexi Minutes 12 months commitment',
  'New Freedom 250 Non-Stop Data - Local Minutes 12 months commitment',
  'New Freedom 275 Non-Stop Data - Local Minutes',
  'New Freedom 275 Non-Stop Data - Flexi Minutes',
  'New Freedom 325 Non-Stop data - Flexi minutes 12 months commitment',
  'New Freedom 325 Non-Stop data - Local minutes 12 months commitment',
  'New Freedom 375 Non-Stop data - Local minutes',
  'New Freedom 375 Non-Stop data - Flexi minutes'
];

// Helper function to check if lead has any of the postpaid campaign plans
const hasPostpaidCampaignPlan = (lead: Lead): boolean => {
  if (!lead.plans || lead.plans.length === 0) return false;
  return lead.plans.some(planItem => 
    POSTPAID_CAMPAIGN_PLANS.some(campaignPlan => 
      planItem.plan === campaignPlan || planItem.plan?.includes(campaignPlan)
    )
  );
};

// Additional checklist item for postpaid campaign plans
const POSTPAID_CAMPAIGN_CHECKLIST = {
  header: 'New Postpaid Acquisition Campaign',
  details: [
    'I have informed the customer about the New postpaid acquisition campaign - Up to 50% discount for 6 months.'
  ]
};

// Ready-made message templates for coordinators and admins
const READY_MADE_MESSAGES = [
  {
    id: 'full_name',
    label: 'Request Full Name',
    message: 'May I kindly have your full name to ensure the order is processed accurately?'
  },
  {
    id: 'delivery_address',
    label: 'Request Delivery Address',
    message: 'Could you please share the complete delivery address so we can arrange the shipment without any delays?'
  },
  {
    id: 'delivery_time',
    label: 'Request Preferred Delivery Time',
    message: 'When would you like us to schedule the delivery at your convenience?'
  },
  {
    id: 'thank_verification',
    label: 'Thank for Verification',
    message: 'Thank you for taking the time to complete the verification process.'
  }
];

type LeadMediaItem = Lead['verificationMedia'] extends Array<infer T> ? T : never;

export function LeadDetailsView({ lead, onEdit, onResubmit, isResubmitting }: { lead: Lead; onEdit: () => void; onResubmit?: () => void; isResubmitting?: boolean }) {
  const { user, isAdmin, isVerifier, isCoordinator, isManager } = useAuthStore();
  const navigate = useNavigate();
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const pageEndRef = useRef<HTMLDivElement>(null);
  const hasScrolledOnMountRef = useRef(false);
  const whatsappMessagesRef = useRef<HTMLDivElement>(null);
  const [verifyAction, setVerifyAction] = useState<'verify' | 'reject' | 'non_verified' | 'verify_at_location' | null>(null);
  const [verificationNote, setVerificationNote] = useState('Verified');
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [showNonVerifyDialog, setShowNonVerifyDialog] = useState(false);
  const [nonVerifyNote, setNonVerifyNote] = useState('Non Verified');
  const [showVerifyAtLocationDialog, setShowVerifyAtLocationDialog] = useState(false);
  const [verifyAtLocationNote, setVerifyAtLocationNote] = useState('Please Verify at location');
  const [uploadInProgress, setUploadInProgress] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showCoordinatorDialog, setShowCoordinatorDialog] = useState(false);
  const [coordinatorAction, setCoordinatorAction] = useState<'assign' | 'activate' | 'activate_non_verified' | 'followup' | 'later' | 'reject' | 'reassign' | 'reverification' | null>(null);
  const [coordinatorNote, setCoordinatorNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [scheduledForDate, setScheduledForDate] = useState<string>('');
  const [showManagerAssignDialog, setShowManagerAssignDialog] = useState(false);
  const [managerNote, setManagerNote] = useState('');
  const [managerLocationUrl, setManagerLocationUrl] = useState('');
  const [isManagerActionProcessing, setIsManagerActionProcessing] = useState(false);
  const [showNumberErrorModal, setShowNumberErrorModal] = useState(false);
  const [missingNumbers, setMissingNumbers] = useState<string[]>([]);
  const [editError, setEditError] = useState<{ reason: string; number: string } | null>(null);
  const [isValidatingEdit, setIsValidatingEdit] = useState(false);
  const [etisalatLeadId, setEtisalatLeadId] = useState('');
  const [etisalatLeadIds, setEtisalatLeadIds] = useState<string[]>([]); // Array for multiple numbers
  const [selectedEmirate, setSelectedEmirate] = useState('');
  const [showAssignmentMessage, setShowAssignmentMessage] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [showSplitLead, setShowSplitLead] = useState(false);
  // Activation form fields for coordinator 'activate' action
  // Support multiple numbers - use arrays for each field
  const [activationDates, setActivationDates] = useState<string[]>([]);
  const [srNumbers, setSrNumbers] = useState<string[]>([]);
  const [serviceOrderNumbers, setServiceOrderNumbers] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [srImageFiles, setSrImageFiles] = useState<(File | null)[]>([]);
  const [editablePasscodes, setEditablePasscodes] = useState<string[]>([]);
  const [editableCategories, setEditableCategories] = useState<string[]>([]);
  // Legacy single values for backward compatibility (will be removed)
  const [activationDate, setActivationDate] = useState<string>('');
  const [srNumber, setSrNumber] = useState<string>('');
  const [serviceOrderNumber, setServiceOrderNumber] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [srImageFile, setSrImageFile] = useState<File | null>(null);
  const [editablePasscode, setEditablePasscode] = useState<string>('');
  const [editableCategory, setEditableCategory] = useState<string>('');
  const [assignPasscode, setAssignPasscode] = useState<string>('');
  const [allPlansWithPasscodes, setAllPlansWithPasscodes] = useState<Array<{
    number: string;
    category: string;
    group: string;
    passcode: string;
    plan: string;
  }>>([]);

  // New states for editable number and plan
  const [editableNumber, setEditableNumber] = useState<string>('');
  const [editableNumberId, setEditableNumberId] = useState<string>('');
  const [editablePlan, setEditablePlan] = useState<string>('');
  const [originalNumber, setOriginalNumber] = useState<string>('');
  const [originalPlan, setOriginalPlan] = useState<string>('');
  const [showNumberSelector, setShowNumberSelector] = useState(false);
  const [allPlans, setAllPlans] = useState<{id: string; name: string; category: string}[]>([]);
  
  // States for managing multiple numbers (arrays for each plan index)
  const [editableNumbers, setEditableNumbers] = useState<string[]>([]);
  const [editableNumberIds, setEditableNumberIds] = useState<string[]>([]);
  const [editablePlans, setEditablePlans] = useState<string[]>([]);
  const [originalNumbers, setOriginalNumbers] = useState<string[]>([]);
  const [originalPlans, setOriginalPlans] = useState<string[]>([]);
  const [showNumberSelectors, setShowNumberSelectors] = useState<boolean[]>([]);
  const [removedPlanIndices, setRemovedPlanIndices] = useState<Set<number>>(new Set());
  
  // States for adding new numbers
  const [newNumbers, setNewNumbers] = useState<Array<{
    numberId: string;
    number: string;
    plan: string;
    category: string;
    group?: string;
    passcode?: string;
    activationDate: string;
    srNumber: string;
    serviceOrderNumber: string;
    selectedGroup: string;
    srImageFile: File | null;
  }>>([]);
  const [showAddNumberForm, setShowAddNumberForm] = useState(false);
  const [newNumberData, setNewNumberData] = useState<{
    id: string;
    number: string;
    category: string;
    passcode: string;
  } | null>(null);
  const [newNumberPlan, setNewNumberPlan] = useState<string>('');
  const [newNumberCategory, setNewNumberCategory] = useState<string>('Standard');

  // Prefill coordinator note based on action type
  useEffect(() => {
    if (!showCoordinatorDialog || !coordinatorAction) {
      return;
    }

    const actionMessages: Record<string, string> = {
      'assign': 'Lead assigned successfully',
      'activate': 'Lead activated successfully',
      'activate_non_verified': 'Lead activated (pending verification)',
      'followup': 'Lead marked for follow-up',
      'later': 'Lead marked for later',
      'reject': 'Lead rejected successfully',
      'reassign': 'Lead reassigned successfully',
      'reverification': 'Lead sent for reverification'
    };

    const message = actionMessages[coordinatorAction] || '';
    if (message) {
      setCoordinatorNote(message);
    }
  }, [showCoordinatorDialog, coordinatorAction]);

  // Prefill passcode, category, group, number, and plan when opening Activate dialog
  useEffect(() => {
    const prefill = async () => {
      if (!showCoordinatorDialog || (coordinatorAction !== 'activate' && coordinatorAction !== 'activate_non_verified')) return;
      try {
        const plans = lead.plans || [];
        
        // Initialize arrays for all plans
        const passcodes: string[] = [];
        const categories: string[] = [];
        const groups: string[] = [];
        const activationDatesArray: string[] = [];
        const srNumbersArray: string[] = [];
        const serviceOrderNumbersArray: string[] = [];
        const selectedGroupsArray: string[] = [];
        const srImageFilesArray: (File | null)[] = [];
        const numbersArray: string[] = [];
        const numberIdsArray: string[] = [];
        const plansArray: string[] = [];
        const originalNumbersArray: string[] = [];
        const originalPlansArray: string[] = [];
        const showSelectorsArray: boolean[] = [];
        
        // Get today's date in YYYY-MM-DD format for date input
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        // Fetch passcodes and set defaults for each plan
        for (const plan of plans) {
          categories.push(plan.category || '');
          groups.push(plan.group || '');
          activationDatesArray.push(todayStr); // Pre-fill with today's date
          srNumbersArray.push('');
          serviceOrderNumbersArray.push('');
          selectedGroupsArray.push(plan.group || '');
          srImageFilesArray.push(null);
          numbersArray.push(plan.number || '');
          numberIdsArray.push(plan.numberId || '');
          plansArray.push(plan.plan || '');
          originalNumbersArray.push(plan.number || '');
          originalPlansArray.push(plan.plan || '');
          showSelectorsArray.push(false);
          
          if (plan.numberId && !plan.numberId.startsWith('virtual-')) {
            try {
              const numberRef = doc(db, 'numberPool', plan.numberId);
              const numberDoc = await getDoc(numberRef);
              if (numberDoc.exists()) {
                const numberData = numberDoc.data();
                passcodes.push(numberData?.passcode || '');
              } else {
                passcodes.push('');
              }
            } catch {
              passcodes.push('');
            }
          } else {
            passcodes.push('');
          }
        }
        
        setEditablePasscodes(passcodes);
        setEditableCategories(categories);
        setSelectedGroups(selectedGroupsArray);
        setActivationDates(activationDatesArray);
        setSrNumbers(srNumbersArray);
        setServiceOrderNumbers(serviceOrderNumbersArray);
        setSrImageFiles(srImageFilesArray);
        setEditableNumbers(numbersArray);
        setEditableNumberIds(numberIdsArray);
        setEditablePlans(plansArray);
        setOriginalNumbers(originalNumbersArray);
        setOriginalPlans(originalPlansArray);
        setShowNumberSelectors(showSelectorsArray);
        setRemovedPlanIndices(new Set());
        
        // Also set first plan values for backward compatibility
        const firstPlan = plans[0];
        if (firstPlan) {
          setEditableCategory(firstPlan.category || '');
          setSelectedGroup(firstPlan.group || '');
          setEditableNumber(firstPlan.number || '');
          setEditableNumberId(firstPlan.numberId || '');
          setEditablePlan(firstPlan.plan || '');
          setOriginalNumber(firstPlan.number || '');
          setOriginalPlan(firstPlan.plan || '');
          setEditablePasscode(passcodes[0] || '');
          setActivationDate(todayStr); // Pre-fill with today's date for backward compatibility
        }
        
        // Load all plans for the dropdown
        const allPlansData = await getPlans();
        setAllPlans(allPlansData);
      } catch (_) {
        // Reset on error
        setEditablePasscodes([]);
        setEditableCategories([]);
        setSelectedGroups([]);
        setActivationDates([]);
        setSrNumbers([]);
        setServiceOrderNumbers([]);
        setSrImageFiles([]);
        setEditableNumbers([]);
        setEditableNumberIds([]);
        setEditablePlans([]);
        setOriginalNumbers([]);
        setOriginalPlans([]);
        setShowNumberSelectors([]);
        setRemovedPlanIndices(new Set());
      }
    };
    prefill();
  }, [showCoordinatorDialog, coordinatorAction, lead]);

  // Prefill number, category, group and passcode for Assign/Reassign dialog (read-only display)
  useEffect(() => {
    const prefillAssign = async () => {
      if (!showCoordinatorDialog || (coordinatorAction !== 'assign' && coordinatorAction !== 'reassign')) {
        setAssignPasscode('');
        setAllPlansWithPasscodes([]);
        return;
      }

      try {
        // Fetch passcodes for all plans
        const plansWithPasscodes = await Promise.all(
          (lead.plans || []).map(async (plan) => {
            let passcode = '';
            if (plan.numberId && !plan.numberId.startsWith('virtual-')) {
              try {
                const numberRef = doc(db, 'numberPool', plan.numberId);
                const numberDoc = await getDoc(numberRef);
                if (numberDoc.exists()) {
                  const numberData = numberDoc.data() as any;
                  passcode = numberData.passcode || '';
                }
              } catch (error) {
                console.error('Error fetching passcode for plan:', error);
              }
            }
            return {
              number: plan.number || '',
              category: plan.category || '',
              group: plan.group || '',
              passcode: passcode,
              plan: plan.plan || ''
            };
          })
        );
        
        setAllPlansWithPasscodes(plansWithPasscodes);
        
        // Set assignPasscode for backward compatibility (first plan's passcode)
        if (plansWithPasscodes.length > 0) {
          setAssignPasscode(plansWithPasscodes[0].passcode);
        } else {
          setAssignPasscode('');
        }
      } catch (error) {
        console.error('Error pre-filling assign passcodes:', error);
        setAssignPasscode('');
        setAllPlansWithPasscodes([]);
      }
    };

    prefillAssign();
  }, [showCoordinatorDialog, coordinatorAction, lead.plans, lead.id]);

  // Prefill Google Maps URL when opening manager/agent assign dialog
  useEffect(() => {
    if (showManagerAssignDialog) {
      setManagerLocationUrl(((lead as any).url as string) || '');
    }
  }, [showManagerAssignDialog, lead]);

  // Initialize Etisalat Lead IDs array when dialog opens for assign/reassign
  useEffect(() => {
    if (showCoordinatorDialog && (coordinatorAction === 'assign' || coordinatorAction === 'reassign')) {
      const plansCount = lead.plans?.length || 0;
      if (plansCount > 0) {
        // Check if lead has etisalatLeadIds array (multiple IDs)
        const hasMultipleIds = (lead as any).etisalatLeadIds && Array.isArray((lead as any).etisalatLeadIds);
        
        if (hasMultipleIds && (lead as any).etisalatLeadIds.length === plansCount) {
          // Use existing array of Etisalat IDs
          setEtisalatLeadIds((lead as any).etisalatLeadIds);
          setEtisalatLeadId((lead as any).etisalatLeadIds[0] || '');
        } else {
          // Initialize array with existing Etisalat IDs from plans or lead
          const initialIds = lead.plans?.map((plan: any, index: number) => {
            // Check if plan has its own etisalatLeadId, otherwise use lead's etisalatLeadId for first, empty for others
            return plan.etisalatLeadId || (index === 0 ? (lead.etisalatLeadId || '') : '');
          }) || [];
          setEtisalatLeadIds(initialIds);
          // Also set single etisalatLeadId for backward compatibility (first one)
          setEtisalatLeadId(initialIds[0] || lead.etisalatLeadId || '');
        }
      } else {
        setEtisalatLeadIds([]);
        setEtisalatLeadId(lead.etisalatLeadId || '');
      }
    } else {
      setEtisalatLeadIds([]);
    }
  }, [showCoordinatorDialog, coordinatorAction, lead.plans, lead.etisalatLeadId]);
  const [verificationMedia, setVerificationMedia] = useState<LeadMediaItem[]>([]);
  const [sharedWithNames, setSharedWithNames] = useState<string[]>([]);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [localStatus, setLocalStatus] = useState(lead.status);
  const [isVerifyActionProcessing, setIsVerifyActionProcessing] = useState(false);
  const [isCoordinatorActionProcessing, setIsCoordinatorActionProcessing] = useState(false);
  const [showWhatsAppChat, setShowWhatsAppChat] = useState(false);
  const [whatsAppLogs, setWhatsAppLogs] = useState<any[]>([]);
  const whatsappLogsUnsubRef = useRef<null | (() => void)>(null);
  const [sendingVerification, setSendingVerification] = useState(false);
  // Flow state tracking
  const [flowState, setFlowState] = useState<'welcome' | 'terms' | 'delivery' | 'name' | 'address' | 'nationality' | 'complete'>('welcome');
  const [deliveryData, setDeliveryData] = useState({ name: '', address: '', nationality: '' });

  // Track flow progress based on customer responses
  useEffect(() => {
    if (whatsAppLogs.length === 0) {
      setFlowState('welcome');
      return;
    }

    // Check for welcome message (outbound with template)
    const hasWelcomeMessage = whatsAppLogs.some(log => 
      log.direction === 'outbound' && 
      (log.templateName || log.messageText?.includes('Welcome to Express Dial'))
    );

    if (!hasWelcomeMessage) {
      setFlowState('welcome');
      return;
    }

    // Check customer responses in chronological order
    const sortedLogs = [...whatsAppLogs].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    let currentState: typeof flowState = 'welcome';
    const responses: { name?: string; address?: string; nationality?: string } = {};

    for (const log of sortedLogs) {
      if (log.direction !== 'inbound') continue;

      const text = (log.messageText || '').toLowerCase().trim();
      // Get messageType from formatted message or from payload (API returns 'type' field)
      const messageType = log.messageType || log.payload?.type || log.type || 'text';

      // Check for "Continue" button click (after welcome) - button type or exact text match
      if ((messageType === 'button' && text === 'continue') || (text === 'continue' && currentState === 'welcome')) {
        currentState = 'terms';
      }
      // Check for "Agree & Continue" or "Continue & Agree" button click
      else if (messageType === 'button' && (text.includes('agree') && text.includes('continue'))) {
        currentState = 'delivery';
      }
      else if ((text.includes('agree') && text.includes('continue')) || text === 'continue & agree') {
        currentState = 'delivery';
      }
      // Check for "Talk to Live Agent" - skip this button option
      else if (text.includes('talk to live agent') || (messageType === 'button' && text.includes('talk'))) {
        continue;
      }
      // Check if it's a delivery detail response (name, address, nationality)
      // These come after "Agree & Continue" button click
      else if (currentState === 'delivery' || currentState === 'address' || currentState === 'nationality') {
        // Skip button clicks, very short responses, and common button texts
        const isButtonClick = messageType === 'button' || 
                             text === 'continue' || 
                             text.includes('agree') || 
                             text === 'no' || 
                             text === 'yes' || 
                             text.includes('talk to live agent') || 
                             text.length <= 1 ||
                             text === 'tab'; // Skip "Tab" as it's likely a keyboard input, not actual response
        
        if (!isButtonClick) {
          // First non-button response after delivery state = name
          if (!responses.name) {
            responses.name = log.messageText || text;
            currentState = 'address';
          } 
          // Second non-button response = address
          else if (!responses.address) {
            responses.address = log.messageText || text;
            currentState = 'nationality';
          } 
          // Third non-button response = nationality
          else if (!responses.nationality) {
            responses.nationality = log.messageText || text;
            currentState = 'complete';
          }
        }
      }
    }

    setDeliveryData(prev => ({
      name: responses.name || prev.name,
      address: responses.address || prev.address,
      nationality: responses.nationality || prev.nationality
    }));
    setFlowState(currentState);
  }, [whatsAppLogs]);
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [resendingLogId, setResendingLogId] = useState<string | null>(null);

  // Auto-scroll to bottom when new messages are added (only when chat is open)
  useEffect(() => {
    if (showWhatsAppChat && whatsappMessagesRef.current && whatsAppLogs.length > 0) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        if (whatsappMessagesRef.current) {
          whatsappMessagesRef.current.scrollTop = whatsappMessagesRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [whatsAppLogs, showWhatsAppChat]);

  const stopWhatsAppLogsListener = () => {
    if (whatsappLogsUnsubRef.current) {
      whatsappLogsUnsubRef.current();
      whatsappLogsUnsubRef.current = null;
    }
  };

  const fetchWhatsAppMessagesFromAPI = async () => {
    if (!lead?.customerNumber) {
      console.warn('No customer number found for lead');
      return;
    }

    try {
      // Format customer number for API - Simple logic: remove first 0, add 971
      // This matches VerifierDashboard to ensure consistent phone number formatting
      let formattedNumber = lead.customerNumber.toString().replace(/\D/g, '');
      
      // Remove leading zero if present
      if (formattedNumber.startsWith('0')) {
        formattedNumber = formattedNumber.substring(1);
      }
      
      // Add 971 prefix
      if (!formattedNumber.startsWith('971')) {
        formattedNumber = `971${formattedNumber}`;
      }

      const { checkConversation } = await import('../../utils/whatsappRouter');
      const conversationData = await checkConversation(formattedNumber, lead.id);
      
      if (conversationData?.success === false) {
        console.warn('Failed to fetch WhatsApp messages:', conversationData.error);
        return;
      }

      if (conversationData?.messages && Array.isArray(conversationData.messages)) {
        // Format messages for display
        const formattedMessages = conversationData.messages.map((msg: any) => ({
          id: msg.messageId || msg.id,
          direction: msg.direction,
          from: msg.from,
          to: msg.to,
          messageText: msg.messageText || '',
          messageId: msg.messageId,
          status: msg.status,
          templateName: msg.templateName,
          consents: msg.consents,
          readStatus: msg.readStatus,
          deliveryStatus: msg.deliveryStatus,
          messageType: msg.messageType,
          replyTo: msg.replyTo,
          repliedMessage: msg.repliedMessage,
          mediaId: msg.mediaId,
          mediaPath: msg.mediaPath,
          mime: msg.mime,
          userId: msg.userId,
          userName: msg.userName,
          senderName: msg.senderName,
          buttons: msg.buttons,
          payload: msg.payload,
          // Normalize timestamp once when first received from API
          // Store as Date object to preserve timezone information
          createdAt: msg.createdAt 
            ? (msg.createdAt instanceof Date 
                ? msg.createdAt 
                : normalizeTimestamp(msg.createdAt) || new Date(msg.createdAt))
            : new Date()
        }));

        // Sort by timestamp (oldest first), with secondary sort by messageId for messages with same timestamp
        formattedMessages.sort((a: any, b: any) => {
          const timeA = getTimestampForSort(normalizeTimestamp(a.createdAt));
          const timeB = getTimestampForSort(normalizeTimestamp(b.createdAt));
          if (timeA !== timeB) {
            return timeA - timeB;
          }
          // If timestamps are equal, sort by messageId to maintain consistent order
          const idA = a.messageId || a.id || '';
          const idB = b.messageId || b.id || '';
          return idA.localeCompare(idB);
        });

        
        // Only update if messages actually changed to prevent unnecessary re-renders
        // IMPORTANT: Preserve existing message timestamps to prevent timestamp changes on re-fetch
        setWhatsAppLogs(prev => {
          // Create a map of existing messages by messageId to preserve their timestamps
          const existingMessageMap = new Map();
          prev.forEach((msg: any) => {
            const msgId = msg.messageId || msg.id;
            if (msgId) {
              existingMessageMap.set(msgId, msg);
            }
          });
          
          // Merge API messages with existing messages, preserving timestamps from existing messages
          const mergedMessages = formattedMessages.map((apiMsg: any) => {
            const msgId = apiMsg.messageId || apiMsg.id;
            const existingMsg = existingMessageMap.get(msgId);
            
            // If this message already exists, ALWAYS preserve its timestamp to prevent changes
            // This is critical to prevent timestamp flickering when API polls
            if (existingMsg && existingMsg.createdAt) {
              // Use the existing timestamp as-is (it's already a Date object from first load)
              // Don't re-normalize as it might change the timezone interpretation
              // IMPORTANT: Preserve the optimistic message's timestamp (which is correct local time)
              return {
                ...apiMsg,
                createdAt: existingMsg.createdAt, // Preserve the original timestamp exactly
                // Also preserve the messageId from existing if it's a temp message that hasn't been confirmed yet
                messageId: existingMsg.messageId || apiMsg.messageId
              };
            }
            
            // New message, normalize API timestamp once and store as Date object
            const apiDate = normalizeTimestamp(apiMsg.createdAt);
            if (!apiDate) {
              console.warn('Failed to normalize timestamp for message:', apiMsg.messageId, apiMsg.createdAt);
            }
            
            return {
              ...apiMsg,
              createdAt: apiDate || new Date(apiMsg.createdAt)
            };
          });
          
          const prevMessageIds = prev.map((m: any) => m.id || m.messageId).join(',');
          const newMessageIds = mergedMessages.map((m: any) => m.id || m.messageId).join(',');
          
          // Only update if messages actually changed
          if (prevMessageIds === newMessageIds && prev.length === mergedMessages.length) {
            return prev; // No change, return previous state
          }
          
          return mergedMessages;
        });
      }
    } catch (error: any) {
      console.error('Error fetching WhatsApp messages from API:', error);
    }
  };

  // Auto-poll WhatsApp messages from API (only when chat is open)
  useEffect(() => {
    if (!lead?.id || !lead?.customerNumber || !showWhatsAppChat) {
      return;
    }

    // Fetch immediately
    fetchWhatsAppMessagesFromAPI();

    // Set up polling interval - every 3 seconds for instant updates
    const pollInterval = setInterval(() => {
      fetchWhatsAppMessagesFromAPI();
    }, 3000);

    // Store cleanup function
    whatsappLogsUnsubRef.current = () => {
      clearInterval(pollInterval);
    };

    return () => {
      if (whatsappLogsUnsubRef.current) {
        whatsappLogsUnsubRef.current();
        whatsappLogsUnsubRef.current = null;
      }
    };
  }, [lead?.id, lead?.customerNumber, showWhatsAppChat]);
  
  // Determine if we need to show the postpaid campaign checklist
  const showPostpaidCampaignChecklist = hasPostpaidCampaignPlan(lead);
  
  // Initialize verifyChecklist with base items + conditional campaign item
  const [verifyChecklist, setVerifyChecklist] = useState<boolean[]>(() => {
    const baseChecklist = VERIFY_CHECKLIST.map(() => false);
    if (showPostpaidCampaignChecklist) {
      return [...baseChecklist, false]; // Add one more for campaign checklist
    }
    return baseChecklist;
  });
  
  const [expandedSections, setExpandedSections] = useState<boolean[]>(() => {
    const baseExpanded = VERIFY_CHECKLIST.map(() => false);
    if (showPostpaidCampaignChecklist) {
      return [...baseExpanded, false]; // Add one more for campaign checklist
    }
    return baseExpanded;
  });
  const handleSelectAllChecklist = () => {
    const baseChecklist = VERIFY_CHECKLIST.map(() => true);
    if (showPostpaidCampaignChecklist) {
      setVerifyChecklist([...baseChecklist, true]);
    } else {
      setVerifyChecklist(baseChecklist);
    }
  };
  const [plans, setPlans] = useState<any[]>([]);
  const [planDetails, setPlanDetails] = useState<{ amount: string; benefits: string; duration: string } | null>(null);
  const [planPasscodes, setPlanPasscodes] = useState<Record<string, string>>({});

  const isUserCoordinator = isCoordinator() || isAdmin();

  const getCountryName = (code?: string | null) => {
    if (!code) return '';
    const upper = code.toUpperCase();
    const match = countryList.find(c => c.code === upper || c.name.toUpperCase() === upper);
    return match ? match.name : code;
  };

  // Load plan details from Firebase when lead changes
  useEffect(() => {
    async function loadPlanDetails() {
      if (!lead?.plans?.[0]?.plan) {
        setPlanDetails(null);
        return;
      }
      try {
        const planName = lead.plans[0].plan;
        const plansQuery = query(collection(db, 'plans'), where('name', '==', planName));
        const plansSnapshot = await getDocs(plansQuery);
        if (!plansSnapshot.empty) {
          const planDoc = plansSnapshot.docs[0];
          const planData = planDoc.data();
          setPlanDetails({
            amount: planData.amount || 'N/A',
            benefits: planData.benefits || 'N/A',
            duration: planData.duration || 'N/A'
          });
        } else {
          setPlanDetails(null);
        }
      } catch (error) {
        console.error('Error loading plan details:', error);
        setPlanDetails(null);
      }
    }
    loadPlanDetails();
  }, [lead]);

  // Load number passcodes for coordinator view
  useEffect(() => {
    const loadPasscodes = async () => {
      if (!isUserCoordinator) {
        setPlanPasscodes({});
        return;
      }

      try {
        const result: Record<string, string> = {};
        const realPlans = (lead.plans || []).filter(
          (p: any) => p?.numberId && typeof p.numberId === 'string' && !p.numberId.startsWith('virtual-')
        );

        for (const p of realPlans) {
          try {
            const numberRef = doc(db, 'numberPool', p.numberId);
            const numberDoc = await getDoc(numberRef);
            if (numberDoc.exists()) {
              const numberData = numberDoc.data();
              result[p.numberId] = numberData.passcode || 'N/A';
            }
          } catch (err) {
            console.error('Error loading passcode for number', p.numberId, err);
          }
        }

        setPlanPasscodes(result);
      } catch (error) {
        console.error('Error loading plan passcodes:', error);
      }
    };

    loadPasscodes();
  }, [lead.plans, isUserCoordinator, lead.id]);

  const canEdit = (
    // Verifiers can edit pending verification, activated_non_verified, and reverification leads
    (isVerifier() && (
      lead.status === 'pending_verification' ||
      lead.status === 'activated_non_verified' ||
      lead.status === 'reverification'
    )) ||
    // Agents can edit & resubmit both 'non_verified' and legacy 'follow_verification' leads
    (user?.role === 'agent' &&
      user.id === lead.agentId &&
      (lead.status === 'non_verified' || lead.status === 'follow_verification')) ||
    // Multi-team managers can edit non_verified leads from their managed teams
    (isManager() &&
      user?.managedTeams &&
      user.managedTeams.includes(lead.teamId || '') &&
      (lead.status === 'non_verified' || lead.status === 'follow_verification')) ||
    isAdmin() ||
    isCoordinator()
  );
  const canVerify = (isVerifier() || isAdmin()) && (lead.status === 'pending_verification' || lead.status === 'non_verified' || lead.status === 'activated_non_verified' || lead.status === 'reverification');
  const isUserManager = isManager();
  const isActivationDialog = coordinatorAction === 'activate' || coordinatorAction === 'activate_non_verified';
  // Manager can assign any of their verified, follow_up, or later leads to coordinator
  // (even if previously managerAssigned) – UI should always show the option
  // Multi-team managers can assign leads from any of their managed teams
  const canManagerAssign = (isUserManager &&
    ((user?.id === lead.managerId) ||
     (user?.managedTeams && user.managedTeams.includes(lead.teamId || ''))) &&
    (lead.status === 'verified' || lead.status === 'follow_up' || lead.status === 'later')) ||
    (isAdmin() && (lead.status === 'verified' || lead.status === 'follow_up' || lead.status === 'later'));
  // Agent can also request assignment to coordinator for their own verified/follow_up/later leads
  const canAgentAssignToCoordinator =
    user?.role === 'agent' &&
    user.id === lead.agentId &&
    ((lead.status === 'verified' && !lead.managerAssigned) ||
     (lead.status === 'follow_up' && !lead.managerAssigned) ||
     (lead.status === 'later' && !lead.managerAssigned));

  // Helper function to get service provider based on group
  const getServiceProvider = (group: string) => {
    switch (group?.toUpperCase()) {
      case 'G1':
        return 'Connect';
      case 'G2':
        return 'Express Dial';
      case 'G3':
        return 'Telecon';
      default:
        return group || 'Unknown Group';
    }
  };

  // Helper function to generate formatted assignment message
  const generateAssignmentMessage = async (lead: Lead, etisalatId: string | string[], emirate: string) => {
    // Get passcodes for all numbers from number pool
    const plansWithPasscodes = await Promise.all(
      (lead.plans || []).map(async (plan) => {
        let passcode = 'N/A';
        if (plan.numberId && !plan.numberId.startsWith('virtual-')) {
          try {
            const numberRef = doc(db, 'numberPool', plan.numberId);
            const numberDoc = await getDoc(numberRef);
            if (numberDoc.exists()) {
              const numberData = numberDoc.data();
              passcode = numberData.passcode || 'N/A';
            }
          } catch (error) {
            console.error('Error fetching number passcode:', error);
          }
        }
        return {
          ...plan,
          passcode
        };
      })
    );

    // Get the actual agent name
    let agentName = 'N/A';
    try {
      const agentRef = doc(db, 'users', lead.agentId);
      const agentDoc = await getDoc(agentRef);
      if (agentDoc.exists()) {
        const agentData = agentDoc.data();
        agentName = agentData.name || agentData.fullName || agentData.displayName || 'N/A';
      }
    } catch (error) {
      console.error('Error fetching agent name:', error);
    }

    // Format date as DD/MM/YYYY for coordinator view
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const currentDate = `${day}/${month}/${year}`;
    
    // Get lead number (use leadNumber field from document, fallback to id if not available)
    const leadNumber = lead.leadNumber ? lead.leadNumber : lead.id;
    
    // Build the message with all numbers
    // For multiple numbers, show each number's details separately
    if (plansWithPasscodes.length === 1) {
      // Single number format (backward compatible)
      const plan = plansWithPasscodes[0];
      const partner = getServiceProvider(plan.group || '');
      return `Lead No.: ${leadNumber}
Partner: ${partner}
Date: ${currentDate}
Etisalat Portal ID: ${etisalatId}
Customer Details
Customer Name: ${lead.customerName}
Customer Number: ${lead.customerNumber}
Selected Number: ${plan.number || 'N/A'}
Passcode: ${plan.passcode}
Plan Selected: ${plan.plan || 'N/A'}
Additional Details
Gender: ${lead.gender || 'N/A'}
Paid or Free: ${lead.advancePayment ? 'Paid' : 'Free'}
Emirates: ${emirate}
Address: ${lead.customerAddress || 'N/A'}
Nationality: ${lead.country || 'N/A'}
Sales Person: ${agentName}
Language: ${lead.language || 'N/A'}`;
    } else {
      // Multiple numbers format - show details for each number
      const etisalatIds = Array.isArray(etisalatId) ? etisalatId : [etisalatId];
      let message = `Lead No.: ${leadNumber}
Date: ${currentDate}
Customer Details
Customer Name: ${lead.customerName}
Customer Number: ${lead.customerNumber}`;

      // Add details for each number/plan with its own Etisalat ID
      plansWithPasscodes.forEach((plan, index) => {
        const partner = getServiceProvider(plan.group || '');
        const planEtisalatId = etisalatIds[index] || (plan as any).etisalatLeadId || 'N/A';
        message += `
Number ${index + 1} Details
Partner: ${partner}
Etisalat Portal ID: ${planEtisalatId}
Selected Number: ${plan.number || 'N/A'}
Passcode: ${plan.passcode}
Plan Selected: ${plan.plan || 'N/A'}`;
      });

      message += `
Additional Details
Gender: ${lead.gender || 'N/A'}
Paid or Free: ${lead.advancePayment ? 'Paid' : 'Free'}
Emirates: ${emirate}
Address: ${lead.customerAddress || 'N/A'}
Nationality: ${lead.country || 'N/A'}
Sales Person: ${agentName}
Language: ${lead.language || 'N/A'}`;

      return message;
    }
  };

  useEffect(() => {
    // Auto scroll to chat box only on page refresh (initial mount)
    // Use hasScrolledOnMountRef to ensure it only happens once per page load
    if (!hasScrolledOnMountRef.current && chatBoxRef.current) {
      chatBoxRef.current.scrollIntoView({ behavior: 'smooth' });
      hasScrolledOnMountRef.current = true;
    }
  }, []);

  useEffect(() => {
    // Auto scroll to end of page only on page refresh (initial mount)
    // Use hasScrolledOnMountRef to ensure it only happens once per page load
    if (!hasScrolledOnMountRef.current && pageEndRef.current) {
      pageEndRef.current.scrollIntoView({ behavior: 'smooth' });
      hasScrolledOnMountRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (lead.verificationMedia) {
      const transformedMedia = lead.verificationMedia.map(media => {
        if (typeof media === 'string') {
          const isImage = media.toLowerCase().endsWith('.jpg') || 
                         media.toLowerCase().endsWith('.jpeg') || 
                         media.toLowerCase().endsWith('.png');
          const isVideo = media.toLowerCase().endsWith('.mp4') || 
                         media.toLowerCase().endsWith('.webm');
          
          return {
            url: media,
            type: isImage ? 'image' as const : isVideo ? 'video' as const : 'audio' as const,
            name: `Media ${media.split('/').pop()}`
          };
        }
        return media;
      });
      setVerificationMedia(transformedMedia);
      setUploadComplete(transformedMedia.length > 0);
      setUploadProgress(transformedMedia.length > 0 ? 100 : 0);
    }
  }, [lead.verificationMedia]);

  useEffect(() => {
    if (!showMediaModal) {
      setUploadInProgress(false);
      setUploadComplete(false);
      setUploadProgress(0);
    }
  }, [showMediaModal]);

  useEffect(() => {
    const fetchSharedWithNames = async () => {
      if (lead.sharedWith && lead.sharedWith.length > 0) {
        const names = await Promise.all(
          lead.sharedWith.map(async (agentId) => {
            const agentRef = doc(db, 'users', agentId);
            const agentDoc = await getDoc(agentRef);
            if (agentDoc.exists()) {
              const agentData = agentDoc.data();
              return agentData.name || 'Unknown Agent';
            }
            return 'Unknown Agent';
          })
        );
        setSharedWithNames(names);
      }
    };

    fetchSharedWithNames();
  }, [lead.sharedWith]);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const plansData = await getPlans();
        setPlans(plansData);
      } catch (error) {
        console.error('Error fetching plans:', error);
      }
    };

    fetchPlans();
  }, []);

  // Helper function to get plan description
  const getPlanDescription = (planName: string) => {
    const plan = plans.find(p => p.name === planName);
    return plan?.description || 'No description available';
  };

  // Validate that all numbers in lead plans exist in numberPool
  const validateNumbersExist = async (): Promise<{ valid: boolean; missingNumbers: string[] }> => {
    const plans = lead.plans || [];
    const realPlans = plans.filter((p: any) => p.numberId && !p.numberId.startsWith('virtual-'));
    
    if (realPlans.length === 0) {
      return { valid: true, missingNumbers: [] };
    }

    const missingNumbers: string[] = [];
    
    // Check each numberId exists in numberPool
    const checkPromises = realPlans.map(async (plan: any) => {
      try {
        const numberRef = doc(db, 'numberPool', plan.numberId);
        const numberDoc = await getDoc(numberRef);
        if (!numberDoc.exists()) {
          missingNumbers.push(plan.number || plan.numberId);
        }
      } catch (error) {
        console.error(`Error checking number ${plan.numberId}:`, error);
        missingNumbers.push(plan.number || plan.numberId);
      }
    });

    await Promise.all(checkPromises);

    return {
      valid: missingNumbers.length === 0,
      missingNumbers
    };
  };

  const handleVerificationAction = async (actionOverride?: 'verify' | 'reject' | 'non_verified' | 'verify_at_location', noteOverride?: string) => {
    setIsVerifyActionProcessing(true);
    try {
      const actionToUse = actionOverride || verifyAction;
      if (!actionToUse) {
        setIsVerifyActionProcessing(false);
        return;
      }
      
      // Validate that all numbers exist in numberPool
      const numberValidation = await validateNumbersExist();
      if (!numberValidation.valid) {
        setMissingNumbers(numberValidation.missingNumbers);
        setShowNumberErrorModal(true);
        setIsVerifyActionProcessing(false);
        return;
      }
      
      // Only require media upload for regular 'verify', not for 'verify_at_location'
      if (actionToUse === 'verify' && !uploadComplete) {
        toast.error('Please upload verification media before verifying');
        setIsVerifyActionProcessing(false);
        return;
      }
      setVerifyAction(actionToUse);
      const leadRef = doc(db, 'leads', lead.id);
      
      // Use noteOverride if provided, otherwise use verificationNote
      const noteToUse = noteOverride !== undefined ? noteOverride : verificationNote;
      
      // Handle verify_at_location - set status to assigned_to_cord and flag as pending verification
      const isVerifyAtLocation = actionToUse === 'verify_at_location';
      
      // Handle activated_non_verified status - convert to activated when verified
      let leadStatus = actionToUse === 'verify' ? 
                      (lead.status === 'activated_non_verified' ? 'activated' : 'verified') 
                      : isVerifyAtLocation ? 'assigned_to_cord'
                      : actionToUse === 'reject' ? 'rejected'
                      : 'non_verified';
      
     // console.log('Setting lead status to:', leadStatus);
      
      // Ensure plan statuses stay aligned with lead status on verification
      const updatedPlans = (lead.plans || []).map((p: any) => ({
        ...p,
        status: isVerifyAtLocation ? 'assigned_to_cord' : leadStatus
      }));

      const updateData: any = {
        status: leadStatus,
        verifierId: user?.id,
        verifiedBy: user?.id, // ✅ Add this field for dashboard metrics
        verificationNotes: noteToUse,
        verificationMedia: verificationMedia,
        plans: updatedPlans,
        updatedAt: serverTimestamp(),
        ...(leadStatus === 'verified' || leadStatus === 'activated' ? { verifiedAt: serverTimestamp() } : {}),
        // Set pendingVerificationAtLocation flag when verify_at_location is selected
        ...(isVerifyAtLocation ? { 
          pendingVerificationAtLocation: true,
          assignedToCordAt: serverTimestamp() // Track when assigned to coordinator
        } : {})
      };

      await updateDoc(leadRef, updateData);

      // Fetch the updated lead to ensure we have the latest status for notifications
      const updatedLeadDoc = await getDoc(leadRef);
      const updatedLead = updatedLeadDoc.exists() 
        ? { id: updatedLeadDoc.id, ...updatedLeadDoc.data() } as Lead
        : { ...lead, status: leadStatus } as Lead; // Use new status if fetch fails
      
      // Log lead verification action (non-blocking - fire and forget)
      const action: 'verified' | 'rejected' | 'non_verified' = 
        leadStatus === 'verified' || leadStatus === 'activated' ? 'verified' :
        leadStatus === 'rejected' ? 'rejected' :
        'non_verified';
      
      logLeadAction(
        lead.id,
        lead.leadNumber || lead.id,
        action,
        { status: lead.status },
        { status: leadStatus, verifierId: user?.id, verificationNotes: noteToUse },
        noteToUse || `Lead ${action} by ${user?.name || 'Unknown'}`
      ).catch(error => {
        console.error('Error logging lead verification action:', error);
      });

      // Increment verifier counters if lead is verified or activated (non-blocking)
      if ((leadStatus === 'verified' || leadStatus === 'activated') && user?.id) {
        incrementVerifierCounters(user.id).catch(error => {
          console.error('Error incrementing verifier counters:', error);
        });
      }

      // Update all numbers in the lead's plans
      if (lead.plans && lead.plans.length > 0) {
        const realPlans = lead.plans.filter(p => !p.numberId?.startsWith('virtual-'));
        const updatePromises = realPlans.map(async plan => {
          const numberRef = doc(db, 'numberPool', plan.numberId);
          const numberDoc = await getDoc(numberRef);
          if (!numberDoc.exists()) {
            return;
          }
          const numberData = numberDoc.data();

          if (leadStatus === 'rejected') {
            // For rejected leads, check if there's a claim queue
            if (numberData?.claimQueue && numberData.claimQueue.length > 0) {
              // Get the next agent in queue
              const nextClaim = numberData.claimQueue[0];

              // Update the number with the next claim
              const updateData: any = {
                status: 'reserved',
                lastStatusChange: serverTimestamp(),
                claimingAgentId: nextClaim.agentId,
                claimingStartedAt: serverTimestamp(),
                claimingExpiresAt: new Date(Date.now() + 2 * 60 * 1000), // 2 minutes
                claimQueue: numberData.claimQueue.slice(1),
                leadId: lead.id
              };
              
              // Clear struckThrough if it exists
              if (numberData?.struckThrough === true) {
                updateData.struckThrough = false;
              }
              
              await updateDoc(numberRef, updateData);

              // Log status change for number (rejected -> reserved transfer)
              await logNumberAction(
                plan.numberId,
                plan.number || '',
                'status_changed',
                { status: numberData?.status },
                { status: 'reserved', leadId: lead.id },
                `Verifier ${user?.name || 'Unknown'} rejected lead, moved number to next claim`
              );

              // If there's a second claim, send them notification
              if (numberData.claimQueue.length > 1) {
        await addDoc(collection(db, 'notifications'), {
                  userId: numberData.claimQueue[1].agentId,
                  type: 'number_claimed',
                  title: 'Number Claim Started',
                  message: `The number is now available for your claim. You have 2 minutes to take ownership.`,
          read: false,
                  createdAt: serverTimestamp(),
                  numberId: plan.numberId
                });
              }
            } else {
              // No claims in queue, just set to open
              const updateData: any = {
                status: 'open',
                lastStatusChange: serverTimestamp(),
                claimingAgentId: null,
                claimingStartedAt: null,
                claimingExpiresAt: null,
                claimQueue: [],
                leadId: lead.id
              };
              
              // Clear struckThrough if it exists
              if (numberData?.struckThrough === true) {
                updateData.struckThrough = false;
              }
              
              await updateDoc(numberRef, updateData);

              await logNumberAction(
                plan.numberId,
                plan.number || '',
                'status_changed',
                { status: numberData?.status },
                { status: 'open', leadId: lead.id },
                `Verifier ${user?.name || 'Unknown'} rejected lead, set number open, cleared struckThrough`
              );
          }
          } else if (leadStatus === 'non_verified') {
            // For non_verified leads, reserve the number for the original agent
            // Get the agentId from the lead
            const agentId = lead.agentId;
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
            
            // Check if there's a claim queue or existing claiming agent
            const claimQueue = numberData?.claimQueue || [];
            const existingClaimingAgentId = numberData?.claimingAgentId;
            
            if (claimQueue.length > 0) {
              // Get the first claim in queue
              const nextClaim = claimQueue[0];
              
              // Reserve for the original agent, but start the claim timer for the first claim
              await updateDoc(numberRef, {
                status: 'reserved',
                reservedBy: agentId,
                reservedAt: serverTimestamp(),
                expiresAt: expiresAt,
                lastStatusChange: serverTimestamp(),
                claimingAgentId: nextClaim.agentId,
                claimingStartedAt: serverTimestamp(),
                claimingExpiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes claim timer
                claimQueue: claimQueue.slice(1),
                leadId: lead.id
              });

              // Log status change
              const agentName = await resolveUserName(agentId);
              await logNumberAction(
                plan.numberId,
                plan.number || '',
                'status_changed',
                { status: numberData?.status },
                { status: 'reserved', reservedBy: agentId, leadId: lead.id },
                `Verifier ${user?.name || 'Unknown'} marked lead as non verified, number reserved for agent ${agentName}, claim timer started`
              );

              // If there's a second claim, send them notification
              if (claimQueue.length > 1) {
                await addDoc(collection(db, 'notifications'), {
                  userId: claimQueue[1].agentId,
                  type: 'number_claimed',
                  title: 'Number Claim Started',
                  message: `The number is now available for your claim. You have 15 minutes to take ownership.`,
                  read: false,
                  createdAt: serverTimestamp(),
                  numberId: plan.numberId
                });
              }
            } else if (existingClaimingAgentId) {
              // No queue but there's an existing claiming agent, restart their timer
              await updateDoc(numberRef, {
                status: 'reserved',
                reservedBy: agentId,
                reservedAt: serverTimestamp(),
                expiresAt: expiresAt,
                lastStatusChange: serverTimestamp(),
                claimingAgentId: existingClaimingAgentId,
                claimingStartedAt: serverTimestamp(),
                claimingExpiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes claim timer
                leadId: lead.id
              });

              const agentName2 = await resolveUserName(agentId);
              await logNumberAction(
                plan.numberId,
                plan.number || '',
                'status_changed',
                { status: numberData?.status },
                { status: 'reserved', reservedBy: agentId, leadId: lead.id },
                `Verifier ${user?.name || 'Unknown'} marked lead as non verified, number reserved for agent ${agentName2}, existing claim timer restarted`
              );
            } else {
              // No claims in queue and no existing claiming agent, just reserve for the original agent
              await updateDoc(numberRef, {
                status: 'reserved',
                reservedBy: agentId,
                reservedAt: serverTimestamp(),
                expiresAt: expiresAt,
                lastStatusChange: serverTimestamp(),
                claimingAgentId: null,
                claimingStartedAt: null,
                claimingExpiresAt: null,
                claimQueue: [],
                leadId: lead.id
              });

              const agentName3 = await resolveUserName(agentId);
              await logNumberAction(
                plan.numberId,
                plan.number || '',
                'status_changed',
                { status: numberData?.status },
                { status: 'reserved', reservedBy: agentId, leadId: lead.id },
                `Verifier ${user?.name || 'Unknown'} marked lead as non verified, number reserved for agent ${agentName3}`
              );
            }
          } else if (leadStatus === 'assigned_to_cord' && isVerifyAtLocation) {
            // For verify_at_location, set number status to assigned_to_cord
            await updateDoc(numberRef, {
              status: 'assigned_to_cord',
              lastStatusChange: serverTimestamp(),
              leadId: lead.id
            });

            await logNumberAction(
              plan.numberId,
              plan.number || '',
              'status_changed',
              { status: numberData?.status },
              { status: 'assigned_to_cord', leadId: lead.id },
              `Verifier ${user?.name || 'Unknown'} verified at location, assigned to coordinator`
            );
          } else if (leadStatus === 'verified' || leadStatus === 'activated') {
            // For verified/activated leads, clear ALL claim data
            const updateData: any = {
              status: leadStatus,
              lastStatusChange: serverTimestamp(),
              leadId: lead.id,
              // Clear all claim-related fields
              claimingAgentId: null,
              claimingStartedAt: null,
              claimingExpiresAt: null,
              claimQueue: [],
              claims: [],
              claimedAt: null,
              lastClaimedAt: null
            };
            
            await updateDoc(numberRef, updateData);

            await logNumberAction(
              plan.numberId,
              plan.number || '',
              'status_changed',
              { status: numberData?.status },
              { status: leadStatus, leadId: lead.id },
              `Verifier ${user?.name || 'Unknown'} verified lead, cleared claim data`
            );
          } else {
            // For other verification actions, update normally
            await updateDoc(numberRef, {
              status: leadStatus,
              lastStatusChange: serverTimestamp(),
              leadId: lead.id
            });

            await logNumberAction(
              plan.numberId,
              plan.number || '',
              'status_changed',
              { status: numberData?.status },
              { status: leadStatus, leadId: lead.id },
              `Verifier ${user?.name || 'Unknown'} set status to ${leadStatus}`
            );
          }
        });

        await Promise.all(updatePromises);
      }

      // Use lead.agentId directly - it's always preserved and never modified when verifiers edit leads
      const agentId = lead.agentId;

      // Prepare all non-blocking operations to run in parallel after critical operations
      const nonBlockingOperations: Promise<void>[] = [];

      // Send notification to the agent (non-blocking)
      if (agentId) {
        const statusMessage = leadStatus === 'verified' ? 'Lead Verified' : 
                            leadStatus === 'rejected' ? 'Lead Rejected' : 
                            'Lead Marked as Non Verified';
        
        nonBlockingOperations.push(
          addDoc(collection(db, 'notifications'), {
          userId: agentId,
          type: 'lead_verification',
          title: statusMessage,
          message: `${user?.name} has ${leadStatus === 'verified' ? 'verified' : 
                    leadStatus === 'rejected' ? 'rejected' : 
                    'marked as non verified'} your lead${verificationNote ? `: ${verificationNote}` : ''}`,
          read: false,
          createdAt: new Date(),
          data: {
            leadId: lead.id
          }
          }).then(async () => {
            // Send WhatsApp notification to agent if they have a phone number (non-blocking)
        try {
          const agentRef = doc(db, 'users', agentId);
          const agentDoc = await getDoc(agentRef);
          if (agentDoc.exists()) {
            const agentData = agentDoc.data();
            const agentPhone = agentData.phoneNumber || agentData.phoneNumbers?.[0];
            
            if (agentPhone) {
              try {
                const { sendWhatsAppTemplateByGroup, getPartnerLabel } = await import('../../utils/whatsappRouter');
                const group = lead.plans?.[0]?.group || undefined;
                const partnerLabel = getPartnerLabel(group);
                await sendWhatsAppTemplateByGroup({
                  to: agentPhone,
                  group,
                  bodyParameters: [
                    { type: 'text', text: lead.customerName || 'N/A' },
                    { type: 'text', text: lead.customerNumber || 'N/A' },
                    { type: 'text', text: lead.plans?.[0]?.number || 'N/A' },
                    { type: 'text', text: statusMessage },
                    { type: 'text', text: user?.name || 'N/A' },
                    { type: 'text', text: `${window.location.origin}/dashboard/leads/${lead.id}` }
                  ],
                });
              } catch (e) {
                    // Silently fail - WhatsApp notification is not critical
              }
            }
          }
        } catch (error) {
              // Silently fail - notification is not critical
        }
          }).catch(error => {
            console.error('Error sending notification to agent:', error);
          })
        );
      }

      // Add verification note as a chat message if it exists (non-blocking)
      if (noteToUse && noteToUse.trim() !== '') {
        nonBlockingOperations.push(
          addDoc(collection(db, 'chatMessages'), {
            leadId: lead.id,
            userId: user?.id || '',
            userRole: user?.role || 'verifier',
            message: noteToUse.trim(),
            createdAt: new Date()
          }).then(async () => {
            // Send WhatsApp notification to manager after message is added to chat (non-blocking)
          const { sendChatMessageWhatsAppNotification } = await import('../../utils/chatNotifications');
            await sendChatMessageWhatsAppNotification(updatedLead, noteToUse.trim(), user?.name || 'Unknown');
          }).catch(error => {
            console.error('Error creating verification chat message:', error);
          })
        );
      }

      // Show success immediately - don't wait for non-blocking operations
      toast.success(`Lead ${actionToUse === 'verify' ? 'verified' : actionToUse === 'reject' ? 'rejected' : 'updated'} successfully`);
      
      // Run non-blocking operations in background (don't await)
      Promise.all(nonBlockingOperations).catch(error => {
        console.error('Error in non-blocking operations:', error);
      });
      setVerificationNote('Verified');
      setVerifyAction(null);
      navigate('/dashboard');
    } catch (error) {
     console.error('Error updating lead status:', error);
      toast.error('Failed to update lead status');
    } finally {
      setIsVerifyActionProcessing(false);
    }
  };

  const handleManagerAssign = async () => {
    setIsManagerActionProcessing(true);
    try {
      const leadRef = doc(db, 'leads', lead.id);
      const trimmedLocationUrl = managerLocationUrl.trim();

      // Change status to 'assigned_to_cord' when manager assigns to coordinator
      const updatePayload: any = {
        status: 'assigned_to_cord',
        managerAssigned: true,
        managerNotes: managerNote.trim() || '',
        updatedAt: serverTimestamp(),
        assignedToCordAt: serverTimestamp() // Track when assigned to coordinator
      };

      // Only set URL if provided to avoid clearing existing data
      if (trimmedLocationUrl) {
        updatePayload.url = trimmedLocationUrl;
      }

      await updateDoc(leadRef, updatePayload);
      
      // Fetch the updated lead to ensure we have the latest status for notifications
      const updatedLeadDoc = await getDoc(leadRef);
      const updatedLead = updatedLeadDoc.exists() 
        ? { id: updatedLeadDoc.id, ...updatedLeadDoc.data() } as Lead
        : { ...lead, status: 'assigned_to_cord', managerAssigned: true } as Lead; // Use new status if fetch fails

      // Note: Coordinators will see this lead in their unassigned list via filtering
      // No need to send notification as coordinators check for verified leads with managerAssigned: true

      // Add manager note as a chat message if it exists (non-blocking)
      if (managerNote && managerNote.trim() !== '') {
        addDoc(collection(db, 'chatMessages'), {
            leadId: lead.id,
            userId: user?.id || '',
            userRole: user?.role || 'manager',
            message: managerNote.trim(),
            createdAt: new Date()
        }).then(async () => {
          // Send WhatsApp notification for the chat message (non-blocking)
          // Use updatedLead to ensure we have the latest status
          const { sendChatMessageWhatsAppNotification } = await import('../../utils/chatNotifications');
          await sendChatMessageWhatsAppNotification(updatedLead, managerNote.trim(), user?.name || 'Unknown');
        }).catch(error => {
          console.error('Error creating manager chat message:', error);
        });
      }

      toast.success('Lead assigned to coordinator successfully');
      setShowManagerAssignDialog(false);
      setManagerNote('');
      setManagerLocationUrl(trimmedLocationUrl || '');
      
      // Reload the lead data
      const leadDoc = await getDoc(leadRef);
      if (leadDoc.exists()) {
        const leadData = leadDoc.data();
        Object.assign(lead, {
          ...leadData,
          createdAt: leadData.createdAt?.toDate(),
          updatedAt: leadData.updatedAt?.toDate()
        });
      }
    } catch (error) {
      console.error('Error assigning lead:', error);
      toast.error('Failed to assign lead');
    } finally {
      setIsManagerActionProcessing(false);
    }
  };

  const handleTemplateMessage = (template: typeof READY_MADE_MESSAGES[0]) => {
    const { message } = template;
    setReplyText(message);
  };

  const handleResendVerificationMessage = async (log: any) => {
    if (!lead) {
      toast.error('Lead not found');
      return;
    }
    
    try {
      setResendingLogId(log.id);
      
      // Fetch fresh lead data from Firestore
      const leadDoc = await getDoc(doc(db, 'leads', lead.id));
      if (!leadDoc.exists()) {
        toast.error('Lead not found');
        return;
      }
      
      const freshLead = { id: leadDoc.id, ...leadDoc.data() } as Lead;
      
      // Get the first plan's fresh details
      const firstPlan = freshLead.plans?.[0];
      if (!firstPlan || !freshLead.customerNumber) {
        toast.error('Missing plan or customer number');
        return;
      }
      
      // Fetch fresh plan details from Firebase
      let planDetails = null;
      if (firstPlan.plan) {
        try {
          const plansQuery = query(collection(db, 'plans'), where('name', '==', firstPlan.plan));
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
          console.error('Error fetching plan details:', error);
        }
      }
      
      if (!planDetails) {
        toast.error('Could not fetch plan details');
        return;
      }
      
      // Generate fresh parameters from current lead data
      const amountDigits = (planDetails.amount || '').toString().match(/\d+/)?.[0];
      const monthlyLabel = amountDigits ? `AED ${amountDigits}/Month` : (planDetails.amount || 'N/A');
      const parameters = [
        firstPlan.number || 'N/A',
        monthlyLabel,
        planDetails.benefits,
        planDetails.duration
      ];
      
      // Format phone number for API - Simple logic: remove first 0, add 971
      // Example: 0506789345 -> 971506789345
      let to = (freshLead.customerNumber || '').toString().replace(/\D/g, ''); // Remove non-digits
      
      // Remove leading zero if present
      if (to.startsWith('0')) {
        to = to.substring(1);
      }
      
      // Add 971 prefix
      if (!to.startsWith('971')) {
        to = `971${to}`;
      }
      
      const group = firstPlan.group || undefined;
      const language = (freshLead as any).language || 'English';
      const { triggerFlowExternal } = await import('../../utils/whatsappRouter');
      const { logOutboundVerificationMessage } = await import('../../utils/whatsappVerification');
      
      // Resend verification message using Flow API (no Business Phone ID/Access Token needed)
      const sendResponse = await triggerFlowExternal({
        phoneNumber: to,
        group,
        language,
        templateVariables: {
          value1: parameters[0],
          value2: parameters[1],
          value3: parameters[2],
          value4: parameters[3]
        }
      });
      
      await logOutboundVerificationMessage(
        freshLead.id,
        to,
        'verification_flow', // Template name for logging
        parameters,
        { sendResponse }
      );
      
      toast.success('Verification message resent with updated data');
    } catch (error: any) {
      toast.error('Failed to resend WhatsApp message');
      console.error('Resend WhatsApp error:', error);
      
      try {
        const { logOutboundVerificationMessage } = await import('../../utils/whatsappVerification');
        const parameters = log.parameters || [];
        let to = (lead.customerNumber || '').toString().replace(/\D/g, '');
        const country = (lead as any).country || 'AE';
        const code = country === 'AE' ? '971' : '971';
        if (!to.startsWith(code)) {
          to = `${code}${to}`;
        }
        
        await logOutboundVerificationMessage(
          lead.id,
          to,
          log.templateName,
          parameters,
          {
            status: 'failed',
            error: {
              message: error?.message || 'Resend failed',
              details: typeof error?.toString === 'function' ? error.toString() : undefined
            }
          }
        );
      } catch (logError) {
        console.error('Failed to log resend failure:', logError);
      }
    } finally {
      setResendingLogId(null);
    }
  };

  const sendWhatsAppReply = async () => {
    if (!lead || !replyText.trim() || sendingReply) return;
    
    try {
      setSendingReply(true);
      const country = (lead as any).country || 'AE';
      let to = (lead.customerNumber || '').toString().replace(/\D/g, '');
      const code = country === 'AE' ? '971'
        : country === 'SA' ? '966'
        : country === 'QA' ? '974'
        : country === 'KW' ? '965'
        : country === 'BH' ? '973'
        : country === 'OM' ? '968'
        : country === 'IN' ? '91'
        : country === 'PK' ? '92'
        : country === 'EG' ? '20'
        : country === 'PH' ? '63'
        : country === 'ID' ? '62'
        : country === 'MY' ? '60'
        : country === 'SG' ? '65'
        : country === 'TH' ? '66'
        : country === 'VN' ? '84'
        : country === 'CN' ? '86'
        : country === 'JP' ? '81'
        : country === 'KR' ? '82'
        : country === 'AU' ? '61'
        : country === 'NZ' ? '64'
        : country === 'GB' ? '44'
        : country === 'US' ? '1'
        : country === 'CA' ? '1'
        : '971';
      if (!to.startsWith(code)) {
        to = `${code}${to}`;
      }

      const group = lead.plans?.[0]?.group || undefined;
      const { resolveWhatsAppRoute } = await import('../../utils/whatsappRouter');
      const routeConfig = await resolveWhatsAppRoute(group);
      const { meta } = routeConfig;
      if (!meta.businessPhoneId || !meta.accessToken) {
        throw new Error('WhatsApp credentials are not configured for this group');
      }

      const resp = await fetch(`https://graph.facebook.com/v19.0/${meta.businessPhoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${meta.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: replyText.trim() }
        })
      });

      const responseText = await resp.text();
      let responseJson: any = {};
      try {
        responseJson = JSON.parse(responseText);
      } catch (e) {
        // ignore parse error
      }

      if (!resp.ok) {
        throw new Error(responseJson?.error?.message || `Failed to send message (${resp.status})`);
      }

      // Log the outbound message
      const msgId = responseJson.messages?.[0]?.id;
      const newMessage = {
        direction: 'outbound',
        to,
        messageText: replyText.trim(),
        messageId: msgId || undefined,
        status: msgId ? 'sent' : undefined,
        createdAt: new Date()
      };
      
      // Optimistically add to UI
      setWhatsAppLogs(prev => [...prev, { id: 'temp-' + Date.now(), ...newMessage }]);
      
      // Then save to Firebase (listener will update with real data)
      await addDoc(collection(db, 'leads', lead.id, 'whatsappLogs'), {
        ...newMessage,
        createdAt: serverTimestamp()
      });

      setReplyText('');
      toast.success('Message sent successfully');
    } catch (error: any) {
      console.error('Error sending WhatsApp reply:', error);
      toast.error(error?.message || 'Failed to send message');
    } finally {
      setSendingReply(false);
    }
  };

  const handleSendVerificationMessage = async () => {
    if (!lead || !lead.id || sendingVerification) return;
    
    try {
      setSendingVerification(true);
      
      // Get the first plan's details
      const firstPlan = lead.plans?.[0];
      if (!firstPlan || !lead.customerNumber) {
        toast.error('Missing plan or customer number');
        return;
      }
      
      // Get plan details from Firebase
      let planDetails = null;
      if (firstPlan.plan) {
        try {
          const plansQuery = query(collection(db, 'plans'), where('name', '==', firstPlan.plan));
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
          console.error('Error fetching plan details:', error);
        }
      }
      
      if (!planDetails) {
        toast.error('Could not fetch plan details');
        return;
      }
      
      // Format customer number
      const country = (lead as any).country || 'AE';
      let formattedNumber = lead.customerNumber.toString().replace(/\D/g, '');
      const countryCode = country === 'AE' ? '971'
        : country === 'SA' ? '966'
        : country === 'QA' ? '974'
        : country === 'KW' ? '965'
        : country === 'BH' ? '973'
        : country === 'OM' ? '968'
        : country === 'IN' ? '91'
        : country === 'PK' ? '92'
        : country === 'EG' ? '20'
        : country === 'PH' ? '63'
        : country === 'ID' ? '62'
        : country === 'MY' ? '60'
        : country === 'SG' ? '65'
        : country === 'TH' ? '66'
        : country === 'VN' ? '84'
        : country === 'CN' ? '86'
        : country === 'JP' ? '81'
        : country === 'KR' ? '82'
        : country === 'AU' ? '61'
        : country === 'NZ' ? '64'
        : country === 'GB' ? '44'
        : country === 'US' ? '1'
        : country === 'CA' ? '1'
        : '971';
      
      // Remove leading zero if present (e.g., 0501234567 -> 501234567)
      if (formattedNumber.startsWith('0')) {
        formattedNumber = formattedNumber.substring(1);
      }
      
      // Add country code if not present
      if (!formattedNumber.startsWith(countryCode)) {
        formattedNumber = `${countryCode}${formattedNumber}`;
      }
      
      const group = firstPlan.group || undefined;
      
      // Get language from lead
      const language = (lead as any).language || 'English';
      
      // Import WhatsApp utilities - use Flow API instead of Graph API
      const { triggerFlowExternal } = await import('../../utils/whatsappRouter');
      const { logOutboundVerificationMessage } = await import('../../utils/whatsappVerification');
      
      const amountDigits = (planDetails.amount || '').toString().match(/\d+/)?.[0];
      const monthlyLabel = amountDigits ? `AED ${amountDigits}/Month` : (planDetails.amount || 'N/A');
      const templateParameters = [
        firstPlan.number || 'N/A',
        monthlyLabel,
        planDetails.benefits,
        planDetails.duration
      ];
      
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
      
      // Optimistically add verification message to UI
      const verificationMessage = {
        direction: 'outbound',
        to: formattedNumber,
        messageText: `Verification flow triggered`,
        templateName: 'verification_flow',
        status: 'sent',
        createdAt: new Date()
      };
      setWhatsAppLogs(prev => [...prev, { id: 'temp-' + Date.now(), ...verificationMessage }]);
      
      // Log outbound verification message
      try {
        await logOutboundVerificationMessage(
          lead.id,
          formattedNumber,
          'verification_flow', // Template name for logging
          templateParameters,
          {
            sendResponse
          }
        );
      } catch (e) {
        console.error('Failed to log outbound message:', e);
      }
      
      // Update lead to mark verification method and timestamp
      await updateDoc(doc(db, 'leads', lead.id), {
        verificationMethod: 'whatsapp',
        whatsappInitiatedAt: new Date(),
        status: 'pending_verification',
        updatedAt: serverTimestamp()
      });
      
      toast.success('Verification message sent successfully!');
      setShowVerificationDialog(false);
      
      // Messages are now auto-fetched via polling in useEffect, no need for manual polling
      // The useEffect will automatically fetch new messages every 3 seconds
      
    } catch (error: any) {
      console.error('Error sending verification message:', error);
      // Check if it's a duplicate contact error - this is actually okay, contact exists
      const errorMessage = error?.message || '';
      if (errorMessage.includes('Duplicate entry') && errorMessage.includes('unique_shortcode')) {
        // Contact already exists, but flow should still work - treat as success
        toast.success('Verification message sent successfully! (Contact already exists in system)');
        setShowVerificationDialog(false);
        // Still update the lead
        try {
          await updateDoc(doc(db, 'leads', lead.id), {
            verificationMethod: 'whatsapp',
            whatsappInitiatedAt: new Date(),
            status: 'pending_verification',
            updatedAt: serverTimestamp()
          });
        } catch (e) {
          console.error('Failed to update lead:', e);
        }
      } else {
      toast.error(error?.message || 'Failed to send verification message');
      }
    } finally {
      setSendingVerification(false);
    }
  };

  // Handler to change number for a specific plan index
  const handleChangeNumber = async (index: number, numberData: { id: string; number: string; passcode?: string; category?: string }) => {
    const newNumbers = [...editableNumbers];
    const newNumberIds = [...editableNumberIds];
    const newPasscodes = [...editablePasscodes];
    const newCategories = [...editableCategories];
    const newSelectors = [...showNumberSelectors];
    
    newNumbers[index] = numberData.number;
    newNumberIds[index] = numberData.id;
    if (numberData.passcode) newPasscodes[index] = numberData.passcode;
    if (numberData.category) newCategories[index] = numberData.category;
    newSelectors[index] = false;
    
    setEditableNumbers(newNumbers);
    setEditableNumberIds(newNumberIds);
    setEditablePasscodes(newPasscodes);
    setEditableCategories(newCategories);
    setShowNumberSelectors(newSelectors);
  };

  // Handler to change plan for a specific plan index
  const handleChangePlan = (index: number, planName: string) => {
    const newPlans = [...editablePlans];
    newPlans[index] = planName;
    setEditablePlans(newPlans);
  };

  // Handler to add a new number
  const handleAddNewNumber = async (numberData: { id: string; number: string; passcode?: string; category?: string }) => {
    if (!newNumberPlan) {
      toast.error('Please select a plan for the new number');
      return;
    }
    
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    const newNumberEntry = {
      numberId: numberData.id,
      number: numberData.number,
      plan: newNumberPlan,
      category: numberData.category || newNumberCategory || 'Standard',
      group: 'G1', // Default group, can be changed
      passcode: numberData.passcode || '',
      activationDate: todayStr,
      srNumber: '',
      serviceOrderNumber: '',
      selectedGroup: 'G1',
      srImageFile: null as File | null
    };
    
    setNewNumbers(prev => [...prev, newNumberEntry]);
    setNewNumberData(null);
    setNewNumberPlan('');
    setNewNumberCategory('Standard');
    setShowAddNumberForm(false);
    toast.success('New number added. Please fill in activation details.');
  };

  // Handler to remove a new number from the list
  const handleRemoveNewNumber = (index: number) => {
    setNewNumbers(prev => prev.filter((_, i) => i !== index));
  };

  // Handler to remove number from lead (make it available in pool)
  const handleRemoveNumber = async (index: number) => {
    if (!confirm(`Are you sure you want to remove this number from the lead? It will become available in the pool.`)) {
      return;
    }
    
    const plan = lead.plans?.[index];
    if (!plan?.numberId || plan.numberId.startsWith('virtual-')) {
      // Just mark as removed in UI
      setRemovedPlanIndices(prev => new Set([...prev, index]));
      return;
    }

    try {
      // Update number pool to make it available
      const numberRef = doc(db, 'numberPool', plan.numberId);
      const numberDoc = await getDoc(numberRef);
      
      if (numberDoc.exists()) {
        const numberData = numberDoc.data();
        await updateDoc(numberRef, {
          status: 'open',
          lastStatusChange: new Date(),
          leadId: null,
          reservedBy: null,
          reservedAt: null,
          claimingAgentId: null,
          claimingStartedAt: null,
          claimingExpiresAt: null,
          claimQueue: []
        });
        
        await logNumberAction(
          plan.numberId,
          plan.number || '',
          'status_changed',
          { status: numberData?.status, leadId: lead.id },
          { status: 'open', leadId: null },
          `Number removed from lead by ${user?.name || 'Unknown'} during activation`
        );
      }
      
      // Mark as removed in UI
      setRemovedPlanIndices(prev => new Set([...prev, index]));
      toast.success('Number removed and made available in pool');
    } catch (error: any) {
      console.error('Error removing number:', error);
      toast.error('Failed to remove number');
    }
  };

  const handleCoordinatorAction = async () => {
    // Validate that all numbers exist in numberPool
    const numberValidation = await validateNumbersExist();
    if (!numberValidation.valid) {
      setMissingNumbers(numberValidation.missingNumbers);
      setShowNumberErrorModal(true);
      return;
    }
    
    // Validate required fields for assignment / reassignment
    if (coordinatorAction === 'assign' || coordinatorAction === 'reassign') {
      const plansCount = lead.plans?.length || 0;
      if (plansCount > 1) {
        // Multiple numbers - validate all Etisalat IDs
        const missingIds = etisalatLeadIds.filter((id, index) => !id.trim());
        if (missingIds.length > 0) {
          toast.error(`Etisalat Lead ID is required for all ${plansCount} numbers`);
          return;
        }
      } else {
        // Single number - use single Etisalat ID
        if (!etisalatLeadId.trim()) {
          toast.error('Etisalat Lead ID is required');
          return;
        }
      }
      if (!selectedEmirate) {
        toast.error('Please select an Emirates');
        return;
      }
    }
    const isActivationAction = coordinatorAction === 'activate' || coordinatorAction === 'activate_non_verified';

    if (isActivationAction) {
      const plansCount = lead.plans?.length || 0;
      if (plansCount > 1) {
        // Multiple numbers - validate all activation fields (skip removed plans)
        for (let i = 0; i < plansCount; i++) {
          // Skip validation for removed plans
          if (removedPlanIndices.has(i)) {
            continue;
          }
          if (!activationDates[i]) {
            toast.error(`Activation Date is required for Number ${i + 1}`);
            return;
          }
          if (!srNumbers[i]?.trim()) {
            toast.error(`SR No. is required for Number ${i + 1}`);
            return;
          }
          if (!serviceOrderNumbers[i]?.trim()) {
            toast.error(`Service Order number is required for Number ${i + 1}`);
            return;
          }
          if (!selectedGroups[i]) {
            toast.error(`Please select a Group for Number ${i + 1}`);
            return;
          }
        }
        
        // Validate new numbers
        for (let i = 0; i < newNumbers.length; i++) {
          const newNum = newNumbers[i];
          if (!newNum.activationDate) {
            toast.error(`Activation Date is required for New Number ${i + 1}`);
            return;
          }
          if (!newNum.srNumber?.trim()) {
            toast.error(`SR No. is required for New Number ${i + 1}`);
            return;
          }
          if (!newNum.serviceOrderNumber?.trim()) {
            toast.error(`Service Order number is required for New Number ${i + 1}`);
            return;
          }
          if (!newNum.selectedGroup) {
            toast.error(`Please select a Group for New Number ${i + 1}`);
            return;
          }
        }
      } else {
        // Single number - use legacy validation
        if (!activationDate) {
          toast.error('Activation Date is required');
          return;
        }
        if (!srNumber.trim()) {
          toast.error('SR No. is required');
          return;
        }
        if (!serviceOrderNumber.trim()) {
          toast.error('Service Order number is required');
          return;
        }
        if (!selectedGroup) {
          toast.error('Please select a Group');
          return;
        }
      }
    }
    if (coordinatorAction === 'later') {
      if (!scheduledForDate) {
        toast.error('Schedule For Date is required');
        return;
      }
    }

    setIsCoordinatorActionProcessing(true);
    try {
      const leadRef = doc(db, 'leads', lead.id);
      
      // Check if number or plan was changed during activation
      const numberChanged = isActivationAction && editableNumber !== originalNumber;
      const planChanged = isActivationAction && editablePlan !== originalPlan;
      const hasChanges = numberChanged || planChanged;
      
    const updateData: Partial<Lead> = {
      coordinatorNotes: coordinatorNote,
      updatedAt: new Date()
    };

    // Preserve pendingVerificationAtLocation flag if it exists
    if ((lead as any).pendingVerificationAtLocation) {
      (updateData as any).pendingVerificationAtLocation = true;
    }

    // Status changes:
    // - 'assign' always moves lead to 'assigned'
    // - 'activate' moves to activated / activated_non_verified
    // - 'later' moves to 'later'
    // - 'reject' moves to 'rejected'
    // - 'followup' moves to 'follow_up'
    // - 'reassign' normally keeps status, but for 'later' leads we treat it as assigning again
    if (coordinatorAction === 'assign') {
      updateData.status = 'assigned';
      // Track when assigned (for calculating duration from assigned_to_cord to assigned)
      // Only set assignedAt if it doesn't already exist (first assignment only)
      const currentAssignedAt = (lead as any).assignedAt;
      if (!currentAssignedAt) {
        (updateData as any).assignedAt = serverTimestamp();
      }
    } else if (coordinatorAction === 'activate') {
      // Check if numbers were changed or new numbers added (will be set later in activation logic)
      updateData.status = hasChanges ? 'activated_non_verified' : 'activated';
    } else if (coordinatorAction === 'activate_non_verified') {
      updateData.status = 'activated_non_verified';
      // Clear pendingVerificationAtLocation flag when activating with pending verification
      if ((lead as any).pendingVerificationAtLocation) {
        (updateData as any).pendingVerificationAtLocation = false;
      }
    } else if (coordinatorAction === 'reverification') {
      updateData.status = 'reverification';
    } else if (coordinatorAction === 'later') {
      updateData.status = 'later';
    } else if (coordinatorAction === 'reject') {
      updateData.status = 'rejected';
    } else if (coordinatorAction === 'followup') {
      updateData.status = 'follow_up';
      (updateData as any).followUpAt = serverTimestamp();
    } else if (coordinatorAction === 'reassign' && lead.status === 'later') {
      // When reassigning a 'later' lead, move it back to 'assigned'
      // BUT don't reset assignedAt - keep the original first assignment timestamp
      updateData.status = 'assigned';
      // Do NOT set assignedAt here - preserve the original first assignment time
    }

    if (coordinatorAction === 'assign' || coordinatorAction === 'reassign') {
        updateData.coordinatorId = user!.id;
      // Store additional assignment data (including reassignment updates)
        const plansCount = lead.plans?.length || 0;
        if (plansCount > 1 && etisalatLeadIds.length > 0) {
          // Multiple numbers - store Etisalat IDs in plans array and as separate field
          updateData.etisalatLeadId = etisalatLeadIds[0] || ''; // Keep first one for backward compatibility
          (updateData as any).etisalatLeadIds = etisalatLeadIds; // Store array
          // Also update plans with individual Etisalat IDs
          if (lead.plans) {
            (updateData as any).plans = lead.plans.map((plan: any, index: number) => ({
              ...plan,
              etisalatLeadId: etisalatLeadIds[index] || ''
            }));
          }
        } else {
          // Single number - use single Etisalat ID
          updateData.etisalatLeadId = etisalatLeadId;
        }
        updateData.emirate = selectedEmirate;
      }
      if (isActivationAction) {
        const plansCount = lead.plans?.length || 0;
        
        // Check if any numbers were changed or new numbers were added
        let hasNumberChanges = false;
        let hasNewNumbers = newNumbers.length > 0;
        
        if (plansCount > 1) {
          // Multiple numbers - filter out removed plans and store activation data for each
          const currentPlans = Array.isArray(lead.plans) ? lead.plans : [];
          
          // Check for number changes
          currentPlans.forEach((p: any, index: number) => {
            if (!removedPlanIndices.has(index)) {
              const numberChanged = editableNumberIds[index] && editableNumberIds[index] !== p.numberId;
              if (numberChanged) {
                hasNumberChanges = true;
              }
            }
          });
          
          // Filter out removed plans and map to new plans array
          const updatedPlans = currentPlans
            .map((p: any, index: number) => {
              // Skip removed plans
              if (removedPlanIndices.has(index)) {
                return null;
              }
              
              // Check if number or plan changed
              const numberChanged = editableNumbers[index] && editableNumbers[index] !== originalNumbers[index];
              const planChanged = editablePlans[index] && editablePlans[index] !== originalPlans[index];
              
              return {
            ...p,
                // Update number and numberId if changed
                number: editableNumbers[index] || p.number,
                numberId: editableNumberIds[index] || p.numberId,
                // Update plan if changed
                plan: editablePlans[index] || p.plan,
                // Update category if number changed
                category: editableCategories[index] || p.category,
            group: selectedGroups[index] || p.group,
            activationDate: activationDates[index] ? new Date(activationDates[index]) : null,
            srNumber: srNumbers[index]?.trim() || null,
            serviceOrderNumber: serviceOrderNumbers[index]?.trim() || null
              };
            })
            .filter((p: any) => p !== null); // Remove null entries (removed plans)
          
          // Store activation data arrays (filtered for non-removed plans)
          const filteredActivationDates: Date[] = [];
          const filteredSrNumbers: string[] = [];
          const filteredServiceOrderNumbers: string[] = [];
          const filteredGroups: string[] = [];
          const filteredPasscodes: string[] = [];
          const filteredCategories: string[] = [];
          
          currentPlans.forEach((p: any, index: number) => {
            if (!removedPlanIndices.has(index)) {
              filteredActivationDates.push(activationDates[index] ? new Date(activationDates[index]) : new Date());
              filteredSrNumbers.push(srNumbers[index]?.trim() || '');
              filteredServiceOrderNumbers.push(serviceOrderNumbers[index]?.trim() || '');
              filteredGroups.push(selectedGroups[index] || '');
              filteredPasscodes.push(editablePasscodes[index]?.trim() || '');
              filteredCategories.push(editableCategories[index]?.trim() || '');
            }
          });
          
          // Add new numbers to the plans array
          const newPlansEntries = newNumbers.map((newNum) => ({
            numberId: newNum.numberId,
            number: newNum.number,
            plan: newNum.plan,
            category: newNum.category,
            group: newNum.selectedGroup,
            activationDate: new Date(newNum.activationDate),
            srNumber: newNum.srNumber.trim(),
            serviceOrderNumber: newNum.serviceOrderNumber.trim()
          }));
          
          (updateData as any).plans = [...updatedPlans, ...newPlansEntries];
          
          // Add new numbers' activation data to arrays
          newNumbers.forEach((newNum) => {
            filteredActivationDates.push(new Date(newNum.activationDate));
            filteredSrNumbers.push(newNum.srNumber.trim());
            filteredServiceOrderNumbers.push(newNum.serviceOrderNumber.trim());
            filteredGroups.push(newNum.selectedGroup);
            filteredPasscodes.push(newNum.passcode?.trim() || '');
            filteredCategories.push(newNum.category.trim());
          });
          
          (updateData as any).activationDates = filteredActivationDates;
          (updateData as any).srNumbers = filteredSrNumbers;
          (updateData as any).serviceOrderNumbers = filteredServiceOrderNumbers;
          (updateData as any).activationGroups = filteredGroups;
          (updateData as any).activationPasscodes = filteredPasscodes;
          (updateData as any).activationCategories = filteredCategories;
          
          // If numbers were changed or new numbers added, set lead status to activated_non_verified
          if (hasNumberChanges || hasNewNumbers) {
            updateData.status = 'activated_non_verified';
          }
          
          // Handle SR images for all numbers (including new ones)
          const allSrImagePromises: Promise<{ dataUrl: string; name: string; index: number } | null>[] = [];
          
          // Existing numbers' SR images
          srImageFiles.forEach(async (file, imgIndex) => {
            if (file && !removedPlanIndices.has(imgIndex)) {
              const toDataUrl = (f: File) => new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve((reader.result as string) || '');
                reader.onerror = reject;
                reader.readAsDataURL(f);
              });
              try {
                const dataUrl = await toDataUrl(file);
                allSrImagePromises.push(Promise.resolve({ dataUrl, name: file.name, index: imgIndex }));
              } catch (_) {
                allSrImagePromises.push(Promise.resolve(null));
              }
            } else {
              allSrImagePromises.push(Promise.resolve(null));
            }
          });
          
          // New numbers' SR images
          newNumbers.forEach(async (newNum, newIndex) => {
            if (newNum.srImageFile) {
              const toDataUrl = (f: File) => new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve((reader.result as string) || '');
                reader.onerror = reject;
                reader.readAsDataURL(f);
              });
              try {
                const dataUrl = await toDataUrl(newNum.srImageFile);
                const actualIndex = (lead.plans?.length || 0) - removedPlanIndices.size + newIndex;
                allSrImagePromises.push(Promise.resolve({ dataUrl, name: newNum.srImageFile.name, index: actualIndex }));
              } catch (_) {
                allSrImagePromises.push(Promise.resolve(null));
              }
            } else {
              allSrImagePromises.push(Promise.resolve(null));
            }
          });
          
          const srImageResults = await Promise.all(allSrImagePromises);
          const srImages = srImageResults.filter((r): r is { dataUrl: string; name: string; index: number } => r !== null);
          if (srImages.length > 0) {
            (updateData as any).srImages = srImages.map(img => ({
              dataUrl: img.dataUrl,
              name: img.name,
              numberIndex: img.index
            }));
          }
          
          // For backward compatibility, also set first number's data
          (updateData as any).activationDate = activationDates[0] ? new Date(activationDates[0]) : null;
          (updateData as any).srNumber = srNumbers[0]?.trim() || '';
          (updateData as any).serviceOrderNumber = serviceOrderNumbers[0]?.trim() || '';
        } else {
          // Single number - use existing logic
          (updateData as any).activationDate = new Date(activationDate);
          (updateData as any).srNumber = srNumber.trim();
          (updateData as any).serviceOrderNumber = serviceOrderNumber.trim();
          
          // Update existing plan with new number/plan if changed
          if (selectedGroup) {
            const currentPlans = Array.isArray(lead.plans) ? lead.plans : [];
            (updateData as any).plans = currentPlans.map((p: any, index: number) => {
              // Update first plan with potentially new number and plan
              if (index === 0) {
                return {
              ...p,
                  number: editableNumber,
                  numberId: editableNumberId,
                  plan: editablePlan,
                  category: editableCategory,
              group: selectedGroup
                };
              }
              return {
                ...p,
                group: selectedGroup
              };
            });
          }
          
          if (editablePasscode) (updateData as any).activationPasscode = editablePasscode.trim();
          if (editableCategory) (updateData as any).activationCategory = editableCategory.trim();
          
          // If number or plan changed, store metadata
          if (hasChanges) {
            (updateData as any).changesAtActivation = {
              numberChanged,
              planChanged,
              originalNumber: numberChanged ? originalNumber : null,
              originalPlan: planChanged ? originalPlan : null,
              newNumber: numberChanged ? editableNumber : null,
              newPlan: planChanged ? editablePlan : null,
              changedAt: new Date(),
              changedBy: user!.id
            };
          }
          
          if (srImageFile) {
            const toDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve((reader.result as string) || '');
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            try {
              const dataUrl = await toDataUrl(srImageFile);
              (updateData as any).srImageDataUrl = dataUrl;
              (updateData as any).srImageName = srImageFile.name;
            } catch (_) {}
          }
        }
      }
      
      // When marking as follow_up or later, reset managerAssigned to false so manager can see it in unassigned section
      if (coordinatorAction === 'followup' || coordinatorAction === 'later') {
        updateData.managerAssigned = false;
      }
      
      // When marking as later, store the scheduled date
      if (coordinatorAction === 'later' && scheduledForDate) {
        updateData.scheduledFor = new Date(scheduledForDate);
      }

      await updateDoc(leadRef, updateData);
      
      // Fetch the updated lead to ensure we have the latest status for notifications
      const updatedLeadDoc = await getDoc(leadRef);
      const updatedLead = updatedLeadDoc.exists() 
        ? { id: updatedLeadDoc.id, ...updatedLeadDoc.data() } as Lead
        : { ...lead, ...updateData } as Lead; // Use new status if fetch fails
      
      // Log coordinator action (non-blocking - fire and forget)
      const action: 'assigned' | 'activated' | 'reassigned' | 'rejected' | 'status_changed' = 
        coordinatorAction === 'assign' ? 'assigned' :
        coordinatorAction === 'activate' || coordinatorAction === 'activate_non_verified' ? 'activated' :
        coordinatorAction === 'reassign' ? 'reassigned' :
        coordinatorAction === 'reject' ? 'rejected' :
        'status_changed';
      
      logLeadAction(
        lead.id,
        lead.leadNumber || lead.id,
        action,
        { status: lead.status },
        { status: updateData.status, coordinatorId: user?.id, coordinatorNotes: coordinatorNote },
        coordinatorNote || `Coordinator ${user?.name || 'Unknown'} performed ${coordinatorAction}`
      ).catch(error => {
        console.error('Error logging coordinator action:', error);
      });

      // Handle number pool updates for multiple numbers activation
      const plansCountForUpdate = lead.plans?.length || 0;
      if (isActivationAction && plansCountForUpdate > 1) {
        const currentPlans = Array.isArray(lead.plans) ? lead.plans : [];
        const numberPoolUpdates: Promise<void>[] = [];
        
        currentPlans.forEach(async (p: any, index: number) => {
          // Skip removed plans (they were already handled in handleRemoveNumber)
          if (removedPlanIndices.has(index)) {
            return;
          }
          
          const originalPlan = currentPlans[index];
          const newNumberId = editableNumberIds[index];
          const newNumber = editableNumbers[index];
          const oldNumberId = originalPlan?.numberId;
          const oldNumber = originalNumbers[index] || originalPlan?.number;
          
          // Check if number changed
          if (newNumberId && newNumberId !== oldNumberId && !newNumberId.startsWith('virtual-')) {
            // Release the old number if it exists and is not virtual
            if (oldNumberId && !oldNumberId.startsWith('virtual-')) {
              const oldNumberRef = doc(db, 'numberPool', oldNumberId);
              const oldNumberDoc = await getDoc(oldNumberRef);
              if (oldNumberDoc.exists()) {
                numberPoolUpdates.push(
                  updateDoc(oldNumberRef, {
                    status: 'open',
                    lastStatusChange: new Date(),
                    leadId: null,
                    reservedBy: null,
                    reservedAt: null,
                    claimingAgentId: null,
                    claimingStartedAt: null,
                    claimingExpiresAt: null,
                    claimQueue: []
                  }).then(() =>
                    logNumberAction(
                      oldNumberId,
                      oldNumber || '',
                      'status_changed',
                      { status: oldNumberDoc.data()?.status, leadId: lead.id },
                      { status: 'open', leadId: null },
                      `Number released - Coordinator ${user?.name || 'Unknown'} changed to ${newNumber} during activation`
                    )
                  )
                );
              }
            }
            
            // Activate the new number - always set to activated_non_verified when number is changed
            if (newNumberId && !newNumberId.startsWith('virtual-')) {
              const newNumberRef = doc(db, 'numberPool', newNumberId);
              const newNumberDoc = await getDoc(newNumberRef);
              if (newNumberDoc.exists()) {
                // When number is changed, always set to activated_non_verified
                numberPoolUpdates.push(
                  updateDoc(newNumberRef, {
                    status: 'activated_non_verified',
                    lastStatusChange: new Date(),
                    leadId: lead.id,
                    ...(selectedGroups[index] ? { group: selectedGroups[index] } : {})
                  }).then(() =>
                    logNumberAction(
                      newNumberId,
                      newNumber || '',
                      'status_changed',
                      { status: newNumberDoc.data()?.status },
                      { status: 'activated_non_verified', leadId: lead.id },
                      `Coordinator ${user?.name || 'Unknown'} activated with number change`
                    )
                  )
                );
              }
            }
          } else if (oldNumberId && !oldNumberId.startsWith('virtual-')) {
            // Number didn't change, just update status to activated
            const numberRef = doc(db, 'numberPool', oldNumberId);
            const numberDoc = await getDoc(numberRef);
            if (numberDoc.exists()) {
              const finalStatus = coordinatorAction === 'activate_non_verified'
                ? 'activated_non_verified'
                : 'activated';
              numberPoolUpdates.push(
                updateDoc(numberRef, {
                  status: finalStatus,
                  lastStatusChange: new Date(),
                  leadId: lead.id,
                  ...(selectedGroups[index] ? { group: selectedGroups[index] } : {})
                }).then(() =>
                  logNumberAction(
                    oldNumberId,
                    oldNumber || '',
                    'status_changed',
                    { status: numberDoc.data()?.status },
                    { status: finalStatus, leadId: lead.id },
                    `Coordinator ${user?.name || 'Unknown'} activated number`
                  )
                )
              );
            }
          }
        });
        
        // Handle new numbers - activate them (always set to activated_non_verified)
        newNumbers.forEach(async (newNum) => {
          if (newNum.numberId && !newNum.numberId.startsWith('virtual-')) {
            const numberRef = doc(db, 'numberPool', newNum.numberId);
            const numberDoc = await getDoc(numberRef);
            if (numberDoc.exists()) {
              // New numbers are always set to activated_non_verified
              numberPoolUpdates.push(
                updateDoc(numberRef, {
                  status: 'activated_non_verified',
                  lastStatusChange: new Date(),
                  leadId: lead.id,
                  ...(newNum.selectedGroup ? { group: newNum.selectedGroup } : {})
                }).then(() =>
                  logNumberAction(
                    newNum.numberId,
                    newNum.number,
                    'status_changed',
                    { status: numberDoc.data()?.status },
                    { status: 'activated_non_verified', leadId: lead.id },
                    `Coordinator ${user?.name || 'Unknown'} added and activated new number`
                  )
                )
              );
            }
          }
        });
        
        // Wait for all number pool updates to complete
        await Promise.all(numberPoolUpdates);
      } else if (isActivationAction && numberChanged) {
      // Handle number pool updates for activation with number change (single number)
        // Release the old number (set back to available/open)
        const oldNumberId = lead.plans?.[0]?.numberId;
        if (oldNumberId && !oldNumberId.startsWith('virtual-')) {
          const oldNumberRef = doc(db, 'numberPool', oldNumberId);
          const oldNumberDoc = await getDoc(oldNumberRef);
          if (oldNumberDoc.exists()) {
            await updateDoc(oldNumberRef, {
              status: 'open',
              lastStatusChange: new Date(),
              leadId: null,
              reservedBy: null,
              reservedAt: null
            });
            
            await logNumberAction(
              oldNumberId,
              originalNumber,
              'status_changed',
              { status: oldNumberDoc.data()?.status, leadId: lead.id },
              { status: 'open', leadId: null },
              `Number released - Coordinator ${user?.name || 'Unknown'} changed to ${editableNumber} during activation`
            );
          }
        }
        
        // Update the new number - when number is changed, always set to activated_non_verified
        if (editableNumberId && !editableNumberId.startsWith('virtual-')) {
          const newNumberRef = doc(db, 'numberPool', editableNumberId);
          const newNumberDoc = await getDoc(newNumberRef);
          if (newNumberDoc.exists()) {
            // When number is changed, always set to activated_non_verified
            await updateDoc(newNumberRef, {
              status: 'activated_non_verified',
              lastStatusChange: new Date(),
              leadId: lead.id,
              ...(selectedGroup ? { group: selectedGroup } : {})
            });
            
            await logNumberAction(
              editableNumberId,
              editableNumber,
              'status_changed',
              { status: newNumberDoc.data()?.status },
              { status: 'activated_non_verified', leadId: lead.id },
              `Coordinator ${user?.name || 'Unknown'} activated with number change`
            );
          }
        }
        
        // Update lead status to activated_non_verified when number is changed
        if (numberChanged) {
          updateData.status = 'activated_non_verified';
        }
      } else if (coordinatorAction === 'reject') {
        // Reject flow - Handle different rejection reasons
        if (lead.plans && lead.plans.length > 0) {
          const realPlans = lead.plans.filter(p => !p.numberId?.startsWith('virtual-'));
          const updatePromises = realPlans.map(async (plan) => {
            const numberRef = doc(db, 'numberPool', plan.numberId);
            const numberDoc = await getDoc(numberRef);
            if (!numberDoc.exists()) {
              return;
            }
            const numberData = numberDoc.data();

            if (rejectionReason === 'number_already_active') {
              // Set number status to 'activated'
              await updateDoc(numberRef, {
                status: 'activated',
                lastStatusChange: new Date(),
                leadId: null,
                reservedBy: null,
                reservedAt: null,
                claimingAgentId: null,
                claimingStartedAt: null,
                claimingExpiresAt: null,
                claimQueue: []
              });

              await logNumberAction(
                plan.numberId,
                plan.number || '',
                'status_changed',
                { status: numberData?.status },
                { status: 'activated', leadId: null },
                `Coordinator ${user?.name || 'Unknown'} rejected lead (Number Already Active), set number to activated`
              );
            } else if (rejectionReason === 'number_return') {
              // Delete number from numberPool and add to deletedNumbers with status 'returned'
              const batch = writeBatch(db);
              
              // Create document in deletedNumbers collection with status "returned"
              const deletedNumberRef = doc(db, 'deletedNumbers', plan.numberId);
              batch.set(deletedNumberRef, {
                ...numberData,
                status: 'returned',
                deletedAt: serverTimestamp(),
                originalId: plan.numberId,
                originalCollection: 'numberPool'
              });
              
              // Delete from numberPool
              batch.delete(numberRef);
              
              await batch.commit();

              await logNumberAction(
                plan.numberId,
                plan.number || '',
                'status_changed',
                { status: numberData?.status, leadId: lead.id },
                { status: 'returned', leadId: null },
                `Coordinator ${user?.name || 'Unknown'} rejected lead (Number Return), deleted number and moved to deletedNumbers`
              );
            } else {
              // Default reject (billing_issue, cap_limit, not_answer, etc.): same as agent self-reject
              // If the number has strikes (pending claims), reserve for the first striker; otherwise set to open.
              const claims = numberData?.claims || [];
              const pendingClaims = claims.filter((claim: any) => claim.status === 'pending');

              if (pendingClaims.length > 0) {
                // Sort by claimedAt ascending - first striker gets the number (same as agent reject)
                const sortedClaims = [...pendingClaims].sort((a: any, b: any) => {
                  const aTime = a.claimedAt?.toDate?.() || new Date(a.claimedAt || 0);
                  const bTime = b.claimedAt?.toDate?.() || new Date(b.claimedAt || 0);
                  return aTime.getTime() - bTime.getTime();
                });
                const reservedByAgentId = sortedClaims[0].userId;
                const updatedClaims = claims.map((claim: any) =>
                  claim.userId === reservedByAgentId && claim.status === 'pending'
                    ? { ...claim, status: 'completed' }
                    : claim
                );
                await updateDoc(numberRef, {
                  status: 'reserved',
                  reservedBy: reservedByAgentId,
                  reservedAt: serverTimestamp(),
                  lastStatusChange: serverTimestamp(),
                  leadId: null,
                  claimingAgentId: null,
                  claimingStartedAt: null,
                  claimingExpiresAt: null,
                  claimQueue: [],
                  claims: updatedClaims
                });
                await logNumberAction(
                  plan.numberId,
                  plan.number || '',
                  'reserved',
                  { status: numberData?.status, reservedBy: numberData?.reservedBy },
                  { status: 'reserved', reservedBy: reservedByAgentId },
                  `Coordinator/Admin ${user?.name || 'Unknown'} rejected lead, number reserved for first striker (${reservedByAgentId})`
                );
              } else {
                // No strikes: set number to open (same as previous default)
                await updateDoc(numberRef, {
                  status: 'open',
                  lastStatusChange: new Date(),
                  leadId: null,
                  reservedBy: null,
                  reservedAt: null,
                  claimingAgentId: null,
                  claimingStartedAt: null,
                  claimingExpiresAt: null,
                  claimQueue: []
                });
                const reasonText = rejectionReason === 'billing_issue' ? 'Billing issue' :
                                  rejectionReason === 'cap_limit' ? 'Cap Limit' :
                                  rejectionReason === 'not_answer' ? 'Not Answer' : 'Unknown';
                await logNumberAction(
                  plan.numberId,
                  plan.number || '',
                  'status_changed',
                  { status: numberData?.status },
                  { status: 'open', leadId: null },
                  `Coordinator ${user?.name || 'Unknown'} rejected lead (${reasonText}), set number to open`
                );
              }
            }
          });
          
          await Promise.all(updatePromises);
        }
      } else {
        // Normal flow - Update all numbers in the lead's plans (skip virtual entries like virtual-mnp)
        // Only update numberPool status when a new status is defined
        if (lead.plans && lead.plans.length > 0 && updateData.status) {
          const realPlans = lead.plans.filter(p => !p.numberId?.startsWith('virtual-'));
          const updatePromises = realPlans.map(async (plan) => {
            const numberRef = doc(db, 'numberPool', plan.numberId);
            const numberDoc = await getDoc(numberRef);
            if (!numberDoc.exists()) {
              return;
            }
            const numberData = numberDoc.data();
            await updateDoc(numberRef, {
              status: updateData.status,
              lastStatusChange: new Date(),
              leadId: lead.id,
              ...(selectedGroup ? { group: selectedGroup } : {})
            });

            await logNumberAction(
              plan.numberId,
              plan.number || '',
              'status_changed',
              { status: numberData?.status },
              { status: updateData.status, leadId: lead.id },
              `Coordinator ${user?.name || 'Unknown'} performed ${coordinatorAction}`
            );
          });
          
          await Promise.all(updatePromises);
        }
      }

      // Send notifications
      const notificationPromises = [];

      // Notify agent
      notificationPromises.push(
        addDoc(collection(db, 'notifications'), {
          userId: lead.agentId,
          type: 'lead_update',
          title: coordinatorAction === 'assign' ? 'Lead Assigned' : 
                 coordinatorAction === 'activate' ? (hasChanges ? 'Lead Activated - Pending Verification' : 'Lead Activated') :
                 coordinatorAction === 'activate_non_verified' ? 'Lead Activated - Pending Verification' :
                 coordinatorAction === 'reverification' ? 'Lead Sent for Reverification' :
                 coordinatorAction === 'later' ? 'Lead Marked for Later' : 
                 coordinatorAction === 'reject' ? 'Lead Rejected' :
                 coordinatorAction === 'reassign' ? 'Lead Reassigned' : 'Lead Marked for Follow-up',
          message: coordinatorAction === 'assign' ? 
            'Your lead has been assigned by the coordinator' : 
            coordinatorAction === 'activate' ?
            (hasChanges ? 
              `Your lead has been activated with changes (${numberChanged ? 'number' : ''}${numberChanged && planChanged ? ' and ' : ''}${planChanged ? 'plan' : ''}) - pending verifier approval` :
              'Your lead has been activated by the coordinator') :
            coordinatorAction === 'activate_non_verified' ?
              'Your lead has been activated - pending verifier approval' :
            coordinatorAction === 'reverification' ?
            'Your lead has been sent for reverification by the coordinator' :
            coordinatorAction === 'later' ?
            'Your lead has been marked for later by the coordinator' :
            coordinatorAction === 'reject' ?
            'Your lead has been rejected by the coordinator' :
            coordinatorAction === 'reassign' ?
            'Your lead Etisalat ID / routing details have been updated by the coordinator' :
            'Your lead has been marked for follow-up by the coordinator',
          read: false,
          createdAt: new Date(),
          data: {
            leadId: lead.id
          }
        })
      );

      // Notify manager if exists
      if (lead.managerId) {
        notificationPromises.push(
          addDoc(collection(db, 'notifications'), {
            userId: lead.managerId,
            type: 'lead_update',
            title: coordinatorAction === 'assign' ? 'Lead Assigned' : 
                   coordinatorAction === 'activate' ? 'Lead Activated' : 
                   coordinatorAction === 'activate_non_verified' ? 'Lead Activated - Pending Verification' :
                   coordinatorAction === 'reverification' ? 'Lead Sent for Reverification' :
                   coordinatorAction === 'later' ? 'Lead Marked for Later' : 
                   coordinatorAction === 'reject' ? 'Lead Rejected' : 'Lead Marked for Follow-up',
            message: coordinatorAction === 'assign' ? 
              'A lead has been assigned by the coordinator' : 
              coordinatorAction === 'activate' ?
                'A lead has been activated by the coordinator' :
                coordinatorAction === 'activate_non_verified' ?
                'A lead has been activated and is pending verifier approval' :
              coordinatorAction === 'reverification' ?
              'A lead has been sent back for reverification by the coordinator' :
              coordinatorAction === 'later' ?
              'A lead has been marked for later by the coordinator' :
              coordinatorAction === 'reject' ?
              'A lead has been rejected by the coordinator' :
              'A lead has been marked for follow-up by the coordinator',
            read: false,
            createdAt: new Date(),
            data: {
              leadId: lead.id
            }
          })
        );
      }

      // Run notifications in background (non-blocking)
      Promise.all(notificationPromises).catch(error => {
        console.error('Error in notification operations:', error);
      });

      // Prepare non-blocking operations for chat messages and WhatsApp
      const nonBlockingOperations: Promise<void>[] = [];

      // For assignment, show formatted message instead of navigating away
      // Add coordinator note as a chat message if it exists (non-blocking)
      if (coordinatorNote && coordinatorNote.trim() !== '') {
        nonBlockingOperations.push(
          addDoc(collection(db, 'chatMessages'), {
            leadId: lead.id,
            userId: user?.id || '',
            userRole: user?.role || 'coordinator',
            message: coordinatorNote.trim(),
            createdAt: new Date()
          }).then(async () => {
            // Send WhatsApp notification to manager after message is added to chat (non-blocking)
            // Use updatedLead to ensure we have the latest status
          const { sendChatMessageWhatsAppNotification } = await import('../../utils/chatNotifications');
            await sendChatMessageWhatsAppNotification(updatedLead, coordinatorNote.trim(), user?.name || 'Unknown');
          }).catch(error => {
            console.error('Error creating coordinator chat message:', error);
          })
        );
      }

      // Run non-blocking operations in background (don't await)
      Promise.all(nonBlockingOperations).catch(error => {
        console.error('Error in non-blocking operations:', error);
      });

      if (coordinatorAction === 'assign' || coordinatorAction === 'reassign') {
        const plansCount = lead.plans?.length || 0;
        const etisalatIdsForMessage = plansCount > 1 && etisalatLeadIds.length > 0 
          ? etisalatLeadIds 
          : etisalatLeadId;
        const message = await generateAssignmentMessage(lead, etisalatIdsForMessage, selectedEmirate);
        setAssignmentMessage(message);
        setShowAssignmentMessage(true);
        setShowCoordinatorDialog(false);
        setCoordinatorNote('');
        setCoordinatorAction(null);
        toast.success(coordinatorAction === 'assign' ? 'Lead assigned successfully' : 'Lead reassigned successfully');
      } else {
        toast.success(
          coordinatorAction === 'activate'
            ? 'Lead activated successfully'
            : coordinatorAction === 'activate_non_verified'
            ? 'Lead activated (pending verification)'
            : coordinatorAction === 'reverification'
            ? 'Lead sent for reverification'
            : coordinatorAction === 'later'
            ? 'Lead marked for later'
            : coordinatorAction === 'reject'
            ? 'Lead rejected successfully'
            : 'Lead marked for follow-up'
        );
        setShowCoordinatorDialog(false);
        setCoordinatorNote('');
        setScheduledForDate('');
      setRejectionReason('');
        setCoordinatorAction(null);
        navigate('/dashboard/leads');
      }
    } catch (error) {
      console.error('Error updating lead:', error);
      toast.error('Failed to update lead');
    } finally {
      setIsCoordinatorActionProcessing(false);
    }
  };

  const handleSplitComplete = async () => {
    // Refresh the lead data by navigating back and forth
    navigate(-1);
    navigate(`/leads/${lead.id}`);
  };

  // Handler for Edit & Resubmit - validates numbers before opening edit modal
  const handleEditWithValidation = async () => {
    if (!user) return;
    
    setIsValidatingEdit(true);
    try {
      // Check if user can edit/resubmit this lead
      const canEditResubmit = 
        (user.role === 'agent' && user.id === lead.agentId && (lead.status === 'non_verified' || lead.status === 'follow_verification')) ||
        (isManager() && user.managedTeams && user.managedTeams.includes(lead.teamId || '') && (lead.status === 'non_verified' || lead.status === 'follow_verification'));

      if (!canEditResubmit) {
        // If not edit/resubmit scenario, just open edit modal directly
        onEdit();
        return;
      }

      // Get all numbers attached to this lead
      const plans = (lead.plans || []).filter((p: any) => p?.numberId && !p.numberId.startsWith('virtual-'));
      
      if (plans.length === 0) {
        // No numbers to validate, proceed with edit
        onEdit();
        return;
      }

      // Validate that all numbers are either open or reserved by this agent
      const numberChecks = await Promise.all(
        plans.map(async (p: any) => {
          try {
            const numberRef = doc(db, 'numberPool', p.numberId);
            const numberDoc = await getDoc(numberRef);
            if (!numberDoc.exists()) {
              return { numberId: p.numberId, valid: false, reason: 'Number not found', number: p.number || p.numberId };
            }
            const numberData = numberDoc.data();
            const numberStatus = numberData?.status;
            const reservedBy = numberData?.reservedBy;
            const numberLeadId = numberData?.leadId;
            
            // Number is valid only if: open, OR reserved by this agent, OR attached to this lead with resubmittable status (non_verified/follow_verification)
            const isOpen = numberStatus === 'open';
            const isReservedByAgent = numberStatus === 'reserved' && (reservedBy === user.id || reservedBy === lead.agentId);
            const isOnThisLeadResubmittable = numberLeadId === lead.id && ['non_verified', 'follow_verification'].includes(numberStatus);
            const isValid = isOpen || isReservedByAgent || isOnThisLeadResubmittable;
            
            if (!isValid) {
              const reason = numberStatus === 'reserved' 
                ? 'Number is reserved by another agent'
                : numberStatus === 'follow_up' || numberStatus === 'verified' || numberStatus === 'assigned' || numberStatus === 'activated'
                ? `Number is in use (status: ${numberStatus}). It must be open or reserved by you to resubmit.`
                : `Number status is ${numberStatus}`;
              return { numberId: p.numberId, valid: false, reason, number: numberData?.number || p.number || p.numberId };
            }
            
            return { numberId: p.numberId, valid: true };
          } catch (error) {
            console.error(`Error checking number ${p.numberId}:`, error);
            return { numberId: p.numberId, valid: false, reason: 'Error checking number status', number: p.number || p.numberId };
          }
        })
      );
      
      // Check if any numbers are invalid
      const invalidNumbers = numberChecks.filter((check: any) => !check.valid);
      if (invalidNumbers.length > 0) {
        const invalidNumber = invalidNumbers[0];
        const numberDisplay = invalidNumber.number || invalidNumber.numberId || 'Unknown';
        setEditError({
          reason: invalidNumber.reason || 'Number not available',
          number: numberDisplay || 'Unknown'
        });
        return;
      }
      
      // All numbers are valid, proceed with edit
      onEdit();
    } catch (error) {
      console.error('Error validating numbers for edit:', error);
      toast.error('Error validating numbers. Please try again.');
    } finally {
      setIsValidatingEdit(false);
    }
  };

  // Handler for agent self-reject
  const handleAgentReject = async () => {
    if (!user || user.id !== lead.agentId) return;
    setRejecting(true);
    try {
      const leadRef = doc(db, 'leads', lead.id);
      await updateDoc(leadRef, {
        status: 'rejected',
        updatedAt: new Date(),
        rejectionReason: 'Rejected by agent',
      });
      let hasStrikeReservations = false;
      if (lead.plans && lead.plans.length > 0) {
        const reserveResults = await Promise.all(
          lead.plans.filter(p => p.numberId && !p.numberId.startsWith('virtual-')).map(async plan => {
          const numberRef = doc(db, 'numberPool', plan.numberId);
            
            // First, read the current number data
            const numberDoc = await getDoc(numberRef);
            
            if (!numberDoc.exists()) {
              // Number doesn't exist, default to rejecting agent
              const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          await updateDoc(numberRef, {
            status: 'reserved',
            reservedBy: user.id,
            reservedAt: serverTimestamp(),
            expiresAt,
            lastStatusChange: serverTimestamp(),
            claimingAgentId: null,
            claimingStartedAt: null,
            claimingExpiresAt: null,
            claimQueue: [],
                leadId: null
              });
              return false;
            }
            
            const numberData = numberDoc.data();
            const claims = numberData?.claims || [];
            
            // Find pending claims (strikes) from other agents - reserve for FIRST striker (same as auto-reject)
            const pendingClaims = claims.filter((claim: any) => 
              claim.status === 'pending' && claim.userId !== user.id
            );
            
            let reservedByAgentId = user.id; // Default to rejecting agent
            let hasStrike = false;
            let updatedClaims = claims;
            
            if (pendingClaims.length > 0) {
              // Sort by claimedAt ascending (earliest first) - first striker gets the number, like auto-reject
              const sortedClaims = [...pendingClaims].sort((a: any, b: any) => {
                const aTime = a.claimedAt?.toDate?.() || new Date(a.claimedAt || 0);
                const bTime = b.claimedAt?.toDate?.() || new Date(b.claimedAt || 0);
                return aTime.getTime() - bTime.getTime();
              });
              
              // Reserve for the first agent who struck (not the last)
              reservedByAgentId = sortedClaims[0].userId;
              hasStrike = true;
              
              // Update the claim status from 'pending' to 'completed' for the strike agent
              updatedClaims = claims.map((claim: any) => {
                if (claim.userId === reservedByAgentId && claim.status === 'pending') {
                  return { ...claim, status: 'completed' };
                }
                return claim;
              });
            }
            
            // Set expiresAt so reservation expiry doesn't immediately release the number.
            // (If we don't set it, an old expiresAt from the document can be in the past and
            // the reservation-expiry trigger will release the number, allowing another agent to reserve it.)
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            // Update number with reservation - IMPORTANT: set status to 'reserved', not 'open'
            const updateData: any = {
              status: 'reserved', // Must be 'reserved', not 'open'
              reservedBy: reservedByAgentId,
              reservedAt: serverTimestamp(),
              expiresAt,
              lastStatusChange: serverTimestamp(),
              claimingAgentId: null,
              claimingStartedAt: null,
              claimingExpiresAt: null,
              claimQueue: [],
              claims: updatedClaims
            };
            
            // Only clear leadId if number is being reserved for strike agent
            // If reserved for rejecting agent, keep leadId to track association
            if (hasStrike) {
              updateData.leadId = null; // Clear leadId when reserved for strike agent
            } else {
              updateData.leadId = lead.id; // Keep leadId when reserved for rejecting agent
            }
            
            await updateDoc(numberRef, updateData);
            
            // Log the number action for audit trail
            try {
              await logNumberAction(
                plan.numberId,
                plan.number || plan.numberId,
                'reserved',
                { status: numberData?.status, reservedBy: numberData?.reservedBy },
                { status: 'reserved', reservedBy: reservedByAgentId },
                hasStrike 
                  ? `Number reserved for strike agent ${reservedByAgentId} after lead rejection`
                  : `Number reserved for rejecting agent ${reservedByAgentId} after lead rejection`
              );
            } catch (logError) {
              console.error('Error logging number action:', logError);
      }
            
            return hasStrike;
          })
        );
        
        // Check if any numbers were reserved for strike agents
        hasStrikeReservations = reserveResults.some(result => result === true);
      }
      
      // Add chat message indicating who rejected the lead
      try {
        await addDoc(collection(db, 'chatMessages'), {
          leadId: lead.id,
          userId: user.id,
          userRole: user.role,
          message: `Lead rejected by ${user.name || user.email || 'agent'}`,
          createdAt: serverTimestamp(),
          readBy: [user.id]
        });
      } catch (chatError) {
        console.error('Error adding rejection chat message:', chatError);
        // Don't fail the rejection if chat message fails
      }
      
      if (hasStrikeReservations) {
        toast.success('Lead rejected. Number(s) reserved for agent(s) who struck the number.');
      } else {
      toast.success('Lead rejected and number(s) reserved for you.');
      }
      setLocalStatus('rejected');
      setShowRejectDialog(false);
    } catch (error) {
      console.error('Error rejecting lead:', error);
      toast.error('Failed to reject lead.');
    } finally {
      setRejecting(false);
    }
  };

  const watermarkText = getStatusWatermarkText(lead.status);
  const watermarkGradient = getStatusGradient(lead.status);

  return (
    <div className="relative min-h-screen">
      {/* Full-page watermark overlay - on top of all layers */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 flex items-center justify-center z-[9999] select-none"
        style={{ opacity: 0.25 }}
      >
        <div className={`text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-br ${watermarkGradient}`}>
          {watermarkText}
        </div>
      </div>

      <div className="space-y-4 sm:space-y-6 relative z-0">
      {/* Restored header and action bar */}
      <div className="px-2 sm:px-0 py-2 border-b border-gray-200 flex flex-col sm:flex-row sm:justify-end sm:items-center gap-4">
        <div className="flex flex-wrap gap-2 sm:gap-3 justify-end">
          {(canManagerAssign || canAgentAssignToCoordinator) && (
            <button
              onClick={() => setShowManagerAssignDialog(true)}
              className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            >
              <CheckCircleIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              Assign to Coordinator
            </button>
          )}
          {isUserCoordinator && (
            <>
              {(lead.status === 'verified') || 
               (lead.status === 'follow_up' && lead.managerAssigned === true) ||
               (lead.status === 'assigned_to_cord') ? (
                <>
                  <button
                    onClick={() => {
                      // Prefill Etisalat Lead ID and Emirates if they exist
                      if (lead.etisalatLeadId) {
                        setEtisalatLeadId(lead.etisalatLeadId);
                      }
                      if (lead.emirate) {
                        setSelectedEmirate(lead.emirate);
                      }
                      setCoordinatorAction('assign');
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    <CheckCircleIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Assign
                  </button>
                  <button
                    onClick={() => {
                      setCoordinatorAction('followup');
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                  >
                    <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Follow-up
                  </button>
                  <button
                    onClick={() => {
                      setCoordinatorAction('reverification');
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Send for Reverification
                  </button>
                  <button
                    onClick={() => {
                      setCoordinatorAction('later');
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-yellow-500 hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                  >
                    <Clock className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Later
                  </button>
                  <button
                    onClick={() => {
                      setCoordinatorAction('reject');
                      setRejectionReason(''); // Reset rejection reason when opening dialog
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    <XCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Reject
                  </button>
                </>
              ) : null}
              {lead.status === 'assigned' && (
                <>
                  {/* Hide Activate button if pendingVerificationAtLocation is true */}
                  {!((lead as any).pendingVerificationAtLocation === true || (lead as any).pendingVerificationAtLocation === 'true') && (
                  <button
                    onClick={() => {
                      setCoordinatorAction('activate');
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    <CheckCircleIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Activate
                  </button>
                  )}
                  <button
                    onClick={() => {
                      setCoordinatorAction('activate_non_verified');
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
                  >
                    <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Activate (Pending Verification)
                  </button>
                  <button
                    onClick={() => {
                      setCoordinatorAction('followup');
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                  >
                    <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Follow-up
                  </button>
                  <button
                    onClick={() => {
                      setCoordinatorAction('later');
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-yellow-500 hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                  >
                    <Clock className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Later
                  </button>
                  <button
                    onClick={() => {
                      setCoordinatorAction('reject');
                      setRejectionReason(''); // Reset rejection reason when opening dialog
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    <XCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Reject
                  </button>
                </>
              )}
              {lead.status === 'later' && (
                <>
                  {/* Hide Activate button if pendingVerificationAtLocation is true */}
                  {!((lead as any).pendingVerificationAtLocation === true || (lead as any).pendingVerificationAtLocation === 'true') && (
                  <button
                    onClick={() => {
                      setCoordinatorAction('activate');
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    <CheckCircleIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Activate
                  </button>
                  )}
                  <button
                    onClick={() => {
                      setCoordinatorAction('activate_non_verified');
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
                  >
                    <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Activate (Pending Verification)
                  </button>
                  <button
                    onClick={() => {
                      setCoordinatorAction('followup');
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                  >
                    <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Follow-up
                  </button>
                  <button
                    onClick={() => {
                      setCoordinatorAction('reverification');
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Send for Reverification
                  </button>
                  <button
                    onClick={() => {
                      setCoordinatorAction('reject');
                      setRejectionReason(''); // Reset rejection reason when opening dialog
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    <XCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Reject
                  </button>
                </>
              )}
              {lead.status === 'activated' && (
                <>
                  <div className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-green-600">
                    <CheckCircleIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Lead Activated
                  </div>
                  {isAdmin() && (
                    <button
                      onClick={() => {
                        setCoordinatorAction('activate_non_verified');
                        setShowCoordinatorDialog(true);
                      }}
                      className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500"
                    >
                      <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                      Active Non Verified
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setCoordinatorAction('reject');
                      setRejectionReason(''); // Reset rejection reason when opening dialog
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    <XCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Reject
                  </button>
                </>
              )}
              {/* Follow_up leads without manager assignment show assign button, but if managerAssigned is true, it's already shown above */}
              {lead.status === 'follow_up' && !lead.managerAssigned && (
                <>
                  <button
                    onClick={() => {
                      // Prefill Etisalat Lead ID and Emirates if they exist
                      if (lead.etisalatLeadId) {
                        setEtisalatLeadId(lead.etisalatLeadId);
                      }
                      if (lead.emirate) {
                        setSelectedEmirate(lead.emirate);
                      }
                      setCoordinatorAction('assign');
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    <CheckCircleIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Assign
                  </button>
                  <button
                    onClick={() => {
                      setCoordinatorAction('followup');
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
                  >
                    <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Follow-up
                  </button>
                  <button
                    onClick={() => {
                      setCoordinatorAction('reject');
                      setRejectionReason(''); // Reset rejection reason when opening dialog
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    <XCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Reject
                  </button>
                </>
              )}
              {/* Reassignment option: available for coordinators, but NOT when Assign button is visible, and NOT for activated/rejected leads */}
              {(() => {
                // Check if Assign button is visible
                const isAssignButtonVisible = 
                  (lead.status === 'verified') || 
                  (lead.status === 'follow_up' && lead.managerAssigned === true) ||
                  (lead.status === 'assigned_to_cord') ||
                  (lead.status === 'follow_up' && !lead.managerAssigned);
                
                // Don't show Reassign if Assign is visible, or if lead is activated/rejected
                const shouldShowReassign = !isAssignButtonVisible && 
                                           lead.status !== 'activated' && 
                                           lead.status !== 'rejected';
                
                if (!shouldShowReassign) return null;
                
                return (
                  <button
                    onClick={() => {
                      // Prefill Etisalat Lead ID and Emirates if they exist
                      if (lead.etisalatLeadId) {
                        setEtisalatLeadId(lead.etisalatLeadId);
                      }
                      if (lead.emirate) {
                        setSelectedEmirate(lead.emirate);
                      }
                      setCoordinatorAction('reassign');
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                  >
                    <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Reassign
                  </button>
                );
              })()}
            </>
          )}
          {canVerify && (
            <>
              <button
                onClick={() => {
                  setShowMediaModal(true);
                }}
                className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                <CheckCircleIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                {lead.status === 'non_verified' ? 'Verify Non Verified' : 'Verify'}
              </button>
              <button
                onClick={() => {
                  setShowNonVerifyDialog(true);
                  setNonVerifyNote('Non Verified');
                  setIsVerifyActionProcessing(false); // Reset processing state when opening dialog
                }}
                className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-yellow-600 hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
              >
                <Calendar className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                Non-Verify
              </button>
            </>
          )}
          {canEdit && (
            <button
              onClick={handleEditWithValidation}
              disabled={isValidatingEdit}
              className={`inline-flex items-center px-3 sm:px-4 py-2 border border-transparent text-xs sm:text-sm font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                isValidatingEdit 
                  ? 'bg-indigo-400 cursor-not-allowed' 
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {isValidatingEdit ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                  Validating...
                </>
              ) : (
                <>
              {user?.role === 'agent' &&
              user.id === lead.agentId &&
              (lead.status === 'non_verified' || lead.status === 'follow_verification')
                ? 'Edit & Resubmit'
                : 'Edit Lead'}
                </>
              )}
            </button>
          )}
          {canVerify && (
            <button
              onClick={() => {
                setShowVerifyAtLocationDialog(true);
                setIsVerifyActionProcessing(false); // Reset processing state when opening dialog
              }}
              disabled={isVerifyActionProcessing}
              className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <MapPin className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              Verify at Location
            </button>
          )}
          {((user?.role === 'agent' && user.id === lead.agentId) ||
            (isManager() && user?.managedTeams && user.managedTeams.includes(lead.teamId || ''))) &&
            (lead.status === 'non_verified' || lead.status === 'follow_verification') && (
            <button
              onClick={() => !isResubmitting && onResubmit && onResubmit()}
              disabled={isResubmitting}
              className={`inline-flex items-center px-3 sm:px-4 py-2 border border-transparent text-xs sm:text-sm font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${isResubmitting ? 'bg-yellow-400 cursor-not-allowed' : 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500'}`}
            >
              {isResubmitting ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                  </svg>
                  Resubmitting...
                </>
              ) : (
                'Resubmit Now'
              )}
            </button>
          )}
          {((user?.role === 'agent' && user?.id === lead.agentId) ||
            (isManager() && user?.managedTeams && user.managedTeams.includes(lead.teamId || ''))) &&
            !['pending_verification', 'activated', 'activated_non_verified', 'rejected', 'non_verified'].includes(localStatus) && (
            <button
              onClick={() => setShowRejectDialog(true)}
              disabled={rejecting}
              className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              {rejecting ? 'Rejecting...' : 'Reject My Lead'}
            </button>
          )}
          {user?.id === lead.agentId && localStatus === 'rejected' && (
            <span className="inline-flex items-center px-3 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium text-white bg-red-400 cursor-not-allowed">
              Rejected
            </span>
          )}
          {/* WhatsApp Chat Button for Agents, Coordinators, and Admins */}
          {(() => {
            // Agents can only see chat for their own WhatsApp leads
            if (user?.role === 'agent' && user.id === lead.agentId && (lead as any).verificationMethod === 'whatsapp') {
              return true;
            }
            // Multi-team managers can see chat for WhatsApp leads in their managed teams
            if (isManager() && user?.managedTeams && user.managedTeams.includes(lead.teamId || '') && (lead as any).verificationMethod === 'whatsapp') {
              return true;
            }
            // Coordinators and Admins can see chat for ALL leads (they can initiate WhatsApp anytime)
            if (isCoordinator() || isAdmin()) {
              return true;
            }
            return false;
          })() && (
            <button
              onClick={() => {
                setShowWhatsAppChat(true);
                // Messages are auto-fetched via polling, no need to manually start
              }}
              className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              <MessageCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              WhatsApp Chat
            </button>
          )}
        </div>
      </div>

      {showMediaModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-2 sm:p-3 pt-6 sm:pt-8">
          <div className="bg-white rounded-xl sm:rounded-2xl p-2.5 sm:p-4 w-full max-w-6xl mx-2 sm:mx-3 shadow-2xl max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center space-x-2 sm:space-x-2.5">
                <div className="w-6 h-6 sm:w-7 sm:h-7 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-md flex items-center justify-center">
                  <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900">Verification Checklist</h3>
                  <p className="text-xs text-gray-500">Complete all items to proceed</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowMediaModal(false);
                  const baseChecklist = VERIFY_CHECKLIST.map(() => false);
                  if (showPostpaidCampaignChecklist) {
                    setVerifyChecklist([...baseChecklist, false]);
                  } else {
                    setVerifyChecklist(baseChecklist);
                  }
                }}
                className="text-gray-400 hover:text-gray-500 p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-gray-600">
                Progress: <span className="font-semibold text-indigo-600">{verifyChecklist.filter(Boolean).length}/{verifyChecklist.length}</span>
              </div>
              <button
                type="button"
                onClick={handleSelectAllChecklist}
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors"
              >
                Select all Verification Checklist
              </button>
            </div>

            {/* Progress Bar */}
            <div className="mb-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-600">Progress</span>
                <span className="text-xs font-bold text-indigo-600">
                  {verifyChecklist.filter(Boolean).length}/{verifyChecklist.length}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-1">
                <div 
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 h-1.5 sm:h-1 rounded-full transition-all duration-300"
                  style={{ width: `${(verifyChecklist.filter(Boolean).length / verifyChecklist.length) * 100}%` }}
                ></div>
              </div>
            </div>

            {/* Checklist */}
            <div className="mb-3 sm:mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-2.5">
                {VERIFY_CHECKLIST.map((section, idx) => {
                  const hasLongContent = section.details.length > 2 || section.details.some(item => item.length > 50);
                  const isExpanded = expandedSections[idx];
                  const isAcknowledgementOfTerms = section.header === 'Acknowledgement of Terms';
                  
                  return (
                    <div 
                      key={section.header} 
                      className={`p-2 sm:p-2.5 rounded-lg border transition-all duration-300 active:scale-95 ${
                        verifyChecklist[idx] 
                          ? 'border-green-300 bg-green-50/70 shadow-sm' 
                          : 'border-gray-200 bg-white active:bg-gray-50'
                      }`}
                    >
                      <label className="flex items-start space-x-2 sm:space-x-2.5 cursor-pointer select-none min-h-[44px]">
                        <div className="relative flex-shrink-0 mt-0.5">
                          <input
                            type="checkbox"
                            checked={verifyChecklist[idx]}
                            onChange={e => {
                              const updated = [...verifyChecklist];
                              updated[idx] = e.target.checked;
                              setVerifyChecklist(updated);
                            }}
                            className="sr-only"
                          />
                          <div className={`w-5 h-5 sm:w-5 sm:h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
                            verifyChecklist[idx]
                              ? 'bg-green-500 border-green-500 shadow-sm'
                              : 'bg-white border-gray-300'
                          }`}>
                            {verifyChecklist[idx] && (
                              <Check className="w-4 h-4 sm:w-3 sm:h-3 text-white" />
                            )}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1 sm:mb-1.5">
                            <span className={`font-semibold text-xs sm:text-xs ${
                              verifyChecklist[idx] ? 'text-green-800' : 'text-gray-800'
                            }`}>
                              {section.header}
                            </span>
                            {verifyChecklist[idx] && (
                              <div className="w-2 h-2 sm:w-1.5 sm:h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                            )}
                          </div>
                          
                          <div className={`space-y-0.5 sm:space-y-1 transition-all duration-300 ${
                            hasLongContent && !isExpanded ? 'max-h-10 sm:max-h-12 overflow-hidden' : ''
                          }`}>
                            {section.details.map((item, i) => (
                              <div key={i} className="flex items-start space-x-1 sm:space-x-1.5">
                                <div className={`w-1 h-1 rounded-full mt-1 flex-shrink-0 transition-colors ${
                                  verifyChecklist[idx] ? 'bg-green-500' : 'bg-gray-400'
                                }`}></div>
                                <span className={`text-xs leading-tight ${
                                  verifyChecklist[idx] ? 'text-green-700' : 'text-gray-600'
                                }`}>
                                  {item}
                                </span>
                              </div>
                            ))}
                          </div>
                          
                          {hasLongContent && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const newExpanded = [...expandedSections];
                                newExpanded[idx] = !isExpanded;
                                setExpandedSections(newExpanded);
                              }}
                              className={`mt-1 sm:mt-1.5 text-xs font-medium transition-colors py-1 px-2 rounded ${
                                verifyChecklist[idx] 
                                  ? 'text-green-600 hover:text-green-700 bg-green-50' 
                                  : 'text-indigo-600 hover:text-indigo-700 bg-indigo-50'
                              }`}
                            >
                              {isExpanded ? 'Show Less' : 'Read More'}
                            </button>
                          )}
                        </div>
                      </label>
                    </div>
                  );
                })}
                
                {/* Conditional Postpaid Campaign Checklist Item */}
                {showPostpaidCampaignChecklist && (() => {
                  const campaignIdx = VERIFY_CHECKLIST.length;
                  const hasLongContent = POSTPAID_CAMPAIGN_CHECKLIST.details.length > 2 || 
                    POSTPAID_CAMPAIGN_CHECKLIST.details.some(item => item.length > 50);
                  const isExpanded = expandedSections[campaignIdx] || false;
                  
                  return (
                    <div 
                      key={POSTPAID_CAMPAIGN_CHECKLIST.header} 
                      className={`p-2.5 sm:p-3 rounded-lg border transition-all duration-300 active:scale-95 ${
                        verifyChecklist[campaignIdx] 
                          ? 'border-green-300 bg-green-50/70 shadow-sm' 
                          : 'border-gray-200 bg-white active:bg-gray-50'
                      }`}
                    >
                      <label className="flex items-start space-x-2 sm:space-x-2.5 cursor-pointer select-none min-h-[44px]">
                        <div className="relative flex-shrink-0 mt-0.5">
                          <input
                            type="checkbox"
                            checked={verifyChecklist[campaignIdx] || false}
                            onChange={e => {
                              const updated = [...verifyChecklist];
                              updated[campaignIdx] = e.target.checked;
                              setVerifyChecklist(updated);
                            }}
                            className="sr-only"
                          />
                          <div className={`w-6 h-6 sm:w-5 sm:h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
                            verifyChecklist[campaignIdx]
                              ? 'bg-green-500 border-green-500 shadow-sm'
                              : 'bg-white border-gray-300'
                          }`}>
                            {verifyChecklist[campaignIdx] && (
                              <Check className="w-4 h-4 sm:w-3 sm:h-3 text-white" />
                            )}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1 sm:mb-1.5">
                            <span className={`font-semibold text-xs sm:text-xs ${
                              verifyChecklist[campaignIdx] ? 'text-green-800' : 'text-gray-800'
                            }`}>
                              {POSTPAID_CAMPAIGN_CHECKLIST.header}
                            </span>
                            {verifyChecklist[campaignIdx] && (
                              <div className="w-2 h-2 sm:w-1.5 sm:h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                            )}
                          </div>
                          
                          <div className={`space-y-0.5 sm:space-y-1 transition-all duration-300 ${
                            hasLongContent && !isExpanded ? 'max-h-10 sm:max-h-12 overflow-hidden' : ''
                          }`}>
                            {POSTPAID_CAMPAIGN_CHECKLIST.details.map((item, i) => (
                              <div key={i} className="flex items-start space-x-1 sm:space-x-1.5">
                                <div className={`w-1 h-1 rounded-full mt-1 flex-shrink-0 transition-colors ${
                                  verifyChecklist[campaignIdx] ? 'bg-green-500' : 'bg-gray-400'
                                }`}></div>
                                <span className={`text-xs leading-tight ${
                                  verifyChecklist[campaignIdx] ? 'text-green-700' : 'text-gray-600'
                                }`}>
                                  {item}
                                </span>
                              </div>
                            ))}
                          </div>
                          
                          {hasLongContent && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const newExpanded = [...expandedSections];
                                newExpanded[campaignIdx] = !isExpanded;
                                setExpandedSections(newExpanded);
                              }}
                              className={`mt-1 sm:mt-1.5 text-xs font-medium transition-colors py-1 px-2 rounded ${
                                verifyChecklist[campaignIdx] 
                                  ? 'text-green-600 hover:text-green-700 bg-green-50' 
                                  : 'text-indigo-600 hover:text-indigo-700 bg-indigo-50'
                              }`}
                            >
                              {isExpanded ? 'Show Less' : 'Read More'}
                            </button>
                          )}
                        </div>
                      </label>
                    </div>
                  );
                })()}
                
                {/* Media Upload Card - Positioned next to Acknowledgement of Terms */}
                <div className="p-2.5 sm:p-3 rounded-lg border border-blue-200 bg-blue-50/30">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="w-4 h-4 bg-gradient-to-r from-blue-500 to-cyan-600 rounded flex items-center justify-center">
                      <Paperclip className="w-2 h-2 text-white" />
                    </div>
                    <div>
                      <h4 className="font-medium text-xs text-gray-900">Upload Verification Media</h4>
                      <p className="text-xs text-gray-500">Upload supporting documents</p>
                    </div>
                  </div>
                  
                  {verifyChecklist.every(Boolean) ? (
                    <div className="bg-green-50 border border-green-200 rounded-md p-2">
                      <MediaUpload 
                        leadId={lead.id} 
                        onUploadComplete={(files) => {
                          setVerificationMedia(files.map(file => ({
                            ...file,
                            type: file.type as 'image' | 'video' | 'audio'
                          })));
                          setUploadComplete(true);
                          setUploadInProgress(false);
                          setUploadProgress(100);
                          setShowMediaModal(true);
                          setVerifyAction('verify');
                        }} 
                        onUploadingChange={(uploading) => {
                          setUploadInProgress(uploading);
                          if (uploading) {
                            setUploadComplete(false);
                            setUploadProgress(0);
                          }
                        }}
                        onUploadProgress={(progress) => {
                          setUploadProgress(progress);
                        }}
                      />
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-md p-2">
                      <div className="flex items-center space-x-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-xs font-medium text-amber-800">
                          Complete all checklist items first
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Upload progress & Verification Notes below checklist */}
            <div className="space-y-2.5 mt-3">
              <div className="border border-indigo-100 rounded-xl p-2.5 sm:p-3.5 bg-indigo-50/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-gray-800">Upload Progress</div>
                  <div className="text-xs font-bold text-indigo-700">
                    {uploadComplete ? 'Upload completed' : `${uploadProgress}%`}
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden" aria-label="upload-progress">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${uploadComplete ? 'bg-green-500' : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500'}`}
                    style={{ width: `${uploadComplete ? 100 : uploadProgress}%` }}
                  ></div>
                </div>
                {verificationMedia && verificationMedia.length > 0 && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {verificationMedia.map((media, idx) => {
                      const name =
                        typeof media === 'string'
                          ? media.split('/').pop() || 'File'
                          : media.name || media.url?.split('/').pop() || 'File';
                      return (
                        <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white border border-gray-200 text-gray-700">
                          <Paperclip className="w-3 h-3 text-indigo-500" />
                          {name}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border border-indigo-100 rounded-xl p-2.5 sm:p-3.5 bg-indigo-50/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-gray-900">Verification Notes</div>
                  <div className="text-[11px] font-medium">
                    {uploadInProgress ? (
                      <span className="text-indigo-600">Uploading media...</span>
                    ) : uploadComplete ? (
                      <span className="text-green-600">Media uploaded</span>
                    ) : (
                      <span className="text-amber-600">Upload required</span>
                    )}
                  </div>
                </div>

                <textarea
                  rows={3}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                  value={verificationNote}
                  onChange={(e) => setVerificationNote(e.target.value)}
                  placeholder="Enter any notes about this verification..."
                />

                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setVerifyAction('verify');
                      handleVerificationAction('verify');
                    }}
                    disabled={!uploadComplete || uploadInProgress || isVerifyActionProcessing}
                    className="px-4 py-2 text-sm font-semibold rounded-md text-white bg-green-600 hover:bg-green-700 focus:ring-2 focus:ring-offset-1 focus:ring-green-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isVerifyActionProcessing ? 'Processing...' : 'Verify'}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end mt-3 pt-2 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowMediaModal(false);
                  setVerifyChecklist(VERIFY_CHECKLIST.map(() => false));
                  setExpandedSections(VERIFY_CHECKLIST.map(() => false));
                  setVerificationNote('Verified');
                }}
                className="px-4 sm:px-6 py-2 sm:py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors active:scale-95"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showCoordinatorDialog && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-1 sm:p-4"
             style={{
               paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
               paddingBottom: isActivationDialog ? 'max(2rem, calc(1.5rem + env(safe-area-inset-bottom)))' : 'max(0.5rem, env(safe-area-inset-bottom))',
               zIndex: 999999,
               position: 'fixed'
             }}>
          <div className={`bg-white rounded-xl sm:rounded-2xl shadow-2xl border border-gray-100 max-w-6xl w-full mx-1 sm:mx-4 overflow-hidden flex flex-col ${isActivationDialog ? 'max-h-[85vh] sm:max-h-[88vh]' : 'max-h-[calc(100vh-1rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] sm:max-h-[calc(100vh-2rem)]'}`}
               style={{ zIndex: 1000000 }}>
            {/* Header */}
            <div className={`px-3 py-2.5 sm:px-6 sm:py-4 ${
              coordinatorAction === 'reject' ? 'bg-gradient-to-r from-red-500 to-red-600' :
              'bg-gradient-to-r from-indigo-500 to-purple-600'
            }`}>
              <div className="flex items-center space-x-1.5 sm:space-x-3">
                <div className="p-1 sm:p-2 bg-white/20 rounded-md sm:rounded-lg">
                  {coordinatorAction === 'assign' || coordinatorAction === 'reassign' ? (
                    <User2 className="h-5 w-5 text-white" />
                  ) : isActivationDialog ? (
                    <CheckCircle className="h-5 w-5 text-white" />
                  ) : coordinatorAction === 'reverification' ? (
                    <RefreshCw className="h-5 w-5 text-white" />
                  ) : coordinatorAction === 'later' ? (
                    <Clock className="h-5 w-5 text-white" />
                  ) : coordinatorAction === 'reject' ? (
                    <XCircle className="h-5 w-5 text-white" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-white" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm sm:text-base lg:text-lg font-semibold text-white">
                    {coordinatorAction === 'assign' ? 'Assign Lead' :
                     coordinatorAction === 'reassign' ? 'Reassign Lead' :
                     isActivationDialog ? 'Activate Lead' : 
                     coordinatorAction === 'reverification' ? 'Send for Reverification' :
                     coordinatorAction === 'later' ? 'Mark for Later' : 
                     coordinatorAction === 'reject' ? 'Reject Lead' : 'Mark for Follow-up'}
                  </h3>
                  <p className="text-indigo-100 text-[10px] sm:text-xs lg:text-sm">
                    {coordinatorAction === 'assign' ? 'Assign this lead to Etisalat system' :
                     coordinatorAction === 'reassign' ? 'Update Etisalat Lead ID and assignment details' :
                     isActivationDialog ? 'Complete activation process for this lead' :
                     coordinatorAction === 'reverification' ? 'Send this lead back to verification review' :
                     coordinatorAction === 'later' ? 'Mark this lead for later action' :
                     coordinatorAction === 'reject' ? 'Reject this lead and set number status to open' :
                     'Mark this lead for follow-up action'}
                  </p>
                </div>
              </div>
            </div>

            {/* Form Content */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4 lg:space-y-6">
              {isActivationDialog && (
                <>
                  {lead.plans && lead.plans.length > 1 ? (
                    // Multiple numbers - show separate form for each
                    <div className="space-y-6">
                      {lead.plans.map((plan, index) => {
                        if (removedPlanIndices.has(index)) {
                          return null; // Don't render removed plans
                        }
                        return (
                        <div key={index} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                          <div className="mb-4 pb-3 border-b border-gray-200 flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-gray-700">Number {index + 1} - {editableNumbers[index] || plan.number}</h4>
                            <button
                              type="button"
                              onClick={() => handleRemoveNumber(index)}
                              className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1.5"
                            >
                              <Trash2 className="w-4 h-4" />
                              Remove
                            </button>
                          </div>
                          
                          {/* Number & Plan & Passcode & Category */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                            <div>
                              <label className="block text-sm font-semibold text-gray-900">Number</label>
                              <div className="flex gap-2 mt-1">
                              <input
                                type="text"
                                  className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                  value={editableNumbers[index] || plan.number || ''}
                                readOnly
                              />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newSelectors = [...showNumberSelectors];
                                    newSelectors[index] = !newSelectors[index];
                                    setShowNumberSelectors(newSelectors);
                                  }}
                                  className="px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors"
                                >
                                  {showNumberSelectors[index] ? 'Cancel' : 'Change'}
                                </button>
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-900">Plan</label>
                              <select
                                className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                value={editablePlans[index] || plan.plan || ''}
                                onChange={(e) => handleChangePlan(index, e.target.value)}
                              >
                                <option value="">Select plan</option>
                                {allPlans.map((p) => (
                                  <option key={p.id} value={p.name}>
                                    {p.name} ({p.category})
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-900">Passcode</label>
                              <input
                                type="text"
                                className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                value={editablePasscodes[index] || ''}
                                readOnly
                                placeholder="Passcode from number pool"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-900">Category</label>
                              <input
                                type="text"
                                className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                value={editableCategories[index] || ''}
                                readOnly
                              />
                            </div>
                          </div>
                          
                          {/* Number Selector */}
                          {showNumberSelectors[index] && (
                            <div className="border border-gray-200 rounded-xl p-4 bg-white mb-4">
                              <QuickNumberSelect
                                onSelect={async (numberData) => {
                                  await handleChangeNumber(index, numberData);
                                }}
                                selectedCategory={editableCategories[index] || plan.category || ''}
                                onCategoryChange={(category) => {
                                  const newCategories = [...editableCategories];
                                  newCategories[index] = category;
                                  setEditableCategories(newCategories);
                                }}
                                selectedNumberId={editableNumberIds[index]}
                              />
                            </div>
                          )}

                          {/* Activation Details */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-semibold text-gray-900">Activation Date <span className="text-red-500">*</span></label>
                              <input
                                type="date"
                                className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                value={activationDates[index] || ''}
                                onChange={(e) => {
                                  const newDates = [...activationDates];
                                  newDates[index] = e.target.value;
                                  setActivationDates(newDates);
                                }}
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-900">SR No. <span className="text-red-500">*</span></label>
                              <input
                                type="text"
                                className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                value={srNumbers[index] || ''}
                                onChange={(e) => {
                                  const newSrNumbers = [...srNumbers];
                                  newSrNumbers[index] = e.target.value;
                                  setSrNumbers(newSrNumbers);
                                }}
                                placeholder="Enter SR number"
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-900">Service Order number <span className="text-red-500">*</span></label>
                              <input
                                type="text"
                                className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                value={serviceOrderNumbers[index] || ''}
                                onChange={(e) => {
                                  const newServiceOrderNumbers = [...serviceOrderNumbers];
                                  newServiceOrderNumbers[index] = e.target.value;
                                  setServiceOrderNumbers(newServiceOrderNumbers);
                                }}
                                placeholder="Enter Service Order number"
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-900">Select Activation Group <span className="text-red-500">*</span></label>
                              <select
                                className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                value={selectedGroups[index] || ''}
                                onChange={(e) => {
                                  const newGroups = [...selectedGroups];
                                  newGroups[index] = e.target.value;
                                  setSelectedGroups(newGroups);
                                }}
                                required
                              >
                                <option value="">Select group</option>
                                {['G1','G2','G3','G4','G5'].map(g => (
                                  <option key={g} value={g}>{g}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* SR Image (optional) */}
                          <div className="mt-4">
                            <label className="block text-sm font-semibold text-gray-900">SR Image (optional)</label>
                            <input
                              type="file"
                              accept="image/*"
                              className="mt-1 block w-full text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                              onChange={(e) => {
                                const newFiles = [...srImageFiles];
                                newFiles[index] = e.target.files?.[0] || null;
                                setSrImageFiles(newFiles);
                              }}
                            />
                          </div>
                        </div>
                        );
                      })}
                      
                      {/* Display new numbers being added */}
                      {newNumbers.map((newNum, newIndex) => {
                        const actualIndex = (lead.plans?.length || 0) + newIndex;
                        return (
                          <div key={`new-${newIndex}`} className="border border-green-200 rounded-xl p-4 bg-green-50">
                            <div className="mb-4 pb-3 border-b border-green-200 flex items-center justify-between">
                              <h4 className="text-sm font-semibold text-green-700">New Number {newIndex + 1} - {newNum.number}</h4>
                              <button
                                type="button"
                                onClick={() => handleRemoveNewNumber(newIndex)}
                                className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1.5"
                              >
                                <Trash2 className="w-4 h-4" />
                                Remove
                              </button>
                            </div>
                            
                            {/* Number & Plan & Passcode & Category */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                              <div>
                                <label className="block text-sm font-semibold text-gray-900">Number</label>
                                <input
                                  type="text"
                                  className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                  value={newNum.number}
                                  readOnly
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-semibold text-gray-900">Plan</label>
                                <input
                                  type="text"
                                  className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                  value={newNum.plan}
                                  readOnly
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-semibold text-gray-900">Passcode</label>
                                <input
                                  type="text"
                                  className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                  value={newNum.passcode || ''}
                                  readOnly
                                  placeholder="Passcode from number pool"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-semibold text-gray-900">Category</label>
                                <input
                                  type="text"
                                  className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                  value={newNum.category}
                                  readOnly
                                />
                              </div>
                            </div>

                            {/* Activation Details */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-semibold text-gray-900">Activation Date <span className="text-red-500">*</span></label>
                                <input
                                  type="date"
                                  className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                  value={newNum.activationDate}
                                  onChange={(e) => {
                                    const updated = [...newNumbers];
                                    updated[newIndex].activationDate = e.target.value;
                                    setNewNumbers(updated);
                                  }}
                                  required
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-semibold text-gray-900">SR No. <span className="text-red-500">*</span></label>
                                <input
                                  type="text"
                                  className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                  value={newNum.srNumber}
                                  onChange={(e) => {
                                    const updated = [...newNumbers];
                                    updated[newIndex].srNumber = e.target.value;
                                    setNewNumbers(updated);
                                  }}
                                  placeholder="Enter SR number"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-semibold text-gray-900">Service Order number <span className="text-red-500">*</span></label>
                                <input
                                  type="text"
                                  className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                  value={newNum.serviceOrderNumber}
                                  onChange={(e) => {
                                    const updated = [...newNumbers];
                                    updated[newIndex].serviceOrderNumber = e.target.value;
                                    setNewNumbers(updated);
                                  }}
                                  placeholder="Enter Service Order number"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-semibold text-gray-900">Select Activation Group <span className="text-red-500">*</span></label>
                                <select
                                  className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                  value={newNum.selectedGroup}
                                  onChange={(e) => {
                                    const updated = [...newNumbers];
                                    updated[newIndex].selectedGroup = e.target.value;
                                    setNewNumbers(updated);
                                  }}
                                  required
                                >
                                  <option value="">Select group</option>
                                  {['G1','G2','G3','G4','G5'].map(g => (
                                    <option key={g} value={g}>{g}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* SR Image (optional) */}
                            <div className="mt-4">
                              <label className="block text-sm font-semibold text-gray-900">SR Image (optional)</label>
                              <input
                                type="file"
                                accept="image/*"
                                className="mt-1 block w-full text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                                onChange={(e) => {
                                  const updated = [...newNumbers];
                                  updated[newIndex].srImageFile = e.target.files?.[0] || null;
                                  setNewNumbers(updated);
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* Add New Number Button */}
                      <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 bg-gray-50">
                        {!showAddNumberForm ? (
                          <button
                            type="button"
                            onClick={() => setShowAddNumberForm(true)}
                            className="w-full px-4 py-3 text-sm font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2"
                          >
                            <CheckCircle className="w-5 h-5" />
                            Add New Number
                          </button>
                        ) : (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="text-sm font-semibold text-gray-900">Select New Number and Plan</h4>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowAddNumberForm(false);
                                  setNewNumberData(null);
                                  setNewNumberPlan('');
                                  setNewNumberCategory('Standard');
                                }}
                                className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 border border-gray-200 rounded-lg hover:bg-gray-200 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                            
                            {/* Number Selector */}
                            <div className="border border-gray-200 rounded-xl p-4 bg-white">
                              <QuickNumberSelect
                                onSelect={async (numberData) => {
                                  setNewNumberData({
                                    id: numberData.id,
                                    number: numberData.number,
                                    category: numberData.category || newNumberCategory || 'Standard',
                                    passcode: numberData.passcode || ''
                                  });
                                }}
                                selectedCategory={newNumberCategory}
                                onCategoryChange={(category) => setNewNumberCategory(category)}
                                selectedNumberId={newNumberData?.id}
                              />
                            </div>
                            
                            {/* Selected Number Display */}
                            {newNumberData && (
                              <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                                  <div>
                                    <label className="block text-sm font-semibold text-gray-900">Selected Number</label>
                                    <input
                                      type="text"
                                      className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                      value={newNumberData.number}
                                      readOnly
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-semibold text-gray-900">Category</label>
                                    <input
                                      type="text"
                                      className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                      value={newNumberData.category}
                                      readOnly
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-semibold text-gray-900">Passcode</label>
                                    <input
                                      type="text"
                                      className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                      value={newNumberData.passcode}
                                      readOnly
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-semibold text-gray-900">Plan <span className="text-red-500">*</span></label>
                                    <select
                                      className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                      value={newNumberPlan}
                                      onChange={(e) => setNewNumberPlan(e.target.value)}
                                      required
                                    >
                                      <option value="">Select plan</option>
                                      {allPlans.map((p) => (
                                        <option key={p.id} value={p.name}>
                                          {p.name} ({p.category})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (newNumberData) {
                                      handleAddNewNumber({
                                        id: newNumberData.id,
                                        number: newNumberData.number,
                                        passcode: newNumberData.passcode,
                                        category: newNumberData.category
                                      });
                                    }
                                  }}
                                  disabled={!newNumberPlan || !newNumberData}
                                  className="w-full px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  Add Number
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    // Single number - use existing form
                    <>
                      {/* Number & Plan & Passcode & Category */}
                      <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-900">Number</label>
                            <div className="flex gap-2 mt-1">
                          <input
                            type="text"
                                className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900"
                                value={editableNumber}
                            readOnly
                          />
                              <button
                                type="button"
                                onClick={() => setShowNumberSelector(!showNumberSelector)}
                                className="px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors"
                              >
                                {showNumberSelector ? 'Cancel' : 'Change'}
                              </button>
                            </div>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-900">Plan</label>
                            <select
                              className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900"
                              value={editablePlan}
                              onChange={(e) => setEditablePlan(e.target.value)}
                            >
                              <option value="">Select plan</option>
                              {allPlans.map((plan) => (
                                <option key={plan.id} value={plan.name}>
                                  {plan.name} ({plan.category})
                                </option>
                              ))}
                            </select>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-900">Passcode</label>
                          <input
                            type="text"
                            className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900"
                            value={editablePasscode}
                            readOnly
                            placeholder="Passcode from number pool"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-900">Category</label>
                          <input
                            type="text"
                            className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900"
                            value={editableCategory}
                            readOnly
                          />
                        </div>
                        </div>
                        
                        {/* Number Selector */}
                        {showNumberSelector && (
                          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                            <QuickNumberSelect
                              onSelect={async (numberData) => {
                                setEditableNumber(numberData.number);
                                setEditableNumberId(numberData.id);
                                setEditablePasscode(numberData.passcode || '');
                                setEditableCategory(numberData.category || '');
                                setShowNumberSelector(false);
                              }}
                              selectedCategory={editableCategory}
                              onCategoryChange={(category) => setEditableCategory(category)}
                              selectedNumberId={editableNumberId}
                            />
                          </div>
                        )}
                      </div>

                      {/* Activation Details */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-900">Activation Date <span className="text-red-500">*</span></label>
                          <input
                            type="date"
                            className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900"
                            value={activationDate}
                            onChange={(e) => setActivationDate(e.target.value)}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-900">SR No. <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900"
                            value={srNumber}
                            onChange={(e) => setSrNumber(e.target.value)}
                            placeholder="Enter SR number"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-900">Service Order number <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900"
                            value={serviceOrderNumber}
                            onChange={(e) => setServiceOrderNumber(e.target.value)}
                            placeholder="Enter Service Order number"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-900">Select Activation Group <span className="text-red-500">*</span></label>
                          <select
                            className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900"
                            value={selectedGroup}
                            onChange={(e) => setSelectedGroup(e.target.value)}
                            required
                          >
                            <option value="">Select group</option>
                            {['G1','G2','G3','G4','G5'].map(g => (
                              <option key={g} value={g}>{g}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* SR Image (optional) */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-900">SR Image (optional)</label>
                        <input
                          type="file"
                          accept="image/*"
                          className="mt-1 block w-full text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                          onChange={(e) => setSrImageFile(e.target.files?.[0] || null)}
                        />
                      </div>
                    </>
                  )}

                  {/* Notes for Activate action (shared for all numbers) */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-900">
                      Notes (Optional)
                    </label>
                    <div className="relative">
                      <textarea
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-green-300 focus:ring-2 focus:ring-green-100 focus:bg-white transition-all duration-200 text-gray-900 placeholder-gray-500 resize-none"
                        rows={4}
                        value={coordinatorNote}
                        onChange={(e) => setCoordinatorNote(e.target.value)}
                        placeholder="Add any additional notes or comments..."
                      />
                    </div>
                  </div>
                </>
              )}

              {coordinatorAction === 'followup' && (
                <>
                  {/* Notes for Follow-up action */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-900">
                      Notes (Optional)
                    </label>
                    <div className="relative">
                      <textarea
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-orange-300 focus:ring-2 focus:ring-orange-100 focus:bg-white transition-all duration-200 text-gray-900 placeholder-gray-500 resize-none"
                        rows={4}
                        value={coordinatorNote}
                        onChange={(e) => setCoordinatorNote(e.target.value)}
                        placeholder="Add any additional notes or comments..."
                      />
                    </div>
                  </div>
                </>
              )}

              {coordinatorAction === 'later' && (
                <>
                  {/* Date for Later action */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-900">
                      Schedule For Date <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:border-yellow-300 focus:ring-2 focus:ring-yellow-100 focus:bg-white transition-all duration-200 text-gray-900"
                        value={scheduledForDate}
                        onChange={(e) => setScheduledForDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        required
                      />
                    </div>
                    <p className="text-sm text-gray-500">
                      The lead will appear in unassigned on this date
                    </p>
                  </div>
                  {/* Notes for Later action */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-900">
                      Notes (Optional)
                    </label>
                    <div className="relative">
                      <textarea
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-yellow-300 focus:ring-2 focus:ring-yellow-100 focus:bg-white transition-all duration-200 text-gray-900 placeholder-gray-500 resize-none"
                        rows={4}
                        value={coordinatorNote}
                        onChange={(e) => setCoordinatorNote(e.target.value)}
                        placeholder="Add any additional notes or comments..."
                      />
                    </div>
                  </div>
                </>
              )}
              {coordinatorAction === 'reject' && (
                <>
                  {/* Rejection Reason Dropdown */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-900">
                      Rejection Reason
                    </label>
                    <select
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:border-red-300 focus:ring-2 focus:ring-red-100 transition-all duration-200 text-gray-900"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                    >
                      <option value="">Select a reason</option>
                      <option value="billing_issue">Billing issue</option>
                      <option value="cap_limit">Cap Limit</option>
                      <option value="not_answer">Not Answer</option>
                      <option value="number_return">Number Return</option>
                      <option value="number_already_active">Number Already Active</option>
                    </select>
                  </div>
                  {/* Notes for Reject action */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-900">
                      Notes (Optional)
                    </label>
                    <div className="relative">
                      <textarea
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-red-300 focus:ring-2 focus:ring-red-100 focus:bg-white transition-all duration-200 text-gray-900 placeholder-gray-500 resize-none"
                        rows={4}
                        value={coordinatorNote}
                        onChange={(e) => setCoordinatorNote(e.target.value)}
                        placeholder="Add any additional notes or comments..."
                      />
                    </div>
                  </div>
                </>
              )}
              {(coordinatorAction === 'assign' || coordinatorAction === 'reassign') && (
                <>
                  {/* Number, Category, Group & Passcode summary - Show all numbers */}
                  <div className="space-y-4">
                    {allPlansWithPasscodes.length > 0 ? (
                      allPlansWithPasscodes.map((planData, index) => (
                        <div key={index} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                          {allPlansWithPasscodes.length > 1 && (
                            <div className="mb-3 pb-2 border-b border-gray-200">
                              <h4 className="text-sm font-semibold text-gray-700">Number {index + 1}</h4>
                            </div>
                          )}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div>
                              <label className="block text-sm font-semibold text-gray-900">Number</label>
                              <input
                                type="text"
                                className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                value={planData.number}
                                readOnly
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-900">Category</label>
                              <input
                                type="text"
                                className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                value={planData.category}
                                readOnly
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-900">Group</label>
                              <input
                                type="text"
                                className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                value={planData.group}
                                readOnly
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-900">Passcode</label>
                              <input
                                type="text"
                                className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                value={planData.passcode}
                                readOnly
                                placeholder="Passcode from number pool"
                              />
                            </div>
                            {planData.plan && (
                              <div className="col-span-2 sm:col-span-4">
                                <label className="block text-sm font-semibold text-gray-900">Plan Selected</label>
                                <input
                                  type="text"
                                  className="mt-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                                  value={planData.plan}
                                  readOnly
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      // Fallback to first plan if allPlansWithPasscodes is empty
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-900">Number</label>
                          <input
                            type="text"
                            className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                            value={lead.plans?.[0]?.number || ''}
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-900">Category</label>
                          <input
                            type="text"
                            className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                            value={lead.plans?.[0]?.category || ''}
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-900">Group</label>
                          <input
                            type="text"
                            className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                            value={lead.plans?.[0]?.group || ''}
                            readOnly
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-900">Passcode</label>
                          <input
                            type="text"
                            className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 text-sm"
                            value={assignPasscode}
                            readOnly
                            placeholder="Passcode from number pool"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Etisalat Lead ID - Show separate fields for each number */}
                  {allPlansWithPasscodes.length > 1 ? (
                    <div className="space-y-4">
                      {allPlansWithPasscodes.map((planData, index) => (
                        <div key={index} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                          <div className="mb-3 pb-2 border-b border-gray-200">
                            <h4 className="text-sm font-semibold text-gray-700">Number {index + 1} - Etisalat Lead ID</h4>
                          </div>
                          <div className="space-y-2">
                            <label className="block text-sm font-semibold text-gray-900">
                              Etisalat Lead ID <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                              </div>
                              <input
                                type="text"
                                className="w-full pl-8 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:border-red-300 focus:ring-2 focus:ring-red-100 focus:bg-white transition-all duration-200 text-gray-900 placeholder-gray-500 text-sm"
                                value={etisalatLeadIds[index] || ''}
                                onChange={(e) => {
                                  const newIds = [...etisalatLeadIds];
                                  newIds[index] = e.target.value;
                                  setEtisalatLeadIds(newIds);
                                  // Also update single etisalatLeadId for backward compatibility
                                  if (index === 0) {
                                    setEtisalatLeadId(e.target.value);
                                  }
                                }}
                                placeholder={`Enter Etisalat Lead ID for ${planData.number}`}
                                required
                              />
                            </div>
                            <p className="text-xs text-gray-500">This ID will be used for tracking number {planData.number} in Etisalat system</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-900">
                        Etisalat Lead ID <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                        </div>
                        <input
                          type="text"
                          className="w-full pl-8 pr-4 py-2.5 sm:py-3 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl focus:border-red-300 focus:ring-2 focus:ring-red-100 focus:bg-white transition-all duration-200 text-gray-900 placeholder-gray-500 text-sm sm:text-base"
                          value={etisalatLeadId}
                          onChange={(e) => {
                            setEtisalatLeadId(e.target.value);
                            // Also update array for consistency
                            setEtisalatLeadIds([e.target.value]);
                          }}
                          placeholder="Enter Etisalat Lead ID"
                          required
                        />
                      </div>
                      <p className="text-xs text-gray-500">This ID will be used for tracking in Etisalat system</p>
                    </div>
                  )}
                  
                  {/* Emirates */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-900">
                      Emirates <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <MapPin className="h-4 w-4 text-gray-400" />
                      </div>
                      <select
                        className="w-full pl-10 pr-4 py-2.5 sm:py-3 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all duration-200 text-gray-900 appearance-none cursor-pointer text-sm sm:text-base"
                        value={selectedEmirate}
                        onChange={(e) => setSelectedEmirate(e.target.value)}
                        required
                      >
                        <option value="">Select Emirates</option>
                        {emirates.map((emirate) => (
                          <option key={emirate} value={emirate}>{emirate}</option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">Select the emirates where this lead is located</p>
                  </div>

                  {/* Notes for Assign action */}
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-gray-900">
                      Notes (Optional)
                    </label>
                    <div className="relative">
                      <textarea
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all duration-200 text-gray-900 placeholder-gray-500 resize-none"
                        rows={4}
                        value={coordinatorNote}
                        onChange={(e) => setCoordinatorNote(e.target.value)}
                        placeholder="Add any additional notes or comments..."
                      />
                    </div>
                  </div>
                </>
              )}
              
              {/* Notes for reverification (sent to chat) */}
              {coordinatorAction === 'reverification' && (
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-gray-900">
                    Notes to Verifier (sent to chat)
                  </label>
                  <div className="relative">
                    <textarea
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all duration-200 text-gray-900 placeholder-gray-500 resize-none"
                      rows={4}
                      value={coordinatorNote}
                      onChange={(e) => setCoordinatorNote(e.target.value)}
                      placeholder="Explain why this needs reverification..."
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className={`bg-gray-50 px-3 py-2.5 sm:px-6 sm:py-4 border-t border-gray-100 ${isActivationDialog ? 'mb-0' : ''}`}
                 style={isActivationDialog ? { paddingBottom: 'max(1rem, calc(0.75rem + env(safe-area-inset-bottom)))' } : {}}>
              <div className="flex flex-col sm:flex-row justify-end gap-1.5 sm:gap-3">
                <button
                  onClick={() => {
                    setShowCoordinatorDialog(false);
                    setCoordinatorNote('');
                    setScheduledForDate('');
                    setRejectionReason('');
                    setCoordinatorAction(null);
                    setNewNumbers([]);
                    setShowAddNumberForm(false);
                    setNewNumberData(null);
                    setNewNumberPlan('');
                    setNewNumberCategory('Standard');
                    setRemovedPlanIndices(new Set());
                  }}
                  disabled={isCoordinatorActionProcessing}
                  className="px-3 py-2 sm:px-6 sm:py-2.5 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md sm:rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCoordinatorAction}
                  disabled={isCoordinatorActionProcessing}
                  className={`px-3 py-2 sm:px-6 sm:py-2.5 text-xs sm:text-sm font-medium text-white rounded-md sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm ${
                    coordinatorAction === 'assign' || coordinatorAction === 'reassign' ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:ring-indigo-100' :
                    isActivationDialog ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 focus:ring-green-100' :
                    coordinatorAction === 'reverification' ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 focus:ring-blue-100' :
                    coordinatorAction === 'later' ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 focus:ring-yellow-100' :
                    coordinatorAction === 'reject' ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 focus:ring-red-100' :
                    'bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 focus:ring-orange-100'
                  }`}
                >
                  {isCoordinatorActionProcessing ? (
                    <div className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center">
                      {coordinatorAction === 'assign' ? (
                        <>
                          <User2 className="h-4 w-4 mr-2" />
                          Assign Lead
                        </>
                      ) : coordinatorAction === 'reassign' ? (
                        <>
                          <User2 className="h-4 w-4 mr-2" />
                          Reassign Lead
                        </>
                      ) : isActivationDialog ? (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Activate Lead
                        </>
                      ) : coordinatorAction === 'reverification' ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Send for Reverification
                        </>
                      ) : coordinatorAction === 'later' ? (
                        <>
                          <Clock className="h-4 w-4 mr-2" />
                          Mark for Later
                        </>
                      ) : coordinatorAction === 'reject' ? (
                        <>
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject Lead
                        </>
                      ) : (
                        <>
                          <Clock className="h-4 w-4 mr-2" />
                          Mark Follow-up
                        </>
                      )}
                    </div>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>, document.body)}

      {/* Assignment Message Dialog */}
      {showAssignmentMessage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <CheckCircle className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white">
                      Assignment Details - Copy & Paste
                    </h3>
                    <p className="text-green-100 text-sm">
                      Lead has been successfully assigned to Etisalat system
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAssignmentMessage(false)}
                  className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-lg transition-all duration-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium text-gray-600">Assignment Information</span>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(assignmentMessage);
                      setIsCopied(true);
                      toast.success('Message copied to clipboard!', {
                        duration: 1500,
                        style: {
                          background: '#10b981',
                          color: 'white',
                          border: '1px solid #059669',
                        },
                      });
                      
                      // Reset copied state after 2 seconds
                      setTimeout(() => {
                        setIsCopied(false);
                      }, 2000);
                    }}
                    className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 shadow-sm hover:shadow-md ${
                      isCopied 
                        ? 'text-green-600 bg-green-50 border border-green-200' 
                        : 'text-indigo-600 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 hover:text-indigo-700'
                    }`}
                  >
                    {isCopied ? (
                      <>
                        <CheckCircle className="h-3 w-3 mr-1.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <FileText className="h-3 w-3 mr-1.5" />
                        Quick Copy
                      </>
                    )}
                  </button>
                </div>
                
                <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
                  <pre className="whitespace-pre-wrap text-sm text-gray-800 font-mono leading-relaxed tracking-wide">
                    {assignmentMessage}
                  </pre>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-100">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Assignment completed successfully</span>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      // Copy to clipboard
                      navigator.clipboard.writeText(assignmentMessage);
                      
                      // Show copied state in button
                      setIsCopied(true);
                      
                      toast.success('Message copied to clipboard!', {
                        duration: 2000,
                        style: {
                          background: '#10b981',
                          color: 'white',
                          border: '1px solid #059669',
                        },
                      });
                      
                      // Close dialog and navigate after a short delay for better UX
                      setTimeout(() => {
                        setShowAssignmentMessage(false);
                        setEtisalatLeadId('');
                        setSelectedEmirate('');
                        setCoordinatorNote('');
                        setCoordinatorAction(null);
                        setIsCopied(false);
                        navigate('/dashboard/leads');
                      }, 1500);
                    }}
                    className={`inline-flex items-center px-6 py-3 rounded-xl focus:outline-none focus:ring-4 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95 font-medium ${
                      isCopied 
                        ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white focus:ring-green-200' 
                        : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 focus:ring-indigo-200'
                    }`}
                  >
                    {isCopied ? (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Details Copied
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4 mr-2" />
                        Copy to Clipboard & Done
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showManagerAssignDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-lg w-full mx-4 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <User2 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Assign to Coordinator</h3>
                  <p className="text-purple-100 text-sm">
                    Assign this verified lead to the coordinator for final processing
                  </p>
                </div>
              </div>
            </div>

            {/* Form Content */}
            <div className="p-6 space-y-6">
              {/* Location URL */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-900">
                  Google Maps Location URL (Optional)
                </label>
                <input
                  type="url"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-purple-300 focus:ring-2 focus:ring-purple-100 focus:bg-white transition-all duration-200 text-gray-900 placeholder-gray-500"
                  value={managerLocationUrl}
                  onChange={(e) => setManagerLocationUrl(e.target.value)}
                  placeholder="Paste Google Maps link to the customer location"
                />
                <p className="text-xs text-gray-500">
                  This link will be saved on the lead for coordinators to access.
                </p>
              </div>

              {/* Comment Box */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-900">
                  Comments (Optional)
                </label>
                <textarea
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-purple-300 focus:ring-2 focus:ring-purple-100 focus:bg-white transition-all duration-200 text-gray-900 placeholder-gray-500 resize-none"
                  rows={4}
                  value={managerNote}
                  onChange={(e) => setManagerNote(e.target.value)}
                  placeholder="Add any comments or notes for the coordinator..."
                />
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-100">
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowManagerAssignDialog(false);
                    setManagerNote('');
                    setManagerLocationUrl(((lead as any).url as string) || '');
                  }}
                  disabled={isManagerActionProcessing}
                  className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleManagerAssign}
                  disabled={isManagerActionProcessing}
                  className="px-6 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isManagerActionProcessing ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin inline" />
                      Assigning...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="h-4 w-4 mr-2 inline" />
                      Assign to Coordinator
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SplitLead
        isOpen={showSplitLead}
        onClose={() => setShowSplitLead(false)}
        lead={lead}
        onSplit={handleSplitComplete}
      />

      <div className="px-2 sm:px-0 space-y-3 sm:space-y-4 md:space-y-6">
        {(isAdmin() || isCoordinator()) && (
          <FormSection
            icon={Users}
            title="Assignment Details"
            description="Team and agent information"
          >
            <FormInput
              label="Agent Name"
              icon={User2}
              type="text"
              value={lead.agentName || 'N/A'}
              readOnly
            />
            <FormInput
              label="Team Name"
              icon={Briefcase}
              type="text"
            value={lead.teamName || 'N/A'}
              readOnly
            />
          </FormSection>
        )}

        <FormSection
          icon={User2}
          title="Customer Information"
          description="Basic customer details"
        >
          <FormInput
            label="Full Name"
            icon={User2}
            type="text"
            value={lead.customerName}
            readOnly
          />
          <FormInput
            label="Phone Number"
            icon={Phone}
            type="tel"
            value={lead.customerNumber}
            readOnly
          />
          {(lead as any).url && (
            <FormInput
              label="Location URL"
              icon={MapPin}
              type="text"
              value={(lead as any).url || ''}
              readOnly
            />
          )}
          <FormInput
            label="Nationality"
            icon={Globe2}
            type="text"
            value={getCountryName(lead.country)}
            readOnly
          />
          {lead.productType === 'Home Wifi' && (
            <>
              <FormInput
                label="Email"
                icon={Mail}
                type="email"
                value={(lead as any).homeWifiEmail || ''}
                readOnly
              />
              <FormInput
                label="ID"
                icon={Package}
                type="text"
                value={(lead as any).homeWifiId || ''}
                readOnly
              />
            </>
          )}
          <FormInput
            label="Age"
            icon={User2}
            type="number"
            value={lead.customerAge?.toString()}
            readOnly
          />
          <FormInput
            label="Gender"
            icon={User2}
            type="text"
            value={lead.gender}
            readOnly
          />
        </FormSection>

        <FormSection
          icon={Package}
          title="Selected Plans"
          description="Number and plan details"
          rightElement={
            (lead.status === 'assigned' || lead.status === 'follow_up') && lead.etisalatLeadId ? (
              <div className="bg-gradient-to-r from-red-50 to-red-100 border border-red-200 rounded-lg px-3 py-2 shadow-sm">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <div>
                    <div className="text-xs text-red-600 font-medium">Etisalat Lead ID</div>
                    <div className="text-sm font-bold text-red-800">{lead.etisalatLeadId}</div>
                  </div>
                </div>
              </div>
            ) : null
          }
        >
          {lead.plans?.map((plan, index) => (
            <div key={index} className="col-span-1 lg:col-span-2">
              <div className="bg-gradient-to-br from-slate-50 to-gray-50 p-4 sm:p-6 rounded-xl border border-gray-200/60 shadow-sm hover:shadow-md transition-all duration-200">
                <div className="space-y-4">
                  {/* Header Section */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                        <Package className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                          {plan.number}
                          {plan.group && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-700">
                              {plan.group}
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-gray-500">Category: {plan.category}</p>
                        {isUserCoordinator && plan.numberId && typeof plan.numberId === 'string' && !plan.numberId.startsWith('virtual-') && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            Passcode:{' '}
                            {planPasscodes[plan.numberId]
                              ? planPasscodes[plan.numberId]
                              : 'Loading...'}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="px-4 py-2 rounded-full text-sm font-semibold bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg">
                      {plan.plan}
                    </div>
                  </div>

                  {/* Plan Description Section */}
                  <div className="bg-white/80 backdrop-blur-sm p-4 rounded-xl border border-gray-200/50 shadow-inner">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full"></div>
                      <h4 className="text-sm font-semibold text-gray-800">Plan Description</h4>
                    </div>
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 rounded-lg border-l-4 border-indigo-400">
                      <p className="text-sm text-gray-700 leading-relaxed">{getPlanDescription(plan.plan)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </FormSection>

        <FormSection
          icon={MapPinned}
          title="Location Details"
          description="Customer location information"
        >
          <FormInput
            label="Emirate"
            icon={MapPin}
            type="text"
            value={lead.emirate}
            readOnly
          />
          <FormInput
            label="Address"
            icon={MapPin}
            type="text"
            value={lead.customerAddress}
            readOnly
          />
          <FormInput
            label="Location URL"
            icon={Globe2}
            type="url"
            value={lead.locationUrl}
            readOnly
          />
          <div className="col-span-1 lg:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  checked={lead.hasEmirateId}
                  readOnly
                />
                <span className="ml-2 text-sm text-gray-700">Emirates ID Available</span>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  checked={lead.advancePayment}
                  readOnly
                />
                <span className="ml-2 text-sm text-gray-700">Advance Payment</span>
              </div>
            </div>
          </div>
        </FormSection>

        <FormSection
          icon={Languages}
          title="Communication Preferences"
          description="Language and sharing preferences"
        >
          <FormInput
            label="Language"
            icon={Languages}
            type="text"
            value={lead.language}
            readOnly
          />
          {/* Hide "Shared With" field from verifier and coordinator roles (but show to admin) */}
          {((!isVerifier() && !isCoordinator()) || isAdmin()) && (
            <FormInput
              label="Shared With"
              icon={Users}
              type="text"
              value={sharedWithNames.join(', ') || 'None'}
              readOnly
            />
          )}
        </FormSection>

        <FormSection
          icon={Package}
          title="Service & Plan Details"
          description="Product and number information"
        >
          <FormInput
            label="Product Type"
            icon={Package}
            type="text"
            value={lead.productType}
            readOnly
          />
          <FormInput
            label="Number Category"
            icon={Hash}
            type="text"
            value={lead.plans?.[0]?.category || 'N/A'}
            readOnly
          />
        </FormSection>

        <FormSection
          icon={Clock}
          title="Lead Status"
          description="Current status and timestamps"
        >
          <div className="col-span-1 lg:col-span-2">
            <div className="flex items-center space-x-2 flex-wrap">
              <div className={clsx(
                'px-2.5 py-1 rounded-full text-xs font-medium',
                lead.status === 'verified' ? 'bg-green-100 text-green-800' :
                lead.status === 'rejected' ? 'bg-red-100 text-red-800' :
                lead.status === 'non_verified' ? 'bg-yellow-100 text-yellow-800' :
                lead.status === 'assigned' ? 'bg-blue-100 text-blue-800' :
                lead.status === 'assigned_to_cord' ? 'bg-blue-100 text-blue-800' :
                lead.status === 'pending_coordinator' ? 'bg-blue-100 text-blue-800' :
                lead.status === 'split' ? 'bg-purple-100 text-purple-800' :
                'bg-gray-100 text-gray-800'
              )}>
                {getStatusDisplayText(lead.status)}
              </div>
              {/* Pending Verification at Location Indicator */}
              {((lead as any).pendingVerificationAtLocation === true || (lead as any).pendingVerificationAtLocation === 'true') && lead.status !== 'rejected' && (
                <div className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                  <Clock className="h-3 w-3 mr-1.5" />
                  Pending Verification at Location
                </div>
              )}
            </div>
          </div>
          <FormInput
            label="Created At"
            icon={Calendar}
            type="text"
            value={lead.createdAt && lead.createdAt instanceof Date && !isNaN(lead.createdAt.getTime()) ? format(lead.createdAt, 'PPP pp') : 'N/A'}
            readOnly
          />
          <FormInput
            label="Last Updated"
            icon={Clock}
            type="text"
            value={lead.updatedAt && lead.updatedAt instanceof Date && !isNaN(lead.updatedAt.getTime()) ? format(lead.updatedAt, 'PPP pp') : 'N/A'}
            readOnly
          />
        </FormSection>

        {lead.remarks && (
          <FormSection
            icon={MessageSquare}
            title="Remarks"
            description="Additional notes and comments"
          >
            <div className="col-span-1 lg:col-span-2" ref={chatBoxRef}>
              <div
                className="block w-full rounded-lg border border-gray-300 shadow-sm bg-white p-3 text-sm whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: lead.remarks.replace(/\n/g, '<br />') }}
              />
            </div>
          </FormSection>
        )}

        {lead.verificationMedia && lead.verificationMedia.length > 0 && (
          <FormSection
            icon={FileCheck}
            title="Verification Media"
            description="Media files attached during verification"
          >
            <div className="col-span-1 lg:col-span-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {lead.verificationMedia.map((media, index) => {
                  // Ensure we're working with the correct media object structure
                  const mediaUrl = typeof media === 'string' ? media : media.url;
                  const mediaType = typeof media === 'string' 
                    ? media.toLowerCase().endsWith('.jpg') || media.toLowerCase().endsWith('.jpeg') || media.toLowerCase().endsWith('.png')
                      ? 'image'
                      : media.toLowerCase().endsWith('.mp4') || media.toLowerCase().endsWith('.webm')
                        ? 'video'
                        : media.toLowerCase().endsWith('.mp3') || media.toLowerCase().endsWith('.wav')
                          ? 'audio'
                          : media.toLowerCase().endsWith('.pdf')
                            ? 'pdf'
                            : 'unknown'
                    : media.type;
                  const mediaName = typeof media === 'string' ? `Media ${index + 1}` : media.name;
                  const azureUrl = typeof media === 'string' ? undefined : (media as any).azureUrl as string | undefined;

                  return (
                  <div key={index} className="bg-gray-50 p-3 sm:p-4 rounded-lg">
                    <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                        {mediaType === 'image' ? (
                        <img
                            src={mediaUrl}
                            alt={mediaName}
                          className="w-full h-full object-cover"
                        />
                        ) : mediaType === 'video' ? (
                        <video
                            src={mediaUrl}
                          controls
                          className="w-full h-full object-cover"
                        />
                        ) : mediaType === 'audio' ? (
                        <audio
                            src={mediaUrl}
                          controls
                          className="w-full"
                        />
                        ) : mediaType === 'pdf' ? (
                        <a href={mediaUrl} target="_blank" rel="noreferrer" className="flex items-center justify-center h-full text-indigo-600 underline">
                          Open PDF
                        </a>
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <FileText className="w-8 h-8 text-gray-400" />
                          </div>
                      )}
                    </div>
                      <div className="mt-2 text-xs sm:text-sm text-gray-700 space-y-1">
                        <div className="font-medium">{mediaName}</div>
                        <div className="flex flex-wrap gap-2">
                          <a href={mediaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center px-2 py-1 rounded border border-gray-200 text-xs text-indigo-700 bg-white hover:bg-indigo-50">Open in Firebase</a>
                          {azureUrl && (
                            <a href={azureUrl} target="_blank" rel="noreferrer" className="inline-flex items-center px-2 py-1 rounded border border-gray-200 text-xs text-emerald-700 bg-white hover:bg-emerald-50">Open in Azure</a>
                          )}
                        </div>
                    </div>
          </div>
                  );
                })}
              </div>
            </div>
          </FormSection>
        )}

        {lead.verificationNotes && (
          <FormSection
            icon={FileText}
            title="Verification Notes"
            description="Notes added during verification"
          >
            <div className="col-span-1 lg:col-span-2">
              <textarea
                rows={4}
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                value={lead.verificationNotes}
                readOnly
              />
            </div>
          </FormSection>
        )}

        {lead.rejectionReason && (
          <FormSection
            icon={XCircle}
            title="Rejection Reason"
            description="Reason why this lead was rejected"
          >
            <div className="col-span-1 lg:col-span-2">
              <textarea
                rows={4}
                className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm bg-red-50 border-red-200"
                value={lead.rejectionReason}
                readOnly
              />
            </div>
          </FormSection>
        )}

        {/* Add a div at the end of the page for scrolling */}
        <div ref={pageEndRef} />
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showRejectDialog} onClose={() => setShowRejectDialog(false)} className="fixed z-50 inset-0 overflow-y-auto">
        <div className="flex items-center justify-center min-h-screen px-4">
          <Dialog.Overlay className="fixed inset-0 bg-black opacity-30" />
          <div className="relative bg-white rounded-lg max-w-md w-full mx-auto p-4 sm:p-6 z-10 shadow-xl">
            <Dialog.Title className="text-lg font-semibold text-gray-900 mb-2">Reject Lead?</Dialog.Title>
            <Dialog.Description className="text-gray-600 mb-4">
              Are you sure you want to reject this lead? This action cannot be undone. The number(s) will be reserved for you.
            </Dialog.Description>
            <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 sm:space-x-3">
              <button
                onClick={() => setShowRejectDialog(false)}
                className="px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAgentReject}
                disabled={rejecting}
                className="px-3 sm:px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                {rejecting ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      </Dialog>

      {/* Non-Verify Dialog */}
      {showNonVerifyDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-yellow-500 to-yellow-600">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Calendar className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Non-Verify Lead
                  </h3>
                  <p className="text-yellow-100 text-sm">
                    Mark this lead as non-verified. Add a note explaining why.
                  </p>
                </div>
              </div>
            </div>

            {/* Form Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Verification Notes */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-900">
                  Verification Notes (Optional)
                </label>
                <div className="relative">
                  <textarea
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-yellow-300 focus:ring-2 focus:ring-yellow-100 focus:bg-white transition-all duration-200 text-gray-900 placeholder-gray-500 resize-none"
                    rows={4}
                    value={nonVerifyNote}
                    onChange={(e) => setNonVerifyNote(e.target.value)}
                    placeholder="Add any additional notes or comments..."
                  />
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-100">
              <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
                <button
                  onClick={() => {
                    setShowNonVerifyDialog(false);
                    setNonVerifyNote('Non Verified');
                    setIsVerifyActionProcessing(false); // Reset processing state when canceling
                  }}
                  disabled={isVerifyActionProcessing}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const noteToSend = nonVerifyNote || 'Non-Verified';
                    setVerificationNote(noteToSend);
                    // Don't close dialog immediately - wait for action to complete
                    try {
                      // Pass the note directly to avoid async state update issue
                      await handleVerificationAction('non_verified', noteToSend);
                      // Close dialog only after successful completion
                      setShowNonVerifyDialog(false);
                      setNonVerifyNote('Non Verified');
                    } catch (error) {
                      // Keep dialog open on error so user can see the error message
                      // The error is already handled in handleVerificationAction
                    }
                  }}
                  disabled={isVerifyActionProcessing}
                  className="px-4 py-2 text-sm font-medium text-white bg-yellow-600 rounded-lg hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isVerifyActionProcessing ? 'Processing...' : 'Confirm Non-Verify'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Verify at Location Dialog */}
      {showVerifyAtLocationDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <MapPin className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Verify at Location
                  </h3>
                  <p className="text-blue-100 text-sm">
                    Mark this lead for verification at location. Add a note if needed.
                  </p>
                </div>
              </div>
            </div>

            {/* Form Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Verification Notes */}
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-gray-900">
                  Verification Notes (Optional)
                </label>
                <div className="relative">
                  <textarea
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all duration-200 text-gray-900 placeholder-gray-500 resize-none"
                    rows={4}
                    value={verifyAtLocationNote}
                    onChange={(e) => setVerifyAtLocationNote(e.target.value)}
                    placeholder="Add any additional notes or comments..."
                  />
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-100">
              <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
                <button
                  onClick={() => {
                    setShowVerifyAtLocationDialog(false);
                    setVerifyAtLocationNote('Please Verify at location');
                    setIsVerifyActionProcessing(false); // Reset processing state when canceling
                  }}
                  disabled={isVerifyActionProcessing}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const noteToSend = verifyAtLocationNote || 'Please Verify at location';
                    setVerificationNote(noteToSend);
                    // Don't close dialog immediately - wait for action to complete
                    try {
                      // Pass the note directly to avoid async state update issue
                      await handleVerificationAction('verify_at_location', noteToSend);
                      // Close dialog only after successful completion
                      setShowVerifyAtLocationDialog(false);
                      setVerifyAtLocationNote('Please Verify at location');
                    } catch (error) {
                      // Keep dialog open on error so user can see the error message
                      // The error is already handled in handleVerificationAction
                    }
                  }}
                  disabled={isVerifyActionProcessing}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isVerifyActionProcessing ? 'Processing...' : 'Confirm Verify at Location'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Chat Modal */}
      <AnimatePresence>
        {showWhatsAppChat && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[9999]"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-2xl p-0 max-w-3xl w-full mx-4 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
            >
              <div className="px-4 sm:px-6 py-3 bg-gradient-to-r from-emerald-50 to-green-50 border-b border-emerald-100 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-emerald-100 text-emerald-600">
                    <svg viewBox="0 0 32 32" className="h-4 w-4" fill="currentColor" aria-hidden="true"><path d="M19.11 17.46c-.27-.13-1.6-.79-1.85-.88-.25-.09-.43-.13-.61.13-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.13-1.12-.41-2.12-1.31-.78-.69-1.31-1.54-1.46-1.8-.15-.27-.02-.41.11-.54.11-.11.27-.29.41-.45.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.13-.61-1.46-.83-2-.22-.52-.44-.45-.61-.45h-.52c-.18 0-.45.07-.68.34-.23.27-.9.88-.9 2.15 0 1.27.92 2.5 1.05 2.67.14.18 1.81 2.77 4.4 3.88.62.27 1.11.43 1.49.55.63.2 1.2.17 1.65.1.5-.07 1.6-.65 1.83-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.31zM16 3C8.82 3 3 8.82 3 16c0 2.29.62 4.48 1.79 6.42L3 29l6.74-1.77C11.58 28.38 13.76 29 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3zm0 23.73c-2.12 0-4.11-.62-5.78-1.78l-.41-.26-4.01 1.05 1.07-3.9-.27-.41C5.43 20.76 4.73 18.43 4.73 16 4.73 9.94 9.94 4.73 16 4.73S27.27 9.94 27.27 16 22.06 26.73 16 26.73z"/></svg>
                  </span>
                  <div>
                    <h3 className="text-sm sm:text-base font-semibold text-emerald-800">WhatsApp Verification</h3>
                    {lead && (
                      <p className="text-xs text-emerald-700/80">{lead.customerName} · {lead.customerNumber}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* Send Verification Button - Only for specific statuses */}
                  {(isCoordinator() || isAdmin()) && 
                   (lead.status === 'pending_verification' || 
                    lead.status === 'reverification' || 
                    lead.status === 'activated_non_verified') && (
                    <button
                      onClick={() => setShowVerificationDialog(true)}
                      disabled={sendingVerification}
                      className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {sendingVerification ? 'Sending...' : 'Send Verification'}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowWhatsAppChat(false);
                      stopWhatsAppLogsListener();
                    }}
                    className="inline-flex items-center justify-center h-8 w-8 rounded-full text-emerald-700 hover:bg-emerald-100/60 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div ref={whatsappMessagesRef} className="flex-1 px-4 sm:px-6 py-4 overflow-y-auto">
               {/* Verification Message Dialog - Inside Modal */}
               {showVerificationDialog && (
                 <div className="mb-4 bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                   <h4 className="text-base font-semibold text-gray-900 mb-2">
                     Send Verification Message
                   </h4>
                   <p className="text-sm text-gray-600 mb-4">
                     This will send a WhatsApp verification message to the customer ({lead.customerName}) at {lead.customerNumber} with the selected plan details.
                   </p>
                   <div className="flex justify-end gap-2">
                     <button
                       onClick={() => setShowVerificationDialog(false)}
                       disabled={sendingVerification}
                       className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                     >
                       Cancel
                     </button>
                     <button
                       onClick={handleSendVerificationMessage}
                       disabled={sendingVerification}
                       className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                     >
                       {sendingVerification ? (
                         <>
                           <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                             <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                             <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                           </svg>
                           Sending...
                         </>
                       ) : (
                         'Send Message'
                       )}
                     </button>
                   </div>
                 </div>
               )}
               
               <WhatsAppConversationView
                 messages={whatsAppLogs as WhatsAppMessage[]}
                 lead={lead}
                 planDetails={planDetails || undefined}
                 onResendMessage={handleResendVerificationMessage}
                 resendingLogId={resendingLogId}
                 showResendButton={isCoordinator() || isAdmin()}
                 containerRef={whatsappMessagesRef}
               />


              {/* Interactive Flow UI - Delivery Details Form - REMOVED: Only show messages, not UI forms */}
              {false && (flowState === 'delivery' || flowState === 'name' || flowState === 'address' || flowState === 'nationality' || flowState === 'complete') && (
                <div className="mt-4 bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-xl p-5 shadow-lg">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
                    <h3 className="text-lg font-bold text-emerald-900">🚚 Delivery Details</h3>
                  </div>
                  <div className="bg-white rounded-lg p-4 space-y-4">
                    <p className="text-sm text-gray-700 mb-4">
                      Please provide the full delivery address and area where you would like us to deliver your new number.
                    </p>
                    
                    {/* Full Name Field */}
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-gray-900">
                        Type Your Full Name:
                        {deliveryData.name && (
                          <span className="ml-2 text-green-600 text-xs font-normal">✓ Received</span>
                        )}
                      </label>
                      {deliveryData.name ? (
                        <div className="bg-green-50 border-2 border-green-200 rounded-lg p-3">
                          <p className="text-sm font-medium text-green-900">{deliveryData.name}</p>
                        </div>
                      ) : (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-500 italic">
                          Waiting for customer response...
                        </div>
                      )}
                    </div>

                    {/* Full Address Field - Show after name is received */}
                    {(flowState === 'address' || flowState === 'nationality' || flowState === 'complete' || deliveryData.address) && (
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-900">
                          Type Your Full Address: (e.g., Building Name/Number, Street Name/Number)
                          {deliveryData.address && (
                            <span className="ml-2 text-green-600 text-xs font-normal">✓ Received</span>
                          )}
                        </label>
                        {deliveryData.address ? (
                          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-3">
                            <p className="text-sm font-medium text-green-900">{deliveryData.address}</p>
                          </div>
                        ) : (
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-500 italic">
                            Waiting for customer response...
                          </div>
                        )}
                      </div>
                    )}

                    {/* Nationality Field - Show after address is received */}
                    {(flowState === 'nationality' || flowState === 'complete' || deliveryData.nationality) && (
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-gray-900">
                          Type Your Nationality: (Ex: Type "UAE" if you're Local)
                          {deliveryData.nationality && (
                            <span className="ml-2 text-green-600 text-xs font-normal">✓ Received</span>
                          )}
                        </label>
                        {deliveryData.nationality ? (
                          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-3">
                            <p className="text-sm font-medium text-green-900">{deliveryData.nationality}</p>
                          </div>
                        ) : (
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-500 italic">
                            Waiting for customer response...
                          </div>
                        )}
                      </div>
                    )}

                      {/* Completion Message */}
                      {flowState === 'complete' && deliveryData.name && deliveryData.address && deliveryData.nationality && (
                        <div className="mt-4 pt-4 border-t border-gray-200 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-2xl">✅</span>
                            <p className="text-sm font-semibold text-green-900">All delivery details received!</p>
                          </div>
                          {deliveryData.nationality.toLowerCase().trim() === 'uae' ? (
                            <>
                              <p className="text-xs text-gray-700 mt-2">
                                I will forward your details to our delivery team. They will contact you to confirm the time and location for the delivery of your number.
                              </p>
                              <p className="text-xs text-gray-700 mt-1">
                                If you experience any network issues in your area or if the plan I described is not available in your package, you can cancel it within five days without any penalty.
                              </p>
                              <p className="text-xs text-gray-700 mt-1">
                                Thank you so much for your time, sir. Have a wonderful day and take care.
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-xs text-gray-700 mt-2">
                                Non-local residents are required to pay one month's advance Monthly Recurring Charge (MRC).
                              </p>
                              <p className="text-xs text-gray-700 mt-1">
                                I will forward your details to our delivery team. They will contact you to confirm the time and location for the delivery of your number.
                              </p>
                              <p className="text-xs text-gray-700 mt-1">
                                If you experience any network issues in your area or if the plan I described is not available in your package, you can cancel it within five days without any penalty.
                              </p>
                            </>
                          )}
                        </div>
                      )}
                  </div>
                </div>
              )}
            </div>
            {/* Send Message Section for Coordinators and Admins */}
            {(isCoordinator() || isAdmin()) && (
              <div className="border-t border-gray-200 bg-white p-3 flex-shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-600">Reply to customer</label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-400 font-medium">Quick:</span>
                    <div className="flex gap-1">
                      {READY_MADE_MESSAGES.map((template) => (
                        <button
                          key={template.id}
                          onClick={() => handleTemplateMessage(template)}
                          className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-[10px] font-medium text-blue-700 transition-all duration-150 border border-blue-200 hover:border-blue-300"
                          title={template.message}
                        >
                          {template.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <textarea
                      rows={1}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendWhatsAppReply();
                        }
                      }}
                      placeholder="Write a message..."
                      className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400 min-h-[38px] max-h-[80px]"
                    />
                  </div>
                  <button
                    disabled={sendingReply || !replyText.trim()}
                    onClick={sendWhatsAppReply}
                    className="inline-flex items-center px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {sendingReply ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      {/* Number Error Modal */}
      <Dialog open={showNumberErrorModal} onClose={() => setShowNumberErrorModal(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black bg-opacity-30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-md w-full bg-white rounded-xl shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <Dialog.Title className="text-xl font-bold text-gray-900">
                Number Not Available
              </Dialog.Title>
            </div>
            <div className="mb-6">
              <p className="text-gray-600 mb-3">
                The following number(s) are not available in the number pool:
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <ul className="list-disc list-inside space-y-1">
                  {missingNumbers.map((number, idx) => (
                    <li key={idx} className="text-red-800 font-mono text-sm">
                      {number}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-sm text-gray-500 mt-3">
                Please ensure all numbers exist in the number pool before performing this action.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowNumberErrorModal(false)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>

      {/* Edit Error Modal - Same format as Resubmit Error */}
      {editError && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Cannot Resubmit Lead</h3>
            </div>
            <div className="mb-6">
              <p className="text-gray-700 mb-2">
                <span className="font-medium">Reason:</span> {editError.reason}
              </p>
              <p className="text-gray-700">
                <span className="font-medium">Number:</span> {editError.number}
              </p>
              <p className="text-sm text-gray-500 mt-3">
                The number attached to this lead is not available for resubmission. Please ensure the number is either open or reserved by you.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setEditError(null)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getStatusColor(status: string | undefined) {
  switch (status) {
    case 'verified':
      return 'text-green-600 font-medium';
    case 'rejected':
      return 'text-red-600 font-medium';
    case 'pending_verification':
      return 'text-yellow-600 font-medium';
    case 'Non Verified':
      return 'text-orange-600 font-medium';
    default:
      return 'text-gray-900';
  }
}

function getBooleanColor(value: string | undefined) {
  return value === 'Yes' ? 'text-green-600 font-medium' : 'text-red-600 font-medium';
}

function getStatusDisplayText(status: string | undefined): string {
  if (!status) return 'Status';
  // Convert "assigned" to "Processed with Etisalat" for UI display only
  if (status === 'assigned') {
    return 'Processed with Etisalat';
  }
  // Convert "assigned_to_cord" to "Assigned to Activation" for UI display only
  if (status === 'assigned_to_cord') {
    return 'Assigned to Activation';
  }
  // Handle other statuses
  if (status === 'non_verified') return 'Non Verified';
  if (status === 'follow_up') return 'Follow-up';
  return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getStatusWatermarkText(status: string | undefined): string {
  if (!status) return 'STATUS';
  // Convert "assigned" to "PROCESSED WITH ETISALAT" for watermark
  if (status === 'assigned') {
    return 'PROCESSED WITH ETISALAT';
  }
  // Convert "assigned_to_cord" to "ASSIGNED TO ACTIVATION" for watermark
  if (status === 'assigned_to_cord') {
    return 'ASSIGNED TO ACTIVATION';
  }
  return status.replace(/_/g, ' ').toUpperCase();
}

function getStatusGradient(status: string | undefined): string {
  switch (status) {
    case 'verified':
      return 'from-emerald-500/40 via-green-500/35 to-teal-500/40';
    case 'pending_verification':
      return 'from-amber-500/40 via-yellow-500/35 to-orange-500/40';
    case 'reverification':
      return 'from-orange-500/40 via-amber-500/35 to-yellow-500/40';
    case 'assigned':
    case 'assigned_to_cord':
      return 'from-blue-500/40 via-indigo-500/35 to-purple-500/40';
    case 'activated':
      return 'from-green-500/40 via-emerald-500/35 to-teal-500/40';
    case 'activated_non_verified':
      return 'from-cyan-500/40 via-blue-500/35 to-indigo-500/40';
    case 'rejected':
      return 'from-red-500/40 via-rose-500/35 to-pink-500/40';
    case 'follow_up':
      return 'from-purple-500/40 via-violet-500/35 to-fuchsia-500/40';
    case 'later':
      return 'from-slate-500/40 via-gray-500/35 to-zinc-500/40';
    default:
      return 'from-indigo-500/40 via-purple-500/35 to-pink-500/40';
  }
}
