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
    <div className="flex items-center gap-3 bg-gradient-to-r from-cyan-50 to-blue-50 border border-cyan-200 rounded-lg px-3 py-2 shadow-sm">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-cyan-600" />
        <span className="text-sm font-semibold text-cyan-700">MAR:</span>
        <span className="text-sm font-bold text-cyan-900">{metrics.mar}</span>
      </div>
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-purple-600" />
        <span className="text-sm font-semibold text-purple-700">Achieved:</span>
        <span className="text-sm font-bold text-purple-900">{metrics.activated}</span>
      </div>
      <div className="ml-2">
        {metrics.activated < metrics.mar ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-2 text-xs bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg px-2 py-1 shadow-sm"
          >
            <motion.div 
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="w-4 h-4 bg-red-100 rounded-full flex items-center justify-center"
            >
              <XCircle className="h-2 w-2 text-red-500" />
            </motion.div>
            <span className="font-semibold text-red-700">
              Needs {metrics.mar - metrics.activated} more
            </span>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-2 text-xs bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg px-2 py-1 shadow-sm"
          >
            <motion.div 
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="w-4 h-4 bg-green-100 rounded-full flex items-center justify-center"
            >
              <CheckCircle className="h-2 w-2 text-green-500" />
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  );
} 