/**
 * ===============================================================================
 * VERIFIER DASHBOARD COMPONENT - LEAD VERIFICATION INTERFACE
 * ===============================================================================
 * 
 * This component provides the main dashboard for verifiers, enabling them to
 * review and verify leads submitted by agents. It includes verification workflows,
 * WhatsApp integration, and comprehensive lead management tools.
 * 
 * FEATURES:
 * 
 * 1. VERIFICATION WORKFLOW MANAGEMENT
 *    - Pending verification leads display with detailed information
 *    - Verification checklist integration for standard compliance
 *    - Approve/reject functionality with detailed notes
 * 
 * 2. WHATSAPP INTEGRATION
 *    - Ready-made message templates for customer communication
 *    - Direct WhatsApp messaging capabilities for verification
 *    - Customer response tracking and conversation management
 * 
 * 3. PERFORMANCE TRACKING
 *    - Daily and monthly verification statistics
 *    - Real-time metrics and performance indicators
 *    - Verification history and audit trails
 * 
 * 4. LEAD DETAILS AND MEDIA
 *    - Comprehensive lead information display
 *    - Media attachment viewing and management
 *    - Customer contact information and interaction history
 * 
 * 5. WORKFLOW OPTIMIZATION
 *    - Pagination and search capabilities
 *    - Real-time updates for assigned leads
 *    - Efficient data loading with caching
 * 
 * USAGE:
 * This component is used by users with 'verifier' role to streamline
 * the lead verification process and maintain quality standards.
 * ===============================================================================
 */

import { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, orderBy, doc, updateDoc, getDoc, addDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { User, Lead } from '../../types';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { format } from 'date-fns';
import { WhatsAppConversationView, WhatsAppMessage } from '../WhatsApp/WhatsAppConversationView';
import { normalizeTimestamp, getTimestampForSort } from '../../utils/timestampUtils';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  Calendar,
  Phone,
  Package,
  User2,
  Eye,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Check,
  CheckCheck,
  Paperclip,
  AlertCircle,
  Users,
  Hash,
  ArrowRight,
  Target,
  CheckCircle2
} from 'lucide-react';
import { clsx } from 'clsx';
// import { planBenefits } from '../../utils/planBenefits'; // Now using dynamic benefits from Firebase
// import { VerifyLeadModal } from '../Leads/VerifyLeadModal';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { MediaUpload } from '../Leads/MediaUpload';
import { Dialog } from '@headlessui/react';
import { logOutboundVerificationMessage } from '../../utils/whatsappVerification';
import { resolveWhatsAppRoute } from '../../utils/whatsappRouter';
import { incrementVerifierCounters } from '../../utils/verifierCounters';

// Ready-made message templates for verifiers
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

interface VerifierDashboardProps {
  user: User;
}

const PAGE_SIZES = [10, 20, 40, 80] as const;

