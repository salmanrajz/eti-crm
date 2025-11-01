/**
 * ===============================================================================
 * REPORTS COMPONENT - DAILY & MONTHLY ANALYTICS
 * ===============================================================================
 * 
 * This component provides comprehensive reporting with daily and monthly metrics,
 * organized by groups (G1, G2, G3, G4 for others) and teams, with category-wise
 * breakdowns. Shows all teams, groups, and categories by default even with 0 values.
 * 
 * FEATURES:
 * 
 * 1. DAILY REPORT
 *    - Verified leads count
 *    - Follow-up leads count
 *    - Activated leads count
 *    - Assigned for activation count
 *    - Team-wise breakdown with group and category details
 * 
 * 2. MONTHLY REPORT
 *    - Activated leads only
 *    - Team-wise breakdown with group and category details
 * 
 * USAGE:
 * Accessible from Admin Dashboard for comprehensive system analytics.
 * ===============================================================================
 */

import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, getDocs, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Lead, Team, User } from '../../types';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { 
  BarChart3, 
  Users, 
  CheckCircle, 
  Clock, 
  RefreshCw,
  Zap,
  Target,
  Hash,
  Package,
  TrendingUp,
  Calendar,
  Activity,
  Table,
  Grid,
  X,
  ArrowLeft,
  User2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

const GROUPS = ['G1', 'G2', 'G3', 'G4'] as const;
const CATEGORIES = ['Standard', 'Silver', 'Silver Plus', 'Gold', 'Gold Plus', 'Platinum'] as const;

const GROUP_NAMES: Record<string, string> = {
  'G1': 'Connect',
  'G2': 'Express Dial',
  'G3': 'Telecon',
  'G4': 'G4 (Others)'
};

const GROUP_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  G1: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  G2: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  G3: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  G4: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Standard': { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' },
  'Silver': { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300' },
  'Silver Plus': { bg: 'bg-slate-200', text: 'text-slate-900', border: 'border-slate-400' },
  'Gold': { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  'Gold Plus': { bg: 'bg-yellow-200', text: 'text-yellow-900', border: 'border-yellow-400' },
  'Platinum': { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
};

interface GroupCategoryMetrics {
  [group: string]: {
    [category: string]: number;
    total: number;
  };
}

interface TeamMetrics {
  teamName: string;
  teamId: string;
  total: number;
  groups: GroupCategoryMetrics;
}

interface DailyMetrics {
  verified: number;
  followup: number;
  activated: number;
  assignedForActivation: number;
  teamWise: {
    [teamId: string]: TeamMetrics;
  };
}

interface MonthlyMetrics {
  total: number;
  teamWise: {
    [teamId: string]: TeamMetrics;
  };
}

function normalizeGroup(group?: string): 'G1' | 'G2' | 'G3' | 'G4' {
  const g = (group || '').toUpperCase().trim();
  if (g === 'G1') return 'G1';
  if (g === 'G2') return 'G2';
  if (g === 'G3') return 'G3';
  return 'G4';
}

function normalizeCategory(category?: string): string {
  if (!category) return 'Standard';
  const normalized = category.trim();
  // Handle variations
  if (normalized.toLowerCase() === 'silver plus') return 'Silver Plus';
  if (normalized.toLowerCase() === 'gold plus') return 'Gold Plus';
  return normalized;
}

interface TeamPerformanceData {
  teamId: string;
  teamName: string;
  managerName: string;
  totalLeads: number;
  activated: number;
  totalTarget: number;
  agentsCount: number;
  agents: {
    id: string;
    name: string;
    role: string;
    totalLeads: number;
    verified: number;
    activated: number;
    target: number;
    achievement: number;
    sixMonthAverage: number;
  }[];
}

interface AgentPerformanceData {
  month: string;
  totalLeads: number;
  activated: number;
  target: number;
  achievement: number;
}

interface AgentDetailsData {
  agent: TeamPerformanceData['agents'][0];
  teamName: string;
  performanceData: AgentPerformanceData[];
}

export function Reports() {
  const [view, setView] = useState<'daily' | 'monthly'>('daily');
  const [displayMode, setDisplayMode] = useState<'cards' | 'table'>('cards');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetrics | null>(null);
  const [monthlyMetrics, setMonthlyMetrics] = useState<MonthlyMetrics | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTeamForPerformance, setSelectedTeamForPerformance] = useState<string | null>(null);
  const [teamPerformanceData, setTeamPerformanceData] = useState<TeamPerformanceData | null>(null);
  const [loadingTeamPerformance, setLoadingTeamPerformance] = useState(false);
  const [teamPerformanceMonth, setTeamPerformanceMonth] = useState(new Date());
  const [selectedAgentDetails, setSelectedAgentDetails] = useState<AgentDetailsData | null>(null);
  const [isLoadingAgentDetails, setIsLoadingAgentDetails] = useState(false);
  const [teamLeadsForPerformance, setTeamLeadsForPerformance] = useState<Lead[]>([]);

  useEffect(() => {
    loadTeams();
  }, []);

  useEffect(() => {
    if (teams.length > 0) {
      if (view === 'daily') {
        loadDailyMetrics(selectedDate);
      } else {
        loadMonthlyMetrics(selectedMonth);
      }
    }
  }, [view, selectedDate, selectedMonth, teams]);

  const loadTeams = async () => {
    try {
      const teamsQuery = query(collection(db, 'teams'));
      const snapshot = await getDocs(teamsQuery);
      const teamsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Team[];
      
      // Sort teams alphabetically
      teamsData.sort((a, b) => {
        const nameA = (a.name || 'Unknown Team').toLowerCase();
        const nameB = (b.name || 'Unknown Team').toLowerCase();
        return nameA.localeCompare(nameB);
      });
      
      setTeams(teamsData);
    } catch (error) {
      console.error('Error loading teams:', error);
      toast.error('Failed to load teams');
    }
  };

  const initializeTeamMetrics = (teamId: string, teamName: string): TeamMetrics => {
    const groups: GroupCategoryMetrics = {};
    
    // Initialize all groups
    GROUPS.forEach(group => {
      groups[group] = {
        total: 0,
      };
      
      // Initialize all categories for each group
      CATEGORIES.forEach(category => {
        groups[group][category] = 0;
      });
    });

    return {
      teamId,
      teamName,
      total: 0,
      groups,
    };
  };

  const loadDailyMetrics = async (date: Date) => {
    setLoading(true);
    try {
      const start = startOfDay(date);
      const end = endOfDay(date);
      
      const leadsQuery = query(collection(db, 'leads'));
      const leadsSnapshot = await getDocs(leadsQuery);
      const allLeads = leadsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt,
        updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt
      })) as Lead[];

      const filteredLeads = allLeads.filter(lead => {
        const updated = lead.updatedAt instanceof Date ? lead.updatedAt : new Date(lead.updatedAt);
        return updated >= start && updated <= end;
      });

      const metrics: DailyMetrics = {
        verified: 0,
        followup: 0,
        activated: 0,
        assignedForActivation: 0,
        teamWise: {}
      };

      // Initialize all teams with empty metrics
      teams.forEach(team => {
        metrics.teamWise[team.id] = initializeTeamMetrics(team.id, team.name || 'Unknown Team');
      });

      // Process leads
      filteredLeads.forEach(lead => {
        const plans = lead.plans || [];
        const teamId = lead.teamId || 'unknown';
        const team = teams.find(t => t.id === teamId);
        
        // Initialize team if not exists
        if (!metrics.teamWise[teamId]) {
          metrics.teamWise[teamId] = initializeTeamMetrics(
            teamId,
            team?.name || 'Unknown Team'
          );
        }

        plans.forEach(plan => {
          const group = normalizeGroup(plan.group);
          const category = normalizeCategory(plan.category);

          // Ensure group and category exist
          if (!metrics.teamWise[teamId].groups[group]) {
            metrics.teamWise[teamId].groups[group] = { total: 0 };
            CATEGORIES.forEach(cat => {
              metrics.teamWise[teamId].groups[group][cat] = 0;
            });
          }
          if (!metrics.teamWise[teamId].groups[group][category]) {
            metrics.teamWise[teamId].groups[group][category] = 0;
          }

          // Update metrics based on status
          if (lead.status === 'verified') {
            metrics.verified++;
            metrics.teamWise[teamId].total++;
            metrics.teamWise[teamId].groups[group].total++;
            metrics.teamWise[teamId].groups[group][category]++;
          } else if (lead.status === 'follow_verification') {
            metrics.followup++;
            metrics.teamWise[teamId].total++;
            metrics.teamWise[teamId].groups[group].total++;
            metrics.teamWise[teamId].groups[group][category]++;
          } else if (lead.status === 'activated') {
            metrics.activated++;
            metrics.teamWise[teamId].total++;
            metrics.teamWise[teamId].groups[group].total++;
            metrics.teamWise[teamId].groups[group][category]++;
          } else if (lead.status === 'assigned') {
            metrics.assignedForActivation++;
            metrics.teamWise[teamId].total++;
            metrics.teamWise[teamId].groups[group].total++;
            metrics.teamWise[teamId].groups[group][category]++;
          }
        });
      });

      setDailyMetrics(metrics);
    } catch (error) {
      console.error('Error loading daily metrics:', error);
      toast.error('Failed to load daily metrics');
    } finally {
      setLoading(false);
    }
  };

  const loadMonthlyMetrics = async (month: Date) => {
    setLoading(true);
    try {
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      
      const leadsQuery = query(collection(db, 'leads'));
      const leadsSnapshot = await getDocs(leadsQuery);
      const allLeads = leadsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt
      })) as Lead[];

      const filteredLeads = allLeads.filter(lead => {
        if (lead.status !== 'activated') return false;
        const updated = lead.updatedAt instanceof Date ? lead.updatedAt : new Date(lead.updatedAt);
        return updated >= start && updated <= end;
      });

      const metrics: MonthlyMetrics = {
        total: 0,
        teamWise: {}
      };

      // Initialize all teams with empty metrics
      teams.forEach(team => {
        metrics.teamWise[team.id] = initializeTeamMetrics(team.id, team.name || 'Unknown Team');
      });

      // Process leads
      filteredLeads.forEach(lead => {
        const plans = lead.plans || [];
        const teamId = lead.teamId || 'unknown';
        const team = teams.find(t => t.id === teamId);
        const planCount = plans.length || 1;

        // Initialize team if not exists
        if (!metrics.teamWise[teamId]) {
          metrics.teamWise[teamId] = initializeTeamMetrics(
            teamId,
            team?.name || 'Unknown Team'
          );
        }

        plans.forEach(plan => {
          const group = normalizeGroup(plan.group);
          const category = normalizeCategory(plan.category);

          // Ensure group and category exist
          if (!metrics.teamWise[teamId].groups[group]) {
            metrics.teamWise[teamId].groups[group] = { total: 0 };
            CATEGORIES.forEach(cat => {
              metrics.teamWise[teamId].groups[group][cat] = 0;
            });
          }
          if (!metrics.teamWise[teamId].groups[group][category]) {
            metrics.teamWise[teamId].groups[group][category] = 0;
          }

          // Update metrics
          metrics.total += planCount;
          metrics.teamWise[teamId].total += planCount;
          metrics.teamWise[teamId].groups[group].total += planCount;
          metrics.teamWise[teamId].groups[group][category] += planCount;
        });
      });

      setMonthlyMetrics(metrics);
    } catch (error) {
      console.error('Error loading monthly metrics:', error);
      toast.error('Failed to load monthly metrics');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    if (view === 'daily') {
      await loadDailyMetrics(selectedDate);
    } else {
      await loadMonthlyMetrics(selectedMonth);
    }
    setRefreshing(false);
    toast.success('Report refreshed');
  };

  const loadTeamPerformance = async (teamId: string) => {
    setLoadingTeamPerformance(true);
    try {
      // Get team info
      const teamDoc = await getDoc(doc(db, 'teams', teamId));
      if (!teamDoc.exists()) {
        toast.error('Team not found');
        setLoadingTeamPerformance(false);
        return;
      }

      const teamData = teamDoc.data() as Team;
      const teamName = teamData.name || 'Unknown Team';
      const managerId = teamData.managerId;

      // Get manager name
      let managerName = 'No Manager Assigned';
      if (managerId) {
        const managerDoc = await getDoc(doc(db, 'users', managerId));
        if (managerDoc.exists()) {
          managerName = managerDoc.data().name || 'Unknown Manager';
        }
      }

      // Get team members
      const teamMembersQuery = query(collection(db, 'users'), where('teamId', '==', teamId));
      const teamMembersSnapshot = await getDocs(teamMembersQuery);
      const teamMembers = teamMembersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as User[];

      const agents = teamMembers.filter(m => m.role === 'agent');

      // Get leads for this team
      const teamLeadsQuery = query(collection(db, 'leads'), where('teamId', '==', teamId));
      const teamLeadsSnapshot = await getDocs(teamLeadsQuery);
      const teamLeads = teamLeadsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Lead[];

      const currentMonthStart = startOfMonth(teamPerformanceMonth);
      const currentMonthEnd = endOfMonth(teamPerformanceMonth);

      // Calculate team metrics
      const totalLeads = teamLeads.length;
      const activatedLeads = teamLeads.filter(lead =>
        lead.status === 'activated' &&
        lead.updatedAt &&
        lead.updatedAt >= currentMonthStart &&
        lead.updatedAt <= currentMonthEnd
      );
      const activated = activatedLeads.reduce((sum, lead) => sum + (lead.plans?.length || 0), 0);

      // Calculate agent metrics
      const monthStr = format(teamPerformanceMonth, 'yyyy-MM');
      const sixMonthsAgo = subMonths(teamPerformanceMonth, 5);

      const agentMetrics = await Promise.all(agents.map(async (agent) => {
        // Get agent target
        const targetRef = doc(db, 'agentTargets', `${agent.id}_${monthStr}`);
        const targetDoc = await getDoc(targetRef);
        const target = targetDoc.exists() ? targetDoc.data()?.target || 0 : 0;

        // Get agent leads
        const agentLeads = teamLeads.filter(lead => lead.agentId === agent.id);
        const verified = agentLeads.filter(lead => lead.status === 'verified').length;

        // Calculate activated for current month
        const agentActivatedLeads = agentLeads.filter(lead =>
          lead.status === 'activated' &&
          lead.updatedAt &&
          lead.updatedAt >= currentMonthStart &&
          lead.updatedAt <= currentMonthEnd
        );
        const agentActivated = agentActivatedLeads.reduce((sum, lead) => sum + (lead.plans?.length || 0), 0);

        // Calculate 6-month average
        const sixMonthActivations = teamLeads
          .filter(lead =>
            lead.agentId === agent.id &&
            lead.status === 'activated' &&
            lead.updatedAt &&
            lead.updatedAt >= startOfMonth(sixMonthsAgo) &&
            lead.updatedAt <= currentMonthEnd
          )
          .reduce((sum, lead) => sum + (lead.plans?.length || 0), 0);
        const sixMonthAverage = Math.round(sixMonthActivations / 6);

        return {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          totalLeads: agentLeads.length,
          verified,
          activated: agentActivated,
          target,
          achievement: target > 0 ? (agentActivated / target) * 100 : 0,
          sixMonthAverage
        };
      }));

      const totalTarget = agentMetrics.reduce((sum, agent) => sum + agent.target, 0);

      setTeamPerformanceData({
        teamId,
        teamName,
        managerName,
        totalLeads,
        activated,
        totalTarget,
        agentsCount: agents.length,
        agents: agentMetrics
      });
      
      // Store team leads for agent details
      setTeamLeadsForPerformance(teamLeads);
    } catch (error) {
      console.error('Error loading team performance:', error);
      toast.error('Failed to load team performance');
    } finally {
      setLoadingTeamPerformance(false);
    }
  };

  const handleAgentClick = async (agent: TeamPerformanceData['agents'][0], teamName: string) => {
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
        const month = subMonths(teamPerformanceMonth, i);
        const startDate = startOfMonth(month);
        const endDate = endOfMonth(month);

        // Get agent's leads for the month
        const agentLeads = teamLeadsForPerformance.filter(lead =>
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
      console.error('Error loading agent performance:', error);
      toast.error('Failed to load agent performance data');
    } finally {
      setIsLoadingAgentDetails(false);
    }
  };

  const handleTeamClick = (teamId: string) => {
    setSelectedTeamForPerformance(teamId);
    loadTeamPerformance(teamId);
  };

  const handleCloseTeamPerformance = () => {
    setSelectedTeamForPerformance(null);
    setTeamPerformanceData(null);
    setTeamLeadsForPerformance([]);
    setSelectedAgentDetails(null);
  };

  const sortedTeams = useMemo(() => {
    const metrics = view === 'daily' ? dailyMetrics : monthlyMetrics;
    if (!metrics) return [];
    
    return Object.entries(metrics.teamWise)
      .map(([teamId, data]) => ({ teamId, ...data }))
      .sort((a, b) => {
        // First sort by total descending, then by team name
        if (b.total !== a.total) return b.total - a.total;
        return a.teamName.localeCompare(b.teamName);
      });
  }, [dailyMetrics, monthlyMetrics, view]);

  if (loading && !dailyMetrics && !monthlyMetrics) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">Loading reports...</p>
        </div>
      </div>
    );
  }

  const renderTableView = () => {
    const metrics = view === 'daily' ? dailyMetrics : monthlyMetrics;
    if (!metrics) return null;

    return (
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-indigo-600 to-purple-600">
              <tr>
                <th rowSpan={2} className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider sticky left-0 bg-gradient-to-r from-indigo-600 to-purple-600 z-10 border-r border-indigo-400">
                  Team
                </th>
                <th rowSpan={2} className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-indigo-400">
                  Group
                </th>
                {CATEGORIES.map((category) => (
                  <th key={category} className="px-4 py-3 text-center text-xs font-medium text-white uppercase tracking-wider border-r border-indigo-400">
                    {category}
                  </th>
                ))}
                <th rowSpan={2} className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border-l-2 border-indigo-300">
                  Group Total
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedTeams.map((teamData, teamIdx) => {
                const teamGroups = teamData.groups;
                const hasData = teamData.total > 0;
                let isFirstGroupForTeam = true;
                
                return GROUPS.map((group, groupIdx) => {
                  const groupData = teamGroups[group] || { total: 0 };
                  const groupTotal = groupData.total || 0;
                  const groupColor = GROUP_COLORS[group];
                  const showTeamName = isFirstGroupForTeam;
                  if (isFirstGroupForTeam) isFirstGroupForTeam = false;
                  
                  return (
                    <motion.tr
                      key={`${teamData.teamId}-${group}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: (teamIdx * GROUPS.length + groupIdx) * 0.01 }}
                      className={`hover:bg-gray-50 transition-colors ${!hasData ? 'opacity-70' : ''} ${groupIdx === 0 ? 'border-t-2 border-gray-300' : ''}`}
                    >
                      {/* Team Name - only show on first row */}
                      {showTeamName && (
                        <td
                          rowSpan={GROUPS.length}
                          className="px-6 py-4 whitespace-nowrap sticky left-0 bg-white z-10 border-r border-gray-200 align-middle text-center"
                        >
                          <div 
                            onClick={() => handleTeamClick(teamData.teamId)}
                            className="flex flex-col items-center justify-center gap-1 cursor-pointer hover:bg-indigo-50 rounded-lg p-2 transition-colors group"
                          >
                            <div className={`w-3 h-3 rounded-full ${hasData ? 'bg-indigo-500' : 'bg-gray-300'}`} />
                            <div className="text-center">
                              <span className={`text-sm font-semibold group-hover:text-indigo-600 transition-colors ${hasData ? 'text-gray-900' : 'text-gray-500'}`}>
                                {teamData.teamName}
                              </span>
                              <div className="text-xs text-gray-500 mt-1">
                                Total: <span className={`font-bold ${hasData ? 'text-indigo-600' : 'text-gray-400'}`}>{teamData.total}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                      )}
                      
                      {/* Group */}
                      <td className={`px-4 py-4 whitespace-nowrap text-center border-r border-gray-200 font-semibold ${groupColor.text} ${groupColor.bg}`}>
                        <div className="flex items-center justify-center gap-1">
                          <span>{GROUP_NAMES[group] || group}</span>
                        </div>
                      </td>
                      
                      {/* Categories */}
                      {CATEGORIES.map((category) => {
                        const count = groupData[category] || 0;
                        const catColor = CATEGORY_COLORS[category] || CATEGORY_COLORS['Standard'];
                        const hasCount = count > 0;
                        
                        return (
                          <td
                            key={`${group}-${category}`}
                            className={`px-4 py-4 whitespace-nowrap text-center border-r border-gray-200 ${
                              hasCount ? catColor.bg : 'bg-gray-50'
                            }`}
                          >
                            <span className={`text-sm font-semibold ${hasCount ? catColor.text : 'text-gray-400'}`}>
                              {count}
                            </span>
                          </td>
                        );
                      })}
                      
                      {/* Group Total */}
                      <td className={`px-4 py-4 whitespace-nowrap text-center border-l-2 border-gray-300 font-bold ${groupColor.bg} ${groupColor.text}`}>
                        {groupTotal}
                      </td>
                    </motion.tr>
                  );
                });
              })}
            </tbody>
            {/* Summary Row */}
            <tfoot className="bg-gradient-to-r from-gray-50 to-gray-100 border-t-2 border-gray-300">
              {GROUPS.map((group, groupIdx) => {
                const groupColor = GROUP_COLORS[group];
                const groupTotal = sortedTeams.reduce((sum, team) => {
                  const groupData = team.groups[group] || { total: 0 };
                  return sum + (groupData.total || 0);
                }, 0);
                const categoryTotals = CATEGORIES.map(category => 
                  sortedTeams.reduce((sum, team) => {
                    const groupData = team.groups[group] || {};
                    return sum + (groupData[category] || 0);
                  }, 0)
                );
                
                return (
                  <tr key={group}>
                    {groupIdx === 0 && (
                      <td
                        rowSpan={GROUPS.length}
                        className="px-6 py-4 whitespace-nowrap sticky left-0 bg-gradient-to-r from-gray-50 to-gray-100 z-10 border-r border-gray-200 align-middle text-center"
                      >
                        <div className="flex flex-col items-center justify-center gap-1">
                          <span className="text-sm font-bold text-gray-900">TOTAL</span>
                          <div className="text-xs text-gray-600">
                            <span className="font-bold text-indigo-600">
                              {sortedTeams.reduce((sum, team) => sum + team.total, 0)}
                            </span>
                          </div>
                        </div>
                      </td>
                    )}
                    <td className={`px-4 py-4 whitespace-nowrap text-center border-r border-gray-200 font-semibold ${groupColor.text} ${groupColor.bg}`}>
                      <div className="flex items-center justify-center gap-1">
                        <span>{GROUP_NAMES[group] || group}</span>
                      </div>
                    </td>
                    {categoryTotals.map((total, catIdx) => (
                      <td key={`${group}-${CATEGORIES[catIdx]}-total`} className="px-4 py-4 whitespace-nowrap text-center border-r border-gray-200 bg-gray-100">
                        <span className="text-sm font-bold text-gray-700">{total}</span>
                      </td>
                    ))}
                    <td className={`px-4 py-4 whitespace-nowrap text-center border-l-2 border-gray-300 font-bold ${groupColor.bg} ${groupColor.text}`}>
                      {groupTotal}
                    </td>
                  </tr>
                );
              })}
            </tfoot>
          </table>
        </div>
      </div>
    );
  };

  const renderTeamCard = (teamData: TeamMetrics, index: number) => {
    const hasData = teamData.total > 0;

    return (
      <motion.div
        key={teamData.teamId}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden hover:shadow-2xl transition-all duration-300"
      >
        {/* Team Header */}
        <div 
          onClick={() => handleTeamClick(teamData.teamId)}
          className={`bg-gradient-to-r ${hasData ? 'from-indigo-600 to-purple-600' : 'from-gray-400 to-gray-500'} px-6 py-5 cursor-pointer hover:opacity-90 transition-opacity`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 ${hasData ? 'bg-white/20' : 'bg-white/10'} rounded-lg`}>
                <Users className={`h-6 w-6 ${hasData ? 'text-white' : 'text-gray-200'}`} />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white hover:underline">{teamData.teamName}</h3>
                <p className="text-sm text-white/90 mt-1">Team Performance Metrics - Click to view details</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-white">{teamData.total}</div>
              <div className="text-sm text-white/90">Total {view === 'daily' ? 'Leads' : 'Activated'}</div>
            </div>
          </div>
        </div>
        
        {/* Groups Grid */}
        <div className="p-6 space-y-6">
          <AnimatePresence>
            {GROUPS.map((group) => {
              const groupData = teamData.groups[group] || { total: 0 };
              const groupTotal = groupData.total || 0;
              const groupColor = GROUP_COLORS[group];

              return (
                <motion.div
                  key={group}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.05 + 0.1 }}
                  className={`border-2 ${groupColor.border} ${groupColor.bg} rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow`}
                >
                  {/* Group Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 ${groupColor.bg} ${groupColor.border} border rounded-lg`}>
                        <Hash className={`h-5 w-5 ${groupColor.text}`} />
                      </div>
                      <div>
                        <h4 className={`text-lg font-bold ${groupColor.text}`}>
                          {GROUP_NAMES[group] || group}
                        </h4>
                        <p className="text-xs text-gray-600 mt-0.5">Group Performance</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold ${groupColor.text}`}>{groupTotal}</div>
                      <div className="text-xs text-gray-600">Total</div>
                    </div>
                  </div>
                  
                  {/* Categories Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                    {CATEGORIES.map((category) => {
                      const count = groupData[category] || 0;
                      const catColor = CATEGORY_COLORS[category] || CATEGORY_COLORS['Standard'];
                      const hasCount = count > 0;

                      return (
                        <motion.div
                          key={`${group}-${category}`}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: index * 0.05 + 0.2 }}
                          className={`${hasCount ? catColor.bg : 'bg-gray-50'} ${catColor.border} border rounded-lg p-3 text-center transition-all hover:scale-105 hover:shadow-md ${
                            !hasCount ? 'opacity-60' : ''
                          }`}
                        >
                          <div className={`text-xs font-medium ${hasCount ? catColor.text : 'text-gray-400'} mb-1 truncate`}>
                            {category}
                          </div>
                          <div className={`text-xl font-bold ${hasCount ? catColor.text : 'text-gray-300'}`}>
                            {count}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-gray-100"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                  <BarChart3 className="h-8 w-8 text-white" />
                </div>
                Reports & Analytics
              </h1>
              <p className="text-gray-600 mt-2 text-lg">Comprehensive daily and monthly performance metrics</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Display Mode Toggle */}
              <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
                <button
                  onClick={() => setDisplayMode('cards')}
                  className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 ${
                    displayMode === 'cards'
                      ? 'bg-white text-indigo-600 shadow-md'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Card View"
                >
                  <Grid className="h-4 w-4" />
                  <span className="hidden sm:inline">Cards</span>
                </button>
                <button
                  onClick={() => setDisplayMode('table')}
                  className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 ${
                    displayMode === 'table'
                      ? 'bg-white text-indigo-600 shadow-md'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Table View"
                >
                  <Table className="h-4 w-4" />
                  <span className="hidden sm:inline">Table</span>
                </button>
              </div>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg hover:shadow-xl"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          {/* View Toggle */}
          <div className="mt-6 flex gap-2 bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setView('daily')}
              className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-all ${
                view === 'daily'
                  ? 'bg-white text-indigo-600 shadow-md'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Calendar className="h-4 w-4" />
                Daily Report
              </div>
            </button>
            <button
              onClick={() => setView('monthly')}
              className={`flex-1 px-6 py-3 rounded-lg font-semibold transition-all ${
                view === 'monthly'
                  ? 'bg-white text-indigo-600 shadow-md'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Monthly Report
              </div>
            </button>
          </div>

          {/* Date/Month Selector */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {view === 'daily' ? 'Select Date' : 'Select Month'}
            </label>
            {view === 'daily' ? (
              <input
                type="date"
                value={format(selectedDate, 'yyyy-MM-dd')}
                onChange={(e) => setSelectedDate(new Date(e.target.value))}
                className="px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-lg"
              />
            ) : (
              <input
                type="month"
                value={format(selectedMonth, 'yyyy-MM')}
                onChange={(e) => setSelectedMonth(new Date(e.target.value + '-01'))}
                className="px-4 py-2.5 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-lg"
              />
            )}
          </div>
        </motion.div>

        {/* Daily Report */}
        {view === 'daily' && dailyMetrics && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-6 text-white shadow-xl hover:shadow-2xl transition-shadow"
              >
                <div className="flex items-center justify-between mb-4">
                  <CheckCircle className="h-10 w-10 opacity-90" />
                  <Activity className="h-5 w-5 opacity-80" />
                </div>
                <div className="text-4xl font-bold mb-1">{dailyMetrics.verified}</div>
                <div className="text-sm opacity-90">Total Verified Leads</div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-6 text-white shadow-xl hover:shadow-2xl transition-shadow"
              >
                <div className="flex items-center justify-between mb-4">
                  <Clock className="h-10 w-10 opacity-90" />
                  <Activity className="h-5 w-5 opacity-80" />
                </div>
                <div className="text-4xl font-bold mb-1">{dailyMetrics.followup}</div>
                <div className="text-sm opacity-90">Total Follow-up Leads</div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-6 text-white shadow-xl hover:shadow-2xl transition-shadow"
              >
                <div className="flex items-center justify-between mb-4">
                  <Zap className="h-10 w-10 opacity-90" />
                  <Activity className="h-5 w-5 opacity-80" />
                </div>
                <div className="text-4xl font-bold mb-1">{dailyMetrics.activated}</div>
                <div className="text-sm opacity-90">Total Activated Leads</div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-6 text-white shadow-xl hover:shadow-2xl transition-shadow"
              >
                <div className="flex items-center justify-between mb-4">
                  <Target className="h-10 w-10 opacity-90" />
                  <Activity className="h-5 w-5 opacity-80" />
                </div>
                <div className="text-4xl font-bold mb-1">{dailyMetrics.assignedForActivation}</div>
                <div className="text-sm opacity-90">Assigned for Activation</div>
              </motion.div>
            </div>

            {/* Team-wise Data */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
              <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg">
                  <Users className="h-6 w-6 text-white" />
                </div>
                Team-wise Performance Breakdown
              </h2>
              {displayMode === 'table' ? (
                renderTableView()
              ) : (
                <div className="space-y-6">
                  {sortedTeams.length > 0 ? (
                    sortedTeams.map((team, index) => renderTeamCard(team, index))
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg">No team data available</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Monthly Report */}
        {view === 'monthly' && monthlyMetrics && (
          <div className="space-y-6">
            {/* Summary Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 rounded-2xl p-10 text-white shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <Activity className="h-8 w-8" />
                    <h2 className="text-3xl font-bold">Total Activated This Month</h2>
                  </div>
                  <p className="text-indigo-100 text-lg">{format(selectedMonth, 'MMMM yyyy')}</p>
                </div>
                <div className="text-right">
                  <div className="text-7xl font-bold">{monthlyMetrics.total}</div>
                  <div className="text-xl opacity-90 mt-2">Activated Leads</div>
                </div>
              </div>
            </motion.div>

            {/* Team-wise Data */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
              <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg">
                  <Users className="h-6 w-6 text-white" />
                </div>
                Team-wise Activation Breakdown
              </h2>
              {displayMode === 'table' ? (
                renderTableView()
              ) : (
                <div className="space-y-6">
                  {sortedTeams.length > 0 ? (
                    sortedTeams.map((team, index) => renderTeamCard(team, index))
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg">No team data available</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Team Performance Modal */}
        <AnimatePresence>
          {selectedTeamForPerformance && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
              onClick={handleCloseTeamPerformance}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              >
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleCloseTeamPerformance}
                      className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                    >
                      <ArrowLeft className="h-5 w-5 text-white" />
                    </button>
                    <div>
                      <h2 className="text-2xl font-bold text-white">Team Performance</h2>
                      {teamPerformanceData && (
                        <p className="text-sm text-indigo-100 mt-1">{teamPerformanceData.teamName}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-2">
                      <Calendar className="h-4 w-4 text-white" />
                      <input
                        type="month"
                        value={format(teamPerformanceMonth, 'yyyy-MM')}
                        onChange={(e) => {
                          setTeamPerformanceMonth(new Date(e.target.value + '-01'));
                          if (selectedTeamForPerformance) {
                            loadTeamPerformance(selectedTeamForPerformance);
                          }
                        }}
                        className="bg-transparent text-white text-sm border-none outline-none cursor-pointer"
                      />
                    </div>
                    <button
                      onClick={handleCloseTeamPerformance}
                      className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                    >
                      <X className="h-5 w-5 text-white" />
                    </button>
                  </div>
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {loadingTeamPerformance ? (
                    <div className="flex items-center justify-center py-12">
                      <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
                    </div>
                  ) : teamPerformanceData ? (
                    <div className="space-y-6">
                      {/* Summary Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
                          <h4 className="text-sm font-medium mb-1">Total Leads</h4>
                          <p className="text-2xl font-bold">{teamPerformanceData.totalLeads}</p>
                        </div>
                        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
                          <h4 className="text-sm font-medium mb-1">Activated</h4>
                          <p className="text-2xl font-bold">{teamPerformanceData.activated}</p>
                        </div>
                        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
                          <h4 className="text-sm font-medium mb-1">Total Target</h4>
                          <p className="text-2xl font-bold">{teamPerformanceData.totalTarget}</p>
                        </div>
                        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-4 text-white">
                          <h4 className="text-sm font-medium mb-1">Agents</h4>
                          <p className="text-2xl font-bold">{teamPerformanceData.agentsCount}</p>
                        </div>
                      </div>

                      {/* Team Info */}
                      <div className="bg-gray-50 rounded-xl p-4">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-indigo-100 rounded-lg">
                            <Users className="h-6 w-6 text-indigo-600" />
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Manager</p>
                            <p className="text-lg font-semibold text-gray-900">{teamPerformanceData.managerName}</p>
                          </div>
                        </div>
                      </div>

                      {/* Agent Performance Table */}
                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <h3 className="text-lg font-semibold text-gray-900 px-6 py-4 bg-gray-50 border-b border-gray-200">
                          Agent Performance
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Agent
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Target
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Activated
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Total Leads
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  6-Month Avg
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Achievement
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Status
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {teamPerformanceData.agents.map((agent) => {
                                const achievement = agent.achievement;
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

                                return (
                                  <tr key={agent.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div 
                                        onClick={() => handleAgentClick(agent, teamPerformanceData.teamName)}
                                        className="flex items-center cursor-pointer hover:opacity-80 transition-opacity"
                                      >
                                        <div className="flex-shrink-0 h-10 w-10">
                                          <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                                            <span className="text-indigo-600 font-medium">
                                              {agent.name.split(' ').map((n, i) => n[0]).join('')}
                                            </span>
                                          </div>
                                        </div>
                                        <div className="ml-4">
                                          <div className="text-sm font-medium text-gray-900 hover:text-indigo-600 transition-colors">{agent.name}</div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="text-sm text-gray-900">{agent.target}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="text-sm text-gray-900 font-semibold">{agent.activated}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="text-sm text-gray-900">{agent.totalLeads}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="text-sm text-gray-900 font-medium">{agent.sixMonthAverage}</div>
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
                                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusColor}`}>
                                        {statusText}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                              {teamPerformanceData.agents.length === 0 && (
                                <tr>
                                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                                    No agents found for this team
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <p>No team performance data available</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Agent Details Modal */}
        <AnimatePresence>
          {selectedAgentDetails && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4"
              onClick={() => setSelectedAgentDetails(null)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              >
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-white">{selectedAgentDetails.agent.name}</h2>
                    <p className="text-sm text-indigo-100 mt-1">{selectedAgentDetails.teamName}</p>
                  </div>
                  <button
                    onClick={() => setSelectedAgentDetails(null)}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X className="h-5 w-5 text-white" />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {isLoadingAgentDetails ? (
                    <div className="space-y-6">
                      {/* Skeleton loading */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[...Array(4)].map((_, index) => (
                          <div key={index} className="bg-gray-100 rounded-xl p-4 animate-pulse">
                            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                            <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                          </div>
                        ))}
                      </div>
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
                      {/* Summary Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
                          <h4 className="text-sm font-medium mb-1">Total Leads</h4>
                          <p className="text-2xl font-bold">
                            {selectedAgentDetails.performanceData.reduce((sum, d) => sum + d.totalLeads, 0)}
                          </p>
                        </div>
                        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
                          <h4 className="text-sm font-medium mb-1">Total Activated</h4>
                          <p className="text-2xl font-bold">
                            {selectedAgentDetails.performanceData.reduce((sum, d) => sum + d.activated, 0)}
                          </p>
                        </div>
                        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
                          <h4 className="text-sm font-medium mb-1">6-Month Average</h4>
                          <p className="text-2xl font-bold">
                            {selectedAgentDetails.performanceData.length > 0
                              ? (selectedAgentDetails.performanceData.reduce((sum, d) => sum + d.activated, 0) / selectedAgentDetails.performanceData.length).toFixed(1)
                              : '0'}
                          </p>
                        </div>
                        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-4 text-white">
                          <h4 className="text-sm font-medium mb-1">Average Achievement</h4>
                          <p className="text-2xl font-bold">
                            {selectedAgentDetails.performanceData.length > 0
                              ? (selectedAgentDetails.performanceData.reduce((sum, d) => sum + d.achievement, 0) / selectedAgentDetails.performanceData.length).toFixed(1)
                              : '0'}%
                          </p>
                        </div>
                      </div>

                      {/* Monthly Breakdown Table */}
                      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <h3 className="text-lg font-semibold text-gray-900 px-6 py-4 bg-gray-50 border-b border-gray-200">
                          Monthly Breakdown
                        </h3>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Month
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Target
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Activated
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Achievement
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {selectedAgentDetails.performanceData.map((data, index) => (
                                <tr key={index} className="hover:bg-gray-50">
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{data.month}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{data.target}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{data.activated}</td>
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
                              {selectedAgentDetails.performanceData.length === 0 && (
                                <tr>
                                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                                    No performance data available
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
