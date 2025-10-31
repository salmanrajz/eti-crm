/**
 * ===============================================================================
 * LEAVE APPLICATION MODAL COMPONENT - LEAVE MANAGEMENT INTERFACE
 * ===============================================================================
 * 
 * This component provides a comprehensive leave management system for agents and
 * managers, featuring leave application submission, approval workflows, balance
 * tracking, and historical leave management.
 * 
 * FEATURES:
 * 
 * 1. LEAVE APPLICATION SYSTEM
 *    - Leave application submission with dates and reasons
 *    - Half-day and full-day leave support
 *    - Unpaid leave options and tracking
 *    - Leave balance validation and checking
 * 
 * 2. APPROVAL WORKFLOW MANAGEMENT
 *    - Role-based approval system (agent, manager, admin)
 *    - Leave status tracking (pending, approved, rejected)
 *    - Manager approval interface with bulk actions
 *    - Application history and status updates
 * 
 * 3. LEAVE BALANCE TRACKING
 *    - Real-time leave balance calculations
 *    - Leave accrual and carry-forward management
 *    - Balance display and validation
 *    - Integration with attendance system
 * 
 * 4. HISTORICAL MANAGEMENT
 *    - Month-based leave history organization
 *    - Collapsible interface for efficient navigation
 *    - Application details and status tracking
 *    - Trend analysis and reporting
 * 
 * USAGE:
 * This component is used in payroll and attendance systems to provide
 * comprehensive leave management for all user roles.
 * ===============================================================================
 */

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Calendar, CheckCircle, XCircle, Clock, Edit2, TrendingUp, CheckCheck, Circle, ChevronDown, ChevronRight } from 'lucide-react';
import { User } from '../types';
import { db } from '../lib/firebase';
import { collection, addDoc, updateDoc, doc, onSnapshot, query, where, orderBy, setDoc, getDoc } from 'firebase/firestore';
import { calculateLeaveBalance, type LeaveBalance } from '../utils/leaveCalculations';

interface LeaveApplicationModalProps {
  user: User;
  role: 'agent' | 'manager' | 'admin';
  teamId?: string;
  open?: boolean;
  onClose?: () => void;
}

interface LeaveApp {
  id: string;
  date: Date;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  agentName: string;
  userId: string;
  teamId?: string;
  appliedAt?: Date;
  halfday?: boolean;
  isUnpaidLeave?: boolean;
}

