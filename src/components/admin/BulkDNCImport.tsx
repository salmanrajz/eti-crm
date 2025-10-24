/**
 * ===============================================================================
 * BULK DNC IMPORT COMPONENT - ADMIN BULK IMPORT INTERFACE
 * ===============================================================================
 * 
 * This component provides a comprehensive interface for bulk importing DNC records.
 * It supports CSV and Excel file uploads, progress tracking, and error handling
 * for large-scale DNC data imports.
 * 
 * FEATURES:
 * - File upload with drag-and-drop support
 * - CSV and Excel file parsing
 * - Progress tracking with real-time updates
 * - Error handling and reporting
 * - Sample data generation for testing
 * - Validation and data cleaning
 * - Chunked processing for large files
 * 
 * USAGE:
 * This component is used in the admin dashboard for bulk DNC imports.
 * ===============================================================================
 */

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Upload, 
  FileText, 
  Download, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  Database,
  FileSpreadsheet,
  Users,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { 
  parseDNCFile, 
  processBulkImport, 
  generateSampleData,
  validateDNCNumber,
  cleanDNCNumber,
  DNCImportRecord,
  ImportProgress,
  ImportResult
} from '../../utils/bulkDNCImport';

interface BulkDNCImportProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BulkDNCImport({ isOpen, onClose }: BulkDNCImportProps) {
  // ===============================================================================
  // STATE MANAGEMENT
  // ===============================================================================
  
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState<DNCImportRecord[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [duplicateNumbers, setDuplicateNumbers] = useState<string[]>([]);
  const [showSampleData, setShowSampleData] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // ===============================================================================
  // FILE HANDLING
  // ===============================================================================

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFile = async (selectedFile: File) => {
    try {
      // Validate file
      if (!selectedFile.name.match(/\.(csv|xlsx|xls|sql)$/i)) {
        toast.error('Please select a CSV, Excel, or SQL file');
        return;
      }

      if (selectedFile.size > 50 * 1024 * 1024) { // 50MB limit
        toast.error('File size must be less than 50MB');
        return;
      }

      setFile(selectedFile);
      setRecords([]);
      setValidationErrors([]);
      setDuplicateNumbers([]);
      setResult(null);

      toast.loading('Parsing file...', { id: 'parsing' });

      // Parse file
      const parsedRecords = await parseDNCFile(selectedFile);
      
      // Validate records and check for duplicates within the file
      const errors: string[] = [];
      const validRecords: DNCImportRecord[] = [];
      const duplicates: string[] = [];
      const seenNumbers = new Set<string>();

      parsedRecords.forEach((record, index) => {
        const cleanNumber = cleanDNCNumber(record.number);
        
        if (!validateDNCNumber(record.number)) {
          errors.push(`Row ${index + 1}: Invalid phone number format - ${record.number}`);
        } else if (seenNumbers.has(cleanNumber)) {
          duplicates.push(`Row ${index + 1}: Duplicate in file - ${record.number}`);
        } else {
          seenNumbers.add(cleanNumber);
          validRecords.push({
            ...record,
            number: cleanNumber
          });
        }
      });

      setRecords(validRecords);
      setValidationErrors(errors);
      setDuplicateNumbers(duplicates);

      toast.dismiss('parsing');
      
      if (errors.length > 0 || duplicates.length > 0) {
        toast.error(`Found ${errors.length} validation errors and ${duplicates.length} duplicates. Please check the details.`);
      } else {
        toast.success(`Successfully parsed ${validRecords.length} records`);
      }

    } catch (error) {
      toast.dismiss('parsing');
      toast.error(`Error parsing file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('File parsing error:', error);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // ===============================================================================
  // IMPORT PROCESSING
  // ===============================================================================

  const handleImport = async () => {
    if (records.length === 0) {
      toast.error('No records to import');
      return;
    }

    setIsProcessing(true);
    setResult(null);

    try {
      const importResult = await processBulkImport(
        records,
        (progress) => setProgress(progress),
        (result) => {
          setResult(result);
          setIsProcessing(false);
        }
      );

      if (importResult.success) {
        toast.success(`Import completed successfully! ${importResult.successfulRecords} records imported.`);
      } else {
        toast.error(`Import completed with errors. ${importResult.failedRecords} records failed.`);
      }

    } catch (error) {
      setIsProcessing(false);
      toast.error(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('Import error:', error);
    }
  };

  // ===============================================================================
  // SAMPLE DATA GENERATION
  // ===============================================================================

  const handleGenerateSample = () => {
    const sampleCount = 100;
    const sampleRecords = generateSampleData(sampleCount);
    
    setRecords(sampleRecords);
    setFile(null);
    setValidationErrors([]);
    setDuplicateNumbers([]);
    setResult(null);
    setShowSampleData(true);
    
    toast.success(`Generated ${sampleCount} sample records for testing`);
  };

  // ===============================================================================
  // RESET AND CLEANUP
  // ===============================================================================

  const handleReset = () => {
    setFile(null);
    setRecords([]);
    setValidationErrors([]);
    setDuplicateNumbers([]);
    setResult(null);
    setProgress(null);
    setIsProcessing(false);
    setShowSampleData(false);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // ===============================================================================
  // DOWNLOAD TEMPLATE
  // ===============================================================================

  const downloadTemplate = () => {
    const templateData = [
      ['number', 'reason'],
      ['+971501234567', 'Customer requested removal'],
      ['+971509876543', 'Invalid number'],
      ['+971501112233', 'Business closed']
    ];

    // Create CSV content with UTF-8 BOM for better Excel compatibility
    const csvRows = templateData.map(row => row.join(','));
    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);

    // Create a temporary anchor, append to DOM, click, then cleanup
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'dnc_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => window.URL.revokeObjectURL(url), 0);

    toast.success('Template downloaded successfully');
  };

  // ===============================================================================
  // RENDER
  // ===============================================================================

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Database className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Bulk DNC Import</h2>
                <p className="text-sm text-gray-500">Import large numbers of DNC records</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-140px)]">
            
            {/* File Upload Section */}
            {!isProcessing && (
              <div className="space-y-4">
                {/* Drag and Drop Zone */}
                <div
                  ref={dropZoneRef}
                  className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    dragActive 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,.sql"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                  
                  <div className="space-y-4">
                    <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                      <Upload className="w-8 h-8 text-gray-400" />
                    </div>
                    
                    <div>
                      <p className="text-lg font-medium text-gray-900">
                        {file ? file.name : 'Drop your file here or click to browse'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Supports CSV, Excel, and SQL files up to 50MB
                      </p>
                    </div>
                    
                    <div className="flex items-center justify-center space-x-4">
                      <button
                        onClick={() => {
                          if (fileInputRef.current) {
                            // Clear previous value so selecting the same file again triggers onChange
                            fileInputRef.current.value = '';
                            fileInputRef.current.click();
                          }
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Choose File
                      </button>
                      
                      <button
                        onClick={downloadTemplate}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
                      >
                        <Download className="w-4 h-4" />
                        <span>Download Template</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sample Data Generator */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <FileText className="w-5 h-5 text-gray-500" />
                      <div>
                        <p className="font-medium text-gray-900">Need test data?</p>
                        <p className="text-sm text-gray-500">Generate sample records for testing</p>
                      </div>
                    </div>
                    <button
                      onClick={handleGenerateSample}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      Generate Sample Data
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* File Information */}
            {file && (
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                  <div className="flex-1">
                    <p className="font-medium text-blue-900">{file.name}</p>
                    <p className="text-sm text-blue-700">
                      Size: {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Records Summary */}
            {records.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-3 mb-3">
                  <Users className="w-5 h-5 text-gray-600" />
                  <h3 className="font-medium text-gray-900">Records Summary</h3>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600">{records.length + validationErrors.length + duplicateNumbers.length}</p>
                    <p className="text-sm text-gray-500">Total Records</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600">{records.length}</p>
                    <p className="text-sm text-gray-500">Valid Records</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-600">{validationErrors.length}</p>
                    <p className="text-sm text-gray-500">Validation Errors</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-yellow-600">{duplicateNumbers.length}</p>
                    <p className="text-sm text-gray-500">Duplicates</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-600">
                      {showSampleData ? 'Sample' : 'File'}
                    </p>
                    <p className="text-sm text-gray-500">Data Source</p>
                  </div>
                </div>
              </div>
            )}

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="bg-red-50 rounded-lg p-4">
                <div className="flex items-center space-x-3 mb-3">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <h3 className="font-medium text-red-900">Validation Errors</h3>
                </div>
                
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {validationErrors.slice(0, 10).map((error, index) => (
                    <p key={index} className="text-sm text-red-700">{error}</p>
                  ))}
                  {validationErrors.length > 10 && (
                    <p className="text-sm text-red-600 font-medium">
                      ... and {validationErrors.length - 10} more errors
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Duplicate Numbers */}
            {duplicateNumbers.length > 0 && (
              <div className="bg-yellow-50 rounded-lg p-4">
                <div className="flex items-center space-x-3 mb-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  <h3 className="font-medium text-yellow-900">Duplicate Numbers in File</h3>
                </div>
                
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {duplicateNumbers.slice(0, 10).map((duplicate, index) => (
                    <p key={index} className="text-sm text-yellow-700">{duplicate}</p>
                  ))}
                  {duplicateNumbers.length > 10 && (
                    <p className="text-sm text-yellow-600 font-medium">
                      ... and {duplicateNumbers.length - 10} more duplicates
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Progress Tracking */}
            {progress && (
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center space-x-3 mb-3">
                  <Clock className="w-5 h-5 text-blue-600" />
                  <h3 className="font-medium text-blue-900">Import Progress</h3>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span>Processing: {progress.currentChunk}/{progress.totalChunks} chunks</span>
                    <span>{progress.processedRecords}/{progress.totalRecords} records</span>
                  </div>
                  
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(progress.processedRecords / progress.totalRecords) * 100}%` }}
                    />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center">
                      <p className="font-medium text-green-600">{progress.successfulRecords}</p>
                      <p className="text-gray-500">Successful</p>
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-red-600">{progress.failedRecords}</p>
                      <p className="text-gray-500">Failed</p>
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-yellow-600">{progress.duplicateRecords}</p>
                      <p className="text-gray-500">Duplicates</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Import Results */}
            {result && (
              <div className={`rounded-lg p-4 ${result.success ? 'bg-green-50' : 'bg-red-50'}`}>
                <div className="flex items-center space-x-3 mb-3">
                  {result.success ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  )}
                  <h3 className={`font-medium ${result.success ? 'text-green-900' : 'text-red-900'}`}>
                    Import Results
                  </h3>
                </div>
                
                <div className="space-y-3">
                  <p className={`text-sm ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                    {result.message}
                  </p>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <p className="text-lg font-bold text-blue-600">{result.totalRecords}</p>
                      <p className="text-sm text-gray-500">Total</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-green-600">{result.successfulRecords}</p>
                      <p className="text-sm text-gray-500">Successful</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-red-600">{result.failedRecords}</p>
                      <p className="text-sm text-gray-500">Failed</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-yellow-600">{result.duplicateRecords}</p>
                      <p className="text-sm text-gray-500">Duplicates</p>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600">
                    Processing time: {(result.processingTime / 1000).toFixed(2)} seconds
                  </p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            {!isProcessing && records.length > 0 && (
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Reset
                </button>
                <button
                  onClick={handleImport}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                >
                  <Database className="w-4 h-4" />
                  <span>Import {records.length} Valid Records</span>
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
