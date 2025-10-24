/**
 * ===============================================================================
 * PAYROLL AND ATTENDANCE DASHBOARD COMPONENT - INTEGRATED HR MANAGEMENT
 * ===============================================================================
 * 
 * This component provides a comprehensive dashboard interface for payroll and
 * attendance management, featuring tabbed navigation between different HR
 * functionalities and role-based access control.
 * 
 * FEATURES:
 * 
 * 1. TABBED INTERFACE
 *    - Attendance tracking and management
 *    - Payroll system integration
 *    - Team attendance overview (admin only)
 *    - Leave application and approval workflows
 * 
 * 2. ROLE-BASED ACCESS CONTROL
 *    - Agent: Attendance view and leave applications
 *    - Manager: Payroll access and leave approvals
 *    - Admin: Full access including team views
 * 
 * 3. COMPONENT INTEGRATION
 *    - Seamless integration with AttendanceTable component
 *    - LeaveApplicationModal integration for leave management
 *    - Payroll system components and salary settings
 * 
 * 4. RESPONSIVE DESIGN
 *    - Modal-based interface with smooth animations
 *    - Responsive layout for various screen sizes
 *    - Tab navigation with visual state indicators
 * 
 * USAGE:
 * This component is used as a central hub for HR-related functionalities
 * in the CRM system, providing unified access to attendance and payroll tools.
 * ===============================================================================
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XCircle, Calendar, DollarSign, Users, PlusCircle } from 'lucide-react';
import AttendanceTable from './AttendanceTable';
import LeaveApplicationModal from './LeaveApplicationModal';
import { User } from '../types';
// Stub subcomponents
const SalarySettings = () => <div className="p-6">Salary Settings (Coming Soon)</div>;
const TeamAttendanceView = () => <div className="p-6">Team Attendance View (Coming Soon)</div>;

interface PayrollAndAttendanceDashboardProps {
  open: boolean;
  onClose: () => void;
  role: 'admin' | 'manager' | 'agent';
  user: User;
}

export default function PayrollAndAttendanceDashboard({ open, onClose, role, user }: PayrollAndAttendanceDashboardProps) {
  const [tab, setTab] = useState('attendance');
  const [month, setMonth] = useState(new Date());
  if (!open || !user || !user.id) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-y-auto relative"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full p-2 shadow"
          aria-label="Close"
        >
          <XCircle className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-6 px-8 pt-8 pb-2 border-b">
          <button onClick={() => setTab('attendance')} className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition ${tab==='attendance'?'bg-indigo-100 text-indigo-700':'hover:bg-gray-100 text-gray-600'}`}><Calendar className="w-5 h-5"/>Attendance</button>
          {role!=='agent' && <button onClick={() => setTab('payroll')} className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition ${tab==='payroll'?'bg-green-100 text-green-700':'hover:bg-gray-100 text-gray-600'}`}><DollarSign className="w-5 h-5"/>Payroll</button>}
          {role==='admin' && <button onClick={() => setTab('team')} className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition ${tab==='team'?'bg-orange-100 text-orange-700':'hover:bg-gray-100 text-gray-600'}`}><Users className="w-5 h-5"/>Team View</button>}
          {(role==='agent' || role==='manager') && (
            <button onClick={() => setTab('leave')} className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition ${tab==='leave'?'bg-yellow-100 text-yellow-700':'hover:bg-gray-100 text-gray-600'}`}><PlusCircle className="w-5 h-5"/>{role==='agent' ? 'Apply Leave' : 'Leave Approvals'}</button>
          )}
        </div>
        <div className="p-0">
          <AnimatePresence mode="wait">
            {tab==='attendance' && <AttendanceTable key="attendance" user={user} role={role} month={month} onMonthChange={setMonth} />}
            {tab==='payroll' && role!=='agent' && <SalarySettings key="payroll" />}
            {tab==='team' && role==='admin' && <TeamAttendanceView key="team" />}
            {tab==='leave' && (role === 'agent' || role === 'manager') && (
              <LeaveApplicationModal 
                key="leave" 
                user={user} 
                role={role} 
                teamId={role === 'manager' ? user.teamId : undefined} 
              />
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
} 