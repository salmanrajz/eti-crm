import { useState, useEffect } from 'react';
import { collection, query, getDocs, where, orderBy, doc, getDoc, updateDoc, addDoc, onSnapshot, serverTimestamp, deleteDoc, limit, writeBatch } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { User, Team, Lead, NumberPool } from '../../types';
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
  FileText,
  Square,
  CheckSquare2,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Line, Bar } from 'react-chartjs-2';
import { useAuthStore } from '../../store/authStore';
import { motion } from 'framer-motion';
import PayrollButton from '../PayrollButton';
import AttendanceTable from '../AttendanceTable';
import LeaveApplicationModal from '../LeaveApplicationModal';

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

interface AdminDashboardProps {
  user: User;
}

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

interface AgentPerformanceData {
  month: string;
  totalLeads: number;
  activated: number;
  target: number;
  achievement: number;
}

export function AdminDashboard({ user }: AdminDashboardProps) {
  const [metrics, setMetrics] = useState({
    totalLeads: 0,
    pendingVerification: 0,
    verified: 0,
    rejected: 0,
    activated: 0,
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
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [attendanceMonth, setAttendanceMonth] = useState(new Date());
  const [numberVisibilityOpen, setNumberVisibilityOpen] = useState(false);
  const [hiddenNumbers, setHiddenNumbers] = useState<NumberPool[]>([]);
  const [hiddenNumbersLoading, setHiddenNumbersLoading] = useState(false);
  const [selectedNumbers, setSelectedNumbers] = useState<Set<string>>(new Set());
  const [codeFilter, setCodeFilter] = useState('');
  const [showCodeFilter, setShowCodeFilter] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadAdminData();
    loadOpenRequests();
  }, [user]);

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
      console.error('Error loading hidden numbers:', error);
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
      console.error('Error toggling number visibility:', error);
      toast.error('Failed to update number visibility');
    }
  };

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
      console.error('Error making all hidden numbers visible:', error);
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
    const filteredNumbers = getFilteredNumbers();
    setSelectedNumbers(new Set(filteredNumbers.map(n => n.id)));
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedNumbers(new Set());
  };

  // Select numbers by code pattern
  const selectByCode = (pattern: string) => {
    const filteredNumbers = getFilteredNumbers();
    const matchingNumbers = filteredNumbers.filter(n => 
      n.code && n.code.toLowerCase().includes(pattern.toLowerCase())
    );
    setSelectedNumbers(new Set(matchingNumbers.map(n => n.id)));
  };

  // Get filtered numbers based on code filter
  const getFilteredNumbers = () => {
    if (!codeFilter.trim()) return hiddenNumbers;
    return hiddenNumbers.filter(n => 
      n.code && n.code.toLowerCase().includes(codeFilter.toLowerCase())
    );
  };

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
      console.error('Error making selected numbers visible:', error);
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
  };

  async function loadAdminData() {
    try {
      // Fetch all leads for admin metrics
      const allLeadsQuery = query(
        collection(db, 'leads'),
        orderBy('updatedAt', 'desc')
      );
      const leadsSnapshot = await getDocs(allLeadsQuery);
      const allLeads = leadsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Lead[];

      // Filter leads for current month
      const currentMonthStart = startOfMonth(selectedMonth);
      const currentMonthEnd = endOfMonth(selectedMonth);
      const currentMonthLeads = allLeads.filter(lead => 
        lead.updatedAt && 
        lead.updatedAt >= currentMonthStart && 
        lead.updatedAt <= currentMonthEnd
      );
        
      const verifiedCount = allLeads.filter(l => l.status === 'verified').length;
      const currentMetrics = {
        totalLeads: allLeads.length,
        pendingVerification: allLeads.filter(l => l.status === 'pending_verification').length,
        verified: verifiedCount,
        rejected: currentMonthLeads.filter(l => l.status === 'rejected').length,
        activated: 0,
        pendingAssignment: verifiedCount,
        assigned: allLeads.filter(l => l.status === 'assigned').length
      };

      // Calculate activated leads for current month
      const currentMonthActivatedLeads = currentMonthLeads.filter(lead => 
        lead.status === 'activated'
      );
      
      // Count total activations by summing up plans in each activated lead
      currentMetrics.activated = currentMonthActivatedLeads.reduce((count, lead) => {
        return count + (lead.plans?.length || 0);
      }, 0);

      setMetrics(currentMetrics);
      setTeamLeads(allLeads);

      // Fetch teams and their metrics
      const teamsQuery = query(collection(db, 'teams'));
      const teamsSnapshot = await getDocs(teamsQuery);
      const teams = teamsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Team[];

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

        // Get team members
        const teamMembersQuery = query(
          collection(db, 'users'),
          where('teamId', '==', team.id)
        );
        const teamMembersSnapshot = await getDocs(teamMembersQuery);
        const teamMembers = teamMembersSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as User[];

        // Get manager name
        if (team.managerId) {
          const managerDoc = await getDoc(doc(db, 'users', team.managerId));
          if (managerDoc.exists()) {
            teamMetric.managerName = managerDoc.data().name;
          }
        }

        // Calculate team metrics
        const teamLeads = allLeads.filter(lead => lead.teamId === team.id);
        teamMetric.totalLeads = teamLeads.length;
        
        // Calculate activated leads for the team in current month
        const teamActivatedLeads = teamLeads.filter(lead => 
          lead.status === 'activated' && 
          lead.updatedAt && 
          lead.updatedAt >= currentMonthStart && 
          lead.updatedAt <= currentMonthEnd
        );
        
        // Count total activations by summing up plans in each activated lead
        teamMetric.activated = teamActivatedLeads.reduce((count, lead) => {
          return count + (lead.plans?.length || 0);
        }, 0);

        // Calculate other team metrics (total counts regardless of date)
        teamLeads.forEach(lead => {
          if (lead.status === 'pending_verification') teamMetric.pendingVerification++;
          if (lead.status === 'verified') teamMetric.verified++;
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
          const verified = agentLeads.filter(lead => lead.status === 'verified').length;
          
          // Calculate activated leads for the agent in current month
          const agentActivatedLeads = agentLeads.filter(lead => 
            lead.status === 'activated' && 
            lead.updatedAt && 
            lead.updatedAt >= currentMonthStart && 
            lead.updatedAt <= currentMonthEnd
          );
          
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
        const nameA = a.teamName || '';
        const nameB = b.teamName || '';

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
    } catch (error) {
      console.error('Error loading admin data:', error);
      toast.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  }

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
      console.error('Error loading agent performance data:', error);
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

  const stats = [
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
      name: 'Activated',
      description: 'Active subscriptions',
      value: metrics.activated,
      href: '/dashboard/leads?status=activated',
      icon: Zap,
      color: 'bg-gradient-to-br from-purple-500 to-purple-600',
      textColor: 'text-purple-600',
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
      name: 'Number Visibility',
      description: 'Control freelancer access',
      value: 'Manage',
      href: '#number-visibility',
      icon: Eye,
      color: 'bg-gradient-to-br from-purple-500 to-purple-600',
      textColor: 'text-purple-600',
    },
  ];

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
      console.error('Error processing open request:', error);
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
      console.error('Error finding lead:', error);
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
            <button
              onClick={() => setAttendanceOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors duration-200"
            >
              <UserCheck className="h-4 w-4 mr-2" />
              Attendance
            </button>

            {/* Leave Application Button (visible only) */}
            <button
              onClick={() => setLeaveModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
              type="button"
            >
              <FileText className="h-4 w-4 mr-2" />
              Leave Applications
            </button>
            
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
          ) : (
            <Link
              to={stat.href}
              key={stat.name}
              className="bg-white overflow-hidden shadow-lg rounded-2xl hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer relative group"
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
                                    {agent.name.split(' ').map(n => n[0]).join('')}
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {teamMetrics.map((team) => {
                const startDate = startOfMonth(selectedMonth);
                const endDate = endOfMonth(selectedMonth);
                const currentMonthLeads = teamLeads.filter(lead => 
                  lead.teamId === team.teamId && 
                  lead.status === 'activated' &&
                  lead.updatedAt && 
                  lead.updatedAt >= startDate && 
                  lead.updatedAt <= endDate
                ).reduce((sum, lead) => sum + (lead.plans?.length || 0), 0);

                const totalTarget = team.agents.reduce((sum, agent) => sum + (agent.target || 0), 0);
                const totalAchieved = currentMonthLeads;
                const averageActivationPerAgent = team.agents.length > 0 
                  ? (currentMonthLeads / team.agents.length).toFixed(1) 
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
                    key={team.teamId}
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
                          <span className="text-sm font-medium text-gray-600">{team.agents.length} Agents</span>
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
                          <p className="text-2xl font-bold text-purple-900">{currentMonthLeads}</p>
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
                            </div>
                            <p className="text-2xl font-bold text-blue-900">{totalTarget}</p>
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

      {/* Leave Application Modal */}
      <LeaveApplicationModal 
        user={user}
        role="admin"
        teamId={undefined}
        open={leaveModalOpen}
        onClose={() => setLeaveModalOpen(false)}
      />

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
                         <strong>{getFilteredNumbers().length}</strong> numbers are currently hidden from freelancers
                         {codeFilter && (
                           <span className="ml-2 text-xs text-yellow-600">
                             (filtered by "{codeFilter}")
                           </span>
                         )}
                       </p>
                     </div>
                   </div>
                  
                   <div className="grid gap-4">
                     {getFilteredNumbers().map((number) => (
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
                     
                     {getFilteredNumbers().length === 0 && codeFilter && (
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
    </div>
  );
}