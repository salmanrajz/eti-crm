/**
 * ===============================================================================
 * AGENT DASHBOARD COMPONENT - AGENT WORKFLOW INTERFACE
 * ===============================================================================
 * 
 * This component provides the main dashboard for agents, displaying their personal
 * performance metrics, lead management tools, and quick access to essential
 * workflows and information.
 * 
 * FEATURES:
 * 
 * 1. PERSONAL PERFORMANCE METRICS
 *    - Total leads created and current status breakdown
 *    - Target achievement tracking with MAR (Minimum Achievement Required)
 *    - Real-time progress indicators and performance charts
 * 
 * 2. LEAD MANAGEMENT TOOLS
 *    - Recent leads display with quick access actions
 *    - Lead status tracking and workflow navigation
 *    - Quick lead creation and management interface
 * 
 * 3. STRIKE SYSTEM INTEGRATION
 *    - Number claiming strike limits and tracking
 *    - Strike history and remaining strikes display
 *    - Integration with number pool claiming system
 * 
 * 4. WORKFLOW QUICK ACCESS
 *    - Direct navigation to lead creation and management
 *    - Access to payroll and attendance systems
 *    - Number pool and reservation management
 * 
 * 5. PERFORMANCE OPTIMIZATION
 *    - Advanced caching system with localStorage persistence
 *    - Real-time updates with efficient Firestore listeners
 *    - Optimized loading states and error handling
 * 
 * USAGE:
 * This component is used by users with 'agent' role to provide a focused
 * interface for daily agent operations and performance tracking.
 * ===============================================================================
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { User, Lead } from '../../types';
import { Link, useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow, addHours, startOfMonth, endOfMonth } from 'date-fns';
import { 
  Users, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Zap, 
  Calendar, 
  ClipboardList,
  PlusCircle,
  Phone,
  Package,
  Hash,
  User2,
  Eye,
  ArrowRight,
  Target,
  CheckCircle2,
  UserCheck,
  FileText,
  Shield,
  MessageCircle,
  AlertCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import { StruckNumbers, useStruckNumbers, useStrikeLimit } from './StruckNumbers';
import PayrollAndAttendanceDashboard from '../PayrollAndAttendanceDashboard';
import { dashboardPerf } from '../../utils/performance';
// ✅ ENHANCED: Import enhanced cache system
import { metricsCache, leadsCache, targetCache } from '../../utils/cache';

// ===============================================================================
// INTERFACE DEFINITIONS
// ===============================================================================

/**
 * Props interface for the AgentDashboard component
 */
interface AgentDashboardProps {
  user: User; // Current authenticated agent user
}

/**
 * Interface for agent target and performance requirements
 * Includes target goals and minimum achievement requirements (MAR)
 */
interface AgentTarget {
  agentId: string;
  target: number;
  mar: number; // Min Target Required
  month: string;
}

// ===============================================================================
// PERFORMANCE CONFIGURATION
// ===============================================================================

/**
 * Cache and performance configuration constants
 * Optimized for agent dashboard responsiveness
 */
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour cache duration
const LEADS_LIMIT = 6; // Only load 6 most recent leads for performance

/**
 * Active listeners tracker to prevent duplicate Firestore listeners
 * Ensures proper cleanup and prevents memory leaks
 */
const activeListeners: Map<string, () => void> = new Map();

