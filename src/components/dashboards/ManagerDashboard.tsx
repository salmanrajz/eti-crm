/**
 * ===============================================================================
 * MANAGER DASHBOARD COMPONENT - TEAM MANAGEMENT INTERFACE
 * ===============================================================================
 * 
 * This component provides the main dashboard for managers, offering comprehensive
 * team oversight, performance analytics, and management tools for team operations.
 * 
 * FEATURES:
 * 
 * 1. TEAM PERFORMANCE ANALYTICS
 *    - Agent performance metrics and achievement tracking
 *    - Team-wide statistics and comparison charts
 *    - Historical performance trends and forecasting
 * 
 * 2. TEAM MANAGEMENT TOOLS
 *    - Agent target setting and management
 *    - Commission configuration and tracking
 *    - Team capacity and workload distribution
 * 
 * 3. COMPREHENSIVE REPORTING
 *    - Daily, weekly, and monthly performance reports
 *    - Interactive charts and visual analytics
 *    - Export capabilities for management reporting
 * 
 * 4. HR AND ADMINISTRATION
 *    - Payroll management integration
 *    - Attendance tracking and management
 *    - Leave application processing
 * 
 * 5. OPERATIONAL OVERSIGHT
 *    - Team reserved numbers management
 *    - Lead distribution and assignment oversight
 *    - Real-time team activity monitoring
 * 
 * USAGE:
 * This component is used by users with 'manager' role to effectively
 * manage and monitor team performance and operations.
 * ===============================================================================
 */

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, doc, setDoc, getDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { User, Lead } from '../../types';
import { Link } from 'react-router-dom';
import { format, subMonths, startOfMonth, endOfMonth, eachMonthOfInterval, addMonths } from 'date-fns';
import { 
  Users, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Zap, 
  Calendar, 
  Building2, 
  ClipboardList,
  Hash,
  User2,
  Target,
  Pencil,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  BarChart3,
  PieChart,
  TrendingUp,
  UserCheck,
  FileText,
  X,
  DollarSign,
  Phone,
  AlertCircle,
  Download
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { clsx } from 'clsx';
import { motion } from 'framer-motion';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  RadialLinearScale,
} from 'chart.js';
import { Bar, Doughnut, Line, Radar } from 'react-chartjs-2';
import DailyPerformance from './DailyPerformance';
import PayrollButton from '../PayrollButton';
import AttendanceTable from '../AttendanceTable';
import LeaveApplicationModal from '../LeaveApplicationModal';
import { CommissionConfig } from '../CommissionConfig';
import { TeamReservedNumbers } from './TeamReservedNumbers';
import jsPDF from 'jspdf';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  RadialLinearScale
);

interface ManagerDashboardProps {
  user: User;
}

interface AgentMetrics {
  agentId: string;
  agentName: string;
  agentEmail: string;
  totalLeads: number;
  pendingVerification: number;
  verified: number;
  rejected: number;
  activated: number;
  pendingAssignment: number;
  assigned: number;
}

interface MonthlyMetrics {
  totalLeads: number;
  pendingVerification: number;
  verified: number;
  rejected: number;
  activated: number;
  pendingAssignment: number;
  assigned: number;
  nonVerified: number;
}

interface AgentTarget {
  agentId: string;
  target: number;
  mar: number; // Min Target Required
  month: string; // Format: YYYY-MM
}

interface BonusAmounts {
  targetAchievement: number;
  risingStar: number;
  superAchiever: number;
  elitePerformer: number;
  masterAchiever: number;
  legendaryStatus: number;
}

interface MonthlyAgentMetrics extends AgentMetrics {
  month: string;
}

interface AgentPerformanceData {
  month: string;
  totalLeads: number;
  verified: number;
  activated: number;
  target: number;
  achievement: number;
}

