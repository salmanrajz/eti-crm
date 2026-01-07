/**
 * ===============================================================================
 * COORDINATOR DASHBOARD COMPONENT - COORDINATION WORKFLOW INTERFACE
 * ===============================================================================
 * 
 * This component provides the main dashboard for coordinators, enabling them to
 * manage lead assignments, coordinate between agents and customers, and handle
 * number pool operations within their assigned groups.
 * 
 * FEATURES:
 * 
 * 1. LEAD COORDINATION MANAGEMENT
 *    - Verified lead assignment and distribution
 *    - Lead status tracking and workflow management
 *    - Customer coordination and communication tools
 * 
 * 2. NUMBER POOL COORDINATION
 *    - Group-specific number pool management (G1, G2, G3)
 *    - Number assignment and reservation tracking
 *    - Status check and availability management
 * 
 * 3. WORKFLOW TRACKING
 *    - Real-time lead status updates and notifications
 *    - Pending coordinator actions and assignments
 *    - Follow-up and coordination task management
 * 
 * 4. PERFORMANCE MONITORING
 *    - Coordination metrics and efficiency tracking
 *    - Lead processing statistics and timelines
 *    - Strike system integration for number claims
 * 
 * 5. SEARCH AND FILTERING
 *    - Advanced lead search and filtering capabilities
 *    - Status-based filtering and sorting
 *    - Pagination for efficient data handling
 * 
 * USAGE:
 * This component is used by users with 'coordinator' role to streamline
 * coordination workflows and manage lead assignments effectively.
 * ===============================================================================
 */

import { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, getDoc, doc, updateDoc, orderBy, addDoc, onSnapshot, serverTimestamp, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { toast } from 'react-hot-toast';
import { getWhatsAppCredentials } from '../../utils/configService';
import { format, formatDistanceToNow, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import {
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  Calendar,
  Phone,
  Package,
  User2,
  MessageSquare,
  ArrowRight,
  Filter,
  Search,
  Eye,
  AlertTriangle,
  AlertCircle,
  CheckSquare,
  Hash,
  CheckCircle2,
  Users,
  UserCheck,
  X,
  Target,
  Smartphone,
  Tag,
  RefreshCw,
  CheckCircle as CheckCircleIcon,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { clsx } from 'clsx';
import type { Lead, User, CoordinatorType, Team } from '../../types';
import { motion } from 'framer-motion';
import { StruckNumbers, useStruckNumbersForCoordinator } from './StruckNumbers';
import { Dialog } from '@headlessui/react';

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

interface CoordinatorDashboardProps {
  user: User;
}

const PAGE_SIZES = [10, 20, 40, 80, 120] as const;

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: any }> = {
  verified: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    icon: CheckCircle,
  },
  activated_non_verified: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    icon: CheckCircle,
  },
  rejected: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    icon: XCircle,
  },
  pending_verification: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    icon: Clock,
  },
  pending_coordinator: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    icon: Clock,
  },
  follow_up: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    icon: Clock,
  },
  activated: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    icon: Zap,
  }
};

// Update StatusCheck interface
interface StatusCheck {
  id: string;
  numberId: string;
  number: string;
  requestedBy: string;
  requestedAt: Date;
  status?: 'pending' | 'available' | 'unavailable' | null;
  respondedAt?: Date;
  respondedBy?: string;
  expiresAt?: Date | null;
}

// Helper function to get coordinator group display name
const getCoordinatorGroupDisplay = (coordinatorType: CoordinatorType): string => {
  switch (coordinatorType) {
    case 'g1': return 'Group G1';
    case 'g2': return 'Group G2';
    case 'g3': return 'Group G3';
    case 'all': return 'All Groups (G1-G5)';
    default: return 'Unknown Group';
  }
};

// Helper function to check if a lead belongs to coordinator's scope
// First checks coordinator's assigned teams (team-based routing),
// then falls back to group-based coordinatorType if no coordinatorTeams configured.
const isLeadInCoordinatorScope = (
  lead: Lead,
  coordinatorType: CoordinatorType,
  coordinatorTeams?: string[]
): boolean => {
  // If coordinator has explicit team assignments, use ONLY those teams
  if (coordinatorTeams && coordinatorTeams.length > 0) {
    // Normalize team IDs for comparison (trim whitespace, handle null/undefined)
    const normalizedCoordinatorTeams = coordinatorTeams
      .map(tid => tid?.trim())
      .filter(Boolean) as string[];
    const normalizedLeadTeamId = lead.teamId?.trim();
    
    // If lead has a teamId, check if it matches any assigned team
    if (normalizedLeadTeamId) {
      const matches = normalizedCoordinatorTeams.some(teamId => 
        teamId === normalizedLeadTeamId
      );
      if (matches) {
      return true;
      }
      // If coordinator has team assignments and lead's teamId doesn't match, exclude it
      return false;
  }
    // If coordinator has team assignments but lead has no teamId, exclude it
    return false;
  }

  // Group-based routing by first number's group (primary), only when no coordinatorTeams configured
  if (!lead.plans || lead.plans.length === 0) return false;
  const firstGroup = lead.plans[0]?.group?.toUpperCase?.() || '';
  
  if (coordinatorType === 'all') return true;
  if (coordinatorType === 'g1') return firstGroup === 'G1';
  if (coordinatorType === 'g2') return firstGroup === 'G2';
  if (coordinatorType === 'g3') return firstGroup === 'G3';
  return false;
};

