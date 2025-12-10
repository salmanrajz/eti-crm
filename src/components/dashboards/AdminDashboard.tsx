/**
 * ===============================================================================
 * ADMIN DASHBOARD COMPONENT - SYSTEM ADMINISTRATION INTERFACE
 * ===============================================================================
 * 
 * This component provides the main administrative dashboard for system administrators.
 * It displays comprehensive system metrics, team performance data, lead statistics,
 * and provides access to administrative tools and settings.
 * 
 * FEATURES:
 * 
 * 1. SYSTEM OVERVIEW METRICS
 *    - Total users, teams, and leads across the system
 *    - Monthly and all-time activated leads tracking
 *    - Real-time performance indicators and charts
 * 
 * 2. TEAM PERFORMANCE MANAGEMENT
 *    - Detailed team metrics and agent performance breakdowns
 *    - Target achievement tracking and progress visualization
 *    - Team comparison and ranking systems
 * 
 * 3. ADMINISTRATIVE TOOLS
 *    - Plan management and configuration
 *    - DNC (Do Not Call) list management
 *    - Trusted devices administration
 *    - WhatsApp settings configuration
 * 
 * 4. REAL-TIME MONITORING
 *    - Live updates for critical system metrics
 *    - Performance charts and trend analysis
 *    - Recent activity feeds and notifications
 * 
 * 5. DATA MANAGEMENT
 *    - Advanced caching with localStorage persistence
 *    - Optimized Firestore queries with pagination
 *    - Performance monitoring and error handling
 * 
 * USAGE:
 * This component is restricted to users with 'admin' role and provides
 * comprehensive system oversight and management capabilities.
 * ===============================================================================
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { collection, query, getDocs, where, orderBy, doc, getDoc, updateDoc, addDoc, onSnapshot, serverTimestamp, deleteDoc, limit, writeBatch, setDoc, deleteField } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../lib/firebase';
import { User, Team, Lead, NumberPool } from '../../types';
import { AdminManagerPhoneNumbers } from '../settings/AdminManagerPhoneNumbers';
import { PlanManagement } from '../admin/PlanManagement';
import { DNCManagement } from '../admin/DNCManagement';
import { TrustedDevicesAdmin } from '../admin/TrustedDevicesAdmin';
import { WhatsAppSettings } from '../admin/WhatsAppSettings';
import { BulkDNCImport } from '../admin/BulkDNCImport';
import { BulkDeleteNumbers } from '../admin/BulkDeleteNumbers';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { format, subMonths, startOfMonth, endOfMonth, formatDistanceToNow } from 'date-fns';
import { 
  Users, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Zap, 
  Calendar, 
  Building2, 
  ClipboardList,
  ArrowLeft,
  Target,
  CheckCircle2,
  BarChart3,
  TrendingUp,
  Shield,
  Phone,
  Package,
  User2,
  MessageSquare,
  ArrowRight,
  Filter,
  Smartphone,
  Search,
  Eye,
  AlertTriangle,
  CheckSquare,
  Hash,
  Activity,
  Timer,
  Bell,
  ChevronRight,
  SortAsc,
  SortDesc,
  RefreshCw,
  AlertOctagon,
  Unlock,
  Lock,
  UserCheck,
  Square,
  CheckSquare2,
  X,
  Database,
  Trash2,
  Sparkles,
  RefreshCw as RefreshCwIcon
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Line, Bar } from 'react-chartjs-2';
import { useAuthStore } from '../../store/authStore';
import { motion } from 'framer-motion';
import PayrollButton from '../PayrollButton';
import AttendanceTable from '../AttendanceTable';

// ===============================================================================
// INTERFACE DEFINITIONS
// ===============================================================================

/**
 * Interface for open number requests in the system
 * Represents requests from agents to access specific numbers
 */
interface OpenRequest {
  id: string;
  numberId: string;
  number: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: Date;
  status: 'pending' | 'approved' | 'rejected';
  strikes: number;
  numberStatus: string;
}

/**
 * Props interface for the AdminDashboard component
 */
interface AdminDashboardProps {
  user: User; // Current authenticated admin user
}

/**
 * Interface for team performance metrics and statistics
 * Contains aggregated data for team performance analysis
 */
interface TeamMetrics {
  teamId: string;
  teamName: string;
  managerName: string;
  totalLeads: number;
  pendingVerification: number;
  verified: number;
  rejected: number;
  activated: number;
  pendingAssignment: number;
  assigned: number;
  teamTarget?: number; // Team target set by admin (optional, falls back to sum of agent targets)
  agents: {
    id: string;
    name: string;
    role: string;
    totalLeads: number;
    verified: number;
    activated: number;
    target: number;
    achievement: number;
  }[];
}

/**
 * Interface for agent performance statistics by month
 * Used for performance tracking and trend analysis
 */
interface AgentPerformanceData {
  month: string;
  totalLeads: number;
  activated: number;
  target: number;
  achievement: number;
}

// ===============================================================================
// CACHE CONFIGURATION AND PERFORMANCE SETTINGS
// ===============================================================================

/**
 * Cache configuration constants for optimal performance
 * Extended cache duration with real-time update intervals for balance
 */
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes cache (extended)
const REALTIME_UPDATE_INTERVAL = 2 * 60 * 1000; // 2 minutes for realtime updates

/**
 * Cache key constants for different data types
 * Versioned to handle cache schema changes gracefully
 */
const ADMIN_CACHE_KEY = 'admin_dashboard_v4';
const ADMIN_LEADS_CACHE_KEY = 'admin_leads_v4';
const ADMIN_TEAMS_CACHE_KEY = 'admin_teams_v4';
const ADMIN_TEAM_METRICS_CACHE_KEY = 'admin_team_metrics_v4';
const ADMIN_METRICS_CACHE_KEY = 'admin_metrics_v4';
const CACHE_VERSION = 'v4'; // Updated version for new cache strategy

/**
 * Interface for cached data structure
 * Includes metadata for expiration and version control
 */
interface CacheData {
  data: any;
  timestamp: number;
  expiresAt: number;
  version: string;
}

// ✅ PERFORMANCE: Smart cache utilities
const getCachedData = (key: string): any | null => {
  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;
    
    const cacheData: CacheData = JSON.parse(cached);
    
    // Check expiration
    if (Date.now() > cacheData.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    
    // Check version compatibility
    if (cacheData.version !== CACHE_VERSION) {
      localStorage.removeItem(key);
      return null;
    }
    
    return cacheData.data;
  } catch (error) {
    localStorage.removeItem(key);
    return null;
  }
};

const setCachedData = (key: string, data: any): void => {
  try {
    const cacheData: CacheData = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + CACHE_DURATION,
      version: CACHE_VERSION
    };
    localStorage.setItem(key, JSON.stringify(cacheData));
  } catch (error) {
    // Cache failed silently
  }
};

// ✅ PERFORMANCE: Clear all admin cache
const clearAdminCache = (): void => {
  [ADMIN_CACHE_KEY, ADMIN_LEADS_CACHE_KEY, ADMIN_TEAMS_CACHE_KEY, ADMIN_METRICS_CACHE_KEY].forEach(key => {
    localStorage.removeItem(key);
  });
};

