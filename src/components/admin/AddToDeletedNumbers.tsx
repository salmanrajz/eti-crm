/**
 * ===============================================================================
 * ADD TO DELETED NUMBERS COMPONENT - ADMIN NUMBER MANAGEMENT
 * ===============================================================================
 * 
 * This component provides an interface for admins to add numbers directly
 * to the deletedNumbers collection without going through the numberPool.
 * 
 * FEATURES:
 * - Textarea input for pasting multiple numbers with metadata
 * - Format: Number|Category|Code|Group (one per line)
 * - Batch processing with progress feedback
 * - Validation and error handling
 * 
 * SAFETY:
 * - Confirmation dialog before adding
 * - Maximum 500 numbers per batch
 * - Transaction-safe operations
 * 
 * ===============================================================================
 */

import { useState } from 'react';
import { Archive, AlertTriangle, CheckCircle, XCircle, Loader } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { collection, writeBatch, doc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { motion, AnimatePresence } from 'framer-motion';

interface AddToDeletedResult {
  success: boolean;
  addedCount: number;
  duplicateCount: number;
  errorCount: number;
  addedNumbers?: string[];
  duplicateNumbers?: string[];
  errors?: string[];
}

interface NumberInput {
  number: string;
  category?: string;
  code?: string;
  group?: string;
  passcode?: string;
  teamVisibility?: string;
  visibleToFreelancers?: boolean;
}

const VALID_CATEGORIES = ['Standard', 'Silver', 'Silver Plus', 'Gold', 'Gold Plus', 'Platinum'];

export function AddToDeletedNumbers() {
  const [numbersText, setNumbersText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [result, setResult] = useState<AddToDeletedResult | null>(null);

  // Parse numbers from textarea
  // Format: Number[|Category|Code|Group|Passcode|TeamVisibility|VisibleToFreelancers]
  // Example: 0501234567 (just number)
  // Example: 0501234567|Gold|ETS-1|G1 (with optional fields)
  const parseNumbers = (text: string): { numbers: NumberInput[]; errors: string[] } => {
    const lines = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      return { numbers: [], errors: [] };
    }

    const numbers: NumberInput[] = [];
    const errors: string[] = [];

    lines.forEach((line, index) => {
      try {
        const parts = line.split('|').map(p => p.trim());
        
        // Number is required (first part)
        if (parts.length < 1 || !parts[0]) {
          errors.push(`Line ${index + 1}: Number is required`);
          return;
        }

        const number = parts[0].replace(/[\s\-\(\)]/g, '');

        // Validate number format (10 digits)
        if (!/^\d{10}$/.test(number)) {
          errors.push(`Line ${index + 1}: Invalid number format. Number must be 10 digits. Got: ${number}`);
          return;
        }

        // Optional fields
        const category = parts[1] || undefined;
        const code = parts[2] || undefined;
        const group = parts[3] || undefined;
        const passcode = parts[4] || undefined;
        const teamVisibility = parts[5] || undefined;
        const visibleToFreelancers = parts[6] === 'true' || parts[6] === '1' || (parts[6] === '' ? undefined : parts[6] !== 'false' && parts[6] !== '0');

        // Validate category if provided
        if (category && !VALID_CATEGORIES.includes(category as any)) {
          errors.push(`Line ${index + 1}: Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}. Got: ${category}`);
          return;
        }

        numbers.push({
          number,
          category,
          code,
          group,
          passcode,
          teamVisibility,
          visibleToFreelancers
        });
      } catch (error: any) {
        errors.push(`Line ${index + 1}: ${error.message || 'Unknown error'}`);
      }
    });

    return { numbers, errors };
  };

  const { numbers: numbersList, errors: parseErrors } = parseNumbers(numbersText);
  const numbersCount = numbersList.length;

  const handleAddToDeleted = async () => {
    if (numbersCount === 0) {
      toast.error('Please enter at least one number');
      return;
    }

    if (numbersCount > 500) {
      toast.error('Maximum 500 numbers can be added at once');
      return;
    }

    setShowConfirmDialog(false);
    setIsProcessing(true);
    setResult(null);

    const addedNumbers: string[] = [];
    const duplicateNumbers: string[] = [];
    const errors: string[] = [];

    try {
      // First, batch check for duplicates in both collections
      const allNumbers = numbersList.map(n => n.number);
      const existingNumbers = new Set<string>();

      // Check deletedNumbers collection in batches (Firestore 'in' query limit is 10)
      for (let i = 0; i < allNumbers.length; i += 10) {
        const batchNumbers = allNumbers.slice(i, i + 10);
        try {
          const deletedQuery = query(
            collection(db, 'deletedNumbers'),
            where('number', 'in', batchNumbers)
          );
          const deletedSnapshot = await getDocs(deletedQuery);
          deletedSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.number) {
              existingNumbers.add(data.number);
            }
          });
        } catch (error: any) {
          console.error('Error checking deletedNumbers:', error);
        }
      }

      // Check numberPool collection in batches
      for (let i = 0; i < allNumbers.length; i += 10) {
        const batchNumbers = allNumbers.slice(i, i + 10);
        try {
          const numberPoolQuery = query(
            collection(db, 'numberPool'),
            where('number', 'in', batchNumbers)
          );
          const numberPoolSnapshot = await getDocs(numberPoolQuery);
          numberPoolSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.number) {
              existingNumbers.add(data.number);
            }
          });
        } catch (error: any) {
          console.error('Error checking numberPool:', error);
        }
      }

      // Filter out duplicates
      const numbersToAdd = numbersList.filter(numData => {
        if (existingNumbers.has(numData.number)) {
          duplicateNumbers.push(numData.number);
          return false;
        }
        return true;
      });

      // Process in batches of 500 (Firestore batch limit)
      const batchSize = 500;
      for (let i = 0; i < numbersToAdd.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = numbersToAdd.slice(i, i + batchSize);

        for (const numData of chunk) {
          try {
            // Prepare number data for deletedNumbers collection (minimal fields)
            const deletedNumberRef = doc(db, 'deletedNumbers', numData.number);
            const numberData: any = {
              number: numData.number,
              status: 'returned',
              visibleToFreelancers: numData.visibleToFreelancers !== false,
              lastStatusChange: serverTimestamp(),
              deletedAt: serverTimestamp(),
              originalId: numData.number,
              originalCollection: 'numberPool',
              createdAt: serverTimestamp(),
              reservationCount: 0,
              claimCount: 0
            };

            // Add optional fields only if provided
            if (numData.category) {
              numberData.category = numData.category;
            }
            if (numData.code) {
              numberData.code = numData.code;
            }
            if (numData.group) {
              numberData.group = numData.group.trim();
            }
            if (numData.passcode) {
              numberData.passcode = numData.passcode;
            }
            if (numData.teamVisibility) {
              numberData.teamVisibility = numData.teamVisibility;
            }

            batch.set(deletedNumberRef, numberData);
            addedNumbers.push(numData.number);
          } catch (error: any) {
            errors.push(`${numData.number}: ${error.message || 'Unknown error'}`);
          }
        }

        // Commit batch
        if (chunk.length > 0) {
          await batch.commit();
        }
      }

      setResult({
        success: true,
        addedCount: addedNumbers.length,
        duplicateCount: duplicateNumbers.length,
        errorCount: errors.length,
        addedNumbers: addedNumbers.slice(0, 10),
        duplicateNumbers: duplicateNumbers.slice(0, 10),
        errors: errors.slice(0, 10)
      });

      if (addedNumbers.length > 0) {
        toast.success(
          `Successfully added ${addedNumbers.length} number(s) to deletedNumbers collection`,
          { duration: 5000 }
        );
      }

      if (duplicateNumbers.length > 0) {
        toast.error(
          `${duplicateNumbers.length} number(s) already exist in numberPool or deletedNumbers`,
          { duration: 5000 }
        );
      }

      if (errors.length > 0) {
        toast.error(
          `${errors.length} error(s) occurred`,
          { duration: 5000 }
        );
      }

      // Clear textarea on success
      if (addedNumbers.length > 0) {
        setNumbersText('');
      }
    } catch (error: any) {
      console.error('Add to deleted numbers error:', error);
      toast.error(error.message || 'Failed to add numbers to deletedNumbers collection');
      setResult({
        success: false,
        addedCount: 0,
        duplicateCount: 0,
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
        <div className="p-3 bg-orange-100 rounded-xl">
          <Archive className="h-6 w-6 text-orange-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Add Numbers to Deleted Numbers</h2>
          <p className="text-sm text-gray-500 mt-1">
            Add numbers directly to deletedNumbers collection (one per line, max 500)
          </p>
        </div>
      </div>

      {/* Format Instructions */}
      <div className="bg-blue-50 rounded-xl border-2 border-blue-200 p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Format Instructions:</h3>
        <p className="text-xs text-blue-700 mb-2">
          Format: <code className="bg-blue-100 px-1 rounded">Number[|Category|Code|Group|Passcode|TeamVisibility|VisibleToFreelancers]</code>
        </p>
        <p className="text-xs text-blue-700 mb-2">
          Required field: <strong>Number</strong> (10 digits)
        </p>
        <p className="text-xs text-blue-700 mb-2">
          Optional fields: Category, Code, Group, Passcode, TeamVisibility, VisibleToFreelancers
        </p>
        <p className="text-xs text-blue-700 mb-2">
          Valid Categories (if provided): {VALID_CATEGORIES.join(', ')}
        </p>
        <div className="mt-3 bg-white rounded p-2">
          <p className="text-xs font-mono text-gray-700">
            Examples:
          </p>
          <p className="text-xs font-mono text-gray-600">
            0501234567
          </p>
          <p className="text-xs font-mono text-gray-600">
            0501234567|Gold|ETS-1|G1
          </p>
          <p className="text-xs font-mono text-gray-600">
            0509876543|Silver|ETS-2|G2|pass123|team1|true
          </p>
        </div>
      </div>

      {/* Input Section */}
      <div className="bg-white rounded-xl border-2 border-gray-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            Numbers to Add (one per line, number only or with optional fields)
          </label>
          {numbersCount > 0 && (
            <span className="text-sm font-medium text-gray-600">
              {numbersCount} number{numbersCount !== 1 ? 's' : ''} to add
            </span>
          )}
        </div>

        <textarea
          value={numbersText}
          onChange={(e) => setNumbersText(e.target.value)}
          placeholder="Enter numbers (one per line):&#10;0501234567&#10;0509876543|Gold|ETS-1|G1&#10;0501111111|Silver|ETS-2|G2|pass123|team1|true"
          rows={12}
          disabled={isProcessing}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent font-mono text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
        />

        {parseErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-start gap-2 text-red-700 text-sm mb-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span className="font-medium">Format Errors ({parseErrors.length}):</span>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {parseErrors.slice(0, 5).map((error, idx) => (
                <p key={idx} className="text-xs text-red-600 font-mono">
                  {error}
                </p>
              ))}
              {parseErrors.length > 5 && (
                <p className="text-xs text-red-600 italic">
                  ... and {parseErrors.length - 5} more error(s)
                </p>
              )}
            </div>
          </div>
        )}

        {numbersCount > 500 && (
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>Maximum 500 numbers allowed per batch</span>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => {
              if (parseErrors.length > 0) {
                toast.error(`Please fix ${parseErrors.length} format error(s) before adding numbers`);
                return;
              }
              setShowConfirmDialog(true);
            }}
            disabled={isProcessing || numbersCount === 0 || numbersCount > 500 || parseErrors.length > 0}
            className="flex-1 bg-gradient-to-r from-orange-500 to-orange-600 text-white py-3 px-6 rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <Loader className="h-5 w-5 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Archive className="h-5 w-5" />
                Add {numbersCount} Number{numbersCount !== 1 ? 's' : ''}
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
              {/* Added */}
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <div className="flex items-center gap-2 text-green-700 mb-1">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Added</span>
                </div>
                <p className="text-2xl font-bold text-green-900">{result.addedCount}</p>
              </div>

              {/* Duplicates */}
              <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                <div className="flex items-center gap-2 text-yellow-700 mb-1">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="font-medium">Duplicates</span>
                </div>
                <p className="text-2xl font-bold text-yellow-900">{result.duplicateCount}</p>
                <p className="text-xs text-yellow-600 mt-1">Found in DB</p>
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
            {result.addedCount > 0 && (
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div className="flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-900 mb-1">
                      Numbers Added Successfully
                    </p>
                    <p className="text-xs text-blue-700">
                      {result.addedCount} number{result.addedCount !== 1 ? 's have' : ' has'} been added to the deletedNumbers collection with status "returned".
                      These numbers will appear in search results when you search for them in the Number Pool.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Details */}
            {(result.addedNumbers && result.addedNumbers.length > 0) && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Sample Added Numbers (first 10):
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.addedNumbers.map((num, idx) => (
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

            {(result.duplicateNumbers && result.duplicateNumbers.length > 0) && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Sample Duplicate Numbers (first 10):
                </p>
                <p className="text-xs text-gray-600 mb-2">
                  These numbers already exist in numberPool or deletedNumbers collection
                </p>
                <div className="flex flex-wrap gap-2">
                  {result.duplicateNumbers.map((num, idx) => (
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
                <div className="p-3 bg-orange-100 rounded-full">
                  <AlertTriangle className="h-6 w-6 text-orange-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Confirm Addition</h3>
              </div>

              <p className="text-gray-600 mb-6">
                Are you sure you want to add <strong>{numbersCount}</strong> number
                {numbersCount !== 1 ? 's' : ''} directly to the deletedNumbers collection? 
                <br /><br />
                These numbers will be added with status "returned" and will appear in search results. 
                This action cannot be undone.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={handleAddToDeleted}
                  className="flex-1 bg-orange-600 text-white py-2 px-4 rounded-lg hover:bg-orange-700 transition-colors font-medium"
                >
                  Yes, Add
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
