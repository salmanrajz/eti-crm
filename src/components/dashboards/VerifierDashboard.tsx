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
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
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
  Paperclip,
  AlertCircle
} from 'lucide-react';
import { clsx } from 'clsx';
// import { planBenefits } from '../../utils/planBenefits'; // Now using dynamic benefits from Firebase
// import { VerifyLeadModal } from '../Leads/VerifyLeadModal';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { MediaUpload } from '../Leads/MediaUpload';
// WhatsApp send credentials (same as CreateLead)
const WHATSAPP_API_URL = 'https://graph.facebook.com/v17.0/542227575631617/messages';
const WHATSAPP_ACCESS_TOKEN = 'EAAQzFQxG0goBO4DZABL7PrPyIdmFxDbP3hFYQCiioiJZAo4P4JbABnGw1qmBzVJUerTHkZB2qZAfWdaos16NJUYmXIewPTmV90neQjceLWnycrhZBfayZAP5EHCYD4qwBDNAiMvdBz8gLj6pwjDCCCVVA2UasKMPgvFx5GGwXfIMBBCc0tOvOCvTc6VeNkgD5GyAZDZD';

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

  // Function to send WhatsApp reply
  const sendWhatsAppReply = async () => {
    if (!selectedLead || !replyText.trim() || sendingReply) return;
    
    try {
      setSendingReply(true);
      // Format destination number similar to CreateLead
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
      if (to.startsWith(code)) {
        // already has code
      } else {
        to = `${code}${to}`;
      }

      const resp = await fetch(WHATSAPP_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: replyText.trim() }
        })
      });
      if (!resp.ok) {
        const txt = await resp.text();
        console.error('Failed to send WhatsApp reply:', txt);
        toast.error('Failed to send WhatsApp reply');
      } else {
        // Log to Firestore
        await addDoc(collection(db, 'leads', selectedLead.id, 'whatsappLogs'), {
          direction: 'outbound',
          to,
          messageText: replyText.trim(),
          createdAt: serverTimestamp(),
          templateName: 'verifier_text'
        });
        toast.success('Reply sent');
        setReplyText('');
      }
    } catch (e) {
      console.error('Error sending reply:', e);
      toast.error('Error sending reply');
    } finally {
      setSendingReply(false);
    }
  };

  useEffect(() => {
    if (showWhatsAppLogs && logsContainerRef.current) {
      try {
        logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
      } catch {}
    }
  }, [whatsAppLogs, showWhatsAppLogs]);

  // Get the current status from URL params
  const currentStatus = searchParams.get('status') || 'pending_verification';

  useEffect(() => {
    loadVerifierData();
  }, [user, currentStatus]);

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

  async function loadVerifierData() {
    try {
      setLoading(true);

      // Get current date and time
      const now = new Date();
      
      // Get today's start and end dates (local timezone)
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      
      // Get current month's start and end dates (local timezone)
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);



      // Check verifier's group assignment
      const userDoc = await getDoc(doc(db, 'users', user.id));
      const userData = userDoc.data();
      const verifierGroups = userData?.verifierGroups || [];
      const hasAllGroups = verifierGroups.includes('all') || verifierGroups.length === 0;

      // Get leads based on verifier's group assignment
      let verificationQuery;
      if (hasAllGroups) {
        // Show all leads if verifier handles all groups
        verificationQuery = query(
          collection(db, 'leads'),
          where('status', '==', currentStatus),
          orderBy('createdAt', 'desc')
        );
      } else {
        // Filter leads by verifier's specific groups
        verificationQuery = query(
          collection(db, 'leads'),
          where('status', '==', currentStatus),
          orderBy('createdAt', 'desc')
        );
      }

      const verificationSnapshot = await getDocs(verificationQuery);
      let allLeads = verificationSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
        updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt
      })) as Lead[];

      // Filter leads based on verifier's group assignment
      if (!hasAllGroups) {
        allLeads = allLeads.filter(lead => {
          // Check if any of the lead's plans belong to any of the verifier's groups
          const hasMatchingGroup = lead.plans?.some(plan => {
            // Normalize group names for comparison
            const planGroup = plan.group?.toLowerCase();
            return verifierGroups.some((verifierGroup: string) => {
              const normalizedVerifierGroup = verifierGroup.toLowerCase();
              return planGroup === normalizedVerifierGroup;
            });
          }) || false;

          return hasMatchingGroup;
        });
      }

      // Get group information for all numbers in the leads
      const numberIds = allLeads.flatMap(lead => lead.plans?.map(plan => plan.numberId) || []);
      const numberGroups = new Map();
      
      if (numberIds.length > 0) {
        const numberPromises = numberIds.map(async (numberId) => {
          const numberRef = doc(db, 'numberPool', numberId);
          const numberDoc = await getDoc(numberRef);
          if (numberDoc.exists()) {
            const numberData = numberDoc.data();
            numberGroups.set(numberId, numberData.group || 'Unassigned');
          }
        });
        await Promise.all(numberPromises);
      }

      // Add group information to the leads
      const leadsWithGroups = allLeads.map(lead => ({
        ...lead,
        plans: lead.plans?.map(plan => ({
          ...plan,
          group: numberGroups.get(plan.numberId) || 'Unassigned'
        }))
      }));

      // Show ALL leads with the current status (no date filtering)
      const verificationData = leadsWithGroups;

      // Get all pending verification leads for metrics (not filtered by verifier)
      const pendingQuery = query(
        collection(db, 'leads'),
        where('status', '==', 'pending_verification')
      );
      const pendingSnapshot = await getDocs(pendingQuery);
      let pendingData = pendingSnapshot.docs.map(doc => ({
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
        status: doc.data().status,
        plans: doc.data().plans || []
      })) as Lead[];

      // Filter pending leads based on verifier's group assignment
      if (!hasAllGroups) {
        pendingData = pendingData.filter(lead => {
          const hasMatchingGroup = lead.plans?.some(plan => {
            const planGroup = plan.group?.toLowerCase();
            return verifierGroups.some((verifierGroup: string) => {
              const normalizedVerifierGroup = verifierGroup.toLowerCase();
              return planGroup === normalizedVerifierGroup;
            });
          }) || false;
          return hasMatchingGroup;
        });
      }

      // Get all verified leads and filter by this verifier
      // Using a broader query to catch all verified leads, then filter by verifier
      const allVerifiedQuery = query(
        collection(db, 'leads'),
        where('status', '==', 'verified')
      );
      const allVerifiedSnapshot = await getDocs(allVerifiedQuery);
      const allVerifiedLeads = allVerifiedSnapshot.docs.map(doc => {
        const data = doc.data();
        let verifiedAtDate = null;
        let updatedAtDate = null;
        
        // Handle Firestore Timestamp conversion for verifiedAt
        if (data.verifiedAt) {
          if (typeof data.verifiedAt.toDate === 'function') {
            verifiedAtDate = data.verifiedAt.toDate();
          } else if (data.verifiedAt instanceof Date) {
            verifiedAtDate = data.verifiedAt;
          } else if (typeof data.verifiedAt === 'string') {
            verifiedAtDate = new Date(data.verifiedAt);
          }
        }
        
        // Handle Firestore Timestamp conversion for updatedAt (fallback if verifiedAt doesn't exist)
        if (data.updatedAt) {
          if (typeof data.updatedAt.toDate === 'function') {
            updatedAtDate = data.updatedAt.toDate();
          } else if (data.updatedAt instanceof Date) {
            updatedAtDate = data.updatedAt;
          } else if (typeof data.updatedAt === 'string') {
            updatedAtDate = new Date(data.updatedAt);
          }
        }
        
        return {
          ...data,
          id: doc.id,
          verifiedAt: verifiedAtDate || updatedAtDate, // Use updatedAt as fallback
          createdAt: data.createdAt?.toDate?.() || data.createdAt,
          updatedAt: updatedAtDate,
          status: data.status,
          verifiedBy: data.verifiedBy
        } as unknown as Lead;
      });

      // Filter to only include leads verified by this user
      const verifiedData = allVerifiedLeads.filter(lead => (lead as any).verifiedBy === user.id);

      // Filter verified leads for today
      const dailyVerifiedData = verifiedData.filter(lead => {
        const verifiedDate = (lead as any).verifiedAt ? new Date((lead as any).verifiedAt) : null;
        return verifiedDate && verifiedDate >= startOfDay && verifiedDate <= endOfDay;
      });

      // Filter verified leads for current month
      const monthlyVerifiedData = verifiedData.filter(lead => {
        const verifiedDate = (lead as any).verifiedAt ? new Date((lead as any).verifiedAt) : null;
        return verifiedDate && verifiedDate >= startOfMonth && verifiedDate <= endOfMonth;
      });


      // Calculate metrics
      const metrics = {
        pendingVerificationCount: pendingData.length,
        dailyVerifiedCount: dailyVerifiedData.length,
        monthlyVerifiedCount: monthlyVerifiedData.length
      };



      setVerificationMetrics(metrics);
      setVerificationLeads(verificationData);
    } catch (error) {
      console.error('Error loading verifier data:', error);
    } finally {
      setLoading(false);
    }
  }

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
      name: 'Daily Verified',
      value: verificationMetrics.dailyVerifiedCount,
      icon: CheckCircle,
      color: 'bg-gradient-to-br from-green-500 to-green-600',
      textColor: 'text-green-600',
      status: 'daily_verified'
    },
    {
      name: 'Monthly Verified',
      value: verificationMetrics.monthlyVerifiedCount,
      icon: CheckCircle,
      color: 'bg-gradient-to-br from-blue-500 to-blue-600',
      textColor: 'text-blue-600',
      status: 'monthly_verified'
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
      
      const leadRef = doc(db, 'leads', selectedLead.id);
      const newStatus = actionType === 'verify' ? 'verified' : 
                       actionType === 'reject' ? 'rejected' : 
                       'follow_verification';
      
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

      // Send notification to the agent
      if (selectedLead.agentId) {
        const statusMessage = newStatus === 'verified' ? 'Lead Verified' : 
                            newStatus === 'rejected' ? 'Lead Rejected' : 
                            'Lead Marked for Follow-up Verification';
        
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

      // Get manager's phone numbers for notification
      let managerPhoneNumbers: string[] = [];
      if (selectedLead.managerId) {
        try {
          const managerRef = doc(db, 'users', selectedLead.managerId);
          const managerDoc = await getDoc(managerRef);
          
          if (managerDoc.exists()) {
            const managerData = managerDoc.data();
            if (Array.isArray(managerData.phoneNumbers)) {
              managerPhoneNumbers = managerData.phoneNumbers;
            } else if (typeof managerData.phoneNumbers === 'string') {
              managerPhoneNumbers = [managerData.phoneNumbers];
            } else if (managerData.phoneNumber) {
              managerPhoneNumbers = [managerData.phoneNumber];
            }
          }
        } catch (error) {
          console.error('Error fetching manager data:', error);
        }
      }

      console.log('Manager phone numbers for notification:', managerPhoneNumbers);
      console.log('Selected lead manager ID:', selectedLead.managerId);

      // Send WhatsApp notification to manager
      if (managerPhoneNumbers.length > 0) {
        console.log('Attempting to send WhatsApp notifications to', managerPhoneNumbers.length, 'phone numbers');
      } else {
        console.log('No manager phone numbers found. WhatsApp notification will not be sent.');
        console.log('Manager ID:', selectedLead.managerId);
        if (selectedLead.managerId) {
          console.log('Attempting to fetch manager data for debugging...');
          try {
            const managerRef = doc(db, 'users', selectedLead.managerId);
            const managerDoc = await getDoc(managerRef);
            if (managerDoc.exists()) {
              const managerData = managerDoc.data();
              console.log('Manager data found:', {
                id: managerDoc.id,
                name: managerData.name,
                phoneNumbers: managerData.phoneNumbers,
                phoneNumber: managerData.phoneNumber,
                role: managerData.role
              });
            } else {
              console.log('Manager document not found in database');
            }
          } catch (error) {
            console.error('Error fetching manager data for debugging:', error);
          }
        }
      }

      if (managerPhoneNumbers.length > 0) {
        // Get agent's information
          const agentRef = doc(db, 'users', selectedLead.agentId);
          const agentDoc = await getDoc(agentRef);
        const agentData = agentDoc.exists() ? agentDoc.data() : null;
        const agentName = agentData?.name || 'N/A';

        for (const phoneNumber of managerPhoneNumbers) {
          try {
            const response = await fetch(WHATSAPP_API_URL, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  messaging_product: "whatsapp",
                to: phoneNumber,
                  type: "template",
                  template: {
                  name: "leadupdate",
                    language: {
                      code: "en"
                    },
                    components: [
                      {
                        type: "body",
                        parameters: [
                          {
                            type: "text",
                            text: selectedLead.customerName || "N/A"
                          },
                          {
                            type: "text",
                            text: selectedLead.customerNumber || "N/A"
                          },
                          {
                            type: "text",
                            text: selectedLead.plans?.[0]?.number || "N/A"
                          },
                          {
                            type: "text",
                          text: newStatus === 'verified' ? 'Verified' : 
                                newStatus === 'rejected' ? 'Rejected' : 
                                'Follow Up Required'
                          },
                          {
                            type: "text",
                          text: agentName
                          },
                          {
                            type: "text",
                            text: `${window.location.origin}/dashboard/leads/${selectedLead.id}`
                          }
                        ]
                      }
                    ]
                  }
                })
              });

            if (!response.ok) {
              const errorText = await response.text();
              console.error('Failed to send WhatsApp notification to manager:', phoneNumber);
              console.error('Response status:', response.status);
              console.error('Response text:', errorText);
            } else {
              const responseData = await response.json();
              console.log('Successfully sent WhatsApp notification to manager:', phoneNumber);
              console.log('WhatsApp API response:', responseData);
          }
        } catch (error) {
            console.error('Error sending WhatsApp notification:', error);
          }
        }
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
      loadVerifierData();
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
      {/* Welcome Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome back, {user?.name}!
            </h1>
            <p className="mt-2 text-lg text-gray-600">
              Here's an overview of leads requiring verification.
            </p>
          </div>
          <div className="hidden sm:flex items-center space-x-2 text-sm text-gray-600">
            <Calendar className="h-5 w-5" />
            <span>{format(new Date(), 'EEEE, MMMM d, yyyy')}</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        {verificationStats.map((stat, index) => {
          // Only the first card (Pending Verification) is clickable
          const isClickable = index === 0;
          
          if (isClickable) {
            return (
              <motion.button
                key={stat.name}
                onClick={() => handleStatClick(stat.status)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`bg-white overflow-hidden shadow-lg rounded-xl hover:shadow-xl transition-all duration-300 cursor-pointer ${
                  currentStatus === stat.status ? 'ring-2 ring-indigo-500' : ''
                }`}
              >
                <div className="p-6">
                  <div className="flex items-center">
                    <div className={`flex-shrink-0 p-3 rounded-xl ${stat.color}`}>
                      <stat.icon className="h-6 w-6 text-white" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-900 truncate">
                          {stat.name}
                        </dt>
                        <dd className={`text-2xl font-bold ${stat.textColor}`}>
                          {stat.value}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          }
          
          // Non-clickable cards (Daily and Monthly)
          return (
            <motion.div
              key={stat.name}
              className="bg-white overflow-hidden shadow-lg rounded-xl"
            >
              <div className="p-6">
                <div className="flex items-center">
                  <div className={`flex-shrink-0 p-3 rounded-xl ${stat.color}`}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-900 truncate">
                        {stat.name}
                      </dt>
                      <dd className={`text-2xl font-bold ${stat.textColor}`}>
                        {stat.value}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

        {/* Search and Filters */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="Search leads..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center space-x-4">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as typeof PAGE_SIZES[number])}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-lg"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </select>
          </div>
        </div>

      {/* Lead Details Table */}
      <div className="bg-white shadow-lg rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Pending Verification Leads
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer Name & Number
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Selected Number
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Group
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Language
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created Date
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {paginatedLeads.length === 0 ? (
                <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                    No leads found for this status
                  </td>
                </tr>
              ) : (
                  paginatedLeads.map((lead) => (
                    <motion.tr
                      key={lead.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={clsx(
                        "hover:bg-gray-50",
                        (lead as any).verificationMethod === 'whatsapp' &&
                          "bg-gradient-to-r from-green-50 to-emerald-50"
                      )}
                    >
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center">
                          <User2 className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-semibold text-gray-900">{lead.customerName}</div>
                          <div className="text-sm text-gray-500 flex items-center">
                            <Phone className="h-3.5 w-3.5 mr-1" />
                      {lead.customerNumber}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col space-y-2">
                        {lead.plans?.map((plan, index) => (
                          <div key={index} className="flex flex-col">
                            <div className="flex items-center text-sm font-medium text-gray-900">
                              <Phone className="h-4 w-4 mr-2 text-indigo-500" />
                              {plan.number}
                              <span className={clsx(
                                "ml-2 px-2 py-0.5 text-xs rounded-full",
                                plan.category === 'Gold' ? 'bg-yellow-100 text-yellow-800' :
                                plan.category === 'Platinum' ? 'bg-purple-100 text-purple-800' :
                                'bg-gray-100 text-gray-800'
                              )}>
                                {plan.category}
                              </span>
                            </div>
                            <div className="flex items-center text-sm text-gray-500 mt-1">
                              <Package className="h-4 w-4 mr-2 text-indigo-400" />
                              <span className={clsx(
                                "ml-2 px-2 py-0.5 text-xs rounded-full",
                                plan.plan === 'Premium' ? 'bg-purple-100 text-purple-800' :
                                plan.plan === 'VIP' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              )}>
                                {plan.plan}
                              </span>
                            </div>
                          </div>
                        ))}
                        {!lead.plans?.length && (
                          <div className="text-sm text-gray-500">No plans selected</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {lead.plans?.map((plan, index) => (
                        <div key={index} className="flex items-center">
                          <span className={clsx(
                            "px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full",
                            plan.group === 'Group A' ? 'bg-blue-100 text-blue-800' :
                            plan.group === 'Group B' ? 'bg-green-100 text-green-800' :
                            plan.group === 'Group C' ? 'bg-purple-100 text-purple-800' :
                            plan.group === 'Group D' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          )}>
                            {plan.group}
                          </span>
                        </div>
                      ))}
                      {!lead.plans?.length && (
                        <div className="text-sm text-gray-500">No group assigned</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={clsx(
                        "px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full",
                        lead.language === 'English' ? 'bg-blue-100 text-blue-800' :
                        lead.language === 'Arabic' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      )}>
                        {lead.language}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {format(lead.createdAt, 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center">
                        <motion.button
                          whileHover={{ scale: 1.02, y: -1 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => navigate(`/dashboard/leads/${lead.id}`)}
                          className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-indigo-50/80 text-indigo-600 border border-indigo-100 hover:bg-indigo-50 hover:border-indigo-200 transition-all duration-200"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          <span className="font-medium">View Details</span>
                        </motion.button>
                        {(lead as any).verificationMethod === 'whatsapp' && (
                          <motion.button
                            whileHover={{ scale: 1.02, y: -1 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                              setSelectedLead(lead);
                              setShowWhatsAppLogs(true);
                              const logsCol = collection(db, 'leads', lead.id, 'whatsappLogs');
                              onSnapshot(query(logsCol, orderBy('createdAt', 'asc')), (snap) => {
                                const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                                setWhatsAppLogs(rows as any[]);
                              }, (error) => {
                                // ✅ FIX: Handle permission errors gracefully during logout
                                if (error.code === 'permission-denied') {
                                  // User logged out or lost permissions - cleanup silently
                                  return;
                                }
                                
                                console.error('Error in VerifierDashboard WhatsApp logs listener:', error);
                              });
                            }}
                            title="WhatsApp Verification"
                            className="ml-2 inline-flex items-center justify-center h-9 w-9 rounded-full bg-green-50/80 text-green-700 border border-green-100 hover:bg-green-50 hover:border-green-200 transition-all duration-200"
                          >
                            <svg viewBox="0 0 32 32" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                              <path d="M19.11 17.46c-.27-.13-1.6-.79-1.85-.88-.25-.09-.43-.13-.61.13-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.13-1.12-.41-2.12-1.31-.78-.69-1.31-1.54-1.46-1.8-.15-.27-.02-.41.11-.54.11-.11.27-.29.41-.45.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.13-.61-1.46-.83-2-.22-.52-.44-.45-.61-.45h-.52c-.18 0-.45.07-.68.34-.23.27-.9.88-.9 2.15 0 1.27.92 2.5 1.05 2.67.14.18 1.81 2.77 4.4 3.88.62.27 1.11.43 1.49.55.63.2 1.2.17 1.65.1.5-.07 1.6-.65 1.83-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.52-.31zM16 3C8.82 3 3 8.82 3 16c0 2.29.62 4.48 1.79 6.42L3 29l6.74-1.77C11.58 28.38 13.76 29 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3zm0 23.73c-2.12 0-4.11-.62-5.78-1.78l-.41-.26-4.01 1.05 1.07-3.9-.27-.41C5.43 20.76 4.73 18.43 4.73 16 4.73 9.94 9.94 4.73 16 4.73S27.27 9.94 27.27 16 22.06 26.73 16 26.73z"/>
                            </svg>
                          </motion.button>
                        )}
                      </div>
                    </td>
                    </motion.tr>
                ))
              )}
            </tbody>
          </table>
          </div>

          {/* Pagination */}
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
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
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Previous</span>
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={clsx(
                        'relative inline-flex items-center px-4 py-2 border text-sm font-medium',
                        page === currentPage
                          ? 'z-10 bg-indigo-50 border-indigo-500 text-indigo-600'
                          : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                      )}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="sr-only">Next</span>
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </nav>
              </div>
            </div>
          </div>
        </div>
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
                              <div ref={logsContainerRef} className="px-6 sm:px-8 py-5 max-h-[70vh] overflow-y-auto space-y-4">
                {whatsAppLogs.length === 0 ? (
                  <div className="text-sm text-gray-500">No WhatsApp messages found for this lead.</div>
                ) : (
                  whatsAppLogs.map((log) => {
                    const created = (log.createdAt?.toDate?.() || log.createdAt) ? new Date(log.createdAt?.toDate?.() || log.createdAt) : null;
                    const createdStr = created ? `${format(created, 'MMM d, yyyy HH:mm')}` : '';
                    const fromDigits = (log.from || '').toString().replace(/\D/g, '');
                    const fromDisplay = fromDigits ? `+${fromDigits}` : '';
                    const firstPlan = selectedLead?.plans?.[0];
                    const planInfo = planDetails;
                    const isOutbound = log.direction === 'outbound';
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
                            <span className="ml-2">
                              {fromDisplay && (
                                <span className="font-bold text-blue-600">From {fromDisplay}</span>
                              )}
                              {createdStr && ` · ${createdStr}`}
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
                  })
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
    </div>
  );
}