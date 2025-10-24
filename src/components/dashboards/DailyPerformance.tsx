/**
 * ===============================================================================
 * DAILY PERFORMANCE COMPONENT - TEAM DAILY METRICS
 * ===============================================================================
 * 
 * This component provides daily performance metrics for teams, displaying
 * verified and activated leads for a selected date. It enables quick
 * daily performance tracking and analysis.
 * 
 * FEATURES:
 * 
 * 1. DAILY METRICS DISPLAY
 *    - Date-specific lead verification and activation counts
 *    - Real-time metrics for selected date
 *    - Team-based performance aggregation
 * 
 * 2. DATE SELECTION AND NAVIGATION
 *    - Interactive date picker for performance analysis
 *    - Calendar navigation and date-specific filtering
 *    - Collapsible interface for space efficiency
 * 
 * 3. PERFORMANCE INDICATORS
 *    - Visual indicators for verified leads
 *    - Activation metrics and progress tracking
 *    - Total leads created per day statistics
 * 
 * USAGE:
 * This component is typically embedded in manager dashboards to provide
 * quick daily performance insights and team monitoring capabilities.
 * ===============================================================================
 */

import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Calendar as CalendarIcon, CheckCircle, Zap, Users, ChevronDown, ChevronUp, CalendarDays } from 'lucide-react';
import { format, isSameDay } from 'date-fns';

interface DailyPerformanceProps {
  teamId: string;
  forceOpen?: boolean;
}

interface Lead {
  id: string;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
  verifiedAt?: Date | string;
}

function toDateSafe(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as { toDate: unknown }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate();
  }
  if (typeof val === 'string' || typeof val === 'number') return new Date(val);
  return null;
}

export default function DailyPerformance({ teamId, forceOpen }: DailyPerformanceProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    verified: 0,
    activated: 0,
    totalLeads: 0,
  });

  const collapsed = forceOpen === undefined ? isCollapsed : !forceOpen;

  useEffect(() => {
    if (!teamId) return;
    setLoading(true);
    (async () => {
      const leadsQuery = query(collection(db, 'leads'), where('teamId', '==', teamId));
      const snapshot = await getDocs(leadsQuery);
      const leads: Lead[] = snapshot.docs.map(doc => ({
        id: doc.id,
        status: doc.data().status || '',
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate(),
        verifiedAt: doc.data().verifiedAt,
      }));
      let verified = 0;
      let activated = 0;
      let totalLeads = 0;
      leads.forEach(lead => {
        if (lead.createdAt && isSameDay(lead.createdAt, selectedDate)) totalLeads++;
        const verifiedAtDate = toDateSafe(lead.verifiedAt);
        if (verifiedAtDate && isSameDay(verifiedAtDate, selectedDate)) verified++;
        if (lead.status === 'activated' && lead.updatedAt && isSameDay(lead.updatedAt, selectedDate)) activated++;
      });
      setStats({ verified, activated, totalLeads });
      setLoading(false);
    })();
  }, [teamId, selectedDate]);

  return (
    <div className="mb-8">
      {forceOpen === undefined && (
        <div className="flex justify-start">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="group relative inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-green-500 to-blue-600 text-white rounded-2xl font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-300 border-0 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-green-600 to-blue-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative flex items-center gap-3">
              <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
                <CalendarIcon className="h-5 w-5" />
              </div>
              <span className="text-sm font-semibold">
                {isCollapsed ? 'View Daily Performance' : 'Hide Daily Performance'}
              </span>
              <div className="p-1 bg-white/20 rounded-lg backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
                {isCollapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </div>
            </div>
          </button>
        </div>
      )}
      {!collapsed && (
        <div className="mt-6 bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Daily Performance</h2>
              <p className="text-gray-600 mt-1">View your team's performance for any day</p>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-gray-400" />
              <input
                type="date"
                value={format(selectedDate, 'yyyy-MM-dd')}
                onChange={e => setSelectedDate(new Date(e.target.value))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 shadow-sm"
                max={format(new Date(), 'yyyy-MM-dd')}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white shadow-lg flex flex-col items-center">
              <Users className="h-8 w-8 mb-2" />
              <div className="text-4xl font-bold">{loading ? '-' : stats.totalLeads}</div>
              <div className="mt-2 text-lg font-medium">Total Leads</div>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white shadow-lg flex flex-col items-center">
              <CheckCircle className="h-8 w-8 mb-2" />
              <div className="text-4xl font-bold">{loading ? '-' : stats.verified}</div>
              <div className="mt-2 text-lg font-medium">Verified</div>
            </div>
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white shadow-lg flex flex-col items-center">
              <Zap className="h-8 w-8 mb-2" />
              <div className="text-4xl font-bold">{loading ? '-' : stats.activated}</div>
              <div className="mt-2 text-lg font-medium">Activated</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 