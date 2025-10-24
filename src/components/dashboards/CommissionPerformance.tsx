/**
 * ===============================================================================
 * COMMISSION PERFORMANCE COMPONENT - COMMISSION TRACKING AND ANALYTICS
 * ===============================================================================
 * 
 * This component provides comprehensive commission tracking and performance
 * analytics for agents and teams. It displays earnings based on plan categories,
 * target achievements, and commission configurations.
 * 
 * FEATURES:
 * 
 * 1. COMMISSION CALCULATION AND TRACKING
 *    - Real-time commission calculations based on plan categories
 *    - Category-wise earnings breakdown (standard, silver, gold, platinum)
 *    - Monthly and historical commission tracking
 * 
 * 2. PERFORMANCE INTEGRATION
 *    - Integration with attendance and leave management
 *    - Target achievement impact on commission rates
 *    - Performance-based commission adjustments
 * 
 * 3. ANALYTICAL REPORTING
 *    - Visual charts and graphs for commission trends
 *    - Monthly comparison and trend analysis
 *    - Category performance and earnings visualization
 * 
 * 4. CONFIGURATION MANAGEMENT
 *    - Commission rate configuration per category
 *    - Team-specific commission settings
 *    - Dynamic commission calculation based on configurations
 * 
 * USAGE:
 * This component is used by agents to track their commission earnings
 * and by managers to monitor team commission performance and configurations.
 * ===============================================================================
 */

