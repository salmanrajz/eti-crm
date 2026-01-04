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
import { Calendar as CalendarIcon, CheckCircle, Zap, Users, ChevronDown, ChevronUp, CalendarDays, FileText, Download } from 'lucide-react';
import { format, isSameDay } from 'date-fns';
import { toast } from 'react-hot-toast';
import jsPDF from 'jspdf';

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
  agentId?: string;
}

interface AgentDailyStats {
  agentId: string;
  agentName: string;
  agentEmail: string;
  totalLeads: number;
  verified: number;
  activated: number;
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
  const [agentStats, setAgentStats] = useState<AgentDailyStats[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);

  const collapsed = forceOpen === undefined ? isCollapsed : !forceOpen;

  useEffect(() => {
    if (!teamId) return;
    setLoading(true);
    (async () => {
      // Fetch team members first
      const membersQuery = query(collection(db, 'users'), where('teamId', '==', teamId), where('role', '==', 'agent'));
      const membersSnapshot = await getDocs(membersQuery);
      const members = membersSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || 'Unknown',
        email: doc.data().email || '',
      }));
      setTeamMembers(members);

      // Fetch leads
      const leadsQuery = query(collection(db, 'leads'), where('teamId', '==', teamId));
      const snapshot = await getDocs(leadsQuery);
      const leads: Lead[] = snapshot.docs.map(doc => ({
        id: doc.id,
        status: doc.data().status || '',
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate(),
        verifiedAt: doc.data().verifiedAt,
        agentId: doc.data().agentId || '',
      }));

      // Calculate agent-wise stats
      const agentStatsMap = new Map<string, AgentDailyStats>();

      // Initialize stats for all agents
      members.forEach(member => {
        agentStatsMap.set(member.id, {
          agentId: member.id,
          agentName: member.name,
          agentEmail: member.email,
          totalLeads: 0,
          verified: 0,
          activated: 0,
        });
      });

      // Process leads and update agent stats
      leads.forEach(lead => {
        const agentId = lead.agentId || '';
        if (!agentStatsMap.has(agentId)) return;

        const agentStat = agentStatsMap.get(agentId)!;

        // Count total leads created on selected date
        if (lead.createdAt && isSameDay(lead.createdAt, selectedDate)) {
          agentStat.totalLeads++;
        }

        // Count verified leads on selected date
        const verifiedAtDate = toDateSafe(lead.verifiedAt);
        if (verifiedAtDate && isSameDay(verifiedAtDate, selectedDate)) {
          agentStat.verified++;
        }

        // Count activated leads on selected date
        if ((lead.status === 'activated' || lead.status === 'activated_non_verified') && lead.updatedAt && isSameDay(lead.updatedAt, selectedDate)) {
          agentStat.activated++;
        }
      });

      const statsArray = Array.from(agentStatsMap.values()).filter(stat => stat.totalLeads > 0 || stat.verified > 0 || stat.activated > 0);
      setAgentStats(statsArray);
      setLoading(false);
    })();
  }, [teamId, selectedDate]);

  // Export Daily Performance to Excel
  const handleExportToExcel = async () => {
    try {
      // Try ExcelJS first for full styling support
      let ExcelJS: any = null;
      try {
        // Dynamic import for code splitting - ExcelJS is optional
        const exceljsModule = await import(/* @vite-ignore */ 'exceljs');
        ExcelJS = exceljsModule.default || exceljsModule;
      } catch (error) {
        // ExcelJS not available, use xlsx fallback
        console.warn('ExcelJS not available, using xlsx fallback:', error);
        ExcelJS = null;
      }

      if (ExcelJS) {
        // Use ExcelJS for styled export
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Daily Performance');

        // Prepare data
        const exportData = agentStats.map((agent) => ({
          agent: agent.agentName,
          totalLeads: agent.totalLeads,
          verified: agent.verified,
          activated: agent.activated,
        }));

        // Get team name (similar to manager dashboard)
        const teamName = 'Unknown Team'; // We don't have team name in this component

        // Title row with date
        const currentDate = format(new Date(), 'dd MMMM yyyy');
        const selectedDateStr = format(selectedDate, 'dd MMMM yyyy');
        const titleText = `${teamName} - Daily Performance Report - ${selectedDateStr} - ${currentDate}`;
        const titleRow = worksheet.addRow([titleText]);
        worksheet.mergeCells(1, 1, 1, 4);
        const titleCell = titleRow.getCell(1);
        titleCell.font = { bold: true, size: 16, color: { argb: 'FF1E293B' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.height = 30;
        worksheet.addRow([]);

        // Headers
        const headers = ['Agent', 'Total Leads', 'Verified', 'Activated'];
        const headerRow = worksheet.addRow(headers);
        headerRow.height = 25;
        for (let col = 1; col <= 4; col++) {
          const cell = headerRow.getCell(col);
          cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin' }, bottom: { style: 'thin' },
            left: { style: 'thin' }, right: { style: 'thin' }
          };
        }

        // Data rows with color coding (same as team performance)
        exportData.forEach((agent) => {
          const row = worksheet.addRow([
            agent.agent, agent.totalLeads, agent.verified, agent.activated
          ]);

          // Use same color scheme as team performance - light green for active agents
          let bgColor = 'FFF3F4F6'; // Default gray
          if (agent.totalLeads > 0 || agent.verified > 0 || agent.activated > 0) {
            bgColor = 'FFD1FAE5'; // Light green for active agents (same as >= 100% in team performance)
          }

          for (let col = 1; col <= 4; col++) {
            const cell = row.getCell(col);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
            cell.font = { size: 11 };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          }
        });

        // Summary row
        const totals = {
          agent: 'TOTAL',
          totalLeads: agentStats.reduce((sum, agent) => sum + agent.totalLeads, 0),
          verified: agentStats.reduce((sum, agent) => sum + agent.verified, 0),
          activated: agentStats.reduce((sum, agent) => sum + agent.activated, 0)
        };

        const summaryRow = worksheet.addRow([
          totals.agent, totals.totalLeads, totals.verified, totals.activated
        ]);

        summaryRow.height = 25;
        for (let col = 1; col <= 4; col++) {
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
          { width: 25 }, { width: 12 }, { width: 12 }, { width: 12 }
        ];

        const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const filename = `Daily_Performance_${dateStr}_${timestamp}.xlsx`;

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        window.URL.revokeObjectURL(url);

        toast.success('Daily Performance report exported successfully!', { duration: 3000, icon: '✅' });
        return;
      }

      // Fallback to xlsx
      const XLSX = await import('xlsx');

      const exportData = agentStats.map((agent) => ({
        'Agent': agent.agentName,
        'Total Leads': agent.totalLeads,
        'Verified': agent.verified,
        'Activated': agent.activated,
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);
      ws['!cols'] = [
        { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 12 }
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Daily Performance');

      const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const filename = `Daily_Performance_${dateStr}_${timestamp}.xlsx`;
      XLSX.writeFile(wb, filename);

      toast.success('Daily Performance report exported successfully!', { duration: 3000, icon: '✅' });
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      toast.error('Failed to export to Excel');
    }
  };

  // Export Daily Performance to PDF
  const handleExportToPDF = async () => {
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - (margin * 2);
      let yPosition = margin;

      // Prepare data
      const exportData = agentStats.map((agent) => ({
        agent: agent.agentName,
        totalLeads: agent.totalLeads,
        verified: agent.verified,
        activated: agent.activated,
      }));

      // Header with gradient effect
      pdf.setFillColor(79, 70, 229); // Indigo
      pdf.rect(margin, yPosition, contentWidth, 30, 'F');

      pdf.setDrawColor(99, 102, 241);
      pdf.setLineWidth(0.5);
      pdf.rect(margin, yPosition, contentWidth, 30);

      // Title
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Daily Performance Report', pageWidth / 2, yPosition + 12, { align: 'center' });

      // Date
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'normal');
      const selectedDateStr = format(selectedDate, 'dd MMMM yyyy');
      pdf.text(`Date: ${selectedDateStr}`, pageWidth / 2, yPosition + 22, { align: 'center' });

      yPosition += 38;

      // Table setup
      const tableTop = yPosition;
      const rowHeight = 8;
      const headerHeight = 10;
      const colWidths = [
        contentWidth * 0.35, // Agent
        contentWidth * 0.20, // Total Leads
        contentWidth * 0.20, // Verified
        contentWidth * 0.25  // Activated
      ];
      let xPosition = margin;

      // Table headers
      pdf.setFillColor(79, 70, 229);
      pdf.rect(xPosition, yPosition, contentWidth, headerHeight, 'F');

      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');

      const headers = ['Agent', 'Total Leads', 'Verified', 'Activated'];
      headers.forEach((header, index) => {
        pdf.text(header, xPosition + colWidths[index] / 2, yPosition + 7, { align: 'center' });
        if (index < headers.length - 1) {
          xPosition += colWidths[index];
        }
      });

      // Header borders
      pdf.setDrawColor(99, 102, 241);
      pdf.setLineWidth(0.3);
      let headerCellX = margin;
      headers.forEach((_, colIndex) => {
        pdf.line(headerCellX, yPosition, headerCellX, yPosition + headerHeight);
        headerCellX += colWidths[colIndex];
      });
      pdf.line(margin + contentWidth, yPosition, margin + contentWidth, yPosition + headerHeight);
      pdf.line(margin, yPosition, margin + contentWidth, yPosition);
      pdf.line(margin, yPosition + headerHeight, margin + contentWidth, yPosition + headerHeight);

      yPosition += headerHeight;
      xPosition = margin;

      // Data rows
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(0, 0, 0);

      exportData.forEach((agent, index) => {
        if (yPosition + rowHeight > pageHeight - margin - 30) {
          pdf.addPage();
          yPosition = margin;
        }

        // Row background (same color scheme as team performance)
        if (agent.totalLeads > 0 || agent.verified > 0 || agent.activated > 0) {
          pdf.setFillColor(209, 250, 229); // Light green for active agents (same as >= 100% in team performance)
          pdf.rect(margin, yPosition, contentWidth, rowHeight, 'F');
        }

        // Cell borders
        pdf.setDrawColor(200, 200, 200);
        pdf.setLineWidth(0.2);
        let cellX = margin;
        headers.forEach((_, colIndex) => {
          pdf.line(cellX, yPosition, cellX, yPosition + rowHeight);
          pdf.line(cellX, yPosition, cellX + colWidths[colIndex], yPosition);
          pdf.line(cellX, yPosition + rowHeight, cellX + colWidths[colIndex], yPosition + rowHeight);
          cellX += colWidths[colIndex];
        });
        pdf.line(margin + contentWidth, yPosition, margin + contentWidth, yPosition + rowHeight);

        // Cell content
        pdf.text(agent.agent, xPosition + colWidths[0] / 2, yPosition + 5.5, { align: 'center', maxWidth: colWidths[0] - 2 });
        xPosition += colWidths[0];
        pdf.text(agent.totalLeads.toString(), xPosition + colWidths[1] / 2, yPosition + 5.5, { align: 'center' });
        xPosition += colWidths[1];
        pdf.text(agent.verified.toString(), xPosition + colWidths[2] / 2, yPosition + 5.5, { align: 'center' });
        xPosition += colWidths[2];
        pdf.text(agent.activated.toString(), xPosition + colWidths[3] / 2, yPosition + 5.5, { align: 'center' });

        yPosition += rowHeight;
        xPosition = margin;
      });

      // Summary row
      yPosition += 5;
      pdf.setFillColor(59, 130, 246); // Professional blue color
      pdf.rect(margin, yPosition, contentWidth, headerHeight + 2, 'F');

      // Summary borders
      pdf.setDrawColor(255, 255, 255);
      pdf.setLineWidth(0.4);
      let summaryX = margin;
      headers.forEach((_, colIndex) => {
        pdf.line(summaryX, yPosition, summaryX, yPosition + headerHeight + 2);
        summaryX += colWidths[colIndex];
      });
      pdf.line(margin + contentWidth, yPosition, margin + contentWidth, yPosition + headerHeight + 2);
      pdf.line(margin, yPosition, margin + contentWidth, yPosition);
      pdf.line(margin, yPosition + headerHeight + 2, margin + contentWidth, yPosition + headerHeight + 2);

      // Summary text
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);

      xPosition = margin;
      const totals = {
        agent: 'TOTAL',
        totalLeads: agentStats.reduce((sum, agent) => sum + agent.totalLeads, 0),
        verified: agentStats.reduce((sum, agent) => sum + agent.verified, 0),
        activated: agentStats.reduce((sum, agent) => sum + agent.activated, 0)
      };

      pdf.text(totals.agent, xPosition + colWidths[0] / 2, yPosition + 7.5, { align: 'center' });
      xPosition += colWidths[0];
      pdf.text(totals.totalLeads.toString(), xPosition + colWidths[1] / 2, yPosition + 7.5, { align: 'center' });
      xPosition += colWidths[1];
      pdf.text(totals.verified.toString(), xPosition + colWidths[2] / 2, yPosition + 7.5, { align: 'center' });
      xPosition += colWidths[2];
      pdf.text(totals.activated.toString(), xPosition + colWidths[3] / 2, yPosition + 7.5, { align: 'center' });

      // Footer
      yPosition = pageHeight - margin - 10;
      pdf.setFontSize(8);
      pdf.setTextColor(107, 114, 128);
      pdf.setFont('helvetica', 'italic');
      pdf.text(`Generated on ${format(new Date(), 'dd MMMM yyyy, hh:mm a')}`, pageWidth / 2, yPosition, { align: 'center' });

      // Generate filename and download
      const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const filename = `Daily_Performance_${dateStr}_${timestamp}.pdf`;

      pdf.save(filename);

      toast.success('Daily Performance PDF report generated successfully!', {
        duration: 3000,
        icon: '✅'
      });
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      toast.error('Failed to export to PDF');
    }
  };

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
                Daily Performance
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
        <div className="mt-6 bg-white rounded-2xl shadow-xl p-4 sm:p-8 border border-gray-100">
          {/* Phone Layout: Stacked */}
          <div className="sm:hidden">
            <div className="text-center mb-4">
              <h2 className="text-lg font-bold text-gray-900">Daily Performance</h2>
            </div>
            <div className="flex items-center justify-center space-x-3 mb-4">
              <div className="flex items-center">
                <CalendarDays className="h-4 w-4 text-gray-400 mr-2" />
                <input
                  type="date"
                  value={format(selectedDate, 'yyyy-MM-dd')}
                  onChange={e => setSelectedDate(new Date(e.target.value))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 shadow-sm"
                  max={format(new Date(), 'yyyy-MM-dd')}
                />
              </div>
              <button
                onClick={handleExportToExcel}
                className="inline-flex items-center px-2 py-1.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 shadow-md hover:shadow-lg"
                title="Export to Excel"
              >
                <FileText className="h-3 w-3 mr-1" />
                <span className="text-xs font-medium">Excel</span>
              </button>
              <button
                onClick={handleExportToPDF}
                className="inline-flex items-center px-2 py-1.5 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-lg hover:from-red-600 hover:to-rose-700 transition-all duration-200 shadow-md hover:shadow-lg"
                title="Export to PDF"
              >
                <Download className="h-3 w-3 mr-1" />
                <span className="text-xs font-medium">PDF</span>
              </button>
            </div>
          </div>

          {/* Desktop Layout: Side by side */}
          <div className="hidden sm:block">
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
              <div className="flex items-center space-x-2 ml-4">
                <button
                  onClick={handleExportToExcel}
                  className="inline-flex items-center px-3 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-200 shadow-md hover:shadow-lg"
                  title="Export to Excel"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  <span className="text-sm font-medium">Export Excel</span>
                </button>
                <button
                  onClick={handleExportToPDF}
                  className="inline-flex items-center px-3 py-2 bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-lg hover:from-red-600 hover:to-rose-700 transition-all duration-200 shadow-md hover:shadow-lg"
                  title="Export to PDF"
                >
                  <Download className="h-4 w-4 mr-2" />
                  <span className="text-sm font-medium">Export PDF</span>
                </button>
              </div>
            </div>
          </div>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : agentStats.length === 0 ? (
            <div className="text-center py-8">
              <CalendarIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No activity found</h3>
              <p className="mt-1 text-sm text-gray-500">No leads were created, verified, or activated on this date.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Agent
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Leads
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Verified
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Activated
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {agentStats.map((agent) => (
                    <tr key={agent.agentId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full">
                            <Users className="h-4 w-4 text-white" />
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900">
                              {agent.agentName}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-6 w-6 flex items-center justify-center bg-gradient-to-br from-blue-400 to-blue-500 rounded-full">
                            <Users className="h-3 w-3 text-white" />
                          </div>
                          <span className="ml-2 text-sm font-semibold text-gray-900">
                            {agent.totalLeads}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-6 w-6 flex items-center justify-center bg-gradient-to-br from-green-400 to-green-500 rounded-full">
                            <CheckCircle className="h-3 w-3 text-white" />
                          </div>
                          <span className="ml-2 text-sm font-semibold text-gray-900">
                            {agent.verified}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-6 w-6 flex items-center justify-center bg-gradient-to-br from-purple-400 to-purple-500 rounded-full">
                            <Zap className="h-3 w-3 text-white" />
                          </div>
                          <span className="ml-2 text-sm font-semibold text-gray-900">
                            {agent.activated}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-8 flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full">
                          <Users className="h-4 w-4 text-white" />
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-gray-900">
                            Team Total
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-6 w-6 flex items-center justify-center bg-gradient-to-br from-blue-400 to-blue-500 rounded-full">
                          <Users className="h-3 w-3 text-white" />
                        </div>
                        <span className="ml-2 text-sm font-bold text-gray-900">
                          {agentStats.reduce((sum, agent) => sum + agent.totalLeads, 0)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-6 w-6 flex items-center justify-center bg-gradient-to-br from-green-400 to-green-500 rounded-full">
                          <CheckCircle className="h-3 w-3 text-white" />
                        </div>
                        <span className="ml-2 text-sm font-bold text-green-800">
                          {agentStats.reduce((sum, agent) => sum + agent.verified, 0)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-6 w-6 flex items-center justify-center bg-gradient-to-br from-purple-400 to-purple-500 rounded-full">
                          <Zap className="h-3 w-3 text-white" />
                        </div>
                        <span className="ml-2 text-sm font-bold text-purple-800">
                          {agentStats.reduce((sum, agent) => sum + agent.activated, 0)}
                        </span>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 