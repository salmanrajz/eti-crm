/**
 * ===============================================================================
 * TEAM PERFORMANCE COMPONENT - TEAM ANALYTICS DASHBOARD
 * ===============================================================================
 * 
 * This component provides comprehensive team performance analytics, displaying
 * individual team member metrics, achievements, and comparative analysis.
 * It enables managers and agents to track team dynamics and performance trends.
 * 
 * FEATURES:
 * 
 * 1. TEAM MEMBER PERFORMANCE TRACKING
 *    - Individual agent metrics and achievements
 *    - Target vs actual performance comparison
 *    - Performance categorization and status indicators
 * 
 * 2. COMPREHENSIVE METRICS ANALYSIS
 *    - Lead generation and conversion statistics
 *    - Category-wise performance breakdown (standard, silver, gold, platinum)
 *    - Monthly performance trends and historical data
 * 
 * 3. COMPARATIVE ANALYTICS
 *    - Team member ranking and comparison
 *    - Performance distribution and benchmarking
 *    - Achievement percentage and status tracking
 * 
 * 4. INTERACTIVE DASHBOARD
 *    - Month-based filtering and navigation
 *    - Real-time data updates and synchronization
 *    - Responsive design with smooth animations
 * 
 * 5. PERFORMANCE INSIGHTS
 *    - Status-based performance categorization
 *    - Visual indicators for performance levels
 *    - Historical trend analysis and reporting
 * 
 * USAGE:
 * This component is accessible to agents within teams to view team performance
 * and managers to analyze team dynamics and individual contributions.
 * ===============================================================================
 */

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { 
  Users, 
  TrendingUp, 
  Target, 
  Award, 
  Calendar,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  Trophy
} from 'lucide-react';
import { motion } from 'framer-motion';
import { User, Lead, Team } from '../../types';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { toast } from 'react-hot-toast';
import { clsx } from 'clsx';

interface TeamPerformanceProps {
  user: User;
}

interface TeamMemberPerformance {
  id: string;
  name: string;
  email: string;
  role: string;
  currentMonth: {
    target: number;
    totalLeads: number;
    verifiedLeads: number;
    activatedLeads: number;
    percentage: number;
    status: 'excellent' | 'good' | 'average' | 'below_average';
    categoryBreakdown: {
      standard: number;
      silver: number;
      gold: number;
      platinum: number;
    };
  };
}