export function AgentDashboard({ user }: AgentDashboardProps) {
  const [metrics, setMetrics] = useState({
    totalLeads: 0,
    pendingVerification: 0,
    verified: 0,
    follow_up: 0,
    activated: 0,
    assigned: 0,
    nonVerified: 0,
    target: 0,
    mar: 0,
    achieved: 0
  });
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const navigate = useNavigate();
  const { struckNumbers, loading: struckLoading } = useStruckNumbers(user.id);
  const { remainingStrikes, lastStrikeTime } = useStrikeLimit(user.id);
  const [showStruck, setShowStruck] = useState(false);
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [uaeNow, setUaeNow] = useState<Date>(() => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' })));

  // ✅ OPTIMIZED: Use refs to store unsubscribe functions for proper cleanup
  const metricsUnsubscribeRef = useRef<(() => void) | null>(null);
  const leadsUnsubscribeRef = useRef<(() => void) | null>(null);

  // ✅ ENHANCED: Memoize cache keys with better specificity
  const metricsKey = useMemo(() => `metrics_${user.id}_${format(new Date(), 'yyyy-MM')}`, [user.id]);
  const leadsKey = useMemo(() => `leads_${user.id}`, [user.id]);
  const targetKey = useMemo(() => `target_${user.id}_${format(new Date(), 'yyyy-MM')}`, [user.id]);

  // Keep UAE time updated (minute resolution)
  useEffect(() => {
    const updateUaeTime = () => setUaeNow(new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dubai' })));
    updateUaeTime();
    const interval = setInterval(updateUaeTime, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // ✅ ENHANCED: Separate target loading with persistent caching for better performance
  const loadTarget = useCallback(async () => {
    if (!user?.id) return null;

    // ✅ ENHANCED: Check persistent cache first (auto-handles expiration)
    const cachedTarget = targetCache.get(targetKey);
    if (cachedTarget) {
      return { target: cachedTarget.target, mar: cachedTarget.mar };
    }

    try {
      const currentMonth = format(new Date(), 'yyyy-MM');
      const targetsQuery = query(
        collection(db, 'agentTargets'),
        where('agentId', '==', user.id),
        where('month', '==', currentMonth),
        limit(1) // Only need one result
      );
      const targetsSnapshot = await getDocs(targetsQuery);
      const targetData = !targetsSnapshot.empty ? targetsSnapshot.docs[0].data() as AgentTarget : null;

      const result = {
        target: targetData?.target || 0,
        mar: targetData?.mar || 0
      };

      // ✅ ENHANCED: Store in persistent cache
      targetCache.set(targetKey, result);

      return result;
    } catch (error) {
      console.error('Error loading agent target:', error);
      return { target: 0, mar: 0 };
    }
  }, [user.id, targetKey]);

  // ✅ ENHANCED: Enhanced metrics calculation with memoization
  const calculateMetrics = useCallback((allLeads: any[], targetData: { target: number; mar: number }) => {
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

    const now = new Date();
    const startOfCurrentMonth = startOfMonth(now);
    const endOfCurrentMonth = endOfMonth(now);

    // ✅ ENHANCED: Use reduce for multiple calculations in single pass
    const counts = allLeads.reduce((acc, lead) => {
      // Count by status
      switch (lead.status) {
        case 'pending_verification':
          acc.pendingVerification++;
          break;
        case 'verified':
          acc.verified++;
          break;
        case 'follow_up':
          acc.follow_up++;
          break;
        case 'assigned':
          acc.assigned++;
          break;
        case 'non_verified':
          acc.nonVerified++;
          break;
      }

      // Count activated plans for current month using activatedAt (fallback updatedAt)
      if (lead.status === 'activated' && lead.plans) {
        const activatedAt = getActivatedAt(lead);
        if (activatedAt && activatedAt >= startOfCurrentMonth && activatedAt <= endOfCurrentMonth) {
        acc.activated += lead.plans.length;
        }
      }

      acc.totalLeads++;
      return acc;
    }, {
      totalLeads: 0,
      pendingVerification: 0,
      verified: 0,
      follow_up: 0,
      activated: 0,
      assigned: 0,
      nonVerified: 0
    });

    // When setting metrics, always default mar to 0 if undefined or null
    setMetrics({
      ...counts,
      target: targetData.target ?? 0,
      mar: targetData.mar ?? 0,
      achieved: counts.activated // Same as activated
    });

    return {
      ...counts,
      target: targetData.target,
      mar: targetData.mar,
      achieved: counts.activated // Same as activated
    };
  }, []);

  // ✅ ENHANCED: Enhanced metrics loading with persistent caching and better onSnapshot management
  const loadMetrics = useCallback(async () => {
      if (!user?.id) return;

    // ✅ ENHANCED: Check persistent cache first for instant display
    const cachedMetrics = metricsCache.get(metricsKey);
    if (cachedMetrics) {
      // ✅ PERFORMANCE: Cache hit - instant display
      setMetrics(cachedMetrics);
      setLoading(false);
      // Still setup listener for real-time updates, but cache gives instant response
    }

    try {
      // Check for existing listener to prevent duplicates
      const listenerKey = `metrics_${user.id}`;
      if (activeListeners.has(listenerKey)) {
        return;
      }

      // Enhanced query with better indexing
      const leadsQuery = query(
        collection(db, 'leads'),
        where('agentId', '==', user.id),
        orderBy('createdAt', 'desc'),
        limit(100)
      );

      // Setup onSnapshot for real-time updates
      const unsubscribe = onSnapshot(leadsQuery, async (snapshot) => {
        try {
          // Fetch the latest MAR value every time leads update (like MARStrip)
          const now = new Date();
          const currentMonth = format(now, 'yyyy-MM');
          const targetsQuery = query(
            collection(db, 'agentTargets'),
            where('agentId', '==', user.id),
            where('month', '==', currentMonth),
            limit(1)
          );
          const targetsSnapshot = await getDocs(targetsQuery);
          const targetData = !targetsSnapshot.empty ? targetsSnapshot.docs[0].data() as AgentTarget : null;
          const mar = targetData?.mar || 0;
          const target = targetData?.target || 0;

          const allLeads = snapshot.docs
            .map(doc => {
              const data = doc.data();
              return {
                id: doc.id,
                status: data.status,
                createdAt: data.createdAt?.toDate(),
                updatedAt: data.updatedAt?.toDate(),
                plans: Array.isArray(data.plans)
                  ? data.plans.map(plan => ({
                      ...plan, // This spread operator automatically converts Map to object
                      number: plan instanceof Map ? plan.get('number') : plan.number,
                      plan: plan instanceof Map ? plan.get('plan') : plan.plan
                    }))
                  : []
              };
            })
            .filter(lead => lead.status !== 'split');

          // Calculate metrics efficiently
          const agentMetrics = calculateMetrics(allLeads, { target, mar });

          // Update persistent cache with fresh data
          metricsCache.set(metricsKey, agentMetrics);

          setMetrics(agentMetrics);
          setLoading(false);
        } catch (error) {
          console.error('Error processing metrics snapshot:', error);
        }
      }, (error) => {
        // ✅ FIX: Handle permission errors gracefully during logout
        if (error.code === 'permission-denied') {
          // User logged out or lost permissions - cleanup silently
          activeListeners.delete(listenerKey);
          if (metricsUnsubscribeRef.current) {
            metricsUnsubscribeRef.current();
            metricsUnsubscribeRef.current = null;
          }
          return;
        }
        
        console.error('Error in metrics listener:', error);
        activeListeners.delete(listenerKey);
      });

      metricsUnsubscribeRef.current = unsubscribe;
      activeListeners.set(listenerKey, unsubscribe);

    } catch (error) {
      console.error('Error loading agent metrics:', error);
      toast.error('Failed to load dashboard metrics');
    }
  }, [user.id, metricsKey, calculateMetrics]);

  // ✅ ENHANCED: Enhanced recent leads loading with persistent caching
  const loadRecentLeads = useCallback(async () => {
    if (!user?.id) return;

    // ✅ ENHANCED: Check persistent cache first for instant display
    const cachedLeads = leadsCache.get(leadsKey);
    if (cachedLeads && cachedLeads.leads) {
      // ✅ PERFORMANCE: Cache hit - instant display
      // Verify that cached data has proper plan structure (not Maps)
      const hasValidPlans = cachedLeads.leads.every((lead: any) => 
        !lead.plans || lead.plans.every((plan: any) => 
          typeof plan === 'object' && !(plan instanceof Map) && plan.number && plan.plan
        )
      );
      
      if (hasValidPlans) {
        setLeads(cachedLeads.leads);
        // Don't return early - continue to set up real-time listener for updates
      }
    }

    try {
      // Guard against duplicate listener
      if (leadsUnsubscribeRef.current) {
        return;
      }

      // ✅ ENHANCED: Efficient query for recent leads
      const recentLeadsQuery = query(
        collection(db, 'leads'),
        where('agentId', '==', user.id),
        orderBy('createdAt', 'desc'),
        limit(LEADS_LIMIT)
      );

      // Use onSnapshot for real-time updates on recent leads
      const unsubscribe = onSnapshot(recentLeadsQuery, (snapshot) => {
        try {
          const recentLeads = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              createdAt: data.createdAt?.toDate(),
              updatedAt: data.updatedAt?.toDate(),
              plans: Array.isArray(data.plans)
                ? data.plans.map(plan => ({
                    ...plan, // This spread operator automatically converts Map to object
                    number: plan instanceof Map ? plan.get('number') : plan.number,
                    plan: plan instanceof Map ? plan.get('plan') : plan.plan
                  }))
                : []
            };
          }) as Lead[];

          // Filter out split leads
          const filteredLeads = recentLeads.filter(lead => lead.status !== 'split');

          // ✅ ENHANCED: Update persistent cache with fresh data
          leadsCache.set(leadsKey, {
            leads: filteredLeads
          });

          setLeads(filteredLeads);
        } catch (error) {
          console.error('Error processing leads snapshot:', error);
        }
      }, (error) => {
        // ✅ FIX: Handle permission errors gracefully during logout
        if (error.code === 'permission-denied') {
          // User logged out or lost permissions - cleanup silently
          if (leadsUnsubscribeRef.current) {
            leadsUnsubscribeRef.current();
            leadsUnsubscribeRef.current = null;
          }
          return;
        }
        
        console.error('Error in leads listener:', error);
      });

      // Store listener for cleanup
      leadsUnsubscribeRef.current = unsubscribe;

    } catch (error) {
      console.error('Error loading recent leads:', error);
      toast.error('Failed to load recent leads');
    }
  }, [user.id, leadsKey]);

  // ✅ OPTIMIZED: Enhanced data loading with parallel execution and better error handling
  useEffect(() => {
    if (!user?.id) return;

    const loadData = async () => {
      // ✅ PERFORMANCE: Track dashboard loading time
      const endMeasure = dashboardPerf.measureDashboardLoad('agent', user.id);
      
      setLoading(true);
      try {
        // ✅ OPTIMIZED: Load metrics and leads in parallel for better performance
        await Promise.all([
          loadMetrics(),
          loadRecentLeads()
        ]);
      } catch (error) {
        console.error('Error loading dashboard data:', error);
        toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
        // ✅ PERFORMANCE: End measurement
        endMeasure();
    }
    };

    loadData();

    // ✅ OPTIMIZED: Cleanup function with proper listener management
    return () => {
      // Cleanup listeners when component unmounts
      if (metricsUnsubscribeRef.current) {
        metricsUnsubscribeRef.current();
        metricsUnsubscribeRef.current = null;
      }
      if (leadsUnsubscribeRef.current) {
        leadsUnsubscribeRef.current();
        leadsUnsubscribeRef.current = null;
      }

      // Remove from active listeners
      const listenerKey = `metrics_${user.id}`;
      activeListeners.delete(listenerKey);

      // ✅ OPTIMIZED: DON'T clear cache on unmount for better performance with 1-hour cache
      // Cache will naturally expire after 1 hour, keeping it for fast remounts
    };
  }, [user?.id, loadMetrics, loadRecentLeads]);

  // ✅ OPTIMIZED: Memoized stats with better dependency tracking
  const stats = useMemo(() => [
    {
      name: 'Target',
      description: 'Monthly activation target',
      value: metrics.target,
      icon: Target,
      color: 'bg-gradient-to-br from-pink-500 to-pink-600',
      textColor: 'text-pink-600',
      href: '/dashboard/leads?status=activated',
    },
    {
      name: 'Achieved',
      description: 'Monthly activations achieved',
      value: metrics.achieved,
      icon: CheckCircle2,
      color: 'bg-gradient-to-br from-emerald-500 to-emerald-600',
      textColor: 'text-emerald-600',
      href: '/dashboard/leads?status=activated',
    },
    {
      name: 'Total Leads',
      description: 'Total leads in system',
      value: metrics.totalLeads,
      href: '/dashboard/leads',
      icon: Users,
      color: 'bg-gradient-to-br from-blue-500 to-blue-600',
      textColor: 'text-blue-600',
    },
    {
      name: 'Assigned Leads',
      description: 'Currently assigned leads',
      value: metrics.assigned,
      href: '/dashboard/leads?status=assigned',
      icon: ClipboardList,
      color: 'bg-gradient-to-br from-indigo-500 to-indigo-600',
      textColor: 'text-indigo-600',
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
      name: 'Verified',
      description: 'Successfully verified',
      value: metrics.verified,
      href: '/dashboard/leads?status=verified',
      icon: CheckCircle,
      color: 'bg-gradient-to-br from-green-500 to-green-600',
      textColor: 'text-green-600',
    },
    {
      name: 'Follow Up',
      description: 'Follow Up leads',
      value: metrics.follow_up,
      href: '/dashboard/leads?status=follow_up',
      icon: XCircle,
      color: 'bg-gradient-to-br from-red-500 to-red-600',
      textColor: 'text-red-600',
    },
    {
      name: 'Non-Verified Leads',
      description: 'Non verified',
      value: metrics.nonVerified,
      href: '/dashboard/leads?status=non_verified',
      icon: AlertCircle,
      color: 'bg-gradient-to-br from-amber-500 to-amber-600',
      textColor: 'text-amber-600',
    },
  ], [metrics]);

  // ✅ OPTIMIZED: Enhanced loading state with skeleton
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        </div>
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
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
                Welcome back, <span className="bg-gradient-to-r from-orange-500 to-pink-500 bg-clip-text text-transparent">{user?.name}</span>!
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-gray-600">
              Today's leads are tomorrow's success — take action.
              </p>
            </div>
            <div className="flex flex-row sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
              {/* Time Card - Hidden on mobile */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="hidden sm:block w-full sm:w-auto"
              >
                <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 backdrop-blur-sm border border-indigo-100/50 rounded-xl p-2 sm:p-3">
                  <div className="flex items-center justify-center sm:justify-start space-x-2">
                    <div className="p-1.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg shadow-lg shadow-indigo-500/20">
                      <Calendar className="h-3 w-3 sm:h-4 sm:w-4 text-white" />
                    </div>
                    <div className="text-center sm:text-left">
                      <p className="text-xs font-semibold text-gray-900">
                        {format(uaeNow, 'EEEE, MMMM d, yyyy')}
                      </p>
                      <p className="text-sm font-semibold text-gray-800">
                        UAE Time: {format(uaeNow, 'hh:mm a')}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* My Performance Button */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex-1 sm:w-auto sm:min-w-[220px]"
              >
                <button
                  onClick={() => navigate('/dashboard/performance')}
                  className="w-full inline-flex items-center justify-center px-4 sm:px-6 py-2 sm:py-2.5 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 backdrop-blur-sm border border-indigo-100/50 rounded-xl shadow-lg shadow-indigo-500/10 hover:shadow-xl hover:shadow-indigo-500/20 transition-all duration-300 group"
                >
                  <div className="flex items-center w-full">
                    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-1.5 rounded-lg mr-3 group-hover:scale-110 transition-transform duration-300 flex-shrink-0">
                      <Target className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-900 whitespace-nowrap">My Performance</div>
                      <div className="hidden sm:block text-[10px] text-gray-600 whitespace-nowrap">View detailed metrics</div>
                    </div>
                    <div className="ml-3 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 flex-shrink-0">
                      <ArrowRight className="w-3 h-3 text-indigo-600" />
                    </div>
                  </div>
                </button>
              </motion.div>

              {/* Submit Lead Button */}
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex-1 sm:w-auto"
              >
                <Link
                  to="/dashboard/leads/create"
                  className="w-full inline-flex items-center justify-center px-3 sm:px-4 py-2 sm:py-2.5 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 backdrop-blur-sm border border-indigo-100/50 rounded-xl shadow-lg shadow-indigo-500/10 hover:shadow-xl hover:shadow-indigo-500/20 transition-all duration-300 group"
                >
                  <div className="flex items-center">
                    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-1.5 rounded-lg mr-2 group-hover:scale-110 transition-transform duration-300">
                      <PlusCircle className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                    </div>
                    <div className="text-left">
                      <span className="block text-xs font-semibold text-gray-900">Submit Lead</span>
                      <span className="hidden sm:block text-[10px] text-gray-600">Create a new lead</span>
                    </div>
                    <div className="ml-2 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                      <ArrowRight className="w-3 h-3 text-indigo-600" />
                    </div>
                  </div>
                </Link>
              </motion.div>

            </div>
          </div>
        </motion.div>

        {/* MAR Strip Card */}
        <div className="mb-4">
          <div className="flex flex-col sm:flex-row items-center justify-between bg-gradient-to-r from-cyan-100 to-blue-100 border border-cyan-200 rounded-xl px-4 py-3 shadow-md">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-cyan-600" />
                <span className="text-base font-bold text-cyan-700">MAR:</span>
                  <span className="text-xl font-bold text-cyan-900">{metrics.mar ?? 0}</span>
              </div>
              <div className="flex items-center gap-2 ml-4">
                <Zap className="h-5 w-5 text-purple-600" />
                <span className="text-base font-bold text-purple-700">Achieved:</span>
                <span className="text-xl font-bold text-purple-900">{metrics.activated}</span>
              </div>
            </div>
            <div className="mt-2 sm:mt-0 sm:ml-6 flex-1">
              {metrics.activated < metrics.mar ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  whileHover={{ scale: 1.02, y: -2 }}
                  className="hidden sm:flex items-start gap-2 text-xs bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg px-3 py-2 shadow-lg relative overflow-hidden"
                >
                  {/* Enhanced flashing background effect */}
                  <motion.div 
                    animate={{ 
                      background: [
                        "linear-gradient(90deg, rgba(239, 68, 68, 0.1) 0%, rgba(251, 146, 60, 0.1) 100%)",
                        "linear-gradient(90deg, rgba(239, 68, 68, 0.3) 0%, rgba(251, 146, 60, 0.3) 100%)",
                        "linear-gradient(90deg, rgba(239, 68, 68, 0.1) 0%, rgba(251, 146, 60, 0.1) 100%)"
                      ]
                    }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute inset-0 rounded-xl"
                  />
                  
                  {/* Pulsing border effect */}
                  <motion.div 
                    animate={{ 
                      scale: [1, 1.05, 1],
                      opacity: [0.2, 0.5, 0.2]
                    }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className="absolute inset-0 rounded-xl border-2 border-red-400"
                  />
                  
                  <div className="flex-shrink-0 mt-0.5 relative z-10">
                    <motion.div 
                      animate={{ 
                        scale: [1, 1.2, 1],
                        rotate: [0, 5, -5, 0]
                      }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                      whileHover={{ scale: 1.3, rotate: 360 }}
                      className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center shadow-md"
                    >
                      <XCircle className="h-4 w-4 text-red-500" />
                    </motion.div>
                  </div>
                  <div className="flex-1 relative z-10">
                    <motion.div 
                      animate={{ 
                        x: [0, -3, 3, 0],
                        scale: [1, 1.02, 1]
                      }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      className="font-semibold text-red-800 mb-1"
                    >
                      You are yet to meet your Minimum Activations Required (MAR) for this month.
                    </motion.div>
                    <motion.div 
                      animate={{ opacity: [0.8, 1, 0.8] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      className="text-red-700"
                    >
                      To stay with us, kindly achieve a minimum target of <span className="font-bold text-red-900">{metrics.mar}</span>.
                    </motion.div>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  whileHover={{ scale: 1.02, y: -2 }}
                  className="hidden sm:flex items-start gap-2 text-xs bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg px-3 py-2 shadow-lg"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    <motion.div 
                      animate={{ 
                        scale: [1, 1.1, 1],
                        rotate: [0, 10, -10, 0]
                      }}
                      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                      whileHover={{ scale: 1.2, rotate: 360 }}
                      className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center shadow-md"
                    >
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    </motion.div>
                  </div>
                  <div className="flex-1">
                    <motion.div 
                      animate={{ 
                        scale: [1, 1.01, 1],
                        color: ["#166534", "#15803d", "#166534"]
                      }}
                      transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                      className="font-semibold text-green-800 mb-1"
                    >
                      🎉 Excellent Work! 🎉
                    </motion.div>
                    <motion.div 
                      animate={{ opacity: [0.9, 1, 0.9] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                      className="text-green-700"
                    >
                      You have achieved your Minimum Activations Required (MAR) for this month.
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-8 sm:mb-12"
        >
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          {stats.map((stat, index) => (
              <motion.div
                key={stat.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                className="relative"
              >
                {/* Single tilted background card effect - gradient colors */}
                <div className={`absolute inset-0 transform rotate-1.5 translate-x-1 translate-y-1 ${stat.name === 'Target' ? 'bg-gradient-to-br from-pink-400 to-pink-600' : stat.name === 'Achieved' ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' : stat.name === 'Total Leads' ? 'bg-gradient-to-br from-blue-400 to-blue-600' : stat.name === 'Assigned Leads' ? 'bg-gradient-to-br from-indigo-400 to-indigo-600' : stat.name === 'Pending Verification' ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' : stat.name === 'Verified' ? 'bg-gradient-to-br from-green-400 to-green-600' : 'bg-gradient-to-br from-purple-400 to-purple-600'} opacity-25 rounded-2xl shadow-[0_3px_15px_rgba(0,0,0,0.08)] scale-102`}></div>
                
                <Link
                  to={stat.href}
                  className="block relative overflow-hidden rounded-2xl bg-white/95 backdrop-blur-xl border border-white/40 shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.18)] transition-all duration-300 transform hover:-translate-y-1 cursor-pointer group"
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
                          <dd className={`text-lg sm:text-2xl lg:text-3xl font-bold ${stat.textColor} mt-1 drop-shadow-sm`}>
                            {stat.value}
                          </dd>
                          <dd className="hidden sm:block text-[10px] sm:text-xs text-gray-500 mt-1 sm:mt-1.5">
                            {stat.description}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/0 to-purple-500/0 group-hover:from-indigo-500/5 group-hover:to-purple-500/5 transition-all duration-200 rounded-2xl" />
                </Link>
              </motion.div>
          ))}
          </div>
        </motion.div>

        {/* Struck Numbers Button */}
        <div className="mb-8 sm:mb-12 flex items-center gap-4">
          <button
            onClick={() => setShowStruck(true)}
            className="relative inline-flex items-center px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold rounded-xl shadow hover:from-amber-600 hover:to-orange-700 transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={struckLoading}
          >
            <span>Struck Numbers</span>
            <span className="ml-2 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-amber-800 bg-amber-100 rounded-full">
              {struckLoading ? '...' : struckNumbers.length}
            </span>
          </button>

          {/* Strike Limit Info */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">Strikes remaining today:</span>
            <span className={clsx(
              "font-semibold",
              remainingStrikes > 0 ? "text-green-600" : "text-red-600"
            )}>
              {remainingStrikes}/2
            </span>
            {lastStrikeTime && remainingStrikes < 2 && (
              <span className="text-gray-500">
                (Next strike available {formatDistanceToNow(addHours(lastStrikeTime, 24), { addSuffix: true })})
              </span>
            )}
          </div>
        </div>

        {/* Struck Numbers Modal */}
        {showStruck && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowStruck(false);
              }
            }}
          >
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 relative max-h-[90vh] flex flex-col">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Struck Numbers</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Strikes remaining today: {remainingStrikes}/2
                    {lastStrikeTime && remainingStrikes < 2 && (
                      <span className="ml-2">
                        (Next strike available {formatDistanceToNow(addHours(lastStrikeTime, 24), { addSuffix: true })})
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => setShowStruck(false)}
                  className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="overflow-y-auto flex-1 p-4">
                <StruckNumbers struckNumbers={struckNumbers} loading={struckLoading} />
              </div>
            </div>
          </div>
        )}

        {/* Recent Leads Section */}
        {leads.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
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
                
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center space-x-3 sm:space-x-4">
                    <div className="p-2 sm:p-3 bg-white/20 backdrop-blur-sm rounded-xl sm:rounded-2xl shadow-lg">
                      <Users className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-lg sm:text-2xl lg:text-3xl font-bold text-white flex items-center">
                        Recent Leads
                      </h2>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2 sm:space-x-4">
                    <Link
                      to="/dashboard/leads"
                      className="group inline-flex items-center px-3 sm:px-6 py-2 sm:py-3 bg-white/15 hover:bg-white/25 text-white rounded-lg sm:rounded-xl transition-all duration-300 backdrop-blur-sm border border-white/20 hover:border-white/30 hover:scale-105 shadow-lg hover:shadow-xl"
                    >
                      <Eye className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 group-hover:scale-110 transition-transform" />
                      <span className="text-xs sm:text-sm font-semibold hidden sm:inline">View All Leads</span>
                      <span className="text-xs sm:text-sm font-semibold sm:hidden">All</span>
                      <ArrowRight className="h-3 w-3 sm:h-4 sm:w-4 ml-1 sm:ml-2 group-hover:translate-x-1 transition-transform" />
                    </Link>
                    
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
                  <div className="col-span-2 -ml-2">
                    <div className="flex items-center space-x-1">
                      <div className="p-2 bg-gradient-to-br from-blue-100 to-cyan-100 rounded-lg">
                        <Hash className="h-4 w-4 text-blue-600" />
                      </div>
                      <span className="text-sm font-bold text-blue-700 uppercase tracking-wide">Selected Number</span>
                    </div>
                  </div>
                  <div className="col-span-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-gradient-to-br from-emerald-100 to-green-100 rounded-lg">
                        <Package className="h-4 w-4 text-emerald-600" />
                      </div>
                      <span className="text-sm font-bold text-emerald-700 uppercase tracking-wide">Plan Details</span>
                    </div>
                  </div>
                  <div className="col-span-1 pr-8">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-gradient-to-br from-amber-100 to-orange-100 rounded-lg">
                        <Clock className="h-4 w-4 text-amber-600" />
                      </div>
                      <span className="text-sm font-bold text-amber-700 uppercase tracking-wide">Status</span>
                    </div>
                  </div>
                  <div className="col-span-2 pl-8">
                    <div className="flex items-center space-x-3">
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
                  {leads.map((lead, index) => {
                    
                    return (
                      <motion.div
                        key={lead.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: index * 0.1 }}
                        className={clsx(
                          "group hover:bg-gradient-to-r hover:from-indigo-50/50 hover:to-purple-50/50 transition-all duration-200 relative",
                          (lead as any).verificationMethod === 'whatsapp' && "bg-gradient-to-r from-emerald-50/50 to-transparent",
                          // Modern border - only show between items, not on first/last
                          index < leads.length - 1 && "border-b border-gradient-to-r from-gray-200/60 via-indigo-200/40 to-purple-200/60"
                        )}
                        style={{
                          // Modern gradient border effect - More visible
                          borderBottom: index < leads.length - 1 ? '2px solid transparent' : 'none',
                          backgroundImage: index < leads.length - 1 
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

                          {/* Selected Numbers */}
                            <div className="col-span-2 -ml-2">
                              <div className="flex flex-col space-y-2">
                            {(lead.plans && lead.plans.length > 0)
                              ? lead.plans.map((plan, planIndex) => (
                                  <div key={planIndex} className="flex items-center space-x-2 bg-gradient-to-br from-gray-50 to-gray-100 px-3 py-1.5 rounded-lg shadow-sm">
                                    <Hash className="h-4 w-4 text-indigo-500" />
                                    <span className="text-sm font-medium text-gray-700">
                                      {plan.number || ''}
                                    </span>
                                  </div>
                                ))
                              : <span className="text-sm font-medium text-gray-700"></span>
                            }
                              </div>
                          </div>

                          {/* Plan Details */}
                            <div className="col-span-4">
                              <div className="flex flex-col space-y-2">
                            {(lead.plans && lead.plans.length > 0)
                              ? lead.plans.map((plan, planIndex) => (
                                  <div key={planIndex} className="flex items-center space-x-2 bg-gradient-to-br from-gray-50 to-gray-100 px-3 py-1.5 rounded-lg shadow-sm">
                                    <Package className="h-4 w-4 text-indigo-500" />
                                    <span className="text-sm font-medium text-gray-700">
                                      {plan.plan || ''}
                                    </span>
                                  </div>
                                ))
                              : <span className="text-sm font-medium text-gray-700"></span>
                            }
                              </div>
                          </div>

                          {/* Status */}
                            <div className="col-span-1 pr-8">
                            <motion.span
                              whileHover={{ scale: 1.05 }}
                              className={clsx(
                                  "inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium shadow-sm ring-1 ring-opacity-5",
                                  lead.status === 'verified' ? 'bg-green-100 text-green-800 ring-green-500/20' :
                                  lead.status === 'rejected' ? 'bg-red-100 text-red-800 ring-red-500/20' :
                                  lead.status === 'pending_verification' ? 'bg-yellow-100 text-yellow-800 ring-yellow-500/20' :
                                  lead.status === 'activated_non_verified' ? 'bg-amber-100 text-amber-800 ring-amber-500/20' :
                                  lead.status === 'follow_up' ? 'bg-orange-100 text-orange-800 ring-orange-500/20' :
                                  lead.status === 'activated' ? 'bg-blue-100 text-blue-800 ring-blue-500/20' :
                                  'bg-gray-100 text-gray-800 ring-gray-500/20'
                              )}
                            >
                                {lead.status === 'verified' ? <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> :
                                 lead.status === 'rejected' ? <XCircle className="h-3.5 w-3.5 mr-1.5" /> :
                                 lead.status === 'pending_verification' ? <Clock className="h-3.5 w-3.5 mr-1.5" /> :
                                 lead.status === 'activated_non_verified' ? <Clock className="h-3.5 w-3.5 mr-1.5" /> :
                                 lead.status === 'activated' ? <Zap className="h-3.5 w-3.5 mr-1.5" /> : null}
                              {lead.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </motion.span>
                          </div>

                          {/* Actions */}
                            <div className="col-span-2 pl-8">
                            <motion.div
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                                className="relative z-20"
                            >
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
                              <div className="flex items-start space-x-3">
                                <div className="p-2.5 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-xl shadow-sm">
                                  <User2 className="h-5 w-5 text-indigo-600" />
                                </div>
                                <div>
                                  <h3 className="text-sm font-semibold text-gray-900">
                                    {lead.customerName || 'Unnamed Customer'}
                                  </h3>
                                  <div className="flex items-center text-s text-gray-500 mt-1">
                                    <Phone className="h-3 w-3 mr-1.5" />
                                    {lead.customerNumber}
                                  </div>
                                  <div className="flex items-center text-xs text-gray-500 mt-1">
                                    <Calendar className="h-3 w-3 mr-1.5" />
                                    {format(lead.createdAt, 'MMM d, yyyy')}
                                  </div>
                                </div>
                              </div>
                              <motion.span
                                whileHover={{ scale: 1.02 }}
                                className={clsx(
                                  "inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-medium shadow-sm ring-1 ring-opacity-5",
                                  lead.status === 'verified' ? 'bg-green-100 text-green-800 ring-green-500/20' :
                                  lead.status === 'rejected' ? 'bg-red-100 text-red-800 ring-red-500/20' :
                                  lead.status === 'pending_verification' ? 'bg-yellow-100 text-yellow-800 ring-yellow-500/20' :
                                  lead.status === 'follow_up' ? 'bg-orange-100 text-orange-800 ring-orange-500/20' :
                                  lead.status === 'activated' ? 'bg-blue-100 text-blue-800 ring-blue-500/20' :
                                  'bg-gray-100 text-gray-800 ring-gray-500/20'
                                )}
                              >
                                {lead.status === 'verified' ? <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> :
                                 lead.status === 'rejected' ? <XCircle className="h-3.5 w-3.5 mr-1.5" /> :
                                 lead.status === 'pending_verification' ? <Clock className="h-3.5 w-3.5 mr-1.5" /> :
                                 lead.status === 'activated' ? <Zap className="h-3.5 w-3.5 mr-1.5" /> : null}
                                {lead.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              </motion.span>
                            </div>

                            {/* Plan Details for Mobile */}
                            <div className="mt-4 space-y-2">
                              {(lead.plans?.map((plan, planIndex) => (
                                <div key={planIndex} className="flex items-center space-x-2 bg-gradient-to-br from-gray-50 to-gray-100 px-3 py-1.5 rounded-lg shadow-sm">
                                  <Package className="h-4 w-4 text-indigo-500" />
                                  <span className="text-sm font-medium text-gray-700">
                                    {plan.plan || ''}
                                  </span>
                                </div>
                              )))}
                            </div>

                            {/* Action Button for Mobile */}
                            <div className="mt-4">
                              <motion.div
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                className="relative z-20"
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
                  })}
                </div>
            </div>
          </motion.div>
        )}

        {/* Payroll and Attendance Dashboard */}
        <PayrollAndAttendanceDashboard open={payrollOpen} onClose={() => setPayrollOpen(false)} role="agent" user={user} />
        
      </div>
    </div>
  );
}
