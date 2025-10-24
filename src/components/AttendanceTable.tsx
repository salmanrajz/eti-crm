/**
 * ===============================================================================
 * ATTENDANCE TABLE COMPONENT - TEAM ATTENDANCE MANAGEMENT INTERFACE
 * ===============================================================================
 * 
 * This component provides a comprehensive attendance management system for teams,
 * featuring monthly calendar views, attendance tracking, leave management, and
 * performance analytics integration.
 * 
 * FEATURES:
 * 
 * 1. ATTENDANCE TRACKING AND DISPLAY
 *    - Monthly calendar view with daily attendance status
 *    - Real-time attendance updates and synchronization
 *    - Status indicators (present, absent, paid leave, etc.)
 *    - Color-coded visual representation of attendance patterns
 * 
 * 2. LEAVE MANAGEMENT INTEGRATION
 *    - Leave balance calculation and display
 *    - Leave application processing and approval workflows
 *    - Half-day leave support and unpaid leave tracking
 *    - Automated leave accrual and balance updates
 * 
 * 3. PERFORMANCE OPTIMIZATION
 *    - IndexedDB caching for improved performance
 *    - Real-time Firestore listeners with proper cleanup
 *    - Efficient data loading and state management
 *    - Responsive design for mobile and desktop viewing
 * 
 * 4. ADMINISTRATIVE FEATURES
 *    - Role-based access control (admin, manager, agent views)
 *    - Team-wide attendance overview and statistics
 *    - Export capabilities and reporting functions
 *    - Attendance history and trend analysis
 * 
 * 5. USER EXPERIENCE
 *    - Intuitive calendar navigation with month switching
 *    - Responsive design with mobile-optimized interactions
 *    - Loading states and error handling
 *    - Interactive status updates and feedback
 * 
 * USAGE:
 * This component is used in payroll and attendance dashboards to provide
 * managers and administrators with comprehensive attendance management tools.
 * ===============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSunday, isSameDay, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Users, User } from 'lucide-react';
import { User as UserType } from '../types';
import { collection, query, where, getDocs, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { calculateLeaveBalance, type LeaveBalance, clearUserCache } from '../utils/leaveCalculations';

// ===============================================================================
// INDEXEDDB CACHING SYSTEM FOR ATTENDANCE DATA
// ===============================================================================

/**
 * IndexedDB configuration for attendance data caching
 * Improves performance by storing frequently accessed attendance data locally
 */
const DB_NAME = 'AttendanceCache';
const DB_VERSION = 1;
const STORE_NAME = 'teamAttendance';

/**
 * Initializes IndexedDB database for attendance caching
 * Creates object store if it doesn't exist
 */
const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
  });
};

// Cache operations
const getFromCache = async (key: string): Promise<any> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      
      request.onsuccess = () => {
        const result = request.result;
        if (result && Date.now() - result.timestamp < result.ttl) {
          resolve(result.data);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Cache read failed:', error);
    return null;
  }
};

const setCache = async (key: string, data: any, ttl: number = 2 * 60 * 1000): Promise<void> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({
        key,
        data,
        timestamp: Date.now(),
        ttl
      });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn('Cache write failed:', error);
  }
};

const STATUS_COLORS = {
  present: 'bg-green-100 text-green-700',
  absent: 'bg-red-100 text-red-700',
  paid_leave: 'bg-yellow-100 text-yellow-700',
  holiday: 'bg-blue-100 text-blue-700',
  leave_applied: 'bg-orange-100 text-orange-700',
  halfday: 'bg-pink-100 text-pink-700',
  halfday_leave: 'bg-purple-100 text-purple-700',
  halfday_present: 'bg-teal-100 text-teal-700',
};

const STATUS_LABELS = {
  present: 'Present',
  absent: 'Absent',
  paid_leave: 'Paid Leave',
  holiday: 'Holiday',
  leave_applied: 'Leave Applied',
  halfday: 'Halfday',
  halfday_leave: 'Halfday Leave',
  halfday_present: 'Halfday Present',
};


interface AttendanceTableProps {
  user: UserType;
  role: 'admin' | 'manager' | 'agent';
  month: Date;
  onMonthChange: (date: Date) => void;
}

interface TeamAttendance {
  [agentId: string]: {
    [date: string]: keyof typeof STATUS_COLORS;
  };
}