import { useState, useEffect, memo } from 'react';
import { collection, query, where, getDocs, orderBy, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { CommissionConfig, Lead, User } from '../../types';
import { toast } from 'react-hot-toast';
import { format, startOfMonth, endOfMonth, subMonths, addMonths, isSameDay } from 'date-fns';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import LeaveApplicationModal from '../LeaveApplicationModal';
import AttendanceTable from '../AttendanceTable';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { 
  Calendar as LucideCalendar, 
  FileText, 
  TrendingUp, 
  DollarSign, 
  Users, 
  Clock, 
  Award,
  ChevronDown,
  ChevronUp,
  BarChart3,
  PieChart,
  Target,
  ArrowLeft,
  Trophy,
  Star,
  Zap,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface CommissionPerformanceProps {
  user: User;
}

interface CommissionEarnings {
  category: string;
  count: number;
  amount: number;
  totalEarnings: number;
}

interface CategoryStats {
  standard: number;
  silver: number;
  silverPlus: number;
  gold: number;
  goldPlus: number;
  platinum: number;
}

const COMMISSION_CATEGORIES = [
  { 
    key: 'standard', 
    label: 'Standard', 
    color: 'from-gray-500 to-gray-600',
    bgColor: 'from-gray-500 to-gray-600',
    icon: Target
  },
  { 
    key: 'silver', 
    label: 'Silver', 
    color: 'from-gray-400 to-gray-500',
    bgColor: 'from-gray-400 to-gray-500',
    icon: Star
  },
  { 
    key: 'silverPlus', 
    label: 'Silver Plus', 
    color: 'from-gray-300 to-gray-400',
    bgColor: 'from-gray-300 to-gray-400',
    icon: Star
  },
  { 
    key: 'gold', 
    label: 'Gold', 
    color: 'from-yellow-500 to-yellow-600',
    bgColor: 'from-yellow-500 to-yellow-600',
    icon: Trophy
  },
  { 
    key: 'goldPlus', 
    label: 'Gold Plus', 
    color: 'from-yellow-400 to-yellow-500',
    bgColor: 'from-yellow-400 to-yellow-500',
    icon: Trophy
  },
  { 
    key: 'platinum', 
    label: 'Platinum', 
    color: 'from-purple-500 to-purple-600',
    bgColor: 'from-purple-500 to-purple-600',
    icon: Award
  }
] as const;

export const CommissionPerformance = memo(function CommissionPerformance({ user }: CommissionPerformanceProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [commissionConfig, setCommissionConfig] = useState<CommissionConfig | null>(null);
  const [earnings, setEarnings] = useState<CommissionEarnings[]>([]);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [categoryStats, setCategoryStats] = useState<CategoryStats>({
    standard: 0,
    silver: 0,
    silverPlus: 0,
    gold: 0,
    goldPlus: 0,
    platinum: 0
  });
  const [showAttendance, setShowAttendance] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [attendanceMonth, setAttendanceMonth] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dailyPerformance, setDailyPerformance] = useState<Array<{ date: Date; verified: number; activated: number }>>([]);
  const [selectedDayPerformance, setSelectedDayPerformance] = useState<{ date: Date; verified: number; activated: number } | null>(null);

  useEffect(() => {
    loadCommissionData();
  }, []);

  useEffect(() => {
    loadDailyPerformance();
  }, [selectedMonth]);

  async function loadCommissionData() {
    try {
      setLoading(true);
      
      // Load commission config
      if (user.teamId) {
        const configRef = doc(db, 'commissionConfigs', user.teamId);
        const configDoc = await getDoc(configRef);
        
        if (configDoc.exists()) {
          const data = configDoc.data();
          setCommissionConfig({
            id: configDoc.id,
            teamId: data.teamId,
            standard: data.standard || 0,
            silver: data.silver || 0,
            silverPlus: data.silverPlus || 0,
            gold: data.gold || 0,
            goldPlus: data.goldPlus || 0,
            platinum: data.platinum || 0,
            createdAt: data.createdAt?.toDate(),
            updatedAt: data.updatedAt?.toDate(),
            createdBy: data.createdBy
          });
        }
      }

      // Load leads for the current month
      const startDate = startOfMonth(new Date());
      const endDate = endOfMonth(new Date());
      
      const leadsQuery = query(
        collection(db, 'leads'),
        where('agentId', '==', user.id),
        where('updatedAt', '>=', startDate),
        where('updatedAt', '<=', endDate),
        orderBy('updatedAt', 'desc')
      );
      
      const leadsSnapshot = await getDocs(leadsQuery);
      const leads = leadsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Lead[];

      // Calculate category stats
      const stats: CategoryStats = {
        standard: 0,
        silver: 0,
        silverPlus: 0,
        gold: 0,
        goldPlus: 0,
        platinum: 0
      };

      leads.forEach(lead => {
        if (lead.status === 'activated' && lead.plans) {
          lead.plans.forEach(plan => {
            const category = plan.category.toLowerCase();
            if (category.includes('standard')) stats.standard++;
            else if (category.includes('silver')) {
              if (category.includes('plus')) stats.silverPlus++;
              else stats.silver++;
            }
            else if (category.includes('gold')) {
              if (category.includes('plus')) stats.goldPlus++;
              else stats.gold++;
            }
            else if (category.includes('platinum')) stats.platinum++;
          });
        }
      });

      setCategoryStats(stats);
    } catch (error) {
      console.error('Error loading commission data:', error);
      toast.error('Failed to load commission data');
    } finally {
      setLoading(false);
    }
  }

  async function loadDailyPerformance() {
    try {
      const startDate = startOfMonth(selectedMonth);
      const endDate = endOfMonth(selectedMonth);
      
      const leadsQuery = query(
        collection(db, 'leads'),
        where('agentId', '==', user.id),
        where('updatedAt', '>=', startDate),
        where('updatedAt', '<=', endDate),
        orderBy('updatedAt', 'desc')
      );
      
      const leadsSnapshot = await getDocs(leadsQuery);
      const leads = leadsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Lead[];

      // Group leads by date
      const dailyData: { [key: string]: { verified: number; activated: number } } = {};
      
      leads.forEach(lead => {
        const dateKey = format(lead.updatedAt || lead.createdAt, 'yyyy-MM-dd');
        if (!dailyData[dateKey]) {
          dailyData[dateKey] = { verified: 0, activated: 0 };
        }
        
        if (lead.status === 'verified') {
          dailyData[dateKey].verified++;
        } else if (lead.status === 'activated') {
          dailyData[dateKey].activated += lead.plans?.length || 0;
        }
      });

      const performanceArray = Object.entries(dailyData).map(([dateStr, data]) => ({
        date: new Date(dateStr),
        verified: data.verified,
        activated: data.activated
      }));

      setDailyPerformance(performanceArray);
    } catch (error) {
      console.error('Error loading daily performance:', error);
      toast.error('Failed to load daily performance data');
    }
  }

  function handleDateClick(date: Date) {
    setSelectedDate(date);
    const performance = dailyPerformance.find(p => isSameDay(p.date, date));
    setSelectedDayPerformance(performance || null);
  }

  // Calculate earnings whenever commission config or category stats change
  useEffect(() => {
    if (commissionConfig) {
      const earningsData: CommissionEarnings[] = COMMISSION_CATEGORIES.map(category => {
        const count = categoryStats[category.key as keyof CategoryStats] || 0;
        const amount = commissionConfig[category.key as keyof CommissionConfig] as number || 0;
        const totalEarnings = count * amount;
        
        return {
          category: category.label,
          count,
          amount,
          totalEarnings
        };
      });

      setEarnings(earningsData);
      setTotalEarnings(earningsData.reduce((sum, item) => sum + item.totalEarnings, 0));
    }
  }, [commissionConfig, categoryStats]);

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
                    Commission Performance
                  </h1>
                  <p className="mt-2 text-lg text-gray-600">
                    Track your commission earnings by category
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-3xl font-bold text-indigo-600">
                  {totalEarnings.toLocaleString()}
                </div>
                <div className="text-sm text-gray-500">Total Earnings</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 sm:gap-4 mb-8">
          <button
            onClick={() => setShowAttendance(true)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg text-sm font-medium shadow hover:shadow-lg transition-colors duration-200"
          >
            <LucideCalendar className="h-4 w-4" />
            <span className="hidden sm:inline">My</span> Attendance
          </button>
          <button
            onClick={() => setShowLeaveModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white rounded-lg text-sm font-medium shadow hover:shadow-lg transition-colors duration-200"
          >
            <LucideCalendar className="h-4 w-4" />
            <span className="hidden sm:inline">Apply for</span> Leave
          </button>
          <button
            onClick={() => setShowCalendar(!showCalendar)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg text-sm font-medium shadow hover:shadow-lg transition-colors duration-200"
          >
            <LucideCalendar className="h-4 w-4" />
            <span className="hidden sm:inline">Performance</span> Calendar
          </button>
        </div>

        {/* Summary Stats */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12"
        >
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm">Total Activations</p>
                <p className="text-3xl font-bold">{earnings.reduce((sum, item) => sum + item.count, 0)}</p>
              </div>
              <BarChart3 className="h-12 w-12 text-blue-200" />
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-green-100 text-sm">Active Categories</p>
                <p className="text-3xl font-bold">{earnings.filter(item => item.count > 0).length}</p>
              </div>
              <PieChart className="h-12 w-12 text-green-200" />
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm">Total Earnings</p>
                <p className="text-3xl font-bold">{totalEarnings.toLocaleString()}</p>
              </div>
              <DollarSign className="h-12 w-12 text-purple-200" />
            </div>
          </div>
        </motion.div>

        {/* Commission Categories Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12"
        >
          {COMMISSION_CATEGORIES.map((category, index) => {
            const earning = earnings.find(e => e.category === category.label);
            const count = earning?.count || 0;
            const amount = earning?.amount || 0;
            const totalEarning = earning?.totalEarnings || 0;
            const IconComponent = category.icon;

            return (
              <motion.div 
                key={category.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 * index }}
                whileHover={{ scale: 1.05, rotate: index % 2 === 0 ? -2 : 2 }}
                className="relative group"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${category.color} rounded-full blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-300`} />
                <div 
                  className={`relative bg-gradient-to-br ${category.bgColor} rounded-full p-6 shadow-xl overflow-hidden`}
                  style={{
                    background: `conic-gradient(
                      rgba(255, 255, 255, 0.9) ${count > 0 ? Math.min((count / 10) * 100, 100) : 0}%,
                      transparent ${count > 0 ? Math.min((count / 10) * 100, 100) : 0}%
                    )`
                  }}
                >
                  <div className={`absolute inset-[6px] bg-gradient-to-br ${category.bgColor} rounded-full`} />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_0%,transparent_70%)]" />
                  <div className="flex flex-col items-center text-center relative z-10">
                    <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4">
                      <IconComponent className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">{category.label}</h3>
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.5, delay: 0.3 }}
                      className="relative mb-4"
                    >
                      <div className="absolute inset-0 bg-white/10 blur-sm rounded-lg" />
                      <div className="relative bg-gradient-to-r from-white/20 to-white/10 px-4 py-2 rounded-lg border border-white/20">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl font-bold text-white tracking-wide"></span>
                          <span className="text-2xl font-bold text-white tracking-wide">
                            {new Intl.NumberFormat('en-IN', {
                              style: 'currency',
                              currency: 'INR',
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0
                            }).format(totalEarning).replace('₹', '')}
                          </span>
                        </div>
                        <p className="text-xs text-white/80 mt-1">Total Earnings</p>
                      </div>
                    </motion.div>
                    <p className="text-white/90 text-sm mb-4">
                      <span className="font-bold text-lg bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-cyan-500/20 px-4 py-2 rounded-xl border border-emerald-400/30 text-emerald-200 shadow-lg backdrop-blur-sm relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/10 to-teal-400/10"></div>
                        <span className="relative z-10">{amount.toLocaleString()} per activation</span>
                      </span>
                    </p>
                    <div className="grid grid-cols-3 gap-2 w-full max-w-[200px] mb-4">
                      <div className="bg-white/10 rounded-lg p-2 text-center">
                        <p className="text-xs text-white/80 mb-0.5">Rate</p>
                        <p className="text-sm font-bold text-white">{amount.toLocaleString()}</p>
                      </div>
                      <div className="bg-white/10 rounded-lg p-2 text-center">
                        <p className="text-xs text-white/80 mb-0.5">Count</p>
                        <p className="text-sm font-bold text-white">{count}</p>
                      </div>
                      <div className="bg-white/10 rounded-lg p-2 text-center">
                        <p className="text-xs text-white/80 mb-0.5">Total</p>
                        <p className="text-sm font-bold text-white">{totalEarning.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="mt-1 px-2 py-0.5 bg-white/10 rounded-full">
                      <span className="text-xs font-medium text-white">
                        {count} activations
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>

        {/* Performance Calendar Modal */}
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
                    <Calendar
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
                        <LucideCalendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">Select a date to view performance details</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Attendance Modal */}
        {showAttendance && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold">My Attendance</h2>
                  <button
                    onClick={() => setShowAttendance(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                </div>
                <AttendanceTable 
                  user={user} 
                  role="agent"
                  month={attendanceMonth}
                  onMonthChange={setAttendanceMonth}
                />
              </div>
            </div>
          </div>
        )}

        {/* Leave Application Modal */}
        {showLeaveModal && (
          <LeaveApplicationModal
            user={user}
            role={user.role === 'verifier' || user.role === 'coordinator' ? 'agent' : user.role as 'agent' | 'manager' | 'admin'}
            teamId={user.teamId}
            open={showLeaveModal}
            onClose={() => setShowLeaveModal(false)}
          />
        )}
      </div>
    </div>
  );
}); 