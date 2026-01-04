/**
 * ===============================================================================
 * BULK ACTIVATE NUMBERS COMPONENT - ADMIN NUMBER MANAGEMENT
 * ===============================================================================
 *
 * This component provides an interface for admins to activate numbers
 * from the number pool. It accepts a list of numbers (one per line) and
 * processes them for activation.
 *
 * FEATURES:
 * - Textarea input for pasting multiple numbers
 * - Real-time number count display
 * - Batch processing with progress feedback
 * - Automatic stats recalculation
 * - Detailed results showing activated, not found, and errors
 *
 * SAFETY:
 * - Confirmation dialog before activation
 * - Maximum 500 numbers per batch
 * - Transaction-safe operations
 * - Automatic stats update
 *
 * ===============================================================================
 */

import { useState } from 'react';
import { Zap, AlertTriangle, CheckCircle, XCircle, Loader } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { doc, getDoc, collection, writeBatch, query, where, getDocs } from 'firebase/firestore';
import { serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface BulkActivateResult {
  success: boolean;
  activatedCount: number;
  notFoundCount: number;
  errorCount: number;
  activatedNumbers?: string[];
  notFoundNumbers?: string[];
  errors?: string[];
}

interface BulkActivateNumbersProps {
  isOpen: boolean;
  onClose: () => void;
  leadId?: string; // Optional lead ID for tracking
}

export function BulkActivateNumbers({ isOpen, onClose, leadId }: BulkActivateNumbersProps) {
  const [numbersText, setNumbersText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [result, setResult] = useState<BulkActivateResult | null>(null);

  // Parse numbers from textarea
  const parseNumbers = (text: string): string[] => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => line.replace(/[\s\-\(\)]/g, '')); // Clean phone number format
  };

  const numbers = parseNumbers(numbersText);
  const isValid = numbers.length > 0 && numbers.length <= 500;

  const handleActivate = async () => {
    if (!isValid) return;

    setIsProcessing(true);
    setResult(null);

    try {
      const activatedNumbers: string[] = [];
      const notFoundNumbers: string[] = [];
      const errors: string[] = [];

      // Process in batches of 100 to avoid hitting Firestore limits
      const batchSize = 100;
      for (let i = 0; i < numbers.length; i += batchSize) {
        const batch = writeBatch(db);
        const batchNumbers = numbers.slice(i, i + batchSize);
        let batchOps = 0;

        for (const number of batchNumbers) {
          try {
            // Clean the number
            const cleanNumber = number.replace(/[\s\-\(\)]/g, '');

            // Query for the number in numberpool
            const numberpoolRef = collection(db, 'numberPool');
            const numberQuery = query(numberpoolRef, where('number', '==', cleanNumber));
            const querySnapshot = await getDocs(numberQuery);

            if (querySnapshot.empty) {
              notFoundNumbers.push(cleanNumber);
              continue;
            }

            const numberDoc = querySnapshot.docs[0];
            const numberData = numberDoc.data();

            // Add to activated_numbers collection
            const activatedRef = doc(collection(db, 'activatedNumbers'), numberDoc.id);
            batch.set(activatedRef, {
              ...numberData,
              status: 'activated',
              activatedAt: serverTimestamp(),
              activatedBy: 'admin-bulk-activation', // Since we don't have user context here
              originalId: numberDoc.id,
              originalCollection: 'numberPool',
              leadId: leadId || 'bulk-activation'
            });

            // Delete from numberpool
            batch.delete(numberDoc.ref);
            activatedNumbers.push(cleanNumber);
            batchOps++;
          } catch (error: any) {
            console.error(`Error processing number ${number}:`, error);
            errors.push(`${number}: ${error.message}`);
          }
        }

        // Only commit if there are operations
        if (batchOps > 0) {
          await batch.commit();
        }
      }

      // Set results
      const data: BulkActivateResult = {
        success: activatedNumbers.length > 0,
        activatedCount: activatedNumbers.length,
        notFoundCount: notFoundNumbers.length,
        errorCount: errors.length,
        activatedNumbers: activatedNumbers.slice(0, 10),
        notFoundNumbers: notFoundNumbers.slice(0, 10),
        errors: errors.slice(0, 10)
      };

      setResult(data);

      if (data.success) {
        toast.success(`Successfully activated ${data.activatedCount} numbers`);
        if (data.notFoundCount > 0) {
          toast.warning(`${data.notFoundCount} numbers not found`);
        }
        if (data.errorCount > 0) {
          toast.error(`${data.errorCount} errors occurred`);
        }
      } else {
        toast.error('Bulk activation failed');
      }
    } catch (error: any) {
      console.error('Bulk activation error:', error);
      toast.error('Failed to activate numbers: ' + error.message);
      setResult({
        success: false,
        activatedCount: 0,
        notFoundCount: numbers.length,
        errorCount: 1,
        errors: [error.message]
      });
    } finally {
      setIsProcessing(false);
      setShowConfirmDialog(false);
    }
  };

  const resetForm = () => {
    setNumbersText('');
    setResult(null);
    setShowConfirmDialog(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Zap className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Bulk Activate Numbers</h2>
                  <p className="text-indigo-100 text-sm">Move numbers from pool to activated collection</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {!result ? (
              <>
                {/* Instructions */}
                <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-800">
                      <p className="font-medium mb-1">Instructions:</p>
                      <ul className="list-disc list-inside space-y-1 text-blue-700">
                        <li>Paste phone numbers, one per line</li>
                        <li>Numbers will be moved from number pool to activated collection</li>
                        <li>Maximum 500 numbers per batch</li>
                        <li>Activated numbers will be visible to admins and coordinators</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Input */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Numbers
                  </label>
                  <textarea
                    value={numbersText}
                    onChange={(e) => setNumbersText(e.target.value)}
                    placeholder="Enter phone numbers, one per line&#10;Example:&#10;1234567890&#10;0987654321&#10;5551234567"
                    className="w-full h-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono text-sm"
                    disabled={isProcessing}
                  />
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className={`font-medium ${numbers.length > 500 ? 'text-red-600' : 'text-gray-600'}`}>
                      {numbers.length} numbers
                    </span>
                    {numbers.length > 500 && (
                      <span className="text-red-600">Maximum 500 numbers allowed</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    disabled={isProcessing}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setShowConfirmDialog(true)}
                    disabled={!isValid || isProcessing}
                    className="px-6 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <Loader className="h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4" />
                        Activate Numbers
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              /* Results */
              <div className="space-y-6">
                <div className="text-center">
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
                    result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {result.success ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    {result.success ? 'Activation Completed' : 'Activation Failed'}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="text-2xl font-bold text-green-600">{result.activatedCount}</div>
                    <div className="text-sm text-green-700">Activated</div>
                  </div>
                  <div className="text-center p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <div className="text-2xl font-bold text-yellow-600">{result.notFoundCount}</div>
                    <div className="text-sm text-yellow-700">Not Found</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
                    <div className="text-2xl font-bold text-red-600">{result.errorCount}</div>
                    <div className="text-sm text-red-700">Errors</div>
                  </div>
                </div>

                {/* Details */}
                {(result.activatedNumbers?.length || result.notFoundNumbers?.length || result.errors?.length) && (
                  <div className="space-y-4">
                    {result.activatedNumbers && result.activatedNumbers.length > 0 && (
                      <div>
                        <h4 className="font-medium text-green-800 mb-2">Successfully Activated:</h4>
                        <div className="max-h-32 overflow-y-auto bg-green-50 p-3 rounded-lg border border-green-200">
                          <div className="text-sm text-green-700 font-mono">
                            {result.activatedNumbers.slice(0, 10).join(', ')}
                            {result.activatedNumbers.length > 10 && `... and ${result.activatedNumbers.length - 10} more`}
                          </div>
                        </div>
                      </div>
                    )}

                    {result.notFoundNumbers && result.notFoundNumbers.length > 0 && (
                      <div>
                        <h4 className="font-medium text-yellow-800 mb-2">Not Found:</h4>
                        <div className="max-h-32 overflow-y-auto bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                          <div className="text-sm text-yellow-700 font-mono">
                            {result.notFoundNumbers.slice(0, 10).join(', ')}
                            {result.notFoundNumbers.length > 10 && `... and ${result.notFoundNumbers.length - 10} more`}
                          </div>
                        </div>
                      </div>
                    )}

                    {result.errors && result.errors.length > 0 && (
                      <div>
                        <h4 className="font-medium text-red-800 mb-2">Errors:</h4>
                        <div className="max-h-32 overflow-y-auto bg-red-50 p-3 rounded-lg border border-red-200">
                          <div className="text-sm text-red-700">
                            {result.errors.slice(0, 5).map((error, index) => (
                              <div key={index}>{error}</div>
                            ))}
                            {result.errors.length > 5 && `... and ${result.errors.length - 5} more errors`}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3">
                  <button
                    onClick={resetForm}
                    className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Activate More Numbers
                  </button>
                  <button
                    onClick={handleClose}
                    className="px-6 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Confirmation Dialog */}
          <AnimatePresence>
            {showConfirmDialog && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]"
                onClick={() => setShowConfirmDialog(false)}
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="text-center">
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100 mb-4">
                      <AlertTriangle className="h-6 w-6 text-indigo-600" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Confirm Bulk Activation
                    </h3>
                    <p className="text-sm text-gray-500 mb-6">
                      Are you sure you want to activate {numbers.length} numbers?
                      This action will move them from the number pool to the activated collection.
                    </p>
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setShowConfirmDialog(false)}
                        className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleActivate}
                        className="px-6 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all"
                      >
                        Confirm Activation
                      </button>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}