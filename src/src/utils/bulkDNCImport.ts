/**
 * ===============================================================================
 * BULK DNC IMPORT UTILITY - CLIENT-SIDE BULK IMPORT HELPER
 * ===============================================================================
 * 
 * This utility provides client-side functionality for bulk importing DNC records.
 * It handles file parsing, data validation, chunking, and progress tracking
 * for large-scale DNC data imports.
 * 
 * FEATURES:
 * - CSV/Excel file parsing
 * - Data validation and cleaning
 * - Chunked processing for large files
 * - Progress tracking and reporting
 * - Error handling and retry logic
 * - Duplicate detection
 * 
 * USAGE:
 * Import this utility in components that need bulk DNC import functionality.
 * ===============================================================================
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';

export interface DNCImportRecord {
  number: string;
  reason?: string;
  source?: string;
}

export interface ImportProgress {
  totalRecords: number;
  processedRecords: number;
  successfulRecords: number;
  failedRecords: number;
  duplicateRecords: number;
  currentChunk: number;
  totalChunks: number;
  isProcessing: boolean;
  errors: string[];
}

export interface ImportResult {
  success: boolean;
  totalRecords: number;
  successfulRecords: number;
  failedRecords: number;
  duplicateRecords: number;
  processingTime: number;
  errors: string[];
  message: string;
}

// Configuration constants
const CHUNK_SIZE = 5000; // Records per chunk
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const SUPPORTED_FORMATS = ['.csv', '.xlsx', '.xls', '.sql'];

/**
 * ===============================================================================
 * FILE PARSER
 * ===============================================================================
 * 
 * Parses CSV or Excel files and extracts DNC records
 */
export async function parseDNCFile(file: File): Promise<DNCImportRecord[]> {
  return new Promise((resolve, reject) => {
    // Validate file
    if (!isValidFile(file)) {
      reject(new Error('Invalid file format or size'));
      return;
    }

    const fileExtension = getFileExtension(file.name);
    
    if (fileExtension === '.csv') {
      parseCSVFile(file, resolve, reject);
    } else if (fileExtension === '.xlsx' || fileExtension === '.xls') {
      parseExcelFile(file, resolve, reject);
    } else if (fileExtension === '.sql') {
      parseSQLFile(file, resolve, reject);
    } else {
      reject(new Error('Unsupported file format'));
    }
  });
}

/**
 * ===============================================================================
 * SQL FILE PARSER
 * ===============================================================================
 * Supports SQL like:
 * INSERT INTO `dnclists` (`number`) VALUES
 * ('0500353322'),
 * ('0500478855');
 */
