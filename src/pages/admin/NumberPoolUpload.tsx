/**
 * ===============================================================================
 * NUMBER POOL UPLOAD PAGE - BULK NUMBER MANAGEMENT
 * ===============================================================================
 * 
 * This page provides functionality for bulk number pool management via Excel file
 * upload. It handles number validation, batch upload to Firestore, and provides
 * comprehensive progress tracking and error handling for large number datasets.
 * 
 * FEATURES:
 * 
 * 1. EXCEL FILE PROCESSING
 *    - XLSX file parsing with number validation and formatting
 *    - Support for number categories, codes, groups, and passcodes
 *    - Sample template download for proper data formatting
 * 
 * 2. BATCH UPLOAD SYSTEM
 *    - Efficient batch processing with configurable batch sizes
 *    - Retry mechanism with exponential backoff for failed uploads
 *    - Progress tracking with detailed success/failure statistics
 * 
 * 3. DATA VALIDATION
 *    - Number format validation (10-digit requirement)
 *    - Category validation against predefined categories
 *    - Required field validation with comprehensive error reporting
 * 
 * 4. USER EXPERIENCE
 *    - Drag-and-drop file upload interface
 *    - Real-time progress indicators and status updates
 *    - Detailed error reporting and validation feedback
 *    - Template download for proper data structure
 * 
 * USAGE:
 * This page is used by administrators to efficiently upload large numbers
 * of phone numbers to the number pool with proper validation and organization.
 * ===============================================================================
 */