export default function AttendanceTable({ user, role, month, onMonthChange }: AttendanceTableProps) {
  const [agents, setAgents] = useState<{ id: string, name: string }[]>([]);
  const [teams, setTeams] = useState<{ id: string, name: string }[]>([]);
  const [selectedAgent, setSelectedAgent] = useState(role === 'agent' ? user.id : '');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [attendance, setAttendance] = useState<{ [date: string]: keyof typeof STATUS_COLORS }>({});
  const [teamAttendance, setTeamAttendance] = useState<TeamAttendance>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'individual' | 'team'>('individual');
  const [snapshotUnsubscribers, setSnapshotUnsubscribers] = useState<(() => void)[]>([]);
  
  // Cache leave balance for the selected agent and month
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalance | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  useEffect(() => {
    if (role === 'manager') {
      // Fetch agents for this manager's team
      const fetchAgents = async () => {
        if (!user.teamId) return;
        const q = query(
          collection(db, 'users'),
          where('role', '==', 'agent'),
          where('teamId', '==', user.teamId)
        );
        const snapshot = await getDocs(q);
        const agentList = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || 'Unnamed Agent'
        }));
        setAgents(agentList);
        if (agentList.length > 0) setSelectedAgent(agentList[0].id);
      };
      fetchAgents();
    }
  }, [role, user.teamId]);

  // Load teams from Firebase (for admin role)
  useEffect(() => {
    if (role === 'admin') {
      const fetchTeams = async () => {
        try {
          const teamsQuery = query(collection(db, 'teams'));
          const snapshot = await getDocs(teamsQuery);
          const teamsList = snapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name || 'Unnamed Team'
          }));
          setTeams(teamsList);
          if (teamsList.length > 0 && !selectedTeam) {
            setSelectedTeam(teamsList[0].id);
          }
        } catch (error) {
          console.error('Error loading teams:', error);
        }
      };
      fetchTeams();
    }
  }, [role, selectedTeam]);

  // Load agents for selected team (for admin role)
  useEffect(() => {
    if (role === 'admin' && selectedTeam) {
      const fetchAgentsForTeam = async () => {
        try {
          const agentsQuery = query(
            collection(db, 'users'),
            where('teamId', '==', selectedTeam),
            where('role', 'in', ['agent', 'freelancer'])
          );
          const snapshot = await getDocs(agentsQuery);
          const agentsList = snapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name || 'Unnamed Agent'
          }));
          setAgents(agentsList);
          if (agentsList.length > 0) {
            setSelectedAgent(agentsList[0].id);
          } else {
            setSelectedAgent('');
          }
        } catch (error) {
          console.error('Error loading agents for team:', error);
        }
      };
      fetchAgentsForTeam();
    }
  }, [role, selectedTeam]);

  // Load attendance from Firestore
  useEffect(() => {
    async function fetchAttendance() {
      if (!selectedAgent) return;
      setLoading(true);
      const monthStr = format(month, 'yyyy-MM');
      const docRef = doc(db, 'attendance', `${selectedAgent}_${monthStr}`);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setAttendance(docSnap.data().days || {});
      } else {
        setAttendance({});
      }
      setLoading(false);
    }
    fetchAttendance();
  }, [selectedAgent, month]);

  // Load team attendance for team view - only current date
  useEffect(() => {
    async function fetchTeamAttendance() {
      if (viewMode !== 'team' || !agents.length) return;
      setLoading(true);
      const today = new Date();
      const todayStr = format(today, 'yyyy-MM-dd');
      const monthStr = format(today, 'yyyy-MM');
      const teamData: TeamAttendance = {};
      
      for (const agent of agents) {
        const docRef = doc(db, 'attendance', `${agent.id}_${monthStr}`);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const days = docSnap.data().days || {};
          // Only keep today's data
          teamData[agent.id] = {
            [todayStr]: days[todayStr] || null
          };
        } else {
          teamData[agent.id] = {};
        }
      }
      
      setTeamAttendance(teamData);
      setLoading(false);
    }
    fetchTeamAttendance();
  }, [viewMode, agents]);

  // Optimized team attendance loading with caching and real-time updates
  useEffect(() => {
    if (viewMode !== 'team' || !agents.length) return;

    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const monthStr = format(today, 'yyyy-MM');
    const cacheKey = `team_attendance_${user.teamId}_${todayStr}`;

    // Clean up previous snapshots
    snapshotUnsubscribers.forEach(unsub => unsub());
    setSnapshotUnsubscribers([]);

    const loadTeamAttendance = async () => {
      setLoading(true);
      
      // Try to load from cache first
      const cachedData = await getFromCache(cacheKey);
      if (cachedData) {
        setTeamAttendance(cachedData);
        setLoading(false);
      }

      // Set up real-time listeners for each agent
      const unsubscribers: (() => void)[] = [];
      const teamData: TeamAttendance = {};

      for (const agent of agents) {
        const docRef = doc(db, 'attendance', `${agent.id}_${monthStr}`);
        
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
          if (docSnap.exists()) {
            const days = docSnap.data().days || {};
            teamData[agent.id] = {
              [todayStr]: days[todayStr] || null
            };
          } else {
            teamData[agent.id] = {};
          }
          
          // Update state immediately when any agent's data changes
          setTeamAttendance(prev => ({
            ...prev,
            [agent.id]: teamData[agent.id]
          }));
          
          // Cache the updated data
          setCache(cacheKey, teamData);
        }, (error) => {
          console.error('Snapshot error for agent', agent.id, error);
        });
        
        unsubscribers.push(unsubscribe);
      }

      setSnapshotUnsubscribers(unsubscribers);
      setLoading(false);
    };

    loadTeamAttendance();

    // Cleanup function
    return () => {
      snapshotUnsubscribers.forEach(unsub => unsub());
    };
  }, [viewMode, agents, user.teamId]);

  // Load leave balance when agent or month changes
  useEffect(() => {
    async function fetchLeaveBalance() {
      if (!selectedAgent || role === 'agent') return;
      setBalanceLoading(true);
      const monthStr = format(month, 'yyyy-MM');
      try {
        const balance = await calculateLeaveBalance(selectedAgent, monthStr);
        setLeaveBalance(balance);
      } catch (error) {
        console.error('Error loading leave balance:', error);
        setLeaveBalance(null);
      } finally {
        setBalanceLoading(false);
      }
    }
    fetchLeaveBalance();
  }, [selectedAgent, month, role]);

  // Calculate available leave for a specific day (optimized)
  const getAvailableLeaveForDay = useCallback((dayKey: string) => {
    if (!leaveBalance) return 0;
    
    // Calculate what the usage would be without this specific day
    const dayStatus = attendance[dayKey];
    let dayAdjustment = 0;
    
    if (dayStatus === 'paid_leave') {
      dayAdjustment = 1; // If this day is currently paid_leave, we get 1 day back
    } else if (dayStatus === 'halfday_leave') {
      dayAdjustment = 0.5; // If this day is currently halfday_leave, we get 0.5 day back
    }
    
    // Available leave = total available balance + what we get back from changing this day
    return Math.max(0, Number((leaveBalance.availableBalance + dayAdjustment).toFixed(1)));
  }, [leaveBalance, attendance]);

  // Save attendance to Firestore
  const saveAttendance = useCallback(async (newAttendance: { [date: string]: keyof typeof STATUS_COLORS }) => {
    if (!selectedAgent) return;
    setSaving(true);
    try {
      const monthStr = format(month, 'yyyy-MM');
      const docRef = doc(db, 'attendance', `${selectedAgent}_${monthStr}`);
      await setDoc(docRef, {
        userId: selectedAgent,
        month: monthStr,
        days: newAttendance,
        updatedAt: new Date()
      }, { merge: true });
      
      // Clear cache for this user to ensure fresh calculations
      clearUserCache(selectedAgent);
      
      // Reload leave balance after saving
      if (role === 'manager') {
        try {
          const balance = await calculateLeaveBalance(selectedAgent, monthStr);
          setLeaveBalance(balance);
        } catch (error) {
          console.error('Error reloading leave balance:', error);
        }
      }
    } catch (error) {
      console.error('Error saving attendance:', error);
    } finally {
      setSaving(false);
    }
  }, [selectedAgent, month, role]);

  // Save team attendance
  const saveTeamAttendance = useCallback(async (agentId: string, newAttendance: { [date: string]: keyof typeof STATUS_COLORS }) => {
    setSaving(true);
    try {
      const today = new Date();
      const monthStr = format(today, 'yyyy-MM');
      const docRef = doc(db, 'attendance', `${agentId}_${monthStr}`);
      await setDoc(docRef, {
        userId: agentId,
        month: monthStr,
        days: newAttendance,
        updatedAt: new Date()
      }, { merge: true });
      
      // Clear cache for this user
      clearUserCache(agentId);
      
      // Update local state
      setTeamAttendance(prev => ({
        ...prev,
        [agentId]: newAttendance
      }));
    } catch (error) {
      console.error('Error saving team attendance:', error);
    } finally {
      setSaving(false);
    }
  }, []);

  const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });

  // Optimized handleDayClick with cached leave balance
  const handleDayClick = useCallback(async (day: Date) => {
    const key = format(day, 'yyyy-MM-dd');
    const newAttendance = { ...attendance };
    
    if (role === 'agent') {
      newAttendance[key] = 'leave_applied';
      setAttendance(newAttendance);
      saveAttendance(newAttendance);
    } else if (role === 'manager') {
      // Prevent marking attendance for future dates
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time to start of day for accurate comparison
      const selectedDay = new Date(day);
      selectedDay.setHours(0, 0, 0, 0);
      
      if (selectedDay > today) {
        return; // Don't allow marking attendance for future dates
      }
      
      const current = attendance[key];
      
      // Use cached leave balance for instant calculation
      const availableLeave = getAvailableLeaveForDay(key);
      
      // Determine available states based on leave balance
      const availableStates = ['present', 'absent', 'halfday_present'];
      
      // Add paid leave options based on available balance (with floating point tolerance)
      if (availableLeave >= 0.49) { // Use 0.49 to handle floating point precision
        availableStates.push('halfday_leave');
      }
      if (availableLeave >= 0.99) { // Use 0.99 to handle floating point precision
        availableStates.push('paid_leave');
      }
      
      // Cycle through available states
      const currentIndex = current ? availableStates.indexOf(current) : -1;
      const nextIndex = (currentIndex + 1) % availableStates.length;
      newAttendance[key] = availableStates[nextIndex] as keyof typeof STATUS_COLORS;
      
      // Update state immediately for instant UI response
      setAttendance(newAttendance);
      
      // Save to database in background
      saveAttendance(newAttendance);
    }
  }, [role, attendance, getAvailableLeaveForDay, saveAttendance]);

  // Handle team day click
  const handleTeamDayClick = useCallback(async (day: Date, agentId: string) => {
    const key = format(day, 'yyyy-MM-dd');
    const currentAttendance = teamAttendance[agentId] || {};
    const newAttendance = { ...currentAttendance };
    
    // Prevent marking attendance for future dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDay = new Date(day);
    selectedDay.setHours(0, 0, 0, 0);
    
    if (selectedDay > today) {
      return;
    }
    
    const current = currentAttendance[key];
    
    // Simple state cycling for team view (no leave balance check for speed)
    const availableStates = ['present', 'absent', 'halfday_present', 'paid_leave', 'halfday_leave'];
    const currentIndex = current ? availableStates.indexOf(current) : -1;
    const nextIndex = (currentIndex + 1) % availableStates.length;
    newAttendance[key] = availableStates[nextIndex] as keyof typeof STATUS_COLORS;
    
    // Update state immediately
    setTeamAttendance(prev => ({
      ...prev,
      [agentId]: newAttendance
    }));
    
    // Save to database in background
    saveTeamAttendance(agentId, newAttendance);
  }, [teamAttendance, saveTeamAttendance]);

  // Right-click for halfday (manager only) - also optimized
  const handleDayContextMenu = useCallback((day: Date, e: React.MouseEvent) => {
    if (role !== 'manager') return;
    e.preventDefault();
    
    // Prevent marking attendance for future dates
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day for accurate comparison
    const selectedDay = new Date(day);
    selectedDay.setHours(0, 0, 0, 0);
    
    if (selectedDay > today) {
      return; // Don't allow marking attendance for future dates
    }
    
    const key = format(day, 'yyyy-MM-dd');
    const availableLeave = getAvailableLeaveForDay(key);
    
    // Only allow halfday leave if there's enough balance
    if (availableLeave >= 0.49) {
      const newAttendance = { ...attendance };
      newAttendance[key] = 'halfday_leave';
      setAttendance(newAttendance);
      saveAttendance(newAttendance);
    }
  }, [role, attendance, getAvailableLeaveForDay, saveAttendance]);

  // Handle team day context menu
  const handleTeamDayContextMenu = useCallback((day: Date, agentId: string, e: React.MouseEvent) => {
    if (role !== 'manager') return;
    e.preventDefault();
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDay = new Date(day);
    selectedDay.setHours(0, 0, 0, 0);
    
    if (selectedDay > today) {
      return;
    }
    
    const key = format(day, 'yyyy-MM-dd');
    const currentAttendance = teamAttendance[agentId] || {};
    const newAttendance = { ...currentAttendance };
    newAttendance[key] = 'halfday_leave';
    
    setTeamAttendance(prev => ({
      ...prev,
      [agentId]: newAttendance
    }));
    
    saveTeamAttendance(agentId, newAttendance);
  }, [role, teamAttendance, saveTeamAttendance]);

  if (loading) return <div className="p-6 text-gray-400">Loading attendance...</div>;

  // Team view component
  const TeamAttendanceView = () => {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const dayName = format(today, 'EEE'); // Mon, Tue, etc.
    const dayNumber = format(today, 'd');
    
    return (
      <div className="overflow-x-auto">
        <div className="min-w-max">
          {/* Header with current date */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="w-32 font-semibold text-gray-700">Employee</div>
            <div className="w-32 text-center font-semibold text-gray-700">
              {dayName}, {dayNumber}
            </div>
          </div>
          
          {/* Employee rows */}
          {agents.map(agent => {
            const status = teamAttendance[agent.id]?.[todayStr];
            const isSunday = today.getDay() === 0;
            const finalStatus = isSunday ? 'holiday' : status;
            
            return (
              <div key={agent.id} className="grid grid-cols-2 gap-4 mb-3">
                <div className="w-32 flex items-center text-sm font-medium text-gray-900 truncate">
                  {agent.name}
                </div>
                <div className="w-32 flex justify-center">
                  <button
                    onClick={!isSunday ? () => handleTeamDayClick(today, agent.id) : undefined}
                    onContextMenu={!isSunday ? (e) => handleTeamDayContextMenu(today, agent.id, e) : undefined}
                    className={`w-20 h-12 rounded-lg text-sm font-bold border transition-colors duration-150 flex flex-col items-center justify-center
                      ${finalStatus ? STATUS_COLORS[finalStatus] : 'bg-gray-50 text-gray-400'}
                      ${isSunday ? 'cursor-not-allowed opacity-60' : 'hover:bg-indigo-50 cursor-pointer'}`}
                    disabled={isSunday}
                    title={isSunday ? 'Sunday is a holiday' : 'Click to cycle through attendance states. Right-click for halfday leave.'}
                  >
                    {finalStatus ? STATUS_LABELS[finalStatus] : 'Mark'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={() => onMonthChange(subMonths(month, 1))} className="p-2 rounded hover:bg-gray-100"><ChevronLeft /></button>
          <span className="font-bold text-lg">{format(month, 'MMMM yyyy')}</span>
          <button onClick={() => onMonthChange(addMonths(month, 1))} className="p-2 rounded hover:bg-gray-100"><ChevronRight /></button>
        </div>
        {role === 'manager' && (
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('individual')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'individual' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <User className="w-4 h-4 inline mr-1" />
                Individual
              </button>
              <button
                onClick={() => setViewMode('team')}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'team' 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Users className="w-4 h-4 inline mr-1" />
                Team View
              </button>
            </div>
            
            {/* Individual view controls */}
            {viewMode === 'individual' && (
              <>
                <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)} className="ml-4 px-3 py-2 rounded border">
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                {(balanceLoading || saving) && (
                  <span className="text-xs text-gray-500">
                    {balanceLoading ? 'Loading balance...' : 'Saving...'}
                  </span>
                )}
                {leaveBalance && !balanceLoading && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    Available: {leaveBalance.availableBalance} days
                  </span>
                )}
              </>
            )}
            
            {/* Team view status */}
            {viewMode === 'team' && (
              <span className="text-xs text-gray-500 bg-blue-100 px-2 py-1 rounded">
                {saving ? 'Saving...' : `Today - ${agents.length} employees`}
              </span>
            )}
          </div>
        )}
        {role === 'admin' && (
          <>
            <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} className="ml-4 px-3 py-2 rounded border">
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={selectedAgent} onChange={e => setSelectedAgent(e.target.value)} className="ml-4 px-3 py-2 rounded border">
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </>
        )}
      </div>
      
      {/* Team View */}
      {viewMode === 'team' && role === 'manager' ? (
        <TeamAttendanceView />
      ) : (
        /* Individual View */
        <div className="grid grid-cols-7 gap-2 mb-4">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} className="aspect-square w-10 flex items-center justify-center font-semibold text-gray-500">{d}</div>
          ))}
          {/* Add empty cells for days before the first day of the month */}
          {Array.from({ length: startOfMonth(month).getDay() }, (_, i) => (
            <div key={`empty-${i}`} className="aspect-square w-10 rounded-lg border border-transparent"></div>
          ))}
          {days.map(day => {
            const key = format(day, 'yyyy-MM-dd');
            let status = attendance[key];
            if (isSunday(day)) status = 'holiday';
            
            // Check if this is a future date for managers
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const selectedDay = new Date(day);
            selectedDay.setHours(0, 0, 0, 0);
            const isFutureDate = selectedDay > today;
            const isManagerAndFuture = role === 'manager' && isFutureDate;
            
            return (
              <button
                key={key}
                onClick={role !== 'agent' && !isManagerAndFuture ? () => handleDayClick(day) : undefined}
                onContextMenu={role === 'manager' && !isFutureDate ? (e) => handleDayContextMenu(day, e) : undefined}
                className={`aspect-square w-10 rounded-lg flex flex-col items-center justify-center text-xs font-bold border transition-colors duration-150
                  ${status ? STATUS_COLORS[status] : 'bg-gray-50 text-gray-400'}
                  ${isSameDay(day, new Date()) ? 'ring-2 ring-indigo-400' : ''}
                  ${isManagerAndFuture ? 'cursor-not-allowed opacity-60' : ''}
                  ${role==='agent' ? 'cursor-not-allowed' : isManagerAndFuture ? '' : 'hover:bg-indigo-50 cursor-pointer'}`}
                disabled={role==='agent' || isManagerAndFuture}
                title={isManagerAndFuture ? 'Cannot mark attendance for future dates' : undefined}
              >
                {format(day, 'd')}
                {status && <span className="block text-[10px] font-normal">{STATUS_LABELS[status]}</span>}
              </button>
            );
          })}
        </div>
      )}
      
      <div className="flex flex-wrap gap-4 mt-6">
        <div className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-green-100 border border-green-300 inline-block" /> Present</div>
        <div className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-red-100 border border-red-300 inline-block" /> Absent</div>
        <div className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-yellow-100 border border-yellow-300 inline-block" /> Paid Leave</div>
        <div className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-blue-100 border border-blue-300 inline-block" /> Holiday</div>
        <div className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-orange-100 border border-orange-300 inline-block" /> Leave Applied</div>
        <div className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-pink-100 border border-pink-300 inline-block" /> Halfday</div>
        <div className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-purple-100 border border-purple-300 inline-block" /> Halfday Leave</div>
        <div className="flex items-center gap-2"><span className="w-4 h-4 rounded bg-teal-100 border border-teal-300 inline-block" /> Halfday Present</div>
      </div>
      <div className="mt-4 text-sm text-gray-500">
        1.5 paid leaves accrue per month with carry forward till December. Each year resets in January. Sundays are holidays. 
        {role === 'manager' && ' Attendance can only be marked for current and past dates.'}
        {' '}You can apply for unpaid leave when balance is exceeded.
        {leaveBalance && role === 'manager' && viewMode === 'individual' && (
          <span className="ml-4 text-indigo-600">
            Service since: {leaveBalance.firstAttendanceMonth} | 
            Current year accrued: {leaveBalance.totalAccrued} days | 
            Current year used: {leaveBalance.totalUsed} days
          </span>
        )}
        {viewMode === 'team' && role === 'manager' && (
          <span className="ml-4 text-blue-600">
            💡 Today's Team View: Click to mark attendance for today. Right-click for halfday leave.
          </span>
        )}
      </div>
    </div>
  );
} 