function getStatusDisplayText(status: string | undefined): string {
  if (!status) return 'Unknown';
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
const hasPostpaidCampaignPlan = (lead: any): boolean => {
  if (!lead.plans || lead.plans.length === 0) return false;
  return lead.plans.some((planItem: any) => 
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

export function VerifierDashboard({ user }: VerifierDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [verificationMetrics, setVerificationMetrics] = useState({
    pendingVerificationCount: 0,
    activatedReverificationCount: 0,
    dailyVerifiedCount: 0,
    monthlyVerifiedCount: 0
  });
  const [verificationLeads, setVerificationLeads] = useState<Lead[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState<typeof PAGE_SIZES[number]>(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [actionType, setActionType] = useState<'verify' | 'reject' | 'followup' | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [showNumberErrorModal, setShowNumberErrorModal] = useState(false);
  const [missingNumbers, setMissingNumbers] = useState<string[]>([]);
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  // Determine if we need to show the postpaid campaign checklist (check selectedLead)
  const showPostpaidCampaignChecklist = selectedLead ? hasPostpaidCampaignPlan(selectedLead) : false;
  
  // Initialize verifyChecklist with base items + conditional campaign item
  const [verifyChecklist, setVerifyChecklist] = useState<boolean[]>(() => {
    const baseChecklist = VERIFY_CHECKLIST.map(() => false);
    if (showPostpaidCampaignChecklist) {
      return [...baseChecklist, false]; // Add one more for campaign checklist
    }
    return baseChecklist;
  });
  
  const [verifyMediaFiles, setVerifyMediaFiles] = useState<Array<{ url: string; type: string; name: string }>>([]);
  const [showWhatsAppLogs, setShowWhatsAppLogs] = useState(false);
  const [whatsAppLogs, setWhatsAppLogs] = useState<any[]>([]);
  const [replyText, setReplyText] = useState('');
  const [resendingLogId, setResendingLogId] = useState<string | null>(null);
  const [resendingFlow, setResendingFlow] = useState(false);
  // Flow state tracking
  const [flowState, setFlowState] = useState<'welcome' | 'terms' | 'delivery' | 'address' | 'nationality' | 'complete'>('welcome');
  const [deliveryData, setDeliveryData] = useState({ name: '', address: '', nationality: '' });
  
  const [expandedSections, setExpandedSections] = useState<boolean[]>(() => {
    const baseExpanded = VERIFY_CHECKLIST.map(() => false);
    if (showPostpaidCampaignChecklist) {
      return [...baseExpanded, false]; // Add one more for campaign checklist
    }
    return baseExpanded;
  });
  const [sendingReply, setSendingReply] = useState(false);
  const [planDetails, setPlanDetails] = useState<{ amount: string; benefits: string; duration: string } | null>(null);
  const logsContainerRef = useRef<HTMLDivElement | null>(null);
  const previousMessageCountRef = useRef<number>(0);
  const lastMessageIdRef = useRef<string | null>(null);

  // Load plan details from Firebase when selectedLead changes
  useEffect(() => {
    async function loadPlanDetails() {
      if (!selectedLead?.plans?.[0]?.plan) {
        setPlanDetails(null);
        return;
      }
      try {
        const planName = selectedLead.plans[0].plan;
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
  }, [selectedLead]);

  // Function to handle template message selection
  const handleTemplateMessage = (template: any) => {
    let message = template.message;
    
    // Replace placeholders with actual data if available
    if (selectedLead) {
      const lead = selectedLead as any;
      const plan = lead.plans?.[0];
      
      message = message
        .replace('{number}', plan?.number || 'selected number')
        .replace('{plan}', plan?.planName || 'selected plan')
        .replace('{benefits}', plan?.benefits?.join(', ') || 'various benefits')
        .replace('{duration}', plan?.contractDuration || '12-month');
    }
    
    setReplyText(message);
  };

  // Handle resending the flow message (can be called without an existing log)
  const handleResendFlow = async () => {
    if (!selectedLead || resendingFlow) {
    if (!selectedLead) {
      toast.error('Select a lead before resending');
      }
      return;
    }

    try {
      setResendingFlow(true);
      const firstPlan = selectedLead?.plans?.[0];
      if (!firstPlan || !planDetails) {
        toast.error('Plan information missing');
        return;
      }

      // Format customer number
      let to = selectedLead.customerNumber;
      if (!to) {
        toast.error('Customer number missing in lead');
        return;
      }
      to = to.replace(/\D/g, '');
      if (to.startsWith('0')) {
        to = to.substring(1);
      }
      if (!to.startsWith('971')) {
        to = `971${to}`;
      }

      const group = selectedLead.plans?.[0]?.group || undefined;
      const language = (selectedLead as any).language || 'English';
      const amountDigits = (planDetails.amount || '').toString().match(/\d+/)?.[0];
      const monthlyLabel = amountDigits ? `${amountDigits} AED + 5% VAT` : planDetails.amount || 'N/A';
      
      const parameters = [
        firstPlan.number || 'N/A',
        monthlyLabel,
        planDetails.benefits || 'N/A',
        planDetails.duration || 'N/A'
      ];

      const { triggerFlowExternal } = await import('../../utils/whatsappRouter');
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

      // Determine flowId for logging
      const flowId = language?.toLowerCase() === 'arabic' ? 'ArabicNewFlow' : 'TestingBot2';
      await logOutboundVerificationMessage(
        selectedLead.id,
        to,
        flowId,
        parameters,
        { sendResponse }
      );

      // Add optimistic message to chat immediately
      const optimisticMessage = {
        id: 'temp-flow-' + Date.now(),
        direction: 'outbound',
        from: to,
        to: to,
        messageText: `Verification flow triggered successfully`,
        templateName: flowId,
        status: 'sent',
        createdAt: new Date(),
        parameters: parameters
      };
      setWhatsAppLogs(prev => {
        // Check if similar message already exists
        const exists = prev.some(msg => 
          msg.templateName === flowId && 
          msg.direction === 'outbound' &&
          Math.abs(new Date(msg.createdAt).getTime() - optimisticMessage.createdAt.getTime()) < 5000
        );
        if (exists) return prev;
        return [...prev, optimisticMessage];
      });

      // Update whatsappInitiatedAt to current time for the resent flow
      await updateDoc(doc(db, 'leads', selectedLead.id), {
        whatsappInitiatedAt: new Date()
      });

      // Trigger immediate fetch
      setTimeout(() => {
        fetchWhatsAppMessagesFromAPI();
      }, 1000);

      toast.success('Flow message resent successfully');
    } catch (error: any) {
      // Check if it's a duplicate contact error - this is actually okay, contact exists
      const errorMessage = error?.message || '';
      const isDuplicateContact = errorMessage.includes('Duplicate entry') && errorMessage.includes('unique_shortcode');
      
      if (isDuplicateContact) {
        // Contact already exists, but flow should still work - treat as success
        toast.success('Flow message resent successfully (contact already exists in system)');
        
        // Still update whatsappInitiatedAt
        try {
          await updateDoc(doc(db, 'leads', selectedLead.id), {
            whatsappInitiatedAt: new Date()
          });
        } catch (updateError) {
          console.error('Failed to update whatsappInitiatedAt:', updateError);
        }
        
        // Trigger immediate fetch
        setTimeout(() => {
          fetchWhatsAppMessagesFromAPI();
        }, 1000);
      } else {
        toast.error(error?.message || 'Failed to resend flow message');
      console.error('Resend flow error:', error);
      }
    } finally {
      setResendingFlow(false);
    }
  };

  const handleResendVerificationMessage = async (log: any) => {
    if (!selectedLead) {
      toast.error('Select a lead before resending');
      return;
    }
    if (!log?.templateName) {
      toast.error('Template information missing for this message');
      return;
    }
    const defaultParameters = (() => {
      const firstPlan = selectedLead?.plans?.[0];
      if (!firstPlan || !planDetails) return [];
      const amountDigits = (planDetails.amount || '').toString().match(/\d+/)?.[0];
      const monthlyLabel = amountDigits ? `${amountDigits} AED + 5% VAT` : planDetails.amount || 'N/A';
      return [
        firstPlan.number || 'N/A',
        monthlyLabel,
        planDetails.benefits || 'N/A',
        planDetails.duration || 'N/A'
      ];
    })();
    const parameters = Array.isArray(log?.parameters) && log.parameters.length > 0 ? log.parameters : defaultParameters;
    if (!Array.isArray(parameters) || parameters.length === 0) {
      toast.error('Unable to determine template parameters');
      return;
    }
    // Always use the current lead's customer number, not the old log number
    // This ensures if the customer number was updated, the resend goes to the new number
    let to = selectedLead.customerNumber;
    if (!to) {
      toast.error('Customer number missing in lead');
      return;
    }
    // Format the number properly for API - Simple logic: remove first 0, add 971
    // Example: 0506789345 -> 971506789345
    to = to.replace(/\D/g, ''); // Remove non-digits
    
    // Remove leading zero if present
    if (to.startsWith('0')) {
      to = to.substring(1);
    }
    
    // Add 971 prefix
    if (!to.startsWith('971')) {
      to = `971${to}`;
    }
    try {
      setResendingLogId(log.id);
      const group = selectedLead.plans?.[0]?.group || undefined;
      const language = (selectedLead as any).language || 'English';
      
      // Extract template variables (ensure we have at least 4 values)
      const value1 = parameters[0] || 'N/A';
      const value2 = parameters[1] || 'N/A';
      const value3 = parameters[2] || 'N/A';
      const value4 = parameters[3] || 'N/A';
      
      const { triggerFlowExternal } = await import('../../utils/whatsappRouter');
      const sendResponse = await triggerFlowExternal({
        phoneNumber: to,
        group,
        language,
        templateVariables: {
          value1,
          value2,
          value3,
          value4
        }
      });
      
      // Determine flowId for logging
      const flowId = language?.toLowerCase() === 'arabic' ? 'ArabicNewFlow' : 'TestingBot2';
      await logOutboundVerificationMessage(
        selectedLead.id,
        to,
        flowId,
        parameters,
        { sendResponse }
      );
      
      // Immediately check for new conversations, then poll
      const checkAndPoll = async () => {
        try {
          const { checkConversation } = await import('../../utils/whatsappRouter');
          const conversationData = await checkConversation(to);
          
          if (conversationData?.success === false) {
            // API error - log but don't show to user (it's expected during polling)
            console.warn('Conversation check failed (will retry):', conversationData.error);
            return;
          }
          
          // The Cloud Function will process any new messages and the real-time listener will update
        } catch (error) {
          // This shouldn't happen now since checkConversation returns error objects
          console.error('Unexpected error checking conversation:', error);
        }
      };
      
      // Check immediately
      await checkAndPoll();
      
      // Poll aggressively: every 2 seconds for first 30 seconds, then every 5 seconds for 2 minutes
      let pollCount = 0;
      const aggressivePolls = 15; // 15 * 2 seconds = 30 seconds
      const normalPolls = 24; // 24 * 5 seconds = 2 minutes
      let isAggressivePhase = true;
      
      const pollInterval = setInterval(async () => {
        pollCount++;
        
        if (isAggressivePhase && pollCount > aggressivePolls) {
          isAggressivePhase = false;
          pollCount = 0;
        } else if (!isAggressivePhase && pollCount > normalPolls) {
          clearInterval(pollInterval);
          return;
        }
        
        await checkAndPoll();
      }, isAggressivePhase ? 2000 : 5000);
      
      // Cleanup after 2.5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
      }, 150000);
      
      toast.success('Verification message resent');
    } catch (error: any) {
      toast.error('Failed to resend WhatsApp message');
      console.error('Resend WhatsApp error:', error);
      try {
        const language = (selectedLead as any).language || 'English';
        const flowId = language?.toLowerCase() === 'arabic' ? 'ArabicNewFlow' : 'TestingBot2';
        await logOutboundVerificationMessage(
          selectedLead.id,
          to,
          flowId,
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

  // Function to send WhatsApp reply
  const sendWhatsAppReply = async () => {
    if (!selectedLead || !replyText.trim() || sendingReply) return;
    
    try {
      setSendingReply(true);
      const country = (selectedLead as any).country || 'AE';
      let to = (selectedLead.customerNumber || '').toString().replace(/\D/g, '');
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

      const group = selectedLead.plans?.[0]?.group || undefined;
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
        responseJson = responseText ? JSON.parse(responseText) : {};
      } catch {
        responseJson = {};
      }

      if (!resp.ok) {
        console.error('Failed to send WhatsApp reply:', responseText);
        throw new Error(responseJson?.error?.message || 'Failed to send WhatsApp reply');
      }

      // Get message ID from response
      const msgId = responseJson.messages?.[0]?.id;
      const messageText = replyText.trim();
      
      // Format customer number for message (same format as API uses)
      let formattedCustomerNumber = to;
      // Remove country code to match API format (API uses normalized customer number)
      if (formattedCustomerNumber.startsWith('971')) {
        formattedCustomerNumber = '0' + formattedCustomerNumber.slice(3);
      }
      
      // Optimistically add the sent message to the UI immediately
      // Match the format that the API returns (from = customer number, to = customer number for outbound)
      const newMessage = {
        id: 'temp-' + Date.now(),
        direction: 'outbound' as const,
        from: formattedCustomerNumber, // API uses customer number as 'from' for outbound
        to: formattedCustomerNumber, // API uses customer number as 'to' for outbound
        messageText: messageText,
        messageId: msgId || undefined,
        status: msgId ? 'sent' : undefined,
        createdAt: new Date()
      };
      
      // Add to UI immediately
      setWhatsAppLogs(prev => {
        // Check if message already exists (avoid duplicates)
        const exists = prev.some(msg => 
          msg.messageText === messageText && 
          msg.direction === 'outbound' &&
          Math.abs(new Date(msg.createdAt).getTime() - new Date().getTime()) < 5000 // Within 5 seconds
        );
        if (exists) return prev;
        return [...prev, newMessage];
      });

      // Update message tracking refs
      previousMessageCountRef.current = whatsAppLogs.length + 1;
      lastMessageIdRef.current = newMessage.id;

      // Scroll to bottom to show the new message
      setTimeout(() => {
        if (logsContainerRef.current) {
          logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
        }
      }, 100);

      await logOutboundVerificationMessage(
        selectedLead.id,
        to,
        'verifier_text',
        [],
        {
          messageText: messageText,
          sendResponse: responseJson
        }
      );
      
        toast.success('Reply sent');
        setReplyText('');
      
      // Trigger immediate fetch to get the real message from API (will replace temp message)
      setTimeout(() => {
        fetchWhatsAppMessagesFromAPI();
      }, 1000);
    } catch (e: any) {
      console.error('Error sending reply:', e);
      toast.error(e?.message || 'Error sending reply');
      try {
        await logOutboundVerificationMessage(
          selectedLead?.id || '',
          selectedLead?.customerNumber || '',
          'verifier_text',
          [],
          {
            messageText: replyText.trim(),
            status: 'failed',
            error: {
              message: e?.message || 'Failed to send reply',
              details: typeof e?.toString === 'function' ? e.toString() : undefined
            }
          }
        );
      } catch (logError) {
        console.error('Failed to log failed verifier reply:', logError);
      }
    } finally {
      setSendingReply(false);
    }
  };

  // Fetch WhatsApp messages from API
  const fetchWhatsAppMessagesFromAPI = async () => {
    if (!selectedLead?.customerNumber) {
      console.warn('No customer number found for lead');
      return;
    }

    try {
      // Format customer number for API - Simple logic: remove first 0, add 971
      let formattedNumber = selectedLead.customerNumber.toString().replace(/\D/g, '');
      
      // Remove leading zero if present
      if (formattedNumber.startsWith('0')) {
        formattedNumber = formattedNumber.substring(1);
      }
      
      // Add 971 prefix
      if (!formattedNumber.startsWith('971')) {
        formattedNumber = `971${formattedNumber}`;
      }

      const { checkConversation } = await import('../../utils/whatsappRouter');
      const conversationData = await checkConversation(formattedNumber, selectedLead.id);
      
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
          const timeA = a.createdAt instanceof Date ? a.createdAt.getTime() : new Date(a.createdAt).getTime();
          const timeB = b.createdAt instanceof Date ? b.createdAt.getTime() : new Date(b.createdAt).getTime();
          if (timeA !== timeB) {
            return timeA - timeB;
          }
          // If timestamps are equal, sort by messageId to maintain consistent order
          const idA = a.messageId || a.id || '';
          const idB = b.messageId || b.id || '';
          return idA.localeCompare(idB);
        });

        
        // Merge with existing optimistic messages (temp messages that haven't been confirmed by API yet)
        // IMPORTANT: Preserve existing message timestamps to prevent timestamp changes on re-fetch
        setWhatsAppLogs(prev => {
          // Get all temporary messages (those with temp- prefix)
          const tempMessages = prev.filter(msg => msg.id?.toString().startsWith('temp-'));
          
          // Create a map of existing messages by messageId to preserve their timestamps
          const existingMessageMap = new Map();
          prev.forEach((msg: any) => {
            const msgId = msg.messageId || msg.id;
            if (msgId && !msgId.toString().startsWith('temp-')) {
              existingMessageMap.set(msgId, msg);
            }
          });
          
          // Create a map of API messages by messageId and messageText+timestamp for matching
          const apiMessageMap = new Map();
          formattedMessages.forEach((msg: any) => {
            if (msg.messageId) {
              apiMessageMap.set(msg.messageId, msg);
            }
            // Also index by text + direction + approximate time (within 10 seconds)
            const msgTime = msg.createdAt instanceof Date ? msg.createdAt.getTime() : new Date(msg.createdAt).getTime();
            const key = `${msg.messageText}_${msg.direction}_${Math.floor(msgTime / 10000)}`;
            if (!apiMessageMap.has(key)) {
              apiMessageMap.set(key, msg);
            }
            // For flow messages, also index by templateName since messageText might differ
            if (msg.templateName) {
              const templateKey = `${msg.templateName}_${msg.direction}_${Math.floor(msgTime / 10000)}`;
              if (!apiMessageMap.has(templateKey)) {
                apiMessageMap.set(templateKey, msg);
              }
            }
          });
          
          // Keep temp messages that don't have a match in API yet (within 60 seconds)
          const now = Date.now();
          const unmatchedTempMessages = tempMessages.filter(tempMsg => {
            const tempTime = getTimestampForSort(normalizeTimestamp(tempMsg.createdAt));
            // If temp message is older than 60 seconds, remove it (API should have it by now)
            if (now - tempTime > 60000) {
              return false;
            }
            
            // Check if this temp message matches any API message
            const matchesById = tempMsg.messageId && apiMessageMap.has(tempMsg.messageId);
            const tempMsgTime = tempTime;
            const matchesByContent = apiMessageMap.has(`${tempMsg.messageText}_${tempMsg.direction}_${Math.floor(tempMsgTime / 10000)}`);
            
            // For flow messages, also check by templateName
            let matchesByTemplate = false;
            if (tempMsg.templateName) {
              matchesByTemplate = apiMessageMap.has(`${tempMsg.templateName}_${tempMsg.direction}_${Math.floor(tempMsgTime / 10000)}`);
            }
            
            // If it matches, don't keep the temp message (API has the real one)
            return !matchesById && !matchesByContent && !matchesByTemplate;
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
          
          // Combine merged API messages with unmatched temp messages
          const combined = [...mergedMessages, ...unmatchedTempMessages];
          
          // Sort by timestamp (oldest first), with secondary sort by messageId for messages with same timestamp
          combined.sort((a: any, b: any) => {
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
          
          // Check if messages actually changed to prevent unnecessary re-renders
          const prevMessageIds = prev.map(m => m.id || m.messageId).join(',');
          const newMessageIds = combined.map(m => m.id || m.messageId).join(',');
          
          // Only update if messages actually changed
          if (prevMessageIds === newMessageIds && prev.length === combined.length) {
            return prev; // No change, return previous state
          }
          
          // Update refs for scrolling detection
          const currentMessageCount = combined.length;
          const currentLastMessageId = combined.length > 0 ? combined[combined.length - 1].id : null;
          const hasNewMessages = currentMessageCount > previousMessageCountRef.current || 
            (currentLastMessageId && currentLastMessageId !== lastMessageIdRef.current);
          
          previousMessageCountRef.current = currentMessageCount;
          lastMessageIdRef.current = currentLastMessageId;
          
          // Handle scrolling in a separate effect to avoid state update loops
          if (hasNewMessages) {
            setTimeout(() => {
              if (logsContainerRef.current) {
                const container = logsContainerRef.current;
                const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
                if (isNearBottom) {
                  container.scrollTop = container.scrollHeight;
                }
              }
            }, 150);
          }
          
          return combined;
        });
      }
    } catch (error: any) {
      console.error('Error fetching WhatsApp messages from API:', error);
    }
  };

  // Auto-poll WhatsApp messages from API when lead is selected
  useEffect(() => {
    if (!selectedLead?.id || !selectedLead?.customerNumber || !showWhatsAppLogs) {
      // Clear logs when no lead is selected or panel is closed
      if (!selectedLead || !showWhatsAppLogs) {
        setWhatsAppLogs([]);
        previousMessageCountRef.current = 0;
        lastMessageIdRef.current = null;
      }
      // Clear polling interval
      if (whatsappLogsPollIntervalRef.current) {
        clearInterval(whatsappLogsPollIntervalRef.current);
        whatsappLogsPollIntervalRef.current = null;
      }
      return;
    }

    // Reset message tracking when switching leads
    previousMessageCountRef.current = 0;
    lastMessageIdRef.current = null;

    // Fetch immediately
    fetchWhatsAppMessagesFromAPI();

    // Set up polling interval - every 3 seconds for instant updates
    whatsappLogsPollIntervalRef.current = setInterval(() => {
      fetchWhatsAppMessagesFromAPI();
    }, 3000);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (whatsappLogsPollIntervalRef.current) {
        clearInterval(whatsappLogsPollIntervalRef.current);
        whatsappLogsPollIntervalRef.current = null;
      }
    };
  }, [selectedLead?.id, selectedLead?.customerNumber, showWhatsAppLogs]);

  // Only scroll on initial open or when panel is first shown
  useEffect(() => {
    if (showWhatsAppLogs && logsContainerRef.current && whatsAppLogs.length > 0) {
      // Only scroll on initial open, not on every update
      const shouldScroll = previousMessageCountRef.current === 0;
      if (shouldScroll) {
        setTimeout(() => {
          if (logsContainerRef.current) {
            logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
          }
        }, 100);
      }
    }
  }, [showWhatsAppLogs]); // Only depend on showWhatsAppLogs, not whatsAppLogs

  // Track flow progress based on customer responses
  useEffect(() => {
    if (!selectedLead || whatsAppLogs.length === 0) {
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
  }, [whatsAppLogs, selectedLead]);

  // Get the current status from URL params
  const currentStatus = searchParams.get('status') || 'pending_verification';

  // Refs to store unsubscribe functions for cleanup
  const leadsUnsubscribeRef = useRef<(() => void) | null>(null);
  const pendingCountUnsubscribeRef = useRef<(() => void) | null>(null);
  const activatedReverificationUnsubscribeRef = useRef<(() => void) | null>(null);
  const countersUnsubscribeRef = useRef<(() => void) | null>(null);
  const whatsappLogsPollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Real-time listener for leads and metrics
  useEffect(() => {
    if (!user?.id) return;

      setLoading(true);

    // Cleanup previous listeners
    if (leadsUnsubscribeRef.current) {
      leadsUnsubscribeRef.current();
      leadsUnsubscribeRef.current = null;
    }
    if (pendingCountUnsubscribeRef.current) {
      pendingCountUnsubscribeRef.current();
      pendingCountUnsubscribeRef.current = null;
    }
    if (activatedReverificationUnsubscribeRef.current) {
      activatedReverificationUnsubscribeRef.current();
      activatedReverificationUnsubscribeRef.current = null;
    }
    if (countersUnsubscribeRef.current) {
      countersUnsubscribeRef.current();
      countersUnsubscribeRef.current = null;
    }

    // Use verifierGroups directly from user object (already loaded in authStore)
    const verifierGroups = user?.verifierGroups || [];
      const hasAllGroups = verifierGroups.includes('all') || verifierGroups.length === 0;

    // Statuses to query based on current status
      const statusesToQuery = currentStatus === 'pending_verification' 
        ? ['pending_verification']
        : currentStatus === 'activated_reverification'
        ? ['activated_non_verified', 'reverification']
        : [currentStatus];
      
    // Real-time listener for leads
    const leadsQuery = query(
          collection(db, 'leads'),
          where('status', 'in', statusesToQuery),
          orderBy('createdAt', 'desc')
        );

    const leadsUnsubscribe = onSnapshot(leadsQuery, (snapshot) => {
      try {
        let allLeads = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
        updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt
      })) as Lead[];

        // Filter by verifier groups (group is already in lead.plans, no need to fetch from numberPool)
      if (!hasAllGroups) {
        allLeads = allLeads.filter(lead => {
          const hasMatchingGroup = lead.plans?.some(plan => {
              const planGroup = (plan.group || '').toLowerCase();
            return verifierGroups.some((verifierGroup: string) => {
              const normalizedVerifierGroup = verifierGroup.toLowerCase();
              return planGroup === normalizedVerifierGroup;
            });
          }) || false;
          return hasMatchingGroup;
        });
      }

        setVerificationLeads(allLeads);
        setLoading(false);
      } catch (error) {
        console.error('Error processing leads snapshot:', error);
        setLoading(false);
      }
    }, (error) => {
      if (error.code === 'permission-denied') {
        if (leadsUnsubscribeRef.current) {
          leadsUnsubscribeRef.current();
          leadsUnsubscribeRef.current = null;
          }
        return;
      }
      console.error('Error in leads listener:', error);
      setLoading(false);
    });

    leadsUnsubscribeRef.current = leadsUnsubscribe;

    // Real-time listener for pending verification count
      const pendingQuery = query(
        collection(db, 'leads'),
        where('status', '==', 'pending_verification')
      );

    const pendingCountUnsubscribe = onSnapshot(pendingQuery, (snapshot) => {
      try {
        let pendingLeads = snapshot.docs.map(doc => ({
        ...doc.data(),
        plans: doc.data().plans || []
      })) as Lead[];

        // Filter by verifier groups
      if (!hasAllGroups) {
          pendingLeads = pendingLeads.filter(lead => {
          const hasMatchingGroup = lead.plans?.some(plan => {
              const planGroup = (plan.group || '').toLowerCase();
            return verifierGroups.some((verifierGroup: string) => {
              const normalizedVerifierGroup = verifierGroup.toLowerCase();
              return planGroup === normalizedVerifierGroup;
            });
          }) || false;
          return hasMatchingGroup;
        });
      }

        setVerificationMetrics(prev => ({
          ...prev,
          pendingVerificationCount: pendingLeads.length
        }));
      } catch (error) {
        console.error('Error processing pending count snapshot:', error);
      }
    }, (error) => {
      if (error.code === 'permission-denied') {
        if (pendingCountUnsubscribeRef.current) {
          pendingCountUnsubscribeRef.current();
          pendingCountUnsubscribeRef.current = null;
        }
        return;
      }
      console.error('Error in pending count listener:', error);
    });

    pendingCountUnsubscribeRef.current = pendingCountUnsubscribe;

    // Real-time listener for activated/reverification count
    const activatedReverificationQuery = query(
        collection(db, 'leads'),
      where('status', 'in', ['activated_non_verified', 'reverification'])
    );

    const activatedReverificationUnsubscribe = onSnapshot(activatedReverificationQuery, (snapshot) => {
      try {
        let activatedReverificationLeads = snapshot.docs.map(doc => ({
          ...doc.data(),
          plans: doc.data().plans || []
        })) as Lead[];

        // Filter by verifier groups
        if (!hasAllGroups) {
          activatedReverificationLeads = activatedReverificationLeads.filter(lead => {
            const hasMatchingGroup = lead.plans?.some(plan => {
              const planGroup = (plan.group || '').toLowerCase();
              return verifierGroups.some((verifierGroup: string) => {
                const normalizedVerifierGroup = verifierGroup.toLowerCase();
                return planGroup === normalizedVerifierGroup;
              });
            }) || false;
            return hasMatchingGroup;
          });
        }

        setVerificationMetrics(prev => ({
          ...prev,
          activatedReverificationCount: activatedReverificationLeads.length
        }));
      } catch (error) {
        console.error('Error processing activated/reverification count snapshot:', error);
      }
    }, (error) => {
      if (error.code === 'permission-denied') {
        if (activatedReverificationUnsubscribeRef.current) {
          activatedReverificationUnsubscribeRef.current();
          activatedReverificationUnsubscribeRef.current = null;
        }
        return;
      }
      console.error('Error in activated/reverification count listener:', error);
    });

    activatedReverificationUnsubscribeRef.current = activatedReverificationUnsubscribe;
        
    // Real-time listener for verifier counters
    const countersUnsubscribe = onSnapshot(doc(db, 'users', user.id), (userDoc) => {
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        let dailyCount = userData.dailyVerifiedCount || 0;
        let monthlyCount = userData.monthlyVerifiedCount || 0;
        const lastDailyReset = userData.lastDailyReset?.toDate?.() || null;
        const lastMonthlyReset = userData.lastMonthlyReset?.toDate?.() || null;

        // Check if reset is needed (display only, actual reset happens on increment)
        if (lastDailyReset && lastDailyReset < today) {
          dailyCount = 0;
        }
        if (lastMonthlyReset && lastMonthlyReset < firstDayOfMonth) {
          monthlyCount = 0;
          }

        setVerificationMetrics(prev => ({
          ...prev,
          dailyVerifiedCount: dailyCount,
          monthlyVerifiedCount: monthlyCount
        }));
      }
    }, (error) => {
      if (error.code === 'permission-denied') {
        if (countersUnsubscribeRef.current) {
          countersUnsubscribeRef.current();
          countersUnsubscribeRef.current = null;
        }
        return;
      }
      console.error('Error in counters listener:', error);
    });

    countersUnsubscribeRef.current = countersUnsubscribe;

    // Cleanup function
    return () => {
      if (leadsUnsubscribeRef.current) {
        leadsUnsubscribeRef.current();
        leadsUnsubscribeRef.current = null;
      }
      if (pendingCountUnsubscribeRef.current) {
        pendingCountUnsubscribeRef.current();
        pendingCountUnsubscribeRef.current = null;
      }
      if (activatedReverificationUnsubscribeRef.current) {
        activatedReverificationUnsubscribeRef.current();
        activatedReverificationUnsubscribeRef.current = null;
      }
      if (countersUnsubscribeRef.current) {
        countersUnsubscribeRef.current();
        countersUnsubscribeRef.current = null;
      }
    };
  }, [user?.id, user?.verifierGroups, currentStatus]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);

  const filteredLeads = verificationLeads.filter(lead => {
    const matchesSearch = 
      lead.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.customerNumber?.includes(searchTerm) ||
      lead.plans?.some(plan => plan.number?.includes(searchTerm));
    
    return matchesSearch;
      });

  // Pagination calculations
  const totalPages = Math.ceil(filteredLeads.length / pageSize);
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const renderStatusBadge = (status?: string) => {
    const normalized = (status || '').toLowerCase();
    const config: Record<string, { bg: string; text: string; label: string; border?: string }> = {
      pending_verification: {
        bg: 'bg-yellow-100',
        text: 'text-yellow-800',
        border: 'border border-yellow-200',
        label: 'Pending Verification'
      },
      reverification: {
        bg: 'bg-blue-100',
        text: 'text-blue-800',
        border: 'border border-blue-200',
        label: 'Reverification'
      },
      activated_non_verified: {
        bg: 'bg-orange-100',
        text: 'text-orange-800',
        border: 'border border-orange-200',
        label: 'Activated - Pending Verification'
      },
      non_verified: {
        bg: 'bg-amber-100',
        text: 'text-amber-800',
        border: 'border border-amber-200',
        label: 'Non Verified'
      }
    };

    const cfg = config[normalized] || {
      bg: 'bg-gray-100',
      text: 'text-gray-800',
      border: 'border border-gray-200',
      label: getStatusDisplayText(status)
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text} ${cfg.border || ''}`}>
        {cfg.label}
      </span>
    );
  };


  const verificationStats = [
    {
      name: 'Pending Verification',
      value: verificationMetrics.pendingVerificationCount,
      icon: Clock,
      color: 'bg-gradient-to-br from-yellow-500 to-yellow-600',
      textColor: 'text-yellow-600',
      status: 'pending_verification'
    },
    {
      name: 'Active Non Verified',
      value: verificationMetrics.activatedReverificationCount,
      icon: AlertTriangle,
      color: 'bg-gradient-to-br from-orange-500 to-orange-600',
      textColor: 'text-orange-600',
      status: 'activated_reverification'
    },
    {
      name: 'Verified',
      value: `${verificationMetrics.dailyVerifiedCount} / ${verificationMetrics.monthlyVerifiedCount}`,
      icon: CheckCircle,
      color: 'bg-gradient-to-br from-green-500 to-blue-600',
      textColor: 'text-green-600',
      status: 'verified',
      isCombined: true,
      dailyValue: verificationMetrics.dailyVerifiedCount,
      monthlyValue: verificationMetrics.monthlyVerifiedCount
    }
  ];

  const handleStatClick = (status: string) => {
    setSearchParams({ status });
  };

  const handleVerifyLead = async (lead: Lead) => {
    setSelectedLead(lead);
    setShowMediaModal(true);
  };

  const handleRejectLead = async (lead: Lead) => {
    setSelectedLead(lead);
    setActionType('reject');
    setActionNote('');
    setShowActionDialog(true);
  };

  const handleFollowUpLead = async (lead: Lead) => {
    setSelectedLead(lead);
    setActionType('followup');
    setActionNote('');
    setShowActionDialog(true);
  };

  const handleActionComplete = async () => {
    if (!selectedLead || !actionType) return;

    try {
      setLoading(true);
      
      // Validate that all numbers in lead plans exist in numberPool
      const plans = selectedLead.plans || [];
      const realPlans = plans.filter((p: any) => p.numberId && !p.numberId.startsWith('virtual-'));
      
      if (realPlans.length > 0) {
        const missingNumbers: string[] = [];
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
        
        if (missingNumbers.length > 0) {
          setMissingNumbers(missingNumbers);
          setShowNumberErrorModal(true);
          setLoading(false);
          return;
        }
      }
      
      const leadRef = doc(db, 'leads', selectedLead.id);
      const newStatus = actionType === 'verify' ? 'verified' : 
                       actionType === 'reject' ? 'rejected' : 
                       'non_verified';
      
      // Update lead status
      await updateDoc(leadRef, {
        status: newStatus,
        updatedAt: serverTimestamp(),
        verificationNote: actionNote,
        verifiedBy: user.id,
        verificationChecklist: verifyChecklist,
        verificationMedia: verifyMediaFiles,
        ...(newStatus === 'verified' ? { verifiedAt: serverTimestamp() } : {})
      });

      // Increment verifier counters if lead is verified
      if (newStatus === 'verified') {
        await incrementVerifierCounters(user.id);
      }

      // Send notification to the agent
      if (selectedLead.agentId) {
        const statusMessage = newStatus === 'verified' ? 'Lead Verified' : 
                            newStatus === 'rejected' ? 'Lead Rejected' : 
                            'Lead Marked as Non Verified';
        
        await addDoc(collection(db, 'notifications'), {
          userId: selectedLead.agentId,
          type: 'lead_verification',
          title: statusMessage,
          message: `${user?.name} has ${newStatus === 'verified' ? 'verified' : 
                    newStatus === 'rejected' ? 'rejected' : 
                    'marked for follow-up'} your lead${actionNote ? `: ${actionNote}` : ''}`,
          read: false,
          createdAt: new Date(),
          data: {
            leadId: selectedLead.id,
            customerName: selectedLead.customerName,
            customerNumber: selectedLead.customerNumber,
            selectedNumber: selectedLead.plans?.[0]?.number,
            status: newStatus,
            verifierName: user?.name,
            verificationNote: actionNote,
            verificationMedia: verifyMediaFiles
          }
        });
      }


      // Update number status in numberPool
      if (selectedLead.plans) {
        const updatePromises = selectedLead.plans.map(async plan => {
          const numberRef = doc(db, 'numberPool', plan.numberId);
          const numberDoc = await getDoc(numberRef);
          const numberData = numberDoc.data();

          if (newStatus === 'rejected') {
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
                leadId: selectedLead.id
              });

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
                leadId: selectedLead.id
              });
            }
          } else if (newStatus === 'non_verified') {
            // For non_verified leads, reserve the number for the original agent
            const agentId = selectedLead.agentId;
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
                leadId: selectedLead.id
              });

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
                leadId: selectedLead.id
              });
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
                leadId: selectedLead.id
              });
            }
          } else {
            // For other verification actions, update normally
            await updateDoc(numberRef, {
              status: newStatus,
              lastStatusChange: serverTimestamp(),
              leadId: selectedLead.id
            });
          }
        });
        await Promise.all(updatePromises);
      }

      toast.success(`Lead ${newStatus} successfully`);
      setShowActionDialog(false);
      setActionType(null);
      setActionNote('');
      const baseChecklist = VERIFY_CHECKLIST.map(() => false);
      const currentShowCampaign = selectedLead ? hasPostpaidCampaignPlan(selectedLead) : false;
      setVerifyChecklist(currentShowCampaign ? [...baseChecklist, false] : baseChecklist);
      setVerifyMediaFiles([]);
      // Real-time listeners will automatically update the UI
    } catch (error) {
      console.error('Error updating lead:', error);
      toast.error('Failed to update lead');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-6 sm:py-12 relative overflow-hidden">
      {/* 3D Static Pattern Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* 3D Geometric Pattern */}
        <div className="absolute inset-0 opacity-[0.04]">
          <div className="absolute top-0 left-0 w-full h-full">
            {/* Large 3D cubes */}
            <div className="absolute top-10 left-10 w-32 h-32 transform rotate-45 bg-gradient-to-br from-indigo-400 to-purple-600 rounded-lg shadow-2xl"></div>
            <div className="absolute top-40 right-20 w-24 h-24 transform -rotate-12 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-lg shadow-xl"></div>
            <div className="absolute bottom-20 left-1/4 w-28 h-28 transform rotate-30 bg-gradient-to-br from-purple-400 to-pink-600 rounded-lg shadow-2xl"></div>
            <div className="absolute bottom-40 right-1/3 w-20 h-20 transform -rotate-45 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-lg shadow-lg"></div>
            
            {/* Medium 3D cubes */}
            <div className="absolute top-1/3 left-1/2 w-16 h-16 transform rotate-15 bg-gradient-to-br from-indigo-300 to-purple-500 rounded-md shadow-lg"></div>
            <div className="absolute top-2/3 right-1/4 w-12 h-12 transform -rotate-30 bg-gradient-to-br from-cyan-300 to-blue-500 rounded-md shadow-md"></div>
            <div className="absolute bottom-1/3 left-1/6 w-14 h-14 transform rotate-60 bg-gradient-to-br from-purple-300 to-pink-500 rounded-md shadow-lg"></div>
            
            {/* Small 3D cubes */}
            <div className="absolute top-1/4 right-1/6 w-8 h-8 transform rotate-45 bg-gradient-to-br from-indigo-200 to-purple-400 rounded shadow"></div>
            <div className="absolute top-3/4 left-1/3 w-6 h-6 transform -rotate-15 bg-gradient-to-br from-cyan-200 to-blue-400 rounded shadow"></div>
            <div className="absolute bottom-1/4 right-1/2 w-10 h-10 transform rotate-75 bg-gradient-to-br from-purple-200 to-pink-400 rounded shadow"></div>
            
            {/* Floating 3D spheres */}
            <div className="absolute top-1/6 left-1/3 w-4 h-4 bg-gradient-to-br from-indigo-300 to-purple-500 rounded-full shadow-lg"></div>
            <div className="absolute top-2/3 right-1/6 w-3 h-3 bg-gradient-to-br from-cyan-300 to-blue-500 rounded-full shadow-md"></div>
            <div className="absolute bottom-1/6 left-2/3 w-5 h-5 bg-gradient-to-br from-purple-300 to-pink-500 rounded-full shadow-lg"></div>
            
            {/* 3D Hexagons */}
            <div className="absolute top-1/2 left-1/8 w-20 h-20 transform rotate-30">
              <div className="w-full h-full bg-gradient-to-br from-indigo-400 to-purple-600" style={{clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'}}></div>
            </div>
            <div className="absolute bottom-1/4 right-1/8 w-16 h-16 transform -rotate-15">
              <div className="w-full h-full bg-gradient-to-br from-cyan-400 to-blue-600" style={{clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'}}></div>
            </div>
            
            {/* 3D Triangles */}
            <div className="absolute top-1/3 right-1/3 w-12 h-12 transform rotate-45">
              <div className="w-full h-full bg-gradient-to-br from-purple-400 to-pink-600" style={{clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)'}}></div>
            </div>
            <div className="absolute bottom-1/3 left-1/2 w-10 h-10 transform -rotate-30">
              <div className="w-full h-full bg-gradient-to-br from-indigo-400 to-purple-600" style={{clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)'}}></div>
            </div>
            
            {/* 3D Diamonds */}
            <div className="absolute top-1/4 left-3/4 w-14 h-14 transform rotate-45">
              <div className="w-full h-full bg-gradient-to-br from-cyan-400 to-blue-600" style={{clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)'}}></div>
            </div>
            <div className="absolute bottom-1/4 left-1/8 w-18 h-18 transform -rotate-15">
              <div className="w-full h-full bg-gradient-to-br from-purple-400 to-pink-600" style={{clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)'}}></div>
            </div>
          </div>
        </div>
        
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/30 to-transparent"></div>
      </div>
      
      <div className="max-w-full mx-auto relative z-10 px-2 sm:px-4">
      {/* Welcome Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-4 sm:mb-6"
        >
          <div className="rounded-2xl bg-white/85 backdrop-blur-sm border border-white/50 shadow-lg p-4 sm:p-6">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex-1 w-full">
                <h1 className="text-lg sm:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 leading-tight">
                  Welcome back, <span className="bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-transparent">{user?.name}</span>!
            </h1>
                <p className="mt-2 text-sm text-gray-600 max-w-xl">
              Here's an overview of leads requiring verification.
            </p>
          </div>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full sm:w-auto"
              >
                <div className="flex items-center justify-between sm:justify-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span className="text-xs uppercase tracking-wide">Today</span>
          </div>
                  <p className="text-sm font-semibold">
                    {format(new Date(), 'EEE, MMM d, yyyy')}
                  </p>
        </div>
              </motion.div>
      </div>
          </div>
        </motion.div>

      {/* Stats Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-8 sm:mb-12"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
        {verificationStats.map((stat, index) => {
              const isClickable = stat.status === 'pending_verification' || stat.status === 'activated_reverification';
              const isCombined = (stat as any).isCombined;
          
            return (
                <motion.div
                key={stat.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  className="relative"
                >
                  {/* Single tilted background card effect - gradient colors */}
                  <div className={`absolute inset-0 transform rotate-1.5 translate-x-1 translate-y-1 ${
                    stat.name === 'Pending Verification' ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' : 
                    stat.name === 'Active Non Verified' ? 'bg-gradient-to-br from-orange-400 to-orange-600' : 
                    'bg-gradient-to-br from-green-400 to-blue-600'
                  } opacity-25 rounded-2xl shadow-[0_3px_15px_rgba(0,0,0,0.08)] scale-102`}></div>
                  
                  {isClickable ? (
                    <motion.button
                onClick={() => handleStatClick(stat.status)}
                      whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                      className={`block relative overflow-hidden rounded-2xl bg-white/95 backdrop-blur-xl border border-white/40 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.18)] transition-all duration-300 transform hover:-translate-y-1 cursor-pointer group w-full ${
                  currentStatus === stat.status ? 'ring-2 ring-indigo-500' : ''
                }`}
              >
                      <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-transparent rounded-2xl" />
                      <div className="relative p-3 sm:p-6">
                  <div className="flex items-center">
                          <div className={`flex-shrink-0 p-2 sm:p-3.5 rounded-xl ${stat.color} group-hover:scale-110 transition-transform duration-300 shadow-[0_4px_20px_rgba(0,0,0,0.1)]`}>
                            <stat.icon className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                    </div>
                          <div className="ml-2 sm:ml-4 w-0 flex-1">
                      <dl>
                              <dt className="text-xs sm:text-sm font-medium text-gray-900 truncate">
                          {stat.name}
                        </dt>
                              {isCombined ? (
                                <>
                                  <dd className="flex items-baseline gap-2 mt-1">
                                    <span className="text-lg sm:text-2xl lg:text-3xl font-bold text-green-600 drop-shadow-sm">
                                      {(stat as any).dailyValue}
                                    </span>
                                    <span className="text-xs sm:text-sm text-gray-500">/</span>
                                    <span className="text-lg sm:text-2xl lg:text-3xl font-bold text-blue-600 drop-shadow-sm">
                                      {(stat as any).monthlyValue}
                                    </span>
                                  </dd>
                                  <dd className="hidden sm:block text-[10px] sm:text-xs text-gray-500 mt-1 sm:mt-1.5">
                                    Daily / Monthly verified
                                  </dd>
                                </>
                              ) : (
                                <>
                                  <dd className={`text-lg sm:text-2xl lg:text-3xl font-bold ${stat.textColor} mt-1 drop-shadow-sm`}>
                          {stat.value}
                        </dd>
                                  <dd className="hidden sm:block text-[10px] sm:text-xs text-gray-500 mt-1 sm:mt-1.5">
                                    {stat.name === 'Pending Verification' ? 'Leads awaiting verification' : 
                                     stat.name === 'Active Non Verified' ? 'Activated needs reverification' : ''}
                                  </dd>
                                </>
                              )}
                      </dl>
                    </div>
                  </div>
                </div>
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/0 to-purple-500/0 group-hover:from-indigo-500/5 group-hover:to-purple-500/5 transition-all duration-200 rounded-2xl" />
              </motion.button>
                  ) : (
                    <div className="block relative overflow-hidden rounded-2xl bg-white/95 backdrop-blur-xl border border-white/40 shadow-[0_8px_30px_rgba(0,0,0,0.12)] transition-all duration-300">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-transparent rounded-2xl" />
                      <div className="relative p-3 sm:p-6">
                <div className="flex items-center">
                          <div className={`flex-shrink-0 p-2 sm:p-3.5 rounded-xl ${stat.color} transition-transform duration-300 shadow-[0_4px_20px_rgba(0,0,0,0.1)]`}>
                            <stat.icon className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
                  </div>
                          <div className="ml-2 sm:ml-4 w-0 flex-1">
                    <dl>
                              <dt className="text-xs sm:text-sm font-medium text-gray-900 truncate">
                        {stat.name}
                      </dt>
                              {isCombined ? (
                                <>
                                  <dd className="flex items-baseline gap-2 mt-1">
                                    <span className="text-lg sm:text-2xl lg:text-3xl font-bold text-green-600 drop-shadow-sm">
                                      {(stat as any).dailyValue}
                                    </span>
                                    <span className="text-xs sm:text-sm text-gray-500">/</span>
                                    <span className="text-lg sm:text-2xl lg:text-3xl font-bold text-blue-600 drop-shadow-sm">
                                      {(stat as any).monthlyValue}
                                    </span>
                                  </dd>
                                  <dd className="hidden sm:block text-[10px] sm:text-xs text-gray-500 mt-1 sm:mt-1.5">
                                    Daily / Monthly verified
                                  </dd>
                                </>
                              ) : (
                                <>
                                  <dd className={`text-lg sm:text-2xl lg:text-3xl font-bold ${stat.textColor} mt-1 drop-shadow-sm`}>
                        {stat.value}
                      </dd>
                                  <dd className="hidden sm:block text-[10px] sm:text-xs text-gray-500 mt-1 sm:mt-1.5">
                                    {stat.name === 'Pending Verification' ? 'Leads awaiting verification' : 
                                     stat.name === 'Active Non Verified' ? 'Activated or needs reverification' : ''}
                                  </dd>
                                </>
                              )}
                    </dl>
                  </div>
                </div>
              </div>
                    </div>
                  )}
            </motion.div>
          );
        })}
      </div>
        </motion.div>

        {/* Pending / Reverification Leads Section */}
        {filteredLeads.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-8 sm:mt-12 relative"
          >
            {/* Tilted background card effect to match stats cards */}
            <div className="absolute inset-0 transform rotate-1.5 translate-x-1 translate-y-1 bg-gradient-to-br from-indigo-400 to-purple-600 opacity-25 rounded-2xl shadow-[0_3px_15px_rgba(0,0,0,0.08)] scale-102"></div>
            
            <div className="relative overflow-hidden rounded-2xl bg-white/95 backdrop-blur-xl border border-white/40 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.18)] transition-all duration-300 transform hover:-translate-y-1">
              {/* Glassmorphism Background */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-transparent rounded-2xl" />
              
              {/* Enhanced Header with Modern Design - Mobile Optimized */}
              <div className="relative px-4 sm:px-8 py-4 sm:py-6 bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 overflow-hidden">
                {/* Background Pattern */}
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute top-0 left-0 w-32 h-32 bg-white rounded-full -translate-x-16 -translate-y-16"></div>
                  <div className="absolute top-0 right-0 w-24 h-24 bg-white rounded-full translate-x-12 -translate-y-12"></div>
                  <div className="absolute bottom-0 left-0 w-20 h-20 bg-white rounded-full -translate-x-10 translate-y-10"></div>
        </div>

                <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                  <div className="flex items-center space-x-3 sm:space-x-4">
                    <div className="p-2 sm:p-3 bg-white/20 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-lg">
                      <Users className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg sm:text-2xl lg:text-3xl font-bold text-white flex items-center">
            Pending / Reverification Leads
          </h2>
        </div>
                  </div>
                  <div className="w-full lg:w-auto flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1 min-w-[280px]">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-white/70" />
            </div>
            <input
              type="text"
                        className="block w-full pl-10 pr-3 py-2 border border-white/30 rounded-xl leading-5 bg-white/15 backdrop-blur-sm placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-white/80 focus:border-white/80 sm:text-sm"
              placeholder="Search leads..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as typeof PAGE_SIZES[number])}
                      className="w-full sm:w-44 pl-3 pr-10 py-2 text-sm border border-white/30 rounded-xl bg-white/15 backdrop-blur-sm text-white focus:outline-none focus:ring-2 focus:ring-white/80 focus:border-white/80"
            >
              {PAGE_SIZES.map((size) => (
                        <option key={size} value={size} className="text-gray-900">
                  {size} per page
                </option>
              ))}
            </select>
                  </div>
          </div>
        </div>

              {/* Enhanced Table Headers - Desktop Only */}
              <div className="hidden sm:block relative px-6 py-5 bg-gradient-to-br from-indigo-50/90 via-purple-50/90 to-pink-50/90 backdrop-blur-sm border-b border-indigo-100/50">
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-3">
                    <div className="flex items-center space-x-1">
                      <div className="p-2 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-lg">
                        <User2 className="h-4 w-4 text-indigo-600" />
        </div>
                      <span className="text-sm font-bold text-indigo-700 uppercase tracking-wide">Customer Info</span>
                    </div>
                  </div>
                  <div className="col-span-3 pl-6">
                    <div className="flex items-center space-x-1">
                      <div className="p-2 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-lg">
                        <Hash className="h-4 w-4 text-blue-600" />
                      </div>
                      <span className="text-sm font-bold text-blue-700 uppercase tracking-wide">Selected Number & Plan</span>
                    </div>
                  </div>
                  <div className="col-span-1 pl-[111px]">
                    <div className="flex items-center justify-center space-x-1">
                      <div className="p-2 bg-gradient-to-br from-emerald-100 to-green-100 rounded-lg">
                        <Package className="h-4 w-4 text-emerald-600" />
                      </div>
                      <span className="text-sm font-bold text-emerald-700 uppercase tracking-wide">Group</span>
                    </div>
                  </div>
                  <div className="col-span-2 pl-[171px]">
                    <div className="flex items-center justify-center space-x-1">
                      <div className="p-2 bg-gradient-to-br from-amber-100 to-orange-100 rounded-lg">
                        <Clock className="h-4 w-4 text-amber-600" />
                      </div>
                      <span className="text-sm font-bold text-amber-700 uppercase tracking-wide">Language</span>
                    </div>
                  </div>
                  <div className="col-span-3 flex justify-center">
                    <div className="flex items-center justify-center space-x-3 text-center pl-20">
                      <div className="p-2 bg-gradient-to-br from-purple-100 to-pink-100 rounded-lg">
                        <Eye className="h-4 w-4 text-purple-600" />
                      </div>
                      <span className="text-sm font-bold text-purple-700 uppercase tracking-wide">Actions</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Leads List */}
              <div className="relative">
                {paginatedLeads.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <div className="text-sm text-gray-500">No leads found for this status</div>
                  </div>
              ) : (
                  paginatedLeads.map((lead, index) => {
                    const primaryPlan = lead.plans?.[0];
                    const primaryGroup = primaryPlan?.group;
                    const primaryCategory = primaryPlan?.category;

                    return (
                    <motion.div
                      key={lead.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.1 }}
                      className={clsx(
                        "group hover:bg-gradient-to-r hover:from-indigo-50/50 hover:to-purple-50/50 transition-all duration-200 relative",
                        (lead as any).verificationMethod === 'whatsapp' && "bg-gradient-to-r from-emerald-50/50 to-transparent",
                        index < paginatedLeads.length - 1 && "border-b border-gradient-to-r from-gray-200/60 via-indigo-200/40 to-purple-200/60"
                      )}
                      style={{
                        borderBottom: index < paginatedLeads.length - 1 ? '2px solid transparent' : 'none',
                        backgroundImage: index < paginatedLeads.length - 1 
                          ? 'linear-gradient(white, white), linear-gradient(90deg, rgba(156, 163, 175, 0.7), rgba(129, 140, 248, 0.6), rgba(196, 181, 253, 0.6), rgba(236, 72, 153, 0.5))'
                          : 'none',
                        backgroundOrigin: 'border-box',
                        backgroundClip: 'padding-box, border-box'
                      }}
                    >
                      {/* WhatsApp Indicator */}
                      {(lead as any).verificationMethod === 'whatsapp' && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 z-10"></div>
                      )}
                      <div className="px-6 py-4">
                        <div className="hidden sm:grid grid-cols-12 gap-3 items-center">
                          {/* Customer Information */}
                          <div className="col-span-3 flex items-center">
                            <div className="flex items-center space-x-2">
                              <div className="p-2.5 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-xl shadow-sm">
                          <User2 className="h-5 w-5 text-indigo-600" />
                        </div>
                              <div>
                                <h3 className="text-sm font-semibold text-gray-900">
                                  {lead.customerName || 'Unnamed Customer'}
                                </h3>
                                <div className="mt-1">
                                  {renderStatusBadge(lead.status)}
                                </div>
                                {lead.leadNumber && (
                                  <div className="mt-1">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-100 text-indigo-700 border border-indigo-200">
                                      {lead.leadNumber}
                                    </span>
                                  </div>
                                )}
                                <div className="flex items-center text-s text-gray-500 mt-1">
                                  <Phone className="h-3 w-3 mr-1.5" />
                      {lead.customerNumber}
                          </div>
                                <div className="flex items-center text-xs text-gray-500 mt-1">
                                  <Calendar className="h-3 w-3 mr-1.5" />
                                  {format(lead.createdAt, 'MMM d, yyyy h:mm a')}
                        </div>
                      </div>
                            </div>
                          </div>

                          {/* Selected Numbers & Plan */}
                          <div className="col-span-3 pl-6">
                      <div className="flex flex-col space-y-2">
                              {(lead.plans && lead.plans.length > 0)
                                ? lead.plans.map((plan, planIndex) => (
                                    <div key={planIndex} className="w-full flex flex-col space-y-1.5 bg-gradient-to-br from-gray-50 to-gray-100 px-3 py-2 rounded-lg shadow-sm">
                                      {/* Number - Left aligned */}
                                      <div className="flex items-center space-x-2">
                                        <Hash className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                                        <span className="text-sm font-semibold text-gray-900">
                                          {plan.number || ''}
                              </span>
                            </div>
                                      {/* Plan Details - Below number */}
                                      <div className="flex flex-col space-y-1.5">
                                        {/* Line 1: Plan Name */}
                                        {plan.plan && (
                                          <div className="flex items-center space-x-1.5">
                                            <Package className="h-3 w-3 text-indigo-400 flex-shrink-0" />
                                            <span className="text-xs font-semibold text-gray-900 leading-tight">
                                {plan.plan}
                              </span>
                            </div>
                        )}
                      </div>
                          </div>
                                  ))
                                : <span className="text-sm font-medium text-gray-700"></span>
                              }
                      </div>
                          </div>

                          {/* Group */}
                          <div className="col-span-1 pl-[111px]">
                            <div className="flex flex-col space-y-2 items-center">
                              {(lead.plans && lead.plans.length > 0)
                                ? lead.plans.map((plan, planIndex) => (
                                    <div key={planIndex} className="flex flex-col items-center justify-center space-y-1">
                                      {/* Group Badge */}
                          <span className={clsx(
                            "px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full",
                            plan.group === 'Group A' ? 'bg-blue-100 text-blue-800' :
                            plan.group === 'Group B' ? 'bg-green-100 text-green-800' :
                            plan.group === 'Group C' ? 'bg-purple-100 text-purple-800' :
                            plan.group === 'Group D' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          )}>
                                        {plan.group || 'Unassigned'}
                          </span>
                                      {/* Category Badge */}
                                      {plan.category && (
                                        <span className={clsx(
                                          "px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full",
                                plan.category === 'Gold' ? 'bg-yellow-100 text-yellow-800' :
                                plan.category === 'Platinum' ? 'bg-purple-100 text-purple-800' :
                                          plan.category === 'Silver' ? 'bg-gray-100 text-gray-800' :
                                          plan.category === 'Silver plus' ? 'bg-blue-100 text-blue-800' :
                                          plan.category === 'Gold plus' ? 'bg-orange-100 text-orange-800' :
                                          plan.category === 'Standard' ? 'bg-gray-100 text-gray-800' :
                                'bg-gray-100 text-gray-800'
                              )}>
                                {plan.category}
                              </span>
                      )}
                            </div>
                                  ))
                                : <span className="text-sm font-medium text-gray-700"></span>
                              }
                            </div>
                          </div>

                          {/* Language */}
                          <div className="col-span-2 pl-[171px] flex items-center justify-center">
                      <span className={clsx(
                        "px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full",
                        lead.language === 'English' ? 'bg-blue-100 text-blue-800' :
                        lead.language === 'Arabic' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      )}>
                              {lead.language || 'N/A'}
                      </span>
                            </div>

                          {/* Actions */}
                          <div className="col-span-3 flex justify-end">
                            <motion.div
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              className="relative z-20 flex items-center gap-2"
                            >
                              {(lead as any).verificationMethod === 'whatsapp' && (
                        <motion.button
                          whileHover={{ scale: 1.02, y: -1 }}
                          whileTap={{ scale: 0.98 }}
                                  onClick={() => {
                                    setSelectedLead(lead);
                                    setShowWhatsAppLogs(true);
                                    // Messages will be fetched via API polling in useEffect
                                  }}
                                  title="WhatsApp Verification"
                                  className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-green-50/80 text-green-700 border border-green-100 hover:bg-green-50 hover:border-green-200 transition-all duration-200"
                        >
                                  <svg viewBox="0 0 32 32" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                                    <path d="M19.11 17.46c-.27-.13-1.6-.79-1.85-.88-.25-.09-.43-.13-.61.13-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.13-1.12-.41-2.12-1.31-.78-.69-1.31-1.54-1.46-1.8-.15-.27-.02-.41.11-.54.11-.11.27-.29.41-.45.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.13-.61-1.46-.83-2-.22-.52-.44-.45-.61-.45h-.52c-.18 0-.45.07-.68.34-.23.27-.9.88-.9 2.15 0 1.27.92 2.5 1.05 2.67.14.18 1.81 2.77 4.4 3.88.62.27 1.11.43 1.49.55.63.2 1.2.17 1.65.1.5-.07 1.6-.65 1.83-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.31zM16 3C8.82 3 3 8.82 3 16c0 2.29.62 4.48 1.79 6.42L3 29l6.74-1.77C11.58 28.38 13.76 29 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3zm0 23.73c-2.12 0-4.11-.62-5.78-1.78l-.41-.26-4.01 1.05 1.07-3.9-.27-.41C5.43 20.76 4.73 18.43 4.73 16 4.73 9.94 9.94 4.73 16 4.73S27.27 9.94 27.27 16 22.06 26.73 16 26.73z"/>
                                  </svg>
                        </motion.button>
                              )}
                              <Link
                                to={`/dashboard/leads/${lead.id}`}
                                className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-600 rounded-lg hover:from-indigo-100 hover:to-purple-100 transition-all duration-200 group ring-1 ring-indigo-100"
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                                <ArrowRight className="h-4 w-4 ml-2 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
                              </Link>
                            </motion.div>
                          </div>
                        </div>

                        {/* Mobile Layout */}
                        <div className="sm:hidden">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start space-x-3 flex-1">
                              <div className="p-2.5 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-xl shadow-sm">
                                <User2 className="h-5 w-5 text-indigo-600" />
                              </div>
                                  <div className="flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <h3 className="text-sm font-semibold text-gray-900">
                                    {lead.customerName || 'Unnamed Customer'}
                                  </h3>
                                    {renderStatusBadge(lead.status)}
                                  {lead.language && (
                                    <span className={clsx(
                                      "px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full flex-shrink-0",
                                      lead.language === 'English' ? 'bg-blue-100 text-blue-800' :
                                      lead.language === 'Arabic' ? 'bg-green-100 text-green-800' :
                                      'bg-gray-100 text-gray-800'
                                    )}>
                                      {lead.language}
                                    </span>
                        )}
                      </div>
                                {lead.leadNumber && (
                                  <div className="mt-1">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-100 text-indigo-700 border border-indigo-200">
                                      {lead.leadNumber}
                                    </span>
                                  </div>
                                )}
                                <div className="flex items-start justify-between mt-1 gap-3">
                                  <div className="space-y-1 text-sm text-gray-500">
                                    <div className="flex items-center">
                                      <Phone className="h-3 w-3 mr-1.5" />
                                      {lead.customerNumber}
                                    </div>
                                    <div className="flex items-center text-xs">
                                      <Calendar className="h-3 w-3 mr-1.5" />
                                      {format(lead.createdAt, 'MMM d, yyyy')}
                                    </div>
                                  </div>
                                  {(primaryGroup || primaryCategory) && (
                                    <div className="flex items-center gap-1.5 flex-wrap justify-end text-xs font-semibold">
                                      {primaryGroup && (
                                        <span className={clsx(
                                          "px-2 py-1 inline-flex leading-5 rounded-full",
                                          primaryGroup === 'Group A' ? 'bg-blue-100 text-blue-800' :
                                          primaryGroup === 'Group B' ? 'bg-green-100 text-green-800' :
                                          primaryGroup === 'Group C' ? 'bg-purple-100 text-purple-800' :
                                          primaryGroup === 'Group D' ? 'bg-yellow-100 text-yellow-800' :
                                          'bg-gray-100 text-gray-800'
                                        )}>
                                          {primaryGroup}
                                        </span>
                                      )}
                                      {primaryCategory && (
                                        <span className={clsx(
                                          "px-2 py-1 inline-flex leading-5 rounded-full",
                                          primaryCategory === 'Gold' ? 'bg-yellow-100 text-yellow-800' :
                                          primaryCategory === 'Platinum' ? 'bg-purple-100 text-purple-800' :
                                          primaryCategory === 'Silver' ? 'bg-gray-100 text-gray-800' :
                                          primaryCategory === 'Silver plus' ? 'bg-blue-100 text-blue-800' :
                                          primaryCategory === 'Gold plus' ? 'bg-orange-100 text-orange-800' :
                                          primaryCategory === 'Standard' ? 'bg-gray-100 text-gray-800' :
                                          'bg-gray-100 text-gray-800'
                                        )}>
                                          {primaryCategory}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Plan Details for Mobile */}
                          <div className="mt-4 space-y-2">
                            {(lead.plans?.map((plan, planIndex) => (
                              <div key={planIndex} className="w-full flex flex-col space-y-1.5 bg-gradient-to-br from-gray-50 to-gray-100 px-3 py-2 rounded-lg shadow-sm">
                                {/* Number - First line */}
                                <div className="flex items-center space-x-2">
                                  <Hash className="h-4 w-4 text-indigo-500 flex-shrink-0" />
                                  <span className="text-sm font-semibold text-gray-900">
                                    {plan.number || ''}
                                  </span>
                                </div>
                                {/* Plan Name - Second line */}
                                {plan.plan && (
                                  <div className="flex items-center space-x-1.5 pl-6">
                                    <Package className="h-3 w-3 text-indigo-400 flex-shrink-0" />
                                    <span className="text-xs font-semibold text-gray-900 leading-tight">
                                      {plan.plan}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )))}
                          </div>

                          {/* Action Button for Mobile */}
                          <div className="mt-4 flex items-center gap-2">
                        {(lead as any).verificationMethod === 'whatsapp' && (
                          <motion.button
                            whileHover={{ scale: 1.02, y: -1 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                              setSelectedLead(lead);
                              setShowWhatsAppLogs(true);
                              // Messages will be fetched via API polling in useEffect
                            }}
                            title="WhatsApp Verification"
                                className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-green-50/80 text-green-700 border border-green-100 hover:bg-green-50 hover:border-green-200 transition-all duration-200"
                          >
                            <svg viewBox="0 0 32 32" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                              <path d="M19.11 17.46c-.27-.13-1.6-.79-1.85-.88-.25-.09-.43-.13-.61.13-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.13-1.12-.41-2.12-1.31-.78-.69-1.31-1.54-1.46-1.8-.15-.27-.02-.41.11-.54.11-.11.27-.29.41-.45.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.13-.61-1.46-.83-2-.22-.52-.44-.45-.61-.45h-.52c-.18 0-.45.07-.68.34-.23.27-.9.88-.9 2.15 0 1.27.92 2.5 1.05 2.67.14.18 1.81 2.77 4.4 3.88.62.27 1.11.43 1.49.55.63.2 1.2.17 1.65.1.5-.07 1.6-.65 1.83-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.31zM16 3C8.82 3 3 8.82 3 16c0 2.29.62 4.48 1.79 6.42L3 29l6.74-1.77C11.58 28.38 13.76 29 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3zm0 23.73c-2.12 0-4.11-.62-5.78-1.78l-.41-.26-4.01 1.05 1.07-3.9-.27-.41C5.43 20.76 4.73 18.43 4.73 16 4.73 9.94 9.94 4.73 16 4.73S27.27 9.94 27.27 16 22.06 26.73 16 26.73z"/>
                            </svg>
                          </motion.button>
                        )}
                            <motion.div
                              whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                              className="relative z-20 flex-1"
                            >
                              <Link
                                to={`/dashboard/leads/${lead.id}`}
                                className="inline-flex items-center justify-center w-full px-4 py-2 bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-600 rounded-lg hover:from-indigo-100 hover:to-purple-100 transition-all duration-200 group ring-1 ring-indigo-100"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                                View Details
                                <ArrowRight className="h-4 w-4 ml-2 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
                              </Link>
                            </motion.div>
                      </div>
                        </div>
                      </div>
                    </motion.div>
                    );
                  })
              )}
          </div>

          {/* Pagination */}
              <div className="bg-gradient-to-br from-indigo-50/90 via-purple-50/90 to-pink-50/90 backdrop-blur-sm px-4 py-3 flex items-center justify-between border-t border-indigo-100/50 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-xl text-gray-700 bg-white/95 backdrop-blur-sm hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                Previous
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-xl text-gray-700 bg-white/95 backdrop-blur-sm hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                Next
                  </motion.button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                  <span className="font-medium">
                    {Math.min(currentPage * pageSize, filteredLeads.length)}
                  </span>{' '}
                  of <span className="font-medium">{filteredLeads.length}</span> results
                </p>
              </div>
              <div>
                    <nav className="relative z-0 inline-flex rounded-xl shadow-sm -space-x-px" aria-label="Pagination">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-xl border border-gray-300 bg-white/95 backdrop-blur-sm text-sm font-medium text-gray-500 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Previous</span>
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                      </motion.button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <motion.button
                      key={page}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                      onClick={() => setCurrentPage(page)}
                      className={clsx(
                        'relative inline-flex items-center px-4 py-2 border text-sm font-medium',
                        page === currentPage
                          ? 'z-10 bg-indigo-50 border-indigo-500 text-indigo-600'
                              : 'bg-white/95 backdrop-blur-sm border-gray-300 text-gray-500 hover:bg-white'
                      )}
                    >
                      {page}
                        </motion.button>
                  ))}
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-xl border border-gray-300 bg-white/95 backdrop-blur-sm text-sm font-medium text-gray-500 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Next</span>
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                      </motion.button>
                </nav>
              </div>
            </div>
          </div>
        </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-8 sm:mt-12 relative"
          >
            <div className="relative overflow-hidden rounded-2xl bg-white/95 backdrop-blur-xl border border-white/40 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
              <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-transparent rounded-2xl" />
              <div className="relative px-6 py-12 text-center">
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner">
                  <Users className="w-8 h-8 text-indigo-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No leads found</h3>
                <p className="text-gray-500 max-w-sm mx-auto">
                  {searchTerm ? 'No leads match your search criteria.' : 'No pending verification leads at the moment.'}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Action Dialog */}
      <AnimatePresence>
        {showActionDialog && selectedLead && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-900">
                  {actionType === 'verify' ? 'Verify Lead' : 
                   actionType === 'reject' ? 'Reject Lead' : 
                   'Mark for Follow-up'}
                </h3>
                <button
                  onClick={() => {
                    setShowActionDialog(false);
                    setSelectedLead(null);
                    setActionType(null);
                    setActionNote('');
                  }}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">Customer Details</h3>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Name</p>
                        <p className="text-sm font-medium text-gray-900">{selectedLead.customerName}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Phone</p>
                        <p className="text-sm font-medium text-gray-900">{selectedLead.customerNumber}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Verification Notes
                  </label>
                  <textarea
                    rows={4}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                    placeholder="Enter any notes about this verification..."
                  />
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setShowActionDialog(false);
                      setSelectedLead(null);
                      setActionType(null);
                      setActionNote('');
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleActionComplete}
                    className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                      actionType === 'verify' ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500' :
                      actionType === 'reject' ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' :
                      'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500'
                    }`}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Media Upload Modal */}
      <AnimatePresence>
        {showMediaModal && selectedLead && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-4 sm:p-6 max-w-6xl w-full mx-4 shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Verification Checklist</h3>
                    <p className="text-xs text-gray-500">Complete all items to proceed with verification</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowMediaModal(false);
                    setSelectedLead(null);
                    setUploadComplete(false);
                    const baseChecklist = VERIFY_CHECKLIST.map(() => false);
      const currentShowCampaign = selectedLead ? hasPostpaidCampaignPlan(selectedLead) : false;
      setVerifyChecklist(currentShowCampaign ? [...baseChecklist, false] : baseChecklist);
                    setVerifyMediaFiles([]);
                  }}
                  className="text-gray-400 hover:text-gray-500 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Progress Bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">Progress</span>
                  <span className="text-xs font-bold text-indigo-600">
                    {verifyChecklist.filter(Boolean).length}/{verifyChecklist.length} completed
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div 
                    className="bg-gradient-to-r from-indigo-500 to-purple-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${(verifyChecklist.filter(Boolean).length / verifyChecklist.length) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Checklist */}
              <div className="mb-6">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {VERIFY_CHECKLIST.map((section, idx) => {
                    const hasLongContent = section.details.length > 2 || section.details.some(item => item.length > 80);
                    const isExpanded = expandedSections[idx];
                    
                    return (
                      <div 
                        key={section.header} 
                        className={`p-4 rounded-xl border-2 transition-all duration-300 hover:shadow-md ${
                          verifyChecklist[idx] 
                            ? 'border-green-200 bg-gradient-to-br from-green-50/80 to-emerald-50/60' 
                            : 'border-gray-200 bg-gradient-to-br from-gray-50/50 to-slate-50/40 hover:border-indigo-200'
                        }`}
                      >
                        <label className="flex items-start space-x-3 cursor-pointer select-none">
                          <div className="relative flex-shrink-0">
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
                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-300 shadow-sm ${
                              verifyChecklist[idx]
                                ? 'bg-gradient-to-r from-green-500 to-emerald-500 border-green-500 shadow-green-200'
                                : 'bg-white border-gray-300 hover:border-indigo-400 hover:shadow-indigo-100'
                            }`}>
                              {verifyChecklist[idx] && (
                                <Check className="w-4 h-4 text-white" />
                              )}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-2">
                              <span className={`font-bold text-sm ${
                                verifyChecklist[idx] ? 'text-green-800' : 'text-gray-800'
                              }`}>
                                {section.header}
                              </span>
                              {verifyChecklist[idx] && (
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                              )}
                            </div>
                            
                            <div className={`space-y-1.5 transition-all duration-300 ${
                              hasLongContent && !isExpanded ? 'max-h-16 overflow-hidden' : ''
                            }`}>
                              {section.details.map((item, i) => (
                                <div key={i} className="flex items-start space-x-2">
                                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 transition-colors ${
                                    verifyChecklist[idx] ? 'bg-green-500' : 'bg-gray-400'
                                  }`}></div>
                                  <span className={`text-xs leading-relaxed ${
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
                                className={`mt-2 text-xs font-medium transition-colors ${
                                  verifyChecklist[idx] 
                                    ? 'text-green-600 hover:text-green-700' 
                                    : 'text-indigo-600 hover:text-indigo-700'
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
                      POSTPAID_CAMPAIGN_CHECKLIST.details.some((item: string) => item.length > 80);
                    const isExpanded = expandedSections[campaignIdx] || false;
                    
                    return (
                      <div 
                        key={POSTPAID_CAMPAIGN_CHECKLIST.header} 
                        className={`p-4 rounded-xl border-2 transition-all duration-300 hover:shadow-md ${
                          verifyChecklist[campaignIdx] 
                            ? 'border-green-200 bg-gradient-to-br from-green-50/80 to-emerald-50/60' 
                            : 'border-gray-200 bg-gradient-to-br from-gray-50/50 to-slate-50/40 hover:border-indigo-200'
                        }`}
                      >
                        <label className="flex items-start space-x-3 cursor-pointer select-none">
                          <div className="relative flex-shrink-0">
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
                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-300 shadow-sm ${
                              verifyChecklist[campaignIdx]
                                ? 'bg-gradient-to-r from-green-500 to-emerald-500 border-green-500 shadow-green-200'
                                : 'bg-white border-gray-300 hover:border-indigo-400 hover:shadow-indigo-100'
                            }`}>
                              {verifyChecklist[campaignIdx] && (
                                <Check className="w-4 h-4 text-white" />
                              )}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-2">
                              <span className={`font-bold text-sm ${
                                verifyChecklist[campaignIdx] ? 'text-green-800' : 'text-gray-800'
                              }`}>
                                {POSTPAID_CAMPAIGN_CHECKLIST.header}
                              </span>
                              {verifyChecklist[campaignIdx] && (
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                              )}
                            </div>
                            
                            <div className={`space-y-1.5 transition-all duration-300 ${
                              hasLongContent && !isExpanded ? 'max-h-16 overflow-hidden' : ''
                            }`}>
                              {POSTPAID_CAMPAIGN_CHECKLIST.details.map((item, i) => (
                                <div key={i} className="flex items-start space-x-2">
                                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 transition-colors ${
                                    verifyChecklist[campaignIdx] ? 'bg-green-500' : 'bg-gray-400'
                                  }`}></div>
                                  <span className={`text-xs leading-relaxed ${
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
                                className={`mt-2 text-xs font-medium transition-colors ${
                                  verifyChecklist[campaignIdx] 
                                    ? 'text-green-600 hover:text-green-700' 
                                    : 'text-indigo-600 hover:text-indigo-700'
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
                </div>
              </div>

              {/* Media Upload Section */}
              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center space-x-2 mb-3">
                  <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-md flex items-center justify-center">
                    <Paperclip className="w-3 h-3 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-900">Attach Verification Media</h4>
                    <p className="text-xs text-gray-500">Upload supporting documents and media</p>
                  </div>
                </div>
                
                {verifyChecklist.every(Boolean) ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <MediaUpload
                      leadId={selectedLead.id}
                      onUploadComplete={(files) => {
                        setVerifyMediaFiles(files);
                        setUploadComplete(true);
                        setShowMediaModal(false);
                        setActionType('verify');
                        setShowActionDialog(true);
                      }}
                    />
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span className="text-xs font-medium text-amber-800">
                        Please complete all checklist items before attaching media
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex justify-end mt-4 pt-3 border-t border-gray-200">
                <button
                  onClick={() => {
                    setShowMediaModal(false);
                    setSelectedLead(null);
                    setUploadComplete(false);
                    const baseChecklist = VERIFY_CHECKLIST.map(() => false);
      const currentShowCampaign = selectedLead ? hasPostpaidCampaignPlan(selectedLead) : false;
      setVerifyChecklist(currentShowCampaign ? [...baseChecklist, false] : baseChecklist);
                    setVerifyMediaFiles([]);
                  }}
                  className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* WhatsApp Logs Modal */}
      <AnimatePresence>
        {showWhatsAppLogs && selectedLead && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white/90 rounded-2xl p-0 max-w-6xl w-full mx-4 shadow-2xl overflow-hidden"
            >
              <div className="px-6 sm:px-8 py-4 bg-gradient-to-r from-emerald-50 to-green-50 border-b border-emerald-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-emerald-100 text-emerald-600">
                    <svg viewBox="0 0 32 32" className="h-5 w-5" fill="currentColor" aria-hidden="true"><path d="M19.11 17.46c-.27-.13-1.6-.79-1.85-.88-.25-.09-.43-.13-.61.13-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.13-1.12-.41-2.12-1.31-.78-.69-1.31-1.54-1.46-1.8-.15-.27-.02-.41.11-.54.11-.11.27-.29.41-.45.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.13-.61-1.46-.83-2-.22-.52-.44-.45-.61-.45h-.52c-.18 0-.45.07-.68.34-.23.27-.9.88-.9 2.15 0 1.27.92 2.5 1.05 2.67.14.18 1.81 2.77 4.4 3.88.62.27 1.11.43 1.49.55.63.2 1.2.17 1.65.1.5-.07 1.6-.65 1.83-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.31zM16 3C8.82 3 3 8.82 3 16c0 2.29.62 4.48 1.79 6.42L3 29l6.74-1.77C11.58 28.38 13.76 29 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3zm0 23.73c-2.12 0-4.11-.62-5.78-1.78l-.41-.26-4.01 1.05 1.07-3.9-.27-.41C5.43 20.76 4.73 18.43 4.73 16 4.73 9.94 9.94 4.73 16 4.73S27.27 9.94 27.27 16 22.06 26.73 16 26.73z"/></svg>
                  </span>
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-emerald-800">WhatsApp Verification</h3>
                    {selectedLead && (
                      <p className="text-xs sm:text-sm text-emerald-700/80">{selectedLead.customerName} · {selectedLead.customerNumber}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleResendFlow}
                    disabled={resendingFlow}
                    className={clsx(
                      "inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-sm transition-colors",
                      resendingFlow
                        ? "bg-indigo-400 text-white cursor-not-allowed"
                        : "bg-indigo-600 text-white hover:bg-indigo-700"
                    )}
                    title="Resend verification flow message"
                  >
                    {resendingFlow ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-1.5 h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                        </svg>
                        Resending...
                      </>
                    ) : (
                      <>
                    <ArrowRight className="w-3.5 h-3.5 mr-1.5" />
                    Resend Flow
                      </>
                    )}
                  </button>
                <button
                  onClick={() => {
                    setShowWhatsAppLogs(false);
                    setSelectedLead(null);
                  }}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-full text-emerald-700 hover:bg-emerald-100/60"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              </div>
                              <div ref={logsContainerRef} className="px-6 sm:px-8 py-5 max-h-[70vh] overflow-y-auto">
                <WhatsAppConversationView
                  messages={whatsAppLogs as WhatsAppMessage[]}
                  lead={selectedLead}
                  planDetails={planDetails || undefined}
                  onResendMessage={handleResendVerificationMessage}
                  resendingLogId={resendingLogId}
                  showResendButton={true}
                  containerRef={logsContainerRef}
                />


                {/* Interactive Flow UI - Delivery Details Form - REMOVED: Only show messages, not UI forms */}
                {false && (flowState === 'delivery' || flowState === 'address' || flowState === 'nationality' || flowState === 'complete') && (
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
              {/* Reply composer */}
              <div className="mt-3 mb-4">
                <div className="max-w-4xl mx-auto border border-gray-200 rounded-2xl bg-white/80 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-gray-700">Reply to customer</label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-medium">Quick:</span>
                      <div className="flex gap-1.5">
                        {READY_MADE_MESSAGES.map((template) => (
                          <button
                            key={template.id}
                            onClick={() => handleTemplateMessage(template)}
                            className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-xs font-medium text-blue-700 transition-all duration-200 border border-blue-200 hover:border-blue-300 hover:shadow-sm"
                            title={template.message}
                          >
                            {template.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
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
                        className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 pr-12 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-400 min-h-[40px] max-h-[80px]"
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-gray-400">
                       
                      </div>
                    </div>
                    <button
                      disabled={sendingReply || !replyText.trim()}
                      onClick={sendWhatsAppReply}
                      className="inline-flex items-center px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingReply ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
    </div>
  );
}