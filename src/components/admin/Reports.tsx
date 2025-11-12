/**
 * ===============================================================================
 * REPORTS COMPONENT - DAILY & MONTHLY ANALYTICS
 * ===============================================================================
 * 
 * This component provides comprehensive reporting with daily and monthly metrics,
 * organized by groups and teams, with category-wise breakdowns. 
 * All groups come from Firestore data - no hardcoded groups.
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
import { collection, query, getDocs, where, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
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
  X,
  ArrowLeft,
  User2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

const CATEGORIES = ['Standard', 'Silver', 'Silver Plus', 'Gold', 'Gold Plus', 'Platinum'] as const;

// No hardcoded groups - all groups come from Firestore data

const CATEGORY_SHORT_NAMES: Record<string, string> = {
  'Standard': 'Std',
  'Silver': 'Sil',
  'Silver Plus': 'Sil+',
  'Gold': 'Gld',
  'Gold Plus': 'Gld+',
  'Platinum': 'Plat'
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

interface GroupStatusMetrics {
  [group: string]: {
    activated: number;
    verified: number;
    followup: number;
    nonVerified: number;
    assignedForActivation: number;
    pendingVerification: number;
    total: number;
  };
}

interface TeamMetrics {
  teamName: string;
  teamId: string;
  total: number;
  groups: GroupCategoryMetrics;
  groupStatus: GroupStatusMetrics;
}

interface DailyMetrics {
  verified: number;
  followup: number;
  activated: number;
  assignedForActivation: number;
  nonVerified: number;
  pendingVerification: number;
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

function normalizeGroup(group?: string): string {
  // Return the group as-is, or 'UNKNOWN' if not provided
  // No hardcoded defaults - groups come from Firestore data
  const g = (group || '').toUpperCase().trim();
  return g || 'UNKNOWN';
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
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [groupTargets, setGroupTargets] = useState<Record<string, number>>({});
  const [groupActivations, setGroupActivations] = useState<Record<string, number>>({});
  const [categoryTargets, setCategoryTargets] = useState<Record<string, number>>({});
  const [categoryActivations, setCategoryActivations] = useState<Record<string, number>>({});
  const [monthlyCategoryActivations, setMonthlyCategoryActivations] = useState<Record<string, number>>({});
  const [groupAliases, setGroupAliases] = useState<Record<string, string>>({});

  useEffect(() => {
    loadTeams();
  }, []);

  useEffect(() => {
    loadGroupAliases();
  }, []);

  useEffect(() => {
    if (teams.length > 0) {
      if (view === 'daily') {
        loadDailyMetrics(selectedDate);
        loadMonthlyCategoryActivations(selectedDate); // Load monthly category activations for daily report
      } else {
        loadMonthlyMetrics(selectedMonth);
        loadGroupTargets(selectedMonth);
      }
    }
    // Reset expanded group when switching views
    setExpandedGroup(null);
  }, [view, selectedDate, selectedMonth, teams]);

  const loadTeams = async () => {
    try {
      const teamsQuery = query(collection(db, 'teams'));
      const snapshot = await getDocs(teamsQuery);
      const teamsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Team[];
      
      // Sort teams with natural numeric sorting
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      teamsData.sort((a, b) => {
        const nameA = a.name || 'Unknown Team';
        const nameB = b.name || 'Unknown Team';
        return collator.compare(nameA, nameB);
      });
      
      setTeams(teamsData);
    } catch (error) {
      console.error('Error loading teams:', error);
      toast.error('Failed to load teams');
    }
  };

  // Helper function to get all groups that should be initialized
  // No hardcoded groups - only groups from Firestore data
  const getAllGroupsToInitialize = (): string[] => {
    const groupsSet = new Set<string>();
    
    // Only add groups from groupTargets (no hardcoded defaults)
    Object.keys(groupTargets).forEach(g => {
      if (g.toUpperCase() !== 'STANDARD') {
        groupsSet.add(g.toUpperCase());
      }
    });
    
    // Add groups from groupAliases
    Object.keys(groupAliases).forEach(g => {
      if (g.toUpperCase() !== 'STANDARD') {
        groupsSet.add(g.toUpperCase());
      }
    });
    
    return Array.from(groupsSet);
  };

  const initializeTeamMetrics = (teamId: string, teamName: string): TeamMetrics => {
    const groups: GroupCategoryMetrics = {};
    const groupStatus: GroupStatusMetrics = {};
    
    // Initialize all groups (including dynamically added ones)
    const groupsToInit = getAllGroupsToInitialize();
    groupsToInit.forEach(group => {
      groups[group] = {
        total: 0,
      };
      
      // Initialize all categories for each group
      CATEGORIES.forEach(category => {
        groups[group][category] = 0;
      });

      // Initialize group status metrics
      groupStatus[group] = {
        activated: 0,
        verified: 0,
        followup: 0,
        nonVerified: 0,
        assignedForActivation: 0,
        pendingVerification: 0,
        total: 0,
      };
    });

    return {
      teamId,
      teamName,
      total: 0,
      groups,
      groupStatus,
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
        nonVerified: 0,
        pendingVerification: 0,
        teamWise: {}
      };

      // Initialize all teams with empty metrics
      teams.forEach(team => {
        metrics.teamWise[team.id] = initializeTeamMetrics(team.id, team.name || 'Unknown Team');
      });

      // Process leads - match AdminDashboard logic
      filteredLeads.forEach(lead => {
        const plans = lead.plans || [];
        const teamId = lead.teamId || 'unknown';
        const team = teams.find(t => t.id === teamId);
        const status = lead.status;
        
        // Initialize team if not exists
        if (!metrics.teamWise[teamId]) {
          metrics.teamWise[teamId] = initializeTeamMetrics(
            teamId,
            team?.name || 'Unknown Team'
          );
        }

        // Count leads (not plans) for most statuses, but count plans for activated
        // Group-wise: distribute across groups based on plans
        if (status === 'activated') {
          // For activated: count plans (like AdminDashboard)
          const planCount = plans.length || 0;
          metrics.activated += planCount;
          metrics.teamWise[teamId].total += planCount;

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
            if (!metrics.teamWise[teamId].groupStatus[group]) {
              metrics.teamWise[teamId].groupStatus[group] = {
                activated: 0,
                verified: 0,
                followup: 0,
                nonVerified: 0,
                assignedForActivation: 0,
                pendingVerification: 0,
                total: 0,
              };
            }

            metrics.teamWise[teamId].groupStatus[group].activated++;
            metrics.teamWise[teamId].groups[group].total++;
            metrics.teamWise[teamId].groups[group][category]++;
            metrics.teamWise[teamId].groupStatus[group].total++;
          });
        } else {
          // For other statuses: count leads (1 per lead), but distribute across groups
          if (status === 'verified') {
            metrics.verified++;
          } else if (status === 'follow_verification') {
            metrics.followup++;
          } else if (status === 'assigned') {
            metrics.assignedForActivation++;
          } else if (status === 'activated_non_verified') {
            metrics.nonVerified++;
          } else if (status === 'pending_verification') {
            metrics.pendingVerification++;
          }

            metrics.teamWise[teamId].total++;

          // Distribute lead across groups based on plans
          if (plans.length > 0) {
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
              if (!metrics.teamWise[teamId].groupStatus[group]) {
                metrics.teamWise[teamId].groupStatus[group] = {
                  activated: 0,
                  verified: 0,
                  followup: 0,
                  nonVerified: 0,
                  assignedForActivation: 0,
                  pendingVerification: 0,
                  total: 0,
                };
              }

              // Count lead per group (distribute evenly or count once per group)
              // For simplicity, count 1 per group (if lead has multiple plans, it appears in multiple groups)
              if (status === 'verified') {
                metrics.teamWise[teamId].groupStatus[group].verified++;
              } else if (status === 'follow_verification') {
                metrics.teamWise[teamId].groupStatus[group].followup++;
              } else if (status === 'assigned') {
                metrics.teamWise[teamId].groupStatus[group].assignedForActivation++;
              } else if (status === 'activated_non_verified') {
                metrics.teamWise[teamId].groupStatus[group].nonVerified++;
              } else if (status === 'pending_verification') {
                metrics.teamWise[teamId].groupStatus[group].pendingVerification++;
              }

            metrics.teamWise[teamId].groups[group].total++;
            metrics.teamWise[teamId].groups[group][category]++;
              metrics.teamWise[teamId].groupStatus[group].total++;
        });
          } else {
            // If no plans, skip group assignment - no hardcoded default group
            // Groups must be explicitly defined in Firestore
          }
        }
      });

      setDailyMetrics(metrics);
    } catch (error) {
      console.error('Error loading daily metrics:', error);
      toast.error('Failed to load daily metrics');
    } finally {
      setLoading(false);
    }
  };

  const loadGroupAliases = async () => {
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
    } catch (error) {
      console.error('Error loading group aliases:', error);
      // No fallback - empty object if no data
      setGroupAliases({});
    }
  };

  const loadGroupTargets = async (month: Date) => {
    try {
      const monthId = format(month, 'yyyy-MM');
      const ref = doc(db, 'groupTargets', monthId);
      const snap = await getDoc(ref);
      
      const groups: Record<string, number> = {};
      
      if (snap.exists()) {
        const data: any = snap.data();
        if (data.groups && typeof data.groups === 'object') {
          Object.entries(data.groups).forEach(([k, v]: any) => {
            if (k) {
              groups[String(k).toUpperCase()] = Number(v || 0);
            }
          });
        }
      }
      
      setGroupTargets(groups);
      
      // Also check for category targets (like STANDARD)
      // Check if there's a categoryTargets collection or if STANDARD is stored in groupTargets
      const categoryTargetsData: Record<string, number> = {};
      if (snap.exists()) {
        const data: any = snap.data();
        // Check if categories are stored separately
        if (data.categories && typeof data.categories === 'object') {
          Object.entries(data.categories).forEach(([k, v]: any) => {
            if (k) {
              categoryTargetsData[String(k)] = Number(v || 0);
            }
          });
        }
        // Also check if STANDARD is in groups (some systems might store it there)
        if (data.groups && data.groups['STANDARD']) {
          categoryTargetsData['STANDARD'] = Number(data.groups['STANDARD'] || 0);
        }
      }
      
      setCategoryTargets(categoryTargetsData);
    } catch (error) {
      console.error('Error loading group targets:', error);
    }
  };

  const computeGroupActivations = (allLeads: Lead[], month: Date) => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const gCounts: Record<string, number> = {};
    const cCounts: Record<string, number> = {};
    
    const monthActivated = allLeads.filter(lead => {
      if (lead.status !== 'activated') return false;
      const updated = lead.updatedAt instanceof Date ? lead.updatedAt : new Date(lead.updatedAt);
      return updated >= start && updated <= end;
    });
    
    monthActivated.forEach(lead => {
      (lead.plans || []).forEach(plan => {
        const grp = normalizeGroup(plan.group);
        const cat = normalizeCategory(plan.category);
        
        // Count group activations
        gCounts[grp] = (gCounts[grp] || 0) + 1;
        
        // Count category activations
        cCounts[cat] = (cCounts[cat] || 0) + 1;
      });
    });
    
    setGroupActivations(gCounts);
    setCategoryActivations(cCounts);
  };

  const loadMonthlyCategoryActivations = async (date: Date) => {
    try {
      // Get the current month from the date
      const month = startOfMonth(date);
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      
      const leadsQuery = query(collection(db, 'leads'));
      const leadsSnapshot = await getDocs(leadsQuery);
      const allLeads = leadsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        updatedAt: doc.data().updatedAt?.toDate?.() || doc.data().updatedAt
      })) as Lead[];

      const categoryCounts: Record<string, number> = {};
      
      // Initialize all categories to 0
      CATEGORIES.forEach(cat => {
        categoryCounts[cat] = 0;
      });

      // Filter activated leads for the current month
      const monthActivated = allLeads.filter(lead => {
        if (lead.status !== 'activated') return false;
        const updated = lead.updatedAt instanceof Date ? lead.updatedAt : new Date(lead.updatedAt);
        return updated >= start && updated <= end;
      });

      // Count activations per category
      monthActivated.forEach(lead => {
        (lead.plans || []).forEach(plan => {
          const cat = normalizeCategory(plan.category);
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });
      });

      setMonthlyCategoryActivations(categoryCounts);
    } catch (error) {
      console.error('Error loading monthly category activations:', error);
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

      // Calculate group and category activations
      computeGroupActivations(allLeads, month);

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
    await loadGroupAliases(); // Reload aliases in case they were updated
    if (view === 'daily') {
      await loadDailyMetrics(selectedDate);
      await loadMonthlyCategoryActivations(selectedDate); // Reload monthly category activations
    } else {
      await loadMonthlyMetrics(selectedMonth);
      await loadGroupTargets(selectedMonth);
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
    
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    return Object.entries(metrics.teamWise)
      .map(([teamId, data]) => ({ teamId, ...data }))
      .sort((a, b) => {
        // First sort by total descending, then by team name with natural numeric sorting
        if (b.total !== a.total) return b.total - a.total;
        return collator.compare(a.teamName, b.teamName);
      });
  }, [dailyMetrics, monthlyMetrics, view]);

  // Get all available groups dynamically - only from Firestore data
  // IMPORTANT: This hook must be called before any early returns to maintain hook order
  // No hardcoded groups - all groups come from groupTargets and groupAliases
  const allAvailableGroups = useMemo(() => {
    const groupsSet = new Set<string>();
    
    // Only add groups from groupTargets (no hardcoded defaults)
    Object.keys(groupTargets).forEach(g => {
      if (g.toUpperCase() !== 'STANDARD') {
        groupsSet.add(g.toUpperCase());
      }
    });
    
    // Add groups from groupAliases
    Object.keys(groupAliases).forEach(g => {
      if (g.toUpperCase() !== 'STANDARD') {
        groupsSet.add(g.toUpperCase());
      }
    });
    
    // Sort naturally (G1, G2, G3, G4, G5, etc.)
    return Array.from(groupsSet).sort((a, b) => {
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      return collator.compare(a, b);
    });
  }, [groupTargets, groupAliases]);

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

    // Monthly view: Groups as columns, Teams as rows
    if (view === 'monthly') {
    return (
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-indigo-600 to-purple-600">
              <tr>
                  <th 
                    rowSpan={expandedGroup ? 2 : 1}
                    className="px-6 py-4 text-left text-xs font-bold text-white uppercase tracking-wider sticky left-0 bg-gradient-to-r from-indigo-600 to-purple-600 z-10 border-r border-indigo-400"
                  >
                  Team
                </th>
                  {allAvailableGroups.map((group) => {
                    const groupColor = GROUP_COLORS[group] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
                    const isExpanded = expandedGroup === group;
                    return (
                      <th
                        key={group}
                        colSpan={isExpanded ? CATEGORIES.length : 1}
                        className={`px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-indigo-400 cursor-pointer hover:bg-indigo-700 transition-colors ${isExpanded ? 'bg-indigo-700' : ''}`}
                        onClick={() => setExpandedGroup(isExpanded ? null : group)}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-2">
                            <span>{groupAliases[group] || group}</span>
                            <motion.div
                              animate={{ rotate: isExpanded ? 180 : 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </motion.div>
                          </div>
                          <div className="text-xs font-normal opacity-90">
                            {sortedTeams.reduce((sum, team) => {
                              const groupData = team.groups[group] || { total: 0 };
                              return sum + (groupData.total || 0);
                            }, 0)}
                          </div>
                        </div>
                </th>
                    );
                  })}
                  <th 
                    rowSpan={expandedGroup ? 2 : 1}
                    className="px-4 py-4 text-center text-xs font-bold text-white uppercase tracking-wider border-l-2 border-indigo-300"
                  >
                    Total
                  </th>
                </tr>
                {/* Category header row - only show when a group is expanded */}
                {expandedGroup && (
                  <tr className="bg-indigo-700">
                    {allAvailableGroups.map((group) => {
                      const isExpanded = expandedGroup === group;
                      if (isExpanded) {
                        // Show category labels for expanded group
                        return (
                          <React.Fragment key={group}>
                            {CATEGORIES.map((category, catIdx) => (
                              <th
                                key={`${group}-${category}`}
                                className="px-1 py-2 text-center border-r border-indigo-400 min-w-[50px]"
                                title={category}
                              >
                                <span className="px-1 py-0.5 bg-white/20 rounded text-[10px] font-medium text-white uppercase block whitespace-nowrap">
                                  {CATEGORY_SHORT_NAMES[category] || category}
                                </span>
                  </th>
                ))}
                          </React.Fragment>
                        );
                      } else {
                        // Regular header cell for non-expanded groups
                        return (
                          <th
                            key={group}
                            className="px-4 py-2 text-center text-xs font-medium text-white uppercase tracking-wider border-r border-indigo-400"
                          >
                            {/* Empty cell - group name already shown in row above */}
                </th>
                        );
                      }
                    })}
              </tr>
                )}
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedTeams.map((teamData, teamIdx) => {
                const hasData = teamData.total > 0;
                  return (
                    <React.Fragment key={teamData.teamId}>
                      {/* Main row with group totals */}
                    <motion.tr
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                        transition={{ delay: teamIdx * 0.01 }}
                        className={`hover:bg-gray-50 transition-colors ${!hasData ? 'opacity-70' : ''} border-t border-gray-200`}
                    >
                        {/* Team Name */}
                        <td className="px-4 py-2 whitespace-nowrap sticky left-0 bg-white z-10 border-r border-gray-200 align-middle">
                          <div 
                            onClick={() => handleTeamClick(teamData.teamId)}
                            className="flex flex-col items-start gap-0.5 cursor-pointer hover:bg-indigo-50 rounded-lg px-2 py-1 transition-colors group"
                          >
                            <div className="flex items-center gap-2">
                              <div className={`w-2.5 h-2.5 rounded-full ${hasData ? 'bg-indigo-500' : 'bg-gray-300'}`} />
                              <span className={`text-sm font-semibold group-hover:text-indigo-600 transition-colors ${hasData ? 'text-gray-900' : 'text-gray-500'}`}>
                                {teamData.teamName}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500">
                                Total: <span className={`font-bold ${hasData ? 'text-indigo-600' : 'text-gray-400'}`}>{teamData.total}</span>
                            </div>
                          </div>
                        </td>
                        
                        {/* Group columns */}
                        {allAvailableGroups.map((group) => {
                          const groupData = teamData.groups[group] || { total: 0 };
                          const groupTotal = groupData.total || 0;
                          const groupColor = GROUP_COLORS[group] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
                          const isExpanded = expandedGroup === group;
                          
                          if (isExpanded) {
                            // Show category breakdown - each category as its own td
                            return (
                              <React.Fragment key={group}>
                      {CATEGORIES.map((category) => {
                        const count = groupData[category] || 0;
                        const catColor = CATEGORY_COLORS[category] || CATEGORY_COLORS['Standard'];
                        const hasCount = count > 0;
                        return (
                          <td
                            key={`${group}-${category}`}
                                      className={`px-1 py-2 text-center border-r border-gray-200 min-w-[50px] ${
                              hasCount ? catColor.bg : 'bg-gray-50'
                            }`}
                                      title={`${category}: ${count}`}
                          >
                                      <span className={`text-xs font-semibold ${hasCount ? catColor.text : 'text-gray-400'}`}>
                              {count}
                            </span>
                          </td>
                        );
                      })}
                              </React.Fragment>
                            );
                          } else {
                            // Show group total
                            return (
                              <td
                                key={group}
                                className={`px-3 py-2 whitespace-nowrap text-center border-r border-gray-200 font-bold ${groupColor.bg} ${groupColor.text} cursor-pointer hover:opacity-80 transition-opacity`}
                                onClick={() => setExpandedGroup(group)}
                              >
                        {groupTotal}
                              </td>
                            );
                          }
                        })}
                        
                        {/* Team Total */}
                        <td className="px-3 py-2 whitespace-nowrap text-center border-l-2 border-gray-300 font-bold bg-gray-100 text-gray-900">
                          {teamData.total}
                      </td>
                    </motion.tr>
                    </React.Fragment>
                  );
              })}
            </tbody>
            {/* Summary Row */}
            <tfoot className="bg-gradient-to-r from-gray-50 to-gray-100 border-t-2 border-gray-300">
                <tr>
                  <td className="px-4 py-2 whitespace-nowrap sticky left-0 bg-gradient-to-r from-gray-50 to-gray-100 z-10 border-r border-gray-200 align-middle text-center">
                    <div className="flex flex-col items-center justify-center gap-0.5">
                      <span className="text-sm font-bold text-gray-900">TOTAL</span>
                      <div className="text-xs text-gray-600">
                        <span className="font-bold text-indigo-600">
                          {sortedTeams.reduce((sum, team) => sum + team.total, 0)}
                        </span>
                      </div>
                    </div>
                  </td>
                  {allAvailableGroups.map((group) => {
                    const groupColor = GROUP_COLORS[group] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
                const groupTotal = sortedTeams.reduce((sum, team) => {
                  const groupData = team.groups[group] || { total: 0 };
                  return sum + (groupData.total || 0);
                }, 0);
                    const isExpanded = expandedGroup === group;
                    
                    if (isExpanded) {
                      // Show category totals - each category as its own td
                const categoryTotals = CATEGORIES.map(category => 
                  sortedTeams.reduce((sum, team) => {
                    const groupData = team.groups[group] || {};
                    return sum + (groupData[category] || 0);
                  }, 0)
                );
                return (
                        <React.Fragment key={group}>
                    {categoryTotals.map((total, catIdx) => (
                            <td
                              key={`${group}-${CATEGORIES[catIdx]}-total`}
                              className="px-1 py-2 text-center border-r border-gray-200 bg-gray-100 min-w-[50px]"
                              title={`${CATEGORIES[catIdx]}: ${total}`}
                            >
                              <span className="text-xs font-bold text-gray-700">{total}</span>
                      </td>
                    ))}
                        </React.Fragment>
                      );
                    } else {
                      return (
                      <td
                        key={group}
                        className={`px-3 py-2 whitespace-nowrap text-center border-r border-gray-200 font-bold ${groupColor.bg} ${groupColor.text}`}
                      >
                      {groupTotal}
                    </td>
                );
                    }
              })}
                  <td className="px-3 py-2 whitespace-nowrap text-center border-l-2 border-gray-300 font-bold bg-gray-200 text-gray-900">
                    {sortedTeams.reduce((sum, team) => sum + team.total, 0)}
                  </td>
                </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
    }

    // Daily view: Show group-wise status counts (simple view)
    const STATUSES = [
      { key: 'activated', label: 'Activated', color: 'bg-green-50 text-green-700' },
      { key: 'verified', label: 'Verified', color: 'bg-blue-50 text-blue-700' },
      { key: 'followup', label: 'Follow-up', color: 'bg-amber-50 text-amber-700' },
      { key: 'nonVerified', label: 'Non-verified', color: 'bg-orange-50 text-orange-700' },
      { key: 'assignedForActivation', label: 'Assigned', color: 'bg-indigo-50 text-indigo-700' },
      { key: 'pendingVerification', label: 'Pending for verification', color: 'bg-yellow-50 text-yellow-700' },
    ];

    // Calculate group-wise totals across all teams
    // Note: For non-activated statuses, leads with multiple plans appear in multiple groups
    // So group totals may sum to more than actual totals
    const groupWiseTotals = allAvailableGroups.map(group => {
      const totals = STATUSES.map(status => 
        sortedTeams.reduce((sum, team) => {
          const groupStatusData = team.groupStatus?.[group] || {};
          return sum + (groupStatusData[status.key as keyof typeof groupStatusData] as number || 0);
        }, 0)
      );
      const groupTotal = totals.reduce((sum, val) => sum + val, 0);
      return { group, totals, total: groupTotal };
    });

    // Calculate actual totals (not sum of groups) to avoid double-counting
    // For activated: sum of plans
    // For others: count of unique leads
    const actualTotals = {
      activated: dailyMetrics.activated, // Already counts plans
      verified: dailyMetrics.verified, // Already counts leads
      followup: dailyMetrics.followup,
      nonVerified: dailyMetrics.nonVerified,
      assignedForActivation: dailyMetrics.assignedForActivation,
      pendingVerification: dailyMetrics.pendingVerification,
    };

    return (
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-indigo-600 to-purple-600">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider sticky left-0 bg-gradient-to-r from-indigo-600 to-purple-600 z-10 border-r border-indigo-400">
                  Group
                </th>
                {STATUSES.map((status) => (
                  <th
                    key={status.key}
                    className="px-3 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-indigo-400"
                    title={status.label}
                  >
                    {status.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {groupWiseTotals.map((groupData, groupIdx) => {
                const group = groupData.group;
                const groupColor = GROUP_COLORS[group] || GROUP_COLORS['G4'];
                const hasData = groupData.total > 0;

              return (
                  <motion.tr
                  key={group}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: groupIdx * 0.05 }}
                    className={`hover:bg-gray-50 transition-colors ${!hasData ? 'opacity-70' : ''} border-t border-gray-200`}
                >
                    {/* Group Name */}
                    <td className={`px-4 py-3 whitespace-nowrap sticky left-0 bg-white z-10 border-r border-gray-200 font-semibold ${groupColor.text} ${groupColor.bg}`}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{groupAliases[group] || group}</span>
                      </div>
                    </td>
                    
                    {/* Status Columns */}
                    {STATUSES.map((status) => {
                      const count = groupData.totals[STATUSES.indexOf(status)];
                      const hasCount = count > 0;
                      return (
                        <td
                          key={`${group}-${status.key}`}
                          className={`px-3 py-3 text-center border-r border-gray-200 ${
                            hasCount ? status.color : 'bg-gray-50'
                          }`}
                        >
                          <span className={`text-sm font-semibold ${hasCount ? '' : 'text-gray-400'}`}>
                            {count}
                          </span>
                        </td>
                      );
                    })}
                  </motion.tr>
              );
            })}
            </tbody>
            {/* Summary Row */}
            <tfoot className="bg-gradient-to-r from-gray-50 to-gray-100 border-t-2 border-gray-300">
              <tr>
                <td className="px-4 py-3 whitespace-nowrap sticky left-0 bg-gradient-to-r from-gray-50 to-gray-100 z-10 border-r border-gray-200 font-bold text-gray-900">
                  TOTAL
                </td>
                {STATUSES.map((status) => {
                  // Use actual totals to avoid double-counting leads that appear in multiple groups
                  const statusTotal = actualTotals[status.key as keyof typeof actualTotals] || 0;
                  return (
                    <td
                      key={`total-${status.key}`}
                      className="px-3 py-3 text-center border-r border-gray-200 bg-gray-100 font-bold text-gray-700"
                    >
                      {statusTotal}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
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
            <div className="flex items-center gap-3 flex-wrap">
              {/* Date/Month Selector */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                  {view === 'daily' ? 'Select Date:' : 'Select Month:'}
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
        </motion.div>

        {/* Daily Report */}
        {view === 'daily' && dailyMetrics && (
          <div className="space-y-6">
            {/* Group-wise Data */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
              <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg">
                  <Hash className="h-6 w-6 text-white" />
                </div>
                Group-wise Performance Breakdown
              </h2>
              {renderTableView()}
                </div>

            {/* Category-wise Activations (Monthly Data) */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
              <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg">
                  <Package className="h-6 w-6 text-white" />
                </div>
                Category-wise Activations ({format(startOfMonth(selectedDate), 'MMM yyyy')})
              </h2>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gradient-to-r from-indigo-600 to-purple-600">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider sticky left-0 bg-gradient-to-r from-indigo-600 to-purple-600 z-10 border-r border-indigo-400">
                        Category
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">
                        Activations
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {CATEGORIES.map((category) => {
                      const count = monthlyCategoryActivations[category] || 0;
                      const hasData = count > 0;
                      
                      return (
                        <motion.tr
                          key={`category-${category}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className={`hover:bg-gray-50 transition-colors ${!hasData ? 'opacity-70' : ''}`}
                        >
                          <td className="px-4 py-3 whitespace-nowrap sticky left-0 bg-white z-10 border-r border-gray-200 font-semibold text-gray-900 bg-gray-50">
                            {category}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <span className={`text-lg font-bold ${hasData ? 'text-gray-900' : 'text-gray-400'}`}>
                              {count}
                            </span>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gradient-to-r from-gray-50 to-gray-100 border-t-2 border-gray-300">
                    <tr>
                      <td className="px-4 py-3 whitespace-nowrap sticky left-0 bg-gradient-to-r from-gray-50 to-gray-100 z-10 border-r border-gray-200 font-bold text-gray-900">
                        TOTAL
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center font-bold text-gray-900">
                        {Object.values(monthlyCategoryActivations).reduce((sum, val) => sum + val, 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
                </div>
            </div>
          </div>
        )}

        {/* Monthly Report */}
        {view === 'monthly' && monthlyMetrics && (
          <div className="space-y-6">
            {/* Group Targets & Activations Table */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
              <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg">
                  <Target className="h-6 w-6 text-white" />
                </div>
                Group Targets & Activations ({format(selectedMonth, 'MMM yyyy')})
              </h2>
              
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gradient-to-r from-indigo-600 to-purple-600">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider sticky left-0 bg-gradient-to-r from-indigo-600 to-purple-600 z-10 border-r border-indigo-400">
                        Group/Category
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-indigo-400">
                        Target
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-indigo-400">
                        Achieved
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider border-r border-indigo-400">
                        Percentage
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-bold text-white uppercase tracking-wider">
                        Pending
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {/* Group rows */}
                    {allAvailableGroups.map((group) => {
                      const groupName = groupAliases[group] || group;
                      const target = groupTargets[group] || 0;
                      const achieved = groupActivations[group] || 0;
                      const percentage = target > 0 ? Math.min((achieved / target) * 100, 100) : 0;
                      const pending = Math.max(target - achieved, 0);
                      const groupColor = GROUP_COLORS[group] || { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
                      const hasData = target > 0 || achieved > 0;
                      
                      return (
                        <motion.tr
                          key={`group-${group}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className={`hover:bg-gray-50 transition-colors ${!hasData ? 'opacity-70' : ''}`}
                        >
                          <td className={`px-4 py-3 whitespace-nowrap sticky left-0 bg-white z-10 border-r border-gray-200 font-semibold ${groupColor.text} ${groupColor.bg}`}>
                            {groupName}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center border-r border-gray-200">
                            <span className="text-sm font-semibold text-gray-900">{target}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center border-r border-gray-200">
                            <span className="text-sm font-semibold text-gray-900">{achieved}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center border-r border-gray-200">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-24 bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full transition-all ${
                                    percentage >= 100 ? 'bg-green-500' :
                                    percentage >= 80 ? 'bg-blue-500' :
                                    percentage >= 60 ? 'bg-amber-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${Math.min(percentage, 100)}%` }}
                                />
                    </div>
                              <span className={`text-sm font-semibold ${
                                percentage >= 100 ? 'text-green-700' :
                                percentage >= 80 ? 'text-blue-700' :
                                percentage >= 60 ? 'text-amber-700' : 'text-red-700'
                              }`}>
                                {percentage.toFixed(1)}%
                              </span>
                </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <span className={`text-sm font-semibold ${pending > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                              {pending}
                            </span>
                          </td>
                        </motion.tr>
                      );
                    })}

                    {/* Category rows (STANDARD, etc.) */}
                    {Object.keys(categoryTargets).sort().map((category) => {
                      const target = categoryTargets[category] || 0;
                      const achieved = categoryActivations[category] || 0;
                      const percentage = target > 0 ? Math.min((achieved / target) * 100, 100) : 0;
                      const pending = Math.max(target - achieved, 0);
                      const catColor = CATEGORY_COLORS[category] || CATEGORY_COLORS['Standard'];
                      const hasData = target > 0 || achieved > 0;
                      
                      return (
                        <motion.tr
                          key={`category-${category}`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className={`hover:bg-gray-50 transition-colors ${!hasData ? 'opacity-70' : ''}`}
                        >
                          <td className={`px-4 py-3 whitespace-nowrap sticky left-0 bg-white z-10 border-r border-gray-200 font-semibold ${catColor.text} ${catColor.bg}`}>
                            {category.toUpperCase()} Activation
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center border-r border-gray-200">
                            <span className="text-sm font-semibold text-gray-900">{target}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center border-r border-gray-200">
                            <span className="text-sm font-semibold text-gray-900">{achieved}</span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center border-r border-gray-200">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-24 bg-gray-200 rounded-full h-2">
                                <div
                                  className={`h-2 rounded-full transition-all ${
                                    percentage >= 100 ? 'bg-green-500' :
                                    percentage >= 80 ? 'bg-blue-500' :
                                    percentage >= 60 ? 'bg-amber-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${Math.min(percentage, 100)}%` }}
                                />
                  </div>
                              <span className={`text-sm font-semibold ${
                                percentage >= 100 ? 'text-green-700' :
                                percentage >= 80 ? 'text-blue-700' :
                                percentage >= 60 ? 'text-amber-700' : 'text-red-700'
                              }`}>
                                {percentage.toFixed(1)}%
                              </span>
                </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            <span className={`text-sm font-semibold ${pending > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                              {pending}
                            </span>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>

            {/* Team-wise Data */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
              <h2 className="text-3xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg">
                  <Users className="h-6 w-6 text-white" />
                </div>
                Team-wise Activation Breakdown
              </h2>
              {renderTableView()}
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