function parseSQLFile(
  file: File,
  resolve: (records: DNCImportRecord[]) => void,
  reject: (error: Error) => void
) {
  const reader = new FileReader();

  reader.onload = () => {
    try {
      const text = (reader.result as string) || '';

      // Extract only VALUES tuples, ignoring column header parentheses after INSERT INTO
      // Strategy: find all parenthesized groups and keep those whose FIRST field is a quoted token containing digits
      const tupleRegex = /\(([^()]*)\)/g;
      const records: DNCImportRecord[] = [];
      let match: RegExpExecArray | null;

      while ((match = tupleRegex.exec(text)) !== null) {
        const inner = match[1];
        const firstField = inner.split(',')[0]?.trim() || '';
        // Strip surrounding quotes if present
        const unquoted = firstField.replace(/^\s*["'`](.*?)["'`]\s*$/, '$1');
        // Skip if the unquoted token has no digits (filters out headers like `number`)
        if (!/\d/.test(unquoted)) continue;
        // Basic sanity: first character should be + or digit or leading 0
        if (!/^[+\d]/.test(unquoted)) continue;

        records.push({ number: unquoted, source: 'bulk_import' });
      }

      // Fallback: also look for bare quoted numbers in VALUES list
      if (records.length === 0) {
        const quotedNumRegex = /['"][+\d]{7,20}['"]/g;
        const matches = text.match(quotedNumRegex) || [];
        matches.forEach((m) => {
          const num = m.replace(/['"]/g, '');
          records.push({ number: num, source: 'bulk_import' });
        });
      }

      if (records.length === 0) {
        reject(new Error('No numbers found in SQL file. Expected INSERT VALUES with numbers.'));
        return;
      }

      resolve(records);
    } catch (error) {
      reject(new Error('Error parsing SQL file: ' + (error instanceof Error ? error.message : 'Unknown error')));
    }
  };

  reader.onerror = () => {
    reject(new Error('Error reading SQL file'));
  };

  reader.readAsText(file);
}

/**
 * ===============================================================================
 * CSV FILE PARSER
 * ===============================================================================
 */
function parseCSVFile(
  file: File, 
  resolve: (records: DNCImportRecord[]) => void, 
  reject: (error: Error) => void
) {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.toLowerCase().trim(),
    complete: (results) => {
      try {
        const records = results.data.map((row: any) => {
          // Map common column names to our structure
          const number = row.phone || row.number || row.phone_number || row.contact || '';
          const reason = row.reason || row.notes || row.comment || '';
          
          return {
            number: number.toString().trim(),
            reason: reason.toString().trim() || undefined,
            source: 'bulk_import'
          };
        }).filter(record => record.number); // Filter out empty numbers

        resolve(records);
      } catch (error) {
        reject(new Error('Error parsing CSV file: ' + (error instanceof Error ? error.message : 'Unknown error')));
      }
    },
    error: (error) => {
      reject(new Error('CSV parsing error: ' + error.message));
    }
  });
}

/**
 * ===============================================================================
 * EXCEL FILE PARSER
 * ===============================================================================
 */
function parseExcelFile(
  file: File, 
  resolve: (records: DNCImportRecord[]) => void, 
  reject: (error: Error) => void
) {
  const reader = new FileReader();
  
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      
      // Get the first worksheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      if (jsonData.length < 2) {
        reject(new Error('Excel file must have at least a header row and one data row'));
        return;
      }
      
      // Get headers (first row)
      const headers = jsonData[0] as string[];
      const headerMap = createHeaderMap(headers);
      
      // Process data rows
      const records = jsonData.slice(1).map((row: any[]) => {
        const number = row[headerMap.number] || '';
        const reason = row[headerMap.reason] || '';
        
        return {
          number: number.toString().trim(),
          reason: reason.toString().trim() || undefined,
          source: 'bulk_import'
        };
      }).filter(record => record.number); // Filter out empty numbers

      resolve(records);
    } catch (error) {
      reject(new Error('Error parsing Excel file: ' + (error instanceof Error ? error.message : 'Unknown error')));
    }
  };
  
  reader.onerror = () => {
    reject(new Error('Error reading Excel file'));
  };
  
  reader.readAsArrayBuffer(file);
}

/**
 * ===============================================================================
 * HEADER MAPPING
 * ===============================================================================
 * 
 * Creates a mapping of Excel headers to our data structure
 */
function createHeaderMap(headers: string[]): { number: number; reason: number } {
  const headerMap = { number: -1, reason: -1 };
  
  headers.forEach((header, index) => {
    const lowerHeader = header.toLowerCase().trim();
    
    if (lowerHeader.includes('phone') || lowerHeader.includes('number') || lowerHeader.includes('contact')) {
      headerMap.number = index;
    } else if (lowerHeader.includes('reason') || lowerHeader.includes('note') || lowerHeader.includes('comment')) {
      headerMap.reason = index;
    }
  });
  
  if (headerMap.number === -1) {
    throw new Error('No phone number column found. Please ensure your file has a column with phone numbers.');
  }
  
  return headerMap;
}

/**
 * ===============================================================================
 * BULK IMPORT PROCESSOR
 * ===============================================================================
 * 
 * Processes DNC records in chunks and uploads to the server
 */
