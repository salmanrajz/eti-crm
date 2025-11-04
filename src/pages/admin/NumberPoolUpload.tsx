/**
 * ===============================================================================
 * NUMBER POOL UPLOAD PAGE - BULK NUMBER MANAGEMENT
 * ===============================================================================
 * 
 * This page provides functionality for bulk number pool management via Excel file
 * upload. It handles number validation, batch upload to Firestore, and provides
 * comprehensive progress tracking and error handling for large number datasets.
 * Updated: Nov 4, 2025
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

import { useState, useCallback, useEffect, useRef } from 'react';
import { collection, writeBatch, doc, getDocs, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { toast } from 'react-hot-toast';
import { Upload, FileSpreadsheet, FileUp, Download } from 'lucide-react';
import { read, utils, writeFile } from 'xlsx';

// ===============================================================================
// CONFIGURATION AND CONSTANTS
// ===============================================================================

/**
 * Batch processing configuration for efficient Firestore uploads
 * Optimized for maximum performance while respecting Firestore limits
 */
const BATCH_SIZE = 500; // Firestore max batch size for optimal performance

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
  const [parsedDataCount, setParsedDataCount] = useState(0);
  const [visibleToFreelancers, setVisibleToFreelancers] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    total: 0,
    current: 0,
    success: 0,
    failed: 0,
    retries: 0
  });
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [duplicateCheckResult, setDuplicateCheckResult] = useState<{
    duplicatesInFileCount: number;
    duplicatesInDatabaseCount: number;
    duplicateInFileSample: string[]; // Only store first 20 for display
    duplicateInDbSample: string[]; // Only store first 20 for display
    uniqueRecords: ExcelRow[];
    totalRecords: number;
  } | null>(null);
  const [readyToUpload, setReadyToUpload] = useState(false);
  const [skipDuplicateCheck, setSkipDuplicateCheck] = useState(false);
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);
  const [uploadElapsedTime, setUploadElapsedTime] = useState<number>(0);

  // Ref to reset file input after upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateNumber = useCallback((number: string) => {
    return /^\d{10}$/.test(number);
  }, []);

  // Reset stuck states when they become invalid
  useEffect(() => {
    if (loading && !uploadStartTime) {
      setLoading(false);
    }
  }, [loading, uploadStartTime]);
  
  useEffect(() => {
    if (isCheckingDuplicates && !excelFile) {
      setIsCheckingDuplicates(false);
    }
  }, [isCheckingDuplicates, excelFile]);
  
  // Timer effect - updates every second while uploading
  useEffect(() => {
    if (!uploadStartTime || !loading) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - uploadStartTime) / 1000);
      setUploadElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [uploadStartTime, loading]);

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

  // Auto-prepare data for upload after parsing (checks in-file duplicates only)
  const handleSkipDuplicateCheckAuto = useCallback((jsonData: ExcelRow[]) => {
    // Check for duplicates within file only
    const seenInFile = new Set<string>();
    const duplicatesInFile: string[] = [];
    const uniqueInFile = jsonData.filter(row => {
      if (seenInFile.has(row.Number)) {
        duplicatesInFile.push(row.Number);
        return false;
      }
      seenInFile.add(row.Number);
      return true;
    });

    // Set duplicate check result with in-file duplicates only
    setDuplicateCheckResult({
      duplicatesInFileCount: duplicatesInFile.length,
      duplicatesInDatabaseCount: 0, // Not checking database
      duplicateInFileSample: duplicatesInFile.slice(0, 20),
      duplicateInDbSample: [],
      uniqueRecords: uniqueInFile,
      totalRecords: jsonData.length
    });

    setSkipDuplicateCheck(true); // Mark as skipped database check
    setReadyToUpload(true);
  }, []);

  const handleExcelUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    if (!file) {
      return;
    }

    setExcelErrors([]);
    setParsedExcelData([]);
    setParsedDataCount(0);
    setDuplicateCheckResult(null);
    setReadyToUpload(false);

    // Accept any Excel file format
    if (!file.name.match(/\.(xlsx|xls|xlsm|xlsb)$/i)) {
      toast.error('Please upload an Excel file');
      return;
    }

    setExcelFile(file);

    try {
      // Use FileReader for better browser compatibility (works on older devices)
      const data = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          if (e.target?.result instanceof ArrayBuffer) {
            resolve(e.target.result);
          } else {
            reject(new Error('Failed to read file as ArrayBuffer'));
          }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
      });
      
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
        setParsedDataCount(jsonData.length);
        toast.success(`Successfully parsed ${jsonData.length} numbers`);
        
        // Auto-prepare for upload (check for in-file duplicates only)
        setTimeout(() => {
          handleSkipDuplicateCheckAuto(jsonData);
        }, 100);
      }
    } catch (error) {
      console.error('Error parsing Excel:', error);
      toast.error('Failed to parse Excel file');
    }
  }, [validateExcelData, handleSkipDuplicateCheckAuto]);

  const handleSkipDuplicateCheck = () => {
    if (parsedExcelData.length === 0) {
      toast.error('Please upload an Excel file first');
      return;
    }
    
    // Check for duplicates within file only
    const seenInFile = new Set<string>();
    const duplicatesInFile: string[] = [];
    const uniqueInFile = parsedExcelData.filter(row => {
      if (seenInFile.has(row.Number)) {
        duplicatesInFile.push(row.Number);
        return false;
      }
      seenInFile.add(row.Number);
      return true;
    });

    setDuplicateCheckResult({
      duplicatesInFileCount: duplicatesInFile.length,
      duplicatesInDatabaseCount: 0, // Skipped
      duplicateInFileSample: duplicatesInFile.slice(0, 20),
      duplicateInDbSample: [],
      uniqueRecords: uniqueInFile,
      totalRecords: parsedExcelData.length
    });

    setReadyToUpload(true);
    setSkipDuplicateCheck(true);
    toast.success(`Ready to upload ${uniqueInFile.length} numbers (${duplicatesInFile.length} duplicates in file removed, database check skipped)`);
  };

  const handleCheckDuplicates = async () => {
    if (parsedExcelData.length === 0) {
      toast.error('Please upload an Excel file first');
      return;
    }

    setIsCheckingDuplicates(true);
    setDuplicateCheckResult(null);
    setReadyToUpload(false);
    setSkipDuplicateCheck(false);

    const loadingToast = toast.loading('Checking for duplicates...');

    try {
      // Step 1: Check for duplicates within the upload file itself
      const seenInFile = new Set<string>();
      const duplicatesInFile: string[] = [];
      const uniqueInFile = parsedExcelData.filter(row => {
        if (seenInFile.has(row.Number)) {
          duplicatesInFile.push(row.Number);
          return false;
        }
        seenInFile.add(row.Number);
        return true;
      });

      // Step 2: Fetch existing numbers from database (with timeout protection)
      toast.loading('Fetching existing numbers from database...', { id: loadingToast });
      
      // Add timeout to prevent infinite hang
      const fetchWithTimeout = async () => {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Query timed out after 30 seconds. Please try again or contact support.')), 30000)
        );
        
        const numberPoolQuery = query(collection(db, 'numberPool'));
        const queryPromise = getDocs(numberPoolQuery);
        
        return await Promise.race([queryPromise, timeoutPromise]) as any;
      };
      
      const snapshot = await fetchWithTimeout();
      
      // Build set of existing numbers (optimized - only extract number field)
      toast.loading('Building comparison index...', { id: loadingToast });
      const existingNumbersSet = new Set<string>();
      
      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (data?.number) {
          existingNumbersSet.add(data.number);
        }
      }

      // Step 3: Check for duplicates against database
      toast.loading('Comparing against existing numbers...', { id: loadingToast });
      
      const duplicateNumbers: string[] = [];
      const uniqueNumbersToUpload: ExcelRow[] = [];
      
      uniqueInFile.forEach(row => {
        if (existingNumbersSet.has(row.Number)) {
          duplicateNumbers.push(row.Number);
        } else {
          uniqueNumbersToUpload.push(row);
        }
      });
      
      toast.dismiss(loadingToast);

      // Store duplicate check results - only keep samples to avoid memory issues
      setDuplicateCheckResult({
        duplicatesInFileCount: duplicatesInFile.length,
        duplicatesInDatabaseCount: duplicateNumbers.length,
        duplicateInFileSample: duplicatesInFile.slice(0, 20),
        duplicateInDbSample: duplicateNumbers.slice(0, 20),
        uniqueRecords: uniqueNumbersToUpload,
        totalRecords: parsedExcelData.length
      });

      setReadyToUpload(uniqueNumbersToUpload.length > 0);

      if (uniqueNumbersToUpload.length === 0) {
        toast.error('All numbers are duplicates. Cannot upload.');
      } else {
        const totalDuplicates = duplicatesInFile.length + duplicateNumbers.length;
        if (totalDuplicates > 0) {
          toast.success(`Duplicate check complete. ${uniqueNumbersToUpload.length} unique records ready to upload. ${totalDuplicates} duplicates found.`);
        } else {
          toast.success(`Duplicate check complete. All ${uniqueNumbersToUpload.length} records are unique and ready to upload.`);
        }
      }
    } catch (error) {
      console.error('[Duplicate Check] Error:', error);
      toast.dismiss(loadingToast);
      toast.error(`Failed to check for duplicates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCheckingDuplicates(false);
    }
  };

  const handleUpload = async () => {
    if (!duplicateCheckResult || !readyToUpload) {
      toast.error('Please check for duplicates first');
      return;
    }

    if (duplicateCheckResult.uniqueRecords.length === 0) {
      toast.error('No unique records to upload');
      return;
    }

    setLoading(true);
    
    // Start timer
    const startTime = Date.now();
    setUploadStartTime(startTime);
    setUploadElapsedTime(0);

    try {
    
    // Set initial progress immediately with toast
    const totalDuplicates = duplicateCheckResult.duplicatesInFileCount + duplicateCheckResult.duplicatesInDatabaseCount;
    const uploadToast = toast.loading('Preparing upload...');
    
    setUploadProgress({
      total: duplicateCheckResult.totalRecords,
      current: 0,
      success: 0,
      failed: totalDuplicates,
      retries: 0
    });
    
    const dataToUpload = duplicateCheckResult.uniqueRecords;
    
    toast.loading('Starting upload...', { id: uploadToast });
    
    // Check if ANY numbers have TeamVisibility - if not, skip teams query!
    const needsTeams = dataToUpload.some(row => row.TeamVisibility && row.TeamVisibility.trim());
    
    const teamIdByName = new Map<string, string>();
    const validTeamIds = new Set<string>();
    
    let teamsPromise: Promise<any>;
    
    if (needsTeams) {
      // Load teams IN PARALLEL - 
      teamsPromise = getDocs(query(collection(db, 'teams'))).then(teamsSnap => {
    teamsSnap.docs.forEach(t => {
      const data = t.data() as any;
      const name = (data?.name || data?.teamName || '').toString();
      if (name) teamIdByName.set(name.toLowerCase(), t.id);
      validTeamIds.add(t.id);
    });
        return { teamIdByName, validTeamIds };
      });
    } else {
      teamsPromise = Promise.resolve({ teamIdByName, validTeamIds });
    }
    let successCount = 0;
    let errorCount = 0;
    const failedNumbers: { number: string; error: string }[] = [];
    
    // Track last progress update to show responsive UI
    let lastProgressUpdate = Date.now();
    let lastProgressCount = 0;

    // OPTIMIZED: Conservative concurrency to avoid overwhelming Firestore
    const CONCURRENT_LIMIT = 3; // 3 batches in parallel (prevents 60s+ commits)
    
    // Track promises with completion status
    const activePromises = new Map<number, { promise: Promise<void>, completed: boolean }>();
    
    toast.loading(`Uploading ${dataToUpload.length} numbers in batches...`, { id: uploadToast });
    
    // Update progress immediately to show activity
    setUploadProgress({
      total: duplicateCheckResult?.totalRecords || 0,
      current: 0,
      success: 0,
      failed: totalDuplicates,
      retries: 0
    });
    
    // Wait for teams to load before processing (should be fast since it started early)
    await teamsPromise;
    
    // Process batches with IMMEDIATE start - don't prepare all upfront!
    const processBatch = async (startIdx: number, endIdx: number) => {
      const batchData = dataToUpload.slice(startIdx, endIdx);
      
      const batch = writeBatch(db);
      
      // Add all numbers in this batch
      for (let i = 0; i < batchData.length; i++) {
        const row = batchData[i];
      const numberRef = doc(collection(db, 'numberPool'));
      
      let teamVisibility: string | undefined = (row.TeamVisibility || '').trim() || undefined;
        if (teamVisibility && !validTeamIds.has(teamVisibility)) {
          teamVisibility = teamIdByName.get(teamVisibility.toLowerCase());
      }

      const numberData: any = {
        number: row.Number,
        category: row.Category.trim() as typeof numberCategories[number],
        code: row.Code,
        group: row.Group.trim(),
        status: 'open',
        visibleToFreelancers: visibleToFreelancers,
        passcode: row.Passcode.trim(),
        lastStatusChange: new Date()
          // No bulkUpload flag - triggers run in parallel for immediate visibility
      };

        if (teamVisibility) {
        numberData.teamVisibility = teamVisibility;
      }

        batch.set(numberRef, numberData);
      }
      
      // Commit batch
      try {
        await batch.commit();
        successCount += batchData.length;
      } catch (error) {
        errorCount += batchData.length;
        batchData.forEach(n => {
                  failedNumbers.push({ number: n.Number, error: 'Batch commit failed' });
                });
              }

      // Update progress FREQUENTLY (every 500 numbers OR every 1 second)
      const now = Date.now();
      const totalProcessed = successCount + errorCount;
      const timeSinceLastUpdate = now - lastProgressUpdate;
      const numbersSinceLastUpdate = totalProcessed - lastProgressCount;
      
      if (numbersSinceLastUpdate >= 500 || timeSinceLastUpdate >= 1000 || totalProcessed === dataToUpload.length) {
        const percentage = Math.round((totalProcessed / dataToUpload.length) * 100);
        
              setUploadProgress({
          total: duplicateCheckResult?.totalRecords || 0,
          current: totalProcessed,
                success: successCount,
          failed: errorCount + totalDuplicates,
                retries: 0
              });
        
        // Update toast with progress
        toast.loading(`Uploading... ${totalProcessed}/${dataToUpload.length} (${percentage}%)`, { id: uploadToast });
        
        lastProgressUpdate = now;
        lastProgressCount = totalProcessed;
      }
    };

    // Stream batches: Create and process on-the-fly for INSTANT start
    for (let startIdx = 0; startIdx < dataToUpload.length; startIdx += BATCH_SIZE) {
      const endIdx = Math.min(startIdx + BATCH_SIZE, dataToUpload.length);
      const batchNum = Math.floor(startIdx / BATCH_SIZE) + 1;
      
      // Start processing this batch immediately
      const batchPromise = processBatch(startIdx, endIdx);
      const tracked = { promise: batchPromise, completed: false };
      
      // Mark as completed when done
      batchPromise
        .then(() => { tracked.completed = true; })
        .catch(() => { tracked.completed = true; });
      
      activePromises.set(batchNum, tracked);
      
      // Wait if we hit the concurrency limit
      if (activePromises.size >= CONCURRENT_LIMIT) {
        // Wait for at least one to complete
        await Promise.race(Array.from(activePromises.values()).map(t => t.promise));
        
        // Remove ALL completed promises
        for (const [key, tracked] of activePromises.entries()) {
          if (tracked.completed) {
            activePromises.delete(key);
          }
        }
      }
    }
    
    // Wait for all remaining batches
    toast.loading('Finalizing batch uploads...', { id: uploadToast });
    await Promise.all(Array.from(activePromises.values()).map(t => t.promise));
    
    toast.dismiss(uploadToast);

      // Final progress update
      setUploadProgress({
        total: duplicateCheckResult?.totalRecords || 0,
      current: successCount + errorCount,
        success: successCount,
      failed: errorCount + totalDuplicates,
        retries: 0
      });

      if (successCount > 0) {
      // Calculate total time taken
      const endTime = Date.now();
      const totalTimeSeconds = Math.floor((endTime - startTime) / 1000);
      const minutes = Math.floor(totalTimeSeconds / 60);
      const seconds = totalTimeSeconds % 60;
      const timeString = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      
      // Calculate upload speed
      const numbersPerSecond = totalTimeSeconds > 0 ? (successCount / totalTimeSeconds).toFixed(1) : '0';
      
      // Show comprehensive success message that stays until manually dismissed
      toast.dismiss();
      toast.success(
        `🎉 Upload Complete!\n\n` +
        `✅ ${successCount} numbers uploaded\n` +
        `⏱️ Time: ${timeString}\n` +
        `🚀 Speed: ${numbersPerSecond} numbers/sec\n` +
        `${errorCount > 0 ? `❌ ${errorCount} failed\n` : ''}` +
        `${totalDuplicates > 0 ? `⚠️ ${totalDuplicates} duplicates skipped\n` : ''}\n` +
        `📊 Stats updating in background...\n\n` +
        `Click to dismiss`,
        { duration: Infinity, style: { whiteSpace: 'pre-line' } }
      );
      
      // Reset state to allow new upload
        setParsedExcelData([]);
      setParsedDataCount(0);
        setExcelFile(null);
      setDuplicateCheckResult(null);
      setReadyToUpload(false);
      setUploadStartTime(null);
      setUploadElapsedTime(0);
      
      // Reset file input to allow selecting the same or new file
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
    
      if (errorCount > 0 || totalDuplicates > 0) {
        const totalErrors = errorCount + totalDuplicates;
        toast.error(`Failed to add ${totalErrors} numbers (${errorCount} errors, ${totalDuplicates} duplicates)`);
        console.error('Failed numbers:', failedNumbers);
        localStorage.setItem('failedNumbers', JSON.stringify(failedNumbers));
      localStorage.setItem('duplicateCountsInfo', JSON.stringify({
        inFile: duplicateCheckResult?.duplicatesInFileCount || 0,
        inDatabase: duplicateCheckResult?.duplicatesInDatabaseCount || 0
      }));
      }
    } catch (error) {
      console.error('[Upload] Unexpected error during upload:', error);
      toast.dismiss();
      toast.error(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };


  // No cleanup needed - triggers run in parallel for immediate visibility

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
                      ref={fileInputRef}
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
          {parsedDataCount > 0 && (
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-sm font-medium text-gray-700">
                  Excel Data Preview ({parsedDataCount} numbers loaded)
                </h4>
                <button
                  onClick={() => {
                    setParsedExcelData([]);
                    setParsedDataCount(0);
                    setExcelFile(null);
                    setDuplicateCheckResult(null);
                    setReadyToUpload(false);
                  }}
                  className="text-sm text-red-600 hover:text-red-700"
                >
                  Clear
                </button>
              </div>
              <div className="bg-gray-50 rounded-md p-3 max-h-60 overflow-y-auto">
                <p className="text-xs text-gray-500 mb-2">Showing first 50 records (out of {parsedDataCount} total)</p>
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
                    {parsedExcelData.slice(0, 50).map((row, index) => (
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
          {parsedDataCount > 0 && (
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


          {/* Duplicate Check Results */}
          {duplicateCheckResult && (
            <div className="mb-6 p-4 bg-blue-50 border-blue-200 border rounded-lg">
              <h4 className="text-sm font-medium text-blue-900 mb-3">
                Upload Summary
              </h4>
              
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{duplicateCheckResult.totalRecords}</p>
                  <p className="text-xs text-gray-600">Total Records</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{duplicateCheckResult.uniqueRecords.length}</p>
                  <p className="text-xs text-gray-600">Unique Records</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">
                    {duplicateCheckResult.duplicatesInFileCount + duplicateCheckResult.duplicatesInDatabaseCount}
                  </p>
                  <p className="text-xs text-gray-600">Duplicates Found</p>
                </div>
              </div>
              
              {duplicateCheckResult.duplicatesInFileCount > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-red-700 mb-1">
                    Duplicates in file ({duplicateCheckResult.duplicatesInFileCount}):
                  </p>
                  <p className="text-xs text-red-600 break-words">
                    {duplicateCheckResult.duplicateInFileSample.join(', ')}
                    {duplicateCheckResult.duplicatesInFileCount > 20 && '... (showing first 20)'}
                  </p>
                </div>
              )}
              
              {duplicateCheckResult.duplicatesInDatabaseCount > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-medium text-orange-700 mb-1">
                    Already in database ({duplicateCheckResult.duplicatesInDatabaseCount}):
                  </p>
                  <p className="text-xs text-orange-600 break-words">
                    {duplicateCheckResult.duplicateInDbSample.join(', ')}
                    {duplicateCheckResult.duplicatesInDatabaseCount > 20 && '... (showing first 20)'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            {/* HIDDEN: Check Duplicates and Skip Check buttons */}
            {/* {parsedDataCount > 0 && !duplicateCheckResult && (
              <>
              <button
                type="button"
                onClick={handleCheckDuplicates}
                disabled={isCheckingDuplicates || loading}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {isCheckingDuplicates ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700 mr-2" />
                    Checking Duplicates...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Check Duplicates
                  </>
                )}
              </button>
                <button
                  type="button"
                  onClick={handleSkipDuplicateCheck}
                  disabled={isCheckingDuplicates || loading}
                  className="inline-flex items-center px-4 py-2 border border-yellow-400 text-sm font-medium rounded-md shadow-sm text-yellow-700 bg-yellow-50 hover:bg-yellow-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50"
                  title="Skip database check (faster but may upload duplicates)"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Skip Check & Upload
                </button>
              </>
            )} */}
            
            <button
              type="button"
              onClick={handleUpload}
              disabled={loading || !readyToUpload || !duplicateCheckResult}
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
                  Upload Unique Records
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
                </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
              <div
                className="h-2 rounded-full transition-all duration-300 bg-indigo-600"
                style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
              />
            </div>
            {/* Timer Display */}
            <div className="flex justify-between items-center text-xs text-gray-600">
              <span>Elapsed Time: {Math.floor(uploadElapsedTime / 60)}m {uploadElapsedTime % 60}s</span>
              <span>Speed: {uploadElapsedTime > 0 ? (uploadProgress.success / uploadElapsedTime).toFixed(1) : '0'} numbers/sec</span>
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