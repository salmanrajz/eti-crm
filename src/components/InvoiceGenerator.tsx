/**
 * ===============================================================================
 * INVOICE GENERATOR COMPONENT - AUTOMATED PDF INVOICE GENERATION
 * ===============================================================================
 * 
 * This component provides automated PDF invoice generation functionality for
 * payroll calculations, expenses, and billing. It integrates with invoice
 * configuration settings and generates professionally formatted invoices.
 * 
 * FEATURES:
 * 
 * 1. PDF INVOICE GENERATION
 *    - Automated PDF generation using jsPDF library
 *    - Professional invoice templates with company branding
 *    - Dynamic data integration from payroll calculations
 * 
 * 2. PAYROLL INTEGRATION
 *    - Integration with payroll calculation data
 *    - Employee salary and commission breakdown
 *    - Expense tracking and invoice line items
 * 
 * 3. CONFIGURATION INTEGRATION
 *    - Uses InvoiceConfiguration settings for branding and details
 *    - Company information and tax details integration
 *    - Bank details and payment information inclusion
 * 
 * 4. EXPENSE MANAGEMENT
 *    - Office and additional expense tracking
 *    - Categorized expense reporting
 *    - Date-based expense organization
 * 
 * USAGE:
 * This component is used in payroll systems to generate professional
 * invoices for billing and accounting purposes.
 * ===============================================================================
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Download, 
  FileText, 
  Settings,
  CheckCircle,
  AlertCircle} from 'lucide-react';
import { doc, getDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { InvoiceConfiguration, Invoice, InvoiceItem, PayrollCalculation } from '../types';
import { format } from 'date-fns';
import jsPDF from 'jspdf';

interface InvoiceGeneratorProps {
  calculations: PayrollCalculation[];
  expenses: Array<{
    id: string;
    description: string;
    amount: number;
    date: Date;
    category: 'office' | 'additional';
  }>;
  teamId: string;
  userId: string;
  userName: string;
  teamName: string;
  month: string;
  onClose: () => void;
}

export default function InvoiceGenerator({ 
  calculations, 
  expenses, 
  teamId, 
  userId, 
  teamName, 
  month, 
  onClose 
}: InvoiceGeneratorProps) {
  const [config, setConfig] = useState<InvoiceConfiguration | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  useEffect(() => {
    loadConfiguration();
  }, [teamId]);

  const loadConfiguration = async () => {
    setLoading(true);
    try {
      const configRef = doc(db, 'invoiceConfigurations', teamId);
      const configDoc = await getDoc(configRef);
      
      if (configDoc.exists()) {
        const data = configDoc.data() as InvoiceConfiguration;
        setConfig({
          ...data,
          createdAt: data.createdAt && typeof data.createdAt === 'object' && 'toDate' in data.createdAt 
            ? (data.createdAt as any).toDate() 
            : data.createdAt,
          updatedAt: data.updatedAt && typeof data.updatedAt === 'object' && 'toDate' in data.updatedAt 
            ? (data.updatedAt as any).toDate() 
            : data.updatedAt
        });
      } else {
        setMessage({ type: 'error', text: 'Invoice configuration not found. Please configure invoice settings first.' });
      }
    } catch (error) {
      console.error('Error loading invoice configuration:', error);
      setMessage({ type: 'error', text: 'Failed to load invoice configuration' });
    } finally {
      setLoading(false);
    }
  };

  const generateInvoiceNumber = () => {
    const year = new Date().getFullYear();
    const monthNum = String(new Date().getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `INV-${year}-${monthNum}-${random}`;
  };

  const createInvoiceItems = (): InvoiceItem[] => {
    const items: InvoiceItem[] = [];
    let srNo = 1;

    // Group salaries by employee
    const totalSalary = calculations.reduce((sum, calc) => sum + calc.netSalary, 0);
    const totalBonuses = calculations.reduce((sum, calc) => sum + calc.bonuses, 0);

    // Add total salary as one item
    items.push({
      srNo: srNo++,
      description: `Total Salary for ${calculations.length} Employees`,
      hsnSacCode: '998513', // HSN code for employment services
      daysOrNos: calculations.reduce((sum, calc) => sum + calc.attendanceDays, 0),
      amount: totalSalary
    });

    // Add total bonuses if any
    if (totalBonuses > 0) {
      items.push({
        srNo: srNo++,
        description: 'Total Performance Bonuses',
        hsnSacCode: '998513',
        daysOrNos: 1,
        amount: totalBonuses
      });
    }

    // Add expenses
    const officeExpenses = expenses.filter(exp => exp.category === 'office');
    const additionalExpenses = expenses.filter(exp => exp.category === 'additional');

    if (officeExpenses.length > 0) {
      const totalOfficeExpenses = officeExpenses.reduce((sum, exp) => sum + exp.amount, 0);
      items.push({
        srNo: srNo++,
        description: 'Office Expenses',
        hsnSacCode: '998513',
        daysOrNos: officeExpenses.length,
        amount: totalOfficeExpenses
      });
    }

    if (additionalExpenses.length > 0) {
      const totalAdditionalExpenses = additionalExpenses.reduce((sum, exp) => sum + exp.amount, 0);
      items.push({
        srNo: srNo++,
        description: 'Additional Expenses',
        hsnSacCode: '998513',
        daysOrNos: additionalExpenses.length,
        amount: totalAdditionalExpenses
      });
    }

    return items;
  };

  const generateInvoicePDF = async () => {
    if (!config) {
      setMessage({ type: 'error', text: 'Invoice configuration not found' });
      return;
    }

    setGenerating(true);
    setMessage(null);

    try {
      const invoiceItems = createInvoiceItems();
      const subtotal = invoiceItems.reduce((sum, item) => sum + item.amount, 0);
      const gstAmount = config.applyGst ? subtotal * 0.18 : 0; // 18% GST, conditional
      const grandTotal = subtotal + gstAmount;

      const invoice: Invoice = {
        id: '',
        invoiceNumber: generateInvoiceNumber(),
        teamId,
        employeeId: '', // Not applicable for team invoice
        employeeName: teamName, // Use team name instead
        month,
        invoiceDate: new Date(),
        invoicePeriod: `For the month of ${format(new Date(month + '-01'), 'MMMM yyyy')}`,
        items: invoiceItems,
        subtotal,
        gstAmount,
        grandTotal,
        configuration: config,
        generatedBy: userId,
        generatedAt: new Date(),
        status: 'draft'
      };

      // Save invoice to Firestore
      const invoiceRef = await addDoc(collection(db, 'invoices'), invoice);
      invoice.id = invoiceRef.id;

      // Generate PDF
      await generatePDF(invoice);

      setMessage({ type: 'success', text: 'Team invoice generated and saved successfully!' });
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setMessage(null);
        onClose();
      }, 3000);

    } catch (error) {
      console.error('Error generating invoice:', error);
      setMessage({ type: 'error', text: 'Failed to generate invoice' });
    } finally {
      setGenerating(false);
    }
  };

  const numberToWords = (num: number): string => {
    const a = [
      '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'
    ];
    const b = [
      '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'
    ];
    
    const inWords = (n: number, s_idx = 0): string => {
      let str = '';
      if (n > 19) {
        str += b[Math.floor(n / 10)] + ' ' + a[n % 10];
      } else {
        str += a[n];
      }
      if (n !== 0) {
        str += ' ';
      }
      return str;
    };

    let n = Math.floor(num);
    let result = '';
    
    result += inWords(Math.floor(n / 10000000) % 100);
    if(Math.floor(n / 10000000) % 100 > 0) result += 'crore ';

    result += inWords(Math.floor(n / 100000) % 100);
    if(Math.floor(n / 100000) % 100 > 0) result += 'lakh ';

    result += inWords(Math.floor(n / 1000) % 100);
    if(Math.floor(n / 1000) % 100 > 0) result += 'thousand ';

    result += inWords(Math.floor(n / 100) % 10);
    if(Math.floor(n / 100) % 10 > 0) result += 'hundred ';
    
    if (n > 100 && n % 100 > 0) {
      result += 'and ';
    }
    
    result += inWords(n % 100);

    const decimals = Math.round((num % 1) * 100);
    if (decimals > 0) {
      result += 'and ' + inWords(decimals) + 'paise ';
    }
    
    return result.trim().split(' ').filter(s => s).map((s,i) => i === 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s).join(' ');
  };

  const generatePDF = async (invoice: Invoice) => {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const margin = 12;
    // Main Header (company info)
    let y = 20;
    pdf.setFont('times', 'bold');
    pdf.setFontSize(20);
    pdf.text('INVOICE', pageWidth / 2, y, { align: 'center' });
    y += 8;
    pdf.setFont('times', 'normal');
    pdf.setFontSize(13);
    pdf.text(invoice.configuration.officeName.toUpperCase(), pageWidth / 2, y, { align: 'center' });
    y += 6;
    pdf.setFont('times', 'normal');
    pdf.setFontSize(10);
    pdf.text(invoice.configuration.officeAddress, pageWidth / 2, y, { align: 'center' });
    y += 6;
    pdf.text(`GST NO: - ${invoice.configuration.taxInformation.gstin}`, pageWidth / 2, y, { align: 'center' });
    y += 6;
    // Header table (Invoice No. & Date, Order No. & Date) as a single row, side by side
    const headerTableTopY = y;
    const headerTableRowH = 8;
    const colGap = 6; // reduce gap between columns
    const colW = (pageWidth - margin * 2 - colGap) / 2;
    pdf.setFont('times', 'normal');
    pdf.setFontSize(10);
    // Format date to DD/MM/YYYY
    let dateObj: Date;
    if (invoice.invoiceDate instanceof Date) {
      dateObj = invoice.invoiceDate;
    } else if (typeof invoice.invoiceDate === 'string') {
      dateObj = new Date(invoice.invoiceDate);
    } else {
      dateObj = new Date(String(invoice.invoiceDate));
    }
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const yyyy = dateObj.getFullYear();
    const dateStr = `${dd}/${mm}/${yyyy}`;
    // Order No. is MM of YYYY
    const orderNo = `${mm} of ${yyyy}`;
    // Draw single row, two columns (closer together)
    pdf.rect(margin, headerTableTopY, colW, headerTableRowH);
    pdf.rect(margin + colW + colGap, headerTableTopY, colW, headerTableRowH);
    // Left cell (label and value on same line)
    pdf.setFont('times', 'bold');
    const leftLabelY = headerTableTopY + 5.5;
    const leftLabelX = margin + 2;
    const leftLabel = 'Invoice No. & Date:';
    pdf.text(leftLabel, leftLabelX, leftLabelY);
    // Underline left label
    const leftLabelWidth = pdf.getTextWidth(leftLabel);
    pdf.setLineWidth(0.3);
    pdf.line(leftLabelX, leftLabelY + 0.7, leftLabelX + leftLabelWidth, leftLabelY + 0.7);
    // Value right after label
    pdf.setFont('times', 'bold');
    const leftValue = `${invoice.invoiceNumber}   ${dateStr}`;
    pdf.text(leftValue, leftLabelX + leftLabelWidth + 3, leftLabelY, { maxWidth: colW - leftLabelWidth - 7, align: 'left' });
    // Right cell (label and value on same line)
    pdf.setFont('times', 'bold');
    const rightLabelY = headerTableTopY + 5.5;
    const rightLabelX = margin + colW + colGap + 2;
    const rightLabel = 'Order No. & Date:';
    pdf.text(rightLabel, rightLabelX, rightLabelY);
    // Underline right label
    const rightLabelWidth = pdf.getTextWidth(rightLabel);
    pdf.setLineWidth(0.3);
    pdf.line(rightLabelX, rightLabelY + 0.7, rightLabelX + rightLabelWidth, rightLabelY + 0.7);
    // Value right after label
    pdf.setFont('times', 'bold');
    const rightValue = `${orderNo}   ${dateStr}`;
    pdf.text(rightValue, rightLabelX + rightLabelWidth + 3, rightLabelY, { maxWidth: colW - rightLabelWidth - 7, align: 'left' });
    // Move main table down
    const tableTopY = headerTableTopY + headerTableRowH + 8;
    const rowHeight = 9;
    // Adjusted column widths for a wider last column, ensure sum matches table width
    const tableWidth = pageWidth - margin * 2;
    const colWidths = [16, 60, 26, 20, 28, tableWidth - (16 + 60 + 26 + 20 + 28)];
    const colTitles = ['Sr. No.', 'Description', 'HSN/SAC', 'Days / Nos.', 'Amount (INR)', 'Total Amount (INR)'];
    const colXs = [margin];
    for (let i = 0; i < colWidths.length; i++) {
      colXs.push(colXs[i] + colWidths[i]);
    }
    const items = invoice.items;
    const emptyRows = 10;
    const maxRows = 25;
    const rowsToShow = Math.min(items.length + emptyRows, maxRows);
    const tableBottomY = tableTopY + rowHeight * (rowsToShow + 1); // +1 for header

    // Table header
    pdf.setFont('times', 'bold');
    pdf.setFontSize(10);
    pdf.setLineWidth(0.3);
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineDashPattern([], 0); // Solid lines
    for (let i = 0; i < colXs.length; i++) {
      pdf.line(colXs[i], tableTopY, colXs[i], tableBottomY);
    }
    // Ensure rightmost vertical is drawn at table right edge
    pdf.line(margin + tableWidth, tableTopY, margin + tableWidth, tableBottomY);
    pdf.line(margin, tableTopY, margin + tableWidth, tableTopY);
    // Remove 'INR' from column headers
    const colTitlesNoINR = ['Sr. No.', 'Description', 'HSN/SAC', 'Days / Nos.', 'Amount', 'Total Amount'];
    for (let i = 0; i < colTitles.length; i++) {
      pdf.text(colTitlesNoINR[i], colXs[i] + 2, tableTopY + 7, { maxWidth: colWidths[i] - 4 });
    }
    pdf.line(margin, tableTopY + rowHeight, margin + tableWidth, tableTopY + rowHeight);

    // Table rows (items + empty rows)
    pdf.setFont('times', 'normal');
    let r = 0;
    for (; r < items.length && r < rowsToShow - emptyRows; r++) {
      const y = tableTopY + rowHeight * (r + 1);
      pdf.line(margin, y + rowHeight, margin + tableWidth, y + rowHeight);
      let row = items[r];
      pdf.text(String(row.srNo), colXs[0] + 2, y + 7);
      pdf.text(row.description, colXs[1] + 2, y + 7, { maxWidth: colWidths[1] - 4 });
      pdf.text(row.hsnSacCode, colXs[2] + 2, y + 7);
      pdf.text(String(row.daysOrNos), colXs[3] + 2, y + 7);
      pdf.text(row.amount.toFixed(2), colXs[4] + 2, y + 7, { align: 'left' });
      pdf.text(row.amount.toFixed(2), colXs[5] + 2, y + 7, { align: 'left', maxWidth: colWidths[5] - 4 });
    }
    // Fill empty rows
    for (; r < rowsToShow; r++) {
      const y = tableTopY + rowHeight * (r + 1);
      pdf.line(margin, y + rowHeight, margin + tableWidth, y + rowHeight);
      // Empty cells, but keep grid
    }
    // Total row
    const totalY = tableTopY + rowHeight * (rowsToShow + 1);
    pdf.setFont('times', 'bold');
    pdf.text('Total', colXs[0] + 2, totalY + 7);
    pdf.text(invoice.subtotal.toFixed(2), colXs[4] + 2, totalY + 7, { align: 'left' });
    pdf.text(invoice.subtotal.toFixed(2), colXs[5] + 2, totalY + 7, { align: 'left', maxWidth: colWidths[5] - 4 });
    // Draw bottom line for table at Total row
    pdf.line(margin, totalY + rowHeight, margin + tableWidth, totalY + rowHeight);
    // Draw verticals down to Total row only
    for (let i = 0; i < colXs.length; i++) {
      pdf.line(colXs[i], tableTopY, colXs[i], totalY + rowHeight);
    }
    // Ensure rightmost vertical is drawn at table right edge (again, for safety)
    pdf.line(margin + tableWidth, tableTopY, margin + tableWidth, totalY + rowHeight);

    // Footer (amount in words, total, bank details, signature) just below table
    pdf.setFont('times', 'normal');
    pdf.setFontSize(10);
    const amountInWords = numberToWords(invoice.subtotal);
    pdf.text(`Amount (In Words): ${amountInWords} only.`, margin, totalY + rowHeight + 10);
    pdf.setFont('times', 'bold');
    pdf.text(`Total Invoice Value: ${invoice.subtotal.toFixed(2)}`, pageWidth - margin, totalY + rowHeight + 10, { align: 'right' });
    pdf.setFont('times', 'normal');
    pdf.text(invoice.configuration.taxNotes || (invoice.configuration.applyGst ? '' : 'NO GST APPLICABLE'), margin, totalY + rowHeight + 17);
    // Bank details
    let bankY = totalY + rowHeight + 25;
    pdf.setFont('times', 'bold');
    pdf.text('PAN Card Number:', margin, bankY);
    pdf.text('GST NO.:', margin, bankY + 5);
    pdf.text('Remit the Money To:', margin, bankY + 10);
    pdf.text('Bank Name:', margin, bankY + 15);
    pdf.text('Bank Address:', margin, bankY + 20);
    pdf.text('Bank Account Number:', margin, bankY + 25);
    pdf.text('IFSC / RTGS Code:', margin, bankY + 30);
    pdf.setFont('times', 'normal');
    pdf.text(invoice.configuration.taxInformation.pan, margin + 45, bankY);
    pdf.text(invoice.configuration.taxInformation.gstin, margin + 45, bankY + 5);
    pdf.text(invoice.configuration.officeName, margin + 45, bankY + 10);
    pdf.text(invoice.configuration.bankDetails.bankName, margin + 45, bankY + 15);
    pdf.text(invoice.configuration.bankDetails.branchName || '', margin + 45, bankY + 20);
    pdf.text(invoice.configuration.bankDetails.accountNumber, margin + 45, bankY + 25);
    pdf.text(invoice.configuration.bankDetails.ifscCode, margin + 45, bankY + 30);
    // Signature
    const signatureX = pageWidth - margin - 70;
    pdf.setFont('times', 'bold');
    pdf.text(`For ${invoice.configuration.officeName}`, signatureX + 35, bankY + 10, {align: 'center'});
    if (invoice.configuration.signatureUrl) {
      try {
        const signatureImage = await fetch(invoice.configuration.signatureUrl);
        const blob = await signatureImage.blob();
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const base64data = reader.result as string;
          pdf.addImage(base64data, 'PNG', signatureX + 15, bankY + 15, 40, 20);
          pdf.text('Authorized Signatory', signatureX + 35, bankY + 38, {align: 'center'});
          const fileName = `Team_Invoice_${invoice.invoiceNumber}_${invoice.employeeName.replace(/\s+/g, '_')}.pdf`;
          pdf.save(fileName);
        };
        return;
      } catch (e) {
        pdf.text('Authorized Signatory', signatureX + 35, bankY + 38, {align: 'center'});
      }
    } else {
      pdf.text('Authorized Signatory', signatureX + 35, bankY + 38, {align: 'center'});
    }
    const fileName = `Team_Invoice_${invoice.invoiceNumber}_${invoice.employeeName.replace(/\s+/g, '_')}.pdf`;
    pdf.save(fileName);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading invoice configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full"
      >
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <FileText className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Generate Team Invoice</h2>
                <p className="text-sm text-gray-600">Create comprehensive invoice for {teamName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <span className="sr-only">Close</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {message && (
          <div className={`mx-6 mt-4 p-4 rounded-lg flex items-center gap-3 ${
            message.type === 'success' 
              ? 'bg-green-50 border border-green-200 text-green-800' 
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <span className="font-medium">{message.text}</span>
          </div>
        )}

        <div className="p-6 space-y-6">
          {!config ? (
            <div className="text-center py-8">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Configuration Required</h3>
              <p className="text-gray-600 mb-4">
                Invoice configuration is not set up. Please configure the invoice settings first.
              </p>
              <button
                onClick={() => setShowConfigModal(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 mx-auto"
              >
                <Settings className="w-4 h-4" />
                Configure Invoice Settings
              </button>
            </div>
          ) : (
            <>
              {/* Invoice Preview */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Invoice Preview</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Team:</span>
                    <span className="font-medium">{teamName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Month:</span>
                    <span className="font-medium">{format(new Date(month + '-01'), 'MMMM yyyy')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Employees:</span>
                    <span className="font-medium">{calculations.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Base Salary:</span>
                    <span className="font-medium">₹{calculations.reduce((sum, calc) => sum + calc.baseSalary, 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Bonuses:</span>
                    <span className="font-medium text-green-600">+₹{calculations.reduce((sum, calc) => sum + calc.bonuses, 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Expenses:</span>
                    <span className="font-medium text-blue-600">+₹{expenses.reduce((sum, exp) => sum + exp.amount, 0).toLocaleString()}</span>
                  </div>
                  <div className="border-t pt-3">
                    <div className="flex justify-between">
                      <span className="text-lg font-semibold">Total Amount:</span>
                      <span className="text-lg font-bold text-indigo-600">₹{(calculations.reduce((sum, calc) => sum + calc.netSalary, 0) + expenses.reduce((sum, exp) => sum + exp.amount, 0)).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Configuration Summary */}
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-blue-900 mb-3">Invoice Configuration</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-blue-700 font-medium">Office:</span>
                    <p className="text-blue-800">{config.officeName}</p>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Recipient:</span>
                    <p className="text-blue-800">{config.recipientName}</p>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">GSTIN:</span>
                    <p className="text-blue-800">{config.taxInformation.gstin}</p>
                  </div>
                  <div>
                    <span className="text-blue-700 font-medium">Bank:</span>
                    <p className="text-blue-800">{config.bankDetails.bankName}</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            {config && (
              <button
                onClick={generateInvoicePDF}
                disabled={generating}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {generating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Generate Team Invoice
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
} 