export function CoordinatorDashboard({ user }: CoordinatorDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredCoordinatorLeads, setFilteredCoordinatorLeads] = useState<Lead[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [groupTargets, setGroupTargets] = useState<Record<string, number>>({});
  const [groupActivations, setGroupActivations] = useState<Record<string, number>>({});
  const [groupBreakdown, setGroupBreakdown] = useState<Record<string, { newCount: number; mnp: number; p2p: number }>>({});
  const [metrics, setMetrics] = useState({
    totalLeads: 0,
    verified: 0,
    assigned: 0,
    activated: 0,
    activatedNonVerified: 0,
    followUp: 0,
    rejected: 0,
    later: 0,
    yesterday: 0
  });
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [actionType, setActionType] = useState<'assign' | 'activate' | 'followup' | 'later' | 'assign_verifier' | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [showNumberErrorModal, setShowNumberErrorModal] = useState(false);
  const [missingNumbers, setMissingNumbers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pageSize, setPageSize] = useState<typeof PAGE_SIZES[number]>(20);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    // Default to current month in YYYY-MM format
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [statusChecks, setStatusChecks] = useState<StatusCheck[]>([]);
  const [showStatusChecks, setShowStatusChecks] = useState(false);
  const [showStruckNumbers, setShowStruckNumbers] = useState(false);
  const { struckNumbers, loading: struckLoading } = useStruckNumbersForCoordinator();
  // Global verified lead search (regardless of group) for assign-to-cord
  const [assignSearchTerm, setAssignSearchTerm] = useState('');
  const [assignResults, setAssignResults] = useState<Lead[]>([]);
  const [assignSearching, setAssignSearching] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [leadToAssign, setLeadToAssign] = useState<Lead | null>(null);
  const [managerLocationUrl, setManagerLocationUrl] = useState('');
  const [managerNote, setManagerNote] = useState('');
  const [isManagerActionProcessing, setIsManagerActionProcessing] = useState(false);
  const [assignDebounce, setAssignDebounce] = useState<number | undefined>(undefined);
  const leadsTableRef = useRef<HTMLDivElement>(null);
  const [assignGroup, setAssignGroup] = useState<string>('');
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [calendarView, setCalendarView] = useState<'month' | 'year'>('month');
  const calendarPickerRef = useRef<HTMLDivElement>(null);
  
  // Initialize calendar year and month from selectedMonth
  const [calendarYear, setCalendarYear] = useState(() => {
    const [year] = selectedMonth.split('-');
    return parseInt(year);
  });
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const [, month] = selectedMonth.split('-');
    return parseInt(month) - 1;
  });
  
  // Update calendar year/month when selectedMonth changes
  useEffect(() => {
    const [year, month] = selectedMonth.split('-');
    setCalendarYear(parseInt(year));
    setCalendarMonth(parseInt(month) - 1);
  }, [selectedMonth]);
  
  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (calendarPickerRef.current && !calendarPickerRef.current.contains(event.target as Node)) {
        setShowCalendarPicker(false);
      }
    };
    
    if (showCalendarPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCalendarPicker]);

  // Get the current status from URL params
  const currentStatus = searchParams.get('status') || 'verified';

  // Sync statusFilter with currentStatus (for card clicks)
  useEffect(() => {
    if (currentStatus !== statusFilter) {
      setStatusFilter(currentStatus);
    }
  }, [currentStatus, statusFilter]);
  
  // Get coordinator type and team assignments from user
  const coordinatorType = user.coordinatorType || 'all';
  const coordinatorTeams = (user as any).coordinatorTeams as string[] | undefined;

  // Load group targets for selected/current month
  useEffect(() => {
    const loadTargets = async () => {
      try {
        // Use selectedMonth if available, otherwise current month
        const targetMonth = selectedMonth ? new Date(selectedMonth + '-01') : new Date();
        const monthId = format(targetMonth, 'yyyy-MM');
        const ref = doc(db, 'groupTargets', monthId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as any;
          setGroupTargets(data.groups || {});
        } else {
          setGroupTargets({});
        }
      } catch (error) {
        console.error('Failed to load group targets for coordinator:', error);
        setGroupTargets({});
      }
    };
    loadTargets();
  }, [selectedMonth]);

  const searchVerifiedLeadsForAssign = async () => {
    const term = assignSearchTerm.trim().toLowerCase();
    if (!term) {
      setAssignResults([]);
      setAssignError('');
      return;
    }
    setAssignError('');
    setAssignSearching(true);
    try {
      const verifiedQuery = query(
        collection(db, 'leads'),
        where('status', '==', 'verified'),
        orderBy('createdAt', 'desc'),
        limit(500)
      );
      const snapshot = await getDocs(verifiedQuery);
      const mapped = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
        createdAt: docSnap.data().createdAt?.toDate?.() || docSnap.data().createdAt,
        updatedAt: docSnap.data().updatedAt?.toDate?.() || docSnap.data().updatedAt
      })) as Lead[];
      const filtered = mapped.filter(l => {
        const num = (l.customerNumber || '').toLowerCase();
        const leadNum = (l.leadNumber || '').toLowerCase();
        const name = (l.customerName || '').toLowerCase();
        const planNumbers = (l.plans || []).some((p: any) => (p.number || '').toLowerCase().includes(term));
        return num.includes(term) || leadNum.includes(term) || name.includes(term) || planNumbers;
      });
      setAssignResults(filtered);
      if (filtered.length === 0) {
        setAssignError('No verified leads found for this search.');
      }
    } catch (error) {
      console.error('[CoordinatorDashboard] Error searching verified leads:', error);
      setAssignError('Failed to search verified leads');
      toast.error('Failed to search verified leads');
    } finally {
      setAssignSearching(false);
    }
  };

  // Auto search with debounce on input change
  useEffect(() => {
    if (assignDebounce) {
      clearTimeout(assignDebounce);
    }
    const term = assignSearchTerm.trim();
    if (!term) {
      setAssignResults([]);
      setAssignError('');
      return;
    }
    const handle = window.setTimeout(() => {
      searchVerifiedLeadsForAssign();
    }, 400);
    setAssignDebounce(handle);
    return () => clearTimeout(handle);
  }, [assignSearchTerm]);

  const handleAssignToCoordinator = (lead: Lead) => {
    setLeadToAssign(lead);
    setManagerLocationUrl(((lead as any).url as string) || '');
    setManagerNote('');
    setShowAssignDialog(true);
  };

  const confirmAssignToCoordinator = async () => {
    if (!leadToAssign) return;
    
    setIsManagerActionProcessing(true);
    try {
      const leadRef = doc(db, 'leads', leadToAssign.id);
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

      // Add manager note as a chat message if it exists
      if (managerNote && managerNote.trim() !== '') {
        try {
          await addDoc(collection(db, 'chatMessages'), {
            leadId: leadToAssign.id,
            userId: user?.id || '',
            userRole: user?.role || 'coordinator',
            message: managerNote.trim(),
            createdAt: new Date()
          });
          
          // Send WhatsApp notification for the chat message
          const { sendChatMessageWhatsAppNotification } = await import('../../utils/chatNotifications');
          await sendChatMessageWhatsAppNotification(leadToAssign, managerNote.trim(), user?.name || 'Unknown');
        } catch (chatError) {
          console.error('Error creating manager chat message:', chatError);
          // Don't fail manager action if chat message fails
        }
      }

      toast.success('Lead assigned to coordinator successfully');
      
      // Update local lists
      setAssignResults(prev => prev.map(l => l.id === leadToAssign.id ? { ...l, status: 'assigned_to_cord', managerAssigned: true } : l));
      setLeads(prev => prev.map(l => l.id === leadToAssign.id ? { ...l, status: 'assigned_to_cord', managerAssigned: true } : l));
      
      // Close dialog and reset
      setShowAssignDialog(false);
      setManagerNote('');
      setManagerLocationUrl(trimmedLocationUrl || '');
      setLeadToAssign(null);
    } catch (error) {
      console.error('[CoordinatorDashboard] Failed to assign lead to coordinator:', error);
      toast.error('Failed to assign lead');
    } finally {
      setIsManagerActionProcessing(false);
    }
  };

  // Load teams for debug/logging (teamId -> teamName)
  useEffect(() => {
    const loadTeams = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'teams'));
        const teamList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as any)
        })) as Team[];
        setTeams(teamList);
      } catch (error) {
        console.error('[CoordinatorDashboard] Error loading teams for debug:', error);
      }
    };

    loadTeams();
  }, []);

  // Debug: once teams are loaded, log mapping of team IDs to names and coordinator teams
  useEffect(() => {
    if (!coordinatorTeams || coordinatorTeams.length === 0) return;
    if (!teams || teams.length === 0) {
      return;
    }

    const teamNameFromId = (id?: string | null) => {
      if (!id) return 'Unknown';
      const team = teams.find(t => t.id === id);
      return team?.name || 'Unknown';
    };
  }, [coordinatorTeams, teams]);

  // Real-time listener for coordinator leads so unassigned leads update automatically
  useEffect(() => {
    if (!user?.id) return;

    setLoading(true);

    const leadsQuery = query(
      collection(db, 'leads'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      leadsQuery,
      (snapshot) => {
        try {
          const allLeadsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate(),
            updatedAt: doc.data().updatedAt?.toDate(),
            scheduledFor: doc.data().scheduledFor?.toDate
              ? doc.data().scheduledFor.toDate()
              : doc.data().scheduledFor
          })) as Lead[];

          // Filter leads based on coordinator's scope (teams first, then groups)
          const coordinatorLeads = allLeadsData.filter(lead =>
            isLeadInCoordinatorScope(lead, coordinatorType, coordinatorTeams)
          );

          // For non-All Groups coordinators, exclude pending_coordinator status leads
          let filteredCoordinatorLeads = (coordinatorType !== 'all' && coordinatorType !== undefined)
            ? coordinatorLeads.filter(lead => lead.status !== 'pending_coordinator')
            : coordinatorLeads;
          
          // Include verified leads that have been assigned by manager (these should appear as "unassigned")
          // These are leads with status='verified' and managerAssigned=true
          // EXCLUDE: follow_up, activated, rejected leads
          const managerAssignedVerifiedLeads = coordinatorLeads.filter(
            lead => lead.status === 'verified' && lead.managerAssigned === true
          );
          
          // Include leads with status='assigned_to_cord' (assigned by manager to coordinator)
          const assignedToCordLeads = coordinatorLeads.filter(
            lead => lead.status === 'assigned_to_cord'
          );
          
          // Debug: Log assigned_to_cord leads for ETS-10
          if (coordinatorTeams && coordinatorTeams.includes('1QcXTOSGX7AobfOknLXw')) {
            const ets10AssignedToCord = assignedToCordLeads.filter(
              lead => lead.teamId === '1QcXTOSGX7AobfOknLXw'
            );
          }
          
          // Include leads with scheduledFor matching today (marked "for later" by coordinator)
          // BUT exclude later leads with scheduledFor date today or in the future
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          const scheduledForTodayLeads = coordinatorLeads.filter(lead => {
            if (!lead.scheduledFor) return false;
            // Exclude later leads with scheduledFor date today or in the future
            if (lead.status === 'later') {
              const scheduledRaw: any = lead.scheduledFor;
              const scheduledDate =
                scheduledRaw && typeof scheduledRaw.toDate === 'function'
                  ? scheduledRaw.toDate()
                  : scheduledRaw instanceof Date
                    ? scheduledRaw
                    : new Date(scheduledRaw);
              scheduledDate.setHours(0, 0, 0, 0);
              // Exclude if scheduledFor is today or in the future
              if (scheduledDate.getTime() >= today.getTime()) {
                return false;
              }
            }
            const scheduledRaw: any = lead.scheduledFor;
            const scheduledDate =
              scheduledRaw && typeof scheduledRaw.toDate === 'function'
                ? scheduledRaw.toDate()
                : scheduledRaw instanceof Date
                  ? scheduledRaw
                  : new Date(scheduledRaw);
            scheduledDate.setHours(0, 0, 0, 0);
            return scheduledDate.getTime() === today.getTime();
          });
          
          // Add manager-assigned verified leads, assigned_to_cord leads, plus scheduled leads to filtered list if not already present
          // EXCLUDE: follow_up, activated, rejected leads
          [...managerAssignedVerifiedLeads, ...assignedToCordLeads, ...scheduledForTodayLeads].forEach(lead => {
            // Double-check: exclude follow_up, activated, rejected, and later leads with future dates
            if (lead.status === 'follow_up' || lead.status === 'activated' || lead.status === 'activated_non_verified' || lead.status === 'rejected') {
              return; // Skip these leads
            }
            
            // Exclude later leads with scheduledFor date today or in the future
            if (lead.status === 'later' && lead.scheduledFor) {
              const scheduledRaw: any = lead.scheduledFor;
              const scheduledDate =
                scheduledRaw && typeof scheduledRaw.toDate === 'function'
                  ? scheduledRaw.toDate()
                  : scheduledRaw instanceof Date
                    ? scheduledRaw
                    : new Date(scheduledRaw);
              scheduledDate.setHours(0, 0, 0, 0);
              if (scheduledDate.getTime() >= today.getTime()) {
                return; // Skip later leads with future dates
              }
            }
            
            if (!filteredCoordinatorLeads.find(l => l.id === lead.id)) {
              filteredCoordinatorLeads.push(lead);
            }
          });
          
          // Debug: Log final filteredCoordinatorLeads for ETS-10
          if (coordinatorTeams && coordinatorTeams.includes('1QcXTOSGX7AobfOknLXw')) {
            const ets10InFiltered = filteredCoordinatorLeads.filter(l => l.teamId === '1QcXTOSGX7AobfOknLXw');
            const ets10AssignedToCordInFiltered = ets10InFiltered.filter(l => l.status === 'assigned_to_cord');
          }

          // Get selected month's start and end dates
          const now = new Date();
          let monthStart: Date;
          let monthEnd: Date;
          
          if (selectedMonth) {
            const [year, month] = selectedMonth.split('-').map(Number);
            monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
            monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
          } else {
            // Fallback to current month if no month selected
            monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
          }
          
          const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
          const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);

          // For metrics calculation: filter by current/selected month for regular statuses
          let leadsForMetrics = filteredCoordinatorLeads.filter(lead => {
              const leadDate = lead.createdAt || lead.updatedAt;
              if (!leadDate) return false;
              const leadDateObj = leadDate instanceof Date ? leadDate : new Date(leadDate);
              return leadDateObj >= monthStart && leadDateObj <= monthEnd;
            });

          // Filter activated leads for selected month using activatedAt (fallback updatedAt)
          // Match admin dashboard logic: filter from all coordinator leads, not month-filtered leads
          const currentMonthActivatedLeads = filteredCoordinatorLeads.filter(lead => {
            if (lead.status !== 'activated' && lead.status !== 'activated_non_verified') return false;
            const activatedAtRaw: any = (lead as any).activatedAt || lead.updatedAt;
            if (!activatedAtRaw) return false;
            const activatedAt =
              typeof activatedAtRaw.toDate === 'function'
                ? activatedAtRaw.toDate()
                : activatedAtRaw instanceof Date
                  ? activatedAtRaw
                  : new Date(activatedAtRaw);
            return activatedAt >= monthStart && activatedAt <= monthEnd;
          });


          // Calculate total activations by counting the number of plans in each activated lead
          const totalActivations = currentMonthActivatedLeads.reduce((count, lead) => {
            return count + (lead.plans?.length || 0);
          }, 0);

          // Group activations for current month (with breakdown for G2 only)
          const groupCounts: Record<string, number> = {};
          const breakdownCounts: Record<string, { newCount: number; mnp: number; p2p: number }> = {};
          currentMonthActivatedLeads.forEach(lead => {
            // Get productType from lead, not from plan
            const productType = (lead as any).productType || '';
            
            (lead.plans || []).forEach((plan: any) => {
              const grp = (plan.group || '').toUpperCase().trim();
              if (!grp) return;
              
              // For Express Dial (G2), only count "New" productType towards the group target/achieved
              const shouldCountForGroup =
                grp === 'G2'
                  ? productType === 'New'
                  : true;

              if (shouldCountForGroup) {
              groupCounts[grp] = (groupCounts[grp] || 0) + 1;
              }

              // Only track breakdown for G2
              if (grp === 'G2') {
                const breakdown = breakdownCounts[grp] || { newCount: 0, mnp: 0, p2p: 0 };
                if (productType === 'MNP') {
                  breakdown.mnp += 1;
                } else if (productType === 'Prepaid to postpaid') {
                  breakdown.p2p += 1;
                } else {
                  breakdown.newCount += 1;
                }
                breakdownCounts[grp] = breakdown;
              }
            });
          });
          setGroupActivations(groupCounts);
          setGroupBreakdown(breakdownCounts);

          // Calculate metrics from coordinator's leads only
          // For "unassigned", count verified leads with managerAssigned: true, assigned_to_cord leads, plus later leads scheduled for today
          // EXCLUDE: follow_up, activated, rejected, assigned leads, and later leads with scheduledFor date in the future
          const todayDate = new Date();
          todayDate.setHours(0, 0, 0, 0);
          const managerAssignedUnassignedCount = filteredCoordinatorLeads.filter(
            l => {
              // Exclude follow_up, activated, rejected, and assigned leads
              if (l.status === 'follow_up' || l.status === 'activated' || l.status === 'rejected' || l.status === 'assigned') {
                return false;
              }
              
              // Handle later leads: only include if scheduledFor date is today
              if (l.status === 'later' && l.scheduledFor) {
                const scheduledRaw: any = l.scheduledFor;
                const scheduledDate =
                  scheduledRaw && typeof scheduledRaw.toDate === 'function'
                    ? scheduledRaw.toDate()
                    : scheduledRaw instanceof Date
                      ? scheduledRaw
                      : new Date(scheduledRaw);
                scheduledDate.setHours(0, 0, 0, 0);
                // Only include if scheduledFor is today, exclude if in the future
                return scheduledDate.getTime() === todayDate.getTime();
              }
              
              // Exclude later leads without scheduledFor or with scheduledFor not today
              if (l.status === 'later') {
                return false;
              }
              
              // Include verified leads with managerAssigned: true, assigned_to_cord leads
              return (l.status === 'verified' && l.managerAssigned === true) ||
                     (l.status === 'assigned_to_cord');
            }
          ).length;
          
          const yesterdayExcludedStatuses = ['pending_verification', 'activated', 'non_verified', 'follow_verification', 'rejected', 'verified', 'follow_up', 'later'];

          // If coordinator is scoped to a single group, show activated as that group's activations
          const scopedGroup =
            coordinatorType === 'g1' ? 'G1' :
            coordinatorType === 'g2' ? 'G2' :
            coordinatorType === 'g3' ? 'G3' : null;
          const activatedForScope = scopedGroup ? (groupCounts[scopedGroup] || 0) : totalActivations;

          // Calculate metrics: historical statuses from all data, regular statuses from month-filtered data
          const computedMetrics = {
            totalLeads: leadsForMetrics.length,
            verified: managerAssignedUnassignedCount, // Manager-assigned verified leads (calculated separately above)
            assigned: filteredCoordinatorLeads.filter(l => l.status === 'assigned').length, // Historical count
            activated: activatedForScope, // Group-scoped activations (month-filtered)
            activatedNonVerified: filteredCoordinatorLeads.filter(lead => {
              if (lead.status !== 'activated_non_verified') return false;
              const activatedAtRaw: any = (lead as any).activatedAt || lead.updatedAt;
              if (!activatedAtRaw) return false;
              const activatedAt =
                typeof activatedAtRaw.toDate === 'function'
                  ? activatedAtRaw.toDate()
                  : activatedAtRaw instanceof Date
                    ? activatedAtRaw
                    : new Date(activatedAtRaw);
              return activatedAt >= monthStart && activatedAt <= monthEnd;
            }).length, // Month-filtered by activation date
            followUp: filteredCoordinatorLeads.filter(l => l.status === 'follow_up' && !l.managerAssigned).length, // Historical count
            later: filteredCoordinatorLeads.filter(l => l.status === 'later').length, // Historical count
            rejected: leadsForMetrics.filter(l => l.status === 'rejected').length, // Month-filtered
            yesterday: filteredCoordinatorLeads.filter(l => {
              const ts = (l.updatedAt || l.createdAt);
              return ts &&
              ts >= yesterdayStart &&
              ts <= yesterdayEnd &&
              !yesterdayExcludedStatuses.includes(l.status)
            }).length
          };

          setMetrics(computedMetrics);

          // Then filter leads based on current status (including special 'yesterday')
          // For "verified" status, show manager-assigned verified leads (these are "unassigned" to coordinators)
          let nextLeads: Lead[] = filteredCoordinatorLeads;
          if (currentStatus !== 'all') {
            if (currentStatus === 'yesterday') {
              nextLeads = filteredCoordinatorLeads.filter(lead => {
                const ts = (lead.updatedAt || lead.createdAt);
                return ts &&
                  ts >= yesterdayStart &&
                  ts <= yesterdayEnd &&
                  !yesterdayExcludedStatuses.includes(lead.status);
              });
            } else if (currentStatus === 'verified') {
              // Show manager-assigned verified leads, assigned_to_cord leads, plus later leads scheduled for today (these appear in "Unassigned Leads" for coordinators)
              // EXCLUDE: follow_up, activated, rejected, assigned leads, and later leads with scheduledFor date in the future
              const todayDateForFilter = new Date();
              todayDateForFilter.setHours(0, 0, 0, 0);
              nextLeads = filteredCoordinatorLeads.filter(lead => {
                // Exclude follow_up, activated, rejected, and assigned leads
                if (lead.status === 'follow_up' || lead.status === 'activated' || lead.status === 'activated_non_verified' || lead.status === 'rejected' || lead.status === 'assigned') {
                  return false;
                }
                
                // Handle later leads: only include if scheduledFor date is today
                if (lead.status === 'later' && lead.scheduledFor) {
                  const scheduledRaw: any = lead.scheduledFor;
                  const scheduledDate =
                    scheduledRaw && typeof scheduledRaw.toDate === 'function'
                      ? scheduledRaw.toDate()
                      : scheduledRaw instanceof Date
                        ? scheduledRaw
                        : new Date(scheduledRaw);
                  scheduledDate.setHours(0, 0, 0, 0);
                  // Only include if scheduledFor is today, exclude if in the future
                  return scheduledDate.getTime() === todayDateForFilter.getTime();
                }
                
                // Exclude later leads without scheduledFor or with scheduledFor not today
                if (lead.status === 'later') {
                  return false;
                }
                
                // Include verified leads with managerAssigned: true, assigned_to_cord leads
                return (lead.status === 'verified' && lead.managerAssigned === true) ||
                       (lead.status === 'assigned_to_cord');
              });

              
              // Debug: Log what's being shown in verified tab
              if (coordinatorTeams && coordinatorTeams.includes('1QcXTOSGX7AobfOknLXw')) {
                const ets10InVerifiedTab = nextLeads.filter(l => l.teamId === '1QcXTOSGX7AobfOknLXw');
                const ets10AssignedToCordInTab = ets10InVerifiedTab.filter(l => l.status === 'assigned_to_cord');
              }
            } else if (currentStatus === 'activated') {
              // Show activated plus activated_non_verified for the selected month by activation date
              nextLeads = filteredCoordinatorLeads.filter(lead => {
                if (lead.status !== 'activated' && lead.status !== 'activated_non_verified') return false;
                const activatedAtRaw: any = (lead as any).activatedAt || lead.updatedAt;
                if (!activatedAtRaw) return false;
                const activatedAt =
                  typeof activatedAtRaw.toDate === 'function'
                    ? activatedAtRaw.toDate()
                    : activatedAtRaw instanceof Date
                      ? activatedAtRaw
                      : new Date(activatedAtRaw);
                return activatedAt >= monthStart && activatedAt <= monthEnd;
              });
            } else if (currentStatus === 'activated_non_verified') {
              // Show only activated_non_verified for the selected month by activation date
              nextLeads = filteredCoordinatorLeads.filter(lead => {
                if (lead.status !== 'activated_non_verified') return false;
                const activatedAtRaw: any = (lead as any).activatedAt || lead.updatedAt;
                if (!activatedAtRaw) return false;
                const activatedAt =
                  typeof activatedAtRaw.toDate === 'function'
                    ? activatedAtRaw.toDate()
                    : activatedAtRaw instanceof Date
                      ? activatedAtRaw
                      : new Date(activatedAtRaw);
                return activatedAt >= monthStart && activatedAt <= monthEnd;
              });
            } else {
              nextLeads = filteredCoordinatorLeads.filter(lead => lead.status === currentStatus);
            }
          }

          setFilteredCoordinatorLeads(filteredCoordinatorLeads);
          setLeads(nextLeads);
          setLoading(false);
        } catch (error) {
          console.error('Error processing coordinator data:', error);
          toast.error('Failed to load dashboard data');
          setLoading(false);
        }
      },
      (error: any) => {
        // Handle permission errors gracefully (e.g., during logout)
        if (error.code === 'permission-denied') {
          setLoading(false);
          return;
        }
        console.error('Error in coordinator leads listener:', error);
        toast.error('Failed to load dashboard data');
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [user?.id, coordinatorType, selectedMonth]);

  // Filter leads by status in memory (no server reload)
  useEffect(() => {
    if (!filteredCoordinatorLeads || filteredCoordinatorLeads.length === 0) return;

    // Get selected month's start and end dates
    const now = new Date();
    let monthStart: Date;
    let monthEnd: Date;

    if (selectedMonth) {
      const [year, month] = selectedMonth.split('-').map(Number);
      monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
      monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
    } else {
      // Fallback to current month if no month selected
      monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    let nextLeads: Lead[] = [];

    if (currentStatus === 'verified') {
      // Show ONLY: manager-assigned verified leads, assigned_to_cord leads, plus later leads scheduled for today
      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      nextLeads = filteredCoordinatorLeads.filter(lead => {
        // Include manager-assigned verified leads
        if (lead.status === 'verified' && lead.managerAssigned === true) {
          return true;
        }

        // Include assigned_to_cord leads
        if (lead.status === 'assigned_to_cord') {
          return true;
        }

        // Include later leads scheduled for today
        if (lead.status === 'later' && lead.scheduledFor) {
          const scheduledRaw: any = lead.scheduledFor;
          const scheduledDate =
            scheduledRaw && typeof scheduledRaw.toDate === 'function'
              ? scheduledRaw.toDate()
              : scheduledRaw instanceof Date
                ? scheduledRaw
                : new Date(scheduledRaw);
          if (scheduledDate < todayDate) {
            return false; // Past scheduled date
          }
          const tomorrow = new Date(todayDate);
          tomorrow.setDate(tomorrow.getDate() + 1);
          if (scheduledDate >= tomorrow) {
            return false; // Future scheduled date
          }
          return true; // Today scheduled date
        }

        // Exclude everything else
        return false;
      });

      // Debug: ETS-10 coordinator gets special logging
      if (coordinatorTeams && coordinatorTeams.includes('1QcXTOSGX7AobfOknLXw')) {
        const ets10InVerifiedTab = nextLeads.filter(l => l.teamId === '1QcXTOSGX7AobfOknLXw');
        const ets10AssignedToCordInTab = ets10InVerifiedTab.filter(l => l.status === 'assigned_to_cord');
      }
    } else if (currentStatus === 'activated') {
      // Show activated plus activated_non_verified for the selected month by activation date
      nextLeads = filteredCoordinatorLeads.filter(lead => {
        if (lead.status !== 'activated' && lead.status !== 'activated_non_verified') return false;
        const activatedAtRaw: any = (lead as any).activatedAt || lead.updatedAt;
        if (!activatedAtRaw) return false;
        const activatedAt =
          typeof activatedAtRaw.toDate === 'function'
            ? activatedAtRaw.toDate()
            : activatedAtRaw instanceof Date
              ? activatedAtRaw
              : new Date(activatedAtRaw);
        return activatedAt >= monthStart && activatedAt <= monthEnd;
      });
    } else if (currentStatus === 'activated_non_verified') {
      // Show only activated_non_verified for the selected month by activation date
      nextLeads = filteredCoordinatorLeads.filter(lead => {
        if (lead.status !== 'activated_non_verified') return false;
        const activatedAtRaw: any = (lead as any).activatedAt || lead.updatedAt;
        if (!activatedAtRaw) return false;
        const activatedAt =
          typeof activatedAtRaw.toDate === 'function'
            ? activatedAtRaw.toDate()
            : activatedAtRaw instanceof Date
              ? activatedAtRaw
              : new Date(activatedAtRaw);
        return activatedAt >= monthStart && activatedAt <= monthEnd;
      });
    } else {
      nextLeads = filteredCoordinatorLeads.filter(lead => lead.status === currentStatus);
    }

    setLeads(nextLeads);
  }, [currentStatus, filteredCoordinatorLeads, selectedMonth, coordinatorTeams]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, pageSize]);

  // Load status checks for coordinators
  useEffect(() => {
    if (!user?.id) return;

    const q = query(
      collection(db, 'statusChecks'),
      where('status', '==', 'pending'),
      orderBy('requestedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const checks = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          numberId: data.numberId,
          number: data.number,
          requestedBy: data.requestedBy,
          requestedAt: data.requestedAt?.toDate(),
          status: data.status,
          respondedAt: data.respondedAt?.toDate(),
          respondedBy: data.respondedBy,
          expiresAt: data.expiresAt?.toDate()
        };
      }) as StatusCheck[];
      setStatusChecks(checks);
    }, (error) => {
      // ✅ FIX: Handle permission errors gracefully during logout
      if (error.code === 'permission-denied') {
        // User logged out or lost permissions - cleanup silently
        return;
      }
      
      console.error('Error in CoordinatorDashboard listener:', error);
    });

    return () => {
      unsubscribe();
    };
  }, [user?.id]);

  // Filter leads based on search term and status
  // For coordinators, manager-assigned verified leads (status='verified' && managerAssigned=true) should show when filtering by 'verified'
  const filteredLeads = leads.filter(lead => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const matchesSearch =
      normalizedSearch === '' ||
      lead.customerName?.toLowerCase().includes(normalizedSearch) ||
      lead.customerNumber?.toLowerCase().includes(normalizedSearch) ||
      lead.leadNumber?.toLowerCase().includes(normalizedSearch) ||
      lead.etisalatLeadId?.toLowerCase().includes(normalizedSearch) ||
      lead.plans?.some(plan =>
        plan.number?.toLowerCase().includes(normalizedSearch)
      );
    
    let matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    
    // Handle manager-assigned verified and follow_up leads - they should show when statusFilter is 'verified' (Unassigned Leads)
    if (!matchesStatus && statusFilter === 'verified') {
      // Show manager-assigned verified and follow_up leads, and assigned_to_cord leads, and later leads scheduled for today in the "verified" filter (Unassigned Leads)
      const isManagerAssigned = (lead.status === 'verified' && lead.managerAssigned === true) ||
                      (lead.status === 'follow_up' && lead.managerAssigned === true) ||
                      (lead.status === 'assigned_to_cord');

      // Include later leads scheduled for today
      const isLaterToday = lead.status === 'later' && lead.scheduledFor && (() => {
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        const scheduledRaw: any = lead.scheduledFor;
        const scheduledDate =
          scheduledRaw && typeof scheduledRaw.toDate === 'function'
            ? scheduledRaw.toDate()
            : scheduledRaw instanceof Date
              ? scheduledRaw
              : new Date(scheduledRaw);
        scheduledDate.setHours(0, 0, 0, 0);
        return scheduledDate.getTime() === todayDate.getTime();
      })();

      matchesStatus = isManagerAssigned || isLaterToday;
    }
    
    if (!matchesStatus && statusFilter === 'yesterday') {
      const now = new Date();
      const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      const ts = (lead.updatedAt || lead.createdAt);
      matchesStatus = !!(ts && ts >= yesterdayStart && ts <= yesterdayEnd && lead.status !== 'pending_verification' && lead.status !== 'follow_up' && lead.status !== 'later');
    }

    // Filter by selected month (skip for historical statuses)
    const historicalStatuses = ['verified', 'assigned', 'follow_up', 'later', 'yesterday', 'activated'];
    const isHistoricalStatus = historicalStatuses.includes(statusFilter);

    if (selectedMonth && !isHistoricalStatus) {
      const [year, month] = selectedMonth.split('-').map(Number);
      const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
      const leadDate = lead.createdAt || lead.updatedAt;
      if (leadDate) {
        const leadDateObj = leadDate instanceof Date ? leadDate : new Date(leadDate);
        if (leadDateObj < monthStart || leadDateObj > monthEnd) {
          return false;
        }
      } else {
        return false; // Exclude leads without dates when filtering by month
      }
    }
    
    return matchesSearch && matchesStatus;
  });

  // Pagination calculations
  const totalPages = Math.ceil(filteredLeads.length / pageSize);
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const stats = [
    {
      name: 'Unassigned',
      value: metrics.verified,
      icon: CheckCircle,
      color: 'bg-green-500',
      textColor: 'text-green-600',
      countColor: 'text-green-600',
      status: 'verified'
    },
    {
      name: 'Assigned',
      value: metrics.assigned,
      icon: Clock,
      color: 'bg-blue-500',
      textColor: 'text-blue-600',
      countColor: 'text-blue-600',
      status: 'assigned'
    },
    {
      name: 'Activated',
      value: metrics.activated,
      icon: Zap,
      color: 'bg-purple-500',
      textColor: 'text-purple-600',
      countColor: 'text-purple-600',
      status: 'activated'
    },
    {
      name: 'Active NV',
      value: metrics.activatedNonVerified,
      icon: AlertCircle,
      color: 'bg-amber-500',
      textColor: 'text-amber-600',
      countColor: 'text-amber-600',
      status: 'activated_non_verified'
    },
    {
      name: 'Follow Up',
      value: metrics.followUp,
      icon: AlertTriangle,
      color: 'bg-orange-500',
      textColor: 'text-orange-600',
      countColor: 'text-orange-600',
      status: 'follow_up'
    },
    {
      name: 'Later',
      value: metrics.later,
      icon: Clock,
      color: 'bg-yellow-500',
      textColor: 'text-yellow-600',
      countColor: 'text-yellow-600',
      status: 'later'
    },
    {
      name: 'Rejected',
      value: metrics.rejected,
      icon: XCircle,
      color: 'bg-red-500',
      textColor: 'text-red-600',
      countColor: 'text-red-600',
      status: 'rejected'
    },
    {
      name: 'Yesterday',
      value: metrics.yesterday,
      icon: Calendar,
      color: 'bg-gray-500',
      textColor: 'text-gray-600',
      countColor: 'text-gray-600',
      status: 'yesterday'
    }
  ];


  async function handleLeadAction(lead: Lead, action: 'assign' | 'activate' | 'followup' | 'assign_verifier') {
    setSelectedLead(lead);
    setActionType(action);
    setActionNote('');
    setAssignGroup(lead?.plans?.[0]?.group || '');
    setShowActionDialog(true);
  }

  async function confirmAction() {
    if (!selectedLead || !actionType) return;

    try {
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
          return;
        }
      }
      
      const leadRef = doc(db, 'leads', selectedLead.id);

      let updates: any = {
        coordinatorId: user.id,
        coordinatorNotes: actionNote,
        updatedAt: new Date()
      };

      // If group was changed in the assign dialog, persist to plans
      if ((actionType === 'assign' || actionType === 'activate') && assignGroup) {
        updates.plans = (selectedLead.plans || []).map((p: any, idx: number) =>
          idx === 0 ? { ...p, group: assignGroup } : { ...p, group: assignGroup }
        );
      }

      if (actionType === 'assign_verifier') {
        // Find appropriate verifier based on lead's groups
        const leadGroups = [...new Set(selectedLead.plans?.map(plan => plan.group) || [])];
        let assignedVerifierId: string | null = null;

        if (leadGroups.length === 1) {
          // Single group - find specific verifier
          const targetGroup = leadGroups[0]?.toLowerCase(); // Normalize to lowercase
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

            assignedVerifierId = specificVerifier?.id || allGroupVerifier?.id || null;
          } catch (error) {
            console.error('Error finding verifier:', error);
          }
        }

        updates = {
          ...updates,
          status: 'pending_verification',
          ...(assignedVerifierId && { verifierId: assignedVerifierId })
        };
      } else {
        updates = {
          ...updates,
          status: actionType === 'assign' ? 'assigned' :
                  actionType === 'activate' ? 'activated' : 'follow_up'
        };
        
        // When marking as follow_up, reset managerAssigned to false so manager can see it in unassigned section
        if (actionType === 'followup') {
          updates.managerAssigned = false;
        }
      }

      // Update lead status
      await updateDoc(leadRef, updates);

      // Update all numbers in the lead's plans
      if (selectedLead.plans && selectedLead.plans.length > 0) {
        const updatePromises = selectedLead.plans.map((plan) => {
          const numberRef = doc(db, 'numberPool', plan.numberId);
          return updateDoc(numberRef, {
            status: updates.status,
            lastStatusChange: new Date(),
            leadId: selectedLead.id
          });
        });
        
        await Promise.all(updatePromises);
      }

      // Create notification for the agent
      if (selectedLead.agentId) {
        let statusMessage = '';
        if (updates.status === 'activated') {
          statusMessage = 'Lead Activated';
        } else if (updates.status === 'assigned') {
          statusMessage = 'Lead Assigned';
        } else if (updates.status === 'follow_up') {
          statusMessage = 'Lead Marked for Follow-up';
        } else if (updates.status === 'pending_verification') {
          statusMessage = 'Lead Assigned to Verifier';
        }

        const notificationRef = await addDoc(collection(db, 'notifications'), {
          userId: selectedLead.agentId,
          type: 'lead_update',
          title: 'Lead Status Update',
          message: `${statusMessage} by ${user.name}`,
          read: false,
          createdAt: new Date(),
          data: {
            leadId: selectedLead.id
          }
        });

        console.log('Created notification for agent:', {
          agentId: selectedLead.agentId,
          notificationId: notificationRef.id,
          status: statusMessage
        });
      }

      // Send WhatsApp notification to manager
      if (selectedLead.managerId) {
        try {
          const managerRef = doc(db, 'users', selectedLead.managerId);
          const managerDoc = await getDoc(managerRef);
          
          if (managerDoc.exists()) {
            const managerData = managerDoc.data();
            let managerPhoneNumbers: string[] = [];
            
            if (Array.isArray(managerData.phoneNumbers)) {
              managerPhoneNumbers = managerData.phoneNumbers;
            } else if (typeof managerData.phoneNumbers === 'string') {
              managerPhoneNumbers = [managerData.phoneNumbers];
            } else if (managerData.phoneNumber) {
              managerPhoneNumbers = [managerData.phoneNumber];
            }

            if (managerPhoneNumbers.length > 0) {
              // Get WhatsApp credentials from Firebase
              const whatsappCredentials = await getWhatsAppCredentials();
              const WHATSAPP_API_URL = whatsappCredentials.apiUrl;
              const WHATSAPP_ACCESS_TOKEN = whatsappCredentials.accessToken;

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
                                text: updates.status === 'activated' ? 'Activated' : 
                                      updates.status === 'assigned' ? 'Assigned' : 
                                      updates.status === 'follow_up' ? 'Follow Up Required' :
                                      updates.status === 'pending_verification' ? 'Assigned to Verifier' :
                                      'Updated'
                              },
                              {
                                type: "text",
                                text: user?.name || "N/A"
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
                  console.error('Error sending WhatsApp notification to manager:', error);
                }
              }
            } else {
              console.log('No manager phone numbers found. WhatsApp notification will not be sent.');
              console.log('Manager ID:', selectedLead.managerId);
            }
          } else {
            console.log('Manager document not found in database');
          }
        } catch (error) {
          console.error('Error fetching manager data for WhatsApp notification:', error);
        }
      }

      toast.success(
        actionType === 'assign' ? 'Lead assigned successfully' :
        actionType === 'activate' ? 'Lead activated successfully' :
        actionType === 'assign_verifier' ? 'Lead assigned to verifier successfully' :
        'Lead marked for follow-up'
      );

      setShowActionDialog(false);
    } catch (error) {
      console.error('Error updating lead:', error);
      toast.error('Failed to update lead');
    }
  }

  const handleViewLead = (lead: Lead) => {
    navigate(`/dashboard/leads/${lead.id}`);
  };

  const handleStatClick = (status: string) => {
    setSearchParams({ status });
    // Scroll to leads table after a short delay to allow state update
    setTimeout(() => {
      leadsTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // Update handleStatusResponse function
  const handleStatusResponse = async (check: StatusCheck, status: 'available' | 'unavailable') => {
    if (!user?.id) return;

    try {
      const checkRef = doc(db, 'statusChecks', check.id);
      const updateData: any = {
        status,
        respondedAt: serverTimestamp(),
        respondedBy: user.id
      };

      // If marking as available, 24 hrs expiration
      if (status === 'available') {
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        updateData.expiresAt = expiresAt;
      }

      await updateDoc(checkRef, updateData);

      // Send notification to the requesting agent
      await addDoc(collection(db, 'notifications'), {
        userId: check.requestedBy,
        type: 'status_check_response',
        title: 'Status Check Response',
        message: `Your status check for number ${check.number} has been marked as ${status}`,
        read: false,
        createdAt: serverTimestamp(),
        numberId: check.numberId
      });

      // Remove the check from the local state immediately
      setStatusChecks(prev => prev.filter(c => c.id !== check.id));

      toast.success('Status updated successfully');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  // Add StatusChecksSection component
  const StatusChecksSection = () => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mt-6 mb-12"
    >
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="px-8 py-6 bg-gradient-to-r from-blue-500 to-indigo-600">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-lg">
                <CheckSquare className="h-6 w-6 text-white" />
              </div>
            <div>
              <h3 className="text-xl font-bold text-white">Status Check Requests</h3>
              <p className="mt-1 text-blue-100 text-sm">Manage number status check requests</p>
            </div>
            </div>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowStatusChecks(false)}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5 text-white" />
            </motion.button>
          </div>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {statusChecks.map((check) => (
              <motion.div
                key={check.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center space-x-3">
                    <div className="h-10 w-10 flex-shrink-0 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
                      <Hash className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="text-base font-semibold text-gray-900">{check.number}</h4>
                      <p className="text-xs text-gray-500">
                        Requested {formatDistanceToNow(check.requestedAt)} ago
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleStatusResponse(check, 'available')}
                      className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-green-50 to-green-100 text-green-600 rounded-lg hover:from-green-100 hover:to-green-200 transition-all duration-200"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1.5" />
                      Available
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleStatusResponse(check, 'unavailable')}
                      className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-red-50 to-red-100 text-red-600 rounded-lg hover:from-red-100 hover:to-red-200 transition-all duration-200"
                    >
                      <XCircle className="h-4 w-4 mr-1.5" />
                      Unavailable
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            ))}
            {statusChecks.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No pending status check requests
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Action Dialog */}
      {showActionDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              {actionType === 'assign' ? 'Assign Lead' :
               actionType === 'activate' ? 'Activate Lead' :
               actionType === 'assign_verifier' ? 'Assign to Verifier' :
               'Mark for Follow-up'}
            </h3>
            <div className="mb-6">
              {/* Group selector for assignment */}
              {actionType === 'assign' && selectedLead && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Group</label>
                  <select
                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                    value={assignGroup}
                    onChange={(e) => {
                      const newGroup = e.target.value;
                      setAssignGroup(newGroup);
                      if (!selectedLead) return;
                      setSelectedLead({
                        ...selectedLead,
                        plans: (selectedLead.plans || []).map((p: any, idx: number) =>
                          idx === 0 ? { ...p, group: newGroup } : p
                        )
                      });
                    }}
                  >
                    <option value="">Select group</option>
                    <option value="G1">G1</option>
                    <option value="G2">G2</option>
                    <option value="G3">G3</option>
                  </select>
                  <p className="mt-1 text-xs text-gray-500">Changes only the lead's group field; no other actions.</p>
                </div>
              )}

              <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
              <textarea
                rows={4}
                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 resize-none"
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                placeholder="Add any notes about this action..."
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowActionDialog(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction}
                className={clsx(
                  "px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors",
                  actionType === 'assign' ? 'bg-indigo-600 hover:bg-indigo-700' :
                  actionType === 'activate' ? 'bg-green-600 hover:bg-green-700' :
                  actionType === 'assign_verifier' ? 'bg-purple-600 hover:bg-purple-700' :
                  'bg-orange-600 hover:bg-orange-700'
                )}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900">
              Welcome back, {user?.name}!
            </h1>
            <p className="mt-2 text-lg text-gray-600 hidden sm:block">
                Here's an overview of leads requiring coordination.
              </p>
            <p className="mt-1 text-sm text-gray-500 hidden sm:block">
              {coordinatorType === 'g1' && 'You are assigned to handle leads with G1 group numbers only.'}
              {coordinatorType === 'g2' && 'You are assigned to handle leads with G2 group numbers only.'}
              {coordinatorType === 'g3' && 'You are assigned to handle leads with G3 group numbers only.'}
              {coordinatorType === 'all' && 'You are assigned to handle leads from all groups (G1, G2, G3, G4, G5).'}
            </p>
          </div>
          <div className="flex items-center gap-1 sm:gap-3 flex-wrap sm:flex-nowrap">
            {coordinatorType === 'all' && (
              <>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowStatusChecks(!showStatusChecks)}
                  className="inline-flex items-center px-2 py-1 sm:px-3 sm:py-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 text-sm"
                >
                  <CheckSquare className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-1.5" />
                  <span className="hidden sm:inline text-sm sm:text-base font-medium">Status Checks</span>
                  {statusChecks.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 bg-white/25 rounded-full text-xs font-semibold">
                      {statusChecks.length}
                    </span>
                  )}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowStruckNumbers((prev) => !prev)}
                  className="inline-flex items-center px-2 py-1 sm:px-3 sm:py-1.5 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 text-sm"
                >
                  <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-1.5" />
                  <span className="hidden sm:inline text-sm sm:text-base font-medium">Struck Numbers</span>
                  <span className="ml-1.5 px-1.5 py-0.5 bg-white/25 rounded-full text-xs font-semibold">
                    {struckLoading ? '...' : struckNumbers.length}
                  </span>
                </motion.button>
              </>
            )}
            {/* Calendar Picker - Calendar Selector on same line */}
            <div className="relative flex items-center" ref={calendarPickerRef}>
              <button
                onClick={() => setShowCalendarPicker(!showCalendarPicker)}
                className="inline-flex items-center px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border border-gray-300 bg-white text-sm font-medium hover:bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <Calendar className="h-3 w-3 sm:h-4 sm:w-4 text-gray-400 mr-1 sm:mr-1.5" />
                <span className="hidden sm:inline text-sm sm:text-base">{format(new Date(parseInt(selectedMonth.split('-')[0]), parseInt(selectedMonth.split('-')[1]) - 1, 1), 'MMMM yyyy')}</span>
              </button>
              
              {/* Calendar Picker Dropdown */}
              {showCalendarPicker && (
                <div className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-4 z-50 min-w-[280px]">
                  {calendarView === 'month' ? (
                    <>
                      {/* Year/Month Navigation */}
                      <div className="flex items-center justify-between mb-4">
                        <button
                          onClick={() => {
                            if (calendarYear > 2020) {
                              setCalendarYear(calendarYear - 1);
                            }
                          }}
                          className="p-1 hover:bg-gray-100 rounded"
                          disabled={calendarYear <= 2020}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setCalendarView('year')}
                          className="px-3 py-1 font-semibold text-gray-900 hover:bg-gray-100 rounded"
                        >
                          {format(new Date(calendarYear, calendarMonth, 1), 'MMMM yyyy')}
                        </button>
                        <button
                          onClick={() => {
                            if (calendarYear < 2030) {
                              setCalendarYear(calendarYear + 1);
                            }
                          }}
                          className="p-1 hover:bg-gray-100 rounded"
                          disabled={calendarYear >= 2030}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
            </div>
                      
                      {/* Month Grid */}
                      <div className="grid grid-cols-3 gap-2">
                        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((month, index) => {
                          const monthValue = `${calendarYear}-${String(index + 1).padStart(2, '0')}`;
                          const isSelected = selectedMonth === monthValue;
                          const isCurrentMonth = calendarYear === new Date().getFullYear() && index === new Date().getMonth();
                          
                          return (
                            <button
                              key={index}
                              onClick={() => {
                                setSelectedMonth(monthValue);
                                setShowCalendarPicker(false);
                              }}
                              className={`p-2 text-sm rounded-lg transition-colors ${
                                isSelected
                                  ? 'bg-indigo-600 text-white font-semibold'
                                  : isCurrentMonth
                                  ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                  : 'text-gray-700 hover:bg-gray-100'
                              }`}
                            >
                              {month}
                            </button>
                          );
                        })}
          </div>
                    </>
                  ) : (
                    <>
                      {/* Year Navigation */}
                      <div className="flex items-center justify-between mb-4">
                        <button
                          onClick={() => setCalendarYear(calendarYear - 12)}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <span className="font-semibold text-gray-900">
                          {calendarYear - 5} - {calendarYear + 6}
                        </span>
                        <button
                          onClick={() => setCalendarYear(calendarYear + 12)}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
        </div>
                      
                      {/* Year Grid */}
                      <div className="grid grid-cols-4 gap-2">
                        {Array.from({ length: 12 }, (_, i) => {
                          const year = calendarYear - 5 + i;
                          const isSelected = selectedMonth.startsWith(`${year}-`);
                          const isCurrentYear = year === new Date().getFullYear();
                          
                          return (
                            <button
                              key={year}
                              onClick={() => {
                                setCalendarYear(year);
                                setCalendarView('month');
                              }}
                              className={`p-2 text-sm rounded-lg transition-colors ${
                                isSelected
                                  ? 'bg-indigo-600 text-white font-semibold'
                                  : isCurrentYear
                                  ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                  : 'text-gray-700 hover:bg-gray-100'
                              }`}
                            >
                              {year}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Group Targets for coordinators */}
       <div className="grid grid-cols-3 gap-3 mb-8">
        {(
          coordinatorType === 'all'
            ? ['G1', 'G2', 'G3']
            : [coordinatorType?.toString().toUpperCase()]
        ).map((grp) => {
          const target = groupTargets[grp] ?? 0;
          const achieved = groupActivations[grp] ?? 0;
          const remaining = Math.max(target - achieved, 0);
          const color =
            grp === 'G1' ? 'from-indigo-50 to-indigo-100 border-indigo-200 text-indigo-900' :
            grp === 'G2' ? 'from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-900' :
            grp === 'G3' ? 'from-amber-50 to-amber-100 border-amber-200 text-amber-900' :
            'from-slate-50 to-slate-100 border-slate-200 text-slate-900';
          return (
            <div key={grp} className={`rounded-xl shadow-md border p-3 ${
              grp === 'G1' ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200' :
              grp === 'G2' ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200' :
              'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 rounded-lg bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-sm">
                    <Target className={`h-3 w-3 sm:h-3.5 sm:w-3.5 lg:h-4 lg:w-4 ${
                      grp === 'G1' ? 'text-blue-700' :
                      grp === 'G2' ? 'text-green-700' : 'text-purple-700'
                    }`} />
                </div>
                  <span className="text-xs sm:text-sm lg:text-base font-bold text-gray-900">{grp} Group</span>
              </div>
                </div>
              {/* Phone layout: stacked */}
              <div className="space-y-1.5 sm:space-y-2 lg:hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-xs text-gray-500">Target</span>
                  <span className="text-xs sm:text-sm font-bold text-red-600">{target}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-xs text-gray-500">Achieved</span>
                  <span className="text-xs sm:text-sm font-bold text-emerald-600">{achieved}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-xs text-gray-500">Remaining</span>
                  <span className="text-xs sm:text-sm font-bold text-amber-600">{remaining}</span>
              </div>
              {grp === 'G2' && (
                 <div className="mt-3 pt-2 border-t border-gray-100 hidden sm:block">
                   <div className="flex items-center justify-center gap-2">
                  {(() => {
                    const breakdown = groupBreakdown[grp] || { newCount: 0, mnp: 0, p2p: 0 };
                    return (
                      <>
                           <span className="px-2 py-1 rounded-md bg-blue-50 text-blue-700 font-medium text-xs">
                          New: {breakdown.newCount}
                        </span>
                           <span className="px-2 py-1 rounded-md bg-green-50 text-green-700 font-medium text-xs">
                          MNP: {breakdown.mnp}
                        </span>
                           <span className="px-2 py-1 rounded-md bg-purple-50 text-purple-700 font-medium text-xs">
                          P2P: {breakdown.p2p}
                        </span>
                      </>
                    );
                  })()}
                  </div>
                </div>
              )}
              </div>

              {/* Desktop layout: labels row, values row */}
              <div className="hidden lg:block">
                <div className="grid grid-cols-3 gap-4 mb-3">
                  <span className="text-sm lg:text-base text-gray-500 text-center font-medium">Target</span>
                  <span className="text-sm lg:text-base text-gray-500 text-center font-medium">Achieved</span>
                  <span className="text-sm lg:text-base text-gray-500 text-center font-medium">Remaining</span>
                </div>
                <div className="grid grid-cols-3 gap-4 mb-3">
                  <span className="text-lg lg:text-xl font-bold text-red-600 text-center">{target}</span>
                  <span className="text-lg lg:text-xl font-bold text-emerald-600 text-center">{achieved}</span>
                  <span className="text-lg lg:text-xl font-bold text-amber-600 text-center">{remaining}</span>
                </div>
                {grp === 'G2' && (
                 <div className="pt-2 border-t border-gray-100">
                   <div className="flex items-center justify-center gap-2">
                     {(() => {
                       const breakdown = groupBreakdown[grp] || { newCount: 0, mnp: 0, p2p: 0 };
                       return (
                         <>
                           <span className="px-2 py-1 rounded-md bg-blue-50 text-blue-700 font-medium text-xs">
                             New: {breakdown.newCount}
                           </span>
                           <span className="px-2 py-1 rounded-md bg-green-50 text-green-700 font-medium text-xs">
                             MNP: {breakdown.mnp}
                           </span>
                           <span className="px-2 py-1 rounded-md bg-purple-50 text-purple-700 font-medium text-xs">
                             P2P: {breakdown.p2p}
                           </span>
                        </>
                      );
                    })()}
                  </div>
                 </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showStruckNumbers && coordinatorType === 'all' && (
        <div className="mt-8">
          <StruckNumbers 
            struckNumbers={struckNumbers} 
            loading={struckLoading}
            onClose={() => setShowStruckNumbers(false)}
          />
        </div>
      )}

      {/* Show StatusChecksSection only when showStatusChecks is true and coordinator is All Groups */}
      {showStatusChecks && coordinatorType === 'all' && <StatusChecksSection />}

      {/* Stats Grid */}
       <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-8">
        {stats.map((stat) => (
          <button
            key={stat.status}
            onClick={() => handleStatClick(stat.status)}
            className={`bg-white rounded-2xl shadow-lg p-3 sm:p-6 border border-gray-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer ${
              currentStatus === stat.status ? 'ring-2 ring-indigo-500' : ''
            }`}
          >
          <div className="flex items-center">
              <div className={`p-2 sm:p-3 rounded-xl ${stat.color}`}>
                <stat.icon className="h-4 w-4 sm:h-6 sm:w-6 text-white" />
            </div>
             <div className="ml-2 sm:ml-4">
                 <h3 className="text-xs sm:text-sm font-medium text-gray-500">{stat.name}</h3>
                 <p className={`text-lg sm:text-2xl font-bold ${stat.countColor}`}>{stat.value}</p>
        </div>
            </div>
          </button>
        ))}
      </div>

      {/* Global Verified Leads search & assign to coordinator */}
      {/* Compact Search Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search verified leads by customer number, lead number, or plan number..."
              value={assignSearchTerm}
              onChange={(e) => setAssignSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  searchVerifiedLeadsForAssign();
                }
              }}
              className="pl-9 pr-4 py-2 w-full text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            />
          </div>
          <button
            onClick={searchVerifiedLeadsForAssign}
            disabled={assignSearching || !assignSearchTerm.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {assignSearching ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Searching
              </span>
            ) : (
              'Search'
            )}
          </button>
        </div>
        {assignError && !assignSearching && (
          <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{assignError}</div>
        )}
      </div>

      {/* Search Results */}
      {assignResults.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="space-y-2">
            {assignResults.map(lead => {
              const primaryPlan: any = Array.isArray(lead.plans) && lead.plans.length > 0 ? lead.plans[0] : null;
              const number = primaryPlan?.number || 'N/A';
              const group = primaryPlan?.group || 'N/A';
              
              return (
                <div key={lead.id} className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/30 transition-all">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900 truncate">{lead.customerName || 'No name'}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        lead.status === 'verified' ? 'bg-green-100 text-green-700' :
                        lead.status === 'assigned_to_cord' ? 'bg-indigo-100 text-indigo-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {getStatusDisplayText(lead.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3 text-blue-500" />
                        <span className="font-medium text-blue-600">Customer number:</span>
                        <span className="text-gray-900">{lead.customerNumber || 'N/A'}</span>
                      </span>
                      <span className="text-gray-300">•</span>
                      <span className="flex items-center gap-1">
                        <Hash className="h-3 w-3 text-purple-500" />
                        <span className="font-medium text-purple-600">Lead:</span>
                        <span className="text-gray-900">{lead.leadNumber || lead.id}</span>
                      </span>
                      <span className="text-gray-300">•</span>
                      <span className="flex items-center gap-1">
                        <Smartphone className="h-3 w-3 text-green-500" />
                        <span className="font-medium text-green-600">Selected number:</span>
                        <span className="text-gray-900">{number}</span>
                      </span>
                      <span className="text-gray-300">•</span>
                      <span className="flex items-center gap-1">
                        <Tag className="h-3 w-3 text-orange-500" />
                        <span className="font-medium text-orange-600">Group:</span>
                        <span className="text-gray-900">{group}</span>
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAssignToCoordinator(lead)}
                    disabled={lead.status === 'assigned_to_cord' || isManagerActionProcessing}
                    className="px-4 py-2 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap"
                  >
                    {lead.status === 'assigned_to_cord' ? 'Assigned' : 'Assign'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!assignSearching && assignResults.length === 0 && assignSearchTerm.trim().length > 0 && !assignError && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="text-sm text-gray-500 text-center py-4">No verified leads found.</div>
        </div>
      )}

      {/* Assignment Dialog - Same as Manager/Agent */}
      {showAssignDialog && leadToAssign && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
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
                    setShowAssignDialog(false);
                    setManagerNote('');
                    setManagerLocationUrl(((leadToAssign as any).url as string) || '');
                  }}
                  disabled={isManagerActionProcessing}
                  className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAssignToCoordinator}
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

      {/* Filters */}
      <div className="mb-8 grid grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-2 sm:pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Search leads..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 pr-3 py-1.5 sm:pl-10 sm:pr-4 sm:py-2 w-full rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
          />
        </div>

        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-2 sm:pl-3 flex items-center pointer-events-none">
            <Filter className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              const newStatus = e.target.value;
              setStatusFilter(newStatus);
              setSearchParams({ status: newStatus });
            }}
            className="pl-8 pr-3 py-1.5 sm:pl-10 sm:pr-4 sm:py-2 w-full rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
          >
            <option value="all">All Status</option>
            <option value="verified">Verified</option>
            <option value="assigned">Assigned</option>
            <option value="activated">Activated</option>
            <option value="follow_up">Follow Up</option>
            {coordinatorType === 'all' && (
              <option value="pending_coordinator">Pending Coordinator</option>
            )}
          </select>
        </div>

        <div className="relative">
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value) as typeof PAGE_SIZES[number])}
            className="pl-3 pr-3 py-1.5 sm:pl-4 sm:pr-4 sm:py-2 w-full rounded-lg border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
          >
            {PAGE_SIZES.map(size => (
              <option key={size} value={size}>{size} per page</option>
            ))}
          </select>
        </div>
      </div>

      {/* Leads Table */}
      <div ref={leadsTableRef} className="bg-white shadow-xl rounded-2xl overflow-hidden border border-gray-100">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Group
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Plan
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Updated
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {paginatedLeads.map((lead) => {
                const StatusIcon = STATUS_STYLES[lead.status]?.icon || Clock;
                return (
                  <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center">
                          <User2 className="h-5 w-5 text-indigo-600" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {lead.customerName}
                          </div>
                          <div className="text-sm text-gray-500 flex items-center">
                            <Phone className="h-3.5 w-3.5 mr-1" />
                            {lead.customerNumber}
                          </div>
                          {lead.leadNumber && (
                            <div className="mt-1">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-100 text-indigo-700 border border-indigo-200">
                                {lead.leadNumber}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col space-y-2">
                        {lead.plans?.map((plan, index) => (
                          <div
                            key={index}
                            className="flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 px-3 py-1.5 rounded-lg shadow-sm"
                          >
                            <div className="flex items-center">
                            <Phone className="h-4 w-4 mr-2 text-indigo-500" />
                            <span className="text-sm font-medium text-gray-900">{plan.number}</span>
                              <span
                                className={clsx(
                              "ml-2 px-2 py-0.5 text-xs rounded-full",
                                  plan.category === 'Gold'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : plan.category === 'Platinum'
                                    ? 'bg-purple-100 text-purple-800'
                                    : 'bg-gray-100 text-gray-800'
                                )}
                              >
                              {plan.category}
                            </span>
                            </div>
                            {lead.etisalatLeadId && (
                              <span className="mt-0.5 text-[11px] font-medium text-gray-500">
                                Etisalat ID: {lead.etisalatLeadId}
                              </span>
                            )}
                          </div>
                        ))}
                        {!lead.plans?.length && (
                          <div className="text-sm text-gray-500">No number selected</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col space-y-2">
                        {lead.plans?.map((plan, index) => (
                          <div key={index} className="flex items-center">
                            <span className={clsx(
                              "px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full",
                              plan.group === 'G1' ? 'bg-blue-100 text-blue-800' :
                              plan.group === 'G2' ? 'bg-green-100 text-green-800' :
                              plan.group === 'G3' ? 'bg-purple-100 text-purple-800' :
                              plan.group === 'G4' ? 'bg-yellow-100 text-yellow-800' :
                              plan.group === 'G5' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            )}>
                              {plan.group || 'No Group'}
                            </span>
                          </div>
                        ))}
                        {!lead.plans?.length && (
                          <div className="text-sm text-gray-500">No group assigned</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col space-y-2">
                        {lead.plans?.map((plan, index) => (
                          <div key={index} className="flex items-center">
                            <Package className="h-4 w-4 mr-2 text-indigo-500" />
                            <span className={clsx(
                              "px-2 py-0.5 text-xs rounded-full",
                              plan.plan === 'Premium' ? 'bg-purple-100 text-purple-800' :
                              plan.plan === 'VIP' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            )}>
                              {plan.plan}
                            </span>
                          </div>
                        ))}
                        {!lead.plans?.length && (
                          <div className="text-sm text-gray-500">No plan selected</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={clsx(
                        "px-3 py-1 rounded-full text-xs font-medium inline-flex items-center",
                        STATUS_STYLES[lead.status]?.bg || 'bg-gray-100',
                        STATUS_STYLES[lead.status]?.text || 'text-gray-800'
                      )}>
                        <StatusIcon className="h-3.5 w-3.5 mr-1.5" />
                        {getStatusDisplayText(lead.status)}
                      </span>
                      {lead.status === 'later' && lead.scheduledFor && (
                        <div className="mt-1 text-xs text-gray-500">
                          {format(lead.scheduledFor, 'MMM d, yyyy p')}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {format(lead.updatedAt, 'MMM d, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        {/* View Details Link */}
                        <Link
                          to={`/dashboard/leads/${lead.id}`}
                          className="inline-flex items-center text-indigo-600 hover:text-indigo-900 transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                          <span className="ml-1">View details</span>
                        </Link>

                        {/* Action Buttons */}
                        {lead.status === 'pending_coordinator' && (
                          <>
                            <button
                              onClick={() => handleLeadAction(lead, 'assign_verifier')}
                              className="inline-flex items-center px-2.5 py-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors text-xs font-medium"
                              title="Assign to Verifier"
                            >
                              <User2 className="h-3.5 w-3.5 mr-1" />
                              Assign Verifier
                            </button>
                            <button
                              onClick={() => handleLeadAction(lead, 'assign')}
                              className="inline-flex items-center px-2.5 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors text-xs font-medium"
                              title="Assign Lead"
                            >
                              <UserCheck className="h-3.5 w-3.5 mr-1" />
                              Assign
                            </button>
                          </>
                        )}

                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredLeads.length)} of {filteredLeads.length} leads
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-lg bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-lg bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
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
    </div>
  );
}
