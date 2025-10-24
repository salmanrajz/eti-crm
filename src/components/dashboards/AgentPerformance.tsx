/**
 * ===============================================================================
 * AGENT PERFORMANCE COMPONENT - INDIVIDUAL PERFORMANCE ANALYTICS
 * ===============================================================================
 * 
 * This component provides comprehensive individual agent performance analytics,
 * including historical trends, target tracking, and detailed performance metrics.
 * It enables agents and managers to analyze performance patterns and achievements.
 * 
 * FEATURES:
 * 
 * 1. PERFORMANCE TREND ANALYSIS
 *    - Historical performance data with interactive charts
 *    - Monthly and daily performance tracking
 *    - Trend visualization with line charts and analytics
 * 
 * 2. TARGET MANAGEMENT
 *    - Current month target setting and tracking
 *    - Achievement percentage calculations and visual indicators
 *    - Performance status categorization (excellent, good, average, below average)
 * 
 * 3. COMPREHENSIVE METRICS
 *    - Lead generation and conversion statistics
 *    - Verification and activation rates
 *    - Performance breakdown by time periods
 * 
 * 4. INTERACTIVE DASHBOARD
 *    - Calendar-based performance analysis
 *    - Monthly navigation and data filtering
 *    - Responsive charts and visual indicators
 * 
 * 5. INTEGRATED TOOLS
 *    - Attendance tracking integration
 *    - Leave application management
 *    - Commission performance analytics
 * 
 * USAGE:
 * This component is used by agents to track their individual performance
 * and by managers to analyze agent achievements and provide guidance.
 * ===============================================================================
 */

import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { collection, query, where, getDocs, doc, getDoc, setDoc, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { format, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths } from 'date-fns';
import { 
  Target, 
  TrendingUp, 
  Award, 
  Calendar, 
  ChevronLeft, 
  ChevronRight,
  BarChart3,
  LineChart,
  DollarSign,
  Trophy,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Zap
} from 'lucide-react';
import { motion } from 'framer-motion';
import { User, Lead, Team } from '../../types';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Calendar as CalendarComponent } from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { toast } from 'react-hot-toast';
import AttendanceTable from '../AttendanceTable';
import LeaveApplicationModal from '../LeaveApplicationModal';
import { CommissionPerformance } from './CommissionPerformance';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface AgentPerformanceProps {
  user: User;
}

interface PerformanceData {
  month: string;
  target: number;
  achieved: number;
  bonus: number;
  superBonus: number;
}

interface BonusAmounts {
  targetAchievement: number;
  risingStar: number;
  superAchiever: number;
  elitePerformer: number;
  masterAchiever: number;
  legendaryStatus: number;
}

interface DailyPerformance {
  date: Date;
  verified: number;
  activated: number;
}