export function TeamPerformance({ user }: TeamPerformanceProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<TeamMemberPerformance[]>([]);
  const [teamInfo, setTeamInfo] = useState<Team | null>(null);
  const [cacheKey, setCacheKey] = useState<string>('');
  const [isReloading, setIsReloading] = useState(false);

  // Get current month
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  
  const currentMonth = useMemo(() => {
    return selectedMonth;
  }, [selectedMonth]);

  useEffect(() => {
    if (!user?.teamId) {
      toast.error('You are not assigned to a team. Please contact your administrator.');
      navigate('/dashboard');
      return;
    }

    if (user?.role !== 'agent') {
      toast.error('Team Performance is only available for agents.');
      navigate('/dashboard');
      return;
    }

    // Generate cache key
    const newCacheKey = `team_performance_${user.teamId}_${selectedMonth}`;
    setCacheKey(newCacheKey);

    // Check cache first
    const cachedData = sessionStorage.getItem(newCacheKey);
    if (cachedData) {
      try {
        const parsedData = JSON.parse(cachedData);
        const cacheAge = Date.now() - parsedData.timestamp;
        const cacheValid = cacheAge < 5 * 60 * 60 * 1000; // 5 hours cache

        if (cacheValid) {
          setTeamMembers(parsedData.teamMembers);
          setTeamInfo(parsedData.teamInfo);
          setLoading(false);
          return;
        } else {
          sessionStorage.removeItem(newCacheKey);
        }
      } catch (error) {
        sessionStorage.removeItem(newCacheKey);
      }
    }

    loadTeamPerformance();
  }, [user.teamId, selectedMonth]);

  // Close month picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.month-picker-container')) {
        setShowMonthPicker(false);
      }
    };

    if (showMonthPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMonthPicker]);

  // Real-time updates for leads - temporarily disabled to fix infinite loop
  // useEffect(() => {
  //   if (!user?.teamId || !selectedMonth) return;
  //   // Real-time updates will be re-enabled once the infinite loop is fixed
  // }, [user?.teamId, selectedMonth, cacheKey, loading]);

  async function loadTeamPerformance() {
    try {
      setLoading(true);

      // Get team information
      const teamRef = doc(db, 'teams', user.teamId!);
      const teamDoc = await getDoc(teamRef);
      
      if (!teamDoc.exists()) {
        toast.error('Team not found');
        navigate('/dashboard');
        return;
      }

      const teamData = teamDoc.data() as Team;
      setTeamInfo(teamData);

      // Try to get team members with a simple query first
      let teamMembersData: User[] = [];
      
      try {
        const teamMembersQuery = query(
          collection(db, 'users'),
          where('teamId', '==', user.teamId)
        );

        const teamMembersSnapshot = await getDocs(teamMembersQuery);
        teamMembersData = teamMembersSnapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data()
          }))
          .filter((member: User) => member.role === 'agent') as User[];
      } catch (queryError) {
        
        // Fallback: try to get team members one by one if we know their IDs
        if (teamData.memberIds && Array.isArray(teamData.memberIds)) {
          const memberPromises = teamData.memberIds.map(async (memberId: string) => {
            try {
              const memberRef = doc(db, 'users', memberId);
              const memberDoc = await getDoc(memberRef);
              if (memberDoc.exists()) {
                return { id: memberDoc.id, ...memberDoc.data() } as User;
              }
            } catch (error) {
              // Silent error handling
            }
            return null;
          });
          
          const members = await Promise.all(memberPromises);
          teamMembersData = members.filter((member): member is User => 
            member !== null && ['agent', 'manager'].includes(member.role)
          );
        }
      }

      // Check if we have team members
      if (teamMembersData.length === 0) {
        toast.error('No team members found');
        setLoading(false);
        return;
      }

      // Load current month performance data for each team member
      const performancePromises = teamMembersData.map(async (member, memberIndex) => {
        
        let target = 0;
        let totalLeads = 0;
        let verifiedLeads = 0;
        let activatedLeads = 0;
        let categoryBreakdown = {
          standard: 0,
          silver: 0,
          gold: 0,
          platinum: 0
        };
        
        // Get target for current month
        try {
          const targetQuery = query(
            collection(db, 'agentTargets'),
            where('agentId', '==', member.id),
            where('month', '==', currentMonth),
            limit(1)
          );
          const targetSnapshot = await getDocs(targetQuery);
          target = targetSnapshot.empty ? 0 : targetSnapshot.docs[0].data().target || 0;
        } catch (targetError) {
          target = 0;
        }

        // Get all leads for selected month
        try {
          const startDate = startOfMonth(new Date(selectedMonth + '-01'));
          const endDate = endOfMonth(new Date(selectedMonth + '-01'));
          
          const leadsQuery = query(
            collection(db, 'leads'),
            where('agentId', '==', member.id),
            where('createdAt', '>=', startDate),
            where('createdAt', '<=', endDate)
          );
          
          const leadsSnapshot = await getDocs(leadsQuery);
                    totalLeads = leadsSnapshot.docs.length;
          
          // Count verified leads from created leads in this month
          leadsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.status === 'verified') {
              verifiedLeads++;
            }
          });
          
          // For activations, get ALL leads for this agent and filter by when they were activated
          const allLeadsQuery = query(
            collection(db, 'leads'),
            where('agentId', '==', member.id)
          );
          
          const allLeadsSnapshot = await getDocs(allLeadsQuery);
          
          // Count activated leads based on when they were actually activated (updatedAt)
          allLeadsSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.status === 'activated' && data.updatedAt && data.plans && data.plans.length > 0) {
              // Convert Firestore timestamp to Date for comparison
              const updatedAt = data.updatedAt.toDate ? data.updatedAt.toDate() : data.updatedAt;
              
              // Check if this lead was activated in the selected month
              if (updatedAt >= startDate && updatedAt <= endDate) {
                activatedLeads++;
                
                // Categorize activated plans
                data.plans.forEach((plan: any) => {
                  const planName = plan.plan?.toLowerCase() || '';
                  const planCategory = plan.category?.toLowerCase() || '';
                  
                  // First try to use the category field if available
                  if (planCategory) {
                    if (planCategory.includes('standard') || planCategory.includes('basic')) {
                      categoryBreakdown.standard++;
                    } else if (planCategory.includes('silver') || planCategory.includes('silver plus')) {
                      categoryBreakdown.silver++;
                    } else if (planCategory.includes('gold') || planCategory.includes('gold plus')) {
                      categoryBreakdown.gold++;
                    } else if (planCategory.includes('platinum') || planCategory.includes('premium')) {
                      categoryBreakdown.platinum++;
                    } else {
                      // If category doesn't match known categories, try plan name
                      if (planName.includes('standard') || planName.includes('basic') || planName.includes('freedom 250') || planName.includes('freedom 260') || planName.includes('freedom 325')) {
                        categoryBreakdown.standard++;
                      } else if (planName.includes('silver') || planName.includes('silver plus')) {
                        categoryBreakdown.silver++;
                      } else if (planName.includes('gold') || planName.includes('gold plus')) {
                        categoryBreakdown.gold++;
                      } else if (planName.includes('platinum') || planName.includes('premium') || planName.includes('emirati') || planName.includes('freedom 500')) {
                        categoryBreakdown.platinum++;
                      } else {
                        // Default to standard if no category found
                        categoryBreakdown.standard++;
                      }
                    }
                  } else {
                    // If no category field, use plan name
                    if (planName.includes('standard') || planName.includes('basic') || planName.includes('freedom 250') || planName.includes('freedom 260') || planName.includes('freedom 325')) {
                      categoryBreakdown.standard++;
                    } else if (planName.includes('silver') || planName.includes('silver plus')) {
                      categoryBreakdown.silver++;
                    } else if (planName.includes('gold') || planName.includes('gold plus')) {
                      categoryBreakdown.gold++;
                    } else if (planName.includes('platinum') || planName.includes('premium') || planName.includes('emirati') || planName.includes('freedom 500')) {
                      categoryBreakdown.platinum++;
                    } else {
                      // Default to standard if no category found
                      categoryBreakdown.standard++;
                    }
                  }
                });
              }
            }
          });
          
        } catch (leadsError) {
          totalLeads = 0;
          verifiedLeads = 0;
          activatedLeads = 0;
        }

        const percentage = target > 0 ? (activatedLeads / target) * 100 : 0;
        
        let status: 'excellent' | 'good' | 'average' | 'below_average';
        if (percentage >= 150) status = 'excellent';
        else if (percentage >= 120) status = 'good';
        else if (percentage >= 100) status = 'average';
        else status = 'below_average';

        return {
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.role,
          currentMonth: {
            target,
            totalLeads,
            verifiedLeads,
            activatedLeads,
            percentage,
            status,
            categoryBreakdown
          }
        };
      });

      const teamPerformance = await Promise.all(performancePromises);
      
      // Sort team members by total activations (top performers first)
      const sortedTeamPerformance = teamPerformance.sort((a, b) => {
        const aTotal = a.currentMonth.categoryBreakdown.standard + 
                      a.currentMonth.categoryBreakdown.silver + 
                      a.currentMonth.categoryBreakdown.gold + 
                      a.currentMonth.categoryBreakdown.platinum;
        const bTotal = b.currentMonth.categoryBreakdown.standard + 
                      b.currentMonth.categoryBreakdown.silver + 
                      b.currentMonth.categoryBreakdown.gold + 
                      b.currentMonth.categoryBreakdown.platinum;
        return bTotal - aTotal; // Sort in descending order (highest first)
      });
      
      setTeamMembers(sortedTeamPerformance);

      // Cache the results
      if (cacheKey) {
        const cacheData = {
          teamMembers: sortedTeamPerformance,
          teamInfo: teamData,
          timestamp: Date.now()
        };
        sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));
      }

    } catch (error: any) {
      // Handle specific permission errors
      if (error.code === 'permission-denied') {
        toast.error('You do not have permission to view team performance data');
        navigate('/dashboard');
        return;
      }
      
      // Handle other errors
      if (error.message?.includes('Missing or insufficient permissions')) {
        toast.error('Insufficient permissions to view team data. Please contact your administrator.');
        navigate('/dashboard');
        return;
      }
      
      toast.error('Failed to load team performance data');
    } finally {
      setLoading(false);
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'good':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'average':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'below_average':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'excellent':
        return <Award className="h-4 w-4" />;
      case 'good':
        return <TrendingUp className="h-4 w-4" />;
      case 'average':
        return <Target className="h-4 w-4" />;
      case 'below_average':
        return <Clock className="h-4 w-4" />;
      default:
        return <Users className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="relative"
          >
            <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto mb-6"></div>
            <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-blue-500 rounded-full mx-auto animate-pulse"></div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
          >
            <h2 className="text-xl font-bold text-gray-800 mb-2">Loading Team Performance</h2>
            <p className="text-gray-600 mb-1">Preparing your team's monthly insights...</p>
            <div className="flex items-center justify-center space-x-2 mt-4">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="w-2 h-2 bg-indigo-500 rounded-full"
              ></motion.div>
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                className="w-2 h-2 bg-blue-500 rounded-full"
              ></motion.div>
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                className="w-2 h-2 bg-purple-500 rounded-full"
              ></motion.div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">


      {/* Modern Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Button and Title */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-6">
            <button
              onClick={() => navigate('/dashboard')}
              className="group p-3 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all duration-200"
            >
              <ArrowLeft className="h-5 w-5 group-hover:scale-110 transition-transform" />
            </button>
            <h2 className="text-xl font-bold text-gray-900">
              Team Members Performance
            </h2>
          </div>
          <div className="relative month-picker-container">
            <button
              onClick={() => setShowMonthPicker(!showMonthPicker)}
              className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 cursor-pointer flex items-center space-x-2"
            >
              <span className="text-white font-semibold text-sm">
                {format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}
              </span>
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {showMonthPicker && (
              <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 z-50 min-w-[260px]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-bold text-gray-900">Select Month</h3>
                  <button
                    onClick={() => setShowMonthPicker(false)}
                    className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="space-y-3">
                  {/* Year Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          const currentYear = parseInt(selectedMonth.split('-')[0]);
                          const currentMonth = selectedMonth.split('-')[1];
                          setSelectedMonth(`${currentYear - 1}-${currentMonth}`);
                        }}
                        className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      
                      <input
                        type="number"
                        value={selectedMonth.split('-')[0]}
                        onChange={(e) => {
                          const year = e.target.value;
                          const currentMonth = selectedMonth.split('-')[1];
                          if (year.length === 4) {
                            setSelectedMonth(`${year}-${currentMonth}`);
                          }
                        }}
                        className="flex-1 px-3 py-2 text-center border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-medium"
                        placeholder="2025"
                        min="1900"
                        max="2100"
                      />
                      
                      <button
                        onClick={() => {
                          const currentYear = parseInt(selectedMonth.split('-')[0]);
                          const currentMonth = selectedMonth.split('-')[1];
                          setSelectedMonth(`${currentYear + 1}-${currentMonth}`);
                        }}
                        className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  
                  {/* Month Selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        'January', 'February', 'March',
                        'April', 'May', 'June',
                        'July', 'August', 'September',
                        'October', 'November', 'December'
                      ].map((month, index) => {
                        const monthNumber = String(index + 1).padStart(2, '0');
                        const currentYear = selectedMonth.split('-')[0];
                        const currentMonth = selectedMonth.split('-')[1];
                        const isSelected = currentMonth === monthNumber;
                        
                        // Check if this month is in the future
                        const currentDate = new Date();
                        const selectedDate = new Date(parseInt(currentYear), index, 1);
                        const isFutureMonth = selectedDate > currentDate;
                        
                        return (
                          <button
                            key={month}
                            onClick={() => {
                              if (!isFutureMonth) {
                                setSelectedMonth(`${currentYear}-${monthNumber}`);
                                setShowMonthPicker(false);
                              }
                            }}
                            disabled={isFutureMonth}
                            className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                              isSelected
                                ? 'bg-indigo-500 text-white shadow-lg'
                                : isFutureMonth
                                ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {month.slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  

                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Team Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-6 sm:mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="group bg-white/70 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl border border-white/20 p-3 sm:p-4 md:p-6 hover:shadow-xl sm:hover:shadow-2xl transition-all duration-300 hover:scale-105"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide">Team Members</p>
                <p className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mt-1 sm:mt-2">{teamMembers.length}</p>
              </div>
              <div className="p-2 sm:p-3 md:p-4 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-lg sm:rounded-xl group-hover:scale-110 transition-transform">
                <Users className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="group bg-white/70 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl border border-white/20 p-3 sm:p-4 md:p-6 hover:shadow-xl sm:hover:shadow-2xl transition-all duration-300 hover:scale-105"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide">Team Target</p>
                <p className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mt-1 sm:mt-2">
                  {teamMembers.reduce((sum, member) => sum + member.currentMonth.target, 0)}
                </p>
              </div>
              <div className="p-2 sm:p-3 md:p-4 bg-gradient-to-r from-emerald-500 to-green-600 rounded-lg sm:rounded-xl group-hover:scale-110 transition-transform">
                <Target className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="group bg-white/70 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl border border-white/20 p-3 sm:p-4 md:p-6 hover:shadow-xl sm:hover:shadow-2xl transition-all duration-300 hover:scale-105"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide">Team Activated</p>
                <p className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mt-1 sm:mt-2">
                  {teamMembers.reduce((sum, member) => sum + member.currentMonth.activatedLeads, 0)}
                </p>
              </div>
              <div className="p-2 sm:p-3 md:p-4 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-lg sm:rounded-xl group-hover:scale-110 transition-transform">
                <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="group bg-white/70 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-lg sm:shadow-xl border border-white/20 p-3 sm:p-4 md:p-6 hover:shadow-xl sm:hover:shadow-2xl transition-all duration-300 hover:scale-105"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wide">Team Achievement</p>
                <p className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mt-1 sm:mt-2">
                  {(() => {
                    const totalTarget = teamMembers.reduce((sum, member) => sum + member.currentMonth.target, 0);
                    const totalActivated = teamMembers.reduce((sum, member) => sum + member.currentMonth.activatedLeads, 0);
                    return totalTarget > 0 ? Math.round((totalActivated / totalTarget) * 100) : 0;
                  })()}%
                </p>
              </div>
              <div className="p-2 sm:p-3 md:p-4 bg-gradient-to-r from-amber-500 to-orange-600 rounded-lg sm:rounded-xl group-hover:scale-110 transition-transform">
                <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 md:h-8 md:w-8 text-white" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Team Members Performance Table */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 overflow-hidden">
          <div className="px-8 py-6 border-b border-white/20 bg-gradient-to-r from-gray-50 to-gray-100">
          </div>
          
          {/* Modern Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              {/* Table Header */}
              <thead className="bg-gradient-to-r from-indigo-50 to-purple-50">
                <tr className="border-b-2 border-indigo-200">
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                    Team Member
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                    Target
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                    Standard
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                    Silver
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                    Gold
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                    Platinum
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Total
                  </th>
                </tr>
              </thead>
              
              {/* Table Body */}
              <tbody className="divide-y divide-white/20">
                {teamMembers.map((member, index) => (
                  <motion.tr
                    key={member.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                                         className="group hover:bg-gradient-to-r hover:from-indigo-50/30 hover:to-purple-50/30 transition-all duration-300 border-b border-gray-200"
                  >
                                         {/* Member Info */}
                     <td className="px-6 py-4 border-r border-gray-200 border-b border-gray-200">
                      <div className="flex items-center space-x-4">
                        <div className="relative">
                          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                            {index < 3 ? (
                              <Trophy className="h-6 w-6 text-yellow-400" />
                            ) : (
                              <Users className="h-6 w-6 text-white" />
                            )}
                          </div>
                          <div className={clsx(
                            "absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center",
                            member.currentMonth.status === 'excellent' ? 'bg-emerald-500' :
                            member.currentMonth.status === 'good' ? 'bg-blue-500' :
                            member.currentMonth.status === 'average' ? 'bg-amber-500' :
                            'bg-red-500'
                          )}>
                            {getStatusIcon(member.currentMonth.status)}
                          </div>
                        </div>
                                                 <div>
                           <div className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
                             {member.name}
                             {index < 3 && (
                               <span className="ml-2 text-xs text-yellow-600 font-bold">
                                 #{index + 1}
                               </span>
                             )}
                           </div>
                         </div>
                      </div>
                                         </td>
                     
                     {/* Target */}
                     <td className="px-6 py-4 text-center border-r border-gray-200 border-b border-gray-200">
                       <div className="text-lg font-bold text-gray-900">{member.currentMonth.target}</div>
                     </td>
                     
                     {/* Standard */}
                     <td className="px-6 py-4 text-center border-r border-gray-200 border-b border-gray-200">
                       <div className="text-lg font-bold text-gray-600">{member.currentMonth.categoryBreakdown.standard}</div>
                     </td>
                     
                     {/* Silver */}
                     <td className="px-6 py-4 text-center border-r border-gray-200 border-b border-gray-200">
                       <div className="text-lg font-bold text-gray-500">{member.currentMonth.categoryBreakdown.silver}</div>
                     </td>
                     
                     {/* Gold */}
                     <td className="px-6 py-4 text-center border-r border-gray-200 border-b border-gray-200">
                       <div className="text-lg font-bold text-yellow-600">{member.currentMonth.categoryBreakdown.gold}</div>
                     </td>
                     
                                          {/* Platinum */}
                     <td className="px-6 py-4 text-center border-r border-gray-200 border-b border-gray-200">
                       <div className="text-lg font-bold text-purple-600">{member.currentMonth.categoryBreakdown.platinum}</div>
                     </td>
                     
                     {/* Total */}
                     <td className="px-6 py-4 text-center border-b border-gray-200">
                       <div className="text-lg font-bold text-gray-900">
                         {member.currentMonth.categoryBreakdown.standard + 
                          member.currentMonth.categoryBreakdown.silver + 
                          member.currentMonth.categoryBreakdown.gold + 
                          member.currentMonth.categoryBreakdown.platinum}
                       </div>
                     </td>
                  </motion.tr>
                                 ))}
                 
                 {/* Total Row */}
                 <motion.tr
                   initial={{ opacity: 0, y: 20 }}
                   animate={{ opacity: 1, y: 0 }}
                   transition={{ delay: (teamMembers.length + 1) * 0.05 }}
                   className="bg-gradient-to-r from-indigo-50 to-purple-50 border-t-2 border-indigo-200"
                 >
                   {/* Team Member */}
                   <td className="px-6 py-4 border-r border-gray-200">
                     <div className="flex items-center space-x-4">
                       <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl flex items-center justify-center shadow-lg">
                         <Users className="h-6 w-6 text-white" />
                       </div>
                       <div>
                         <div className="text-sm font-bold text-indigo-900">TEAM TOTAL</div>
                         <div className="text-xs text-indigo-600 font-medium">{teamMembers.length} Members</div>
                       </div>
                     </div>
                   </td>
                   
                   {/* Target */}
                   <td className="px-6 py-4 text-center border-r border-gray-200">
                     <div className="text-lg font-bold text-indigo-900">
                       {teamMembers.reduce((sum, member) => sum + member.currentMonth.target, 0)}
                     </div>
                   </td>
                   
                   {/* Standard */}
                   <td className="px-6 py-4 text-center border-r border-gray-200">
                     <div className="text-lg font-bold text-indigo-900">
                       {teamMembers.reduce((sum, member) => sum + member.currentMonth.categoryBreakdown.standard, 0)}
                     </div>
                   </td>
                   
                   {/* Silver */}
                   <td className="px-6 py-4 text-center border-r border-gray-200">
                     <div className="text-lg font-bold text-indigo-900">
                       {teamMembers.reduce((sum, member) => sum + member.currentMonth.categoryBreakdown.silver, 0)}
                     </div>
                   </td>
                   
                   {/* Gold */}
                   <td className="px-6 py-4 text-center border-r border-gray-200">
                     <div className="text-lg font-bold text-indigo-900">
                       {teamMembers.reduce((sum, member) => sum + member.currentMonth.categoryBreakdown.gold, 0)}
                     </div>
                   </td>
                   
                   {/* Platinum */}
                   <td className="px-6 py-4 text-center border-r border-gray-200">
                     <div className="text-lg font-bold text-indigo-900">
                       {teamMembers.reduce((sum, member) => sum + member.currentMonth.categoryBreakdown.platinum, 0)}
                     </div>
                   </td>
                   
                   {/* Total */}
                   <td className="px-6 py-4 text-center">
                     <div className="text-lg font-bold text-indigo-900">
                       {teamMembers.reduce((sum, member) => 
                         sum + member.currentMonth.categoryBreakdown.standard + 
                         member.currentMonth.categoryBreakdown.silver + 
                         member.currentMonth.categoryBreakdown.gold + 
                         member.currentMonth.categoryBreakdown.platinum, 0
                       )}
                     </div>
                   </td>
                 </motion.tr>
               </tbody>
             </table>
          </div>
        </div>
      </div>
    </div>
  );
}