export async function processBulkImport(
  records: DNCImportRecord[],
  onProgress?: (progress: ImportProgress) => void,
  onComplete?: (result: ImportResult) => void
): Promise<ImportResult> {
  const startTime = Date.now();
  const chunks = chunkArray(records, CHUNK_SIZE);
  
  const progress: ImportProgress = {
    totalRecords: records.length,
    processedRecords: 0,
    successfulRecords: 0,
    failedRecords: 0,
    duplicateRecords: 0,
    currentChunk: 0,
    totalChunks: chunks.length,
    isProcessing: true,
    errors: []
  };

  try {
    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      progress.currentChunk = i + 1;
      
      try {
        const chunkResult = await importChunk(chunks[i]);
        
        progress.processedRecords += chunks[i].length;
        progress.successfulRecords += chunkResult.successfulRecords;
        progress.failedRecords += chunkResult.failedRecords;
        progress.duplicateRecords += chunkResult.duplicateRecords;
        progress.errors.push(...chunkResult.errors);
        
        // Update progress
        if (onProgress) {
          onProgress({ ...progress });
        }
        
        // Show progress toast
        toast.success(`Processed chunk ${i + 1}/${chunks.length} (${progress.successfulRecords}/${progress.totalRecords} successful)`);
        
      } catch (error) {
        const errorMessage = `Error processing chunk ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        progress.errors.push(errorMessage);
        progress.failedRecords += chunks[i].length;
        
        console.error(errorMessage, error);
        toast.error(errorMessage);
      }
    }

    progress.isProcessing = false;
    const processingTime = Date.now() - startTime;
    
    const result: ImportResult = {
      success: progress.failedRecords === 0,
      totalRecords: progress.totalRecords,
      successfulRecords: progress.successfulRecords,
      failedRecords: progress.failedRecords,
      duplicateRecords: progress.duplicateRecords,
      processingTime,
      errors: progress.errors,
      message: `Import completed: ${progress.successfulRecords}/${progress.totalRecords} records processed successfully`
    };

    if (onComplete) {
      onComplete(result);
    }

    return result;

  } catch (error) {
    progress.isProcessing = false;
    
    const result: ImportResult = {
      success: false,
      totalRecords: progress.totalRecords,
      successfulRecords: progress.successfulRecords,
      failedRecords: progress.failedRecords,
      duplicateRecords: progress.duplicateRecords,
      processingTime: Date.now() - startTime,
      errors: [...progress.errors, error instanceof Error ? error.message : 'Unknown error'],
      message: 'Import failed'
    };

    if (onComplete) {
      onComplete(result);
    }

    return result;
  }
}

/**
 * ===============================================================================
 * CHUNK IMPORT
 * ===============================================================================
 * 
 * Imports a single chunk of records to the server
 */
async function importChunk(chunk: DNCImportRecord[]): Promise<{
  successfulRecords: number;
  failedRecords: number;
  duplicateRecords: number;
  errors: string[];
}> {
  try {
    // Get the function URL from environment or use same-origin rewrite
    const functionUrl = import.meta.env.VITE_BULK_IMPORT_URL || 
      '/api/bulk-dnc';
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: chunk,
        batchSize: 500,
        source: 'bulk_import',
        addedBy: 'admin', // You might want to get this from auth context
        dryRun: false
      })
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    return {
      successfulRecords: result.successfulRecords || 0,
      failedRecords: result.failedRecords || 0,
      duplicateRecords: result.duplicateRecords || 0,
      errors: result.errors || []
    };

  } catch (error) {
    console.error('Chunk import error:', error);
    return {
      successfulRecords: 0,
      failedRecords: chunk.length,
      duplicateRecords: 0,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

/**
 * ===============================================================================
 * UTILITY FUNCTIONS
 * ===============================================================================
 */

function isValidFile(file: File): boolean {
  const extension = getFileExtension(file.name);
  const isValidFormat = SUPPORTED_FORMATS.includes(extension);
  const isValidSize = file.size <= MAX_FILE_SIZE;
  
  return isValidFormat && isValidSize;
}

function getFileExtension(filename: string): string {
  return filename.toLowerCase().substring(filename.lastIndexOf('.'));
}

function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * ===============================================================================
 * VALIDATION FUNCTIONS
 * ===============================================================================
 */

export function validateDNCNumber(number: string): boolean {
  // Clean the number
  const cleanNumber = number.replace(/[^\d+]/g, '');
  
  // Check if it's a valid UAE number (starts with +971 or 971 or 05)
  const uaePattern = /^(\+971|971|05)\d{8,9}$/;
  
  return uaePattern.test(cleanNumber);
}

export function cleanDNCNumber(number: string): string {
  // Remove all non-digit characters except +
  const cleanNumber = number.replace(/[^\d+]/g, '');
  // Preserve original format (do not auto-convert local 05... to +971)
  // This keeps numbers exactly as uploaded after basic cleaning
  return cleanNumber;
}

/**
 * ===============================================================================
 * SAMPLE DATA GENERATOR
 * ===============================================================================
 * 
 * Generates sample data for testing purposes
 */
export function generateSampleData(count: number): DNCImportRecord[] {
  const records: DNCImportRecord[] = [];
  const reasons = [
    'Customer requested to be removed',
    'Invalid number',
    'Business closed',
    'Wrong number',
    'Do not call request'
  ];

  for (let i = 0; i < count; i++) {
    const randomNumber = Math.floor(Math.random() * 9000000000) + 1000000000;
    const phoneNumber = `+971${randomNumber}`;
    
    records.push({
      number: phoneNumber,
      reason: reasons[Math.floor(Math.random() * reasons.length)],
      source: 'bulk_import'
    });
  }

  return records;
}