export const AgentPerformance = memo(function AgentPerformance({ user }: AgentPerformanceProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isCommissionTeam, setIsCommissionTeam] = useState(false);
  const [teamLoading, setTeamLoading] = useState(true);
  const [performanceData, setPerformanceData] = useState<PerformanceData[]>([]);
  const [currentMonthData, setCurrentMonthData] = useState<PerformanceData | null>(null);
  const [projection, setProjection] = useState<number>(0);
  const [bonusAmounts, setBonusAmounts] = useState<BonusAmounts>({
    targetAchievement: 1000,
    risingStar: 2000,
    superAchiever: 2500,
    elitePerformer: 3500,
    masterAchiever: 5000,
    legendaryStatus: 10000
  });
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dailyPerformance, setDailyPerformance] = useState<DailyPerformance[]>([]);
  const [selectedDayPerformance, setSelectedDayPerformance] = useState<DailyPerformance | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [showAttendance, setShowAttendance] = useState(false);
  const [showLeaveApplication, setShowLeaveApplication] = useState(false);

  async function createDefaultTarget(monthStr: string) {
    try {
      const targetRef = doc(db, 'agentTargets', `${user.id}_${monthStr}`);
      await setDoc(targetRef, {
        agentId: user.id,
        month: monthStr,
        target: 10, // Default target of 10 activations per month
        createdAt: new Date(),
        updatedAt: new Date()
      });
      return 10;
    } catch (error) {
      console.error('Error creating default target:', error);
      return 0;
    }
  }

  async function loadBonusAmounts() {
    try {
      if (!user?.teamId) {
        console.error('No team ID available');
        return;
      }
      const bonusRef = doc(db, 'teamSettings', user.teamId);
      const bonusDoc = await getDoc(bonusRef);
      
      if (bonusDoc.exists()) {
        const data = bonusDoc.data();
        setBonusAmounts({
          targetAchievement: data.targetAchievement || 1000,
          risingStar: data.risingStar || 2000,
          superAchiever: data.superAchiever || 2500,
          elitePerformer: data.elitePerformer || 3500,
          masterAchiever: data.masterAchiever || 5000,
          legendaryStatus: data.legendaryStatus || 10000
        });
      }
    } catch (error) {
      console.error('Error loading bonus amounts:', error);
    }
  }

  async function loadDailyPerformance() {
    try {
      if (!user?.id) return;

      const startOfSelectedMonth = startOfMonth(selectedMonth);
      const endOfSelectedMonth = endOfMonth(selectedMonth);

      // Get all days in the selected month
      const days = eachDayOfInterval({ start: startOfSelectedMonth, end: endOfSelectedMonth });

      // Query for agent's leads in the selected month
      const leadsQuery = query(
        collection(db, 'leads'),
        where('agentId', '==', user.id),
        where('status', 'in', ['verified', 'activated']),
        where('updatedAt', '>=', startOfSelectedMonth),
        where('updatedAt', '<=', endOfSelectedMonth)
      );
      
      const leadsSnapshot = await getDocs(leadsQuery);
      const leads = leadsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Lead[];

      // Create a map for faster lookups
      const leadsByDate = new Map(
        days.map(date => [
          format(date, 'yyyy-MM-dd'),
          leads.filter(lead => isSameDay(lead.updatedAt, date))
        ])
      );

      // Calculate performance for each day
      const dailyData = days.map(date => {
        const dayLeads = leadsByDate.get(format(date, 'yyyy-MM-dd')) || [];

        const verifiedCount = dayLeads.filter(lead => 
          lead.status === 'verified' || lead.status === 'activated'
        ).length;

        const activatedCount = dayLeads.filter(lead => 
          lead.status === 'activated'
        ).length;

        return {
          date,
          verified: verifiedCount,
          activated: activatedCount
        };
      });

      setDailyPerformance(dailyData);
    } catch (error) {
      console.error('Error loading daily performance:', error);
      toast.error('Failed to load daily performance data');
    }
  }

  const handleDateClick = useCallback((date: Date) => {
    setSelectedDate(date);
    const performance = dailyPerformance.find(p => isSameDay(p.date, date));
    setSelectedDayPerformance(performance || null);
  }, [dailyPerformance]);

  // const handleMonthChange = useCallback((date: Date) => {
  //   setSelectedMonth(date);
  // }, []);

  const calculateProjection = useCallback((currentData: PerformanceData | null) => {
    if (!currentData) return 0;
    const currentDate = new Date();
    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const daysPassed = currentDate.getDate();
    const dailyRate = currentData.achieved / daysPassed;
    return Math.round(dailyRate * daysInMonth);
  }, []);

  useEffect(() => {
    loadPerformanceData();
    loadBonusAmounts();
    loadDailyPerformance();
  }, [user, selectedMonth]);

  useEffect(() => {
    if (currentMonthData) {
      const projectedAchievement = calculateProjection(currentMonthData);
      setProjection(projectedAchievement);
    }
  }, [currentMonthData, calculateProjection]);

  async function loadPerformanceData() {
    try {
      setLoading(true);
      const currentDate = new Date();
      
      // Set the start date to April 2025
      const startDate = new Date(2025, 3, 1); // April 2025 (month is 0-based, so 3 = April)
      
      // Calculate the last 6 months from the current date, but not before April 2025
      const last6Months = Array.from({ length: 6 }, (_, i) => {
        const date = subMonths(currentDate, i);
        return date < startDate ? null : date;
      }).filter((date): date is Date => date !== null);
      
      // Load targets for the last 6 months using same schema as main dashboard (agentId + month)
      const targets = new Map<string, number>();
      for (const date of last6Months) {
        const monthStr = format(date, 'yyyy-MM');

        // Try query by fields (matches AgentDashboard)
        const q = query(
          collection(db, 'agentTargets'),
          where('agentId', '==', user.id),
          where('month', '==', monthStr),
          limit(1)
        );
        const snap = await getDocs(q);

        if (!snap.empty) {
          const data = snap.docs[0].data();
          targets.set(monthStr, data?.target || 0);
          continue;
        }

        // Fallback: try doc id pattern `${user.id}_${month}` if present
        const targetRef = doc(db, 'agentTargets', `${user.id}_${monthStr}`);
        const targetDoc = await getDoc(targetRef);
        if (targetDoc.exists()) {
          targets.set(monthStr, targetDoc.data().target || 0);
          continue;
        }

        // If current month missing entirely, create default (and include agentId/month fields)
        const isCurrentMonth = date.getMonth() === currentDate.getMonth() && date.getFullYear() === currentDate.getFullYear();
        const defaultTarget = isCurrentMonth ? await createDefaultTarget(monthStr) : 0;
        targets.set(monthStr, defaultTarget);
      }

      // Load all leads for the last 6 months in a single query
      const startOfRange = startOfMonth(last6Months[last6Months.length - 1]);
      const endOfRange = endOfMonth(last6Months[0]);
        
        const leadsQuery = query(
          collection(db, 'leads'),
          where('agentId', '==', user.id),
          where('status', '==', 'activated'),
        where('updatedAt', '>=', startOfRange),
        where('updatedAt', '<=', endOfRange)
        );
        
        const leadsSnapshot = await getDocs(leadsQuery);
      const leads = leadsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Lead[];

      const performanceData: PerformanceData[] = [];

      for (const date of last6Months) {
        const monthStr = format(date, 'yyyy-MM');
        const target = targets.get(monthStr) || 0;
        
        // Filter leads for this month
        const monthLeads = leads.filter(lead => 
          lead.updatedAt && 
          lead.updatedAt >= startOfMonth(date) && 
          lead.updatedAt <= endOfMonth(date)
        );

        const achieved = monthLeads.reduce((sum, lead) => sum + (lead.plans?.length || 0), 0);
        const achievementPercentage = target > 0 ? (achieved / target) * 100 : 0;

        let bonus = 0;
        let superBonus = 0;

        if (achievementPercentage >= 250) {
          bonus = bonusAmounts.legendaryStatus;
        } else if (achievementPercentage >= 200) {
          bonus = bonusAmounts.masterAchiever;
        } else if (achievementPercentage >= 170) {
          bonus = bonusAmounts.elitePerformer;
        } else if (achievementPercentage >= 150) {
          bonus = bonusAmounts.superAchiever;
        } else if (achievementPercentage >= 130) {
          bonus = bonusAmounts.risingStar;
        } else if (achievementPercentage >= 100) {
          bonus = bonusAmounts.targetAchievement;
        }

        const monthData = {
          month: format(date, 'MMM yyyy'),
          target,
          achieved,
          bonus,
          superBonus
        };

        performanceData.push(monthData);

        if (date.getMonth() === currentDate.getMonth() && 
            date.getFullYear() === currentDate.getFullYear()) {
          setCurrentMonthData(monthData);
        }
      }

      // Sort performance data by date (newest first)
      performanceData.sort((a, b) => {
        const dateA = new Date(a.month);
        const dateB = new Date(b.month);
        return dateB.getTime() - dateA.getTime();
      });

      setPerformanceData(performanceData);

    } catch (error) {
      console.error('Error loading performance data:', error);
    } finally {
      setLoading(false);
    }
  }

  const chartData = useMemo(() => ({
    labels: performanceData.map(data => data.month),
    datasets: [
      {
        label: 'Target',
        data: performanceData.map(data => data.target),
        borderColor: 'rgb(99, 102, 241)',
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
        fill: true,
        tension: 0.4,
      },
      {
        label: 'Achieved',
        data: performanceData.map(data => data.achieved),
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        fill: true,
        tension: 0.4,
      }
    ],
  }), [performanceData]);

  const chartOptions = useMemo(() => ({
    responsive: true,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        titleColor: '#1f2937',
        bodyColor: '#1f2937',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        padding: 12,
        boxPadding: 6,
        usePointStyle: true,
        callbacks: {
          label: function(context: any) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              label += context.parsed.y;
            }
            return label;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.1)',
        },
      },
      x: {
        grid: {
          display: false,
        },
      },
    },
  }), []);

  // Check if user's team is commission-based
  useEffect(() => {
    async function checkCommissionTeam() {
      if (!user.teamId) {
        setTeamLoading(false);
        return;
      }
      
      try {
        const teamRef = doc(db, 'teams', user.teamId);
        const teamDoc = await getDoc(teamRef);
        
        if (teamDoc.exists()) {
          const teamData = teamDoc.data() as Team;
          setIsCommissionTeam(teamData.commissionBased || false);
        }
      } catch (error) {
        console.error('Error checking commission team:', error);
      } finally {
        setTeamLoading(false);
      }
    }
    
    checkCommissionTeam();
  }, [user.teamId]);

  // If team is commission-based, show CommissionPerformance
  if (teamLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (isCommissionTeam) {
    return <CommissionPerformance user={user} />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="p-2 hover:bg-white rounded-lg transition-colors duration-200"
                >
                  <ArrowLeft className="h-6 w-6 text-indigo-600" />
                </button>
                <div>
                  <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
                    Performance Dashboard
                  </h1>
                  <p className="mt-2 text-lg text-gray-600">
                    Track your performance and earnings
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <button
                onClick={() => setShowCalendar(!showCalendar)}
                className="flex items-center space-x-2 text-sm text-gray-600 bg-white px-4 py-2 rounded-xl shadow-sm hover:shadow-md transition-all duration-200"
              >
                <Calendar className="h-5 w-5 text-indigo-500" />
                <span>Daily Performance</span>
              </button>
            </div>
          </div>
        </motion.div>

        {/* Move buttons to the top */}
        <div className="flex items-center gap-2 sm:gap-4 mb-8">
          <button
            onClick={() => setShowAttendance(true)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg text-sm font-medium shadow hover:shadow-lg transition-colors duration-200"
          >
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">My</span> Attendance
          </button>
          <button
            onClick={() => setShowLeaveApplication(true)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-lg text-sm font-medium shadow hover:shadow-lg transition-colors duration-200"
          >
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Apply for</span> Leave
          </button>
        </div>

        {/* Calendar Modal */}
        {showCalendar && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowCalendar(false);
              }
            }}
          >
            <div className="bg-gradient-to-br from-white to-gray-50 rounded-3xl shadow-2xl p-8 max-w-5xl w-full mx-4">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
                    Performance Calendar
                  </h2>
                  <p className="text-gray-500 mt-1">Track your daily achievements</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 bg-white rounded-xl shadow-sm p-2">
                    <button
                      onClick={() => setSelectedMonth(prev => subMonths(prev, 1))}
                      className="p-2 hover:bg-indigo-50 rounded-lg transition-all duration-200 group"
                    >
                      <ChevronLeft className="h-5 w-5 text-indigo-600 group-hover:scale-110 transition-transform" />
                    </button>
                    <h3 className="text-lg font-semibold text-gray-900 min-w-[140px] text-center">
                      {format(selectedMonth, 'MMMM yyyy')}
                    </h3>
                    <button
                      onClick={() => setSelectedMonth(prev => addMonths(prev, 1))}
                      className="p-2 hover:bg-indigo-50 rounded-lg transition-all duration-200 group"
                    >
                      <ChevronRight className="h-5 w-5 text-indigo-600 group-hover:scale-110 transition-transform" />
                    </button>
                  </div>
                  <button
                    onClick={() => setShowCalendar(false)}
                    className="p-2 hover:bg-gray-100 rounded-xl transition-all duration-200"
                  >
                    <XCircle className="h-6 w-6 text-gray-500" />
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                  <div className="bg-white rounded-2xl shadow-lg p-6">
                    <CalendarComponent
                      onChange={(value: any) => {
                        if (value instanceof Date) {
                          handleDateClick(value);
                        }
                      }}
                      value={selectedDate}
                      className="w-full border-none"
                      tileClassName={({ date }: { date: Date }) => {
                        const performance = dailyPerformance.find(p => isSameDay(p.date, date));
                        if (!performance) return 'hover:bg-gray-50 rounded-lg transition-colors';
                        if (performance.activated > 0) return 'bg-gradient-to-br from-green-50 to-emerald-50 text-green-800 hover:from-green-100 hover:to-emerald-100 rounded-lg transition-all duration-200';
                        if (performance.verified > 0) return 'bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-800 hover:from-blue-100 hover:to-indigo-100 rounded-lg transition-all duration-200';
                        return 'hover:bg-gray-50 rounded-lg transition-colors';
                      }}
                      tileContent={({ date }: { date: Date }) => {
                        const performance = dailyPerformance.find(p => isSameDay(p.date, date));
                        if (!performance) return null;
                        return (
                          <div className="flex flex-col items-center mt-1">
                            {performance.activated > 0 && (
                              <div className="flex items-center gap-1.5 bg-white/80 backdrop-blur-sm px-2 py-1 rounded-full">
                                <div className="w-2 h-2 bg-green-500 rounded-full" />
                                <span className="text-xs font-medium text-green-700">{performance.activated}</span>
                              </div>
                            )}
                            {performance.verified > 0 && (
                              <div className="flex items-center gap-1.5 bg-white/80 backdrop-blur-sm px-2 py-1 rounded-full mt-1">
                                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                                <span className="text-xs font-medium text-blue-700">{performance.verified}</span>
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                  </div>
                </div>

                <div className="lg:col-span-1">
                  {selectedDayPerformance ? (
                    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 text-white h-full">
                      <h3 className="text-2xl font-bold mb-6">
                        {format(selectedDayPerformance.date, 'EEEE, MMMM d, yyyy')}
                      </h3>
                      <div className="space-y-4">
                        <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium">Verified Leads</span>
                            <div className="p-2 bg-white/20 rounded-lg">
                              <CheckCircle className="h-5 w-5" />
                            </div>
                          </div>
                          <p className="text-3xl font-bold">{selectedDayPerformance.verified}</p>
                          <p className="text-sm text-white/80 mt-1">Leads verified today</p>
                        </div>
                        <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium">Activated Leads</span>
                            <div className="p-2 bg-white/20 rounded-lg">
                              <Zap className="h-5 w-5" />
                            </div>
                          </div>
                          <p className="text-3xl font-bold">{selectedDayPerformance.activated}</p>
                          <p className="text-sm text-white/80 mt-1">Leads activated today</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-6 h-full flex items-center justify-center">
                      <div className="text-center">
                        <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">Select a date to view performance details</p>
                      </div>
                    </div>
                  )}
              </div>
            </div>
          </div>
        </motion.div>
        )}

        {/* Current Month Stats */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-12"
        >
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Monthly Target</p>
                <p className="text-2xl font-bold text-indigo-600 mt-1">{currentMonthData?.target || 0}</p>
              </div>
              <div className="p-3 bg-indigo-100 rounded-lg">
                <Target className="h-6 w-6 text-indigo-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Achieved</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{currentMonthData?.achieved || 0}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Projection</p>
                <p className="text-2xl font-bold text-blue-600 mt-1">{projection}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <LineChart className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Potential Bonus</p>
                <p className="text-2xl font-bold text-purple-600 mt-1">
                  ₹{(currentMonthData?.bonus || 0) + (currentMonthData?.superBonus || 0)}
                </p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <DollarSign className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Achievement Cards */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 mb-12"
        >
          {/* Base Target Achievement */}
          <motion.div 
            whileHover={{ scale: 1.05, rotate: 2 }}
            className="relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-300" />
            <div 
              className="relative bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full p-6 shadow-xl overflow-hidden"
              style={{
                background: `conic-gradient(
                  rgba(255, 255, 255, 0.9) ${currentMonthData ? (currentMonthData.achieved / currentMonthData.target) * 100 : 0}%,
                  transparent ${currentMonthData ? (currentMonthData.achieved / currentMonthData.target) * 100 : 0}%
                )`
              }}
            >
              <div className="absolute inset-[6px] bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)]" />
              <div className="flex flex-col items-center text-center relative z-10">
                <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4">
                  <Award className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Target Achievement</h3>
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="relative mb-4"
                >
                  <div className="absolute inset-0 bg-white/10 blur-sm rounded-lg" />
                  <div className="relative bg-gradient-to-r from-white/20 to-white/10 px-4 py-2 rounded-lg border border-white/20">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-white tracking-wide">₹</span>
                      <span className="text-2xl font-bold text-white tracking-wide">
                        {new Intl.NumberFormat('en-IN', {
                          style: 'currency',
                          currency: 'INR',
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0
                        }).format(bonusAmounts.targetAchievement).replace('₹', '')}
                      </span>
                    </div>
                    <p className="text-xs text-white/80 mt-1">Bonus Reward</p>
                  </div>
                </motion.div>
                <p className="text-indigo-100 text-sm mb-4">
                  Achieve your monthly target to earn a bonus of ₹{bonusAmounts.targetAchievement.toLocaleString()}
                </p>
                <div className="grid grid-cols-3 gap-2 w-full max-w-[200px] mb-4">
                  <div className="bg-white/10 rounded-lg p-2 text-center">
                    <p className="text-xs text-indigo-200 mb-0.5">Required</p>
                    <p className="text-sm font-bold text-white">{currentMonthData?.target || 0}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-2 text-center">
                    <p className="text-xs text-indigo-200 mb-0.5">Achieved</p>
                    <p className="text-sm font-bold text-white">{currentMonthData?.achieved || 0}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-2 text-center">
                    <p className="text-xs text-indigo-200 mb-0.5">Pending</p>
                    <p className="text-sm font-bold text-white">
                      {currentMonthData ? Math.max(0, currentMonthData.target - currentMonthData.achieved) : 0}
                    </p>
                  </div>
                </div>
                <div className="mt-1 px-2 py-0.5 bg-white/10 rounded-full">
                  <span className="text-xs font-medium text-white">
                    {currentMonthData ? Math.round((currentMonthData.achieved / currentMonthData.target) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Rising Star Achievement */}
          <motion.div 
            whileHover={{ scale: 1.05, rotate: -2 }}
            className="relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-300" />
            <div 
              className="relative bg-gradient-to-br from-green-500 to-emerald-600 rounded-full p-6 shadow-xl overflow-hidden"
              style={{
                background: `conic-gradient(
                  rgba(255, 255, 255, 0.9) ${currentMonthData ? (currentMonthData.achieved / (currentMonthData.target * 1.3)) * 100 : 0}%,
                  transparent ${currentMonthData ? (currentMonthData.achieved / (currentMonthData.target * 1.3)) * 100 : 0}%
                )`
              }}
            >
              <div className="absolute inset-[6px] bg-gradient-to-br from-green-500 to-emerald-600 rounded-full" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)]" />
              <div className="flex flex-col items-center text-center relative z-10">
                <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4">
                  <Trophy className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Rising Star</h3>
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="relative mb-4"
                >
                  <div className="absolute inset-0 bg-white/10 blur-sm rounded-lg" />
                  <div className="relative bg-gradient-to-r from-white/20 to-white/10 px-4 py-2 rounded-lg border border-white/20">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-white tracking-wide">₹</span>
                      <span className="text-2xl font-bold text-white tracking-wide">
                        {new Intl.NumberFormat('en-IN', {
                          style: 'currency',
                          currency: 'INR',
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0
                        }).format(bonusAmounts.risingStar).replace('₹', '')}
                      </span>
                    </div>
                    <p className="text-xs text-white/80 mt-1">Bonus Reward</p>
                  </div>
                </motion.div>
                <p className="text-green-100 text-sm mb-4">
                  Achieve 130% of your target to earn a bonus of ₹{bonusAmounts.risingStar.toLocaleString()}
                </p>
                <div className="grid grid-cols-3 gap-2 w-full max-w-[200px] mb-4">
                  <div className="bg-white/10 rounded-lg p-2 text-center">
                    <p className="text-xs text-green-200 mb-0.5">Required</p>
                    <p className="text-sm font-bold text-white">{currentMonthData ? Math.ceil(currentMonthData.target * 1.3) : 0}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-2 text-center">
                    <p className="text-xs text-green-200 mb-0.5">Achieved</p>
                    <p className="text-sm font-bold text-white">{currentMonthData?.achieved || 0}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-2 text-center">
                    <p className="text-xs text-green-200 mb-0.5">Pending</p>
                    <p className="text-sm font-bold text-white">
                      {currentMonthData ? Math.max(0, Math.ceil(currentMonthData.target * 1.3) - currentMonthData.achieved) : 0}
                    </p>
                  </div>
                </div>
                <div className="mt-1 px-2 py-0.5 bg-white/10 rounded-full">
                  <span className="text-xs font-medium text-white">
                    {currentMonthData ? Math.round((currentMonthData.achieved / (currentMonthData.target * 1.3)) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Super Achiever */}
          <motion.div 
            whileHover={{ scale: 1.05, rotate: 2 }}
            className="relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-teal-500 to-green-600 rounded-full blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-300" />
            <div 
              className="relative bg-gradient-to-br from-teal-500 to-green-600 rounded-full p-6 shadow-xl overflow-hidden"
              style={{
                background: `conic-gradient(
                  rgba(255, 255, 255, 0.9) ${currentMonthData ? (currentMonthData.achieved / (currentMonthData.target * 1.5)) * 100 : 0}%,
                  transparent ${currentMonthData ? (currentMonthData.achieved / (currentMonthData.target * 1.5)) * 100 : 0}%
                )`
              }}
            >
              <div className="absolute inset-[6px] bg-gradient-to-br from-teal-500 to-green-600 rounded-full" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)]" />
              <div className="flex flex-col items-center text-center relative z-10">
                <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4">
                  <Trophy className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Super Achiever</h3>
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="relative mb-4"
                >
                  <div className="absolute inset-0 bg-white/10 blur-sm rounded-lg" />
                  <div className="relative bg-gradient-to-r from-white/20 to-white/10 px-4 py-2 rounded-lg border border-white/20">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-white tracking-wide">₹</span>
                      <span className="text-2xl font-bold text-white tracking-wide">
                        {new Intl.NumberFormat('en-IN', {
                          style: 'currency',
                          currency: 'INR',
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0
                        }).format(bonusAmounts.superAchiever).replace('₹', '')}
                      </span>
                    </div>
                    <p className="text-xs text-white/80 mt-1">Bonus Reward</p>
                  </div>
                </motion.div>
                <p className="text-teal-100 text-sm mb-4">
                  Achieve 150% of your target to earn a bonus of ₹{bonusAmounts.superAchiever.toLocaleString()}
                </p>
                <div className="grid grid-cols-3 gap-2 w-full max-w-[200px] mb-4">
                  <div className="bg-white/10 rounded-lg p-2 text-center">
                    <p className="text-xs text-teal-200 mb-0.5">Required</p>
                    <p className="text-sm font-bold text-white">{currentMonthData ? Math.ceil(currentMonthData.target * 1.5) : 0}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-2 text-center">
                    <p className="text-xs text-teal-200 mb-0.5">Achieved</p>
                    <p className="text-sm font-bold text-white">{currentMonthData?.achieved || 0}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-2 text-center">
                    <p className="text-xs text-teal-200 mb-0.5">Pending</p>
                    <p className="text-sm font-bold text-white">
                      {currentMonthData ? Math.max(0, Math.ceil(currentMonthData.target * 1.5) - currentMonthData.achieved) : 0}
                    </p>
                  </div>
                </div>
                <div className="mt-1 px-2 py-0.5 bg-white/10 rounded-full">
                  <span className="text-xs font-medium text-white">
                    {currentMonthData ? Math.round((currentMonthData.achieved / (currentMonthData.target * 1.5)) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Elite Performer */}
          <motion.div 
            whileHover={{ scale: 1.05, rotate: -2 }}
            className="relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-full blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-300" />
            <div 
              className="relative bg-gradient-to-br from-blue-500 to-cyan-600 rounded-full p-6 shadow-xl overflow-hidden"
              style={{
                background: `conic-gradient(
                  rgba(255, 255, 255, 0.9) ${currentMonthData ? (currentMonthData.achieved / (currentMonthData.target * 1.7)) * 100 : 0}%,
                  transparent ${currentMonthData ? (currentMonthData.achieved / (currentMonthData.target * 1.7)) * 100 : 0}%
                )`
              }}
            >
              <div className="absolute inset-[6px] bg-gradient-to-br from-blue-500 to-cyan-600 rounded-full" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)]" />
              <div className="flex flex-col items-center text-center relative z-10">
                <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4">
                  <Trophy className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Elite Performer</h3>
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="relative mb-4"
                >
                  <div className="absolute inset-0 bg-white/10 blur-sm rounded-lg" />
                  <div className="relative bg-gradient-to-r from-white/20 to-white/10 px-4 py-2 rounded-lg border border-white/20">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-white tracking-wide">₹</span>
                      <span className="text-2xl font-bold text-white tracking-wide">
                        {new Intl.NumberFormat('en-IN', {
                          style: 'currency',
                          currency: 'INR',
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0
                        }).format(bonusAmounts.elitePerformer).replace('₹', '')}
                      </span>
                    </div>
                    <p className="text-xs text-white/80 mt-1">Bonus Reward</p>
                  </div>
                </motion.div>
                <p className="text-blue-100 text-sm mb-4">
                  Achieve 170% of your target to earn a bonus of ₹{bonusAmounts.elitePerformer.toLocaleString()}
                </p>
                <div className="grid grid-cols-3 gap-2 w-full max-w-[200px] mb-4">
                  <div className="bg-white/10 rounded-lg p-2 text-center">
                    <p className="text-xs text-blue-200 mb-0.5">Required</p>
                    <p className="text-sm font-bold text-white">{currentMonthData ? Math.ceil(currentMonthData.target * 1.7) : 0}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-2 text-center">
                    <p className="text-xs text-blue-200 mb-0.5">Achieved</p>
                    <p className="text-sm font-bold text-white">{currentMonthData?.achieved || 0}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-2 text-center">
                    <p className="text-xs text-blue-200 mb-0.5">Pending</p>
                    <p className="text-sm font-bold text-white">
                      {currentMonthData ? Math.max(0, Math.ceil(currentMonthData.target * 1.7) - currentMonthData.achieved) : 0}
                    </p>
                  </div>
                </div>
                <div className="mt-1 px-2 py-0.5 bg-white/10 rounded-full">
                  <span className="text-xs font-medium text-white">
                    {currentMonthData ? Math.round((currentMonthData.achieved / (currentMonthData.target * 1.7)) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Master Achiever */}
          <motion.div 
            whileHover={{ scale: 1.05, rotate: 2 }}
            className="relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-300" />
            <div 
              className="relative bg-gradient-to-br from-purple-500 to-pink-600 rounded-full p-6 shadow-xl overflow-hidden"
              style={{
                background: `conic-gradient(
                  rgba(255, 255, 255, 0.9) ${currentMonthData ? (currentMonthData.achieved / (currentMonthData.target * 2)) * 100 : 0}%,
                  transparent ${currentMonthData ? (currentMonthData.achieved / (currentMonthData.target * 2)) * 100 : 0}%
                )`
              }}
            >
              <div className="absolute inset-[6px] bg-gradient-to-br from-purple-500 to-pink-600 rounded-full" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)]" />
              <div className="flex flex-col items-center text-center relative z-10">
                <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4">
                  <Trophy className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Master Achiever</h3>
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="relative mb-4"
                >
                  <div className="absolute inset-0 bg-white/10 blur-sm rounded-lg" />
                  <div className="relative bg-gradient-to-r from-white/20 to-white/10 px-4 py-2 rounded-lg border border-white/20">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-white tracking-wide">₹</span>
                      <span className="text-2xl font-bold text-white tracking-wide">
                        {new Intl.NumberFormat('en-IN', {
                          style: 'currency',
                          currency: 'INR',
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0
                        }).format(bonusAmounts.masterAchiever).replace('₹', '')}
                      </span>
                    </div>
                    <p className="text-xs text-white/80 mt-1">Bonus Reward</p>
                  </div>
                </motion.div>
                <p className="text-purple-100 text-sm mb-4">
                  Achieve 200% of your target to earn a bonus of ₹{bonusAmounts.masterAchiever.toLocaleString()}
                </p>
                <div className="grid grid-cols-3 gap-2 w-full max-w-[200px] mb-4">
                  <div className="bg-white/10 rounded-lg p-2 text-center">
                    <p className="text-xs text-purple-200 mb-0.5">Required</p>
                    <p className="text-sm font-bold text-white">{currentMonthData ? Math.ceil(currentMonthData.target * 2) : 0}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-2 text-center">
                    <p className="text-xs text-purple-200 mb-0.5">Achieved</p>
                    <p className="text-sm font-bold text-white">{currentMonthData?.achieved || 0}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-2 text-center">
                    <p className="text-xs text-purple-200 mb-0.5">Pending</p>
                    <p className="text-sm font-bold text-white">
                      {currentMonthData ? Math.max(0, Math.ceil(currentMonthData.target * 2) - currentMonthData.achieved) : 0}
                    </p>
                  </div>
                </div>
                <div className="mt-1 px-2 py-0.5 bg-white/10 rounded-full">
                  <span className="text-xs font-medium text-white">
                    {currentMonthData ? Math.round((currentMonthData.achieved / (currentMonthData.target * 2)) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Legendary Status */}
          <motion.div 
            whileHover={{ scale: 1.05, rotate: -2 }}
            className="relative group"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-red-600 rounded-full blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-300" />
            <div 
              className="relative bg-gradient-to-br from-amber-500 to-red-600 rounded-full p-6 shadow-xl overflow-hidden"
              style={{
                background: `conic-gradient(
                  rgba(255, 255, 255, 0.9) ${currentMonthData ? (currentMonthData.achieved / (currentMonthData.target * 2.5)) * 100 : 0}%,
                  transparent ${currentMonthData ? (currentMonthData.achieved / (currentMonthData.target * 2.5)) * 100 : 0}%
                )`
              }}
            >
              <div className="absolute inset-[6px] bg-gradient-to-br from-amber-500 to-red-600 rounded-full" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)]" />
              <div className="flex flex-col items-center text-center relative z-10">
                <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4">
                  <Trophy className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Legendary Status</h3>
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="relative mb-4"
                >
                  <div className="absolute inset-0 bg-white/10 blur-sm rounded-lg" />
                  <div className="relative bg-gradient-to-r from-white/20 to-white/10 px-4 py-2 rounded-lg border border-white/20">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-white tracking-wide">₹</span>
                      <span className="text-2xl font-bold text-white tracking-wide">
                        {new Intl.NumberFormat('en-IN', {
                          style: 'currency',
                          currency: 'INR',
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0
                        }).format(bonusAmounts.legendaryStatus).replace('₹', '')}
                      </span>
                    </div>
                    <p className="text-xs text-white/80 mt-1">Bonus Reward</p>
                  </div>
                </motion.div>
                <p className="text-amber-100 text-sm mb-4">
                  Achieve 250% of your target to earn a bonus of ₹{bonusAmounts.legendaryStatus.toLocaleString()}
                </p>
                <div className="grid grid-cols-3 gap-2 w-full max-w-[200px] mb-4">
                  <div className="bg-white/10 rounded-lg p-2 text-center">
                    <p className="text-xs text-amber-200 mb-0.5">Required</p>
                    <p className="text-sm font-bold text-white">{currentMonthData ? Math.ceil(currentMonthData.target * 2.5) : 0}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-2 text-center">
                    <p className="text-xs text-amber-200 mb-0.5">Achieved</p>
                    <p className="text-sm font-bold text-white">{currentMonthData?.achieved || 0}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-2 text-center">
                    <p className="text-xs text-amber-200 mb-0.5">Pending</p>
                    <p className="text-sm font-bold text-white">
                      {currentMonthData ? Math.max(0, Math.ceil(currentMonthData.target * 2.5) - currentMonthData.achieved) : 0}
                    </p>
                  </div>
                </div>
                <div className="mt-1 px-2 py-0.5 bg-white/10 rounded-full">
                  <span className="text-xs font-medium text-white">
                    {currentMonthData ? Math.round((currentMonthData.achieved / (currentMonthData.target * 2.5)) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Performance History with Graph */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="bg-white rounded-xl shadow-lg p-6 mb-12"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Performance History</h2>
              <p className="text-sm text-gray-500 mt-1">Last 6 months performance</p>
            </div>
            <div className="p-2 bg-indigo-100 rounded-lg">
              <BarChart3 className="h-6 w-6 text-indigo-600" />
            </div>
          </div>

          {/* Interactive Graph */}
          <div className="h-[400px] mb-8">
            <Line data={chartData} options={chartOptions} />
          </div>

          {/* Performance History Table */}
          <div className="space-y-6">
            {performanceData.map((data, index) => (
              <motion.div
                key={data.month}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200"
              >
                <div className="flex items-center space-x-4">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <Calendar className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{data.month}</p>
                    <p className="text-sm text-gray-500">Target: {data.target}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-6">
                  <div className="text-right">
                    <p className="font-medium text-gray-900">Achieved: {data.achieved}</p>
                    <p className="text-sm text-gray-500">
                      {data.achieved >= data.target ? 'Target Achieved' : 'Target Pending'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-green-600">Bonus: ₹{data.bonus}</p>
                    {data.superBonus > 0 && (
                      <p className="text-sm text-purple-600">Super Bonus: ₹{data.superBonus}</p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-8 bg-white rounded-xl shadow-lg p-6">
          <div className="flex-1">
            <span className="font-bold text-xl">{format(selectedMonth, 'MMMM yyyy')}</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2 bg-white rounded-lg shadow p-1">
              <button
                onClick={() => setSelectedMonth(prev => subMonths(prev, 1))}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <button
                onClick={() => setSelectedMonth(prev => addMonths(prev, 1))}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Attendance Popup */}
      {showAttendance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">My Attendance</h2>
              <button
                onClick={() => setShowAttendance(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            <AttendanceTable user={user} role="agent" month={selectedMonth} onMonthChange={setSelectedMonth} />
          </div>
        </div>
      )}
      
      {/* Leave Application Popup */}
      {showLeaveApplication && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Leave Application</h2>
              <button
                onClick={() => setShowLeaveApplication(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            <LeaveApplicationModal user={user} role="agent" />
          </div>
        </div>
      )}
    </div>
  );
});
