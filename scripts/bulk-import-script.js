#!/usr/bin/env node

/**
 * ===============================================================================
 * BULK DNC IMPORT SCRIPT - COMMAND LINE BULK IMPORT TOOL
 * ===============================================================================
 * 
 * This script provides a command-line interface for bulk importing DNC records.
 * It's designed to handle large datasets (1.5M+ records) efficiently with proper
 * error handling, progress tracking, and chunked processing.
 * 
 * FEATURES:
 * - CSV and Excel file support
 * - Chunked processing for large files
 * - Progress tracking and reporting
 * - Error handling and retry logic
 * - Duplicate detection
 * - Resume capability for interrupted imports
 * 
 * USAGE:
 * node bulk-import-script.js <input-file> [options]
 * 
 * OPTIONS:
 * --chunk-size <number>    Number of records per chunk (default: 10000)
 * --batch-size <number>    Number of records per API call (default: 500)
 * --dry-run               Validate data without importing
 * --resume <chunk-file>    Resume from specific chunk
 * --help                  Show help information
 * ===============================================================================
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const axios = require('axios');
const readline = require('readline');

// Configuration
const DEFAULT_CHUNK_SIZE = 10000;
const DEFAULT_BATCH_SIZE = 500;
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

class BulkDNCImporter {
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
    this.batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
    this.dryRun = options.dryRun || false;
    this.resumeFrom = options.resumeFrom || null;
    this.functionUrl = options.functionUrl || 'https://us-central1-your-project-id.cloudfunctions.net/bulkDNCImport';
    
    this.stats = {
      totalRecords: 0,
      processedRecords: 0,
      successfulRecords: 0,
      failedRecords: 0,
      duplicateRecords: 0,
      chunks: 0,
      startTime: null,
      errors: []
    };
  }

  log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
  }

  logProgress() {
    const percentage = ((this.stats.processedRecords / this.stats.totalRecords) * 100).toFixed(1);
    const elapsed = this.stats.startTime ? Date.now() - this.stats.startTime : 0;
    const rate = this.stats.processedRecords > 0 ? (this.stats.processedRecords / (elapsed / 1000)) : 0;
    
    this.log(`Progress: ${this.stats.processedRecords}/${this.stats.totalRecords} (${percentage}%) | Rate: ${rate.toFixed(0)} records/sec`, 'cyan');
    this.log(`Success: ${this.stats.successfulRecords} | Failed: ${this.stats.failedRecords} | Duplicates: ${this.stats.duplicateRecords}`, 'yellow');
  }

  async validateFile(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    if (stats.size > 100 * 1024 * 1024) { // 100MB limit
      throw new Error('File size exceeds 100MB limit');
    }

    const ext = path.extname(filePath).toLowerCase();
    if (!['.csv', '.xlsx', '.xls'].includes(ext)) {
      throw new Error('Unsupported file format. Please use CSV or Excel files.');
    }

    return ext;
  }

  async parseFile(filePath, fileType) {
    const records = [];

    return new Promise((resolve, reject) => {
      if (fileType === '.csv') {
        this.parseCSV(filePath, records, resolve, reject);
      } else {
        this.parseExcel(filePath, records, resolve, reject);
      }
    });
  }

  parseCSV(filePath, records, resolve, reject) {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        const number = row.phone || row.number || row.phone_number || row.contact || '';
        const reason = row.reason || row.notes || row.comment || '';
        
        if (number.trim()) {
          records.push({
            number: number.trim(),
            reason: reason.trim() || undefined,
            source: 'bulk_import'
          });
        }
      })
      .on('end', () => {
        this.log(`Parsed ${records.length} records from CSV file`, 'green');
        resolve(records);
      })
      .on('error', reject);
  }

  parseExcel(filePath, records, resolve, reject) {
    try {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = xlsx.utils.sheet_to_json(worksheet);

      jsonData.forEach((row) => {
        const number = row.phone || row.number || row.phone_number || row.contact || '';
        const reason = row.reason || row.notes || row.comment || '';
        
        if (number.toString().trim()) {
          records.push({
            number: number.toString().trim(),
            reason: reason.toString().trim() || undefined,
            source: 'bulk_import'
          });
        }
      });

      this.log(`Parsed ${records.length} records from Excel file`, 'green');
      resolve(records);
    } catch (error) {
      reject(error);
    }
  }

  validateRecords(records) {
    const validRecords = [];
    const errors = [];

    records.forEach((record, index) => {
      const cleanNumber = record.number.replace(/[^\d+]/g, '');
      
      // Validate UAE number format
      if (!/^(\+971|971|05)\d{8,9}$/.test(cleanNumber)) {
        errors.push(`Row ${index + 1}: Invalid number format - ${record.number}`);
      } else {
        validRecords.push({
          ...record,
          number: this.cleanNumber(cleanNumber)
        });
      }
    });

    if (errors.length > 0) {
      this.log(`Found ${errors.length} validation errors:`, 'red');
      errors.slice(0, 10).forEach(error => this.log(`  ${error}`, 'red'));
      if (errors.length > 10) {
        this.log(`  ... and ${errors.length - 10} more errors`, 'red');
      }
    }

    return { validRecords, errors };
  }

  cleanNumber(number) {
    let cleanNumber = number.replace(/[^\d+]/g, '');
    
    if (cleanNumber.startsWith('05')) {
      cleanNumber = '+971' + cleanNumber.substring(2);
    } else if (cleanNumber.startsWith('971')) {
      cleanNumber = '+' + cleanNumber;
    }
    
    return cleanNumber;
  }

  async uploadChunk(chunk, chunkIndex) {
    const maxRetries = MAX_RETRIES;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        const response = await axios.post(this.functionUrl, {
          records: chunk,
          batchSize: this.batchSize,
          source: 'bulk_import',
          addedBy: 'admin',
          dryRun: this.dryRun
        }, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 300000 // 5 minutes timeout
        });

        return response.data;
      } catch (error) {
        retryCount++;
        this.log(`Upload failed (attempt ${retryCount}/${maxRetries}): ${error.message}`, 'red');
        
        if (retryCount < maxRetries) {
          this.log(`Retrying in ${RETRY_DELAY/1000} seconds...`, 'yellow');
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        } else {
          throw error;
        }
      }
    }
  }

  async processChunk(chunk, chunkIndex) {
    this.log(`Processing chunk ${chunkIndex + 1} (${chunk.length} records)...`, 'blue');
    
    try {
      const result = await this.uploadChunk(chunk, chunkIndex);
      
      this.stats.processedRecords += chunk.length;
      this.stats.successfulRecords += result.successfulRecords || 0;
      this.stats.failedRecords += result.failedRecords || 0;
      this.stats.duplicateRecords += result.duplicateRecords || 0;
      
      if (result.errors && result.errors.length > 0) {
        this.stats.errors.push(...result.errors);
      }
      
      this.logProgress();
      
      return result;
    } catch (error) {
      this.log(`Chunk ${chunkIndex + 1} failed: ${error.message}`, 'red');
      this.stats.failedRecords += chunk.length;
      this.stats.errors.push(`Chunk ${chunkIndex + 1}: ${error.message}`);
      return null;
    }
  }

  async import(filePath) {
    this.stats.startTime = Date.now();
    
    try {
      // Validate file
      this.log(`Validating file: ${filePath}`, 'blue');
      const fileType = await this.validateFile(filePath);
      
      // Parse file
      this.log(`Parsing file...`, 'blue');
      const records = await this.parseFile(filePath, fileType);
      this.stats.totalRecords = records.length;
      
      // Validate records
      this.log(`Validating records...`, 'blue');
      const { validRecords, errors } = this.validateRecords(records);
      this.stats.errors.push(...errors);
      
      if (validRecords.length === 0) {
        throw new Error('No valid records found');
      }
      
      this.log(`Found ${validRecords.length} valid records out of ${records.length} total`, 'green');
      
      if (this.dryRun) {
        this.log('Dry run completed. No data was imported.', 'yellow');
        return;
      }
      
      // Split into chunks
      const chunks = [];
      for (let i = 0; i < validRecords.length; i += this.chunkSize) {
        chunks.push(validRecords.slice(i, i + this.chunkSize));
      }
      
      this.stats.chunks = chunks.length;
      this.log(`Processing ${chunks.length} chunks of ${this.chunkSize} records each...`, 'blue');
      
      // Process chunks
      for (let i = 0; i < chunks.length; i++) {
        if (this.resumeFrom && i < this.resumeFrom) {
          this.log(`Skipping chunk ${i + 1} (resume from ${this.resumeFrom})`, 'yellow');
          continue;
        }
        
        await this.processChunk(chunks[i], i);
        
        // Small delay between chunks
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Final results
      const elapsed = Date.now() - this.stats.startTime;
      this.log('\n=== IMPORT COMPLETED ===', 'green');
      this.log(`Total records: ${this.stats.totalRecords}`, 'cyan');
      this.log(`Successful: ${this.stats.successfulRecords}`, 'green');
      this.log(`Failed: ${this.stats.failedRecords}`, 'red');
      this.log(`Duplicates: ${this.stats.duplicateRecords}`, 'yellow');
      this.log(`Processing time: ${(elapsed / 1000).toFixed(2)} seconds`, 'cyan');
      this.log(`Average rate: ${(this.stats.processedRecords / (elapsed / 1000)).toFixed(0)} records/sec`, 'cyan');
      
      if (this.stats.errors.length > 0) {
        this.log(`\nErrors encountered: ${this.stats.errors.length}`, 'red');
        this.stats.errors.slice(0, 10).forEach(error => this.log(`  ${error}`, 'red'));
        if (this.stats.errors.length > 10) {
          this.log(`  ... and ${this.stats.errors.length - 10} more errors`, 'red');
        }
      }
      
    } catch (error) {
      this.log(`Import failed: ${error.message}`, 'red');
      process.exit(1);
    }
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Usage: node bulk-import-script.js <input-file> [options]

Options:
  --chunk-size <number>    Number of records per chunk (default: ${DEFAULT_CHUNK_SIZE})
  --batch-size <number>    Number of records per API call (default: ${DEFAULT_BATCH_SIZE})
  --dry-run               Validate data without importing
  --resume <chunk-file>    Resume from specific chunk
  --help                  Show this help message

Examples:
  node bulk-import-script.js dnc-records.csv
  node bulk-import-script.js dnc-records.xlsx --chunk-size 5000
  node bulk-import-script.js dnc-records.csv --dry-run
  node bulk-import-script.js dnc-records.csv --resume 10
`);
    process.exit(0);
  }
  
  const filePath = args[0];
  const options = {};
  
  // Parse command line options
  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--chunk-size':
        options.chunkSize = parseInt(args[++i]);
        break;
      case '--batch-size':
        options.batchSize = parseInt(args[++i]);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--resume':
        options.resumeFrom = parseInt(args[++i]);
        break;
    }
  }
  
  const importer = new BulkDNCImporter(options);
  await importer.import(filePath);
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = BulkDNCImporter;
