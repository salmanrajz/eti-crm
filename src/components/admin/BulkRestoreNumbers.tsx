/**
 * ===============================================================================
 * BULK RESTORE NUMBERS COMPONENT - ADMIN NUMBER MANAGEMENT
 * ===============================================================================
 *
 * This component provides an interface for admins to restore numbers
 * from the deleted/returned list back to the number pool. It accepts a list of
 * numbers (one per line) and allows updating their codes during restoration.
 *
 * FEATURES:
 * - Textarea input for pasting multiple numbers
 * - Code update field for bulk code changes
 * - Real-time number count display
 * - Batch processing with progress feedback
 * - Automatic stats recalculation
 * - Detailed results showing restored, not found, and errors
 *
 * SAFETY:
 * - Confirmation dialog before restoration
 * - Maximum 500 numbers per batch
 * - Transaction-safe operations
 * - Automatic stats update
 *
 * ===============================================================================
 */

import { useState } from 'react';
import { RotateCcw, AlertTriangle, CheckCircle, XCircle, Loader, Code } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { doc, getDoc, collection, writeBatch, query, where, getDocs } from 'firebase/firestore';
import { serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface BulkRestoreResult {
  success: boolean;
  restoredCount: number;
  notFoundCount: number;
  errorCount: number;
  restoredNumbers?: string[];
  notFoundNumbers?: string[];
  errors?: string[];
}

interface BulkRestoreNumbersProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BulkRestoreNumbers({ isOpen, onClose }: BulkRestoreNumbersProps) {
  const [numbersText, setNumbersText] = useState('');
  const [newCode, setNewCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [result, setResult] = useState<BulkRestoreResult | null>(null);

  // Parse numbers from textarea
  const parseNumbers = (text: string): string[] => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => line.replace(/[\s\-\(\)]/g, ''));
  };

  const numbersList = parseNumbers(numbersText);
  const numbersCount = numbersList.length;

  const handleBulkRestore = async () => {
    if (numbersCount === 0) {
      toast.error('Please enter at least one number');
      return;
    }

    if (numbersCount > 500) {
      toast.error('Maximum 500 numbers can be restored at once');
      return;
    }

    setShowConfirmDialog(false);
    setIsProcessing(true);
    setResult(null);

    try {
      const batch = writeBatch(db);
      const restoredNumbers: string[] = [];
      const notFoundNumbers: string[] = [];
      const errors: string[] = [];

      // Process in chunks of 10 (Firestore 'in' query limit)
      const chunkSize = 10;
      for (let i = 0; i < numbersList.length; i += chunkSize) {
        const chunk = numbersList.slice(i, i + chunkSize);

        try {
          // Query deletedNumbers collection for these numbers
          const deletedNumbersRef = collection(db, 'deletedNumbers');
          const q = query(deletedNumbersRef, where('number', 'in', chunk));
          const snapshot = await getDocs(q);

          const foundNumbers = new Set(snapshot.docs.map(doc => doc.data().number));

          // Process each number in the chunk
          for (const number of chunk) {
            if (foundNumbers.has(number)) {
              const docRef = snapshot.docs.find(doc => doc.data().number === number);
              if (docRef) {
                const deletedNumberData = docRef.data();

                // Prepare number data for numberPool (remove deletedNumbers-specific fields)
                const { deletedAt, originalId, originalCollection, ...numberData } = deletedNumberData;

                // Update code if provided
                const updatedNumberData = {
                  ...numberData,
                  code: newCode.trim() || numberData.code || '',
                  status: 'open',
                  lastStatusChange: serverTimestamp(),
                  reservedBy: null,
                  reservedAt: null,
                  restoredAt: serverTimestamp()
                };

                // Create document in numberPool collection
                const numberPoolRef = doc(db, 'numberPool', docRef.id);
                batch.set(numberPoolRef, updatedNumberData);

                // Delete from deletedNumbers
                batch.delete(docRef.ref);

                restoredNumbers.push(number);
              }
            } else {
              notFoundNumbers.push(number);
            }
          }
        } catch (error) {
          console.error('Error processing chunk:', error);
          // Add errors for this chunk
          chunk.forEach(number => {
            errors.push(`Error processing ${number}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          });
        }
      }

      // Commit the batch
      await batch.commit();

      const resultData: BulkRestoreResult = {
        success: restoredNumbers.length > 0,
        restoredCount: restoredNumbers.length,
        notFoundCount: notFoundNumbers.length,
        errorCount: errors.length,
        restoredNumbers,
        notFoundNumbers,
        errors
      };

      setResult(resultData);

      if (resultData.success) {
        toast.success(
          `Successfully restored ${resultData.restoredCount} number(s) to number pool`,
          { duration: 5000 }
        );

        if (resultData.notFoundCount > 0) {
          toast.error(
            `${resultData.notFoundCount} number(s) not found in deleted list`,
            { duration: 5000 }
          );
        }

        if (resultData.errorCount > 0) {
          toast.error(
            `${resultData.errorCount} number(s) had errors during restoration`,
            { duration: 5000 }
          );
        }

        // Clear form on success
        setNumbersText('');
        setNewCode('');
      } else {
        toast.error('No numbers were successfully restored');
      }
    } catch (error) {
      console.error('Bulk restore error:', error);
      toast.error('Error restoring numbers. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (!isProcessing) {
      setNumbersText('');
      setNewCode('');
      setResult(null);
      setShowConfirmDialog(false);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
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
            className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <RotateCcw className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Bulk Restore Numbers</h3>
                  <p className="text-sm text-gray-600">Restore numbers from deleted list to number pool</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={isProcessing}
                className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6">
              {!result ? (
                <>
                  {/* Numbers Input */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Numbers to Restore (one per line)
                    </label>
                    <textarea
                      value={numbersText}
                      onChange={(e) => setNumbersText(e.target.value)}
                      placeholder="0569669692&#10;0569669693&#10;0569669694"
                      className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-vertical"
                      disabled={isProcessing}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {numbersCount} number(s) entered
                    </p>
                  </div>

                  {/* Code Update */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <div className="flex items-center gap-2">
                        <Code className="h-4 w-4" />
                        Update Code (optional)
                      </div>
                    </label>
                    <input
                      type="text"
                      value={newCode}
                      onChange={(e) => setNewCode(e.target.value)}
                      placeholder="Enter new code for all restored numbers"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      disabled={isProcessing}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Leave empty to keep original codes
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleClose}
                      disabled={isProcessing}
                      className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setShowConfirmDialog(true)}
                      disabled={isProcessing || numbersCount === 0}
                      className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md transition-colors flex items-center justify-center gap-2"
                    >
                      {isProcessing ? (
                        <>
                          <Loader className="h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <RotateCcw className="h-4 w-4" />
                          Restore Numbers
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                /* Results */
                <div className="space-y-4">
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-4">
                      <CheckCircle className="h-6 w-6 text-green-600" />
                    </div>
                    <h4 className="text-lg font-semibold text-gray-900 mb-2">Restoration Complete</h4>
                  </div>

                  {/* Summary */}
                  <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-green-600">Restored:</span>
                      <span className="text-sm font-bold text-green-600">{result.restoredCount}</span>
                    </div>
                    {result.notFoundCount > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-red-600">Not Found:</span>
                        <span className="text-sm font-bold text-red-600">{result.notFoundCount}</span>
                      </div>
                    )}
                    {result.errorCount > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-orange-600">Errors:</span>
                        <span className="text-sm font-bold text-orange-600">{result.errorCount}</span>
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  {result.restoredNumbers && result.restoredNumbers.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium text-gray-700 mb-2">Restored Numbers:</h5>
                      <div className="max-h-32 overflow-y-auto bg-gray-50 rounded p-2">
                        <div className="text-xs text-gray-600 font-mono">
                          {result.restoredNumbers.join(', ')}
                        </div>
                      </div>
                    </div>
                  )}

                  {result.notFoundNumbers && result.notFoundNumbers.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium text-red-700 mb-2">Not Found:</h5>
                      <div className="max-h-32 overflow-y-auto bg-red-50 rounded p-2">
                        <div className="text-xs text-red-600 font-mono">
                          {result.notFoundNumbers.join(', ')}
                        </div>
                      </div>
                    </div>
                  )}

                  {result.errors && result.errors.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium text-orange-700 mb-2">Errors:</h5>
                      <div className="max-h-32 overflow-y-auto bg-orange-50 rounded p-2">
                        <div className="text-xs text-orange-600">
                          {result.errors.map((error, index) => (
                            <div key={index}>{error}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Close Button */}
                  <button
                    onClick={handleClose}
                    className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
                  >
                    Close
                  </button>
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
                  className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
                  onClick={() => setShowConfirmDialog(false)}
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-center">
                      <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Bulk Restore</h3>
                      <p className="text-sm text-gray-600 mb-6">
                        Are you sure you want to restore {numbersCount} number(s) from the deleted list back to the number pool?
                        {newCode.trim() && (
                          <span className="block mt-2 font-medium text-green-600">
                            Code will be updated to: "{newCode.trim()}"
                          </span>
                        )}
                      </p>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setShowConfirmDialog(false)}
                          className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleBulkRestore}
                          className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
                        >
                          Restore
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}