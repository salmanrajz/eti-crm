/**
 * ===============================================================================
 * RETURN NUMBERS COMPONENT - ADMIN NUMBER MANAGEMENT
 * ===============================================================================
 * 
 * This component provides an interface for admins to return numbers
 * from the number pool. It accepts a list of numbers (one per line) and
 * processes them for return.
 * 
 * FEATURES:
 * - Textarea input for pasting multiple numbers
 * - Real-time number count display
 * - Batch processing with progress feedback
 * - Automatic stats recalculation
 * - Detailed results showing returned, not found, and errors
 * 
 * SAFETY:
 * - Confirmation dialog before return
 * - Maximum 500 numbers per batch
 * - Transaction-safe operations
 * - Automatic stats update
 * 
 * ===============================================================================
 */

import { useState } from 'react';
import { Trash2, AlertTriangle, CheckCircle, XCircle, Loader } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { motion, AnimatePresence } from 'framer-motion';

interface BulkDeleteResult {
  success: boolean;
  deletedCount: number;
  notFoundCount: number;
  errorCount: number;
  deletedNumbers?: string[];
  notFoundNumbers?: string[];
  errors?: string[];
}

export function BulkDeleteNumbers() {
  const [numbersText, setNumbersText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [result, setResult] = useState<BulkDeleteResult | null>(null);

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

  const handleBulkDelete = async () => {
    if (numbersCount === 0) {
      toast.error('Please enter at least one number');
      return;
    }

    if (numbersCount > 500) {
      toast.error('Maximum 500 numbers can be deleted at once');
      return;
    }

    setShowConfirmDialog(false);
    setIsProcessing(true);
    setResult(null);

    try {
      const functions = getFunctions();
      const bulkDeleteNumbersFunc = httpsCallable<{ numbers: string[] }, BulkDeleteResult>(
        functions,
        'bulkDeleteNumbers'
      );

      const response = await bulkDeleteNumbersFunc({ numbers: numbersList });
      const data = response.data;

      setResult(data);

      if (data.success) {
        toast.success(
          `Successfully changed status to "returned" for ${data.deletedCount} number(s)`,
          { duration: 5000 }
        );
        
        if (data.notFoundCount > 0) {
          toast.error(
            `${data.notFoundCount} number(s) not found`,
            { duration: 5000 }
          );
        }

        if (data.errorCount > 0) {
          toast.error(
            `${data.errorCount} error(s) occurred`,
            { duration: 5000 }
          );
        }

        // Clear textarea on success
        if (data.deletedCount > 0) {
          setNumbersText('');
        }
      }
    } catch (error: any) {
      console.error('Bulk return error:', error);
      toast.error(error.message || 'Failed to return numbers');
      setResult({
        success: false,
        deletedCount: 0,
        notFoundCount: 0,
        errorCount: 1,
        errors: [error.message || 'Unknown error']
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 bg-red-100 rounded-xl">
          <Trash2 className="h-6 w-6 text-red-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Return Numbers</h2>
          <p className="text-sm text-gray-500 mt-1">
            Return multiple numbers from the pool (one per line, max 500)
          </p>
        </div>
      </div>

      {/* Input Section */}
      <div className="bg-white rounded-xl border-2 border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            Numbers to Return
          </label>
          {numbersCount > 0 && (
            <span className="text-sm font-medium text-gray-600">
              {numbersCount} number{numbersCount !== 1 ? 's' : ''} to return
            </span>
          )}
        </div>

        <textarea
          value={numbersText}
          onChange={(e) => setNumbersText(e.target.value)}
          placeholder="Enter phone numbers (one per line)&#10;Example:&#10;0501234567&#10;0509876543&#10;971501234567"
          rows={12}
          disabled={isProcessing}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
        />

        {numbersCount > 500 && (
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>Maximum 500 numbers allowed per batch</span>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => setShowConfirmDialog(true)}
            disabled={isProcessing || numbersCount === 0 || numbersCount > 500}
            className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white py-3 px-6 rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <Loader className="h-5 w-5 animate-spin" />
                Returning...
              </>
            ) : (
              <>
                <Trash2 className="h-5 w-5" />
                Return {numbersCount} Number{numbersCount !== 1 ? 's' : ''}
              </>
            )}
          </button>

          <button
            onClick={() => {
              setNumbersText('');
              setResult(null);
            }}
            disabled={isProcessing}
            className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Results Section */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white rounded-xl border-2 border-gray-200 p-6 space-y-4"
          >
            <h3 className="text-lg font-semibold text-gray-900">Results</h3>

            <div className="grid grid-cols-3 gap-4">
              {/* Deleted */}
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="flex items-center gap-2 text-green-700 mb-1">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Status Changed to "Returned"</span>
                </div>
                <p className="text-2xl font-bold text-green-900">{result.deletedCount}</p>
              </div>

              {/* Not Found */}
              <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                <div className="flex items-center gap-2 text-yellow-700 mb-1">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="font-medium">Not Found</span>
                </div>
                <p className="text-2xl font-bold text-yellow-900">{result.notFoundCount}</p>
              </div>

              {/* Errors */}
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <div className="flex items-center gap-2 text-red-700 mb-1">
                  <XCircle className="h-5 w-5" />
                  <span className="font-medium">Errors</span>
                </div>
                <p className="text-2xl font-bold text-red-900">{result.errorCount}</p>
              </div>
            </div>

            {/* Info Message */}
            {result.deletedCount > 0 && (
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-900 mb-1">
                      Status Changed to "Returned"
                    </p>
                    <p className="text-xs text-blue-700">
                      {result.deletedCount} number{result.deletedCount !== 1 ? 's have' : ' has'} been changed to status "returned". 
                      These numbers will appear in search results when you search for them in the Number Pool.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Details */}
            {(result.deletedNumbers && result.deletedNumbers.length > 0) && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Sample Numbers with Status "Returned" (first 10):
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.deletedNumbers.map((num, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-mono"
                    >
                      {num}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(result.notFoundNumbers && result.notFoundNumbers.length > 0) && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Sample Not Found Numbers (first 10):
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.notFoundNumbers.map((num, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs font-mono"
                    >
                      {num}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(result.errors && result.errors.length > 0) && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Sample Errors (first 10):
                </p>
                <div className="space-y-1">
                  {result.errors.map((error, idx) => (
                    <p key={idx} className="text-xs text-red-600 font-mono">
                      {error}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {showConfirmDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={() => setShowConfirmDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Confirm Deletion</h3>
              </div>

              <p className="text-gray-600 mb-6">
                Are you sure you want to return <strong>{numbersCount}</strong> number
                {numbersCount !== 1 ? 's' : ''}? 
                <br /><br />
                The status of these numbers will be changed to "returned" and they will appear in search results. 
                This action cannot be undone.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={handleBulkDelete}
                  className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Yes, Return
                </button>
                <button
                  onClick={() => setShowConfirmDialog(false)}
                  className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

