/**
 * ===============================================================================
 * MAR STRIP COMPONENT - MINIMUM ACHIEVEMENT REQUIRED DISPLAY
 * ===============================================================================
 * 
 * This component provides a compact display of agent performance metrics,
 * specifically showing activated leads count versus the Minimum Achievement
 * Required (MAR) target for the current month.
 * 
 * FEATURES:
 * 
 * 1. REAL-TIME PERFORMANCE TRACKING
 *    - Live updates of activated lead count for current month
 *    - MAR target display and comparison
 *    - Performance status indicators (achieved/not achieved)
 * 
 * 2. COMPACT DISPLAY INTEGRATION
 *    - Designed for header integration in dashboard layouts
 *    - Responsive design for various screen sizes
 *    - Visual performance indicators with color coding
 * 
 * 3. FIREBASE INTEGRATION
 *    - Real-time data synchronization via Firestore listeners
 *    - Efficient querying with proper data filtering
 *    - Performance optimization with targeted data fetching
 * 
 * 4. USER-SPECIFIC DATA
 *    - Agent-specific performance tracking
 *    - Month-based target and achievement comparison
 *    - Role-based display (agent only)
 * 
 * USAGE:
 * This component is integrated into dashboard headers to provide
 * agents with quick access to their current month performance status.
 * ===============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Target, Zap, XCircle, CheckCircle } from 'lucide-react';
import { collection, query, where, getDocs, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { User, Lead } from '../types';

interface AgentTarget {
  agentId: string;
  target: number;
  mar: number; // Min Target Required
  month: string;
}

interface MARStripProps {
  user: User;
}

export function MARStrip({ user }: MARStripProps) {
  const [metrics, setMetrics] = useState({
    activated: 0,
    mar: 0
  });
  const [loading, setLoading] = useState(true);

  const loadMARData = useCallback(async () => {
    if (!user?.id || user.role !== 'agent') return;

    try {
      // Get current month's start and end dates
      const now = new Date();
      const startOfCurrentMonth = startOfMonth(now);
      const endOfCurrentMonth = endOfMonth(now);

      // Get current month's target using query approach (same as AgentDashboard)
      const currentMonth = format(now, 'yyyy-MM');
      const targetsQuery = query(
        collection(db, 'agentTargets'),
        where('agentId', '==', user.id),
        where('month', '==', currentMonth)
      );
      const targetsSnapshot = await getDocs(targetsQuery);
      const targetData = !targetsSnapshot.empty ? targetsSnapshot.docs[0].data() as AgentTarget : null;

      // Query for agent's leads
      const leadsQuery = query(
        collection(db, 'leads'),
        where('agentId', '==', user.id),
        where('status', '==', 'activated')
      );

      const unsubscribe = onSnapshot(leadsQuery, (snapshot) => {
        const activatedLeads = snapshot.docs
          .map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              status: data.status,
              updatedAt: data.updatedAt?.toDate(),
              plans: data.plans
            };
          })
          .filter(lead => 
            lead.updatedAt && 
            lead.updatedAt >= startOfCurrentMonth && 
            lead.updatedAt <= endOfCurrentMonth
          );

        const activated = activatedLeads.reduce((count, lead) => {
          return count + (lead.plans?.length || 0);
        }, 0);

        setMetrics({
          activated,
          mar: targetData?.mar || 0
        });
        setLoading(false);
      }, (error) => {
        // ✅ FIX: Handle permission errors gracefully during logout
        if (error.code === 'permission-denied') {
          // User logged out or lost permissions - cleanup silently
          return;
        }
        
        console.error('Error in MARStrip listener:', error);
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error loading MAR data:', error);
      setLoading(false);
    }
  }, [user.id, user.role]);

  useEffect(() => {
    loadMARData();
  }, [loadMARData]);

  // Don't show for non-agents or if loading
  if (user.role !== 'agent' || loading) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 sm:gap-1.5 bg-gradient-to-r from-cyan-50 to-blue-50 border border-cyan-200 rounded-md sm:rounded-lg px-1.5 sm:px-2 py-1 sm:py-1.5 shadow-sm">
      <div className="flex items-center gap-0.5 sm:gap-1">
        <Target className="h-3 w-3 text-cyan-600 flex-shrink-0" />
        <span className="text-[10px] sm:text-xs font-semibold text-cyan-700 whitespace-nowrap">MAR:</span>
        <span className="text-[10px] sm:text-xs font-bold text-cyan-900">{metrics.mar}</span>
      </div>
      <div className="flex items-center gap-0.5 sm:gap-1">
        <Zap className="h-3 w-3 text-purple-600 flex-shrink-0" />
        <span className="text-[10px] sm:text-xs font-semibold text-purple-700 whitespace-nowrap">Achieved:</span>
        <span className="text-[10px] sm:text-xs font-bold text-purple-900">{metrics.activated}</span>
      </div>
      <div className="ml-0.5 sm:ml-1">
        {metrics.activated < metrics.mar ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-1 text-[9px] sm:text-[10px] bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded px-1 sm:px-1.5 py-0.5 shadow-sm"
          >
            <motion.div 
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0"
            >
              <XCircle className="h-1.5 w-1.5 text-red-500" />
            </motion.div>
            <span className="font-semibold text-red-700 whitespace-nowrap">
              Needs {metrics.mar - metrics.activated} more
            </span>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-1 text-[9px] sm:text-[10px] bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded px-1 sm:px-1.5 py-0.5 shadow-sm"
          >
            <motion.div 
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0"
            >
              <CheckCircle className="h-1.5 w-1.5 text-green-500" />
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  );
} 