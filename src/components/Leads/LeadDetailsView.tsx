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
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc, addDoc, collection, getDoc, getDocs, query, where, serverTimestamp, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { toast } from 'react-hot-toast';
import { logNumberAction } from '../../utils/numberLogging';
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
  MessageCircle, Check, CheckCheck, Paperclip, RefreshCw
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

type LeadMediaItem = Lead['verificationMedia'] extends Array<infer T> ? T : never;

export function LeadDetailsView({ lead, onEdit, onResubmit, isResubmitting }: { lead: Lead; onEdit: () => void; onResubmit?: () => void; isResubmitting?: boolean }) {
  const { user, isAdmin, isVerifier, isCoordinator, isManager } = useAuthStore();
  const navigate = useNavigate();
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const pageEndRef = useRef<HTMLDivElement>(null);
  const hasScrolledOnMountRef = useRef(false);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [verifyAction, setVerifyAction] = useState<'verify' | 'reject' | 'non_verified' | null>(null);
  const [verificationNote, setVerificationNote] = useState('');
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [showCoordinatorDialog, setShowCoordinatorDialog] = useState(false);
  const [coordinatorAction, setCoordinatorAction] = useState<'assign' | 'activate' | 'followup' | 'later' | 'reject' | null>(null);
  const [coordinatorNote, setCoordinatorNote] = useState('');
  const [scheduledForDate, setScheduledForDate] = useState<string>('');
  const [showManagerAssignDialog, setShowManagerAssignDialog] = useState(false);
  const [managerNote, setManagerNote] = useState('');
  const [isManagerActionProcessing, setIsManagerActionProcessing] = useState(false);
  const [etisalatLeadId, setEtisalatLeadId] = useState('');
  const [selectedEmirate, setSelectedEmirate] = useState('');
  const [showAssignmentMessage, setShowAssignmentMessage] = useState(false);
  const [assignmentMessage, setAssignmentMessage] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [showSplitLead, setShowSplitLead] = useState(false);
  // Activation form fields for coordinator 'activate' action
  const [activationDate, setActivationDate] = useState<string>('');
  const [srNumber, setSrNumber] = useState<string>('');
  const [serviceOrderNumber, setServiceOrderNumber] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [srImageFile, setSrImageFile] = useState<File | null>(null);
  const [editablePasscode, setEditablePasscode] = useState<string>('');
  const [editableCategory, setEditableCategory] = useState<string>('');
  const [assignPasscode, setAssignPasscode] = useState<string>('');

  // New states for editable number and plan
  const [editableNumber, setEditableNumber] = useState<string>('');
  const [editableNumberId, setEditableNumberId] = useState<string>('');
  const [editablePlan, setEditablePlan] = useState<string>('');
  const [originalNumber, setOriginalNumber] = useState<string>('');
  const [originalPlan, setOriginalPlan] = useState<string>('');
  const [showNumberSelector, setShowNumberSelector] = useState(false);
  const [allPlans, setAllPlans] = useState<{id: string; name: string; category: string}[]>([]);

  // Prefill passcode, category, group, number, and plan when opening Activate dialog
  useEffect(() => {
    const prefill = async () => {
      if (!showCoordinatorDialog || coordinatorAction !== 'activate') return;
      try {
        const firstPlan = lead.plans?.[0];
        setEditableCategory(firstPlan?.category || '');
        setSelectedGroup(firstPlan?.group || '');
        
        // Set editable number and plan (and store originals)
        const planNumber = firstPlan?.number || '';
        const planName = firstPlan?.plan || '';
        setEditableNumber(planNumber);
        setEditableNumberId(firstPlan?.numberId || '');
        setEditablePlan(planName);
        setOriginalNumber(planNumber);
        setOriginalPlan(planName);
        
        if (firstPlan?.numberId && !firstPlan.numberId.startsWith('virtual-')) {
          const numberRef = doc(db, 'numberPool', firstPlan.numberId);
          const numberDoc = await getDoc(numberRef);
          if (numberDoc.exists()) {
            const numberData = numberDoc.data();
            setEditablePasscode(numberData?.passcode || '');
          } else {
            setEditablePasscode('');
          }
        } else {
          setEditablePasscode('');
        }
        
        // Load all plans for the dropdown
        const plans = await getPlans();
        setAllPlans(plans);
      } catch (_) {
        setEditablePasscode('');
      }
    };
    prefill();
  }, [showCoordinatorDialog, coordinatorAction, lead]);

  // Prefill number, category, group and passcode for Assign dialog (read-only display)
  useEffect(() => {
    const prefillAssign = async () => {
      if (!showCoordinatorDialog || coordinatorAction !== 'assign') {
        setAssignPasscode('');
        return;
      }

      try {
        const firstPlan = lead.plans?.[0];
        if (firstPlan?.numberId && !firstPlan.numberId.startsWith('virtual-')) {
          const numberRef = doc(db, 'numberPool', firstPlan.numberId);
          const numberDoc = await getDoc(numberRef);
          if (numberDoc.exists()) {
            const numberData = numberDoc.data() as any;
            setAssignPasscode(numberData.passcode || '');
          } else {
            setAssignPasscode('');
          }
        } else {
          setAssignPasscode('');
        }
      } catch (error) {
        console.error('Error pre-filling assign passcode:', error);
        setAssignPasscode('');
      }
    };

    prefillAssign();
  }, [showCoordinatorDialog, coordinatorAction, lead.plans, lead.id]);
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

  const normalizeLogDate = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value.toDate === 'function') return value.toDate();
    if (typeof value.toMillis === 'function') return new Date(value.toMillis());
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  const stopWhatsAppLogsListener = () => {
    if (whatsappLogsUnsubRef.current) {
      whatsappLogsUnsubRef.current();
      whatsappLogsUnsubRef.current = null;
    }
  };

  const startWhatsAppLogsListener = () => {
    try {
      const logsCol = collection(db, 'leads', lead.id, 'whatsappLogs');
      const logsQuery = query(logsCol, orderBy('createdAt', 'asc'));
      whatsappLogsUnsubRef.current = onSnapshot(
        logsQuery,
        snapshot => {
          const rows = snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data(),
            createdAt: docSnap.data().createdAt
          }));
          setWhatsAppLogs(rows as any[]);
        },
        error => {
          if (error.code !== 'permission-denied') {
            console.error('Error listening to WhatsApp logs:', error);
            toast.error('Failed to listen to WhatsApp chat updates');
          }
          stopWhatsAppLogsListener();
        }
      );
    } catch (error) {
      console.error('Error starting WhatsApp logs listener:', error);
    }
  };

  useEffect(() => {
    if (!showWhatsAppChat) {
      stopWhatsAppLogsListener();
    }
    return () => {
      stopWhatsAppLogsListener();
    };
  }, [showWhatsAppChat]);
  
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
  const [plans, setPlans] = useState<any[]>([]);
  const [planDetails, setPlanDetails] = useState<{ amount: string; benefits: string; duration: string } | null>(null);
  const [planPasscodes, setPlanPasscodes] = useState<Record<string, string>>({});

  const isUserCoordinator = isCoordinator();

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
    lead.status === 'pending_verification' ||
    (user?.role === 'agent' && user.id === lead.agentId && lead.status === 'non_verified') ||
    isAdmin() ||
    isCoordinator()
  );
  const canVerify = isVerifier() && (lead.status === 'pending_verification' || lead.status === 'non_verified' || lead.status === 'activated_non_verified');
  const isUserManager = isManager();
  // Manager can assign verified leads or follow_up leads that haven't been assigned yet
  const canManagerAssign = isUserManager && 
    ((lead.status === 'verified' && !lead.managerAssigned) || 
     (lead.status === 'follow_up' && !lead.managerAssigned)) && 
    user?.id === lead.managerId;
  // Agent can also request assignment to coordinator for their own verified/follow_up leads
  const canAgentAssignToCoordinator =
    user?.role === 'agent' &&
    user.id === lead.agentId &&
    ((lead.status === 'verified' && !lead.managerAssigned) ||
     (lead.status === 'follow_up' && !lead.managerAssigned));

  // Helper function to get service provider based on group
  const getServiceProvider = (group: string) => {
    switch (group?.toUpperCase()) {
      case 'G1':
        return 'Express Dial';
      case 'G2':
        return 'ConnectCC';
      case 'G3':
        return 'Telecon';
      default:
        return group || 'Unknown Group';
    }
  };

  // Helper function to generate formatted assignment message
  const generateAssignmentMessage = async (lead: Lead, etisalatId: string, emirate: string) => {
    // Get the actual passcode from number pool
    let passcode = 'N/A';
    if (lead.plans?.[0]?.numberId && !lead.plans[0].numberId.startsWith('virtual-')) {
      try {
        const numberRef = doc(db, 'numberPool', lead.plans[0].numberId);
        const numberDoc = await getDoc(numberRef);
        if (numberDoc.exists()) {
          const numberData = numberDoc.data();
          passcode = numberData.passcode || 'N/A';
        }
      } catch (error) {
        console.error('Error fetching number passcode:', error);
      }
    }

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

    const partner = getServiceProvider(lead.plans?.[0]?.group || '');
    const currentDate = new Date().toLocaleDateString();
    
        return `Partner: ${partner}
Date: ${currentDate}
Etisalat Portal ID: ${etisalatId}
Customer Details
Customer Name: ${lead.customerName}
Customer Number: ${lead.customerNumber}
Selected Number: ${lead.plans?.[0]?.number || 'N/A'}
Passcode: ${passcode}
Plan Selected: ${lead.plans?.[0]?.plan || 'N/A'}
Additional Details
Gender: ${lead.gender || 'N/A'}
Paid or Free: ${lead.advancePayment ? 'Paid' : 'Free'}
Emirates: ${emirate}
Address: ${lead.customerAddress || 'N/A'}
Nationality: ${lead.country || 'N/A'}
Sales Person: ${agentName}
Language: ${lead.language || 'N/A'}`;
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
    }
  }, [lead.verificationMedia]);

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

  const handleVerificationAction = async () => {
    setIsVerifyActionProcessing(true);
    try {
      const leadRef = doc(db, 'leads', lead.id);
      
      // Handle activated_non_verified status - convert to activated when verified
      let leadStatus = verifyAction === 'verify' ? 
                      (lead.status === 'activated_non_verified' ? 'activated' : 'verified') 
                      : verifyAction === 'reject' ? 'rejected'
                      : 'non_verified';
      
     // console.log('Setting lead status to:', leadStatus);
      
      await updateDoc(leadRef, {
        status: leadStatus,
        verifierId: user?.id,
        verifiedBy: user?.id, // ✅ Add this field for dashboard metrics
        verificationNotes: verificationNote,
        verificationMedia: verificationMedia,
        updatedAt: serverTimestamp(),
        ...(leadStatus === 'verified' || leadStatus === 'activated' ? { verifiedAt: serverTimestamp() } : {})
      });

      // Increment verifier counters if lead is verified or activated
      if ((leadStatus === 'verified' || leadStatus === 'activated') && user?.id) {
        await incrementVerifierCounters(user.id);
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
              await updateDoc(numberRef, {
                status: 'reserved',
                lastStatusChange: serverTimestamp(),
                claimingAgentId: nextClaim.agentId,
                claimingStartedAt: serverTimestamp(),
                claimingExpiresAt: new Date(Date.now() + 2 * 60 * 1000), // 2 minutes
                claimQueue: numberData.claimQueue.slice(1),
                leadId: lead.id
              });

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
              await updateDoc(numberRef, {
                status: 'open',
                lastStatusChange: serverTimestamp(),
                claimingAgentId: null,
                claimingStartedAt: null,
                claimingExpiresAt: null,
                claimQueue: [],
                leadId: lead.id
              });

              await logNumberAction(
                plan.numberId,
                plan.number || '',
                'status_changed',
                { status: numberData?.status },
                { status: 'open', leadId: lead.id },
                `Verifier ${user?.name || 'Unknown'} rejected lead, set number open`
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
                claimingExpiresAt: new Date(Date.now() + 20 * 60 * 1000), // 20 minutes claim timer
                claimQueue: claimQueue.slice(1),
                leadId: lead.id
              });

              // Log status change
              await logNumberAction(
                plan.numberId,
                plan.number || '',
                'status_changed',
                { status: numberData?.status },
                { status: 'reserved', reservedBy: agentId, leadId: lead.id },
                `Verifier ${user?.name || 'Unknown'} marked lead as non verified, number reserved for agent ${agentId}, claim timer started`
              );

              // If there's a second claim, send them notification
              if (claimQueue.length > 1) {
                await addDoc(collection(db, 'notifications'), {
                  userId: claimQueue[1].agentId,
                  type: 'number_claimed',
                  title: 'Number Claim Started',
                  message: `The number is now available for your claim. You have 20 minutes to take ownership.`,
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
                claimingExpiresAt: new Date(Date.now() + 20 * 60 * 1000), // 20 minutes claim timer
                leadId: lead.id
              });

              await logNumberAction(
                plan.numberId,
                plan.number || '',
                'status_changed',
                { status: numberData?.status },
                { status: 'reserved', reservedBy: agentId, leadId: lead.id },
                `Verifier ${user?.name || 'Unknown'} marked lead as non verified, number reserved for agent ${agentId}, existing claim timer restarted`
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

              await logNumberAction(
                plan.numberId,
                plan.number || '',
                'status_changed',
                { status: numberData?.status },
                { status: 'reserved', reservedBy: agentId, leadId: lead.id },
                `Verifier ${user?.name || 'Unknown'} marked lead as non verified, number reserved for agent ${agentId}`
              );
            }
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

      // Fetch the latest lead data from Firestore to ensure we have the correct agentId
      // This is important because if a verifier edited the lead, the component state might be stale
      const leadDoc = await getDoc(leadRef);
      const latestLeadData = leadDoc.exists() ? leadDoc.data() : null;
      const agentId = latestLeadData?.agentId || lead.agentId;

      // Send notification to the agent
      if (agentId) {
        const statusMessage = leadStatus === 'verified' ? 'Lead Verified' : 
                            leadStatus === 'rejected' ? 'Lead Rejected' : 
                            'Lead Marked as Non Verified';
        
        await addDoc(collection(db, 'notifications'), {
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
        });

        // Send WhatsApp notification to agent if they have a phone number
        try {
          const agentRef = doc(db, 'users', agentId);
          const agentDoc = await getDoc(agentRef);
          if (agentDoc.exists()) {
            const agentData = agentDoc.data();
            const agentPhone = agentData.phoneNumber || agentData.phoneNumbers?.[0];
            
            if (agentPhone) {
              // WhatsApp credentials are now fetched from Firebase via whatsappRouter.ts
              // The sendWhatsAppTemplateByGroup function handles credentials automatically
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
                  // Optional: override template if agent notification template differs
                  // templateOverride: { templateName: 'leadstatus', languageCode: 'en' }
                });
              } catch (e) {
              }
            }
          }
        } catch (error) {
          //console.error('Error sending WhatsApp notification to agent:', error);
          // Continue with the rest of the function even if WhatsApp fails
        }
      }

      // Add verification note as a chat message if it exists
      if (verificationNote && verificationNote.trim() !== '') {
        try {
          await addDoc(collection(db, 'chatMessages'), {
            leadId: lead.id,
            userId: user?.id || '',
            userRole: user?.role || 'verifier',
            message: verificationNote.trim(),
            createdAt: new Date()
          });

          // Send WhatsApp notification to manager after message is added to chat
          const { sendChatMessageWhatsAppNotification } = await import('../../utils/chatNotifications');
          await sendChatMessageWhatsAppNotification(lead, verificationNote.trim(), user?.name || 'Unknown');
        } catch (chatError) {
          console.error('Error creating verification chat message:', chatError);
          // Don't fail verification action if chat message fails
        }
      }

      toast.success(`Lead ${verifyAction === 'verify' ? 'verified' : verifyAction === 'reject' ? 'rejected' : 'updated'} successfully`);
      setShowVerifyDialog(false);
      setVerificationNote('');
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
      // Change status to 'assigned_to_cord' when manager assigns to coordinator
      await updateDoc(leadRef, {
        status: 'assigned_to_cord',
        managerAssigned: true,
        managerNotes: managerNote.trim() || '',
        updatedAt: serverTimestamp()
      });

      // Note: Coordinators will see this lead in their unassigned list via filtering
      // No need to send notification as coordinators check for verified leads with managerAssigned: true

      // Add manager note as a chat message if it exists
      if (managerNote && managerNote.trim() !== '') {
        try {
          await addDoc(collection(db, 'chatMessages'), {
            leadId: lead.id,
            userId: user?.id || '',
            userRole: user?.role || 'manager',
            message: managerNote.trim(),
            createdAt: new Date()
          });
          
          // Send WhatsApp notification for the chat message
          const { sendChatMessageWhatsAppNotification } = await import('../../utils/chatNotifications');
          await sendChatMessageWhatsAppNotification(lead, managerNote.trim(), user?.name || 'Unknown');
        } catch (chatError) {
          console.error('Error creating manager chat message:', chatError);
          // Don't fail manager action if chat message fails
        }
      }

      toast.success('Lead assigned to coordinator successfully');
      setShowManagerAssignDialog(false);
      setManagerNote('');
      
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

  const handleCoordinatorAction = async () => {
    // Validate required fields for assignment
    if (coordinatorAction === 'assign') {
      if (!etisalatLeadId.trim()) {
        toast.error('Etisalat Lead ID is required');
        return;
      }
      if (!selectedEmirate) {
        toast.error('Please select an Emirates');
        return;
      }
    }
    if (coordinatorAction === 'activate') {
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
      const numberChanged = coordinatorAction === 'activate' && editableNumber !== originalNumber;
      const planChanged = coordinatorAction === 'activate' && editablePlan !== originalPlan;
      const hasChanges = numberChanged || planChanged;
      
      const updateData: Partial<Lead> = {
        status: coordinatorAction === 'assign' ? 'assigned' : 
                coordinatorAction === 'activate' ? (hasChanges ? 'activated_non_verified' : 'activated') : 
                coordinatorAction === 'later' ? 'later' : 
                coordinatorAction === 'reject' ? 'rejected' : 'follow_up',
        coordinatorNotes: coordinatorNote,
        updatedAt: new Date()
      };

      if (coordinatorAction === 'assign') {
        updateData.coordinatorId = user!.id;
        // Store additional assignment data
        updateData.etisalatLeadId = etisalatLeadId;
        updateData.emirate = selectedEmirate;
      }
      if (coordinatorAction === 'activate') {
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
      
      // When marking as follow_up or later, reset managerAssigned to false so manager can see it in unassigned section
      if (coordinatorAction === 'followup' || coordinatorAction === 'later') {
        updateData.managerAssigned = false;
      }
      
      // When marking as later, store the scheduled date
      if (coordinatorAction === 'later' && scheduledForDate) {
        updateData.scheduledFor = new Date(scheduledForDate);
      }

      await updateDoc(leadRef, updateData);

      // Handle number pool updates for activation with number change
      if (coordinatorAction === 'activate' && numberChanged) {
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
        
        // Update the new number to activated or activated_non_verified
        if (editableNumberId && !editableNumberId.startsWith('virtual-')) {
          const newNumberRef = doc(db, 'numberPool', editableNumberId);
          const newNumberDoc = await getDoc(newNumberRef);
          if (newNumberDoc.exists()) {
            await updateDoc(newNumberRef, {
              status: hasChanges ? 'activated_non_verified' : 'activated',
              lastStatusChange: new Date(),
              leadId: lead.id,
              ...(selectedGroup ? { group: selectedGroup } : {})
            });
            
            await logNumberAction(
              editableNumberId,
              editableNumber,
              'status_changed',
              { status: newNumberDoc.data()?.status },
              { status: hasChanges ? 'activated_non_verified' : 'activated', leadId: lead.id },
              `Coordinator ${user?.name || 'Unknown'} activated with number change`
            );
          }
        }
      } else if (coordinatorAction === 'reject') {
        // Reject flow - Set number status to 'open'
        if (lead.plans && lead.plans.length > 0) {
          const realPlans = lead.plans.filter(p => !p.numberId?.startsWith('virtual-'));
          const updatePromises = realPlans.map(async (plan) => {
            const numberRef = doc(db, 'numberPool', plan.numberId);
            const numberDoc = await getDoc(numberRef);
            if (!numberDoc.exists()) {
              return;
            }
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
              { status: numberData?.status },
              { status: 'open', leadId: null },
              `Coordinator ${user?.name || 'Unknown'} rejected lead, set number to open`
            );
          });
          
          await Promise.all(updatePromises);
        }
      } else {
        // Normal flow - Update all numbers in the lead's plans (skip virtual entries like virtual-mnp)
      if (lead.plans && lead.plans.length > 0) {
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
                 coordinatorAction === 'later' ? 'Lead Marked for Later' : 
                 coordinatorAction === 'reject' ? 'Lead Rejected' : 'Lead Marked for Follow-up',
          message: coordinatorAction === 'assign' ? 
            'Your lead has been assigned by the coordinator' : 
            coordinatorAction === 'activate' ?
            (hasChanges ? 
              `Your lead has been activated with changes (${numberChanged ? 'number' : ''}${numberChanged && planChanged ? ' and ' : ''}${planChanged ? 'plan' : ''}) - pending verifier approval` :
              'Your lead has been activated by the coordinator') :
            coordinatorAction === 'later' ?
            'Your lead has been marked for later by the coordinator' :
            coordinatorAction === 'reject' ?
            'Your lead has been rejected by the coordinator' :
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
                   coordinatorAction === 'later' ? 'Lead Marked for Later' : 
                   coordinatorAction === 'reject' ? 'Lead Rejected' : 'Lead Marked for Follow-up',
            message: coordinatorAction === 'assign' ? 
              'A lead has been assigned by the coordinator' : 
              coordinatorAction === 'activate' ?
              'A lead has been activated by the coordinator' :
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

        await Promise.all(notificationPromises);

      // For assignment, show formatted message instead of navigating away
      // Add coordinator note as a chat message if it exists
      if (coordinatorNote && coordinatorNote.trim() !== '') {
        try {
          await addDoc(collection(db, 'chatMessages'), {
            leadId: lead.id,
            userId: user?.id || '',
            userRole: user?.role || 'coordinator',
            message: coordinatorNote.trim(),
            createdAt: new Date()
          });

          // Send WhatsApp notification to manager after message is added to chat
          const { sendChatMessageWhatsAppNotification } = await import('../../utils/chatNotifications');
          await sendChatMessageWhatsAppNotification(lead, coordinatorNote.trim(), user?.name || 'Unknown');
        } catch (chatError) {
          console.error('Error creating coordinator chat message:', chatError);
          // Don't fail coordinator action if chat message fails
        }
      }

      if (coordinatorAction === 'assign') {
        const message = await generateAssignmentMessage(lead, etisalatLeadId, selectedEmirate);
        setAssignmentMessage(message);
        setShowAssignmentMessage(true);
        setShowCoordinatorDialog(false);
        setCoordinatorNote('');
        setCoordinatorAction(null);
        toast.success('Lead assigned successfully');
      } else {
        toast.success(
          coordinatorAction === 'activate' ? 'Lead activated successfully' :
          coordinatorAction === 'later' ? 'Lead marked for later' :
          coordinatorAction === 'reject' ? 'Lead rejected successfully' :
          'Lead marked for follow-up'
        );
        setShowCoordinatorDialog(false);
        setCoordinatorNote('');
        setScheduledForDate('');
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
      if (lead.plans && lead.plans.length > 0) {
        const reservePromises = lead.plans.filter(p => p.numberId && !p.numberId.startsWith('virtual-')).map(async plan => {
          const numberRef = doc(db, 'numberPool', plan.numberId);
          await updateDoc(numberRef, {
            status: 'reserved',
            reservedBy: user.id,
            reservedAt: serverTimestamp(),
            lastStatusChange: serverTimestamp(),
            claimingAgentId: null,
            claimingStartedAt: null,
            claimingExpiresAt: null,
            claimQueue: [],
            leadId: lead.id
          });
        });
        await Promise.all(reservePromises);
      }
      toast.success('Lead rejected and number(s) reserved for you.');
      setLocalStatus('rejected');
      setShowRejectDialog(false);
    } catch (error) {
      console.error('Error rejecting lead:', error);
      toast.error('Failed to reject lead.');
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div
          className="flex items-center gap-2 cursor-pointer group"
          onClick={() => navigate('/dashboard')}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              navigate('/dashboard');
            }
          }}
        >
          <span className="p-1 text-gray-400 group-hover:text-gray-500">
            <ChevronLeft className="w-4 h-4" />
          </span>
          <h1 className="text-sm font-medium text-gray-900 group-hover:underline">
            Back to Dashboard
          </h1>
        </div>
      </div>

      {/* Restored header and action bar */}
      <div className="px-2 sm:px-0 py-2 border-b border-gray-200 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Lead Details</h2>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            View and manage lead information
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
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
                      setCoordinatorAction('reject');
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
                <div className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-green-600">
                  <CheckCircleIcon className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  Lead Activated
                </div>
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
                      setCoordinatorAction('reject');
                      setShowCoordinatorDialog(true);
                    }}
                    className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                  >
                    <XCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    Reject
                  </button>
                </>
              )}
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
                  setVerifyAction('non_verified');
                  setShowVerifyDialog(true);
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
              onClick={onEdit}
              className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent text-xs sm:text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {user?.role === 'agent' && user.id === lead.agentId && lead.status === 'non_verified' ? 'Edit & Resubmit' : 'Edit Lead'}
            </button>
          )}
          {user?.role === 'agent' && user.id === lead.agentId && lead.status === 'non_verified' && (
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
           {user?.id === lead.agentId && !['pending_verification', 'activated', 'rejected'].includes(localStatus) && (
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
          {/* WhatsApp Chat Button for Agents */}
          {(() => {
            return user?.role === 'agent' && user.id === lead.agentId && (lead as any).verificationMethod === 'whatsapp';
          })() && (
            <button
              onClick={() => {
                setShowWhatsAppChat(true);
                if (!whatsappLogsUnsubRef.current) {
                  startWhatsAppLogsListener();
                }
              }}
              className="inline-flex items-center px-3 sm:px-4 py-2 border border-transparent rounded-md shadow-sm text-xs sm:text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              <MessageCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              WhatsApp Chat
            </button>
          )}
        </div>
      </div>

      {showVerifyDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 sm:p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {verifyAction === 'verify' ? 'Verify Lead' :
               verifyAction === 'reject' ? 'Reject Lead' :
               'Mark as Non Verified'}
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Verification Notes
              </label>
              <textarea
                rows={4}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                value={verificationNote}
                onChange={(e) => setVerificationNote(e.target.value)}
                placeholder="Enter any notes about this verification..."
              />
            </div>
            <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 sm:space-x-3">
              <button
                onClick={() => setShowVerifyDialog(false)}
                className="px-3 sm:px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleVerificationAction}
                disabled={isVerifyActionProcessing}
                className={`inline-flex items-center px-3 sm:px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                  verifyAction === 'verify' ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500' :
                  verifyAction === 'reject' ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' :
                  'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500'
                }`}
              >
                {isVerifyActionProcessing ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                    </svg>
                    Processing...
                  </>
                ) : (
                  'Confirm'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMediaModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-6 w-full max-w-6xl mx-2 sm:mx-4 shadow-2xl max-h-[95vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
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

            {/* Progress Bar */}
            <div className="mb-3">
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
            <div className="mb-4 sm:mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                {VERIFY_CHECKLIST.map((section, idx) => {
                  const hasLongContent = section.details.length > 2 || section.details.some(item => item.length > 50);
                  const isExpanded = expandedSections[idx];
                  const isAcknowledgementOfTerms = section.header === 'Acknowledgement of Terms';
                  
                  return (
                    <div 
                      key={section.header} 
                      className={`p-2.5 sm:p-3 rounded-lg border transition-all duration-300 active:scale-95 ${
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
                          <div className={`w-6 h-6 sm:w-5 sm:h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
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
                          setShowMediaModal(false);
                          setVerifyAction('verify');
                          setShowVerifyDialog(true);
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

            {/* Footer */}
            <div className="flex justify-end mt-3 pt-2 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowMediaModal(false);
                  setVerifyChecklist(VERIFY_CHECKLIST.map(() => false));
                  setExpandedSections(VERIFY_CHECKLIST.map(() => false));
                }}
                className="px-4 sm:px-6 py-2 sm:py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors active:scale-95"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showCoordinatorDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-3xl w-full mx-4 overflow-hidden">
            {/* Header */}
            <div className={`px-6 py-4 ${
              coordinatorAction === 'reject' ? 'bg-gradient-to-r from-red-500 to-red-600' :
              'bg-gradient-to-r from-indigo-500 to-purple-600'
            }`}>
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  {coordinatorAction === 'assign' ? (
                    <User2 className="h-5 w-5 text-white" />
                  ) : coordinatorAction === 'activate' ? (
                    <CheckCircle className="h-5 w-5 text-white" />
                  ) : coordinatorAction === 'later' ? (
                    <Clock className="h-5 w-5 text-white" />
                  ) : coordinatorAction === 'reject' ? (
                    <XCircle className="h-5 w-5 text-white" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-white" />
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {coordinatorAction === 'assign' ? 'Assign Lead' :
                     coordinatorAction === 'activate' ? 'Activate Lead' : 
                     coordinatorAction === 'later' ? 'Mark for Later' : 
                     coordinatorAction === 'reject' ? 'Reject Lead' : 'Mark for Follow-up'}
                  </h3>
                  <p className="text-indigo-100 text-sm">
                    {coordinatorAction === 'assign' ? 'Assign this lead to Etisalat system' :
                     coordinatorAction === 'activate' ? 'Activate the lead and mark as complete' :
                     coordinatorAction === 'later' ? 'Mark this lead for later action' :
                     coordinatorAction === 'reject' ? 'Reject this lead and set number status to open' :
                     'Mark this lead for follow-up action'}
                  </p>
                </div>
              </div>
            </div>

            {/* Form Content */}
            <div className="p-6 space-y-6">
              {coordinatorAction === 'activate' && (
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

                  {/* Notes for Activate action */}
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
              {coordinatorAction === 'assign' && (
                <>
                  {/* Number, Category, Group & Passcode summary */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-900">Number</label>
                        <input
                          type="text"
                          className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900"
                          value={lead.plans?.[0]?.number || ''}
                          readOnly
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-900">Category</label>
                        <input
                          type="text"
                          className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900"
                          value={lead.plans?.[0]?.category || ''}
                          readOnly
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-900">Group</label>
                        <input
                          type="text"
                          className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900"
                          value={lead.plans?.[0]?.group || ''}
                          readOnly
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-900">Passcode</label>
                        <input
                          type="text"
                          className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900"
                          value={assignPasscode}
                          readOnly
                          placeholder="Passcode from number pool"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Etisalat Lead ID */}
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
                        className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-red-300 focus:ring-2 focus:ring-red-100 focus:bg-white transition-all duration-200 text-gray-900 placeholder-gray-500"
                        value={etisalatLeadId}
                        onChange={(e) => setEtisalatLeadId(e.target.value)}
                        placeholder="Enter Etisalat Lead ID"
                        required
                      />
                    </div>
                    <p className="text-xs text-gray-500">This ID will be used for tracking in Etisalat system</p>
                  </div>
                  
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
                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-all duration-200 text-gray-900 appearance-none cursor-pointer"
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
              
              {/* Notes for other coordinator actions (activate, followup) removed as requested */}
            </div>

            {/* Footer Actions */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-100">
              <div className="flex flex-col sm:flex-row justify-end gap-3">
                <button
                  onClick={() => {
                    setShowCoordinatorDialog(false);
                    setCoordinatorNote('');
                    setScheduledForDate('');
                    setCoordinatorAction(null);
                  }}
                  disabled={isCoordinatorActionProcessing}
                  className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCoordinatorAction}
                  disabled={isCoordinatorActionProcessing}
                  className={`px-6 py-2.5 text-sm font-medium text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm ${
                    coordinatorAction === 'assign' ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:ring-indigo-100' :
                    coordinatorAction === 'activate' ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 focus:ring-green-100' :
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
                      ) : coordinatorAction === 'activate' ? (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Activate Lead
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
        </div>
      )}

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
                        <p className="text-lg font-semibold text-gray-900">{plan.number}</p>
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
          {/* Hide "Shared With" field from verifier and coordinator roles */}
          {!isVerifier() && !isCoordinator() && (
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
            <div className="flex items-center space-x-2">
              <div className={clsx(
                'px-2.5 py-1 rounded-full text-xs font-medium',
                lead.status === 'verified' ? 'bg-green-100 text-green-800' :
                lead.status === 'rejected' ? 'bg-red-100 text-red-800' :
                lead.status === 'non_verified' ? 'bg-yellow-100 text-yellow-800' :
                lead.status === 'pending_coordinator' ? 'bg-blue-100 text-blue-800' :
                lead.status === 'split' ? 'bg-purple-100 text-purple-800' :
                'bg-gray-100 text-gray-800'
              )}>
                {lead.status === 'non_verified' ? 'Non Verified' : lead.status === 'follow_up' ? 'Follow-up' : lead.status}
              </div>
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

      {/* WhatsApp Chat Modal */}
      {showWhatsAppChat && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">WhatsApp Verification Chat</h3>
              <button
                onClick={() => setShowWhatsAppChat(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {whatsAppLogs.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <MessageCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No WhatsApp messages found for this lead.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {whatsAppLogs
                    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                    .map((log) => {
                    const created = normalizeLogDate(log.createdAt);
                      const createdStr = created ? `${format(created, 'MMM d, yyyy HH:mm')}` : '';
                      const fromDigits = (log.from || '').toString().replace(/\D/g, '');
                      const fromDisplay = fromDigits ? `+${fromDigits}` : '';
                      const firstPlan = lead.plans?.[0];
                      const planInfo = planDetails;
                      const isOutbound = log.direction === 'outbound';
                    const createdTime = created?.getTime() ?? 0;
                    const hasCustomerReplyAfter =
                      isOutbound &&
                      whatsAppLogs.some(other => {
                        if (other.id === log.id || other.direction !== 'inbound') return false;
                        const otherCreated = normalizeLogDate(other.createdAt);
                        return (otherCreated?.getTime() ?? 0) > createdTime;
                      });
                    const deriveStatus = (): 'read' | 'delivered' | 'sent' | 'failed' | undefined => {
                      if (!isOutbound) return undefined;
                      if (log.status === 'failed') return 'failed';
                      if (log.status === 'read' || hasCustomerReplyAfter) return 'read';
                      if (log.status === 'delivered') return 'delivered';
                      if (log.status === 'sent' || log.status === 'accepted') return 'sent';
                      return log.status ? 'sent' : undefined;
                    };
                    const effectiveStatus = deriveStatus();
                    const statusLabelMap: Record<string, string> = {
                      read: 'Read',
                      delivered: 'Delivered',
                      sent: 'Sent',
                      failed: 'Failed'
                    };
                      const CONSENT_ORDER: Array<{ key: string; label: string }> = [
                        {
                          key: 'ownershipAfterContract',
                          label:
                            'The chosen number becomes yours only after completing the contract. During this period, transfer of ownership is not permitted, and porting out to other telecom providers is restricted. Plan upgrades (within the same category) are allowed; downgrades or switching to prepaid are not allowed.'
                        },
                        {
                          key: 'proRatedAgree',
                          label:
                            'Multi-SIM is available exclusively with the Limited Data Packages; this feature is not available with Non-Stop Data plans. The plan will be pro-rated. In case of early cancellation, all pending bills must be cleared along with one-month rental + 5% VAT, and the number will be reclaimed by Etisalat.'
                        },
                        {
                          key: 'gracePeriodAcknowledge',
                          label:
                            'If you are not a UAE citizen, you must pay half or full monthly rental in advance at activation, which will be adjusted in the 4th month of your billing cycle. In case of technical or network-related issues, or misinformation, you can cancel the plan without charges within the first five days.'
                        },
                        {
                          key: 'dataAccuracyAcknowledge',
                          label:
                            'The information provided regarding the number and plan is accurate. Any other information received will not be considered valid. Please read this carefully and confirm, as this communication will be referenced in the event of any future complaints regarding the number or plan.'
                        },
                        {
                          key: 'acceptAllTerms',
                          label: 'Accept all the Terms & Conditions.'
                        }
                      ];
                      const accepted = Array.isArray(CONSENT_ORDER)
                        ? CONSENT_ORDER.filter(i => log.consents?.[i.key] === true)
                        : [];
                      
                      return (
                        <div key={log.id} className={clsx('flex', isOutbound ? 'justify-end' : 'justify-start')}>
                          <div className={clsx('max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border',
                            isOutbound ? 'bg-indigo-50 text-indigo-900 border-indigo-100' : 'bg-emerald-50 text-emerald-900 border-emerald-100'
                          )}>
                            <div className="flex items-center justify-between text-[11px] text-gray-500/80 mb-2">
                              <span className={clsx('px-2 py-0.5 rounded-full border', isOutbound ? 'bg-white text-indigo-700 border-indigo-100' : 'bg-white text-emerald-700 border-emerald-100')}>
                                {isOutbound ? 'Outbound' : 'Inbound'}
                              </span>
                              <span className="ml-2 flex items-center gap-1.5">
                                {fromDisplay && (
                                  <span className="font-bold text-blue-600">From {fromDisplay}</span>
                                )}
                                {createdStr && ` · ${createdStr}`}
                                {isOutbound && (
                                  <span
                                    className="ml-1.5 inline-flex items-center"
                                    title={effectiveStatus ? `Message ${statusLabelMap[effectiveStatus] || effectiveStatus}` : 'Message sent'}
                                  >
                                    {effectiveStatus === 'read' && (
                                      <CheckCheck className="w-4 h-4 text-green-500" />
                                    )}
                                    {effectiveStatus === 'delivered' && (
                                      <CheckCheck className="w-4 h-4 text-gray-600" />
                                    )}
                                    {(!effectiveStatus || effectiveStatus === 'sent') && (
                                      <Check className="w-3.5 h-3.5 text-gray-500" />
                                    )}
                                    {effectiveStatus === 'failed' && (
                                      <XCircle className="w-4 h-4 text-red-500" />
                                    )}
                                  </span>
                                )}
                              </span>
                            </div>
                            {/* Summary only for the acceptance message (when consents are present) */}
                            {accepted.length > 0 && firstPlan && (
                              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mb-3 shadow-sm">
                                <div className="flex items-center gap-2 mb-3">
                                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                  <h4 className="text-sm font-semibold text-blue-900">Plan & Number Summary</h4>
                                </div>
                                <div className="space-y-2 text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-700">Selected Number:</span>
                                    <span className="font-semibold text-gray-900">{firstPlan.number}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-gray-700">Monthly Plan:</span>
                                    <span className="font-semibold text-gray-900">
                                      {firstPlan.plan ? 
                                        (() => {
                                          const match = firstPlan.plan.match(/\d+/);
                                          return match ? `${match[0]} AED + 5% VAT` : firstPlan.plan;
                                        })() 
                                        : ''
                                      }
                                    </span>
                                  </div>
                                  {planInfo?.benefits && planInfo.benefits !== 'N/A' && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-700">Benefits:</span>
                                      <span className="font-semibold text-gray-900">{planInfo.benefits}</span>
                                    </div>
                                  )}
                                  {planInfo?.duration && planInfo.duration !== 'N/A' && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-700">Contract Duration:</span>
                                      <span className="font-semibold text-gray-900">{planInfo.duration} Year</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            {log.messageText && (
                              <div className="text-sm whitespace-pre-wrap mb-2">{log.messageText}</div>
                            )}
                            {/* Show error message if status is failed */}
                            {effectiveStatus === 'failed' && log.error && (() => {
                              const errorObj = log.error as any;
                              let errorText = '';
                              let errorCode = '';
                              let errorExplanation = '';
                              
                              if (typeof log.error === 'string') {
                                errorText = log.error;
                              } else if (errorObj) {
                                // WhatsApp error structure: { code, title, message, error_data }
                                const parts = [];
                                if (errorObj.title) parts.push(errorObj.title);
                                // Only add message if it's different from title (avoid duplication)
                                if (errorObj.message && errorObj.message !== errorObj.title) {
                                  parts.push(errorObj.message);
                                }
                                errorText = parts.length > 0 ? parts.join(' - ') : '';
                                errorCode = errorObj.code || '';
                                
                                // Provide user-friendly explanations for common error codes
                                const errorExplanations: Record<string, string> = {
                                  '131026': 'The customer\'s phone number is not registered on WhatsApp or has blocked your business number.',
                                  '131047': 'The customer has not replied within the 24-hour messaging window. Send a template message to re-engage.',
                                  '131051': 'This type of message is not supported. Try using a different message format.',
                                  '131052': 'Media download failed. The media file may be corrupted or too large.',
                                  '131053': 'Media upload failed. Check the file format and size.',
                                  '133000': 'The phone number format is invalid. Use international format (e.g., 971XXXXXXXXX).',
                                  '133004': 'The template message was rejected. Verify the template name and parameters.',
                                  '133005': 'Template not found. Make sure the template is approved in Meta Business Manager.',
                                  '133006': 'Invalid template parameters. Check parameter count and format.',
                                  '133010': 'Message limit exceeded. You\'ve reached the messaging limit for this customer.',
                                  '130472': 'The customer has opted out of marketing messages. They must opt back in before you can send them marketing content.',
                                  '135000': 'Generic WhatsApp Business API error. Contact support if this persists.',
                                  '136000': 'Insufficient WhatsApp Business Account balance. Add funds to continue messaging.',
                                  '368': 'Temporarily blocked for spammy behavior. Reduce message frequency.',
                                  '131031': 'Rate limit exceeded. Too many messages sent in a short time. Wait before retrying.',
                                };
                                
                                errorExplanation = errorExplanations[errorCode] || '';
                              }
                              
                              return (
                                <div className="mt-2 bg-red-100 border border-red-300 rounded-lg p-2.5">
                                  <div className="flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                                    <div className="flex-1 text-xs text-red-800">
                                      <div className="font-semibold mb-1">Message Failed</div>
                                      {errorText && <div className="text-red-700 mb-1">{errorText}</div>}
                                      {errorCode && <div className="text-red-600 font-mono mb-1">Error Code: {errorCode}</div>}
                                      {errorExplanation && (
                                        <div className="mt-2 pt-2 border-t border-red-200 text-red-900 leading-relaxed">
                                          <span className="font-semibold">💡 What to do: </span>
                                          {errorExplanation}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                            {accepted.length > 0 && (
                              <ol className="mt-1 space-y-2 text-sm">
                                {accepted.map((item, idx) => (
                                  <li key={item.key} className="flex items-start">
                                    <span className="mr-2 text-gray-700">{idx + 1}.</span>
                                    <span className="text-gray-900">
                                      {item.label}
                                      <span className="ml-2 inline-flex items-center text-green-600 text-xs font-medium align-middle">
                                        <svg className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M16.704 5.29a1 1 0 00-1.408-1.418L7.5 11.66 4.704 8.864a1 1 0 10-1.408 1.418l3.5 3.5a1 1 0 001.408 0l8.5-8.5z" clipRule="evenodd"/></svg>
                                        Accepted
                                      </span>
                                    </span>
                                  </li>
                                ))}
                              </ol>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
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