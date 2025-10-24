/**
 * ===============================================================================
 * INVOICE CONFIGURATION COMPONENT - INVOICE SETTINGS MANAGEMENT
 * ===============================================================================
 * 
 * This component provides a comprehensive interface for configuring invoice
 * settings including company details, tax information, bank details, and
 * branding elements for automated invoice generation.
 * 
 * FEATURES:
 * 
 * 1. COMPANY AND BILLING CONFIGURATION
 *    - Office name, address, and contact information setup
 *    - Recipient details and billing address management
 *    - Terms of payment and tax notes configuration
 * 
 * 2. TAX AND COMPLIANCE SETTINGS
 *    - GST, PAN, and other tax information management
 *    - Tax calculation settings and compliance options
 *    - Place of supply and tax region configuration
 * 
 * 3. BRANDING AND VISUAL ELEMENTS
 *    - Logo and signature image upload and management
 *    - Visual branding elements for invoice appearance
 *    - Professional invoice template customization
 * 
 * 4. BANKING AND PAYMENT DETAILS
 *    - Bank account information for payment processing
 *    - IFSC codes and branch details management
 *    - Payment method configuration and setup
 * 
 * USAGE:
 * This component is used by administrators and managers to configure
 * all aspects of invoice generation for payroll and billing systems.
 * ===============================================================================
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Save, 
  Building2, 
  User, 
  CreditCard, 
  FileText,
  CheckCircle,
  AlertCircle,
  Image as ImageIcon,
  FileBadge
} from 'lucide-react';
import { collection, doc, getDoc, setDoc, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { InvoiceConfiguration } from '../types';

interface InvoiceConfigurationProps {
  teamId: string;
  userId: string;
  userRole: 'admin' | 'manager';
  onClose: () => void;
}

export default function InvoiceConfiguration({ teamId, userId, userRole, onClose }: InvoiceConfigurationProps) {
  const [config, setConfig] = useState<Partial<InvoiceConfiguration>>({
    officeName: '',
    officeAddress: '',
    recipientName: '',
    recipientAddress: '',
    placeOfSupply: '',
    termsOfPayment: 'Within 15 Days from issue of Invoice',
    taxNotes: '',
    applyGst: true,
    logoUrl: '',
    signatureUrl: '',
    taxInformation: {
      gstin: '',
      pan: '',
      otherTaxes: ''
    },
    bankDetails: {
      accountNumber: '',
      ifscCode: '',
      bankName: '',
      branchName: ''
    }
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      }
    } catch (error) {
      console.error('Error loading invoice configuration:', error);
      setMessage({ type: 'error', text: 'Failed to load configuration' });
    } finally {
      setLoading(false);
    }
  };

  const saveConfiguration = async () => {
    setSaving(true);
    setMessage(null);

    try {
      // Validate required fields
      if (!config.officeName || !config.officeAddress || !config.recipientName || 
          !config.recipientAddress || !config.taxInformation?.gstin || 
          !config.taxInformation?.pan || !config.bankDetails?.accountNumber || 
          !config.bankDetails?.ifscCode || !config.bankDetails?.bankName || !config.placeOfSupply || !config.termsOfPayment) {
        setMessage({ type: 'error', text: 'Please fill in all required fields' });
        return;
      }

      const configData: InvoiceConfiguration = {
        id: teamId,
        teamId,
        officeName: config.officeName,
        officeAddress: config.officeAddress,
        recipientName: config.recipientName,
        recipientAddress: config.recipientAddress,
        placeOfSupply: config.placeOfSupply,
        termsOfPayment: config.termsOfPayment,
        taxNotes: config.taxNotes || '',
        applyGst: config.applyGst === undefined ? true : config.applyGst,
        logoUrl: config.logoUrl || '',
        signatureUrl: config.signatureUrl || '',
        taxInformation: {
          gstin: config.taxInformation.gstin,
          pan: config.taxInformation.pan,
          otherTaxes: config.taxInformation.otherTaxes || ''
        },
        bankDetails: {
          accountNumber: config.bankDetails.accountNumber,
          ifscCode: config.bankDetails.ifscCode,
          bankName: config.bankDetails.bankName,
          branchName: config.bankDetails.branchName || ''
        },
        createdAt: config.createdAt || new Date(),
        updatedAt: new Date(),
        createdBy: userId
      };

      await setDoc(doc(db, 'invoiceConfigurations', teamId), configData);
      setMessage({ type: 'success', text: 'Invoice configuration saved successfully!' });
      
      // Auto-hide success message after 3 seconds
      setTimeout(() => {
        setMessage(null);
      }, 3000);
    } catch (error) {
      console.error('Error saving invoice configuration:', error);
      setMessage({ type: 'error', text: 'Failed to save configuration' });
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const updateTaxField = (field: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      taxInformation: {
        ...prev.taxInformation!,
        [field]: value
      }
    }));
  };

  const updateBankField = (field: string, value: string) => {
    setConfig(prev => ({
      ...prev,
      bankDetails: {
        ...prev.bankDetails!,
        [field]: value
      }
    }));
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading configuration...</p>
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
        className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <FileText className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Invoice Configuration</h2>
                <p className="text-sm text-gray-600">Set up static information for invoice generation</p>
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

        <div className="p-6 space-y-8">
          {/* Office Information */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900">Office Information</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Office Name *
                </label>
                <input
                  type="text"
                  value={config.officeName || ''}
                  onChange={(e) => updateField('officeName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter office name"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Office Address *
                </label>
                <textarea
                  value={config.officeAddress || ''}
                  onChange={(e) => updateField('officeAddress', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter complete office address"
                />
              </div>
            </div>
          </div>

          {/* Recipient Information */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <User className="w-5 h-5 text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900">Recipient Information</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recipient Name *
                </label>
                <input
                  type="text"
                  value={config.recipientName || ''}
                  onChange={(e) => updateField('recipientName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter recipient name"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recipient Address *
                </label>
                <textarea
                  value={config.recipientAddress || ''}
                  onChange={(e) => updateField('recipientAddress', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter complete recipient address"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Place of Supply *
                </label>
                <input
                  type="text"
                  value={config.placeOfSupply || ''}
                  onChange={(e) => updateField('placeOfSupply', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g., DUBAI, UAE"
                />
              </div>
            </div>
          </div>

          {/* Payment and Tax Information */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <FileBadge className="w-5 h-5 text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900">Payment & Tax</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Terms of Payment *
                </label>
                <input
                  type="text"
                  value={config.termsOfPayment || ''}
                  onChange={(e) => updateField('termsOfPayment', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g., Within 15 Days"
                />
              </div>
              <div className="flex items-center gap-4 pt-8">
                <input
                  type="checkbox"
                  id="applyGst"
                  checked={config.applyGst === undefined ? true : config.applyGst}
                  onChange={(e) => setConfig(prev => ({ ...prev, applyGst: e.target.checked }))}
                  className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <label htmlFor="applyGst" className="text-sm font-medium text-gray-700">
                  Apply GST to Invoice
                </label>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tax Notes (Optional)
                </label>
                <input
                  type="text"
                  value={config.taxNotes || ''}
                  onChange={(e) => updateField('taxNotes', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g., INVOICE ISSUED AGAINST LUT"
                />
              </div>
            </div>
          </div>

          {/* Tax Information */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900">Tax Information</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  GSTIN *
                </label>
                <input
                  type="text"
                  value={config.taxInformation?.gstin || ''}
                  onChange={(e) => updateTaxField('gstin', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter GSTIN"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  PAN *
                </label>
                <input
                  type="text"
                  value={config.taxInformation?.pan || ''}
                  onChange={(e) => updateTaxField('pan', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter PAN"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Other Tax Information
                </label>
                <input
                  type="text"
                  value={config.taxInformation?.otherTaxes || ''}
                  onChange={(e) => updateTaxField('otherTaxes', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter any other tax information (optional)"
                />
              </div>
            </div>
          </div>

          {/* Branding */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <ImageIcon className="w-5 h-5 text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900">Branding</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Logo URL (Optional)
                </label>
                <input
                  type="text"
                  value={config.logoUrl || ''}
                  onChange={(e) => updateField('logoUrl', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="https://example.com/logo.png"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Signature Image URL (Optional)
                </label>
                <input
                  type="text"
                  value={config.signatureUrl || ''}
                  onChange={(e) => updateField('signatureUrl', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="https://example.com/signature.png"
                />
              </div>
            </div>
          </div>

          {/* Bank Details */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900">Bank Account Details</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Account Number *
                </label>
                <input
                  type="text"
                  value={config.bankDetails?.accountNumber || ''}
                  onChange={(e) => updateBankField('accountNumber', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter account number"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  IFSC Code *
                </label>
                <input
                  type="text"
                  value={config.bankDetails?.ifscCode || ''}
                  onChange={(e) => updateBankField('ifscCode', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter IFSC code"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bank Name *
                </label>
                <input
                  type="text"
                  value={config.bankDetails?.bankName || ''}
                  onChange={(e) => updateBankField('bankName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter bank name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Branch Name
                </label>
                <input
                  type="text"
                  value={config.bankDetails?.branchName || ''}
                  onChange={(e) => updateBankField('branchName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Enter branch name (optional)"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveConfiguration}
              disabled={saving}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Configuration
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
} 