export function ManagerDashboard({ user }: ManagerDashboardProps) {
  const [metrics, setMetrics] = useState({
    totalLeads: 0,
    pendingVerification: 0,
    verified: 0,
    rejected: 0,
    activated: 0,
    pendingAssignment: 0,
    assigned: 0,
    nonVerified: 0
  });
  const [monthlyMetrics, setMonthlyMetrics] = useState<MonthlyMetrics>({
    totalLeads: 0,
    pendingVerification: 0,
    verified: 0,
    rejected: 0,
    activated: 0,
    pendingAssignment: 0,
    assigned: 0,
    nonVerified: 0
  });
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [agentMetrics, setAgentMetrics] = useState<AgentMetrics[]>([]);
  const [loadingAgentMetrics, setLoadingAgentMetrics] = useState(false);
  const [agentTargets, setAgentTargets] = useState<Record<string, AgentTarget>>({});
  const [teamTarget, setTeamTarget] = useState<number | null>(null);
  const [isTargetDialogOpen, setIsTargetDialogOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<User | null>(null);
  const [targetAmount, setTargetAmount] = useState('');
  const [marAmount, setMarAmount] = useState('');
  const [isBonusDialogOpen, setIsBonusDialogOpen] = useState(false);
  const [bonusAmounts, setBonusAmounts] = useState<BonusAmounts>({
    targetAchievement: 0,
    risingStar: 0,
    superAchiever: 0,
    elitePerformer: 0,
    masterAchiever: 0,
    legendaryStatus: 0
  });
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [monthlyAgentMetrics, setMonthlyAgentMetrics] = useState<MonthlyAgentMetrics[]>([]);
  const [viewMode, setViewMode] = useState<'table' | 'charts'>('table');
  const [showReservedModal, setShowReservedModal] = useState(false);
  const [chartType, setChartType] = useState<'bar' | 'radar' | 'line'>('bar');
  const [isAgentDetailsOpen, setIsAgentDetailsOpen] = useState(false);
  const [selectedAgentDetails, setSelectedAgentDetails] = useState<{
    agent: User;
    performanceData: AgentPerformanceData[];
  } | null>(null);
  const [dateRange, setDateRange] = useState({
    start: subMonths(new Date(), 5),
    end: new Date()
  });
  const [isLoadingAgentData, setIsLoadingAgentData] = useState(false);
  const [clickedAgentId, setClickedAgentId] = useState<string | null>(null);
  const [isBonusSettingsCollapsed, setIsBonusSettingsCollapsed] = useState(true);
  const [isDailyPerformanceCollapsed, setIsDailyPerformanceCollapsed] = useState(true);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [attendanceMonth, setAttendanceMonth] = useState(new Date());
  const [teamData, setTeamData] = useState<{ commissionBased: boolean } | null>(null);
  const [showCommissionConfigModal, setShowCommissionConfigModal] = useState(false);

  useEffect(() => {
    loadManagerData();
    loadBonusAmounts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMonth]);

  async function loadManagerData() {
    try {
      if (!user?.teamId) {
        setMetrics({
          totalLeads: 0,
          pendingVerification: 0,
          verified: 0,
          rejected: 0,
          activated: 0,
          pendingAssignment: 0,
          assigned: 0,
          nonVerified: 0
        });
        setMonthlyMetrics({
          totalLeads: 0,
          pendingVerification: 0,
          verified: 0,
          rejected: 0,
          activated: 0,
          pendingAssignment: 0,
          assigned: 0,
          nonVerified: 0
        });
        setTeamMembers([]);
        setAgentMetrics([]);
        setMonthlyAgentMetrics([]);
        setTeamData(null);
        toast.error('You are not assigned to any team. Please contact an administrator.');
        return;
      }

      setLoadingAgentMetrics(true);

      // Load team data
      const teamDoc = await getDoc(doc(db, 'teams', user.teamId));
      let teamName = 'Unknown Team';
      if (teamDoc.exists()) {
        const team = teamDoc.data();
        teamName = team.name || 'Unknown Team';
        setTeamData({
          commissionBased: team.commissionBased || false
        });
      }
      // Store team name for exports
      (window as any).__teamName__ = teamName;

      // Load team members
      const teamMembersQuery = query(
        collection(db, 'users'),
        where('teamId', '==', user.teamId)
      );
      const teamMembersSnapshot = await getDocs(teamMembersQuery);
      const members = teamMembersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as User[];

      setTeamMembers(members);
      if (members.length === 0) {
        toast('Your team has no members yet.');
      }

      // Load team leads
      const teamLeadsQuery = query(
        collection(db, 'leads'),
        where('teamId', '==', user.teamId),
        orderBy('createdAt', 'desc')
      );
      const teamLeadsSnapshot = await getDocs(teamLeadsQuery);      
      const teamLeads = teamLeadsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Lead[];

      // Calculate overall team metrics
      const teamMetrics = {
        totalLeads: teamLeads.length,
        pendingVerification: 0,
        verified: 0,
        rejected: 0,
        activated: 0,
        pendingAssignment: 0,
        assigned: 0,
        nonVerified: 0
      };

      // Calculate monthly metrics
      const now = new Date();
      const startOfCurrentMonth = startOfMonth(now);
      const endOfCurrentMonth = endOfMonth(now);
      const monthlyMetricsData = {
        totalLeads: 0,
        pendingVerification: 0,
        verified: 0,
        rejected: 0,
        activated: 0,
        pendingAssignment: 0,
        assigned: 0,
        nonVerified: 0
      };

      teamLeads.forEach(lead => {
        // Overall metrics
        if (lead.status === 'pending_verification') teamMetrics.pendingVerification++;
        if (lead.status === 'verified') teamMetrics.verified++;
        if (lead.status === 'rejected') teamMetrics.rejected++;
        if (lead.status === 'activated' || lead.status === 'activated_non_verified') teamMetrics.activated++;
        if (lead.status === 'pending_assignment') teamMetrics.pendingAssignment++;
        // Include follow_up leads with managerAssigned === false in pendingAssignment
        if (lead.status === 'follow_up' && !lead.managerAssigned) {
          teamMetrics.pendingAssignment++;
        }
        if (lead.status === 'assigned') teamMetrics.assigned++;
        if (lead.status === 'non_verified') teamMetrics.nonVerified++;

        // Monthly metrics - for most statuses, check if created in current month
        if (lead.createdAt && lead.createdAt >= startOfCurrentMonth && lead.createdAt <= endOfCurrentMonth) {
          monthlyMetricsData.totalLeads++;
          if (lead.status === 'pending_verification') monthlyMetricsData.pendingVerification++;
          if (lead.status === 'verified') monthlyMetricsData.verified++;
          if (lead.status === 'rejected') monthlyMetricsData.rejected++;
          if (lead.status === 'pending_assignment') monthlyMetricsData.pendingAssignment++;
          // Include follow_up leads with managerAssigned === false in pendingAssignment
          if (lead.status === 'follow_up' && !lead.managerAssigned) {
            monthlyMetricsData.pendingAssignment++;
          }
          if (lead.status === 'assigned') monthlyMetricsData.assigned++;
          if (lead.status === 'non_verified') monthlyMetricsData.nonVerified++;
        }
      });

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

      // Calculate activated leads for current month based on activatedAt (fallback updatedAt)
      const currentMonthActivatedLeads = teamLeads.filter(lead => {
        if (lead.status !== 'activated') return false;
        const activatedAt = getActivatedAt(lead);
        return activatedAt !== null && activatedAt >= startOfCurrentMonth && activatedAt <= endOfCurrentMonth;
      });
      
      // Count total activations by summing up plans in each activated lead
      monthlyMetricsData.activated = currentMonthActivatedLeads.reduce((count, lead) => {
        return count + (lead.plans?.length || 0);
      }, 0);

      setMetrics(teamMetrics);
      setMonthlyMetrics(monthlyMetricsData);

      // Calculate metrics for each agent for the selected month
      const startDate = startOfMonth(selectedMonth);
      const endDate = endOfMonth(selectedMonth);
      
      const agentMetricsData = members
        .map(agent => {
          if (agent.role !== 'agent') return null;
          
          const agentLeads = teamLeads.filter(lead => 
            lead.agentId === agent.id && 
            lead.createdAt && 
            lead.createdAt >= startDate && 
            lead.createdAt <= endDate
          );

          // Calculate verified leads for the agent in selected month based on verifiedAt date
          const agentVerifiedLeads = teamLeads.filter(lead => {
            if (lead.agentId !== agent.id) return false;
            const verifiedAtRaw = (lead as any).verifiedAt;
            if (!verifiedAtRaw) return false;
            
            // Convert Firestore timestamp to Date if needed
            let verifiedAtDate: Date;
            if (verifiedAtRaw instanceof Date) {
              verifiedAtDate = verifiedAtRaw;
            } else if (verifiedAtRaw && typeof verifiedAtRaw.toDate === 'function') {
              verifiedAtDate = verifiedAtRaw.toDate();
            } else {
              verifiedAtDate = new Date(verifiedAtRaw);
            }
            
            return verifiedAtDate >= startDate && verifiedAtDate <= endDate;
          });
          
          // Count verified leads from daily activity
          const verified = agentVerifiedLeads.length;

          // Calculate activated leads for the agent in selected month based on when they were activated
          const agentActivatedLeads = teamLeads.filter(lead => {
            if (lead.agentId !== agent.id || lead.status !== 'activated') return false;
            const activatedAt = getActivatedAt(lead);
            return activatedAt !== null && activatedAt >= startDate && activatedAt <= endDate;
          });
          
          // Count total activations by summing up plans in each activated lead
          const activated = agentActivatedLeads.reduce((count, lead) => {
            return count + (lead.plans?.length || 0);
          }, 0);

          return {
            agentId: agent.id,
            agentName: agent.name,
            agentEmail: agent.email,
            totalLeads: agentLeads.length,
            pendingVerification: agentLeads.filter(l => l.status === 'pending_verification').length,
            verified: verified,
            rejected: agentLeads.filter(l => l.status === 'rejected').length,
            activated: activated,
            pendingAssignment: agentLeads.filter(l => l.status === 'pending_assignment').length,
            assigned: agentLeads.filter(l => l.status === 'assigned').length,
            month: format(selectedMonth, 'yyyy-MM')
          };
        }).filter((metric): metric is MonthlyAgentMetrics => metric !== null);

      setMonthlyAgentMetrics(agentMetricsData);
      setAgentMetrics(agentMetricsData);

      // Load agent targets
      const currentMonth = format(selectedMonth, 'yyyy-MM');
      const targetsQuery = query(
        collection(db, 'agentTargets'),
        where('teamId', '==', user.teamId),
        where('month', '==', currentMonth)
      );
      const targetsSnapshot = await getDocs(targetsQuery);
      const targets: Record<string, AgentTarget> = {};
      targetsSnapshot.forEach(doc => {
        const data = doc.data();
        targets[data.agentId] = {
          agentId: data.agentId,
          target: data.target || 0,
          mar: data.mar || 0, // Default to 0 if MAR doesn't exist
          month: data.month
        };
      });
      setAgentTargets(targets);

      // Load team target with auto-carry-forward logic
      await loadTeamTarget(selectedMonth);
    } catch (error) {
      console.error('Error loading manager data:', error instanceof Error ? error.message : error);
      toast.error('Failed to load team data');
    } finally {
      setLoadingAgentMetrics(false);
      setLoading(false);
    }
  }

  // Load team target with auto-carry-forward logic
  // If current month doesn't have a target, check previous month and carry forward
  async function loadTeamTarget(month: Date) {
    if (!user?.teamId) return;
    
    try {
      const monthStr = format(month, 'yyyy-MM');
      const teamTargetRef = doc(db, 'teamTargets', `${user.teamId}_${monthStr}`);
      const teamTargetDoc = await getDoc(teamTargetRef);
      
      if (teamTargetDoc.exists()) {
        // Current month has a target, use it
        const target = teamTargetDoc.data()?.target;
        setTeamTarget(target || null);
      } else {
        // Current month doesn't have a target, check previous month
        const previousMonth = subMonths(month, 1);
        const previousMonthStr = format(previousMonth, 'yyyy-MM');
        const previousTeamTargetRef = doc(db, 'teamTargets', `${user.teamId}_${previousMonthStr}`);
        const previousTeamTargetDoc = await getDoc(previousTeamTargetRef);
        
        if (previousTeamTargetDoc.exists()) {
          // Carry forward from previous month
          const previousTarget = previousTeamTargetDoc.data()?.target;
          if (previousTarget !== undefined) {
            // Auto-carry forward: save to current month without changing previous month
            await setDoc(teamTargetRef, {
              teamId: user.teamId,
              target: previousTarget,
              month: monthStr,
              updatedAt: serverTimestamp(),
              setBy: 'auto-carry-forward',
              carriedFrom: previousMonthStr
            }, { merge: true });
            setTeamTarget(previousTarget);
          } else {
            setTeamTarget(null);
          }
        } else {
          // No target in previous month either
          setTeamTarget(null);
        }
      }
    } catch (error) {
      console.error('Error loading team target:', error);
      setTeamTarget(null);
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
          targetAchievement: data.targetAchievement || 0,
          risingStar: data.risingStar || 0,
          superAchiever: data.superAchiever || 0,
          elitePerformer: data.elitePerformer || 0,
          masterAchiever: data.masterAchiever || 0,
          legendaryStatus: data.legendaryStatus || 0
        });
      }
    } catch (error) {
      console.error('Error loading bonus amounts:', error);
      toast.error('Failed to load bonus amounts');
    }
  }

  // Export Team Performance to Excel with modern colorful styling
  const handleExportToExcel = async () => {
    try {
      // Try ExcelJS first for full styling support
      let ExcelJS;
      try {
        const exceljsModule = await import('exceljs');
        ExcelJS = exceljsModule.default || exceljsModule;
      } catch {
        // ExcelJS not available, use xlsx fallback
        ExcelJS = null;
      }

      if (ExcelJS) {
        // Use ExcelJS for styled export
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Team Performance');

        // Prepare data (with verified column)
        const exportData = agentMetrics.map((agent) => {
          const target = agentTargets[agent.agentId]?.target || 0;
          const mar = agentTargets[agent.agentId]?.mar || 0;
          const achievement = target > 0 ? parseFloat(((agent.activated / target) * 100).toFixed(1)) : 0;
          
          return {
            agent: agent.agentName || agent.agentEmail || 'Unknown',
            totalLeads: agent.totalLeads,
            verified: agent.verified,
            activated: agent.activated,
            target: target,
            mar: mar,
            achievement: achievement
          };
        });

        // Get team name
        const teamName = (window as any).__teamName__ || 'Unknown Team';
        
        // Title row with date
        const currentDate = format(new Date(), 'dd MMMM yyyy');
        const titleText = `${teamName} - Team Performance Report - ${format(selectedMonth, 'MMMM yyyy')} - ${currentDate}`;
        const titleRow = worksheet.addRow([titleText]);
        worksheet.mergeCells(1, 1, 1, 7);
        // Style only the first cell (merged area)
        const titleCell = titleRow.getCell(1);
        titleCell.font = { bold: true, size: 16, color: { argb: 'FF1E293B' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.height = 30;
        worksheet.addRow([]);

        // Headers (with Verified column)
        const headers = ['Agent', 'Total Leads', 'Verified', 'Activated', 'Target', 'MAR', 'Achievement %'];
        const headerRow = worksheet.addRow(headers);
        headerRow.height = 25;
        // Style only the header cells (columns 1-7)
        for (let col = 1; col <= 7; col++) {
          const cell = headerRow.getCell(col);
          cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin' }, bottom: { style: 'thin' },
            left: { style: 'thin' }, right: { style: 'thin' }
          };
        }

        // Data rows with color coding
        exportData.forEach((agent) => {
          const row = worksheet.addRow([
            agent.agent, agent.totalLeads, agent.verified, agent.activated,
            agent.target, agent.mar, `${agent.achievement}%`
          ]);

          let bgColor = 'FFF3F4F6';
          let achievementColor = 'FF6B7280';
          if (agent.achievement >= 100) {
            bgColor = 'FFD1FAE5';
            achievementColor = 'FF059669';
          } else if (agent.achievement >= 80) {
            bgColor = 'FFDBEAFE';
            achievementColor = 'FF2563EB';
          } else if (agent.achievement >= 50) {
            bgColor = 'FFFEF3C7';
            achievementColor = 'FFD97706';
          } else {
            bgColor = 'FFFEE2E2';
            achievementColor = 'FFDC2626';
          }

          // Style only the data cells (columns 1-7) - Agent name centered
          for (let col = 1; col <= 7; col++) {
            const cell = row.getCell(col);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
            cell.font = { size: 11 };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          }

          const achievementCell = row.getCell(7);
          achievementCell.font = { bold: true, size: 12, color: { argb: achievementColor } };
        });

        // Summary row
        const totals = {
          agent: 'TOTAL',
          totalLeads: exportData.reduce((sum, a) => sum + a.totalLeads, 0),
          verified: exportData.reduce((sum, a) => sum + a.verified, 0),
          activated: exportData.reduce((sum, a) => sum + a.activated, 0),
          target: exportData.reduce((sum, a) => sum + a.target, 0),
          mar: exportData.reduce((sum, a) => sum + a.mar, 0),
          achievement: exportData.length > 0 && exportData.reduce((sum, a) => sum + a.target, 0) > 0
            ? parseFloat(((exportData.reduce((sum, a) => sum + a.activated, 0) / exportData.reduce((sum, a) => sum + a.target, 0)) * 100).toFixed(1))
            : 0
        };

        const summaryRow = worksheet.addRow([
          totals.agent, totals.totalLeads, totals.verified, totals.activated,
          totals.target, totals.mar, `${totals.achievement}%`
        ]);

        summaryRow.height = 25;
        // Style only the summary cells (columns 1-7)
        for (let col = 1; col <= 7; col++) {
          const cell = summaryRow.getCell(col);
          cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'medium' }, bottom: { style: 'medium' },
            left: { style: 'thin' }, right: { style: 'thin' }
          };
        }

        worksheet.columns = [
          { width: 25 }, { width: 12 }, { width: 12 }, { width: 12 },
          { width: 12 }, { width: 12 }, { width: 15 }
        ];

        const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
        const monthStr = format(selectedMonth, 'MMMM-yyyy');
        const teamNameForFile = (teamName || 'Team').replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `${teamNameForFile}_Team_Performance_${monthStr}_${timestamp}.xlsx`;

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        window.URL.revokeObjectURL(url);
        
        toast.success('Team Performance report exported successfully!', { duration: 3000, icon: '✅' });
        return;
      }

      // Fallback to xlsx (basic formatting, no colors)
      const XLSX = await import('xlsx');
      
      // Get team name
      const teamName = (window as any).__teamName__ || 'Unknown Team';
      
      const exportData = agentMetrics.map((agent) => {
        const target = agentTargets[agent.agentId]?.target || 0;
        const mar = agentTargets[agent.agentId]?.mar || 0;
        const achievement = target > 0 ? ((agent.activated / target) * 100).toFixed(1) : '0.0';
        
        return {
          'Agent': agent.agentName || agent.agentEmail || 'Unknown',
          'Total Leads': agent.totalLeads,
          'Verified': agent.verified,
          'Activated': agent.activated,
          'Target': target,
          'MAR': mar,
          'Achievement %': `${achievement}%`
        };
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);
      ws['!cols'] = [
        { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 15 }
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Team Performance');

      const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
      const monthStr = format(selectedMonth, 'MMMM-yyyy');
      const teamNameForFile = ((window as any).__teamName__ || 'Team').replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${teamNameForFile}_Team_Performance_${monthStr}_${timestamp}.xlsx`;
      XLSX.writeFile(wb, filename);
      
      toast.success('Team Performance report exported successfully!', { duration: 3000, icon: '✅' });
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      toast.error('Failed to export to Excel');
    }
  };

  // Export Team Performance to PDF with beautiful styling
  const handleExportToPDF = async () => {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - (margin * 2);
      let yPosition = margin;

      // Prepare data (with verified column)
      const exportData = agentMetrics.map((agent) => {
        const target = agentTargets[agent.agentId]?.target || 0;
        const mar = agentTargets[agent.agentId]?.mar || 0;
        const achievement = target > 0 ? parseFloat(((agent.activated / target) * 100).toFixed(1)) : 0;
        
        return {
          agent: agent.agentName || agent.agentEmail || 'Unknown',
          totalLeads: agent.totalLeads,
          verified: agent.verified,
          activated: agent.activated,
          target: target,
          mar: mar,
          achievement: achievement
        };
      });


      // Get team name
      const teamName = (window as any).__teamName__ || 'Unknown Team';
      
      // Header with gradient effect (dark indigo to lighter)
      pdf.setFillColor(79, 70, 229); // Indigo
      pdf.rect(margin, yPosition, contentWidth, 30, 'F');
      
      // Add subtle border
      pdf.setDrawColor(99, 102, 241);
      pdf.setLineWidth(0.5);
      pdf.rect(margin, yPosition, contentWidth, 30);
      
      // Title with team name
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(22);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${teamName} - Team Performance Report`, pageWidth / 2, yPosition + 12, { align: 'center' });
      
      // Subtitle with date
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(255, 255, 255, 0.9);
      const currentDate = format(new Date(), 'dd MMMM yyyy');
      const monthStr = format(selectedMonth, 'MMMM yyyy');
      pdf.text(`${monthStr} - Generated on ${currentDate}`, pageWidth / 2, yPosition + 22, { align: 'center' });
      
      yPosition += 38;

      // Table setup
      const tableTop = yPosition;
      const rowHeight = 8;
      const headerHeight = 10;
      const colWidths = [
        contentWidth * 0.18, // Agent
        contentWidth * 0.12, // Total Leads
        contentWidth * 0.12, // Verified
        contentWidth * 0.12, // Activated
        contentWidth * 0.12, // Target
        contentWidth * 0.10, // MAR
        contentWidth * 0.24  // Achievement %
      ];
      let xPosition = margin;

      // Table headers with enhanced styling
      pdf.setFillColor(79, 70, 229); // Indigo
      pdf.rect(xPosition, yPosition, contentWidth, headerHeight, 'F');
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      
      const headers = ['Agent', 'Total Leads', 'Verified', 'Activated', 'Target', 'MAR', 'Achievement %'];
      headers.forEach((header, index) => {
        pdf.text(header, xPosition + colWidths[index] / 2, yPosition + 7.5, { align: 'center' });
        if (index < headers.length - 1) {
          xPosition += colWidths[index];
        }
      });
      
      // Header borders - draw all lines (after headers is declared)
      pdf.setDrawColor(99, 102, 241);
      pdf.setLineWidth(0.3);
      // Draw all column lines in header
      let headerCellX = margin;
      headers.forEach((_, colIndex) => {
        pdf.line(headerCellX, yPosition, headerCellX, yPosition + headerHeight);
        headerCellX += colWidths[colIndex];
      });
      // Draw rightmost line
      pdf.line(margin + contentWidth, yPosition, margin + contentWidth, yPosition + headerHeight);
      // Draw top and bottom lines
      pdf.line(margin, yPosition, margin + contentWidth, yPosition);
      pdf.line(margin, yPosition + headerHeight, margin + contentWidth, yPosition + headerHeight);
      
      yPosition += headerHeight;
      xPosition = margin;

      // Data rows
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      
      exportData.forEach((agent, index) => {
        // Check if we need a new page
        if (yPosition + rowHeight > pageHeight - margin - 30) {
          pdf.addPage();
          yPosition = margin;
        }

        // Determine row color based on achievement
        let bgColor = { r: 243, g: 244, b: 246 }; // Gray
        let textColor = { r: 31, g: 41, b: 55 }; // Dark gray
        let achievementColor = { r: 107, g: 114, b: 128 }; // Gray
        
        if (agent.achievement >= 100) {
          bgColor = { r: 209, g: 250, b: 229 }; // Green
          achievementColor = { r: 5, g: 150, b: 105 }; // Dark green
        } else if (agent.achievement >= 80) {
          bgColor = { r: 219, g: 234, b: 254 }; // Blue
          achievementColor = { r: 37, g: 99, b: 235 }; // Dark blue
        } else if (agent.achievement >= 50) {
          bgColor = { r: 254, g: 243, b: 199 }; // Yellow
          achievementColor = { r: 217, g: 119, b: 6 }; // Dark yellow
        } else {
          bgColor = { r: 254, g: 226, b: 226 }; // Red
          achievementColor = { r: 220, g: 38, b: 38 }; // Dark red
        }

        // Draw row background
        pdf.setFillColor(bgColor.r, bgColor.g, bgColor.b);
        pdf.rect(margin, yPosition, contentWidth, rowHeight, 'F');

        // Draw cell borders with visible lines
        pdf.setDrawColor(200, 200, 200); // Medium gray for better visibility
        pdf.setLineWidth(0.2);
        let cellX = margin;
        headers.forEach((_, colIndex) => {
          // Draw vertical lines (column separators)
          pdf.line(cellX, yPosition, cellX, yPosition + rowHeight);
          // Draw horizontal lines (row separators)
          pdf.line(cellX, yPosition, cellX + colWidths[colIndex], yPosition);
          pdf.line(cellX, yPosition + rowHeight, cellX + colWidths[colIndex], yPosition + rowHeight);
          cellX += colWidths[colIndex];
        });
        // Draw rightmost vertical line
        pdf.line(margin + contentWidth, yPosition, margin + contentWidth, yPosition + rowHeight);

        // Add cell content
        pdf.setTextColor(textColor.r, textColor.g, textColor.b);
        xPosition = margin;
        
        // Agent name (centered)
        pdf.text(agent.agent, xPosition + colWidths[0] / 2, yPosition + 5.5, { align: 'center', maxWidth: colWidths[0] - 2 });
        xPosition += colWidths[0];
        
        // Total Leads
        pdf.text(agent.totalLeads.toString(), xPosition + colWidths[1] / 2, yPosition + 5.5, { align: 'center' });
        xPosition += colWidths[1];
        
        // Verified
        pdf.text(agent.verified.toString(), xPosition + colWidths[2] / 2, yPosition + 5.5, { align: 'center' });
        xPosition += colWidths[2];
        
        // Activated
        pdf.text(agent.activated.toString(), xPosition + colWidths[3] / 2, yPosition + 5.5, { align: 'center' });
        xPosition += colWidths[3];
        
        // Target
        pdf.text(agent.target.toString(), xPosition + colWidths[4] / 2, yPosition + 5.5, { align: 'center' });
        xPosition += colWidths[4];
        
        // MAR
        pdf.text(agent.mar.toString(), xPosition + colWidths[5] / 2, yPosition + 5.5, { align: 'center' });
        xPosition += colWidths[5];
        
        // Achievement % (bold and colored)
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(achievementColor.r, achievementColor.g, achievementColor.b);
        pdf.text(`${agent.achievement}%`, xPosition + colWidths[6] / 2, yPosition + 5.5, { align: 'center' });
        pdf.setFont('helvetica', 'normal');
        
        yPosition += rowHeight;
      });

      // Summary row
      const totals = {
        agent: 'TOTAL',
        totalLeads: exportData.reduce((sum, a) => sum + a.totalLeads, 0),
        verified: exportData.reduce((sum, a) => sum + a.verified, 0),
        activated: exportData.reduce((sum, a) => sum + a.activated, 0),
        target: exportData.reduce((sum, a) => sum + a.target, 0),
        mar: exportData.reduce((sum, a) => sum + a.mar, 0),
        achievement: exportData.length > 0 && exportData.reduce((sum, a) => sum + a.target, 0) > 0
          ? parseFloat(((exportData.reduce((sum, a) => sum + a.activated, 0) / exportData.reduce((sum, a) => sum + a.target, 0)) * 100).toFixed(1))
          : 0
      };

      // Add spacing before summary
      yPosition += 5;
      
      // Draw separator line before summary
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.5);
      pdf.line(margin, yPosition, margin + contentWidth, yPosition);
      yPosition += 2;

      // Summary row background
      pdf.setFillColor(30, 41, 59); // Dark gray
      pdf.rect(margin, yPosition, contentWidth, headerHeight + 2, 'F');

      // Summary borders - draw all lines
      pdf.setDrawColor(255, 255, 255);
      pdf.setLineWidth(0.4);
      let summaryX = margin;
      headers.forEach((_, colIndex) => {
        // Draw vertical lines (column separators)
        pdf.line(summaryX, yPosition, summaryX, yPosition + headerHeight + 2);
        summaryX += colWidths[colIndex];
      });
      // Draw rightmost vertical line
      pdf.line(margin + contentWidth, yPosition, margin + contentWidth, yPosition + headerHeight + 2);
      // Draw top and bottom lines
      pdf.line(margin, yPosition, margin + contentWidth, yPosition);
      pdf.line(margin, yPosition + headerHeight + 2, margin + contentWidth, yPosition + headerHeight + 2);

      // Summary text
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      
      xPosition = margin;
      pdf.text(totals.agent, xPosition + colWidths[0] / 2, yPosition + 8, { align: 'center' });
      xPosition += colWidths[0];
      pdf.text(totals.totalLeads.toString(), xPosition + colWidths[1] / 2, yPosition + 8, { align: 'center' });
      xPosition += colWidths[1];
      pdf.text(totals.verified.toString(), xPosition + colWidths[2] / 2, yPosition + 8, { align: 'center' });
      xPosition += colWidths[2];
      pdf.text(totals.activated.toString(), xPosition + colWidths[3] / 2, yPosition + 8, { align: 'center' });
      xPosition += colWidths[3];
      pdf.text(totals.target.toString(), xPosition + colWidths[4] / 2, yPosition + 8, { align: 'center' });
      xPosition += colWidths[4];
      pdf.text(totals.mar.toString(), xPosition + colWidths[5] / 2, yPosition + 8, { align: 'center' });
      xPosition += colWidths[5];
      pdf.text(`${totals.achievement}%`, xPosition + colWidths[6] / 2, yPosition + 8, { align: 'center' });

      // Footer
      yPosition = pageHeight - margin - 10;
      pdf.setFontSize(8);
      pdf.setTextColor(107, 114, 128);
      pdf.setFont('helvetica', 'italic');
      pdf.text(`Generated on ${format(new Date(), 'dd MMMM yyyy, hh:mm a')}`, pageWidth / 2, yPosition, { align: 'center' });

      // Generate filename and download
      const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
      const monthStrForFile = format(selectedMonth, 'MMMM-yyyy');
      const teamNameForFile = (teamName || 'Team').replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${teamNameForFile}_Team_Performance_${monthStrForFile}_${timestamp}.pdf`;
      
      pdf.save(filename);
      
      toast.success('Team Performance PDF report generated successfully!', {
        duration: 3000,
        icon: '✅'
      });
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      toast.error('Failed to export to PDF');
    }
  };

  const handleSetTarget = async (agent: User) => {
    setSelectedAgent(agent);
    const currentTarget = agentTargets[agent.id]?.target || 0;
    const currentMar = agentTargets[agent.id]?.mar || 0;
    setTargetAmount(currentTarget.toString());
    setMarAmount(currentMar.toString());
    setIsTargetDialogOpen(true);
  };

  const handleSaveTarget = async () => {
    if (!selectedAgent || !targetAmount.trim() || !marAmount.trim()) {
      toast.error('Please enter valid target and MAR amounts');
      return;
    }

    const target = parseInt(targetAmount);
    const mar = parseInt(marAmount);
    if (isNaN(target) || target < 0 || isNaN(mar) || mar < 0) {
      toast.error('Please enter valid target and MAR amounts');
      return;
    }

    if (mar > target) {
      toast.error('MAR cannot be greater than target');
      return;
    }

    try {
      const currentMonth = format(selectedMonth, 'yyyy-MM');
      const targetData = {
        agentId: selectedAgent.id,
        teamId: user?.teamId,
        target: target,
        mar: mar,
        month: currentMonth,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Check if target already exists
      const existingTargetQuery = query(
        collection(db, 'agentTargets'),
        where('agentId', '==', selectedAgent.id),
        where('teamId', '==', user?.teamId),
        where('month', '==', currentMonth)
      );
      const existingTargetSnapshot = await getDocs(existingTargetQuery);

      if (!existingTargetSnapshot.empty) {
        // Update existing target
        const targetDoc = existingTargetSnapshot.docs[0];
        await updateDoc(doc(db, 'agentTargets', targetDoc.id), {
          target: target,
          mar: mar,
          updatedAt: new Date()
        });
      } else {
        // Create new target
        await addDoc(collection(db, 'agentTargets'), targetData);
      }

      // Update local state
      setAgentTargets(prev => ({
        ...prev,
        [selectedAgent.id]: {
          agentId: selectedAgent.id,
          target: target,
          mar: mar,
          month: currentMonth
        }
      }));

      toast.success(`Target and MAR set successfully for ${selectedAgent.name}`);
      setIsTargetDialogOpen(false);
      setSelectedAgent(null);
      setTargetAmount('');
      setMarAmount('');
    } catch (error) {
      console.error('Error setting target:', error);
      toast.error('Failed to set target');
    }
  };

  const handleSaveBonusAmounts = async () => {
    try {
      if (!user?.teamId) {
        console.error('No team ID available');
        return;
      }
      const bonusRef = doc(db, 'teamSettings', user.teamId);
      await setDoc(bonusRef, {
        ...bonusAmounts,
        updatedAt: new Date()
      });
      toast.success('Bonus amounts updated successfully');
      setIsBonusDialogOpen(false);
    } catch (error) {
      console.error('Error saving bonus amounts:', error);
      toast.error('Failed to save bonus amounts');
    }
  };

  const handlePreviousMonth = () => {
    setSelectedMonth(prev => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    const nextMonth = addMonths(selectedMonth, 1);
    if (nextMonth <= new Date()) {
      setSelectedMonth(nextMonth);
    }
  };

  const chartData = {
    labels: monthlyAgentMetrics.map(agent => agent.agentName),
    datasets: [
      {
        label: 'Activated',
        data: monthlyAgentMetrics.map(agent => agent.activated),
        backgroundColor: 'rgba(147, 51, 234, 0.6)',
        borderColor: 'rgb(147, 51, 234)',
        borderWidth: 1,
      },
      {
        label: 'Verified',
        data: monthlyAgentMetrics.map(agent => agent.verified),
        backgroundColor: 'rgba(34, 197, 94, 0.6)',
        borderColor: 'rgb(34, 197, 94)',
        borderWidth: 1,
      },
      {
        label: 'Pending',
        data: monthlyAgentMetrics.map(agent => agent.pendingVerification),
        backgroundColor: 'rgba(234, 179, 8, 0.6)',
        borderColor: 'rgb(234, 179, 8)',
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          boxWidth: 12,
          padding: 10,
          font: {
            size: 11
          }
        }
      },
      title: {
        display: true,
        text: 'Agent Performance Overview',
        font: {
          size: 14
        },
        padding: {
          bottom: 10
        }
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          font: {
            size: 11
          }
        }
      },
      x: {
        ticks: {
          font: {
            size: 11
          }
        }
      },
      r: {
        angleLines: {
          display: true,
          color: 'rgba(0, 0, 0, 0.1)'
        },
        suggestedMin: 0,
        suggestedMax: 10,
        ticks: {
          stepSize: 2,
          font: {
            size: 11
          }
        },
        pointLabels: {
          font: {
            size: 12
          }
        }
      }
    },
  };

  const doughnutData = {
    labels: ['Activated', 'Verified', 'Pending', 'Rejected'],
    datasets: [
      {
        data: [
          monthlyAgentMetrics.reduce((sum, agent) => sum + agent.activated, 0),
          monthlyAgentMetrics.reduce((sum, agent) => sum + agent.verified, 0),
          monthlyAgentMetrics.reduce((sum, agent) => sum + agent.pendingVerification, 0),
          monthlyAgentMetrics.reduce((sum, agent) => sum + agent.rejected, 0),
        ],
        backgroundColor: [
          'rgba(147, 51, 234, 0.6)',
          'rgba(34, 197, 94, 0.6)',
          'rgba(234, 179, 8, 0.6)',
          'rgba(239, 68, 68, 0.6)',
        ],
        borderColor: [
          'rgb(147, 51, 234)',
          'rgb(34, 197, 94)',
          'rgb(234, 179, 8)',
          'rgb(239, 68, 68)',
        ],
        borderWidth: 1,
      },
    ],
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          boxWidth: 12,
          padding: 10,
          font: {
            size: 11
          }
        }
      },
      title: {
        display: false
      },
    },
  };

  const stats = [
    {
      name: 'Total Leads',
      description: 'Total leads (all time)',
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
      name: 'Pending Assignment',
      description: 'Awaiting assignment',
      value: metrics.pendingAssignment,
      href: '/dashboard/leads?status=pending_assignment',
      icon: Building2,
      color: 'bg-gradient-to-br from-orange-500 to-orange-600',
      textColor: 'text-orange-600',
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
      name: 'Activated',
      description: 'Activated this month',
      value: monthlyMetrics.activated,
      href: '/dashboard/leads?status=activated',
      icon: Zap,
      color: 'bg-gradient-to-br from-purple-500 to-purple-600',
      textColor: 'text-purple-600',
    },
    {
      name: 'Rejected',
      description: 'Rejected leads',
      value: metrics.rejected,
      href: '/dashboard/leads?status=rejected',
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
  ];

  const loadAgentPerformanceData = async (agent: User, startDate: Date, endDate: Date) => {
    try {
      setIsLoadingAgentData(true);
      setClickedAgentId(agent.id);
      
      const months = eachMonthOfInterval({ start: startDate, end: endDate });
      const performanceData: AgentPerformanceData[] = [];

      // Load all targets for the date range at once
      const targetPromises = months.map(month => {
        const targetRef = doc(db, 'agentTargets', `${agent.id}_${format(month, 'yyyy-MM')}`);
        return getDoc(targetRef);
      });
      const targetDocs = await Promise.all(targetPromises);
      const targets = new Map(
        targetDocs.map((doc, index) => [
          format(months[index], 'yyyy-MM'),
          doc.exists() ? doc.data().target : 0
        ])
      );

      // Load all leads for the date range in one query
      const leadsQuery = query(
        collection(db, 'leads'),
        where('teamId', '==', user.teamId),
        where('agentId', '==', agent.id),
        where('createdAt', '>=', startDate),
        where('createdAt', '<=', endDate)
      );
      
      const leadsSnapshot = await getDocs(leadsQuery);
      const leads = leadsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Lead[];

      // Process data for each month
      for (const month of months) {
        const monthStr = format(month, 'yyyy-MM');
        const monthLeads = leads.filter(lead => 
          lead.createdAt && 
          lead.createdAt >= startOfMonth(month) && 
          lead.createdAt <= endOfMonth(month)
        );

        // Calculate activated leads for the month based on when they were activated
          const monthActivatedLeads = leads.filter(lead => {
            if (lead.status !== 'activated') return false;
            const activatedAt = getActivatedAt(lead);
            return activatedAt !== null && activatedAt >= startOfMonth(month) && activatedAt <= endOfMonth(month);
          });
        
        // Count total activations by summing up plans in each activated lead
        const activated = monthActivatedLeads.reduce((count, lead) => {
          return count + (lead.plans?.length || 0);
        }, 0);

        const monthData = {
          month: format(month, 'MMM yyyy'),
          totalLeads: monthLeads.length,
          verified: monthLeads.filter(l => l.status === 'verified').length,
          activated: activated,
          target: targets.get(monthStr) || 0,
          achievement: targets.get(monthStr) ? 
            (activated / targets.get(monthStr)!) * 100 : 0
        };

        performanceData.push(monthData);
      }

      setSelectedAgentDetails({
        agent,
        performanceData
      });
      setIsAgentDetailsOpen(true);
    } catch (error) {
      console.error('Error loading agent performance data:', error);
      toast.error('Failed to load agent performance data');
    } finally {
      setIsLoadingAgentData(false);
      setClickedAgentId(null);
    }
  };

  const handleAgentClick = (agent: User | AgentMetrics | MonthlyAgentMetrics) => {
    // Find the full user object from teamMembers
    const agentId = 'id' in agent ? agent.id : ('agentId' in agent ? agent.agentId : null);
    if (agentId) {
      const fullAgent = teamMembers.find(m => m.id === agentId);
      if (fullAgent) {
        loadAgentPerformanceData(fullAgent, dateRange.start, dateRange.end);
      }
    }
  };

  const renderAgentName = (agent: User | AgentMetrics | MonthlyAgentMetrics) => {
    const agentName = 'name' in agent ? agent.name : agent.agentName;
    const agentId = 'id' in agent ? agent.id : ('agentId' in agent ? agent.agentId : null);
    const isClicked = clickedAgentId === agentId;
    
    return (
      <div 
        className={clsx(
          "flex items-center cursor-pointer transition-all duration-200",
          isClicked ? "opacity-50" : "hover:text-indigo-600"
        )}
        onClick={() => handleAgentClick(agent)}
      >
        <div className={clsx(
          "flex-shrink-0 h-10 w-10 flex items-center justify-center rounded-full transition-all duration-300 shadow-sm",
          isClicked ? "bg-gray-400" : "bg-gradient-to-br from-indigo-500 to-purple-600 group-hover:from-indigo-600 group-hover:to-purple-700"
        )}>
          {isClicked ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
          ) : (
            <User2 className="h-5 w-5 text-white" />
          )}
        </div>
        <div className="ml-4">
          <div className={clsx(
            "text-sm font-bold transition-colors",
            isClicked ? "text-gray-500" : "text-gray-900 group-hover:text-indigo-600"
          )}>
            {agentName}
          </div>
        </div>
      </div>
    );
  };

  const AgentDetailsModal = () => {
    if (!selectedAgentDetails) return null;

    const { agent, performanceData } = selectedAgentDetails;

    const performanceChartData = {
      labels: performanceData.map(d => d.month),
      datasets: [
        {
          label: 'Activated',
          data: performanceData.map(d => d.activated),
          borderColor: 'rgb(147, 51, 234)',
          backgroundColor: 'rgba(147, 51, 234, 0.5)',
          tension: 0.4
        },
        {
          label: 'Target',
          data: performanceData.map(d => d.target),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          tension: 0.4
        }
      ]
    };

    const achievementChartData = {
      labels: performanceData.map(d => d.month),
      datasets: [{
        label: 'Achievement %',
        data: performanceData.map(d => d.achievement),
        borderColor: 'rgb(34, 197, 94)',
        backgroundColor: 'rgba(34, 197, 94, 0.5)',
        tension: 0.4
      }]
    };

    return (
      <Transition appear show={isAgentDetailsOpen} as={Fragment}>
        <Dialog
          as="div"
          className="relative z-50"
          onClose={() => setIsAgentDetailsOpen(false)}
        >
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-25" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-6xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  {isLoadingAgentData ? (
                    <div className="flex items-center justify-center h-96">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
                        <p className="text-gray-600">Loading performance data...</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-6">
                        <Dialog.Title
                          as="h3"
                          className="text-2xl font-bold leading-6 text-gray-900"
                        >
                          {agent.name}'s Performance History
                        </Dialog.Title>
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center space-x-2">
                            <input
                              type="date"
                              value={format(dateRange.start, 'yyyy-MM-dd')}
                              onChange={(e) => setDateRange(prev => ({ ...prev, start: new Date(e.target.value) }))}
                              className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                            />
                            <span className="text-gray-500">to</span>
                            <input
                              type="date"
                              value={format(dateRange.end, 'yyyy-MM-dd')}
                              onChange={(e) => setDateRange(prev => ({ ...prev, end: new Date(e.target.value) }))}
                              className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                            />
                            <button
                              onClick={() => loadAgentPerformanceData(agent, dateRange.start, dateRange.end)}
                              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                            >
                              Update
                            </button>
                          </div>
                          <button
                            onClick={() => setIsAgentDetailsOpen(false)}
                            className="p-2 text-gray-400 hover:text-gray-500"
                          >
                            <XCircle className="h-6 w-6" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
                          <h4 className="text-sm font-medium mb-1">Total Leads</h4>
                          <p className="text-2xl font-bold">
                            {performanceData.reduce((sum, d) => sum + d.totalLeads, 0)}
                          </p>
                        </div>
                        <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-4 text-white">
                          <h4 className="text-sm font-medium mb-1">Total Verified</h4>
                          <p className="text-2xl font-bold">
                            {performanceData.reduce((sum, d) => sum + d.verified, 0)}
                          </p>
                        </div>
                        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
                          <h4 className="text-sm font-medium mb-1">Total Activated</h4>
                          <p className="text-2xl font-bold">
                            {performanceData.reduce((sum, d) => sum + d.activated, 0)}
                          </p>
                        </div>
                        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-4 text-white">
                          <h4 className="text-sm font-medium mb-1">Average Achievement</h4>
                          <p className="text-2xl font-bold">
                            {(performanceData.reduce((sum, d) => sum + d.achievement, 0) / performanceData.length).toFixed(1)}%
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white rounded-xl shadow-sm p-4">
                          <h4 className="text-lg font-semibold mb-4">Performance Trend</h4>
                          <div style={{ height: '300px' }}>
                            <Line data={performanceChartData} options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: {
                                  position: 'top' as const,
                                }
                              },
                              scales: {
                                y: {
                                  beginAtZero: true
                                }
                              }
                            }} />
                          </div>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm p-4">
                          <h4 className="text-lg font-semibold mb-4">Achievement Trend</h4>
                          <div style={{ height: '300px' }}>
                            <Line data={achievementChartData} options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: {
                                  position: 'top' as const,
                                }
                              },
                              scales: {
                                y: {
                                  beginAtZero: true,
                                  max: 100,
                                  ticks: {
                                    callback: (value) => `${value}%`
                                  }
                                }
                              }
                            }} />
                          </div>
                        </div>
                      </div>

                      <div className="mt-6">
                        <h4 className="text-lg font-semibold mb-4">Monthly Breakdown</h4>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Leads</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Verified</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Activated</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Achievement</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {performanceData.map((data, index) => (
                                <tr key={index} className="hover:bg-gray-50">
                                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    {data.month}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {data.totalLeads}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {data.verified}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {data.activated}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {data.target}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center">
                                      <div className="w-full bg-purple-200 rounded-full h-2">
                                        <div 
                                          className="bg-gradient-to-r from-purple-500 to-purple-600 h-2 rounded-full transition-all duration-500"
                                          style={{ width: `${Math.min(data.achievement, 100)}%` }}
                                        />
                                      </div>
                                      <span className="text-sm font-medium text-gray-900">
                                        {data.achievement.toFixed(1)}%
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  )}
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900">
                Welcome back, {user?.name}!
              </h1>
              <p className="mt-2 text-lg text-gray-600">
                Here's what's happening with your team this month.
              </p>
            </div>
            <div className="hidden sm:flex items-center space-x-3 text-sm text-gray-600">
              <button
                type="button"
                onClick={() => setShowReservedModal(true)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 transition-colors shadow-sm"
              >
                <Phone className="h-4 w-4" />
                <span className="font-semibold">Team Reserved Numbers</span>
              </button>
              <div className="flex items-center space-x-2">
              <Calendar className="h-5 w-5" />
              <span>{format(new Date(), 'MMMM yyyy')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Team target strip (MAR-style) */}
        <div className="flex flex-wrap gap-4 mb-8">
          {/* Target card */}
          <div className="flex-1 min-w-[240px] flex items-center gap-3 bg-gradient-to-r from-rose-50 to-red-50 border border-red-200 rounded-lg px-5 py-4 shadow-sm">
            <Target className="h-6 w-6 text-red-600" />
            <div className="flex flex-col">
              <p className="text-xs font-semibold text-red-700">Team Target</p>
              <p className="text-4xl font-extrabold text-red-600 leading-none">
                {teamTarget !== null ? teamTarget : 200}
              </p>
            </div>
          </div>

          {/* Achieved card */}
          <div className="flex-1 min-w-[240px] flex items-center gap-3 bg-gradient-to-r from-indigo-50 to-blue-50 border border-blue-200 rounded-lg px-5 py-4 shadow-sm">
            <Zap className="h-6 w-6 text-indigo-600" />
            <div className="flex flex-col">
              <p className="text-xs font-semibold text-indigo-700">Achieved</p>
              <p className="text-4xl font-extrabold text-indigo-900 leading-none">{monthlyMetrics.activated}</p>
            </div>
          </div>

          {/* Remaining card */}
          <div className="flex-1 min-w-[240px] flex items-center gap-3 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg px-5 py-4 shadow-sm">
            <CheckCircle className="h-6 w-6 text-amber-600" />
            <div className="flex flex-col">
              <p className="text-xs font-semibold text-amber-700">Remaining</p>
              <p className="text-4xl font-extrabold text-amber-900 leading-none">
                {Math.max((teamTarget !== null ? teamTarget : 200) - monthlyMetrics.activated, 0)}
              </p>
            </div>
          </div>

          {/* Average per Agent card */}
          <div className="flex-1 min-w-[240px] flex items-center gap-3 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-lg px-5 py-4 shadow-sm">
            <Users className="h-6 w-6 text-emerald-600" />
            <div className="flex flex-col">
              <p className="text-xs font-semibold text-emerald-700">Avg per Agent</p>
              <p className="text-4xl font-extrabold text-emerald-900 leading-none">
                {teamMembers.length > 0 ? (monthlyMetrics.activated / teamMembers.length).toFixed(1) : '0.0'}
              </p>
            </div>
          </div>

        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 mb-12">
          {stats.map((stat) => (
            <Link
              to={stat.href || '#'}
              key={stat.name}
              className="bg-white overflow-hidden shadow-lg rounded-xl hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer relative"
            >
              <div className="p-6">
                <div className="flex items-center">
                  <div className={`flex-shrink-0 p-3 rounded-xl ${stat.color}`}>
                    <stat.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-900 truncate">
                        {stat.name}
                      </dt>
                      <dd className={`text-2xl font-bold ${stat.textColor}`}>
                        {stat.value}
                      </dd>
                      <dd className="text-xs text-gray-500 mt-1">
                        {stat.description}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Action Buttons Section */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-8">
          <button
            onClick={() => {
              if (teamData?.commissionBased) {
                setShowCommissionConfigModal(true);
              } else {
                setIsBonusSettingsCollapsed(!isBonusSettingsCollapsed);
              }
            }}
            className="group relative inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-2xl font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-300 border-0 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative flex items-center gap-3">
              <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
                {teamData?.commissionBased ? <DollarSign className="h-5 w-5" /> : <Target className="h-5 w-5" />}
              </div>
              <span className="text-sm font-semibold">
                {teamData?.commissionBased 
                  ? 'Commission Settings' 
                  : (isBonusSettingsCollapsed ? 'View Bonus Settings' : 'Hide Bonus Settings')
                }
              </span>
              {!teamData?.commissionBased && (
                <div className="p-1 bg-white/20 rounded-lg backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
                  {isBonusSettingsCollapsed ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronUp className="h-4 w-4" />
                  )}
                </div>
              )}
            </div>
          </button>

          <PayrollButton role="manager" user={user} />

          {/* Attendance Button */}
          <button
            onClick={() => setAttendanceOpen(true)}
            className="group relative inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-300 border-0 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-green-600 to-emerald-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative flex items-center gap-3">
              <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
                <UserCheck className="h-5 w-5" />
              </div>
              <span className="text-sm font-semibold">Team Attendance</span>
            </div>
          </button>

          {/* Leave Application Button */}
          <button
            onClick={() => setLeaveModalOpen(true)}
            className="group relative inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-2xl font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-300 border-0 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative flex items-center gap-3">
              <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
                <FileText className="h-5 w-5" />
              </div>
              <span className="text-sm font-semibold">Leave Applications</span>
            </div>
          </button>

          <button
            onClick={() => setIsDailyPerformanceCollapsed(!isDailyPerformanceCollapsed)}
            className="group relative inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-green-500 to-blue-600 text-white rounded-2xl font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-300 border-0 overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-green-600 to-blue-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <div className="relative flex items-center gap-3">
              <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
                <Calendar className="h-5 w-5" />
              </div>
              <span className="text-sm font-semibold">
                {isDailyPerformanceCollapsed ? 'View Daily Performance' : 'Hide Daily Performance'}
              </span>
              <div className="p-1 bg-white/20 rounded-lg backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
                {isDailyPerformanceCollapsed ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronUp className="h-4 w-4" />
                )}
              </div>
            </div>
          </button>
        </div>

        {/* Expanded sections below the button row */}
        {!isDailyPerformanceCollapsed && (
          <DailyPerformance teamId={user?.teamId || ''} forceOpen />
        )}
        {!isBonusSettingsCollapsed && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="mt-6 bg-white rounded-2xl shadow-xl p-8 border border-gray-100"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Bonus Settings</h2>
                <p className="text-gray-600 mt-1">Configure achievement bonus amounts for your team</p>
              </div>
              <button
                onClick={() => setIsBonusDialogOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
              >
                <Pencil className="h-4 w-4" />
                <span className="font-medium">Edit</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300">
                <h3 className="font-semibold mb-3 text-indigo-100">Target Achievement</h3>
                <p className="text-3xl font-bold">₹{bonusAmounts.targetAchievement.toLocaleString()}</p>
              </div>
              <div className="bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl p-6 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300">
                <h3 className="font-semibold mb-3 text-green-100">Rising Star</h3>
                <p className="text-3xl font-bold">₹{bonusAmounts.risingStar.toLocaleString()}</p>
              </div>
              <div className="bg-gradient-to-br from-teal-500 to-green-600 rounded-xl p-6 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300">
                <h3 className="font-semibold mb-3 text-teal-100">Super Achiever</h3>
                <p className="text-3xl font-bold">₹{bonusAmounts.superAchiever.toLocaleString()}</p>
              </div>
              <div className="bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl p-6 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300">
                <h3 className="font-semibold mb-3 text-blue-100">Elite Performer</h3>
                <p className="text-3xl font-bold">₹{bonusAmounts.elitePerformer.toLocaleString()}</p>
              </div>
              <div className="bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl p-6 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300">
                <h3 className="font-semibold mb-3 text-purple-100">Master Achiever</h3>
                <p className="text-3xl font-bold">₹{bonusAmounts.masterAchiever.toLocaleString()}</p>
              </div>
              <div className="bg-gradient-to-br from-amber-500 to-red-600 rounded-xl p-6 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300">
                <h3 className="font-semibold mb-3 text-amber-100">Legendary Status</h3>
                <p className="text-3xl font-bold">₹{bonusAmounts.legendaryStatus.toLocaleString()}</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Team Performance */}
        {agentMetrics.length > 0 && (
          <div className="mb-12">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Team Performance</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Detailed performance metrics for {format(selectedMonth, 'MMMM yyyy')}
                  </p>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handlePreviousMonth}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <ChevronLeft className="h-5 w-5 text-gray-600" />
                    </button>
                    <span className="text-sm font-medium text-gray-700">
                      {format(selectedMonth, 'MMMM yyyy')}
                    </span>
                    <button
                      onClick={handleNextMonth}
                      disabled={format(selectedMonth, 'yyyy-MM') === format(new Date(), 'yyyy-MM')}
                      className={clsx(
                        "p-2 rounded-lg transition-colors",
                        format(selectedMonth, 'yyyy-MM') === format(new Date(), 'yyyy-MM')
                          ? "text-gray-400 cursor-not-allowed"
                          : "hover:bg-gray-100 text-gray-600"
                      )}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleExportToExcel}
                      className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 shadow-md hover:shadow-lg"
                      title="Export to Excel"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      <span className="text-sm font-medium">Export Excel</span>
                    </button>
                    <button
                      onClick={handleExportToPDF}
                      className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-lg hover:from-red-600 hover:to-rose-700 transition-all duration-200 shadow-md hover:shadow-lg"
                      title="Export to PDF"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      <span className="text-sm font-medium">Export PDF</span>
                    </button>
                    <button
                      onClick={() => setViewMode('table')}
                      className={clsx(
                        "p-2 rounded-lg transition-colors",
                        viewMode === 'table'
                          ? "bg-indigo-100 text-indigo-600"
                          : "hover:bg-gray-100 text-gray-600"
                      )}
                    >
                      <ClipboardList className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => setViewMode('charts')}
                      className={clsx(
                        "p-2 rounded-lg transition-colors",
                        viewMode === 'charts'
                          ? "bg-indigo-100 text-indigo-600"
                          : "hover:bg-gray-100 text-gray-600"
                      )}
                    >
                      <BarChart3 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>

              {loadingAgentMetrics ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
                </div>
              ) : viewMode === 'charts' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-end space-x-2 mb-2">
                    <button
                      onClick={() => setChartType('bar')}
                      className={clsx(
                        "p-1.5 rounded-lg transition-colors",
                        chartType === 'bar'
                          ? "bg-indigo-100 text-indigo-600"
                          : "hover:bg-gray-100 text-gray-600"
                      )}
                    >
                      <BarChart3 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setChartType('radar')}
                      className={clsx(
                        "p-1.5 rounded-lg transition-colors",
                        chartType === 'radar'
                          ? "bg-indigo-100 text-indigo-600"
                          : "hover:bg-gray-100 text-gray-600"
                      )}
                    >
                      <PieChart className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setChartType('line')}
                      className={clsx(
                        "p-1.5 rounded-lg transition-colors",
                        chartType === 'line'
                          ? "bg-indigo-100 text-indigo-600"
                          : "hover:bg-gray-100 text-gray-600"
                      )}
                    >
                      <TrendingUp className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm" style={{ 
                    height: chartType === 'radar' ? '600px' : '300px',
                    maxWidth: chartType === 'radar' ? '100%' : '100%',
                    margin: chartType === 'radar' ? '0 auto' : '0',
                    width: chartType === 'radar' ? '100%' : 'auto'
                  }}>
                    {chartType === 'bar' && <Bar data={chartData} options={chartOptions} />}
                    {chartType === 'radar' && <Radar data={chartData} options={{
                      ...chartOptions,
                      plugins: {
                        ...chartOptions.plugins,
                        legend: {
                          ...chartOptions.plugins.legend,
                          labels: {
                            ...chartOptions.plugins.legend.labels,
                            font: {
                              size: 14
                            }
                          }
                        }
                      },
                      scales: {
                        ...chartOptions.scales,
                        r: {
                          ...chartOptions.scales.r,
                          pointLabels: {
                            font: {
                              size: 14
                            }
                          },
                          ticks: {
                            ...chartOptions.scales.r.ticks,
                            font: {
                              size: 12
                            }
                          }
                        }
                      }
                    }} />}
                    {chartType === 'line' && <Line data={chartData} options={chartOptions} />}
                  </div>

                  {/* Overall Lead Status Distribution */}
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Overall Lead Status Distribution</h3>
                    <div className="bg-white p-4 rounded-xl shadow-sm" style={{ height: '250px' }}>
                      <Doughnut data={doughnutData} options={doughnutOptions} />
                    </div>
                  </div>

                  {/* Agent Performance Cards */}
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">Agent Performance</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {monthlyAgentMetrics.map((agent) => {
                        const target = agentTargets[agent.agentId]?.target || 0;
                        const remaining = target - agent.activated;
                        const achievement = (agent.activated / target) * 100;

                        return (
                          <div
                            key={agent.agentId}
                            className="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition-shadow"
                          >
                            <div className="flex items-center space-x-3 mb-4">
                              <div >
                                {renderAgentName(agent)}
                              </div>
                            </div>
                            <div className="space-y-3">
                              <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-3 rounded-lg">
                                <div className="flex justify-between items-center mb-1">
                                  <p className="text-sm font-medium text-purple-700">Activated</p>
                                  <span className="text-lg font-bold text-purple-800">{agent.activated}</span>
                                </div>
                                <div className="w-full bg-purple-200 rounded-full h-2">
                                  <div 
                                    className="bg-gradient-to-r from-purple-500 to-purple-600 h-2 rounded-full transition-all duration-500"
                                    style={{ width: `${Math.min(achievement, 100)}%` }}
                                  />
                                </div>
                              </div>
                              <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-3 rounded-lg">
                                <div className="flex justify-between items-center">
                                  <p className="text-sm font-medium text-indigo-700">Target</p>
                                  <span className="text-lg font-bold text-indigo-800">{target}</span>
                                </div>
                              </div>
                              <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-3 rounded-lg">
                                <div className="flex justify-between items-center">
                                  <p className="text-sm font-medium text-blue-700">Remaining</p>
                                  <span className={clsx(
                                    "text-lg font-bold",
                                    remaining < 0 ? "text-red-600" : "text-blue-800"
                                  )}>
                                    {remaining < 0 ? 0 : remaining}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Agent
                        </th>
                        <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Leads
                        </th>
                        <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Verified
                        </th>
                        <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Activated
                        </th>
                        <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Target
                        </th>
                        <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          MAR
                        </th>
                        <th scope="col" className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Achievement
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {agentMetrics.map((agent) => {
                        const target = agentTargets[agent.agentId]?.target || 0;
                        const achievement = (agent.activated / target) * 100;
                        const isOverAchiever = achievement > 100;
                        const isUnderAchiever = achievement < 50;

                        return (
                          <tr 
                            key={agent.agentId} 
                            className="hover:bg-gray-50 transition-all duration-200 group"
                          >
                            <td className="px-6 py-4 whitespace-nowrap">
                              {renderAgentName(agent)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center bg-gradient-to-br from-blue-400 to-blue-500 rounded-full shadow-sm">
                                  <Hash className="h-4 w-4 text-white" />
                                </div>
                                <div className="ml-3">
                                  <div className="text-sm font-semibold text-gray-900">
                                    {agent.totalLeads}
                                  </div>
                                  <div className="text-xs text-gray-500">total leads</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center bg-gradient-to-br from-green-400 to-green-500 rounded-full shadow-sm">
                                  <CheckCircle className="h-4 w-4 text-white" />
                                </div>
                                <div className="ml-3">
                                  <div className="text-sm font-semibold text-gray-900">
                                    {agent.verified}
                                  </div>
                                  <div className="text-xs text-gray-500">verified</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center bg-gradient-to-br from-purple-400 to-purple-500 rounded-full shadow-sm">
                                  <Zap className="h-4 w-4 text-white" />
                                </div>
                                <div className="ml-3">
                                  <div className="text-sm font-semibold text-gray-900">
                                    {agent.activated}
                                  </div>
                                  <div className="text-xs text-gray-500">activated</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-semibold text-gray-900">
                                  {target}
                                </span>
                                <button
                                  onClick={() => handleSetTarget(teamMembers.find(m => m.id === agent.agentId)!)}
                                  className="p-1 text-gray-400 hover:text-indigo-600 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-semibold text-gray-900">
                                  {agentTargets[agent.agentId]?.mar || 0}
                                </span>
                                <button
                                  onClick={() => handleSetTarget(teamMembers.find(m => m.id === agent.agentId)!)}
                                  className="p-1 text-gray-400 hover:text-indigo-600 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex flex-col">
                                <div className="text-sm font-semibold text-gray-900">
                                  {agent.activated}
                                  <span className="text-xs text-gray-500 ml-1">/ {target}</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2.5 mt-1.5">
                                  <div 
                                    className={clsx(
                                      "h-2.5 rounded-full transition-all duration-500",
                                      isOverAchiever ? "bg-gradient-to-r from-green-400 to-green-500" : 
                                      isUnderAchiever ? "bg-gradient-to-r from-red-400 to-red-500" : 
                                      "bg-gradient-to-r from-indigo-400 to-indigo-500"
                                    )}
                                    style={{ width: `${Math.min(achievement, 100)}%` }}
                                  />
                                </div>
                                <span className={clsx(
                                  "text-xs mt-1.5 font-medium",
                                  isOverAchiever ? "text-green-600" :
                                  isUnderAchiever ? "text-red-600" :
                                  "text-indigo-600"
                                )}>
                                  {achievement.toFixed(1)}% achieved
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          Team Total
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                          {agentMetrics.reduce((sum, agent) => sum + agent.totalLeads, 0)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-800">
                          {agentMetrics.reduce((sum, agent) => sum + agent.verified, 0)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-purple-800">
                          {agentMetrics.reduce((sum, agent) => sum + agent.activated, 0)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                          {agentMetrics.reduce((sum, agent) => sum + (agentTargets[agent.agentId]?.target || 0), 0)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                          {agentMetrics.reduce((sum, agent) => sum + (agentTargets[agent.agentId]?.mar || 0), 0)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                          {agentMetrics.reduce((sum, agent) => sum + agent.activated, 0)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Target Setting Dialog */}
        <Transition appear show={isTargetDialogOpen} as={Fragment}>
          <Dialog
            as="div"
            className="relative z-50"
            onClose={() => setIsTargetDialogOpen(false)}
          >
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-black bg-opacity-25" />
            </Transition.Child>

            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4 text-center">
                <Transition.Child
                  as={Fragment}
                  enter="ease-out duration-300"
                  enterFrom="opacity-0 scale-95"
                  enterTo="opacity-100 scale-100"
                  leave="ease-in duration-200"
                  leaveFrom="opacity-100 scale-100"
                  leaveTo="opacity-0 scale-95"
                >
                  <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                    <Dialog.Title
                      as="h3"
                      className="text-lg font-medium leading-6 text-gray-900"
                    >
                      Set Monthly Target
                    </Dialog.Title>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Set monthly activation target for {selectedAgent?.name}
                      </p>
                      <div className="mt-4">
                        <label htmlFor="target" className="block text-sm font-medium text-gray-700">
                          Target Number
                        </label>
                        <input
                          type="number"
                          id="target"
                          value={targetAmount}
                          onChange={(e) => setTargetAmount(e.target.value)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          min="0"
                        />
                      </div>
                      <div className="mt-4">
                        <label htmlFor="mar" className="block text-sm font-medium text-gray-700">
                          MAR Number
                        </label>
                        <input
                          type="number"
                          id="mar"
                          value={marAmount}
                          onChange={(e) => setMarAmount(e.target.value)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                          min="0"
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex justify-end space-x-3">
                      <button
                        type="button"
                        className="inline-flex justify-center rounded-md border border-transparent bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                        onClick={() => setIsTargetDialogOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="inline-flex justify-center rounded-md border border-transparent bg-indigo-100 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                        onClick={handleSaveTarget}
                      >
                        Save Target
                      </button>
                    </div>
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition>

        {/* Add Bonus Dialog */}
        <Transition appear show={isBonusDialogOpen} as={Fragment}>
          <Dialog as="div" className="relative z-50" onClose={() => setIsBonusDialogOpen(false)}>
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-black bg-opacity-25" />
            </Transition.Child>

            <div className="fixed inset-0 overflow-y-auto">
              <div className="flex min-h-full items-center justify-center p-4 text-center">
                <Transition.Child
                  as={Fragment}
                  enter="ease-out duration-300"
                  enterFrom="opacity-0 scale-95"
                  enterTo="opacity-100 scale-100"
                  leave="ease-in duration-200"
                  leaveFrom="opacity-100 scale-100"
                  leaveTo="opacity-0 scale-95"
                >
                  <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                    <Dialog.Title
                      as="h3"
                      className="text-lg font-medium leading-6 text-gray-900 mb-4"
                    >
                      Edit Bonus Amounts
                    </Dialog.Title>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Target Achievement</label>
                        <input
                          type="number"
                          value={bonusAmounts.targetAchievement}
                          onChange={(e) => setBonusAmounts(prev => ({ ...prev, targetAchievement: Number(e.target.value) }))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Rising Star</label>
                        <input
                          type="number"
                          value={bonusAmounts.risingStar}
                          onChange={(e) => setBonusAmounts(prev => ({ ...prev, risingStar: Number(e.target.value) }))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Super Achiever</label>
                        <input
                          type="number"
                          value={bonusAmounts.superAchiever}
                          onChange={(e) => setBonusAmounts(prev => ({ ...prev, superAchiever: Number(e.target.value) }))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Elite Performer</label>
                        <input
                          type="number"
                          value={bonusAmounts.elitePerformer}
                          onChange={(e) => setBonusAmounts(prev => ({ ...prev, elitePerformer: Number(e.target.value) }))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Master Achiever</label>
                        <input
                          type="number"
                          value={bonusAmounts.masterAchiever}
                          onChange={(e) => setBonusAmounts(prev => ({ ...prev, masterAchiever: Number(e.target.value) }))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Legendary Status</label>
                        <input
                          type="number"
                          value={bonusAmounts.legendaryStatus}
                          onChange={(e) => setBonusAmounts(prev => ({ ...prev, legendaryStatus: Number(e.target.value) }))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        />
                      </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                      <button
                        type="button"
                        className="inline-flex justify-center rounded-md border border-transparent bg-gray-100 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                        onClick={() => setIsBonusDialogOpen(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="inline-flex justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
                        onClick={handleSaveBonusAmounts}
                      >
                        Save Changes
                      </button>
                    </div>
                  </Dialog.Panel>
                </Transition.Child>
              </div>
            </div>
          </Dialog>
        </Transition>
      </div>

      {/* Attendance Modal */}
      {attendanceOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setAttendanceOpen(false);
            }
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full mx-4 relative max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Team Attendance</h2>
                <p className="text-sm text-gray-500 mt-1">View and manage team attendance</p>
              </div>
              <button
                onClick={() => setAttendanceOpen(false)}
                className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <AttendanceTable 
                user={user} 
                role="manager" 
                month={attendanceMonth} 
                onMonthChange={setAttendanceMonth} 
              />
            </div>
          </div>
        </div>
      )}

      {/* Leave Application Modal */}
      <LeaveApplicationModal 
        user={user}
        role="manager"
        teamId={user.teamId}
        open={leaveModalOpen}
        onClose={() => setLeaveModalOpen(false)}
      />

      {/* Reserved Numbers Modal */}
      {showReservedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div
            className="absolute inset-0"
            onClick={() => setShowReservedModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-6xl w-full mx-4 max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-indigo-600" />
                <h2 className="text-xl font-semibold text-gray-900">Team Reserved Numbers</h2>
              </div>
              <button
                onClick={() => setShowReservedModal(false)}
                className="text-gray-500 hover:text-gray-700 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close reserved numbers modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <TeamReservedNumbers user={user} />
            </div>
          </div>
        </div>
      )}

      {/* Commission Config Modal */}
      {showCommissionConfigModal && user.teamId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <CommissionConfig
              teamId={user.teamId}
              onClose={() => setShowCommissionConfigModal(false)}
            />
          </div>
        </div>
      )}

      <AgentDetailsModal />
    </div>
  );
}