export function AdminDashboard({ user }: AdminDashboardProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Glassmorphism helper - returns different gradient styles for specific cards
  const getGlassmorphismClass = (cardName: string) => {
    const glassmorph = {
      'Number Logs': 'bg-gradient-to-br from-cyan-400/20 via-blue-400/20 to-purple-400/20 backdrop-blur-sm border-2 border-cyan-200/50',
      'Reports': 'bg-gradient-to-br from-pink-400/20 via-rose-400/20 to-red-400/20 backdrop-blur-sm border-2 border-pink-200/50',
      'Number Visibility': 'bg-gradient-to-br from-purple-400/20 via-indigo-400/20 to-blue-400/20 backdrop-blur-sm border-2 border-purple-200/50',
      'Manager WhatsApp': 'bg-gradient-to-br from-green-400/20 via-emerald-400/20 to-teal-400/20 backdrop-blur-sm border-2 border-green-200/50',
      'Plan Management': 'bg-gradient-to-br from-amber-400/20 via-orange-400/20 to-red-400/20 backdrop-blur-sm border-2 border-amber-200/50',
      'DNC Management': 'bg-gradient-to-br from-red-400/20 via-rose-400/20 to-pink-400/20 backdrop-blur-sm border-2 border-red-200/50',
      'Bulk DNC Import': 'bg-gradient-to-br from-blue-400/20 via-cyan-400/20 to-sky-400/20 backdrop-blur-sm border-2 border-blue-200/50',
      'Trusted Devices': 'bg-gradient-to-br from-slate-400/20 via-gray-400/20 to-zinc-400/20 backdrop-blur-sm border-2 border-slate-200/50',
      'WhatsApp Settings': 'bg-gradient-to-br from-lime-400/20 via-green-400/20 to-emerald-400/20 backdrop-blur-sm border-2 border-lime-200/50',
    };
    return glassmorph[cardName as keyof typeof glassmorph] || '';
  };
  
  const [metrics, setMetrics] = useState({
    totalLeads: 0,
    pendingVerification: 0,
    verified: 0,
    rejected: 0,
    activated: 0, // Current month activated
    totalActivated: 0, // All-time activated
    pendingAssignment: 0,
    assigned: 0
  });
  const [teamMetrics, setTeamMetrics] = useState<TeamMetrics[]>([]);
  const [teamLeads, setTeamLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<TeamMetrics | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<{
    id: string;
    name: string;
    teamName: string;
    performanceData: any[];
  } | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [dateRange, setDateRange] = useState({
    start: subMonths(new Date(), 5),
    end: new Date()
  });
  const [selectedAgentDetails, setSelectedAgentDetails] = useState<{
    agent: TeamMetrics['agents'][0];
    teamName: string;
    performanceData: AgentPerformanceData[];
  } | null>(null);
  const [isLoadingAgentDetails, setIsLoadingAgentDetails] = useState(false);
  const [openRequests, setOpenRequests] = useState<OpenRequest[]>([]);
  const [openRequestsLoading, setOpenRequestsLoading] = useState(true);
  const [openRequestsModal, setOpenRequestsModal] = useState(false);
  const [liveStrikes, setLiveStrikes] = useState<{ [numberId: string]: number }>({});
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [attendanceMonth, setAttendanceMonth] = useState(new Date());
  const [numberVisibilityOpen, setNumberVisibilityOpen] = useState(false);
  const [hiddenNumbers, setHiddenNumbers] = useState<NumberPool[]>([]);
  const [hiddenNumbersLoading, setHiddenNumbersLoading] = useState(false);
  const [selectedNumbers, setSelectedNumbers] = useState<Set<string>>(new Set());
  const [codeFilter, setCodeFilter] = useState('');
  const [showCodeFilter, setShowCodeFilter] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [dncManagementOpen, setDncManagementOpen] = useState(false);
  const [trustedDevicesModalOpen, setTrustedDevicesModalOpen] = useState(false);
  const [managerPhoneModalOpen, setManagerPhoneModalOpen] = useState(false);
  const [planManagementModalOpen, setPlanManagementModalOpen] = useState(false);
  const [whatsappSettingsModalOpen, setWhatsappSettingsModalOpen] = useState(false);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  // Broadcast poster states
  const [posterTitle, setPosterTitle] = useState('');
  const [posterMessage, setPosterMessage] = useState('');
  const [isSendingPoster, setIsSendingPoster] = useState(false);
  const [showPosterPreview, setShowPosterPreview] = useState(false);
  const [posterModalOpen, setPosterModalOpen] = useState(false);
  // Group targets and activations (dynamic groups like G1..G5 and custom)
  const [groupTargets, setGroupTargets] = useState<{ groups: Record<string, number>; visibleToCoordinators: boolean }>({ groups: { G1: 0, G2: 0, G3: 0 }, visibleToCoordinators: false });
  const [groupActivations, setGroupActivations] = useState<Record<string, number>>({});
  const [savingGroupTargets, setSavingGroupTargets] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupAlias, setNewGroupAlias] = useState('');
  const [showAliasInput, setShowAliasInput] = useState(false);
  const [editingGroups, setEditingGroups] = useState(false);
  const [groupAliases, setGroupAliases] = useState<Record<string, string>>({});
  const [initializingStats, setInitializingStats] = useState(false);
  const [initStatsResult, setInitStatsResult] = useState<string | null>(null);
  // Team target editing state
  const [editingTeamTarget, setEditingTeamTarget] = useState<string | null>(null);
  const [teamTargetValue, setTeamTargetValue] = useState<number>(0);
  const [savingTeamTarget, setSavingTeamTarget] = useState(false);
  const navigate = useNavigate();

  // ✅ PERFORMANCE: Performance optimization refs
  const isMountedRef = useRef(true);
  const lastLoadTimeRef = useRef<number>(0);
  const lastRealtimeUpdateRef = useRef<number>(0);
  
  // ✅ REALTIME: Real-time update state
  const [realtimeEnabled] = useState(true);
  const unsubscribeRefs = useRef<(() => void)[]>([]);
  const loadingStartTime = useRef<number>(0);

  useEffect(() => {
    loadAdminData();
    loadOpenRequests();
    loadGroupTargetsForMonth(selectedMonth);
    loadGroupAliases();
  }, [user]);

  // Load existing broadcast poster for editing convenience
  useEffect(() => {
    const loadPoster = async () => {
      try {
        const snap = await getDoc(doc(db, 'config', 'broadcastPoster'));
        if (snap.exists()) {
          const data = snap.data();
          setPosterTitle(data?.title || '');
          setPosterMessage(data?.message || '');
        }
      } catch (error) {
        console.error('Failed to load broadcast poster', error);
      }
    };
    loadPoster();
  }, []);

  // Load numbers that are hidden from freelancers
  const loadHiddenNumbers = async () => {
    setHiddenNumbersLoading(true);
    try {
      const hiddenQuery = query(
        collection(db, 'numberPool'),
        where('visibleToFreelancers', '==', false),
        orderBy('lastStatusChange', 'desc'),
        limit(100)
      );
      const snapshot = await getDocs(hiddenQuery);
      const numbers = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        lastStatusChange: doc.data().lastStatusChange?.toDate()
      })) as NumberPool[];
      setHiddenNumbers(numbers);
    } catch (error) {
      toast.error('Failed to load hidden numbers');
    } finally {
      setHiddenNumbersLoading(false);
    }
  };

  // Toggle number visibility for freelancers
  const toggleNumberVisibility = async (numberId: string, makeVisible: boolean) => {
    try {
      const numberRef = doc(db, 'numberPool', numberId);
      await updateDoc(numberRef, {
        visibleToFreelancers: makeVisible,
        lastStatusChange: serverTimestamp()
      });
      
      toast.success(`Number ${makeVisible ? 'made visible to' : 'hidden from'} freelancers`);
      
      // Reload hidden numbers list
      await loadHiddenNumbers();
    } catch (error) {
      toast.error('Failed to update number visibility');
    }
  };

  const handleSendBroadcastPoster = useCallback(async () => {
    if (!posterTitle.trim() || !posterMessage.trim()) {
      toast.error('Please add both title and message');
      return;
    }
    setIsSendingPoster(true);
    try {
      const posterRef = doc(db, 'config', 'broadcastPoster');
      await setDoc(posterRef, {
        posterId: `${Date.now()}`,
        title: posterTitle.trim(),
        message: posterMessage.trim(),
        createdAt: serverTimestamp(),
        createdBy: user?.id || 'admin',
        createdByName: user?.name || user?.email || 'Admin'
      });
      toast.success('Broadcast poster sent to all users');
    } catch (error) {
      console.error('Failed to send broadcast poster', error);
      toast.error('Failed to send poster');
    } finally {
      setIsSendingPoster(false);
    }
  }, [posterTitle, posterMessage, user]);

  // Make all hidden numbers visible (batched)
  const makeAllHiddenVisible = async () => {
    try {
      setHiddenNumbersLoading(true);
      // Fetch all docs where visibleToFreelancers == false (process in pages of 200)
      let lastBatchCount = 0;
      do {
        const qHidden = query(
          collection(db, 'numberPool'),
          where('visibleToFreelancers', '==', false),
          orderBy('lastStatusChange', 'desc'),
          limit(200)
        );
        const snap = await getDocs(qHidden);
        lastBatchCount = snap.size;
        if (snap.empty) break;
        const batch = writeBatch(db);
        snap.docs.forEach(d => {
          batch.update(doc(db, 'numberPool', d.id), {
            visibleToFreelancers: true,
            lastStatusChange: serverTimestamp()
          });
        });
        await batch.commit();
      } while (lastBatchCount === 200);

      toast.success('All hidden numbers are now visible to freelancers');
      await loadHiddenNumbers();
    } catch (error) {
      toast.error('Failed to make all hidden numbers visible');
    } finally {
      setHiddenNumbersLoading(false);
    }
  };

  // Handle individual number selection
  const toggleNumberSelection = (numberId: string) => {
    setSelectedNumbers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(numberId)) {
        newSet.delete(numberId);
      } else {
        newSet.add(numberId);
      }
      return newSet;
    });
  };

  // Select all visible numbers
  const selectAllNumbers = () => {
    setSelectedNumbers(new Set(filteredNumbers.map(n => n.id)));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedNumbers(new Set());
  };

  // Select numbers by code pattern
  const selectByCode = (pattern: string) => {
    const matchingNumbers = filteredNumbers.filter(n => 
      n.code && n.code.toLowerCase().includes(pattern.toLowerCase())
    );
    setSelectedNumbers(new Set(matchingNumbers.map(n => n.id)));
  };

  // Memoize filtered numbers to prevent unnecessary re-renders
  const filteredNumbers = useMemo(() => {
    if (!codeFilter.trim()) return hiddenNumbers;
    return hiddenNumbers.filter(n => 
      n.code && n.code.toLowerCase().includes(codeFilter.toLowerCase())
    );
  }, [hiddenNumbers, codeFilter]);

  // Make selected numbers visible
  const makeSelectedVisible = async () => {
    if (selectedNumbers.size === 0) {
      toast.error('No numbers selected');
      return;
    }

    try {
      setHiddenNumbersLoading(true);
      const batch = writeBatch(db);
      selectedNumbers.forEach(numberId => {
        const numberRef = doc(db, 'numberPool', numberId);
        batch.update(numberRef, {
          visibleToFreelancers: true,
          lastStatusChange: serverTimestamp()
        });
      });
      await batch.commit();

      toast.success(`${selectedNumbers.size} numbers are now visible to freelancers`);
      setSelectedNumbers(new Set());
      await loadHiddenNumbers();
    } catch (error) {
      toast.error('Failed to update selected numbers');
    } finally {
      setHiddenNumbersLoading(false);
    }
  };

  useEffect(() => {
    async function fetchStrikes() {
      const result: { [numberId: string]: number } = {};
      for (const req of openRequests) {
        try {
          const docSnap = await getDoc(doc(db, 'numberPool', req.numberId));
          if (docSnap.exists()) {
            const data = docSnap.data();
            const strikes = (data.claims || []).filter((claim: any) => claim.status === 'pending').length;
            result[req.numberId] = strikes;
          } else {
            result[req.numberId] = 0;
          }
        } catch {
          result[req.numberId] = 0;
        }
      }
      setLiveStrikes(result);
    }
    if (openRequests.length > 0) fetchStrikes();
  }, [openRequests]);

  const handleMonthChange = (date: Date) => {
    setSelectedMonth(date);
    // Reload group targets/activations for new month
    loadGroupTargetsForMonth(date);
    // Recompute activations after month change - use teamLeads from state
    computeGroupActivations(teamLeads, date);
    // Reload team metrics for the new month
    loadTeamMetricsForMonth(date);
  };

  // ✅ PERFORMANCE: Load team metrics for specific month with caching
  const loadTeamMetricsForMonth = useCallback(async (month: Date) => {
    try {
      const monthStr = format(month, 'yyyy-MM');
      const cacheKey = `${ADMIN_TEAM_METRICS_CACHE_KEY}_${monthStr}`;
      
      // Check cache first
      const cachedTeamMetrics = getCachedData(cacheKey);
      if (cachedTeamMetrics) {
        setTeamMetrics(cachedTeamMetrics);
        
        // Check if teamId is in URL params and select the team
        const teamIdFromUrl = searchParams.get('teamId');
        if (teamIdFromUrl && cachedTeamMetrics) {
          const team = cachedTeamMetrics.find((t: TeamMetrics) => t.teamId === teamIdFromUrl);
          if (team) {
            setSelectedTeam(team);
          }
        }
        
        return;
      }

      // Load fresh data
      const [teamsSnapshot, usersSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'teams'))),
        getDocs(query(collection(db, 'users'), where('role', 'in', ['agent', 'manager', 'freelancer'])))
      ]);
      
      const teams = teamsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        name: doc.data().name || 'Unknown Team',
        teamName: doc.data().name || doc.data().teamName || 'Unknown Team',
        managerId: doc.data().managerId || '',
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Team[];

      const allUsers = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as User[];

      const usersMap = new Map(allUsers.map(user => [user.id, user]));
      const currentMonthStart = startOfMonth(month);
      const currentMonthEnd = endOfMonth(month);

      const teamMetricsPromises = teams.map(async team => {
        const teamMetric: TeamMetrics = {
          teamId: team.id,
          teamName: team.name,
          managerName: 'No Manager Assigned',
          totalLeads: 0,
          pendingVerification: 0,
          verified: 0,
          rejected: 0,
          activated: 0,
          pendingAssignment: 0,
          assigned: 0,
          agents: []
        };

        const teamMembers = allUsers.filter(user => user.teamId === team.id);

        if (team.managerId) {
          const manager = usersMap.get(team.managerId);
          if (manager) {
            teamMetric.managerName = manager.name;
          }
        }

        const teamLeadsForTeam = teamLeads.filter(lead => lead.teamId === team.id);
        teamMetric.totalLeads = teamLeadsForTeam.length;
        
        const teamActivatedLeads = teamLeadsForTeam.filter(lead => 
          lead.status === 'activated' && 
          lead.updatedAt && 
          lead.updatedAt >= currentMonthStart && 
          lead.updatedAt <= currentMonthEnd
        );
        
        teamMetric.activated = teamActivatedLeads.reduce((count, lead) => {
          return count + (lead.plans?.length || 0);
        }, 0);

        teamLeadsForTeam.forEach(lead => {
          if (lead.status === 'pending_verification') teamMetric.pendingVerification++;
          if (lead.status === 'verified') teamMetric.verified++;
          if (lead.status === 'rejected') teamMetric.rejected++;
          if (lead.status === 'pending_assignment') teamMetric.pendingAssignment++;
          if (lead.status === 'assigned') teamMetric.assigned++;
        });

        const agentMetrics = await Promise.all(teamMembers.map(async member => {
          if (member.role !== 'agent') return null;

          const monthStr = format(month, 'yyyy-MM');
          const targetRef = doc(db, 'agentTargets', `${member.id}_${monthStr}`);
          const targetDoc = await getDoc(targetRef);
          const target = targetDoc.exists() ? targetDoc.data()?.target || 0 : 0;

          const agentLeads = teamLeadsForTeam.filter(lead => lead.agentId === member.id);
          const verified = agentLeads.filter(lead => lead.status === 'verified').length;
          
          const agentActivatedLeads = agentLeads.filter(lead => 
            lead.status === 'activated' && 
            lead.updatedAt && 
            lead.updatedAt >= currentMonthStart && 
            lead.updatedAt <= currentMonthEnd
          );
          
          const activated = agentActivatedLeads.reduce((count, lead) => {
            return count + (lead.plans?.length || 0);
          }, 0);

          return {
            id: member.id,
            name: member.name,
            role: member.role,
            totalLeads: agentLeads.length,
            verified,
            activated,
            target,
            achievement: target > 0 ? (activated / target) * 100 : 0
          };
        }));

        teamMetric.agents = agentMetrics.filter((agent): agent is NonNullable<typeof agent> => agent !== null);
        return teamMetric;
      });

      const resolvedTeamMetrics = await Promise.all(teamMetricsPromises);
      const sortedTeamMetrics = [...resolvedTeamMetrics].sort((a, b) => {
        const nameA = a.teamName || 'Unknown Team';
        const nameB = b.teamName || 'Unknown Team';
        const prefixA = nameA.replace(/\d+/g, '').toLowerCase();
        const prefixB = nameB.replace(/\d+/g, '').toLowerCase();
        if (prefixA !== prefixB) {
          return prefixA.localeCompare(prefixB, undefined, { numeric: true, sensitivity: 'base' });
        }
        const numA = parseInt((nameA.match(/\d+/) || ['0'])[0], 10);
        const numB = parseInt((nameB.match(/\d+/) || ['0'])[0], 10);
        if (numA !== numB) return numA - numB;
        return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
      });

      setTeamMetrics(sortedTeamMetrics);
      setCachedData(cacheKey, sortedTeamMetrics);
      
      // Check if teamId is in URL params and select the team
      const teamIdFromUrl = searchParams.get('teamId');
      if (teamIdFromUrl && sortedTeamMetrics) {
        const team = sortedTeamMetrics.find(t => t.teamId === teamIdFromUrl);
        if (team) {
          setSelectedTeam(team);
        }
      }
    } catch (error) {
    }
  }, [teamLeads]);

  // ✅ PERFORMANCE: Load team metrics when teamLeads change or component mounts
  useEffect(() => {
    if (teamLeads.length > 0) {
      loadTeamMetricsForMonth(selectedMonth);
    }
  }, [teamLeads, selectedMonth, loadTeamMetricsForMonth]);

  // ✅ PERFORMANCE: Compute group activations function
  // Matches the logic from Reports.tsx exactly
  const computeGroupActivations = useCallback((allLeads: Lead[], month: Date) => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const gCounts: Record<string, number> = {};
    
    // Normalize group function - matches Reports.tsx
    const normalizeGroup = (group?: string): string => {
      const g = (group || '').toUpperCase().trim();
      return g || 'UNKNOWN';
    };
    
    const monthActivated = allLeads.filter(lead => {
      if (lead.status !== 'activated') return false;
      const updated = lead.updatedAt instanceof Date ? lead.updatedAt : new Date(lead.updatedAt);
      return updated >= start && updated <= end;
    });
    
    monthActivated.forEach(lead => {
      const productType = (lead as any).productType;

      (lead.plans || []).forEach(plan => {
        const grp = normalizeGroup(plan.group);
        
        // For Express Dial (G2), only count "New" productType towards the group target/achieved
        // This matches the logic in Reports.tsx
        const shouldCountForGroup =
          grp === 'G2'
            ? productType === 'New'
            : true;

        if (shouldCountForGroup) {
          gCounts[grp] = (gCounts[grp] || 0) + 1;
        }
      });
    });
    
    // Always set group activations, even if empty, to ensure state is updated
    setGroupActivations(gCounts);
  }, []);

  // ✅ PERFORMANCE: Recompute group activations when teamLeads change
  // NOTE: The main calculation happens in loadTeamMetricsForMonth with all leads
  // This useEffect is a backup to ensure group activations are computed when teamLeads updates
  // We skip if loading to avoid race conditions, and we rely on the direct call in loadTeamMetricsForMonth
  useEffect(() => {
    // Only recompute if we're not currently loading (to avoid race conditions)
    // and if we have some data (to avoid computing on empty state)
    // The main computation happens in loadTeamMetricsForMonth, this is just a safety net
    if (!loading && teamLeads.length > 0) {
      computeGroupActivations(teamLeads, selectedMonth);
    }
  }, [teamLeads, selectedMonth, computeGroupActivations, loading]);

  // ✅ REALTIME: Setup real-time snapshots for live updates
  const setupRealtimeSnapshots = useCallback(() => {
    if (!realtimeEnabled || !isMountedRef.current) return;

    // Real-time leads snapshot
    // NOTE: For accurate group activations, we need ALL leads, not just recent ones
    // But loading all leads in realtime can be expensive, so we reload full data periodically
    const leadsUnsubscribe = onSnapshot(
      query(
        collection(db, 'leads'),
        orderBy('updatedAt', 'desc'),
        limit(1000) // Increased limit to capture more leads for accurate group calculations
      ),
      (snapshot) => {
        if (!isMountedRef.current) return;
        
        const now = Date.now();
        // Only update if enough time has passed since last update
        if (now - lastRealtimeUpdateRef.current < REALTIME_UPDATE_INTERVAL) {
          return;
        }
        
        const newLeads = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate()
        })) as Lead[];

        // Update cache with fresh data
        setCachedData(ADMIN_LEADS_CACHE_KEY, newLeads);
        setTeamLeads(newLeads);
        // NOTE: Don't recompute group activations from realtime snapshot
        // Group activations should only be computed from full dataset in loadTeamMetricsForMonth
        // The realtime snapshot is limited and would give incorrect counts
        lastRealtimeUpdateRef.current = now;
      },
      (error) => {
        // Handle permission errors gracefully
        if (error.code === 'permission-denied') {
          return;
        }
        if (error.code === 'unavailable') {
          return;
        }
      }
    );

    // Real-time teams snapshot
    const teamsUnsubscribe = onSnapshot(
      query(collection(db, 'teams')),
      (snapshot) => {
        if (!isMountedRef.current) return;
        
        const newTeams = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          name: doc.data().name || 'Unknown Team',
          teamName: doc.data().name || doc.data().teamName || 'Unknown Team', // ✅ FIX: Ensure teamName is always defined
          managerId: doc.data().managerId || '',
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate()
        })) as Team[];

        // Update cache with fresh data
        setCachedData(ADMIN_TEAMS_CACHE_KEY, newTeams);
      },
      (error) => {
        // Suppress permission denied errors during logout
        if (error.code !== 'permission-denied') {
          // Handle other errors if needed
        }
      }
    );

    // Store unsubscribe functions
    unsubscribeRefs.current.push(leadsUnsubscribe, teamsUnsubscribe);
    
    return () => {
      leadsUnsubscribe();
      teamsUnsubscribe();
    };
  }, [realtimeEnabled]);

  // ✅ REALTIME: Start real-time snapshots after initial load
  useEffect(() => {
    if (!loading && realtimeEnabled) {
      const cleanup = setupRealtimeSnapshots();
      return cleanup;
    }
  }, [loading, realtimeEnabled, setupRealtimeSnapshots]);

  async function loadAdminData(forceRefresh = false) {
    // ✅ PERFORMANCE: Check cache first
    if (!forceRefresh) {
      const cachedMetrics = getCachedData(ADMIN_CACHE_KEY);
      const cachedLeads = getCachedData(ADMIN_LEADS_CACHE_KEY);
      const cachedTeamMetrics = getCachedData(ADMIN_TEAM_METRICS_CACHE_KEY);
      
      if (cachedMetrics && cachedLeads && cachedTeamMetrics) {
        setMetrics(cachedMetrics);
        setTeamLeads(cachedLeads);
        setTeamMetrics(cachedTeamMetrics);
        
        // Check if teamId is in URL params and select the team
        const teamIdFromUrl = searchParams.get('teamId');
        if (teamIdFromUrl && cachedTeamMetrics) {
          const team = cachedTeamMetrics.find((t: TeamMetrics) => t.teamId === teamIdFromUrl);
          if (team) {
            setSelectedTeam(team);
          }
        }
        
        setLoading(false);
        return;
      }
    }

    try {
      setLoading(true);
      
      // Load all leads - matches Reports.tsx approach for accurate group activations
      const leadsQuery = query(collection(db, 'leads'));
      const leadsSnapshot = await getDocs(leadsQuery);
      const allLeads = leadsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt
      })) as Lead[];

      // Filter leads for current month
      const currentMonthStart = startOfMonth(selectedMonth);
      const currentMonthEnd = endOfMonth(selectedMonth);
      const getActivatedAt = (lead: any): Date | null => {
        const raw = lead?.activatedAt || lead?.updatedAt;
        if (!raw) return null;
        if (typeof raw.toDate === 'function') {
          const d = raw.toDate();
          return isNaN(d.getTime()) ? null : d;
        }
        if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : d;
      };

      // Filter leads for current month by activatedAt (fallback updatedAt)
      const currentMonthLeads = allLeads.filter(lead => {
        const activatedAt = getActivatedAt(lead);
        return activatedAt && activatedAt >= currentMonthStart && activatedAt <= currentMonthEnd;
      });
        
      // Historical verified count: any lead that has ever been verified,
      // based ONLY on presence of verifiedAt (regardless of current status)
      const verifiedCount = allLeads.filter(
        l => (l as any).verifiedAt
      ).length;
      
      // Calculate activated leads for current month
      // Properly handle Firestore timestamps by converting them to Date objects
      const currentMonthActivatedLeads = currentMonthLeads.filter(lead => lead.status === 'activated');
      
      // Calculate all-time activated leads
      const allTimeActivatedLeads = allLeads.filter(lead => 
        lead.status === 'activated'
      );
      
      // Count total activations by summing up plans in each activated lead
      const monthlyActivated = currentMonthActivatedLeads.reduce((count, lead) => {
        return count + (lead.plans?.length || 0);
      }, 0);
      
      const totalActivated = allTimeActivatedLeads.reduce((count, lead) => {
        return count + (lead.plans?.length || 0);
      }, 0);
      
      const currentMetrics = {
        totalLeads: allLeads.length,
        pendingVerification: allLeads.filter(l => l.status === 'pending_verification').length,
        verified: verifiedCount,
        rejected: currentMonthLeads.filter(l => l.status === 'rejected').length,
        activated: monthlyActivated, // Current month
        totalActivated: totalActivated, // All-time
        pendingAssignment: allLeads.filter(l => l.status === 'verified').length,
        assigned: allLeads.filter(l => l.status === 'assigned').length
      };

      setMetrics(currentMetrics);
      setTeamLeads(allLeads);
      // Compute group activations for the selected month
      // IMPORTANT: Always compute from allLeads (full dataset) to ensure accuracy
      computeGroupActivations(allLeads, selectedMonth);

      // Optimize: Load teams and users in parallel
      const [teamsSnapshot, usersSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'teams'))),
        getDocs(query(collection(db, 'users'), where('role', 'in', ['agent', 'manager', 'freelancer'])))
      ]);
      
      const teams = teamsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        name: doc.data().name || 'Unknown Team',
        teamName: doc.data().name || doc.data().teamName || 'Unknown Team', // ✅ FIX: Ensure teamName is always defined
        managerId: doc.data().managerId || '',
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Team[];

      const allUsers = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as User[];

      // Create a map for faster user lookups
      const usersMap = new Map(allUsers.map(user => [user.id, user]));

      const teamMetricsPromises = teams.map(async team => {
        // Load team target for the selected month
        const monthStr = format(selectedMonth, 'yyyy-MM');
        const teamTargetRef = doc(db, 'teamTargets', `${team.id}_${monthStr}`);
        const teamTargetDoc = await getDoc(teamTargetRef);
        const teamTarget = teamTargetDoc.exists() ? teamTargetDoc.data()?.target : undefined;
        
        const teamMetric: TeamMetrics = {
          teamId: team.id,
          teamName: team.name,
          managerName: 'No Manager Assigned',
          totalLeads: 0,
          pendingVerification: 0,
          verified: 0,
          rejected: 0,
          activated: 0,
          pendingAssignment: 0,
          assigned: 0,
          teamTarget: teamTarget,
          agents: []
        };

        // Optimize: Use pre-loaded users instead of making individual queries
        const teamMembers = allUsers.filter(user => user.teamId === team.id);

        // Get manager name from pre-loaded users
        if (team.managerId) {
          const manager = usersMap.get(team.managerId);
          if (manager) {
            teamMetric.managerName = manager.name;
          }
        }

        // Calculate team metrics
        const teamLeads = allLeads.filter(lead => lead.teamId === team.id);
        teamMetric.totalLeads = teamLeads.length;
        
        // Calculate activated leads for the team in current month
        // Properly handle Firestore timestamps by converting them to Date objects
        const teamActivatedLeads = teamLeads.filter(lead => {
          if (lead.status !== 'activated' || !lead.updatedAt) return false;
          
          // Convert Firestore timestamp to Date if needed
          let updatedAtDate: Date;
          if (lead.updatedAt instanceof Date) {
            updatedAtDate = lead.updatedAt;
          } else if (lead.updatedAt && typeof (lead.updatedAt as any).toDate === 'function') {
            updatedAtDate = (lead.updatedAt as any).toDate();
          } else {
            updatedAtDate = new Date(lead.updatedAt);
          }
          
          return updatedAtDate >= currentMonthStart && updatedAtDate <= currentMonthEnd;
        });
        
        // Count total activations by summing up plans in each activated lead
        teamMetric.activated = teamActivatedLeads.reduce((count, lead) => {
          return count + (lead.plans?.length || 0);
        }, 0);

        // Calculate other team metrics
        teamLeads.forEach(lead => {
          if (lead.status === 'pending_verification') teamMetric.pendingVerification++;
          // Historical verified count per team: any lead with verifiedAt
          if ((lead as any).verifiedAt) {
            teamMetric.verified++;
          }
          if (lead.status === 'rejected') teamMetric.rejected++;
          if (lead.status === 'pending_assignment') teamMetric.pendingAssignment++;
          if (lead.status === 'assigned') teamMetric.assigned++;
        });

        // Calculate agent metrics
        const agentMetrics = await Promise.all(teamMembers.map(async member => {
          if (member.role !== 'agent') return null;

          // Get agent's target for the selected month
          const monthStr = format(selectedMonth, 'yyyy-MM');
          const targetRef = doc(db, 'agentTargets', `${member.id}_${monthStr}`);
          const targetDoc = await getDoc(targetRef);
          const target = targetDoc.exists() ? targetDoc.data()?.target || 0 : 0;

          // Get agent's leads
          const agentLeads = allLeads.filter(lead => lead.agentId === member.id);
          // Historical verified count per agent: any lead with verifiedAt
          const verified = agentLeads.filter(
            lead => (lead as any).verifiedAt
          ).length;
          
          // Calculate activated leads for the agent in current month
          // Properly handle Firestore timestamps by converting them to Date objects
          const agentActivatedLeads = agentLeads.filter(lead => {
            if (lead.status !== 'activated' || !lead.updatedAt) return false;
            
            // Convert Firestore timestamp to Date if needed
            let updatedAtDate: Date;
            if (lead.updatedAt instanceof Date) {
              updatedAtDate = lead.updatedAt;
            } else if (lead.updatedAt && typeof (lead.updatedAt as any).toDate === 'function') {
              updatedAtDate = (lead.updatedAt as any).toDate();
            } else {
              updatedAtDate = new Date(lead.updatedAt);
            }
            
            return updatedAtDate >= currentMonthStart && updatedAtDate <= currentMonthEnd;
          });
          
          // Count total activations by summing up plans in each activated lead
          const activated = agentActivatedLeads.reduce((count, lead) => {
            return count + (lead.plans?.length || 0);
          }, 0);

          return {
            id: member.id,
            name: member.name,
            role: member.role,
            totalLeads: agentLeads.length,
            verified,
            activated,
            target,
            achievement: target > 0 ? (activated / target) * 100 : 0
          };
        }));

        teamMetric.agents = agentMetrics.filter((agent): agent is NonNullable<typeof agent> => agent !== null);
        return teamMetric;
      });

      const resolvedTeamMetrics = await Promise.all(teamMetricsPromises);
      // Sort teams by name with numeric-aware ordering (e.g., ETS-1, ETS-2, ...)
      const sortedTeamMetrics = [...resolvedTeamMetrics].sort((a, b) => {
        // ✅ FIX: Add robust null/undefined checks for teamName
        const nameA = a.teamName || 'Unknown Team';
        const nameB = b.teamName || 'Unknown Team';

        // Compare the non-numeric prefix first (case-insensitive)
        const prefixA = nameA.replace(/\d+/g, '').toLowerCase();
        const prefixB = nameB.replace(/\d+/g, '').toLowerCase();
        if (prefixA !== prefixB) {
          return prefixA.localeCompare(prefixB, undefined, { numeric: true, sensitivity: 'base' });
        }

        // If same prefix, compare numeric parts
        const numA = parseInt((nameA.match(/\d+/) || ['0'])[0], 10);
        const numB = parseInt((nameB.match(/\d+/) || ['0'])[0], 10);
        if (numA !== numB) return numA - numB;

        // Fallback to full name comparison
        return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
      });
      setTeamMetrics(sortedTeamMetrics);

      // ✅ PERFORMANCE: Cache the data
      if (isMountedRef.current) {
        setCachedData(ADMIN_CACHE_KEY, currentMetrics);
        setCachedData(ADMIN_LEADS_CACHE_KEY, allLeads);
        setCachedData(ADMIN_TEAM_METRICS_CACHE_KEY, sortedTeamMetrics);
        lastLoadTimeRef.current = Date.now();
        
        // Check if teamId is in URL params and select the team
        const teamIdFromUrl = searchParams.get('teamId');
        if (teamIdFromUrl && sortedTeamMetrics) {
          const team = sortedTeamMetrics.find(t => t.teamId === teamIdFromUrl);
          if (team) {
            setSelectedTeam(team);
          }
        }
      }
    } catch (error) {
      toast.error('Failed to load admin data');
    } finally {
      if (isMountedRef.current) {
      setLoading(false);
      }
    }
  }

  async function loadGroupTargetsForMonth(month: Date) {
    try {
      const monthId = format(month, 'yyyy-MM');
      const ref = doc(db, 'groupTargets', monthId);
      const snap = await getDoc(ref);
      
      let visibleToCoordinators = false;
      const currentGroups: Record<string, number> = {};
      
      // Only load groups that exist in the current month's document
      // This ensures deleted groups stay deleted and don't reappear from other months
      if (snap.exists()) {
        const currentMonthData: any = snap.data();
        if (currentMonthData.groups && typeof currentMonthData.groups === 'object') {
          Object.entries(currentMonthData.groups).forEach(([k, v]: any) => {
            if (!k) return;
            currentGroups[String(k).toUpperCase()] = Number(v || 0);
          });
        } else {
          // Backward compatibility: old fields g1,g2,g3
          ['G1', 'G2', 'G3'].forEach(g => {
            const value = Number(currentMonthData[g.toLowerCase()] || 0);
            currentGroups[g] = value;
          });
        }
        
        // Use current month's visibility setting
        visibleToCoordinators = Boolean(currentMonthData.visibleToCoordinators === true);
      }
      // No default groups - only groups from Firestore data
      
      setGroupTargets({
        groups: currentGroups,
        visibleToCoordinators
      });
    } catch (e) {
      // Silent; UI remains usable
    }
  }

  async function loadGroupAliases() {
    try {
      // Load aliases from all groupTargets documents and merge them
      // This ensures we get aliases from all months
      const allGroupsQuery = query(collection(db, 'groupTargets'));
      const allGroupsSnapshot = await getDocs(allGroupsQuery);
      
      const mergedAliases: Record<string, string> = {};
      
      // Only load aliases from Firestore - no hardcoded defaults
      allGroupsSnapshot.docs.forEach(doc => {
        const data: any = doc.data();
        if (data.aliases && typeof data.aliases === 'object') {
          Object.assign(mergedAliases, data.aliases);
        }
      });
      
      setGroupAliases(mergedAliases);
    } catch (e) {
      console.error('Error loading group aliases:', e);
      // No fallback - empty object if no data
      setGroupAliases({});
    }
  }

  async function saveGroupAliases(aliases: Record<string, string>) {
    try {
      // Save aliases to the current month's groupTargets document
      const monthId = format(selectedMonth, 'yyyy-MM');
      const ref = doc(db, 'groupTargets', monthId);
      await setDoc(ref, { aliases, updatedAt: serverTimestamp() }, { merge: true });
      setGroupAliases(aliases);
      toast.success('Group alias saved');
    } catch (e) {
      toast.error('Failed to save group alias');
    }
  }

  // Save team target function
  const handleSaveTeamTarget = async (teamId: string) => {
    if (user?.role !== 'admin') return;
    
    setSavingTeamTarget(true);
    try {
      const monthStr = format(selectedMonth, 'yyyy-MM');
      const teamTargetRef = doc(db, 'teamTargets', `${teamId}_${monthStr}`);
      
      await setDoc(teamTargetRef, {
        teamId: teamId,
        target: teamTargetValue,
        month: monthStr,
        updatedAt: serverTimestamp(),
        setBy: 'admin'
      }, { merge: true });
      
      // Update local state
      setTeamMetrics(prev => prev.map(team => 
        team.teamId === teamId 
          ? { ...team, teamTarget: teamTargetValue }
          : team
      ));
      
      setEditingTeamTarget(null);
      toast.success('Team target saved successfully');
    } catch (error) {
      console.error('Error saving team target:', error);
      toast.error('Failed to save team target');
    } finally {
      setSavingTeamTarget(false);
    }
  };



  const handleAddGroupWithAlias = async () => {
    const key = newGroupName.trim().toUpperCase();
    const alias = newGroupAlias.trim();
    
    if (!key) {
      toast.error('Please enter a group name');
      return;
    }
    
    if (!alias) {
      toast.error('Please enter an alias name');
      return;
    }
    
    try {
      // Add group to targets and aliases
      const updatedGroups = { ...groupTargets.groups, [key]: groupTargets.groups[key] ?? 0 };
      const updatedAliases = { ...groupAliases, [key]: alias };
      
      // Update local state
      setGroupTargets(prev => ({ ...prev, groups: updatedGroups }));
      setGroupAliases(updatedAliases);
      
      // Save both groups and aliases to groupTargets document
      await saveGroupTargets({ ...groupTargets, groups: updatedGroups });
      
      // Reset form
      setNewGroupName('');
      setNewGroupAlias('');
      setShowAliasInput(false);
      
      toast.success(`Group ${key} added with alias "${alias}"`);
    } catch (e) {
      toast.error('Failed to add group');
    }
  };

  async function saveGroupTargets(override?: { groups: Record<string, number>; visibleToCoordinators: boolean }) {
    try {
      setSavingGroupTargets(true);
      const monthId = format(selectedMonth, 'yyyy-MM');
      const ref = doc(db, 'groupTargets', monthId);
      // Normalize group keys to uppercase
      const source = override ?? groupTargets;
      const groups: Record<string, number> = {};
      Object.entries(source.groups).forEach(([k, v]) => {
        const key = String(k).toUpperCase();
        groups[key] = Number(v || 0);
      });
      const payload: any = {
        groups,
        aliases: groupAliases, // Include aliases in groupTargets document
        visibleToCoordinators: !!source.visibleToCoordinators,
        updatedAt: serverTimestamp()
      };
      // Upsert into specific doc id (monthId)
      await setDoc(ref, { ...payload, createdAt: serverTimestamp() }, { merge: true });
      toast.success('Group targets saved');
    } catch (e) {
      toast.error('Failed to save group targets');
    } finally {
      setSavingGroupTargets(false);
    }
  }

  // Memoize expensive computations
  const memoizedStats = useMemo(() => {
    return [
      {
        name: 'Total Leads',
        value: metrics.totalLeads,
        icon: Users,
        href: '#leads',
        color: 'from-blue-500 to-blue-600'
      },
      {
        name: 'Pending Verification',
        value: metrics.pendingVerification,
        icon: Clock,
        href: '#pending-verification',
        color: 'from-yellow-500 to-yellow-600'
      },
      {
        name: 'Verified',
        value: metrics.verified,
        icon: CheckCircle,
        href: '#verified',
        color: 'from-green-500 to-green-600'
      },
      {
        name: 'Rejected',
        value: metrics.rejected,
        icon: XCircle,
        href: '#rejected',
        color: 'from-red-500 to-red-600'
      },
      {
        name: 'Activated (Monthly)',
        value: metrics.activated,
        icon: Zap,
        href: '#activated',
        color: 'from-purple-500 to-purple-600'
      },
      {
        name: 'Total Activated',
        value: metrics.totalActivated,
        icon: Zap,
        href: '#activated',
        color: 'from-indigo-500 to-indigo-600'
      },
      {
        name: 'Pending Assignment',
        value: metrics.pendingAssignment,
        icon: ClipboardList,
        href: '#pending-assignment',
        color: 'from-orange-500 to-orange-600'
      },
      {
        name: 'Assigned',
        value: metrics.assigned,
        icon: UserCheck,
        href: '#assigned',
        color: 'from-indigo-500 to-indigo-600'
      }
    ];
  }, [metrics]);

  const handleTeamClick = (team: TeamMetrics) => {
    setSelectedTeam(team);
    setSelectedAgent(null);
  };

  const handleAgentClick = async (agent: TeamMetrics['agents'][0], teamName: string) => {
    // Show modal immediately with skeleton loading
    setSelectedAgentDetails({
      agent,
      teamName,
      performanceData: []
    });
    setIsLoadingAgentDetails(true);

    try {
      // Get performance data for the last 6 months
      const performanceData: AgentPerformanceData[] = [];
      for (let i = 5; i >= 0; i--) {
        const month = subMonths(selectedMonth, i);
        const startDate = startOfMonth(month);
        const endDate = endOfMonth(month);

        // Get agent's leads for the month
        const agentLeads = teamLeads.filter(lead => 
          lead.agentId === agent.id && 
          lead.status === 'activated' &&
          lead.updatedAt && 
          lead.updatedAt >= startDate && 
          lead.updatedAt <= endDate
        );

        // Calculate total activated numbers
        const activatedNumbers = agentLeads.reduce((sum, lead) => sum + (lead.plans?.length || 0), 0);

        // Get target for the month
        const monthStr = format(month, 'yyyy-MM');
        const targetRef = doc(db, 'agentTargets', `${agent.id}_${monthStr}`);
        const targetDoc = await getDoc(targetRef);
        const target = targetDoc.exists() ? targetDoc.data()?.target || 0 : 0;

        performanceData.push({
          month: format(month, 'MMM yyyy'),
          totalLeads: agentLeads.length,
          activated: activatedNumbers,
          target,
          achievement: target > 0 ? (activatedNumbers / target) * 100 : 0
        });
      }

      // Update the modal with the loaded data
      setSelectedAgentDetails(prev => ({
        ...prev!,
        performanceData
      }));
    } catch (error) {
      toast.error('Failed to load agent performance data');
    } finally {
      setIsLoadingAgentDetails(false);
    }
  };

  const handleBack = () => {
    if (selectedAgent) {
      setSelectedAgent(null);
    } else if (selectedTeam) {
      setSelectedTeam(null);
    }
  };

  const stats = useMemo(() => [
    {
      name: 'Total Leads',
      description: 'All leads in system',
      value: metrics.totalLeads,
      href: '/dashboard/leads',
      icon: Users,
      color: 'bg-gradient-to-br from-gray-500 to-gray-600',
      textColor: 'text-gray-600',
    },
    {
      name: 'Pending Verification',
      description: 'Awaiting verification',
      value: metrics.pendingVerification,
      href: '/dashboard/leads?status=pending_verification',
      icon: Clock,
      color: 'bg-gradient-to-br from-yellow-500 to-yellow-600',
      textColor: 'text-yellow-600',
    },
    {
      name: 'Pending Assignment',
      description: 'Awaiting assignment',
      value: metrics.pendingAssignment,
      href: '/dashboard/leads?status=verified',
      icon: Building2,
      color: 'bg-gradient-to-br from-orange-500 to-orange-600',
      textColor: 'text-orange-600',
    },
    {
      name: 'Verified',
      description: 'Successfully verified',
      value: metrics.verified,
      href: '/dashboard/leads?status=verified',
      icon: CheckCircle,
      color: 'bg-gradient-to-br from-green-500 to-green-600',
      textColor: 'text-green-600',
    },
    {
      name: 'Activated (Monthly)',
      description: 'Activated this month',
      value: metrics.activated,
      href: (() => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        return `/dashboard/leads?status=activated&from=${startOfMonth.toISOString()}&to=${endOfMonth.toISOString()}`;
      })(),
      icon: Zap,
      color: 'bg-gradient-to-br from-purple-500 to-purple-600',
      textColor: 'text-purple-600',
    },
    {
      name: 'Total Activated',
      description: 'All-time activations',
      value: metrics.totalActivated,
      href: '/dashboard/leads?status=activated',
      icon: Zap,
      color: 'bg-gradient-to-br from-indigo-500 to-indigo-600',
      textColor: 'text-indigo-600',
    },
    {
      name: 'Rejected',
      description: 'Rejected leads',
      value: metrics.rejected,
      href: '/dashboard/leads?status=rejected',
      icon: XCircle,
      color: 'bg-gradient-to-br from-red-500 to-red-600',
      textColor: 'text-red-600',
    },
    {
      name: 'Open Requests',
      description: 'Pending coordinator requests',
      value: openRequestsLoading ? '...' : openRequests.length,
      href: '#open-requests',
      icon: Unlock,
      color: 'bg-gradient-to-br from-orange-500 to-red-600',
      textColor: 'text-orange-600',
    },
    {
      name: 'Number Logs',
      description: 'View all number activity',
      value: 'View',
      href: '/dashboard/number-logs',
      icon: Activity,
      color: 'bg-gradient-to-br from-cyan-500 to-cyan-600',
      textColor: 'text-cyan-600',
    },
    {
      name: 'Reports',
      description: 'Daily & Monthly analytics',
      value: 'View',
      href: '/dashboard/admin/reports',
      icon: BarChart3,
      color: 'bg-gradient-to-br from-pink-500 to-rose-600',
      textColor: 'text-pink-600',
    },
    {
      name: 'Number Visibility',
      description: 'Control freelancer access',
      value: 'Manage',
      href: '#number-visibility',
      icon: Eye,
      color: 'bg-gradient-to-br from-purple-500 to-purple-600',
      textColor: 'text-purple-600',
    },
    {
      name: 'Manager WhatsApp',
      description: 'Manage notification numbers',
      value: 'Configure',
      href: '#manager-whatsapp',
      icon: Phone,
      color: 'bg-gradient-to-br from-green-500 to-green-600',
      textColor: 'text-green-600',
    },
    {
      name: 'Plan Management',
      description: 'Manage plans and categories',
      value: 'Manage',
      href: '#plan-management',
      icon: Package,
      color: 'bg-gradient-to-br from-indigo-500 to-indigo-600',
      textColor: 'text-indigo-600',
    },
    {
      name: 'DNC Management',
      description: 'Manage Do Not Call registry',
      value: 'Manage',
      href: '#dnc-management',
      icon: Shield,
      color: 'bg-gradient-to-br from-red-500 to-red-600',
      textColor: 'text-red-600',
    },
    {
      name: 'Bulk DNC Import',
      description: 'Import large DNC datasets',
      value: 'Import',
      href: '#bulk-import',
      icon: Database,
      color: 'bg-gradient-to-br from-blue-500 to-blue-600',
      textColor: 'text-blue-600',
      isSpecial: true, // Mark as special button
    },
    {
      name: 'Trusted Devices',
      description: 'Manage trusted device access',
      value: 'Manage',
      href: '#trusted-devices',
      icon: Smartphone,
      color: 'bg-gradient-to-br from-green-500 to-green-600',
      textColor: 'text-green-600',
    },
    {
      name: 'WhatsApp Settings',
      description: 'WhatsApp verification',
      value: 'Configure',
      href: '#whatsapp-settings',
      icon: MessageSquare,
      color: 'bg-gradient-to-br from-emerald-500 to-emerald-600',
      textColor: 'text-emerald-600',
    },
    {
      name: 'Broadcast Poster',
      description: 'Send announcement',
      value: 'Send',
      href: '#broadcast-poster',
      icon: Sparkles,
      color: 'bg-gradient-to-br from-amber-500 to-amber-600',
      textColor: 'text-amber-600',
    },
    {
      name: 'Bulk Delete Numbers',
      description: 'Delete multiple numbers',
      value: 'Delete',
      href: '#bulk-delete',
      icon: Trash2,
      color: 'bg-gradient-to-br from-red-500 to-red-600',
      textColor: 'text-red-600',
    },
  ], [metrics.totalLeads, metrics.pendingVerification, metrics.pendingAssignment, metrics.verified, metrics.activated, metrics.rejected, metrics.assigned, openRequestsLoading, openRequests.length]);

  // Memoize sorted team metrics to prevent unnecessary re-sorting
  const sortedTeamMetrics = useMemo(() => {
    return [...teamMetrics].sort((a, b) => {
      // ✅ FIX: Add null/undefined checks for teamName
      const nameA = a.teamName || 'Unknown Team';
      const nameB = b.teamName || 'Unknown Team';
      
      // Compare the non-numeric prefix first (case-insensitive)
      const prefixA = nameA.replace(/\d+/g, '').toLowerCase();
      const prefixB = nameB.replace(/\d+/g, '').toLowerCase();
      if (prefixA !== prefixB) {
        return prefixA.localeCompare(prefixB, undefined, { numeric: true, sensitivity: 'base' });
      }

      // If same prefix, compare numeric parts
      const numA = parseInt((nameA.match(/\d+/) || ['0'])[0], 10);
      const numB = parseInt((nameB.match(/\d+/) || ['0'])[0], 10);
      if (numA !== numB) return numA - numB;

      // Fallback to full name comparison
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [teamMetrics]);

  const AgentDetailsModal = () => {
    if (!selectedAgentDetails) return null;

    const { agent, teamName, performanceData } = selectedAgentDetails;

    // Calculate 6-month average activation
    const sixMonthAverage = performanceData.length > 0 
      ? performanceData.reduce((sum, d) => sum + d.activated, 0) / performanceData.length 
      : 0;

    const performanceChartData = {
      labels: performanceData.map(d => d.month),
      datasets: [
        {
          label: 'Activated',
          data: performanceData.map(d => d.activated),
          borderColor: 'rgb(147, 51, 234)',
          backgroundColor: 'rgba(147, 51, 234, 0.5)',
          tension: 0.4
        },
        {
          label: 'Target',
          data: performanceData.map(d => d.target),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          tension: 0.4
        }
      ]
    };

    const achievementChartData = {
      labels: performanceData.map(d => d.month),
      datasets: [{
        label: 'Achievement %',
        data: performanceData.map(d => d.achievement),
        backgroundColor: 'rgba(34, 197, 94, 0.5)',
        borderColor: 'rgb(34, 197, 94)',
        borderWidth: 1
      }]
    };

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top' as const,
        },
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{agent.name}</h2>
                <p className="text-sm text-gray-500">{teamName}</p>
              </div>
              <button
                onClick={() => setSelectedAgentDetails(null)}
                className="text-gray-400 hover:text-gray-500"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {isLoadingAgentDetails ? (
              <div className="space-y-6">
                {/* Skeleton loading for cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[...Array(4)].map((_, index) => (
                    <div key={index} className="bg-gray-100 rounded-xl p-4 animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                      <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                    </div>
                  ))}
                </div>
                {/* Skeleton loading for charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {[...Array(2)].map((_, index) => (
                    <div key={index} className="bg-gray-100 rounded-xl p-4 animate-pulse">
                      <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
                      <div className="h-64 bg-gray-200 rounded"></div>
                    </div>
                  ))}
                </div>
                {/* Skeleton loading for table */}
                <div className="bg-gray-100 rounded-xl p-4 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
                  <div className="space-y-3">
                    {[...Array(6)].map((_, index) => (
                      <div key={index} className="h-10 bg-gray-200 rounded"></div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
                    <h4 className="text-sm font-medium mb-1">Total Leads</h4>
                    <p className="text-2xl font-bold">
                      {performanceData.reduce((sum, d) => sum + d.totalLeads, 0)}
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
                    <h4 className="text-sm font-medium mb-1">6-Month Average</h4>
                    <p className="text-2xl font-bold">
                      {sixMonthAverage.toFixed(1)}
                    </p>
                    <p className="text-xs text-green-100 mt-1">Monthly Activations</p>
                  </div>
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
                    <h4 className="text-sm font-medium mb-1">Total Activated</h4>
                    <p className="text-2xl font-bold">
                      {performanceData.reduce((sum, d) => sum + d.activated, 0)}
                    </p>
                  </div>
                  <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-4 text-white">
                    <h4 className="text-sm font-medium mb-1">Average Achievement</h4>
                    <p className="text-2xl font-bold">
                      {(performanceData.reduce((sum, d) => sum + d.achievement, 0) / performanceData.length).toFixed(1)}%
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  <div className="bg-white p-4 rounded-xl shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Trend</h3>
                    <div style={{ height: '300px' }}>
                      <Line data={performanceChartData} options={chartOptions} />
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Achievement Rate</h3>
                    <div style={{ height: '300px' }}>
                      <Bar data={achievementChartData} options={chartOptions} />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Breakdown</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Activated</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Achievement</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {performanceData.map((data, index) => (
                          <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{data.month}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{data.target}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{data.activated}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="w-full bg-gray-200 rounded-full h-2.5 mr-2">
                                  <div
                                    className="h-2.5 rounded-full transition-all duration-500"
                                    style={{
                                      width: `${Math.min(data.achievement, 100)}%`,
                                      backgroundImage: data.achievement >= 100 
                                        ? 'linear-gradient(to right, #059669, #10b981)'
                                        : data.achievement >= 80 
                                          ? 'linear-gradient(to right, #3b82f6, #60a5fa)'
                                          : data.achievement >= 60 
                                            ? 'linear-gradient(to right, #d97706, #f59e0b)'
                                            : 'linear-gradient(to right, #dc2626, #ef4444)'
                                    }}
                                  />
                                </div>
                                <span className="text-sm font-medium text-gray-900">
                                  {data.achievement.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Load open requests
  const loadOpenRequests = () => {
    const q = query(
      collection(db, 'setOpenRequests'),
      where('status', '==', 'pending'),
      orderBy('requestedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        requestedAt: doc.data().requestedAt?.toDate()
      })) as OpenRequest[];
      setOpenRequests(requests);
      setOpenRequestsLoading(false);
    }, (error) => {
      // Suppress permission denied errors during logout
      if (error.code !== 'permission-denied') {
        setOpenRequestsLoading(false);
      }
    });

    return () => unsubscribe();
  };

  // Handle open request approval/rejection
  const handleOpenRequest = async (request: OpenRequest, action: 'approve' | 'reject') => {
    try {
      const requestRef = doc(db, 'setOpenRequests', request.id);
      
      if (action === 'approve') {
        // Update the number status to 'open' in numberPool
        const numberRef = doc(db, 'numberPool', request.numberId);
        await updateDoc(numberRef, {
          status: 'open',
          claims: [],
          lastStatusChange: serverTimestamp()
        });

        // Update request status
        await updateDoc(requestRef, {
          status: 'approved',
          processedAt: serverTimestamp(),
          processedBy: user.id
        });

        toast.success('Number set to open successfully');
      } else {
        // Update request status to rejected
        await updateDoc(requestRef, {
          status: 'rejected',
          processedAt: serverTimestamp(),
          processedBy: user.id
        });

        toast.success('Request rejected');
      }

      // Send notification to coordinator
      await addDoc(collection(db, 'notifications'), {
        userId: request.requestedBy,
        type: 'open_request_response',
        title: 'Open Request Response',
        message: `Your open request for number ${request.number} has been ${action === 'approve' ? 'approved' : 'rejected'}`,
        read: false,
        createdAt: serverTimestamp(),
        numberId: request.numberId
      });

    } catch (error) {
      toast.error('Failed to process request');
    }
  };

  // Find lead by number
  const findLeadByNumber = async (numberId: string) => {
    try {
      const leadsQuery = query(collection(db, 'leads'));
      const leadsSnapshot = await getDocs(leadsQuery);
      
      for (const doc of leadsSnapshot.docs) {
        const data = doc.data();
        if (data.plans && Array.isArray(data.plans)) {
          const hasNumber = data.plans.some((plan: any) => plan.numberId === numberId);
          if (hasNumber) {
            return doc.id;
          }
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  };

  const handleViewLead = async (numberId: string) => {
    const leadId = await findLeadByNumber(numberId);
    if (leadId) {
      navigate(`/dashboard/leads/${leadId}`);
    } else {
      toast.error('Lead not found for this number');
    }
  };

  // Handle initialize number pool stats
  const handleInitializeStats = async () => {
    try {
      setInitializingStats(true);
      setInitStatsResult(null);
      const fn = httpsCallable(getFunctions(), 'initializeNumberPoolStats');
      const res = await fn({});
      const data = res.data as any;
      setInitStatsResult(
        `Initialization completed! Total: ${data.totalItems} items. ` +
        `Categories: ${Object.keys(data.categoryCounts || {}).length}, ` +
        `Groups: ${Object.keys(data.groupCounts || {}).length}, ` +
        `Initials: ${Object.keys(data.initialsCounts || {}).length}`
      );
      toast.success('Number pool stats initialized successfully');
    } catch (err: any) {
      const errorMsg = `Failed to initialize stats: ${err?.message || 'Unknown error'}`;
      setInitStatsResult(errorMsg);
      toast.error(errorMsg);
    } finally {
      setInitializingStats(false);
    }
  };

  // OpenRequestsSection component
  const OpenRequestsSection = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mt-8"
      id="open-requests"
    >
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="px-8 py-6 bg-gradient-to-r from-orange-500 to-red-600">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Unlock className="h-6 w-6" />
                Open Requests
              </h3>
              <p className="mt-1 text-orange-100 text-sm">
                Manage coordinator requests to set numbers as open
              </p>
            </div>
            <div className="p-2 bg-white/10 rounded-lg">
              <AlertOctagon className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        <div className="p-6">
          {openRequestsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
            </div>
          ) : openRequests.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No pending open requests
            </div>
          ) : (
            <div className="space-y-4">
              {openRequests.map((request) => (
                <motion.div
                  key={request.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-orange-50 to-red-50 rounded-xl p-4 border border-orange-100"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center space-x-4">
                      <div className="h-12 w-12 flex-shrink-0 rounded-xl bg-gradient-to-br from-orange-100 to-red-100 flex items-center justify-center">
                        <Hash className="h-6 w-6 text-orange-600" />
                      </div>
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900">{request.number}</h4>
                        <p className="text-sm text-gray-600">
                          Requested by {request.requestedByName} {formatDistanceToNow(request.requestedAt)} ago
                        </p>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {liveStrikes[request.numberId] ?? '...'} strikes
                          </span>
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {request.numberStatus}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleViewLead(request.numberId)}
                        className="inline-flex items-center px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        <Eye className="h-4 w-4 mr-1.5" />
                        View Lead
                      </motion.button>
                      
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleOpenRequest(request, 'approve')}
                        className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200"
                      >
                        <Unlock className="h-4 w-4 mr-1.5" />
                        Approve
                      </motion.button>
                      
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleOpenRequest(request, 'reject')}
                        className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200"
                      >
                        <Lock className="h-4 w-4 mr-1.5" />
                        Reject
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
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
    <div>
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1">
          <p className="mt-2 text-lg text-gray-600">
              <br></br>
            </p>
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome back, {user?.name}!
            </h1>
            <p className="mt-2 text-lg text-gray-600">
              Here's what's happening across all teams today.
            </p>
          </div>
          <div className="flex items-center space-x-4">
            
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Calendar className="h-5 w-5" />
              <input
                type="month"
                value={format(selectedMonth, 'yyyy-MM')}
                onChange={(e) => handleMonthChange(new Date(e.target.value))}
                className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <PayrollButton role="admin" user={user} />
            
            {/* Attendance Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setAttendanceOpen(true)}
              className="group relative inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-300 border-0 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-green-600 to-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative flex items-center gap-3">
                <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
                  <UserCheck className="h-5 w-5" />
                </div>
                <span className="text-sm font-semibold">Attendance</span>
              </div>
            </motion.button>

            
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-12">
        {stats.map((stat) => (
          stat.name === 'Open Requests' ? (
            <button
              key={stat.name}
              onClick={() => setOpenRequestsModal(true)}
              className="bg-white overflow-hidden shadow-lg rounded-2xl hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer relative group w-full text-left"
              type="button"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl ${stat.color} group-hover:scale-110 transition-transform duration-300`}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-sm font-medium text-gray-500 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.description}
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.name}
                  </h3>
                  <div className="flex items-baseline justify-between">
                    <p className={`text-3xl font-bold ${stat.textColor}`}>{stat.value}</p>
                  </div>
                </div>
              </div>
              <div className={`absolute bottom-0 left-0 right-0 h-1 ${stat.color} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300`} />
            </button>
          ) : stat.name === 'Number Visibility' ? (
            <button
              key={stat.name}
              onClick={() => {
                setNumberVisibilityOpen(true);
                loadHiddenNumbers();
              }}
              className={`overflow-hidden shadow-lg rounded-2xl hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer relative group w-full text-left ${getGlassmorphismClass(stat.name)}`}
              type="button"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl ${stat.color} group-hover:scale-110 transition-transform duration-300`}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-sm font-medium text-gray-500 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.description}
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.name}
                  </h3>
                  <div className="flex items-baseline justify-between">
                    <p className={`text-3xl font-bold ${stat.textColor}`}>{stat.value}</p>
                  </div>
                </div>
              </div>
              <div className={`absolute bottom-0 left-0 right-0 h-1 ${stat.color} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300`} />
            </button>
          ) : stat.name === 'Manager WhatsApp' ? (
            <button
              key={stat.name}
              onClick={() => setManagerPhoneModalOpen(true)}
              className={`overflow-hidden shadow-lg rounded-2xl hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer relative group w-full text-left ${getGlassmorphismClass(stat.name)}`}
              type="button"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl ${stat.color} group-hover:scale-110 transition-transform duration-300`}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-sm font-medium text-gray-500 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.description}
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.name}
                  </h3>
                  <div className="flex items-baseline justify-between">
                    <p className={`text-3xl font-bold ${stat.textColor}`}>{stat.value}</p>
                  </div>
                </div>
              </div>
              <div className={`absolute bottom-0 left-0 right-0 h-1 ${stat.color} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300`} />
            </button>
          ) : stat.name === 'Plan Management' ? (
            <button
              key={stat.name}
              onClick={() => setPlanManagementModalOpen(true)}
              className={`overflow-hidden shadow-lg rounded-2xl hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer relative group w-full text-left ${getGlassmorphismClass(stat.name)}`}
              type="button"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl ${stat.color} group-hover:scale-110 transition-transform duration-300`}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-sm font-medium text-gray-500 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.description}
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.name}
                  </h3>
                  <div className="flex items-baseline justify-between">
                    <p className={`text-3xl font-bold ${stat.textColor}`}>{stat.value}</p>
                  </div>
                </div>
              </div>
              <div className={`absolute bottom-0 left-0 right-0 h-1 ${stat.color} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300`} />
            </button>
          ) : stat.name === 'DNC Management' ? (
            <button
              key={stat.name}
              onClick={() => setDncManagementOpen(true)}
              className={`overflow-hidden shadow-lg rounded-2xl hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer relative group w-full text-left ${getGlassmorphismClass(stat.name)}`}
              type="button"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl ${stat.color} group-hover:scale-110 transition-transform duration-300`}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-sm font-medium text-gray-500 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.description}
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.name}
                  </h3>
                  <div className="flex items-baseline justify-between">
                    <p className={`text-3xl font-bold ${stat.textColor}`}>{stat.value}</p>
                  </div>
                </div>
              </div>
              <div className={`absolute bottom-0 left-0 right-0 h-1 ${stat.color} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300`} />
            </button>
          ) : stat.name === 'Bulk DNC Import' ? (
            <button
              key={stat.name}
              onClick={() => setBulkImportOpen(true)}
              className={`overflow-hidden shadow-lg rounded-2xl hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer relative group w-full text-left ${getGlassmorphismClass(stat.name)}`}
              type="button"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl ${stat.color} group-hover:scale-110 transition-transform duration-300`}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-sm font-medium text-gray-500 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.description}
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.name}
                  </h3>
                  <div className="flex items-baseline justify-between">
                    <p className={`text-3xl font-bold ${stat.textColor}`}>{stat.value}</p>
                  </div>
                </div>
              </div>
              <div className={`absolute bottom-0 left-0 right-0 h-1 ${stat.color} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300`} />
            </button>
          ) : stat.name === 'Trusted Devices' ? (
            <button
              key={stat.name}
              onClick={() => setTrustedDevicesModalOpen(true)}
              className={`overflow-hidden shadow-lg rounded-2xl hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer relative group w-full text-left ${getGlassmorphismClass(stat.name)}`}
              type="button"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl ${stat.color} group-hover:scale-110 transition-transform duration-300`}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-sm font-medium text-gray-500 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.description}
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.name}
                  </h3>
                  <div className="flex items-baseline justify-between">
                    <p className={`text-3xl font-bold ${stat.textColor}`}>{stat.value}</p>
                  </div>
                </div>
              </div>
              <div className={`absolute bottom-0 left-0 right-0 h-1 ${stat.color} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300`} />
            </button>
          ) : stat.name === 'WhatsApp Settings' ? (
            <button
              key={stat.name}
              onClick={() => setWhatsappSettingsModalOpen(true)}
              className={`overflow-hidden shadow-lg rounded-2xl hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer relative group w-full text-left ${getGlassmorphismClass(stat.name)}`}
              type="button"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl ${stat.color} group-hover:scale-110 transition-transform duration-300`}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-sm font-medium text-gray-500 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.description}
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.name}
                  </h3>
                  <div className="flex items-baseline justify-between">
                    <p className={`text-3xl font-bold ${stat.textColor}`}>{stat.value}</p>
                  </div>
                </div>
              </div>
              <div className={`absolute bottom-0 left-0 right-0 h-1 ${stat.color} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300`} />
            </button>
          ) : stat.name === 'Broadcast Poster' ? (
            <button
              key={stat.name}
              onClick={() => setPosterModalOpen(true)}
              className={`overflow-hidden shadow-lg rounded-2xl hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer relative group w-full text-left ${getGlassmorphismClass(stat.name)}`}
              type="button"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl ${stat.color} group-hover:scale-110 transition-transform duration-300`}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-sm font-medium text-gray-500 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.description}
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.name}
                  </h3>
                  <div className="flex items-baseline justify-between">
                    <p className={`text-3xl font-bold ${stat.textColor}`}>{stat.value}</p>
                  </div>
                </div>
              </div>
              <div className={`absolute bottom-0 left-0 right-0 h-1 ${stat.color} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300`} />
            </button>
          ) : stat.name === 'Bulk Delete Numbers' ? (
            <button
              key={stat.name}
              onClick={() => setBulkDeleteModalOpen(true)}
              className={`overflow-hidden shadow-lg rounded-2xl hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer relative group w-full text-left ${getGlassmorphismClass(stat.name)}`}
              type="button"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl ${stat.color} group-hover:scale-110 transition-transform duration-300`}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-sm font-medium text-gray-500 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.description}
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.name}
                  </h3>
                  <div className="flex items-baseline justify-between">
                    <p className={`text-3xl font-bold ${stat.textColor}`}>{stat.value}</p>
                  </div>
                </div>
              </div>
              <div className={`absolute bottom-0 left-0 right-0 h-1 ${stat.color} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300`} />
            </button>
          ) : (
            <Link
              to={stat.href}
              key={stat.name}
              className={`overflow-hidden shadow-lg rounded-2xl hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer relative group ${getGlassmorphismClass(stat.name) || 'bg-white'}`}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl ${stat.color} group-hover:scale-110 transition-transform duration-300`}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-sm font-medium text-gray-500 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.description}
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-700 transition-colors duration-300">
                    {stat.name}
                  </h3>
                  <div className="flex items-baseline justify-between">
                    <p className={`text-3xl font-bold ${stat.textColor}`}>{stat.value}</p>
                  </div>
                </div>
              </div>
              <div className={`absolute bottom-0 left-0 right-0 h-1 ${stat.color} transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300`} />
            </Link>
          )
        ))}
        
        {/* Initialize Number Pool Stats Button */}
        <button
          onClick={handleInitializeStats}
          disabled={initializingStats}
          className="bg-white overflow-hidden shadow-lg rounded-2xl hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer relative group w-full text-left border-2 border-blue-200"
          type="button"
        >
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 group-hover:scale-110 transition-transform duration-300">
                <Database className="h-6 w-6 text-white" />
              </div>
              <div className="text-sm font-medium text-gray-500 group-hover:text-gray-700 transition-colors duration-300">
                {initializingStats ? 'Initializing...' : 'Regenerate stats'}
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-700 transition-colors duration-300">
                Initialize Number Pool Stats
              </h3>
              <div className="flex items-baseline justify-between">
                <p className="text-sm text-gray-600">
                  {initStatsResult || 'Regenerate pagination stats for groups and initials'}
                </p>
              </div>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
        </button>
      </div>

      {/* Team Performance Section */}
        <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            {(selectedTeam || selectedAgent) && (
              <button
                onClick={handleBack}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </button>
            )}
            <h2 className="text-2xl font-bold text-gray-900">
              {selectedAgent ? 'Agent Performance' : 
               selectedTeam ? 'Team Performance' : 
               ''}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <input
              type="month"
              value={format(selectedMonth, 'yyyy-MM')}
              onChange={(e) => handleMonthChange(new Date(e.target.value))}
              className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>

        {selectedTeam ? (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
                <h4 className="text-sm font-medium mb-1">Total Leads</h4>
                <p className="text-2xl font-bold">{selectedTeam.totalLeads}</p>
              </div>
              <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
                <h4 className="text-sm font-medium mb-1">Activated</h4>
                <p className="text-2xl font-bold">
                  {teamLeads.filter(lead => 
                    lead.teamId === selectedTeam.teamId && 
                    lead.status === 'activated' &&
                    lead.updatedAt && 
                    lead.updatedAt >= startOfMonth(selectedMonth) && 
                    lead.updatedAt <= endOfMonth(selectedMonth)
                  ).reduce((sum, lead) => sum + (lead.plans?.length || 0), 0)}
                </p>
              </div>
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
                <h4 className="text-sm font-medium mb-1">Total Target</h4>
                <p className="text-2xl font-bold">
                  {selectedTeam.agents.reduce((sum, agent) => sum + (agent.target || 0), 0)}
                </p>
              </div>
              <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-4 text-white">
                <h4 className="text-sm font-medium mb-1">Agents</h4>
                <p className="text-2xl font-bold">{selectedTeam.agents.length}</p>
              </div>
            </div>

            {/* Agent Performance Table */}
            <div className="mt-8">
              <h4 className="text-lg font-semibold text-gray-900 mb-4">Agent Performance</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Agent
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Target
                      </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Activated
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Leads
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        6-Month Avg
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Achievement
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {selectedTeam.agents.map((agent) => {
                      const achievement = agent.target > 0 ? (agent.activated / agent.target) * 100 : 0;
                      const statusColor = achievement >= 100 
                        ? 'bg-green-100 text-green-800'
                        : achievement >= 80 
                          ? 'bg-blue-100 text-blue-800'
                          : achievement >= 60 
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800';
                      
                      const statusText = achievement >= 100 
                        ? 'Exceeded'
                        : achievement >= 80 
                          ? 'On Track'
                          : achievement >= 60 
                            ? 'At Risk'
                            : 'Behind';

                      // Calculate 6-month average
                      const sixMonthsAgo = subMonths(selectedMonth, 5);
                      const sixMonthActivations = teamLeads
                        .filter(lead => 
                          lead.agentId === agent.id && 
                          lead.status === 'activated' &&
                          lead.updatedAt && 
                          lead.updatedAt >= startOfMonth(sixMonthsAgo) && 
                          lead.updatedAt <= endOfMonth(selectedMonth)
                        )
                        .reduce((sum, lead) => sum + (lead.plans?.length || 0), 0);
                      
                      const sixMonthAverage = Math.round(sixMonthActivations / 6);

                      return (
                        <tr 
                          key={agent.id}
                          onClick={() => handleAgentClick(agent, selectedTeam.teamName)}
                          className="hover:bg-gray-50 cursor-pointer transition-colors duration-150"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-shrink-0 h-10 w-10">
                                <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                                  <span className="text-indigo-600 font-medium">
                                    {agent.name.split(' ').map((n, index) => <span key={index}>{n[0]}</span>)}
                                  </span>
                                </div>
                              </div>
                              <div className="ml-4">
                                <div className="text-sm font-medium text-gray-900">{agent.name}</div>
                                
                              </div>
                            </div>
                      </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{agent.target}</div>
                      </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{agent.activated}</div>
                      </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{agent.totalLeads}</div>
                      </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              <span className="font-medium">{sixMonthAverage}</span>
                              <span className="text-gray-500 text-xs ml-1"></span>
                            </div>
                      </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="w-full bg-gray-200 rounded-full h-2.5 mr-2">
                                <div
                                  className="h-2.5 rounded-full transition-all duration-500"
                                  style={{
                                    width: `${Math.min(achievement, 100)}%`,
                                    backgroundImage: achievement >= 100 
                                      ? 'linear-gradient(to right, #059669, #10b981)'
                                      : achievement >= 80 
                                        ? 'linear-gradient(to right, #3b82f6, #60a5fa)'
                                        : achievement >= 60 
                                          ? 'linear-gradient(to right, #d97706, #f59e0b)'
                                          : 'linear-gradient(to right, #dc2626, #ef4444)'
                                  }}
                                />
                              </div>
                              <span className="text-sm font-medium text-gray-900">
                                {achievement.toFixed(1)}%
                              </span>
                            </div>
                      </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColor}`}>
                              {statusText}
                            </span>
                      </td>
                    </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        ) : (
          // Team Overview
          <div className="space-y-6">
            {/* Group Targets & Activations */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">Group Targets & Activations ({format(selectedMonth, 'MMM yyyy')})</h3>
                <div className="flex items-center gap-2">
                  {!editingGroups ? (
                    <button
                      type="button"
                      onClick={() => setEditingGroups(true)}
                      className="inline-flex items-center px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100"
                    >
                      Edit
                    </button>
                  ) : (
                    <>
                      <label className="hidden sm:inline-flex items-center gap-2 text-sm text-gray-700 mr-2">
                        <input
                          type="checkbox"
                          checked={groupTargets.visibleToCoordinators}
                          onChange={(e) => setGroupTargets(prev => ({ ...prev, visibleToCoordinators: e.target.checked }))}
                          className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                        />
                        Visible to Coordinators
                      </label>
                      <button
                        onClick={async () => { await saveGroupTargets(); setEditingGroups(false); }}
                        disabled={savingGroupTargets}
                        className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {savingGroupTargets ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingGroups(false); loadGroupTargetsForMonth(selectedMonth); }}
                        className="inline-flex items-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.keys(groupTargets.groups)
                  .sort()
                  .map((key) => {
                    const label = key.toUpperCase();
                    const alias = groupAliases[label] || label;
                    const target = groupTargets.groups[label] ?? 0;
                    const achieved = groupActivations[label] ?? 0;
                    const achievement = target > 0 ? Math.min((achieved / target) * 100, 100) : 0;
                    // Color/icon per group
                    const palette = {
                      G1: { card: 'from-indigo-50 to-indigo-100', accent: 'text-indigo-700', bar: 'bg-indigo-500' },
                      G2: { card: 'from-emerald-50 to-emerald-100', accent: 'text-emerald-700', bar: 'bg-emerald-500' },
                      G3: { card: 'from-amber-50 to-amber-100', accent: 'text-amber-700', bar: 'bg-amber-500' },
                      G4: { card: 'from-fuchsia-50 to-fuchsia-100', accent: 'text-fuchsia-700', bar: 'bg-fuchsia-500' },
                      G5: { card: 'from-cyan-50 to-cyan-100', accent: 'text-cyan-700', bar: 'bg-cyan-500' },
                    } as any;
                    const theme = palette[label] || { card: 'from-gray-50 to-gray-100', accent: 'text-gray-700', bar: 'bg-indigo-500', icon: Target };
                    return (
                      <div key={label} className={`bg-gradient-to-br ${theme.card} rounded-xl p-4 border border-gray-200 shadow-sm`}> 
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`p-2 rounded-lg bg-white/70 ${theme.accent}`}>
                              <Target className="w-4 h-4" />
                            </div>
                            <div className={`text-sm font-semibold ${theme.accent}`}>{alias} Activation</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">Target vs Achieved</span>
                            {editingGroups && (
                            <button
                              type="button"
                              onClick={async () => {
                                const monthId = format(selectedMonth, 'yyyy-MM');
                                const groupTargetsRef = doc(db, 'groupTargets', monthId);
                                
                                setSavingGroupTargets(true);
                                try {
                                  // Capture alias name before deletion
                                  const aliasName = groupAliases[label] || label;
                                  
                                  // Delete group from current month's targets and aliases
                                  const updatedAliases = { ...groupAliases };
                                  delete updatedAliases[label];
                                  
                                  // Build update object with deleteField for both group and alias
                                  const updateData: any = {
                                    [`groups.${label}`]: deleteField(),
                                    [`aliases.${label}`]: deleteField(),
                                    updatedAt: serverTimestamp()
                                  };
                                  
                                  await updateDoc(groupTargetsRef, updateData);
                                  
                                  // Update local state
                                    setGroupTargets(prev => {
                                      const copy = { ...prev.groups } as Record<string, number>;
                                      delete copy[label];
                                      return { ...prev, groups: copy };
                                    });
                                  
                                  // Update local aliases state
                                  setGroupAliases(updatedAliases);
                                  
                                  toast.success(`Group ${aliasName} and its alias deleted from ${format(selectedMonth, 'MMM yyyy')}`);
                                } catch (error) {
                                  console.error('Error deleting group:', error);
                                  toast.error('Failed to delete group');
                                } finally {
                                  setSavingGroupTargets(false);
                                }
                              }}
                              className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700"
                              title={`Delete ${groupAliases[label] || label}`}
                            >
                              <X className="w-4 h-4" />
                            </button> )}
                          </div>
                        </div>
                        <div className="flex items-end justify-between mb-3">
                          <div>
                            <div className="text-2xl font-bold text-gray-900">{achieved}</div>
                            <div className="text-xs text-gray-600">Activated</div>
                          </div>
                          <div>
                            {editingGroups ? (
                              <>
                                <input
                                  type="number"
                                  min={0}
                                  value={target}
                                  onChange={(e) => setGroupTargets(prev => ({ ...prev, groups: { ...prev.groups, [label]: Number(e.target.value) } }))}
                                  className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                                  placeholder="Target"
                                />
                                <div className="text-xs text-gray-500 mt-1 text-right">Target</div>
                              </>
                            ) : (
                              <div className="text-right">
                                <div className="text-lg font-semibold text-gray-900">{target}</div>
                                <div className="text-xs text-gray-500">Target</div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div
                            className={`h-2.5 rounded-full transition-all ${theme.bar}`}
                            style={{ width: `${achievement}%` }}
                          />
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="text-gray-600">Achievement</span>
                          <span className={`px-2 py-0.5 rounded-full font-medium ${achievement >= 100 ? 'bg-green-100 text-green-700' : achievement >= 80 ? 'bg-blue-100 text-blue-700' : achievement >= 60 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{Math.round(achievement)}%</span>
                        </div>
                      </div>
                    );
                })}
              </div>

              {editingGroups && (
                <div className="mt-4 space-y-3">
                  {!showAliasInput ? (
                    <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Add group (e.g., G4, G5, VIP)"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && newGroupName.trim()) {
                            const key = newGroupName.trim().toUpperCase();
                            if (key) {
                              setShowAliasInput(true);
                            }
                          }
                        }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const key = newGroupName.trim().toUpperCase();
                      if (!key) return;
                          setShowAliasInput(true);
                        }}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                      >
                        Next
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                      <div className="text-sm font-semibold text-gray-700">
                        Group: <span className="text-indigo-700">{newGroupName.trim().toUpperCase()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newGroupAlias}
                          onChange={(e) => setNewGroupAlias(e.target.value)}
                          placeholder={`Enter alias name (e.g., ${groupAliases['G1'] || 'Connect'})`}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          autoFocus
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && newGroupAlias.trim()) {
                              handleAddGroupWithAlias();
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleAddGroupWithAlias}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAliasInput(false);
                            setNewGroupAlias('');
                          }}
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                        >
                          Cancel
                  </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(teamMetrics || []).map((team) => {
                // Use the pre-calculated teamMetric.activated instead of recalculating
                const totalAchieved = team.activated || 0;
                // Use team target if set by admin, otherwise fall back to sum of agent targets
                const agentTargetSum = (team.agents || []).reduce((sum, agent) => sum + (agent.target || 0), 0);
                const totalTarget = team.teamTarget !== undefined ? team.teamTarget : agentTargetSum;
                const averageActivationPerAgent = (team.agents || []).length > 0 
                  ? (totalAchieved / (team.agents || []).length).toFixed(1) 
                  : '0';

                const achievementPercentage = totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : 0;
                const achievementColor = achievementPercentage >= 100 
                  ? 'from-emerald-500 to-emerald-600'
                  : achievementPercentage >= 80 
                    ? 'from-blue-500 to-blue-600'
                    : achievementPercentage >= 60 
                      ? 'from-amber-500 to-amber-600'
                      : 'from-red-500 to-red-600';

                return (
                  <div 
                    key={team.teamId || `team-${team.teamName || 'unknown'}`}
                    className="bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100"
                  >
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-xl font-bold text-gray-900">{team.teamName}</h3>
                          <p className="text-sm text-gray-500">Managed by {team.managerName}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="w-5 h-5 text-gray-400" />
                          <span className="text-sm font-medium text-gray-600">{(team.agents || []).length} Agents</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-xl">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-medium text-purple-700">This Month</p>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4 text-purple-600" />
                              <span className="text-xs font-medium text-purple-600 bg-purple-100 px-2 py-1 rounded-full">
                                {format(selectedMonth, 'MMM')}
                              </span>
                            </div>
                          </div>
                          <p className="text-2xl font-bold text-purple-900">{totalAchieved}</p>
                          <p className="text-xs text-purple-600 mt-1">Activations</p>
                        </div>
                        <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-medium text-green-700">Average Per Agent</p>
                          </div>
                          <p className="text-2xl font-bold text-green-900">{averageActivationPerAgent}</p>
                          <p className="text-xs text-green-600 mt-1">Activations</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between text-sm mb-2">
                            <span className="text-gray-600">Target Achievement</span>
                            <span className="font-medium text-gray-900">
                              {achievementPercentage.toFixed(1)}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2.5">
                            <div
                              className={`bg-gradient-to-r ${achievementColor} h-2.5 rounded-full transition-all duration-500`}
                              style={{ width: `${Math.min(achievementPercentage, 100)}%` }}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm font-medium text-blue-700">Total Target</p>
                              {user?.role === 'admin' && (
                                <button
                                  onClick={() => {
                                    setEditingTeamTarget(team.teamId);
                                    setTeamTargetValue(team.teamTarget !== undefined ? team.teamTarget : agentTargetSum);
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                                >
                                  Edit
                                </button>
                              )}
                            </div>
                            {editingTeamTarget === team.teamId ? (
                              <div className="space-y-3">
                                <input
                                  type="number"
                                  min={0}
                                  value={teamTargetValue}
                                  onChange={(e) => setTeamTargetValue(Number(e.target.value))}
                                  className="w-full px-3 py-2 border border-blue-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                  autoFocus
                                  onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                      handleSaveTeamTarget(team.teamId);
                                    }
                                    if (e.key === 'Escape') {
                                      setEditingTeamTarget(null);
                                    }
                                  }}
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => setEditingTeamTarget(null)}
                                    className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleSaveTeamTarget(team.teamId)}
                                    disabled={savingTeamTarget}
                                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                  >
                                    {savingTeamTarget ? 'Saving...' : 'Save'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-2xl font-bold text-blue-900">{totalTarget}</p>
                            )}
                          </div>
                          <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm font-medium text-green-700">Total Achieved</p>
                            </div>
                            <p className="text-2xl font-bold text-green-900">{totalAchieved}</p>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleTeamClick(team)}
                        className="mt-6 w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white py-2 px-4 rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all duration-300 font-medium text-sm"
                      >
                        View Team Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Attendance Modal */}
      {attendanceOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setAttendanceOpen(false);
            }
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full mx-4 relative max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">All Teams Attendance</h2>
                <p className="text-sm text-gray-500 mt-1">View and manage attendance across all teams</p>
              </div>
              <button
                onClick={() => setAttendanceOpen(false)}
                className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <AttendanceTable 
                user={user} 
                role="admin" 
                month={attendanceMonth} 
                onMonthChange={setAttendanceMonth} 
              />
            </div>
          </div>
        </div>
      )}

      
      {selectedAgentDetails && <AgentDetailsModal />}
      {openRequestsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto relative animate-fadeIn">
            <button
              onClick={() => setOpenRequestsModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full p-2 shadow"
              aria-label="Close"
            >
              <XCircle className="w-6 h-6" />
            </button>
            <OpenRequestsSection />
          </div>
        </div>
      )}

      {/* Broadcast Poster Modal */}
      {posterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 relative"
          >
            {/* Preview overlay on top layer */}
            {showPosterPreview && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6">
                <div className="w-full max-w-2xl bg-white/10 rounded-2xl overflow-hidden border border-white/20 shadow-2xl">
                  <div className="flex items-center justify-between bg-white/10 px-4 py-3 border-b border-white/20">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white">
                      <Sparkles className="w-4 h-4 text-amber-200" />
                      Preview
                    </div>
                    <button
                      onClick={() => setShowPosterPreview(false)}
                      className="text-white hover:bg-white/20 rounded-lg p-1.5 transition-colors"
                      aria-label="Close preview"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="bg-gradient-to-br from-rose-800 via-orange-900 to-amber-900 text-white p-6">
                    <div className="flex flex-col items-center text-center gap-1">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-white/10 rounded-xl border border-white/10 shadow-lg">
                          <Sparkles className="w-4 h-4 text-amber-300" />
                        </div>
                        <div className="text-amber-300 text-sm uppercase tracking-[0.2em] font-semibold">
                          Announcement
                        </div>
                        <div className="p-2 bg-white/10 rounded-xl border border-white/10 shadow-lg">
                          <Sparkles className="w-4 h-4 text-amber-300" />
                        </div>
                      </div>
                      <p className="text-xs font-semibold text-amber-200/90">
                        {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                      <div className="w-full max-w-sm h-0.5 bg-amber-200/70 mt-1 mb-2" />
                      <h2 className="text-2xl font-semibold text-amber-100 drop-shadow">
                        {posterTitle || 'Announcement Title'}
                      </h2>
                    </div>
                    <div className="mt-5 text-sm text-amber-50/90 leading-relaxed whitespace-pre-line">
                      {posterMessage || 'Your announcement message will appear here.'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-amber-500 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/15 rounded-xl border border-white/10">
                  <Sparkles className="w-5 h-5 text-amber-200" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-amber-200/80">Broadcast Poster</p>
                  <h3 className="text-xl font-semibold text-white">Send Announcement</h3>
                </div>
              </div>
              <button
                onClick={() => setPosterModalOpen(false)}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-semibold text-gray-700">Title</label>
                <input
                  type="text"
                  value={posterTitle}
                  onChange={(e) => setPosterTitle(e.target.value)}
                  placeholder="Announcement headline"
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">Message</label>
                <textarea
                  value={posterMessage}
                  onChange={(e) => setPosterMessage(e.target.value)}
                  rows={6}
                  placeholder="Details of the announcement..."
                  className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Tip: Each send generates a new poster ID. Users see it once per send until they acknowledge.
                </p>
              </div>

              {/* Live Preview (toggle) */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">This will appear to all users on next refresh until they click “I Acknowledge”.</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setPosterModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setShowPosterPreview(!showPosterPreview)}
                    className="px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-100 rounded-lg hover:bg-indigo-200 transition-colors"
                  >
                    {showPosterPreview ? 'Hide Preview' : 'Preview'}
                  </button>
                  <motion.button
                    whileHover={{ scale: isSendingPoster ? 1 : 1.02 }}
                    whileTap={{ scale: isSendingPoster ? 1 : 0.98 }}
                    onClick={handleSendBroadcastPoster}
                    disabled={isSendingPoster}
                    className="px-5 py-2.5 text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                  >
                    {isSendingPoster ? 'Sending...' : 'Send to All'}
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}


      {/* Number Visibility Modal */}
      {numberVisibilityOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto relative animate-fadeIn">
            <button
              onClick={() => {
                setNumberVisibilityOpen(false);
                setSelectedNumbers(new Set());
                setCodeFilter('');
                setShowCodeFilter(false);
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full p-2 shadow"
              aria-label="Close"
            >
              <XCircle className="w-6 h-6" />
            </button>
            
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-purple-100 rounded-xl">
                  <Eye className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Number Visibility Control</h2>
                  <p className="text-sm text-gray-500 mt-1">Manage which numbers are visible to freelancers</p>
                </div>
              </div>

              {hiddenNumbersLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
                </div>
              ) : hiddenNumbers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Eye className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium">No hidden numbers</p>
                  <p className="text-sm">All numbers are currently visible to freelancers</p>
                </div>
              ) : (
                 <div className="space-y-4">
                   {/* Selection Controls */}
                   <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                     <div className="flex items-center justify-between mb-3">
                       <h3 className="text-sm font-medium text-blue-900">Bulk Selection</h3>
                       <div className="flex items-center gap-2">
                         <span className="text-xs text-blue-700">
                           {selectedNumbers.size} selected
                         </span>
                         <button
                           onClick={clearSelection}
                           className="text-xs text-blue-600 hover:text-blue-800"
                         >
                           Clear
                         </button>
                       </div>
                     </div>
                     
                     <div className="flex flex-wrap gap-2">
                       <button
                         onClick={selectAllNumbers}
                         className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 transition-colors"
                       >
                         <CheckSquare2 className="h-3 w-3 mr-1" />
                         Select All
                       </button>
                       
                       <button
                         onClick={() => setShowCodeFilter(!showCodeFilter)}
                         className="inline-flex items-center px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs hover:bg-purple-200 transition-colors"
                       >
                         <Hash className="h-3 w-3 mr-1" />
                         Filter by Code
                       </button>
                       
                       {selectedNumbers.size > 0 && (
                         <button
                           onClick={makeSelectedVisible}
                           className="inline-flex items-center px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200 transition-colors"
                         >
                           <Eye className="h-3 w-3 mr-1" />
                           Make Selected Visible
                         </button>
                       )}
                       
                       <button
                         onClick={makeAllHiddenVisible}
                         className="inline-flex items-center px-2 py-1 bg-gradient-to-r from-green-500 to-green-600 text-white rounded text-xs hover:from-green-600 hover:to-green-700 transition-all duration-200"
                       >
                         Make All Visible
                       </button>
                     </div>
                     
                     {showCodeFilter && (
                       <div className="mt-3 flex gap-2">
                         <input
                           type="text"
                           value={codeFilter}
                           onChange={(e) => setCodeFilter(e.target.value)}
                           placeholder="Enter code pattern (e.g., 'NEWCRMSTD', 'ETS-1')"
                           className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                         />
                         <button
                           onClick={() => selectByCode(codeFilter)}
                           className="px-3 py-1.5 bg-purple-500 text-white rounded text-xs hover:bg-purple-600 transition-colors"
                         >
                           Select Matching
                         </button>
                         <button
                           onClick={() => {
                             setCodeFilter('');
                             setShowCodeFilter(false);
                           }}
                           className="px-2 py-1.5 text-gray-500 hover:text-gray-700"
                         >
                           <X className="h-4 w-4" />
                         </button>
                       </div>
                     )}
                   </div>

                   <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                     <div className="flex items-center gap-2">
                       <AlertTriangle className="h-5 w-5 text-yellow-600" />
                       <p className="text-sm text-yellow-800">
                         <strong>{filteredNumbers.length}</strong> numbers are currently hidden from freelancers
                         {codeFilter && (
                           <span className="ml-2 text-xs text-yellow-600">
                             (filtered by "{codeFilter}")
                           </span>
                         )}
                       </p>
                     </div>
                   </div>
                  
                   <div className="grid gap-4">
                     {filteredNumbers.map((number) => (
                       <div key={number.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                         <div className="flex items-center justify-between">
                           <div className="flex items-center gap-3 flex-1">
                             <div className="flex-shrink-0">
                               <button
                                 onClick={() => toggleNumberSelection(number.id)}
                                 className="w-5 h-5 rounded border-2 flex items-center justify-center hover:bg-gray-100 transition-colors"
                               >
                                 {selectedNumbers.has(number.id) ? (
                                   <CheckSquare2 className="h-4 w-4 text-blue-600" />
                                 ) : (
                                   <Square className="h-4 w-4 text-gray-400" />
                                 )}
                               </button>
                             </div>
                             <div className="flex-1">
                               <div className="flex items-center gap-4">
                                 <div className="text-lg font-semibold text-gray-900">{number.number}</div>
                                 <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                                   {number.category}
                                 </span>
                                 <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full">
                                   {number.code}
                                 </span>
                                 <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                                   {number.status}
                                 </span>
                               </div>
                               <div className="mt-2 text-sm text-gray-600">
                                 Group: {number.group} • Last updated: {format(number.lastStatusChange, 'MMM dd, yyyy HH:mm')}
                               </div>
                             </div>
                           </div>
                           <button
                             onClick={() => toggleNumberVisibility(number.id, true)}
                             className="ml-4 inline-flex items-center px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all duration-200"
                           >
                             <Eye className="h-4 w-4 mr-2" />
                             Make Visible
                           </button>
                         </div>
                       </div>
                     ))}
                     
                     {filteredNumbers.length === 0 && codeFilter && (
                       <div className="text-center py-8 text-gray-500">
                         <Hash className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                         <p className="text-lg font-medium">No numbers found</p>
                         <p className="text-sm">No numbers match the filter "{codeFilter}"</p>
                         <button
                           onClick={() => setCodeFilter('')}
                           className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                         >
                           Clear filter
                         </button>
                       </div>
                     )}
                   </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manager WhatsApp Modal */}
      {managerPhoneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto relative animate-fadeIn">
            <button
              onClick={() => setManagerPhoneModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full p-2 shadow z-10"
              aria-label="Close"
            >
              <XCircle className="w-6 h-6" />
            </button>
            
            <div className="p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">WhatsApp Notification Numbers</h2>
                <p className="text-gray-600">
                  Manage WhatsApp notification numbers for admins, coordinators, and managers.
                </p>
              </div>
              
              <AdminManagerPhoneNumbers />
            </div>
          </div>
        </div>
      )}

      {/* Plan Management Modal */}
      {planManagementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-y-auto relative animate-fadeIn">
            <button
              onClick={() => setPlanManagementModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full p-2 shadow z-10"
              aria-label="Close"
            >
              <XCircle className="w-6 h-6" />
            </button>
            
            <div className="p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Plan Management</h2>
                <p className="text-gray-600">
                  Manage plans and categories for lead creation. Create, edit, and organize plans that agents can select when creating leads.
                </p>
              </div>
              
              <PlanManagement />
            </div>
          </div>
        </div>
      )}

      {/* DNC Management Modal */}
      <DNCManagement 
        isOpen={dncManagementOpen} 
        onClose={() => setDncManagementOpen(false)} 
      />

          {/* Bulk DNC Import Modal */}
          <BulkDNCImport 
            isOpen={bulkImportOpen} 
            onClose={() => setBulkImportOpen(false)} 
          />

      {/* Bulk Delete Numbers Modal */}
      {bulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto relative animate-fadeIn">
            <button
              onClick={() => setBulkDeleteModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full p-2 shadow z-10"
              aria-label="Close"
            >
              <XCircle className="w-6 h-6" />
            </button>
            
            <div className="p-8">
              <BulkDeleteNumbers />
            </div>
          </div>
        </div>
      )}

      {/* Trusted Devices Management Modal */}
      {trustedDevicesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-y-auto relative animate-fadeIn">
            <button
              onClick={() => setTrustedDevicesModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full p-2 shadow z-10"
              aria-label="Close"
            >
              <XCircle className="w-6 h-6" />
            </button>
            
            <div className="p-8">
              <TrustedDevicesAdmin />
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Settings Modal */}
      {whatsappSettingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto relative animate-fadeIn">
            <button
              onClick={() => setWhatsappSettingsModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full p-2 shadow z-10"
              aria-label="Close"
            >
              <XCircle className="w-6 h-6" />
            </button>
            
            <div className="p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">WhatsApp Settings</h2>
                <p className="text-gray-600">
                  Configure WhatsApp verification settings for lead creation.
                </p>
              </div>
              
              <WhatsAppSettings />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
