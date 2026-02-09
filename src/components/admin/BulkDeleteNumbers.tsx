/**
 * ===============================================================================
 * RETURN NUMBERS COMPONENT - ADMIN NUMBER MANAGEMENT
 * ===============================================================================
 * 
 * This component provides an interface for admins to return numbers
 * from the number pool. It accepts numbers via Excel file upload or
 * textarea input (one per line) and processes them for return.
 * 
 * FEATURES:
 * - Excel file upload with drag & drop support (.xlsx, .xls, .ods)
 * - Automatic number extraction from all sheets and columns
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

import { useState, useRef } from 'react';
import { Trash2, AlertTriangle, CheckCircle, XCircle, Loader, Upload, FileSpreadsheet, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';

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
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const BATCH_SIZE = 450; // Process 450 numbers per batch

  // Parse numbers from textarea
  const parseNumbers = (text: string): string[] => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => line.replace(/[\s\-\(\)]/g, ''));
  };

  // Parse Excel file and extract phone numbers
  const parseExcelFile = async (file: File): Promise<string[]> => {
    try {
      // Dynamic import to avoid bundle size issues
      const XLSX = await import('xlsx');
      
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const numbers: string[] = [];
      
      // Process all sheets
      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        
        // Process all rows and columns
        jsonData.forEach((row: any) => {
          if (Array.isArray(row)) {
            row.forEach((cell: any) => {
              if (cell !== null && cell !== undefined && cell !== '') {
                const cellStr = String(cell).trim();
                // Check if it looks like a phone number (contains digits)
                if (cellStr.length >= 7 && /^\d+[\d\s\-\(\)]*$/.test(cellStr.replace(/[\s\-\(\)]/g, ''))) {
                  const cleanedNumber = cellStr.replace(/[\s\-\(\)]/g, '');
                  if (cleanedNumber.length >= 7) {
                    numbers.push(cleanedNumber);
                  }
                }
              }
            });
          }
        });
      });
      
      // Remove duplicates
      return [...new Set(numbers)];
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      throw new Error('Failed to parse Excel file. Please ensure it is a valid Excel file (.xlsx or .xls)');
    }
  };

  // Handle file upload
  const handleFileUpload = async (file: File) => {
    if (!file) return;

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'application/vnd.oasis.opendocument.spreadsheet', // .ods
    ];
    
    const isValidType = validTypes.includes(file.type) || 
                        file.name.endsWith('.xlsx') || 
                        file.name.endsWith('.xls') ||
                        file.name.endsWith('.ods');

    if (!isValidType) {
      toast.error('Please upload a valid Excel file (.xlsx, .xls, or .ods)');
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast.error('File size exceeds 10MB limit');
      return;
    }

    try {
      const extractedNumbers = await parseExcelFile(file);
      
      if (extractedNumbers.length === 0) {
        toast.error('No phone numbers found in the Excel file');
        return;
      }

      // Merge with existing numbers (remove duplicates)
      const existingNumbers = parseNumbers(numbersText);
      const allNumbers = [...new Set([...existingNumbers, ...extractedNumbers])];
      
      // Update textarea with merged numbers
      setNumbersText(allNumbers.join('\n'));
      setUploadedFileName(file.name);
      
      toast.success(
        `Successfully imported ${extractedNumbers.length} number(s) from ${file.name}`,
        { duration: 4000 }
      );
    } catch (error: any) {
      console.error('File upload error:', error);
      toast.error(error.message || 'Failed to process Excel file');
    }
  };

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    // Reset input to allow same file to be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const numbersList = parseNumbers(numbersText);
  const numbersCount = numbersList.length;

  // Split numbers into batches
  const splitIntoBatches = (numbers: string[], batchSize: number): string[][] => {
    const batches: string[][] = [];
    for (let i = 0; i < numbers.length; i += batchSize) {
      batches.push(numbers.slice(i, i + batchSize));
    }
    return batches;
  };

  const handleBulkDelete = async () => {
    if (numbersCount === 0) {
      toast.error('Please enter at least one number');
      return;
    }

    setShowConfirmDialog(false);
    setIsProcessing(true);
    setResult(null);

    // Split into batches of 450
    const batches = splitIntoBatches(numbersList, BATCH_SIZE);
    setBatchProgress({ current: 0, total: batches.length });

    const functions = getFunctions();
    const bulkDeleteNumbersFunc = httpsCallable<{ numbers: string[] }, BulkDeleteResult>(
      functions,
      'bulkDeleteNumbers'
    );

    // Aggregate results
    let totalDeleted = 0;
    let totalNotFound = 0;
    let totalErrors = 0;
    const allDeletedNumbers: string[] = [];
    const allNotFoundNumbers: string[] = [];
    const allErrors: string[] = [];

    try {
      // Process batches sequentially
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        setBatchProgress({ current: i + 1, total: batches.length });

        try {
          const response = await bulkDeleteNumbersFunc({ numbers: batch });
          const data = response.data;

          if (data.success) {
            totalDeleted += data.deletedCount || 0;
            totalNotFound += data.notFoundCount || 0;
            totalErrors += data.errorCount || 0;

            if (data.deletedNumbers) {
              allDeletedNumbers.push(...data.deletedNumbers);
            }
            if (data.notFoundNumbers) {
              allNotFoundNumbers.push(...data.notFoundNumbers);
            }
            if (data.errors) {
              allErrors.push(...data.errors);
            }
          } else {
            totalErrors += batch.length;
            allErrors.push(`Batch ${i + 1} failed: ${data.errors?.join(', ') || 'Unknown error'}`);
          }
        } catch (error: any) {
          console.error(`Error processing batch ${i + 1}:`, error);
          totalErrors += batch.length;
          allErrors.push(`Batch ${i + 1} error: ${error.message || 'Unknown error'}`);
        }
      }

      // Set final result
      const finalResult: BulkDeleteResult = {
        success: totalDeleted > 0 || totalNotFound > 0,
        deletedCount: totalDeleted,
        notFoundCount: totalNotFound,
        errorCount: totalErrors,
        deletedNumbers: allDeletedNumbers.slice(0, 10), // Show first 10
        notFoundNumbers: allNotFoundNumbers.slice(0, 10), // Show first 10
        errors: allErrors.slice(0, 10) // Show first 10
      };

      setResult(finalResult);

      if (finalResult.success) {
        toast.success(
          `Successfully processed ${batches.length} batch(es): ${totalDeleted} returned, ${totalNotFound} not found`,
          { duration: 6000 }
        );
        
        if (totalNotFound > 0) {
          toast.error(
            `${totalNotFound} number(s) not found`,
            { duration: 5000 }
          );
        }

        if (totalErrors > 0) {
          toast.error(
            `${totalErrors} error(s) occurred`,
            { duration: 5000 }
          );
        }

        // Clear textarea on success
        if (totalDeleted > 0) {
          setNumbersText('');
          setUploadedFileName(null);
        }
      } else {
        toast.error('Failed to return numbers. Please check the errors below.');
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
      setBatchProgress(null);
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
            Return multiple numbers from the pool (upload Excel file or enter one per line, processed in batches of 450)
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

        {/* Excel File Upload Section */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={clsx(
            "border-2 border-dashed rounded-lg p-6 transition-all duration-200",
            isDragging
              ? "border-indigo-500 bg-indigo-50"
              : "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100"
          )}
        >
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="p-3 bg-indigo-100 rounded-full">
              <FileSpreadsheet className="h-6 w-6 text-indigo-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700 mb-1">
                Upload Excel File
              </p>
              <p className="text-xs text-gray-500 mb-3">
                Drag and drop an Excel file here, or click to browse
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.oasis.opendocument.spreadsheet"
                onChange={handleFileInputChange}
                disabled={isProcessing}
                className="hidden"
                id="excel-upload"
              />
              <label
                htmlFor="excel-upload"
                className={clsx(
                  "inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer text-sm font-medium",
                  isProcessing && "opacity-50 cursor-not-allowed"
                )}
              >
                <Upload className="h-4 w-4" />
                Choose File
              </label>
            </div>
            {uploadedFileName && (
              <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm">
                <CheckCircle className="h-4 w-4" />
                <span className="font-medium">{uploadedFileName}</span>
                <button
                  onClick={() => {
                    setUploadedFileName(null);
                    setNumbersText('');
                    setResult(null);
                  }}
                  className="ml-2 p-0.5 hover:bg-green-200 rounded transition-colors"
                  disabled={isProcessing}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <p className="text-xs text-gray-500 text-center mt-1">
              Supports .xlsx, .xls, and .ods files. Numbers will be extracted from all sheets and columns.
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-gray-300"></div>
          <span className="text-xs text-gray-500 font-medium">OR</span>
          <div className="flex-1 border-t border-gray-300"></div>
        </div>

        <textarea
          value={numbersText}
          onChange={(e) => setNumbersText(e.target.value)}
          placeholder="Enter phone numbers (one per line)&#10;Example:&#10;0501234567&#10;0509876543&#10;971501234567"
          rows={12}
          disabled={isProcessing}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent font-mono text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
        />

        {numbersCount > BATCH_SIZE && (
          <div className="flex items-center gap-2 text-blue-600 text-sm bg-blue-50 p-3 rounded-lg border border-blue-200">
            <AlertTriangle className="h-4 w-4" />
            <span>
              Large batch detected: {numbersCount} numbers will be processed in {Math.ceil(numbersCount / BATCH_SIZE)} batch(es) of {BATCH_SIZE} each
            </span>
          </div>
        )}

        {/* Batch Progress Indicator */}
        {isProcessing && batchProgress && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-indigo-900">
                Processing Batch {batchProgress.current} of {batchProgress.total}
              </span>
              <span className="text-sm text-indigo-600">
                {Math.round((batchProgress.current / batchProgress.total) * 100)}%
              </span>
            </div>
            <div className="w-full bg-indigo-200 rounded-full h-2">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => setShowConfirmDialog(true)}
            disabled={isProcessing || numbersCount === 0}
            className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white py-3 px-6 rounded-lg hover:from-red-600 hover:to-red-700 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <Loader className="h-5 w-5 animate-spin" />
                {batchProgress ? (
                  <span>Processing batch {batchProgress.current} of {batchProgress.total}...</span>
                ) : (
                  <span>Returning...</span>
                )}
              </>
            ) : (
              <>
                <Trash2 className="h-5 w-5" />
                Return {numbersCount} Number{numbersCount !== 1 ? 's' : ''}
                {numbersCount > BATCH_SIZE && (
                  <span className="text-xs opacity-90 ml-1">
                    ({Math.ceil(numbersCount / BATCH_SIZE)} batches)
                  </span>
                )}
              </>
            )}
          </button>

          <button
            onClick={() => {
              setNumbersText('');
              setResult(null);
              setUploadedFileName(null);
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
                {numbersCount > BATCH_SIZE && (
                  <span className="block mt-2 text-sm text-blue-600 font-medium">
                    This will be processed in {Math.ceil(numbersCount / BATCH_SIZE)} batch(es) of {BATCH_SIZE} numbers each.
                  </span>
                )}
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

