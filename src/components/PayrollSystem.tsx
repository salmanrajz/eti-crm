import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  XCircle, 
  DollarSign, 
  Users, 
  Calculator, 
  FileText, 
  Download,
  TrendingUp,
  Settings
} from 'lucide-react';
import { collection, query, where, getDocs, doc, getDoc, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User, Lead } from '../types';
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import jsPDF from 'jspdf';
import InvoiceConfiguration from './InvoiceConfiguration';
import InvoiceGenerator from './InvoiceGenerator';
import type { PayrollCalculation } from '../types';

interface PayrollSystemProps {
  open: boolean;
  onClose: () => void;
  role: 'admin' | 'manager' | 'agent';
  user: User;
}

interface EmployeeSalary {
  id: string;
  employeeId: string;
  employeeName: string;
  baseSalary: number;
  allowances: number;
  deductions: number;
  netSalary: number;
  month: string;
  teamId: string;
  updatedAt: Date;
}

interface OfficeExpense {
  id: string;
  description: string;
  amount: number;
  date: Date;
  teamId: string;
  addedBy: string;
  category: 'office' | 'additional';
}

export default function PayrollSystem({ open, onClose, role, user }: PayrollSystemProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'salaries' | 'expenses' | 'calculations' | 'invoices'>('overview');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [employees, setEmployees] = useState<User[]>([]);
  const [salaries, setSalaries] = useState<EmployeeSalary[]>([]);
  const [expenses, setExpenses] = useState<OfficeExpense[]>([]);
  const [calculations, setCalculations] = useState<PayrollCalculation[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(user.teamId || '');
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [bonusAmounts, setBonusAmounts] = useState({
    targetAchievement: 1000,
    risingStar: 2000,
    superAchiever: 2500,
    elitePerformer: 3500,
    masterAchiever: 5000,
    legendaryStatus: 10000
  });
  const [isCommissionTeam, setIsCommissionTeam] = useState(false);

  const [salaryForm, setSalaryForm] = useState({
    employeeId: '',
    baseSalary: 0,
    allowances: 0
  });
  const [expenseForm, setExpenseForm] = useState({
    description: '',
    amount: 0,
    category: 'office' as 'office' | 'additional'
  });
  const [editingSalary, setEditingSalary] = useState<string | null>(null); // Track which salary is being edited

  // Invoice related states
  const [showInvoiceConfig, setShowInvoiceConfig] = useState(false);
  const [showInvoiceGenerator, setShowInvoiceGenerator] = useState(false);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, selectedMonth, selectedTeam, role]);

  const loadData = async () => {
    setLoading(true);
    try {
      let employeeQuery;
      if (role === 'admin') {
        employeeQuery = query(
          collection(db, 'users'),
          where('role', 'in', ['agent', 'manager']),
          where('teamId', '==', selectedTeam)
        );
      } else {
        employeeQuery = query(
          collection(db, 'users'),
          where('role', 'in', ['agent', 'manager']),
          where('teamId', '==', user.teamId)
        );
      }
      
      const employeeSnapshot = await getDocs(employeeQuery);
      const employeeList = employeeSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as User[];
      setEmployees(employeeList);

      const salaryQuery = query(
        collection(db, 'salaries'),
        where('month', '==', selectedMonth),
        where('teamId', '==', role === 'admin' ? selectedTeam : user.teamId)
      );
      const salarySnapshot = await getDocs(salaryQuery);
      const salaryList = salarySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as EmployeeSalary[];
      setSalaries(salaryList);

      // Check if we need to carry forward salaries from previous month
      // Carry forward for employees who don't have current month salary
      await carryForwardSalaries(employeeList, salaryList);

      const expenseQuery = query(
        collection(db, 'expenses'),
        where('teamId', '==', role === 'admin' ? selectedTeam : user.teamId)
      );
      const expenseSnapshot = await getDocs(expenseQuery);
      const expenseList = expenseSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate()
      })) as OfficeExpense[];
      setExpenses(expenseList);

      // Load bonus amounts from team settings
      const teamId = role === 'admin' ? selectedTeam : user.teamId;
      if (teamId) {
        try {
          const teamSettingsRef = doc(db, 'teamSettings', teamId);
          const teamSettingsDoc = await getDoc(teamSettingsRef);
          
          if (teamSettingsDoc.exists()) {
            const data = teamSettingsDoc.data();
            setBonusAmounts({
              targetAchievement: data.targetAchievement || 1000,
              risingStar: data.risingStar || 2000,
              superAchiever: data.superAchiever || 2500,
              elitePerformer: data.elitePerformer || 3500,
              masterAchiever: data.masterAchiever || 5000,
              legendaryStatus: data.legendaryStatus || 10000
            });
          }
        } catch (error) {
          console.error('Error loading bonus amounts:', error);
        }
      }

      // Load teams for both admin and manager to get team names
      const teamQuery = query(collection(db, 'teams'));
      const teamSnapshot = await getDocs(teamQuery);
      const teamList = teamSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
      }));
      setTeams(teamList);

      // Check if current team is commission-based
      const currentTeamId = role === 'admin' ? selectedTeam : user.teamId;
      if (currentTeamId) {
        try {
          const teamDoc = await getDoc(doc(db, 'teams', currentTeamId));
          if (teamDoc.exists()) {
            setIsCommissionTeam(teamDoc.data().commissionBased || false);
          }
        } catch (error) {
          console.error('Error checking team commission status:', error);
          setIsCommissionTeam(false);
        }
      }

    } catch (error) {
      console.error('Error loading payroll data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Function to carry forward salaries from previous month
  const carryForwardSalaries = async (employeeList: User[], salaryList: EmployeeSalary[]) => {
    try {
      // Get previous month
      const currentDate = new Date(selectedMonth + '-01');
      const previousMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
      const previousMonthStr = format(previousMonth, 'yyyy-MM');
      
      const teamId = role === 'admin' ? selectedTeam : user.teamId;
      if (!teamId) {
        console.error('No team ID available for salary carry forward');
        return;
      }
      
      console.log(`Checking carry forward: ${previousMonthStr} -> ${selectedMonth}`);
      console.log(`Current employees: ${employeeList.length}, Current salaries: ${salaryList.length}`);
      
      // Query previous month salaries
      const previousSalaryQuery = query(
        collection(db, 'salaries'),
        where('month', '==', previousMonthStr),
        where('teamId', '==', teamId)
      );
      const previousSalarySnapshot = await getDocs(previousSalaryQuery);
      const previousSalaries = previousSalarySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as EmployeeSalary[];

      console.log(`Previous month salaries found: ${previousSalaries.length}`);

      // Carry forward salaries for employees who don't have current month salary
      const carriedForwardSalaries: EmployeeSalary[] = [];
      
      for (const employee of employeeList) {
        const existingSalary = salaryList.find(s => s.employeeId === employee.id);
        if (!existingSalary) {
          const previousSalary = previousSalaries.find(s => s.employeeId === employee.id);
          if (previousSalary) {
            console.log(`Carrying forward salary for ${employee.name} (${employee.role})`);
            // Carry forward the salary
            const carriedForwardSalary: EmployeeSalary = {
              id: '',
              employeeId: employee.id,
              employeeName: employee.name,
              baseSalary: previousSalary.baseSalary,
              allowances: previousSalary.allowances,
              deductions: 0,
              netSalary: previousSalary.baseSalary + previousSalary.allowances,
              month: selectedMonth,
              teamId: teamId,
              updatedAt: new Date()
            };
            
            // Save to Firestore
            const docRef = await addDoc(collection(db, 'salaries'), {
              employeeId: carriedForwardSalary.employeeId,
              employeeName: carriedForwardSalary.employeeName,
              baseSalary: carriedForwardSalary.baseSalary,
              allowances: carriedForwardSalary.allowances,
              deductions: carriedForwardSalary.deductions,
              netSalary: carriedForwardSalary.netSalary,
              month: carriedForwardSalary.month,
              teamId: carriedForwardSalary.teamId,
              updatedAt: carriedForwardSalary.updatedAt
            });
            
            carriedForwardSalary.id = docRef.id;
            carriedForwardSalaries.push(carriedForwardSalary);
          } else {
            console.log(`No previous salary found for ${employee.name} (${employee.role})`);
          }
        } else {
          console.log(`Salary already exists for ${employee.name} (${employee.role})`);
        }
      }

      // Update local state with carried forward salaries
      if (carriedForwardSalaries.length > 0) {
        setSalaries(prev => [...prev, ...carriedForwardSalaries]);
        console.log(`Carried forward ${carriedForwardSalaries.length} salaries from ${previousMonthStr} to ${selectedMonth}`);
        alert(`✅ ${carriedForwardSalaries.length} salaries automatically carried forward from ${format(previousMonth, 'MMMM yyyy')} to ${format(currentDate, 'MMMM yyyy')}. You can edit them if needed.`);
        
        // Reload salaries to get the updated list
        const updatedSalaryQuery = query(
          collection(db, 'salaries'),
          where('month', '==', selectedMonth),
          where('teamId', '==', teamId)
        );
        const updatedSalarySnapshot = await getDocs(updatedSalaryQuery);
        const updatedSalaryList = updatedSalarySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          updatedAt: doc.data().updatedAt?.toDate()
        })) as EmployeeSalary[];
        setSalaries(updatedSalaryList);
      } else {
        console.log('No salaries to carry forward');
      }
    } catch (error) {
      console.error('Error carrying forward salaries:', error);
    }
  };

  const calculatePayroll = async () => {
    setLoading(true);
    try {
      const calculations: PayrollCalculation[] = [];

      // Check if team is commission-based
      const teamId = role === 'admin' ? selectedTeam : user.teamId;
      let isCommissionTeam = false;
      let commissionConfig = null;

      if (teamId) {
        try {
          const teamDoc = await getDoc(doc(db, 'teams', teamId));
          if (teamDoc.exists()) {
            isCommissionTeam = teamDoc.data().commissionBased || false;
          }

          if (isCommissionTeam) {
            const configRef = doc(db, 'commissionConfigs', teamId);
            const configDoc = await getDoc(configRef);
            if (configDoc.exists()) {
              commissionConfig = configDoc.data();
            }
          }
        } catch (error) {
          console.error('Error checking team commission status:', error);
        }
      }

      for (const employee of employees) {
        if (isCommissionTeam && commissionConfig) {
          // Commission-based calculation
          await calculateCommissionPayroll(employee, calculations, commissionConfig);
        } else {
          // Traditional attendance-based calculation
          await calculateTraditionalPayroll(employee, calculations);
        }
      }

      setCalculations(calculations);
    } catch (error) {
      console.error('Error calculating payroll:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateCommissionPayroll = async (employee: User, calculations: PayrollCalculation[], commissionConfig: any) => {
    try {
      // Load activated leads for this employee in the selected month
      const startOfSelectedMonth = startOfMonth(new Date(selectedMonth + '-01'));
      const endOfSelectedMonth = endOfMonth(new Date(selectedMonth + '-01'));
      
      const leadsQuery = query(
        collection(db, 'leads'),
        where('agentId', '==', employee.id),
        where('status', '==', 'activated'),
        where('updatedAt', '>=', startOfSelectedMonth),
        where('updatedAt', '<=', endOfSelectedMonth)
      );
      const leadsSnapshot = await getDocs(leadsQuery);
      const leads = leadsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Lead[];

      // Calculate earnings by category
      const categoryStats = {
        standard: 0,
        silver: 0,
        silverPlus: 0,
        gold: 0,
        goldPlus: 0,
        platinum: 0
      };

      leads.forEach(lead => {
        if (lead.plans) {
          lead.plans.forEach(plan => {
            const category = plan.category.toLowerCase();
            if (category.includes('standard')) categoryStats.standard++;
            else if (category.includes('silver')) {
              if (category.includes('plus')) categoryStats.silverPlus++;
              else categoryStats.silver++;
            }
            else if (category.includes('gold')) {
              if (category.includes('plus')) categoryStats.goldPlus++;
              else categoryStats.gold++;
            }
            else if (category.includes('platinum')) categoryStats.platinum++;
          });
        }
      });

      // Calculate total earnings
      const totalEarnings = 
        (categoryStats.standard * (commissionConfig.standard || 0)) +
        (categoryStats.silver * (commissionConfig.silver || 0)) +
        (categoryStats.silverPlus * (commissionConfig.silverPlus || 0)) +
        (categoryStats.gold * (commissionConfig.gold || 0)) +
        (categoryStats.goldPlus * (commissionConfig.goldPlus || 0)) +
        (categoryStats.platinum * (commissionConfig.platinum || 0));

      const totalActivations = Object.values(categoryStats).reduce((sum, count) => sum + count, 0);

      calculations.push({
        employeeId: employee.id,
        employeeName: employee.name,
        baseSalary: totalEarnings, // Use earnings as base salary
        attendanceDays: totalActivations, // Use activations as attendance days
        totalDays: totalActivations, // Use activations as total days
        leaveDeductions: 0, // No deductions for commission-based teams
        bonuses: 0, // No additional bonuses for commission-based teams
        netSalary: totalEarnings, // Net salary is the same as earnings
        month: selectedMonth,
        achievementPercentage: 100, // Always 100% for commission-based teams
        target: totalActivations, // Target is the same as achieved
        achieved: totalActivations
      });
    } catch (error) {
      console.error('Error calculating commission payroll for employee:', employee.id, error);
    }
  };

  const calculateTraditionalPayroll = async (employee: User, calculations: PayrollCalculation[]) => {
    try {
      const attendanceRef = doc(db, 'attendance', `${employee.id}_${selectedMonth}`);
      const attendanceDoc = await getDoc(attendanceRef);
      const attendanceData = attendanceDoc.exists() ? attendanceDoc.data().days : {};

      const days = eachDayOfInterval({
        start: startOfMonth(new Date(selectedMonth + '-01')),
        end: endOfMonth(new Date(selectedMonth + '-01'))
      });

      let presentDays = 0;
      let absentDays = 0;
      let halfdayPresentDays = 0;
      let totalDays = days.length;

      days.forEach(day => {
        const dayKey = format(day, 'yyyy-MM-dd');
        const status = attendanceData[dayKey];
        
        if (status === 'present') {
          presentDays += 1;
        } else if (status === 'halfday_present') {
          halfdayPresentDays += 1;
          presentDays += 0.5;
        } else if (status === 'absent') {
          absentDays += 1;
        }
      });

      const salary = salaries.find(s => s.employeeId === employee.id);
      const baseSalary = salary?.baseSalary || 0;
      const allowances = salary?.allowances || 0;

      const dailyRate = baseSalary / totalDays;
      const absentDeductions = absentDays * dailyRate;
      const halfdayDeductions = halfdayPresentDays * (dailyRate * 0.5);
      const totalDeductions = absentDeductions + halfdayDeductions;

      // Calculate performance bonus
      let bonuses = 0;
      let achievementPercentage = 0;
      let target = 0;
      let achieved = 0;
      
      try {
        const targetRef = doc(db, 'agentTargets', `${employee.id}_${selectedMonth}`);
        const targetDoc = await getDoc(targetRef);
        
        if (targetDoc.exists()) {
          const targetData = targetDoc.data();
          target = targetData.target || 0;
          
          const startOfSelectedMonth = startOfMonth(new Date(selectedMonth + '-01'));
          const endOfSelectedMonth = endOfMonth(new Date(selectedMonth + '-01'));
          
          const leadsQuery = query(
            collection(db, 'leads'),
            where('agentId', '==', employee.id),
            where('status', '==', 'activated'),
            where('updatedAt', '>=', startOfSelectedMonth),
            where('updatedAt', '<=', endOfSelectedMonth)
          );
          const leadsSnapshot = await getDocs(leadsQuery);
          const leads = leadsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate(),
            updatedAt: doc.data().updatedAt?.toDate()
          })) as Lead[];
          
          achieved = leads.reduce((sum, lead) => sum + (lead.plans?.length || 0), 0);
          achievementPercentage = target > 0 ? (achieved / target) * 100 : 0;
          
          if (achievementPercentage >= 250) {
            bonuses = bonusAmounts.legendaryStatus;
          } else if (achievementPercentage >= 200) {
            bonuses = bonusAmounts.masterAchiever;
          } else if (achievementPercentage >= 170) {
            bonuses = bonusAmounts.elitePerformer;
          } else if (achievementPercentage >= 150) {
            bonuses = bonusAmounts.superAchiever;
          } else if (achievementPercentage >= 130) {
            bonuses = bonusAmounts.risingStar;
          } else if (achievementPercentage >= 100) {
            bonuses = bonusAmounts.targetAchievement;
          } else {
            bonuses = 0;
          }
        }
      } catch (error) {
        console.error('Error calculating bonus for employee:', employee.id, error);
      }

      const employeeExpenses = 0;
      const netSalary = baseSalary + allowances - totalDeductions + bonuses + employeeExpenses;

      calculations.push({
        employeeId: employee.id,
        employeeName: employee.name,
        baseSalary,
        attendanceDays: presentDays,
        totalDays,
        leaveDeductions: totalDeductions,
        bonuses,
        netSalary,
        month: selectedMonth,
        achievementPercentage,
        target,
        achieved
      });
    } catch (error) {
      console.error('Error calculating traditional payroll for employee:', employee.id, error);
    }
  };

  const saveSalary = async () => {
    try {
      // Check if a salary already exists for this employee in this month
      const existingSalary = salaries.find(s => s.employeeId === salaryForm.employeeId);
      
      const salaryData = {
        employeeId: salaryForm.employeeId,
        employeeName: employees.find(e => e.id === salaryForm.employeeId)?.name,
        baseSalary: salaryForm.baseSalary,
        allowances: salaryForm.allowances,
        deductions: 0,
        netSalary: salaryForm.baseSalary + salaryForm.allowances,
        month: selectedMonth,
        teamId: role === 'admin' ? selectedTeam : user.teamId,
        updatedAt: new Date()
      };

      if (existingSalary && editingSalary) {
        // Update existing salary
        const salaryRef = doc(db, 'salaries', editingSalary);
        await updateDoc(salaryRef, salaryData);
        setEditingSalary(null);
      } else if (existingSalary) {
        // Salary already exists, show error
        alert('Salary for this employee already exists. Please edit the existing salary instead.');
        return;
      } else {
        // Create new salary
        await addDoc(collection(db, 'salaries'), salaryData);
      }
      
      setSalaryForm({ employeeId: '', baseSalary: 0, allowances: 0 });
      loadData();
    } catch (error) {
      console.error('Error saving salary:', error);
    }
  };

  const editSalary = (salary: EmployeeSalary) => {
    setSalaryForm({
      employeeId: salary.employeeId,
      baseSalary: salary.baseSalary,
      allowances: salary.allowances
    });
    setEditingSalary(salary.id);
  };

  const cancelEdit = () => {
    setSalaryForm({ employeeId: '', baseSalary: 0, allowances: 0 });
    setEditingSalary(null);
  };

  const saveExpense = async () => {
    try {
      const expenseData = {
        description: expenseForm.description,
        amount: expenseForm.amount,
        category: expenseForm.category,
        date: new Date(),
        teamId: role === 'admin' ? selectedTeam : user.teamId,
        addedBy: user.id
      };

      await addDoc(collection(db, 'expenses'), expenseData);
      setExpenseForm({ description: '', amount: 0, category: 'office' });
      loadData();
    } catch (error) {
      console.error('Error saving expense:', error);
    }
  };

  const generateInvoice = () => {
    setShowInvoiceGenerator(true);
  };

  const handleInvoiceConfigClose = () => {
    setShowInvoiceConfig(false);
  };

  const handleInvoiceGeneratorClose = () => {
    setShowInvoiceGenerator(false);
  };

  const downloadPDF = () => {
    if (calculations.length === 0) {
      alert('Please calculate payroll first before downloading PDF');
      return;
    }

    // Simple number formatting function to avoid locale issues
    const formatNumber = (num: number) => {
      return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    };

    // Function to draw beautiful borders
    const drawBorder = (x: number, y: number, width: number, height: number, style: 'simple' | 'double' | 'decorative' = 'simple') => {
      if (style === 'double') {
        // Double border
        pdf.setLineWidth(0.5);
        pdf.rect(x, y, width, height);
        pdf.setLineWidth(0.2);
        pdf.rect(x + 2, y + 2, width - 4, height - 4);
      } else if (style === 'decorative') {
        // Decorative border with corner decorations
        pdf.setLineWidth(0.8);
        pdf.rect(x, y, width, height);
        
        // Corner decorations
        const cornerSize = 8;
        pdf.setLineWidth(1.2);
        
        // Top-left corner
        pdf.line(x, y + cornerSize, x, y);
        pdf.line(x, y, x + cornerSize, y);
        
        // Top-right corner
        pdf.line(x + width - cornerSize, y, x + width, y);
        pdf.line(x + width, y, x + width, y + cornerSize);
        
        // Bottom-left corner
        pdf.line(x, y + height - cornerSize, x, y + height);
        pdf.line(x, y + height, x + cornerSize, y + height);
        
        // Bottom-right corner
        pdf.line(x + width - cornerSize, y + height, x + width, y + height);
        pdf.line(x + width, y + height, x + width, y + height - cornerSize);
      } else {
        // Simple border
        pdf.setLineWidth(0.8);
        pdf.rect(x, y, width, height);
      }
      pdf.setLineWidth(0.2); // Reset to default
    };

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    let yPosition = margin;

    // Add decorative page border
    drawBorder(10, 10, pageWidth - 20, pageHeight - 20, 'decorative');

    // Set simple font
    pdf.setFont('helvetica');

    // Header
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(44, 62, 80);
    const teamId = role === 'admin' ? selectedTeam : user.teamId;
    const teamName = teams.find(t => t.id === teamId)?.name || 'Unknown Team';
    pdf.text(teamName, pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 6;
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Payroll Department', pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 8;
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('PAYROLL REPORT', pageWidth / 2, yPosition, { align: 'center' });
    
    yPosition += 8;
    
    // Dotted line under header
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineDashPattern([2, 2], 0);
    pdf.line(margin, yPosition, pageWidth - margin, yPosition);
    pdf.setLineDashPattern([], 0); // Reset to solid line
    
    yPosition += 10;

    // Company/Team Information
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    
    // Information box with border - increased height
    drawBorder(margin, yPosition, contentWidth, 35, 'double');
    pdf.text(`Team: ${teamName}`, margin + 5, yPosition + 8);
    
    yPosition += 8;
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Month: ${format(new Date(selectedMonth + '-01'), 'MMMM yyyy')}`, margin + 5, yPosition + 8);
    
    yPosition += 8;
    pdf.text(`Generated on: ${format(new Date(), 'dd/MM/yyyy')}`, margin + 5, yPosition + 8);
    
    yPosition += 8;
    pdf.text(`Generated by: ${user.name} (${role})`, margin + 5, yPosition + 8);
    
    yPosition += 25;

    // Dotted line separator
    pdf.setLineDashPattern([2, 2], 0);
    pdf.line(margin, yPosition, pageWidth - margin, yPosition);
    pdf.setLineDashPattern([], 0);
    
    yPosition += 10;

    // Summary Statistics
    const totalEmployees = calculations.length;
    const totalBaseSalary = calculations.reduce((sum, calc) => sum + calc.baseSalary, 0);
    const totalBonuses = calculations.reduce((sum, calc) => sum + calc.bonuses, 0);
    const totalDeductions = calculations.reduce((sum, calc) => sum + calc.leaveDeductions, 0);
    const totalNetSalary = calculations.reduce((sum, calc) => sum + calc.netSalary, 0);
    const totalActivations = calculations.reduce((sum, calc) => sum + (calc.achieved || 0), 0);

    // Summary Section
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('SUMMARY', margin, yPosition);
    
    yPosition += 8;

    // Summary table with dotted lines - now 6 columns including activations
    const summaryCols = [
      { label: 'Total Employees', value: totalEmployees.toString() },
      { label: 'Base Salary', value: `${formatNumber(totalBaseSalary)}` },
      { label: 'Total Activations', value: totalActivations.toString() },
      { label: 'Total Bonuses', value: `${formatNumber(totalBonuses)}` },
      { label: 'Total Deductions', value: `${formatNumber(totalDeductions)}` },
      { label: 'Net Payroll', value: `${formatNumber(totalNetSalary)}` }
    ];

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    
    summaryCols.forEach((item, index) => {
      const xPos = margin + (index * (contentWidth / 6)); // Changed from 5 to 6 columns
      const boxWidth = (contentWidth / 6) - 2; // Adjusted for 6 columns
      
      // Box border with decorative style - increased height
      drawBorder(xPos, yPosition, boxWidth, 25, 'simple'); // Increased height from 20 to 25
      
      // Label
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text(item.label, xPos + 2, yPosition + 5);
      
      // Value
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.text(item.value, xPos + 2, yPosition + 15);
    });

    yPosition += 35; // Increased from 30 to 35

    // Dotted line separator
    pdf.setLineDashPattern([2, 2], 0);
    pdf.line(margin, yPosition, pageWidth - margin, yPosition);
    pdf.setLineDashPattern([], 0);
    
    yPosition += 10;

    // Detailed Payroll Section
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('DETAILED PAYROLL BREAKDOWN', margin, yPosition);
    
    yPosition += 8;

    // Check if we need a new page
    if (yPosition > pageHeight - 80) {
      pdf.addPage();
      yPosition = margin;
      // Add decorative page border for new page
      drawBorder(10, 10, pageWidth - 20, pageHeight - 20, 'decorative');
    }

    // Table headers with dotted lines
    const headers = ['Employee Name', 'Base Salary', 'Attendance', 'Activations', 'Deductions', 'Bonuses', 'Net Salary'];
    const colWidths = [40, 22, 22, 25, 22, 22, 25]; // Adjusted widths to fit better
    
    // Header row
    pdf.setFillColor(240, 240, 240);
    pdf.rect(margin, yPosition, contentWidth, 8, 'F');
    
    // Add decorative border around header
    drawBorder(margin - 2, yPosition - 2, contentWidth + 4, 12, 'simple');
    
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    let xPos = margin;
    headers.forEach((header, index) => {
      pdf.text(header, xPos + 2, yPosition + 5);
      xPos += colWidths[index];
    });
    
    yPosition += 8;

    // Dotted line under header
    pdf.setLineDashPattern([2, 2], 0);
    pdf.line(margin, yPosition, pageWidth - margin, yPosition);
    pdf.setLineDashPattern([], 0);
    
    yPosition += 5;

    // Table rows
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');

    // Sort calculations: managers first, then agents
    const sortedCalculations = [...calculations].sort((a, b) => {
      const employeeA = employees.find(emp => emp.id === a.employeeId);
      const employeeB = employees.find(emp => emp.id === b.employeeId);
      
      // Managers first
      if (employeeA?.role === 'manager' && employeeB?.role !== 'manager') return -1;
      if (employeeA?.role !== 'manager' && employeeB?.role === 'manager') return 1;
      
      // Then sort by name
      return a.employeeName.localeCompare(b.employeeName);
    });

    sortedCalculations.forEach((calc, index) => {
      // Check if we need a new page
      if (yPosition > pageHeight - 20) {
        pdf.addPage();
        yPosition = margin;
        
        // Add decorative page border for new page
        drawBorder(10, 10, pageWidth - 20, pageHeight - 20, 'decorative');
        
        // Repeat header on new page
        pdf.setFillColor(240, 240, 240);
        pdf.rect(margin, yPosition, contentWidth, 8, 'F');
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        
        xPos = margin;
        headers.forEach((header, headerIndex) => {
          pdf.text(header, xPos + 2, yPosition + 5);
          xPos += colWidths[headerIndex];
        });
        yPosition += 8;
        
        // Dotted line under header
        pdf.setLineDashPattern([2, 2], 0);
        pdf.line(margin, yPosition, pageWidth - margin, yPosition);
        pdf.setLineDashPattern([], 0);
        yPosition += 5;
      }

      // Check if this is a manager
      const employee = employees.find(emp => emp.id === calc.employeeId);
      const isManager = employee?.role === 'manager';

      // Row data
      xPos = margin;
      
      // Employee name (truncate if too long) - bold for managers
      const empName = calc.employeeName.length > 20 ? calc.employeeName.substring(0, 20) + '...' : calc.employeeName;
      if (isManager) {
        pdf.setFont('helvetica', 'bold');
      }
      pdf.text(empName, xPos + 2, yPosition);
      pdf.setFont('helvetica', 'normal');
      xPos += colWidths[0];
      
      // Base salary
      pdf.text(`${formatNumber(calc.baseSalary)}`, xPos + 2, yPosition);
      xPos += colWidths[1];
      
      // Attendance
      pdf.text(`${calc.attendanceDays}/${calc.totalDays}`, xPos + 2, yPosition);
      xPos += colWidths[2];
      
      // Achievement - show actual numbers instead of percentage
      if (calc.target && calc.achieved !== undefined) {
        pdf.text(`${calc.achieved}/${calc.target}`, xPos + 2, yPosition);
      } else {
        pdf.text('N/A', xPos + 2, yPosition);
      }
      xPos += colWidths[3];
      
      // Deductions
      pdf.text(`${formatNumber(calc.leaveDeductions)}`, xPos + 2, yPosition);
      xPos += colWidths[4];
      
      // Bonuses
      pdf.text(`${formatNumber(calc.bonuses)}`, xPos + 2, yPosition);
      xPos += colWidths[5];
      
      // Net salary
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${formatNumber(calc.netSalary)}`, xPos + 2, yPosition);
      pdf.setFont('helvetica', 'normal');
      
      yPosition += 7; // Increased from 5 to 7 for better spacing

      // Dotted line between rows (except last row)
      if (index < sortedCalculations.length - 1) {
        pdf.setLineDashPattern([1, 1], 0);
        pdf.line(margin, yPosition, pageWidth - margin, yPosition);
        pdf.setLineDashPattern([], 0);
        yPosition += 4; // Increased from 3 to 4
      }
    });

    yPosition += 10;

    // Add total row
    const totalRowY = yPosition;
    
    // Total row background
    pdf.setFillColor(240, 240, 240);
    pdf.rect(margin, totalRowY - 3, contentWidth, 8, 'F');
    
    // Total row data
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    
    xPos = margin;
    
    // Total label
    pdf.text('TOTAL', xPos + 2, totalRowY);
    xPos += colWidths[0];
    
    // Total base salary
    const totalBaseSalarySum = sortedCalculations.reduce((sum, calc) => sum + calc.baseSalary, 0);
    pdf.text(`${formatNumber(totalBaseSalarySum)}`, xPos + 2, totalRowY);
    xPos += colWidths[1];
    
    // Total attendance (show total days)
    const totalAttendanceDays = sortedCalculations.reduce((sum, calc) => sum + calc.attendanceDays, 0);
    const totalDays = sortedCalculations.reduce((sum, calc) => sum + calc.totalDays, 0);
    pdf.text(`${totalAttendanceDays}/${totalDays}`, xPos + 2, totalRowY);
    xPos += colWidths[2];
    
    // Total activations
    const totalActivationsSum = sortedCalculations.reduce((sum, calc) => sum + (calc.achieved || 0), 0);
    const totalTargetSum = sortedCalculations.reduce((sum, calc) => sum + (calc.target || 0), 0);
    pdf.text(`${totalActivationsSum}/${totalTargetSum}`, xPos + 2, totalRowY);
    xPos += colWidths[3];
    
    // Total deductions
    const totalDeductionsSum = sortedCalculations.reduce((sum, calc) => sum + calc.leaveDeductions, 0);
    pdf.text(`${formatNumber(totalDeductionsSum)}`, xPos + 2, totalRowY);
    xPos += colWidths[4];
    
    // Total bonuses
    const totalBonusesSum = sortedCalculations.reduce((sum, calc) => sum + calc.bonuses, 0);
    pdf.text(`${formatNumber(totalBonusesSum)}`, xPos + 2, totalRowY);
    xPos += colWidths[5];
    
    // Total net salary
    const totalNetSalarySum = sortedCalculations.reduce((sum, calc) => sum + calc.netSalary, 0);
    pdf.text(`${formatNumber(totalNetSalarySum)}`, xPos + 2, totalRowY);
    
    yPosition += 15;

    // Final dotted line
    pdf.setLineDashPattern([2, 2], 0);
    pdf.line(margin, yPosition, pageWidth - margin, yPosition);
    pdf.setLineDashPattern([], 0);
    
    yPosition += 10;

    // Footer
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`TOTAL NET PAYROLL: ${formatNumber(totalNetSalarySum)}`, pageWidth - margin, yPosition, { align: 'right' });
    
    yPosition += 8;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text('This is a computer generated document. No signature required.', pageWidth / 2, yPosition, { align: 'center' });

    // Save the PDF
    const fileName = `payroll_report_${selectedMonth}_${teamName.replace(/\s+/g, '_')}.pdf`;
    pdf.save(fileName);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[95vh] overflow-y-auto relative"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-100 rounded-full p-2 shadow z-10"
          aria-label="Close"
        >
          <XCircle className="w-6 h-6" />
        </button>

        <div className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Payroll System</h1>
              <p className="text-gray-600 mt-1">Manage salaries, expenses, and generate payroll reports</p>
            </div>
            <div className="flex items-center gap-4">
              {role === 'admin' && (
                <select
                  value={selectedTeam}
                  onChange={(e) => setSelectedTeam(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  {teams.map(team => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>
              )}
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl mb-6">
            {[
              { id: 'overview', label: 'Overview', icon: TrendingUp },
              { id: 'salaries', label: 'Salaries', icon: DollarSign },
              { id: 'expenses', label: 'Expenses', icon: Calculator },
              { id: 'calculations', label: 'Payroll', icon: FileText },
              { id: 'invoices', label: 'Invoices', icon: Download }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-blue-100">Total Employees</p>
                        <p className="text-3xl font-bold">{employees.length}</p>
                      </div>
                      <Users className="w-8 h-8 text-blue-200" />
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-green-100">Total Salary</p>
                        <p className="text-3xl font-bold">₹{salaries.reduce((sum, s) => sum + s.baseSalary, 0).toLocaleString()}</p>
                      </div>
                      <DollarSign className="w-8 h-8 text-green-200" />
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-6 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-purple-100">Total Activations</p>
                        <p className="text-3xl font-bold">{calculations.reduce((sum, calc) => sum + (calc.achieved || 0), 0).toLocaleString()}</p>
                      </div>
                      <TrendingUp className="w-8 h-8 text-purple-200" />
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-6 text-white">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-orange-100">Total Expenses</p>
                        <p className="text-3xl font-bold">₹{expenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString()}</p>
                      </div>
                      <Calculator className="w-8 h-8 text-orange-200" />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-xl font-bold mb-4">Recent Activities</h3>
                  <div className="space-y-3">
                    {salaries.slice(0, 5).map((salary) => (
                      <div key={salary.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium">{salary.employeeName}</p>
                          <p className="text-sm text-gray-600">Salary updated</p>
                        </div>
                        <p className="font-bold">₹{salary.baseSalary.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'salaries' && (
              <motion.div
                key="salaries"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-xl font-bold mb-4">
                    {editingSalary ? 'Edit Employee Salary' : 'Set Employee Salary'}
                  </h3>
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      💡 <strong>Auto Carry-Forward:</strong> Salaries from the previous month are automatically carried forward to the current month. You can edit them as needed.
                    </p>
                    <button
                      onClick={() => carryForwardSalaries(employees, salaries)}
                      className="mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
                    >
                      🔄 Manual Carry-Forward
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <select
                      value={salaryForm.employeeId}
                      onChange={(e) => setSalaryForm({ ...salaryForm, employeeId: e.target.value })}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      disabled={editingSalary !== null}
                    >
                      <option value="">Select Employee</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.role})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="Base Salary"
                      value={salaryForm.baseSalary}
                      onChange={(e) => setSalaryForm({ ...salaryForm, baseSalary: Number(e.target.value) })}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      type="number"
                      placeholder="Allowances"
                      value={salaryForm.allowances}
                      onChange={(e) => setSalaryForm({ ...salaryForm, allowances: Number(e.target.value) })}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveSalary}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex-1"
                      >
                        {editingSalary ? 'Update Salary' : 'Save Salary'}
                      </button>
                      {editingSalary && (
                        <button
                          onClick={cancelEdit}
                          className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-xl font-bold mb-4">Employee Salaries</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Base Salary</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Allowances</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Net Salary</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {salaries.map((salary) => {
                          const employee = employees.find(emp => emp.id === salary.employeeId);
                          return (
                            <tr key={salary.id}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                {salary.employeeName}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  employee?.role === 'manager' 
                                    ? 'bg-purple-100 text-purple-800' 
                                    : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {employee?.role || 'Unknown'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                ₹{salary.baseSalary.toLocaleString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                ₹{salary.allowances.toLocaleString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                                ₹{salary.netSalary.toLocaleString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                <button
                                  onClick={() => editSalary(salary)}
                                  className="text-indigo-600 hover:text-indigo-900 mr-3"
                                >
                                  Edit
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'expenses' && (
              <motion.div
                key="expenses"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-xl font-bold mb-4">Add Expense</h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <input
                      type="text"
                      placeholder="Description"
                      value={expenseForm.description}
                      onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                    <input
                      type="number"
                      placeholder="Amount"
                      value={expenseForm.amount}
                      onChange={(e) => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                    <select
                      value={expenseForm.category}
                      onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value as 'office' | 'additional' })}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="office">Office Expense</option>
                      <option value="additional">Additional Expense</option>
                    </select>
                    <button
                      onClick={saveExpense}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      Add Expense
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h3 className="text-xl font-bold mb-4">Expenses List</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {expenses.map((expense) => (
                          <tr key={expense.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {expense.description}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                              ₹{expense.amount.toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                expense.category === 'office' 
                                  ? 'bg-blue-100 text-blue-800' 
                                  : 'bg-orange-100 text-orange-800'
                              }`}>
                                {expense.category}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {format(expense.date, 'MMM dd, yyyy')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'calculations' && (
              <motion.div
                key="calculations"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold">Payroll Calculations</h3>
                  <div className="flex gap-3">
                    <button
                      onClick={calculatePayroll}
                      disabled={loading}
                      className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {loading ? 'Calculating...' : (
                        <>
                          <Calculator className="w-4 h-4" />
                          Calculate Payroll
                        </>
                      )}
                    </button>
                    <button
                      onClick={downloadPDF}
                      disabled={calculations.length === 0}
                      className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Download as PDF
                    </button>
                  </div>
                </div>

                {/* Payroll Deduction Information */}
                {!isCommissionTeam ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-blue-800 mb-2">Payroll Calculation Rules:</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h5 className="text-xs font-semibold text-blue-800 mb-1">Salary Deductions:</h5>
                        <div className="space-y-1 text-xs text-blue-700">
                          <div>• <strong>Present:</strong> No deduction (full salary)</div>
                          <div>• <strong>Absent:</strong> Full day deduction (1 day salary)</div>
                          <div>• <strong>Halfday Present:</strong> Half day deduction (0.5 day salary)</div>
                          <div>• <strong>Paid Leave:</strong> No deduction (full salary)</div>
                          <div>• <strong>Holiday:</strong> No deduction (full salary)</div>
                          <div>• <strong>Leave Applied:</strong> No deduction (full salary)</div>
                          <div>• <strong>Halfday:</strong> No deduction (full salary)</div>
                          <div>• <strong>Halfday Leave:</strong> No deduction (full salary)</div>
                        </div>
                      </div>
                      <div>
                        <h5 className="text-xs font-semibold text-blue-800 mb-1">Performance Bonuses:</h5>
                        <div className="space-y-1 text-xs text-blue-700">
                          <div>• <strong>Below 100%:</strong> No bonus</div>
                          <div>• <strong>100% Target:</strong> ₹{bonusAmounts.targetAchievement.toLocaleString()} bonus</div>
                          <div>• <strong>130% Target:</strong> ₹{bonusAmounts.risingStar.toLocaleString()} bonus (Rising Star)</div>
                          <div>• <strong>150% Target:</strong> ₹{bonusAmounts.superAchiever.toLocaleString()} bonus (Super Achiever)</div>
                          <div>• <strong>170% Target:</strong> ₹{bonusAmounts.elitePerformer.toLocaleString()} bonus (Elite Performer)</div>
                          <div>• <strong>200% Target:</strong> ₹{bonusAmounts.masterAchiever.toLocaleString()} bonus (Master Achiever)</div>
                          <div>• <strong>250% Target:</strong> ₹{bonusAmounts.legendaryStatus.toLocaleString()} bonus (Legendary Status)</div>
                          <div className="mt-2 text-xs text-blue-600 italic">
                            * Achievement based on Firebase activated count (plans from activated leads)
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-green-800 mb-2">Commission-Based Payroll Rules:</h4>
                    <div className="space-y-2 text-xs text-green-700">
                      <div>• <strong>Earnings:</strong> Based on commission rates per activation category</div>
                      <div>• <strong>No Attendance Penalties:</strong> Full earnings regardless of attendance</div>
                      <div>• <strong>No Performance Bonuses:</strong> Commission is the primary reward structure</div>
                      <div>• <strong>Categories:</strong> Standard, Silver, Silver Plus, Gold, Gold Plus, Platinum</div>
                      <div>• <strong>Calculation:</strong> (Standard activations × Standard rate) + (Silver activations × Silver rate) + ...</div>
                      <div className="mt-2 text-xs text-green-600 italic">
                        * Commission rates are set by team managers in Commission Settings
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-xl shadow-lg p-6">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Base Salary</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attendance</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Activations</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leave Deductions</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bonuses</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Net Salary</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {[...calculations].sort((a, b) => {
                          const employeeA = employees.find(emp => emp.id === a.employeeId);
                          const employeeB = employees.find(emp => emp.id === b.employeeId);
                          
                          // Managers first
                          if (employeeA?.role === 'manager' && employeeB?.role !== 'manager') return -1;
                          if (employeeA?.role !== 'manager' && employeeB?.role === 'manager') return 1;
                          
                          // Then sort by name
                          return a.employeeName.localeCompare(b.employeeName);
                        }).map((calc) => {
                          const employee = employees.find(emp => emp.id === calc.employeeId);
                          const isManager = employee?.role === 'manager';
                          
                          return (
                            <tr key={calc.employeeId} className={isManager ? 'bg-purple-50' : ''}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                <span className={isManager ? 'font-bold text-purple-800' : ''}>
                                  {calc.employeeName}
                                </span>
                                {isManager && (
                                  <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                                    Manager
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                ₹{calc.baseSalary.toLocaleString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {calc.attendanceDays}/{calc.totalDays} days
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {calc.target && calc.achieved !== undefined ? (
                                  <div>
                                    <div className="font-medium">{calc.achieved}/{calc.target}</div>
                                    <div className={`text-xs ${calc.achievementPercentage && calc.achievementPercentage >= 100 ? 'text-green-600' : 'text-orange-600'}`}>
                                      {calc.achievementPercentage?.toFixed(1)}%
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-gray-400">No target set</span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 font-medium">
                                -₹{calc.leaveDeductions.toLocaleString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                                +₹{calc.bonuses.toLocaleString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                                ₹{calc.netSalary.toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'invoices' && (
              <motion.div
                key="invoices"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">Generate Invoices</h3>
                  <div className="flex gap-3">
                    {(role === 'admin' || role === 'manager') && (
                      <button
                        onClick={() => setShowInvoiceConfig(true)}
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
                      >
                        <Settings className="w-4 h-4" />
                        Configure Invoice
                      </button>
                    )}
                    {calculations.length > 0 && (
                      <button
                        onClick={generateInvoice}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
                      >
                        <Download className="w-4 h-4" />
                        Generate Team Invoice
                      </button>
                    )}
                  </div>
                </div>

                {calculations.length === 0 ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                    <FileText className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-yellow-800 mb-2">No Payroll Calculations</h3>
                    <p className="text-yellow-700 mb-4">
                      Please calculate payroll first before generating invoices.
                    </p>
                    <button
                      onClick={() => setActiveTab('calculations')}
                      className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
                    >
                      Go to Payroll Calculations
                    </button>
                  </div>
                ) : (
                <div className="bg-white rounded-xl shadow-lg p-6">
                    <div className="mb-6">
                      <h4 className="text-lg font-semibold text-gray-900 mb-4">Team Summary</h4>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <div className="text-sm text-blue-600 font-medium">Total Employees</div>
                          <div className="text-2xl font-bold text-blue-900">{calculations.length}</div>
                        </div>
                        <div className="bg-green-50 p-4 rounded-lg">
                          <div className="text-sm text-green-600 font-medium">Total Base Salary</div>
                          <div className="text-2xl font-bold text-green-900">₹{calculations.reduce((sum, calc) => sum + calc.baseSalary, 0).toLocaleString()}</div>
                        </div>
                        <div className="bg-purple-50 p-4 rounded-lg">
                          <div className="text-sm text-purple-600 font-medium">Total Bonuses</div>
                          <div className="text-2xl font-bold text-purple-900">₹{calculations.reduce((sum, calc) => sum + calc.bonuses, 0).toLocaleString()}</div>
                        </div>
                        <div className="bg-orange-50 p-4 rounded-lg">
                          <div className="text-sm text-orange-600 font-medium">Total Expenses</div>
                          <div className="text-2xl font-bold text-orange-900">₹{expenses.reduce((sum, exp) => sum + exp.amount, 0).toLocaleString()}</div>
                        </div>
                      </div>
                    </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Base Salary</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bonuses</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Net Salary</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {calculations.map((calc) => (
                            <tr key={calc.employeeId} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {calc.employeeName}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {format(new Date(calc.month + '-01'), 'MMMM yyyy')}
                            </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                ₹{calc.baseSalary.toLocaleString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600 font-medium">
                                +₹{calc.bonuses.toLocaleString()}
                              </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                              ₹{calc.netSalary.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Invoice Configuration Modal */}
      {showInvoiceConfig && (role === 'admin' || role === 'manager') && (
        <InvoiceConfiguration
          teamId={role === 'admin' ? selectedTeam : user.teamId!}
          userId={user.id}
          userRole={role as 'admin' | 'manager'}
          onClose={handleInvoiceConfigClose}
        />
      )}

      {/* Invoice Generator Modal */}
      {showInvoiceGenerator && (
        <InvoiceGenerator
          calculations={calculations}
          expenses={expenses}
          teamId={role === 'admin' ? selectedTeam : user.teamId!}
          userId={user.id}
          userName={user.name}
          teamName={teams.find(t => t.id === (role === 'admin' ? selectedTeam : user.teamId))?.name || 'Unknown Team'}
          month={selectedMonth}
          onClose={handleInvoiceGeneratorClose}
        />
      )}
    </div>
  );
}
