/**
 * ===============================================================================
 * VERIFY LEAD MODAL COMPONENT - LEAD VERIFICATION INTERFACE
 * ===============================================================================
 * 
 * This component provides a modal interface for verifying or rejecting leads
 * in the CRM system. It includes media upload capabilities and integrates
 * with the lead verification workflow.
 * 
 * FEATURES:
 * 
 * 1. LEAD VERIFICATION WORKFLOW
 *    - Lead verification with verification notes and media upload
 *    - Lead rejection with reason tracking and processing
 *    - Integration with Cloud Functions for proper lead processing
 *    - Status updates and workflow progression
 * 
 * 2. MEDIA UPLOAD INTEGRATION
 *    - Required media upload before verification approval
 *    - File upload status tracking and completion validation
 *    - Integration with MediaUpload component for file handling
 * 
 * 3. VERIFICATION PROCESSING
 *    - Proper verification timestamp and user tracking
 *    - Cloud Function integration for lead rejection processing
 *    - Error handling and user feedback via toast notifications
 *    - Status updates for dashboard metrics and reporting
 * 
 * USAGE:
 * This component is used in the verification workflow to provide verifiers
 * with a structured interface for approving or rejecting leads with proper
 * documentation and media requirements.
 * ===============================================================================
 */

import { useState } from 'react';
import { Dialog } from '@headlessui/react';
import { X } from 'lucide-react';
import { MediaUpload } from './MediaUpload';
import { Lead } from '../../types';
import { db, processLeadRejectionFunction } from '../../lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { incrementVerifierCounters } from '../../utils/verifierCounters';

interface VerifyLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead;
  onVerify: () => void;
}

export function VerifyLeadModal({ isOpen, onClose, lead, onVerify }: VerifyLeadModalProps) {
  const [notes, setNotes] = useState('');
  const [uploadComplete, setUploadComplete] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { user } = useAuthStore();

  const handleVerify = async () => {
    if (!uploadComplete) {
      toast.error('Please upload verification media before verifying');
      return;
    }

    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        status: 'verified',
        verificationNotes: notes,
        verifiedBy: user?.id, // ✅ Add this field for dashboard metrics
        verifiedAt: serverTimestamp()
      });

      // Increment verifier counters
      if (user?.id) {
        await incrementVerifierCounters(user.id);
      }

      toast.success('Lead verified successfully');
      onVerify();
      onClose();
    } catch (error) {
      console.error('Error verifying lead:', error);
      toast.error('Failed to verify lead');
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    
    try {
      // Call the Cloud Function to process the lead rejection
      const result = await processLeadRejectionFunction({
        leadId: lead.id,
        verificationNote: notes,
        verifierId: lead.verifierId || ''
      });
      
      console.log('Rejection result:', result.data);
      toast.success('Lead rejected successfully');
      onVerify();
      onClose();
    } catch (error) {
      console.error('Error rejecting lead:', error);
      toast.error('Failed to reject lead');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-2xl w-full bg-white rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-xl font-semibold text-gray-900">
              Verify Lead
            </Dialog.Title>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-2">Customer Details</h3>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Name</p>
                    <p className="text-sm font-medium text-gray-900">{lead.customerName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Phone</p>
                    <p className="text-sm font-medium text-gray-900">{lead.customerNumber}</p>
                  </div>
                </div>
              </div>
            </div>

            <MediaUpload 
              leadId={lead.id} 
              onUploadComplete={() => setUploadComplete(true)} 
            />

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-2">
                Verification Notes
              </label>
              <textarea
                id="notes"
                rows={4}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any additional notes about the verification..."
              />
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={isProcessing}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {isProcessing ? 'Processing...' : 'Reject Lead'}
              </button>
              <button
                onClick={handleVerify}
                disabled={!uploadComplete || isProcessing}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {isProcessing ? 'Processing...' : 'Verify Lead'}
              </button>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}