export default function LeaveApplicationModal({ user, role, teamId, open, onClose }: LeaveApplicationModalProps) {
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [applications, setApplications] = useState<LeaveApp[]>([]);
  const [loading, setLoading] = useState(true);
  // Initialize with all months collapsed by default
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(() => {
    // Start with all months collapsed - will be populated when applications load
    return new Set();
  });

  // Month selection state for cards
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return format(now, 'yyyy-MM');
  });

  // Leave balance state with carry forward
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance>({
    totalAccrued: 0,
    totalUsed: 0,
    availableBalance: 0,
    firstAttendanceMonth: null,
    monthsOfService: 0
  });

  // When date changes, update selectedMonth
  useEffect(() => {
    if (date) {
      setSelectedMonth(date.slice(0, 7));
    }
  }, [date]);

  // Load leave balance with carry forward for selected month
  useEffect(() => {
    if (role === 'agent' && user?.id) {
      calculateLeaveBalance(user.id, selectedMonth).then(setLeaveBalance);
    }
  }, [selectedMonth, user?.id, role, applications]); // Re-calculate when applications change

  // Collapse all months by default when applications first load
  useEffect(() => {
    if (applications.length > 0) {
      const monthKeys = Array.from(new Set(applications.map(app => format(app.date, 'yyyy-MM'))));
      setCollapsedMonths(new Set(monthKeys));
    }
  }, [applications]);

  useEffect(() => {
    let q;
    if (role === 'agent' && user?.id) {
      q = query(
        collection(db, 'leaveApplications'),
        where('userId', '==', user.id),
        orderBy('date', 'desc')
      );
    } else if (role === 'manager' && teamId) {
      q = query(
        collection(db, 'leaveApplications'),
        where('teamId', '==', teamId),
        orderBy('date', 'desc')
      );
    } else if (role === 'admin') {
      q = query(
        collection(db, 'leaveApplications'),
        orderBy('date', 'desc')
      );
    }
    if (!q) return;
    setLoading(true);
    const unsub = onSnapshot(q, snap => {
      setApplications(snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate ? doc.data().date.toDate() : new Date(doc.data().date),
        appliedAt: doc.data().appliedAt?.toDate ? doc.data().appliedAt.toDate() : undefined
      })) as LeaveApp[]);
      setLoading(false);
    }, (error) => {
      // ✅ FIX: Handle permission errors gracefully during logout
      if (error.code === 'permission-denied') {
        // User logged out or lost permissions - cleanup silently
        return;
      }
      
      console.error('Error in LeaveApplicationModal listener:', error);
    });
    return () => unsub();
  }, [role, user?.id, teamId]);

  // Early return after all hooks are declared
  if (!user || !user.id) {
    return <div className="p-6 text-red-500">User not found. Please reload or contact support.</div>;
  }

  // Helper: get year and month from selectedMonth
  const [selectedYearNum, selectedMonthNum] = selectedMonth.split('-').map(Number);

  // Filter applications for selected month
  const applicationsThisMonth = applications.filter(app =>
    app.date.getFullYear() === selectedYearNum &&
    app.date.getMonth() === selectedMonthNum - 1
  );

  const pendingCount = applicationsThisMonth.filter(app => app.status === 'pending').length;
  const approvedCount = applicationsThisMonth.filter(app => app.status === 'approved').length;
  const rejectedCount = applicationsThisMonth.filter(app => app.status === 'rejected').length;
  const unpaidCount = applicationsThisMonth.filter(app => app.isUnpaidLeave && app.status !== 'rejected').length;
  const availableLeaveMonth = leaveBalance.availableBalance;
  const leaveExceededMonth = leaveBalance.availableBalance <= 0;

  async function handleApply() {
    setSubmitting(true);
    try {
      const isUnpaidLeave = leaveExceededMonth; // Flag if this is unpaid leave
      await addDoc(collection(db, 'leaveApplications'), {
        userId: user.id,
        agentName: user.name,
        teamId: user.teamId || teamId || '',
        date: new Date(date),
        status: 'pending',
        reason,
        appliedAt: new Date(),
        isUnpaidLeave // Add flag for unpaid leave
      });
      setDate('');
      setReason('');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(id: string, userId: string, date: Date, halfday = false, isUnpaidLeave = false) {
    await updateDoc(doc(db, 'leaveApplications', id), { status: 'approved', halfday });
    // Mark attendance appropriately based on whether it's paid or unpaid leave
    const monthStr = format(date, 'yyyy-MM');
    const docRef = doc(db, 'attendance', `${userId}_${monthStr}`);
    const docSnap = await getDoc(docRef);
    let days: Record<string, string> = {};
    if (docSnap.exists()) {
      days = docSnap.data().days || {};
    }
    
    if (isUnpaidLeave) {
      // Unpaid leave is marked as absent
      days[format(date, 'yyyy-MM-dd')] = 'absent';
    } else {
      // Paid leave is marked as paid_leave or halfday_leave
      days[format(date, 'yyyy-MM-dd')] = halfday ? 'halfday_leave' : 'paid_leave';
    }
    
    await setDoc(docRef, {
      userId,
      month: monthStr,
      days,
      updatedAt: new Date()
    }, { merge: true });
  }
  async function handleReject(id: string) {
    await updateDoc(doc(db, 'leaveApplications', id), { status: 'rejected' });
  }

  // Calculate leave stats for the agent
  const currentYear = new Date().getFullYear();
  const leavesThisYear = applications.filter(app => app.date.getFullYear() === currentYear && app.status !== 'rejected');
  const leaveCount = leavesThisYear.length;
  const LEAVE_LIMIT = 12;
  const leaveExceeded = leaveCount >= LEAVE_LIMIT;
  const alreadyAppliedForDate = !!applications.find(app => format(app.date, 'yyyy-MM-dd') === date);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const isPastDate = !!date && date < todayStr;

  // Group applications by month
  const groupedApplications = applications.reduce((groups, app) => {
    const monthKey = format(app.date, 'yyyy-MM');
    if (!groups[monthKey]) {
      groups[monthKey] = [];
    }
    groups[monthKey].push(app);
    return groups;
  }, {} as Record<string, LeaveApp[]>);

  // Sort months in descending order (newest first)
  const sortedMonths = Object.keys(groupedApplications).sort((a, b) => b.localeCompare(a));

  // Toggle month collapse/expand
  const toggleMonth = (monthKey: string) => {
    const newCollapsed = new Set(collapsedMonths);
    if (newCollapsed.has(monthKey)) {
      newCollapsed.delete(monthKey);
    } else {
      newCollapsed.add(monthKey);
    }
    setCollapsedMonths(newCollapsed);
  };

  // Get month statistics
  const getMonthStats = (monthApps: LeaveApp[]) => {
    const pending = monthApps.filter(app => app.status === 'pending').length;
    const approved = monthApps.filter(app => app.status === 'approved').length;
    const rejected = monthApps.filter(app => app.status === 'rejected').length;
    const unpaid = monthApps.filter(app => app.isUnpaidLeave && app.status !== 'rejected').length;
    return { pending, approved, rejected, unpaid, total: monthApps.length };
  };

  return (
    <>
      {open ? (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
          onClick={(e) => {
            if (e.target === e.currentTarget && onClose) {
              onClose();
            }
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full mx-4 relative max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Leave Application</h2>
                <p className="text-sm text-gray-500 mt-1">Apply for leave and view your applications</p>
              </div>
              {onClose && (
                <button
                  onClick={onClose}
                  className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label="Close"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <div className="overflow-y-auto flex-1">
              <div className="p-6">
                {role === 'agent' && (
                  <div className="mb-8">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-indigo-700"><Edit2 className="w-6 h-6" />Apply for Leave</h3>
                    {/* Status + Leave Cards in a single row */}
                    <div className="flex flex-wrap gap-4 mb-6">
                      {/* Pending */}
                      <div className="flex-1 min-w-[140px] bg-gradient-to-br from-yellow-100 to-yellow-50 border border-yellow-200 rounded-2xl p-4 flex flex-col items-center shadow hover:shadow-md transition">
                        <Clock className="w-6 h-6 text-yellow-500 mb-1" />
                        <span className="text-yellow-700 font-bold text-xl">{pendingCount}</span>
                        <span className="text-xs text-yellow-700 font-semibold">Pending</span>
                      </div>
                      {/* Approved */}
                      <div className="flex-1 min-w-[140px] bg-gradient-to-br from-green-100 to-green-50 border border-green-200 rounded-2xl p-4 flex flex-col items-center shadow hover:shadow-md transition">
                        <CheckCircle className="w-6 h-6 text-green-500 mb-1" />
                        <span className="text-green-700 font-bold text-xl">{approvedCount}</span>
                        <span className="text-xs text-green-700 font-semibold">Approved</span>
                      </div>
                      {/* Rejected */}
                      <div className="flex-1 min-w-[140px] bg-gradient-to-br from-red-100 to-red-50 border border-red-200 rounded-2xl p-4 flex flex-col items-center shadow hover:shadow-md transition">
                        <XCircle className="w-6 h-6 text-red-500 mb-1" />
                        <span className="text-red-700 font-bold text-xl">{rejectedCount}</span>
                        <span className="text-xs text-red-700 font-semibold">Rejected</span>
                      </div>
                      {/* Available Leave Balance */}
                      <div className="flex-1 min-w-[140px] bg-gradient-to-br from-indigo-100 to-indigo-50 border border-indigo-200 rounded-2xl p-4 flex flex-col items-center shadow hover:shadow-md transition">
                        <CheckCheck className="w-6 h-6 text-indigo-500 mb-1" />
                        <span className="text-indigo-700 font-bold text-xl">{availableLeaveMonth}</span>
                        <span className="text-xs text-indigo-700 font-semibold">Available Balance</span>
                      </div>
                      {/* Total Accrued Leave Balance */}
                      <div className="flex-1 min-w-[140px] bg-gradient-to-br from-purple-100 to-purple-50 border border-purple-200 rounded-2xl p-4 flex flex-col items-center shadow hover:shadow-md transition">
                        <TrendingUp className="w-6 h-6 text-purple-500 mb-1" />
                        <span className="text-purple-700 font-bold text-xl">{leaveBalance.totalAccrued}</span>
                        <span className="text-xs text-purple-700 font-semibold">Total Accrued</span>
                      </div>
                      {/* Unpaid Leave Count */}
                      {unpaidCount > 0 && (
                        <div className="flex-1 min-w-[140px] bg-gradient-to-br from-orange-100 to-orange-50 border border-orange-200 rounded-2xl p-4 flex flex-col items-center shadow hover:shadow-md transition">
                          <Circle className="w-6 h-6 text-orange-500 mb-1 fill-current" />
                          <span className="text-orange-700 font-bold text-xl">{unpaidCount}</span>
                          <span className="text-xs text-orange-700 font-semibold">Unpaid Leave</span>
                        </div>
                      )}
                    </div>
                    {/* Month Selector */}
                    <div className="mb-2 flex items-center gap-2">
                      <label className="text-xs font-semibold text-gray-500">Month:</label>
                      <input
                        type="month"
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                        className="px-2 py-1 rounded border text-sm"
                        max="9999-12"
                      />
                    </div>
                    {/* Leave Service Information */}
                    {leaveBalance.firstAttendanceMonth && (
                      <div className="mb-4 p-3 bg-gray-50 rounded-lg border text-sm">
                        <div className="flex flex-wrap gap-4 text-gray-600">
                          <span><strong>Service Start:</strong> {leaveBalance.firstAttendanceMonth}</span>
                          <span><strong>Months of Service:</strong> {leaveBalance.monthsOfService}</span>
                          <span><strong>Current Year Accrued:</strong> {leaveBalance.totalAccrued} days</span>
                          <span><strong>Current Year Used:</strong> {leaveBalance.totalUsed} days</span>
                          <span><strong>Carry Forward:</strong> Till December</span>
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                          Leave balance resets each January. Current year balance is calculated from January or your employment start, whichever is later.
                          Unused leave carries forward within the year only. You can apply for unpaid leave when your balance is exceeded.
                        </div>
                      </div>
                    )}
                    {/* Modern Apply Section */}
                    <div className="flex flex-col sm:flex-row gap-4 items-center mb-4 mt-2 bg-white rounded-xl shadow p-4">
                      <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2 rounded border w-40" min={todayStr} />
                      <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason" className="px-3 py-2 rounded border flex-1" />
                      <button onClick={handleApply} disabled={!date || !reason || submitting || alreadyAppliedForDate || leaveExceeded || isPastDate} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-semibold shadow hover:bg-indigo-700 transition disabled:opacity-50 text-base">
                        {submitting ? 'Applying...' : (leaveExceededMonth ? 'Apply (Unpaid)' : 'Apply')}
                      </button>
                    </div>
                    {alreadyAppliedForDate && <div className="text-sm text-red-500 font-semibold mt-1">You have already applied for leave on this date.</div>}
                    {isPastDate && <div className="text-sm text-red-500 font-semibold mt-1">You cannot apply for leave on a past date.</div>}
                    {leaveExceededMonth && date && !alreadyAppliedForDate && !isPastDate && (
                      <div className="text-sm text-orange-600 font-semibold mt-1 bg-orange-50 p-2 rounded border border-orange-200">
                        ⚠️ This will be unpaid leave as you have exceeded your available balance,({availableLeaveMonth} days remaining), and you will  be marked as ABSENT ❌.
                      </div>
                    )}
                  </div>
                )}
                <div className="border-t border-gray-100 pt-8">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                      <div className="p-2 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl">
                        <Calendar className="w-6 h-6 text-white" />
                      </div>
                      Leave Applications
                    </h3>
                    <div className="text-sm text-gray-500 font-medium">
                      {applications.length} {applications.length === 1 ? 'application' : 'applications'}
                    </div>
                  </div>
                  
                  {loading ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                        <p className="text-gray-500 font-medium">Loading applications...</p>
                      </div>
                    </div>
                  ) : applications.length === 0 ? (
                    <div className="text-center py-16">
                      <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                        <Calendar className="w-8 h-8 text-gray-400" />
                      </div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-2">No applications yet</h4>
                      <p className="text-gray-500">Your leave applications will appear here once submitted.</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {sortedMonths.map(monthKey => {
                        const monthApps = groupedApplications[monthKey];
                        const stats = getMonthStats(monthApps);
                        const isCollapsed = collapsedMonths.has(monthKey);
                        const [year, month] = monthKey.split('-');
                        const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
                        
                        return (
                          <div key={monthKey} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                            {/* Month Header */}
                            <div 
                              className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200 p-4 cursor-pointer hover:from-gray-100 hover:to-gray-200 transition-all duration-200"
                              onClick={() => toggleMonth(monthKey)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center gap-2">
                                    {isCollapsed ? (
                                      <ChevronRight className="w-5 h-5 text-gray-500" />
                                    ) : (
                                      <ChevronDown className="w-5 h-5 text-gray-500" />
                                    )}
                                    <h4 className="text-lg font-bold text-gray-900">
                                      {format(monthDate, 'MMMM yyyy')}
                                    </h4>
                                  </div>
                                  <span className="text-sm text-gray-500 font-medium">
                                    {stats.total} {stats.total === 1 ? 'application' : 'applications'}
                                  </span>
                                </div>
                                
                                {/* Month Stats */}
                                <div className="flex items-center gap-3">
                                  {stats.pending > 0 && (
                                    <div className="flex items-center gap-1 px-2 py-1 bg-yellow-100 rounded-full">
                                      <Clock className="w-3 h-3 text-yellow-600" />
                                      <span className="text-xs font-semibold text-yellow-700">{stats.pending}</span>
                                    </div>
                                  )}
                                  {stats.approved > 0 && (
                                    <div className="flex items-center gap-1 px-2 py-1 bg-green-100 rounded-full">
                                      <CheckCircle className="w-3 h-3 text-green-600" />
                                      <span className="text-xs font-semibold text-green-700">{stats.approved}</span>
                                    </div>
                                  )}
                                  {stats.rejected > 0 && (
                                    <div className="flex items-center gap-1 px-2 py-1 bg-red-100 rounded-full">
                                      <XCircle className="w-3 h-3 text-red-600" />
                                      <span className="text-xs font-semibold text-red-700">{stats.rejected}</span>
                                    </div>
                                  )}
                                  {stats.unpaid > 0 && (
                                    <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 rounded-full">
                                      <Circle className="w-3 h-3 text-orange-600 fill-current" />
                                      <span className="text-xs font-semibold text-orange-700">{stats.unpaid}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            {/* Month Applications */}
                            {!isCollapsed && (
                              <div className="p-4 space-y-4">
                                {monthApps.map(app => (
                                  <div key={app.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border">
                                    <div className="flex items-center gap-4">
                                      <div className="flex flex-col">
                                        <span className="font-semibold text-gray-900">{format(app.date, 'EEEE, MMMM d, yyyy')}</span>
                                        <span className="text-sm text-gray-600">{app.reason}</span>
                                        <span className="text-xs text-gray-700 font-medium">By: {app.agentName || 'Unknown'}</span>
                                        <span className="text-xs text-gray-500">Applied: {app.appliedAt ? format(app.appliedAt, 'MMM d, yyyy h:mm a') : 'N/A'}</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                                        app.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                        app.status === 'approved' ? 'bg-green-100 text-green-700' :
                                        'bg-red-100 text-red-700'
                                      }`}>
                                        {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                                      </span>
                                      {(role === 'admin' || role === 'manager') && app.status === 'pending' && (
                                        <div className="flex gap-2">
                                          <button
                                            onClick={() => handleApprove(app.id, app.userId, app.date, false, app.isUnpaidLeave)}
                                            className="px-3 py-1 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition"
                                          >
                                            Approve
                                          </button>
                                          <button
                                            onClick={() => handleReject(app.id)}
                                            className="px-3 py-1 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition"
                                          >
                                            Reject
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6">
          {role === 'agent' && (
            <div className="mb-6">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2 text-indigo-700"><Edit2 className="w-6 h-6" />Apply for Leave</h3>
              {/* Status + Leave Cards in a single row */}
              <div className="flex flex-wrap gap-4 mb-6">
                {/* Pending */}
                <div className="flex-1 min-w-[140px] bg-gradient-to-br from-yellow-100 to-yellow-50 border border-yellow-200 rounded-2xl p-4 flex flex-col items-center shadow hover:shadow-md transition">
                  <Clock className="w-6 h-6 text-yellow-500 mb-1" />
                  <span className="text-yellow-700 font-bold text-xl">{pendingCount}</span>
                  <span className="text-xs text-yellow-700 font-semibold">Pending</span>
                </div>
                {/* Approved */}
                <div className="flex-1 min-w-[140px] bg-gradient-to-br from-green-100 to-green-50 border border-green-200 rounded-2xl p-4 flex flex-col items-center shadow hover:shadow-md transition">
                  <CheckCircle className="w-6 h-6 text-green-500 mb-1" />
                  <span className="text-green-700 font-bold text-xl">{approvedCount}</span>
                  <span className="text-xs text-green-700 font-semibold">Approved</span>
                </div>
                {/* Rejected */}
                <div className="flex-1 min-w-[140px] bg-gradient-to-br from-red-100 to-red-50 border border-red-200 rounded-2xl p-4 flex flex-col items-center shadow hover:shadow-md transition">
                  <XCircle className="w-6 h-6 text-red-500 mb-1" />
                  <span className="text-red-700 font-bold text-xl">{rejectedCount}</span>
                  <span className="text-xs text-red-700 font-semibold">Rejected</span>
                </div>
                {/* Available Leave Balance */}
                <div className="flex-1 min-w-[140px] bg-gradient-to-br from-indigo-100 to-indigo-50 border border-indigo-200 rounded-2xl p-4 flex flex-col items-center shadow hover:shadow-md transition">
                  <CheckCheck className="w-6 h-6 text-indigo-500 mb-1" />
                  <span className="text-indigo-700 font-bold text-xl">{availableLeaveMonth}</span>
                  <span className="text-xs text-indigo-700 font-semibold">Available Balance</span>
                </div>
                {/* Total Accrued Leave Balance */}
                <div className="flex-1 min-w-[140px] bg-gradient-to-br from-purple-100 to-purple-50 border border-purple-200 rounded-2xl p-4 flex flex-col items-center shadow hover:shadow-md transition">
                  <TrendingUp className="w-6 h-6 text-purple-500 mb-1" />
                  <span className="text-purple-700 font-bold text-xl">{leaveBalance.totalAccrued}</span>
                  <span className="text-xs text-purple-700 font-semibold">Total Accrued</span>
                </div>
                {/* Unpaid Leave Count */}
                {unpaidCount > 0 && (
                  <div className="flex-1 min-w-[140px] bg-gradient-to-br from-orange-100 to-orange-50 border border-orange-200 rounded-2xl p-4 flex flex-col items-center shadow hover:shadow-md transition">
                    <Circle className="w-6 h-6 text-orange-500 mb-1 fill-current" />
                    <span className="text-orange-700 font-bold text-xl">{unpaidCount}</span>
                    <span className="text-xs text-orange-700 font-semibold">Unpaid Leave</span>
                  </div>
                )}
              </div>
              {/* Month Selector */}
              <div className="mb-2 flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500">Month:</label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="px-2 py-1 rounded border text-sm"
                  max="9999-12"
                />
              </div>
              {/* Leave Service Information */}
              {leaveBalance.firstAttendanceMonth && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg border text-sm">
                  <div className="flex flex-wrap gap-4 text-gray-600">
                    <span><strong>Service Start:</strong> {leaveBalance.firstAttendanceMonth}</span>
                    <span><strong>Months of Service:</strong> {leaveBalance.monthsOfService}</span>
                    <span><strong>Current Year Accrued:</strong> {leaveBalance.totalAccrued} days</span>
                    <span><strong>Current Year Used:</strong> {leaveBalance.totalUsed} days</span>
                    <span><strong>Carry Forward:</strong> Till December</span>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Leave balance resets each January. Current year balance is calculated from January or your employment start, whichever is later.
                    Unused leave carries forward within the year only. You can apply for unpaid leave when your balance is exceeded.
                  </div>
                </div>
              )}
              {/* Modern Apply Section */}
              <div className="flex flex-col sm:flex-row gap-4 items-center mb-4 mt-2 bg-white rounded-xl shadow p-4">
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="px-3 py-2 rounded-lg border w-full sm:w-40" min={todayStr} />
                <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason" className="px-3 py-2 rounded border flex-1" />
                <button onClick={handleApply} disabled={!date || !reason || submitting || alreadyAppliedForDate || leaveExceeded || isPastDate} className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-semibold shadow hover:bg-indigo-700 transition disabled:opacity-50 text-base">
                  {submitting ? 'Applying...' : (leaveExceededMonth ? 'Apply (Unpaid)' : 'Apply')}
                </button>
              </div>
              {alreadyAppliedForDate && <div className="text-sm text-red-500 font-semibold mt-1">You have already applied for leave on this date.</div>}
              {isPastDate && <div className="text-sm text-red-500 font-semibold mt-1">You cannot apply for leave on a past date.</div>}
              {leaveExceededMonth && date && !alreadyAppliedForDate && !isPastDate && (
                <div className="text-sm text-orange-600 font-semibold mt-1 bg-orange-50 p-2 rounded border border-orange-200">
                  ⚠️ This will be unpaid leave as you have exceeded your available balance,({availableLeaveMonth} days remaining), and you will  be marked as ABSENT ❌.
                </div>
              )}
            </div>
          )}
          <div className="border-t border-gray-100 pt-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <div className="p-2 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl">
                  <Calendar className="w-6 h-6 text-white" />
                </div>
                Leave Applications
              </h3>
              <div className="text-sm text-gray-500 font-medium">
                {applications.length} {applications.length === 1 ? 'application' : 'applications'}
              </div>
            </div>
            
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                  <p className="text-gray-500 font-medium">Loading applications...</p>
                </div>
              </div>
            ) : applications.length === 0 ? (
              <div className="text-center py-16">
                <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                  <Calendar className="w-8 h-8 text-gray-400" />
                </div>
                <h4 className="text-lg font-semibold text-gray-900 mb-2">No applications yet</h4>
                <p className="text-gray-500">Your leave applications will appear here once submitted.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {sortedMonths.map(monthKey => {
                  const monthApps = groupedApplications[monthKey];
                  const stats = getMonthStats(monthApps);
                  const isCollapsed = collapsedMonths.has(monthKey);
                  const [year, month] = monthKey.split('-');
                  const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
                  
                  return (
                    <div key={monthKey} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                      {/* Month Header */}
                      <div 
                        className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200 p-4 cursor-pointer hover:from-gray-100 hover:to-gray-200 transition-all duration-200"
                        onClick={() => toggleMonth(monthKey)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              {isCollapsed ? (
                                <ChevronRight className="w-5 h-5 text-gray-500" />
                              ) : (
                                <ChevronDown className="w-5 h-5 text-gray-500" />
                              )}
                              <h4 className="text-lg font-bold text-gray-900">
                                {format(monthDate, 'MMMM yyyy')}
                              </h4>
                            </div>
                            <span className="text-sm text-gray-500 font-medium">
                              {stats.total} {stats.total === 1 ? 'application' : 'applications'}
                            </span>
                          </div>
                          
                          {/* Month Stats */}
                          <div className="flex items-center gap-3">
                            {stats.pending > 0 && (
                              <div className="flex items-center gap-1 px-2 py-1 bg-yellow-100 rounded-full">
                                <Clock className="w-3 h-3 text-yellow-600" />
                                <span className="text-xs font-semibold text-yellow-700">{stats.pending}</span>
                              </div>
                            )}
                            {stats.approved > 0 && (
                              <div className="flex items-center gap-1 px-2 py-1 bg-green-100 rounded-full">
                                <CheckCircle className="w-3 h-3 text-green-600" />
                                <span className="text-xs font-semibold text-green-700">{stats.approved}</span>
                              </div>
                            )}
                            {stats.rejected > 0 && (
                              <div className="flex items-center gap-1 px-2 py-1 bg-red-100 rounded-full">
                                <XCircle className="w-3 h-3 text-red-600" />
                                <span className="text-xs font-semibold text-red-700">{stats.rejected}</span>
                              </div>
                            )}
                            {stats.unpaid > 0 && (
                              <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 rounded-full">
                                <Circle className="w-3 h-3 text-orange-600 fill-current" />
                                <span className="text-xs font-semibold text-orange-700">{stats.unpaid}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Month Applications */}
                      {!isCollapsed && (
                        <div className="p-4 space-y-4">
                          {monthApps.map(app => (
                            <div key={app.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border">
                              <div className="flex items-center gap-4">
                                <div className="flex flex-col">
                                  <span className="font-semibold text-gray-900">{format(app.date, 'EEEE, MMMM d, yyyy')}</span>
                                  <span className="text-sm text-gray-600">{app.reason}</span>
                                  <span className="text-xs text-gray-700 font-medium">By: {app.agentName || 'Unknown'}</span>
                                  <span className="text-xs text-gray-500">Applied: {app.appliedAt ? format(app.appliedAt, 'MMM d, yyyy h:mm a') : 'N/A'}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                                  app.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                  app.status === 'approved' ? 'bg-green-100 text-green-700' :
                                  'bg-red-100 text-red-700'
                                }`}>
                                  {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                                </span>
                                {(role === 'admin' || role === 'manager') && app.status === 'pending' && (
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleApprove(app.id, app.userId, app.date, false, app.isUnpaidLeave)}
                                      className="px-3 py-1 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => handleReject(app.id)}
                                      className="px-3 py-1 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
} 