import { useState, useMemo, useCallback } from 'react';
import { collection, writeBatch, doc, getDocs, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { toast } from 'react-hot-toast';
import { Upload, Plus, FileSpreadsheet, FileUp, Download } from 'lucide-react';
import type { NumberPool } from '../../types';
import { read, utils, writeFile } from 'xlsx';

// ===============================================================================
// CONFIGURATION AND CONSTANTS
// ===============================================================================

/**
 * Batch processing configuration for efficient Firestore uploads
 * Optimized to prevent quota issues and rate limiting
 */
const BATCH_SIZE = 100; // Reduced batch size to avoid quota issues
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second

/**
 * Valid number categories for the number pool
 * Defines the tier system for number organization
 */
const numberCategories = ['Standard', 'Silver', 'Silver plus', 'Gold', 'Gold plus', 'Platinum'] as const;

interface ExcelRow {
  Number: string;
  Category: typeof numberCategories[number];
  Code: string;
  Group: string;
  Passcode: string;
  TeamVisibility?: string; // optional team ID to restrict visibility
}

export function NumberPoolUpload() {
  const [loading, setLoading] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelErrors, setExcelErrors] = useState<string[]>([]);
  const [parsedExcelData, setParsedExcelData] = useState<ExcelRow[]>([]);
  const [lastValidatedData, setLastValidatedData] = useState<string>('');
  const [visibleToFreelancers, setVisibleToFreelancers] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    total: 0,
    current: 0,
    success: 0,
    failed: 0,
    retries: 0
  });

  const validateNumber = useCallback((number: string) => {
    return /^\d{10}$/.test(number);
  }, []);

  const downloadSampleExcel = useCallback(() => {
    const sampleData = [
      {
        Number: '0501234567',
        Category: 'Standard',
        Code: 'ETS-1',
        Group: 'Group A',
        Passcode: '123456',
        TeamVisibility: ''
      },
      {
        Number: '0501234568',
        Category: 'Silver',
        Code: 'ETS-2',
        Group: 'Group B',
        Passcode: '654321',
        TeamVisibility: 'team_abc123' // Example teamId to restrict
      },
      {
        Number: '0501234569',
        Category: 'Gold',
        Code: 'ETS-3',
        Group: 'Group C',
        Passcode: '789012',
        TeamVisibility: ''
      }
    ];

    const ws = utils.json_to_sheet(sampleData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Numbers');
    
    // Set column widths
    ws['!cols'] = [
      { width: 15 }, // Number
      { width: 12 }, // Category
      { width: 10 }, // Code
      { width: 12 }, // Group
      { width: 12 }, // Passcode
      { width: 20 }  // TeamVisibility (optional teamId)
    ];

    writeFile(wb, 'sample_numbers_template.xlsx');
    toast.success('Sample Excel file downloaded successfully!');
  }, []);

  const validateExcelData = useCallback((data: ExcelRow[]) => {
    const errors: string[] = [];
    
    data.forEach((row, index) => {
      if (!validateNumber(row.Number)) {
        errors.push(`Row ${index + 1}: Invalid number format - ${row.Number}`);
      }

      const normalizedCategory = row.Category?.trim();
      if (!numberCategories.includes(normalizedCategory as typeof numberCategories[number])) {
        errors.push(`Row ${index + 1}: Invalid category - ${row.Category}`);
      }

      if (!row.Code.match(/^[A-Za-z0-9]+$/)) {
        errors.push(`Row ${index + 1}: Invalid code format - ${row.Code}`);
      }

      if (!row.Group || row.Group.trim() === '') {
        errors.push(`Row ${index + 1}: Group is required`);
      }

      if (!row.Passcode || row.Passcode.trim() === '') {
        errors.push(`Row ${index + 1}: Passcode is required`);
      }
    });

    return errors;
  }, [validateNumber]);

  const handleExcelUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setExcelErrors([]);
    setParsedExcelData([]);

    // Accept any Excel file format
    if (!file.name.match(/\.(xlsx|xls|xlsm|xlsb)$/i)) {
      toast.error('Please upload an Excel file');
      return;
    }

    setExcelFile(file);

    try {
      const data = await file.arrayBuffer();
      const workbook = read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = utils.sheet_to_json<ExcelRow>(worksheet);

      // Validate headers
      const requiredHeaders = ['Number', 'Category', 'Code', 'Group', 'Passcode'];
      const headers = Object.keys(jsonData[0] || {});
      const missingHeaders = requiredHeaders.filter(
        header => !headers.includes(header)
      );

      if (missingHeaders.length > 0) {
        setExcelErrors([`Missing required columns: ${missingHeaders.join(', ')}`]);
        toast.error('Excel validation failed. Please check the errors below.');
        return;
      }

      const validationErrors = validateExcelData(jsonData);
      if (validationErrors.length > 0) {
        setExcelErrors(validationErrors);
        toast.error('Excel validation failed. Please check the errors below.');
      } else {
        setParsedExcelData(jsonData);
        toast.success(`Successfully parsed ${jsonData.length} numbers`);
      }
    } catch (error) {
      console.error('Error parsing Excel:', error);
      toast.error('Failed to parse Excel file');
    }
  }, [validateExcelData]);

  const sleep = useCallback((ms: number) => new Promise(resolve => setTimeout(resolve, ms)), []);

  const handleUpload = async () => {
    if (parsedExcelData.length === 0) {
      toast.error('Please upload an Excel file first');
      return;
    }

    setLoading(true);
    // Load teams to validate TeamVisibility values (support both ID and Name)
    const teamsSnap = await getDocs(query(collection(db, 'teams')));
    const teamIdByName = new Map<string, string>();
    const validTeamIds = new Set<string>();
    teamsSnap.docs.forEach(t => {
      const data = t.data() as any;
      const name = (data?.name || data?.teamName || '').toString();
      if (name) teamIdByName.set(name.toLowerCase(), t.id);
      validTeamIds.add(t.id);
    });
    setUploadProgress({
      total: parsedExcelData.length,
      current: 0,
      success: 0,
      failed: 0,
      retries: 0
    });

    let successCount = 0;
    let errorCount = 0;
    let currentBatch = writeBatch(db);
    let operationsInCurrentBatch = 0;
    let totalBatches = Math.ceil(parsedExcelData.length / BATCH_SIZE);
    let completedBatches = 0;

    const failedNumbers: { number: string; error: string }[] = [];

    try {
      for (let i = 0; i < parsedExcelData.length; i++) {
        const row = parsedExcelData[i];
        const numberRef = doc(collection(db, 'numberPool'));
        let teamVisibility: string | undefined = (row.TeamVisibility || '').trim() || undefined;
        if (teamVisibility) {
          // Accept team ID directly, or resolve by name
          if (!validTeamIds.has(teamVisibility)) {
            const resolved = teamIdByName.get(teamVisibility.toLowerCase());
            teamVisibility = resolved || undefined;
          }
        }
        const numberData = {
          number: row.Number,
          category: row.Category.trim() as typeof numberCategories[number],
          code: row.Code,
          group: row.Group.trim(),
          status: 'open',
          visibleToFreelancers: visibleToFreelancers,
          passcode: row.Passcode.trim(),
          teamVisibility,
          lastStatusChange: new Date()
        };
        
        currentBatch.set(numberRef, numberData);
        operationsInCurrentBatch++;

        if (operationsInCurrentBatch === BATCH_SIZE || i === parsedExcelData.length - 1) {
          const success = await commitBatchWithRetry(currentBatch, parsedExcelData.slice(i - operationsInCurrentBatch + 1, i + 1));
          
          if (success) {
            completedBatches++;
            successCount += operationsInCurrentBatch;
          } else {
            errorCount += operationsInCurrentBatch;
            parsedExcelData.slice(i - operationsInCurrentBatch + 1, i + 1).forEach(n => {
              failedNumbers.push({ number: n.Number, error: 'Batch commit failed after retries' });
            });
          }
          
          currentBatch = writeBatch(db);
          operationsInCurrentBatch = 0;
        }

        setUploadProgress(prev => ({
          ...prev,
          current: i + 1,
          success: successCount,
          failed: errorCount
        }));
      }

      if (successCount > 0) {
        toast.success(`Successfully uploaded ${successCount} numbers in ${completedBatches} batches`);
        setParsedExcelData([]);
        setExcelFile(null);
      }
      if (errorCount > 0) {
        toast.error(`Failed to add ${errorCount} numbers`);
        console.error('Failed numbers:', failedNumbers);
        localStorage.setItem('failedNumbers', JSON.stringify(failedNumbers));
      }
    } catch (error) {
      console.error('Error in bulk upload:', error);
      toast.error('Failed to complete the upload process');
    } finally {
      setLoading(false);
    }
  };

  const commitBatchWithRetry = useCallback(async (batch: any, numbers: ExcelRow[]) => {
    let retries = MAX_RETRIES;
    let delay = INITIAL_RETRY_DELAY;

    while (retries >= 0) {
      try {
        await batch.commit();
        return true;
      } catch (error: any) {
        console.error(`Batch commit failed (retries left: ${retries}):`, error);
        
        if (retries === 0 || error.code === 'permission-denied') {
          return false;
        }

        setUploadProgress(prev => ({ ...prev, retries: prev.retries + 1 }));
        await sleep(delay);
        delay *= 2;
        retries--;
      }
    }
    return false;
  }, [sleep]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-2">
            Upload Numbers to Pool
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            Upload an Excel file containing numbers, categories, codes, and groups. Download the sample Excel file below to see the required format.
          </p>

          {/* Excel Upload */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload Excel File
            </label>
            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
              <div className="space-y-1 text-center">
                <FileUp className="mx-auto h-12 w-12 text-gray-400" />
                <div className="flex text-sm text-gray-600">
                  <label
                    htmlFor="excel-upload"
                    className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
                  >
                    <span>Upload an Excel file</span>
                    <input
                      id="excel-upload"
                      name="excel-upload"
                      type="file"
                      accept=".xlsx,.xls,.xlsm,.xlsb"
                      className="sr-only"
                      onChange={handleExcelUpload}
                    />
                  </label>
                  <p className="pl-1">or drag and drop</p>
                </div>
                <p className="text-xs text-gray-500">
                  Excel files (.xlsx, .xls, .xlsm, .xlsb)
                </p>
              </div>
            </div>
            
            {/* Download Sample Button */}
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={downloadSampleExcel}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Sample Excel
              </button>
            </div>
          </div>

          {/* Excel Validation Errors */}
          {excelErrors.length > 0 && (
            <div className="mt-4 p-4 bg-red-50 rounded-md">
              <h4 className="text-sm font-medium text-red-800 mb-2">Excel Validation Errors:</h4>
              <ul className="list-disc list-inside text-sm text-red-700">
                {excelErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Numbers Preview */}
          {parsedExcelData.length > 0 && (
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-sm font-medium text-gray-700">
                  Excel Data Preview ({parsedExcelData.length} numbers)
                </h4>
                <button
                  onClick={() => {
                    setParsedExcelData([]);
                    setExcelFile(null);
                    setLastValidatedData('');
                  }}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Clear
                </button>
              </div>
              <div className="bg-gray-50 rounded-md p-3 max-h-60 overflow-y-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Number</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Group</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Passcode</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {parsedExcelData.map((row, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2 text-sm text-gray-500">{row.Number}</td>
                        <td className="px-3 py-2 text-sm text-gray-500">{row.Category}</td>
                        <td className="px-3 py-2 text-sm text-gray-500">{row.Code}</td>
                        <td className="px-3 py-2 text-sm text-gray-500">{row.Group}</td>
                        <td className="px-3 py-2 text-sm text-gray-500">{row.Passcode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Visibility Control */}
          {parsedExcelData.length > 0 && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center">
                <input
                  id="freelancer-visibility"
                  type="checkbox"
                  checked={visibleToFreelancers}
                  onChange={(e) => setVisibleToFreelancers(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                />
                <label htmlFor="freelancer-visibility" className="ml-2 block text-sm text-gray-900">
                  <span className="font-medium">Make numbers visible to freelancers immediately</span>
                  <p className="text-xs text-gray-600 mt-1">
                    If unchecked, numbers will be hidden from freelancers until you manually make them visible later.
                  </p>
                </label>
              </div>
            </div>
          )}


          {/* Upload Button */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleUpload}
              disabled={loading || parsedExcelData.length === 0}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Numbers
                </>
              )}
            </button>
          </div>
        </div>

        {/* Upload Progress */}
        {loading && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Uploading... ({uploadProgress.current} / {uploadProgress.total})
              </span>
              <div className="flex space-x-4">
                <span className="text-sm text-green-600">Success: {uploadProgress.success}</span>
                <span className="text-sm text-red-600">Failed: {uploadProgress.failed}</span>
                <span className="text-sm text-yellow-600">Retries: {uploadProgress.retries}</span>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-6 bg-blue-50 border-l-4 border-blue-400 p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <FileSpreadsheet className="h-5 w-5 text-blue-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Instructions</h3>
            <div className="mt-2 text-sm text-blue-700">
              <ul className="list-disc list-inside">
                <li>The Excel file must have these exact column headers:</li>
                <li className="ml-4">- Number (10 digits, no spaces or special characters)</li>
                <li className="ml-4">- Category (Must be: Standard, Silver, Silver plus, Gold, Gold plus, or Platinum)</li>
                <li className="ml-4">- Code (Alphanumeric characters only)</li>
                <li className="ml-4">- Group (Required field)</li>
                <li className="ml-4">- Passcode (Required field for number passcodes)</li>
                <li>Example row: 0551234567,Gold,ABC123,Group1,PASS123</li>
                <li>Numbers must be exactly 10 digits</li>
                <li>Categories are case-sensitive</li>
                <li>Passcode column is required - all numbers must have a passcode</li>
                <li>You can also add numbers one at a time using the single number input</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
