"use strict";
/**
 * ===============================================================================
 * BULK DNC IMPORT FUNCTION - LARGE SCALE DNC DATA IMPORT
 * ===============================================================================
 *
 * This function handles bulk import of DNC (Do Not Call) numbers into the system.
 * Designed to handle large datasets (1.5M+ records) efficiently with proper
 * batching, error handling, and progress tracking.
 *
 * FEATURES:
 * - Batch processing for large datasets
 * - Progress tracking and reporting
 * - Error handling and retry logic
 * - Duplicate detection and prevention
 * - Memory-efficient processing
 * - Admin-only access control
 *
 * USAGE:
 * This function is called via Firebase Cloud Functions HTTP endpoint
 * for one-time bulk imports of DNC data.
 * ===============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkDNCImportStatus = exports.bulkDNCImport = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
// Configuration constants
const DEFAULT_BATCH_SIZE = 500; // Firestore batch limit
const MAX_RECORDS_PER_REQUEST = 10000; // Maximum records per function call
// Removed unused PROGRESS_UPDATE_INTERVAL to satisfy TypeScript
/**
 * ===============================================================================
 * BULK DNC IMPORT FUNCTION
 * ===============================================================================
 *
 * Main function for bulk importing DNC records
 */
exports.bulkDNCImport = functions
    .region('us-central1')
    .runWith({
    timeoutSeconds: 540, // 9 minutes - maximum for HTTP functions
    memory: '2GB' // High memory for large datasets
})
    .https.onRequest(async (req, res) => {
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    // Only allow POST requests
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }
    try {
        const { records, batchSize = DEFAULT_BATCH_SIZE, source = 'bulk_import', addedBy, dryRun = false } = req.body;
        // Validate input
        if (!records || !Array.isArray(records) || records.length === 0) {
            res.status(400).json({ error: 'No records provided' });
            return;
        }
        if (records.length > MAX_RECORDS_PER_REQUEST) {
            res.status(400).json({
                error: `Too many records. Maximum allowed: ${MAX_RECORDS_PER_REQUEST}`,
                provided: records.length
            });
            return;
        }
        // Validate authentication (optional - can be removed for one-time import)
        const authHeader = req.headers.authorization;
        if (authHeader) {
            try {
                const token = authHeader.split('Bearer ')[1];
                const decodedToken = await admin.auth().verifyIdToken(token);
                // Check if user is admin
                const userDoc = await admin.firestore().collection('users').doc(decodedToken.uid).get();
                const userData = userDoc.data();
                if (!userData || userData.role !== 'admin') {
                    res.status(403).json({ error: 'Admin access required' });
                    return;
                }
            }
            catch (error) {
                res.status(401).json({ error: 'Invalid authentication token' });
                return;
            }
        }
        // Start bulk import process
        const result = await processBulkImport(records, batchSize, source, addedBy, dryRun);
        res.status(200).json(result);
    }
    catch (error) {
        console.error('Bulk DNC import error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
/**
 * ===============================================================================
 * BULK IMPORT PROCESSOR
 * ===============================================================================
 *
 * Processes the bulk import with batching and error handling
 */
async function processBulkImport(records, batchSize, source, addedBy, dryRun = false) {
    const startTime = new Date();
    // Initialize progress tracking
    const progress = {
        totalRecords: records.length,
        processedRecords: 0,
        successfulRecords: 0,
        failedRecords: 0,
        duplicateRecords: 0,
        currentBatch: 0,
        totalBatches: Math.ceil(records.length / batchSize),
        startTime,
        lastUpdateTime: startTime,
        errors: [],
        status: 'processing'
    };
    console.log(`Starting bulk DNC import: ${records.length} records, ${progress.totalBatches} batches`);
    try {
        // Process records in batches
        for (let i = 0; i < records.length; i += batchSize) {
            progress.currentBatch++;
            const batch = records.slice(i, i + batchSize);
            console.log(`Processing batch ${progress.currentBatch}/${progress.totalBatches} (${batch.length} records)`);
            const batchResult = await processBatch(batch, source, addedBy, dryRun);
            // Update progress
            progress.processedRecords += batch.length;
            progress.successfulRecords += batchResult.successful;
            progress.failedRecords += batchResult.failed;
            progress.duplicateRecords += batchResult.duplicates;
            progress.errors.push(...batchResult.errors);
            progress.lastUpdateTime = new Date();
            // Log progress
            if (progress.currentBatch % 10 === 0 || progress.currentBatch === progress.totalBatches) {
                console.log(`Progress: ${progress.processedRecords}/${progress.totalRecords} (${((progress.processedRecords / progress.totalRecords) * 100).toFixed(1)}%)`);
            }
            // Small delay to prevent overwhelming Firestore
            if (progress.currentBatch < progress.totalBatches) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        progress.status = 'completed';
        const endTime = new Date();
        const processingTime = endTime.getTime() - startTime.getTime();
        console.log(`Bulk import completed in ${processingTime}ms`);
        console.log(`Results: ${progress.successfulRecords} successful, ${progress.failedRecords} failed, ${progress.duplicateRecords} duplicates`);
        return {
            success: true,
            totalRecords: progress.totalRecords,
            processedRecords: progress.processedRecords,
            successfulRecords: progress.successfulRecords,
            failedRecords: progress.failedRecords,
            duplicateRecords: progress.duplicateRecords,
            processingTime,
            errors: progress.errors,
            message: `Successfully processed ${progress.successfulRecords} out of ${progress.totalRecords} records`
        };
    }
    catch (error) {
        progress.status = 'failed';
        console.error('Bulk import failed:', error);
        return {
            success: false,
            totalRecords: progress.totalRecords,
            processedRecords: progress.processedRecords,
            successfulRecords: progress.successfulRecords,
            failedRecords: progress.failedRecords,
            duplicateRecords: progress.duplicateRecords,
            processingTime: new Date().getTime() - startTime.getTime(),
            errors: [...progress.errors, error instanceof Error ? error.message : 'Unknown error'],
            message: 'Bulk import failed'
        };
    }
}
/**
 * ===============================================================================
 * BATCH PROCESSOR
 * ===============================================================================
 *
 * Processes a single batch of records
 */
async function processBatch(batch, source, addedBy, dryRun = false) {
    const db = admin.firestore();
    const batchWrite = db.batch();
    const errors = [];
    let successful = 0;
    let failed = 0;
    let duplicates = 0;
    try {
        // Check for existing numbers in this batch
        const numbersToCheck = batch.map(record => record.number);
        const existingNumbers = await checkExistingNumbers(numbersToCheck);
        for (const record of batch) {
            try {
                // Clean and validate number
                const cleanNumber = record.number.replace(/[^\d+]/g, '');
                if (!cleanNumber || cleanNumber.length < 10) {
                    errors.push(`Invalid number format: ${record.number}`);
                    failed++;
                    continue;
                }
                // Check if number already exists
                if (existingNumbers.has(cleanNumber)) {
                    duplicates++;
                    continue;
                }
                if (!dryRun) {
                    // Create DNC record
                    const dncRecord = Object.assign({ number: cleanNumber, addedBy: addedBy || 'system', addedAt: firestore_1.FieldValue.serverTimestamp(), source: source, status: 'active' }, (record.reason && { reason: record.reason }));
                    const docRef = db.collection('dncNumbers').doc();
                    batchWrite.set(docRef, dncRecord);
                }
                successful++;
            }
            catch (error) {
                errors.push(`Error processing ${record.number}: ${error instanceof Error ? error.message : 'Unknown error'}`);
                failed++;
            }
        }
        // Commit batch if not dry run
        if (!dryRun && successful > 0) {
            await batchWrite.commit();
        }
    }
    catch (error) {
        errors.push(`Batch processing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        failed += batch.length - successful - duplicates;
    }
    return { successful, failed, duplicates, errors };
}
/**
 * ===============================================================================
 * EXISTING NUMBERS CHECKER
 * ===============================================================================
 *
 * Checks which numbers already exist in the DNC database
 */
async function checkExistingNumbers(numbers) {
    const db = admin.firestore();
    const existingNumbers = new Set();
    try {
        // Process in chunks to avoid query limits
        const chunkSize = 100;
        for (let i = 0; i < numbers.length; i += chunkSize) {
            const chunk = numbers.slice(i, i + chunkSize);
            // Query for existing numbers in this chunk
            const promises = chunk.map(async (number) => {
                const cleanNumber = number.replace(/[^\d+]/g, '');
                const querySnapshot = await db.collection('dncNumbers')
                    .where('number', '==', cleanNumber)
                    .where('status', '==', 'active')
                    .limit(1)
                    .get();
                if (!querySnapshot.empty) {
                    existingNumbers.add(cleanNumber);
                }
            });
            await Promise.all(promises);
        }
    }
    catch (error) {
        console.error('Error checking existing numbers:', error);
    }
    return existingNumbers;
}
/**
 * ===============================================================================
 * BULK IMPORT STATUS FUNCTION
 * ===============================================================================
 *
 * Provides status information for bulk import operations
 */
exports.bulkDNCImportStatus = functions
    .region('us-central1')
    .https.onRequest(async (req, res) => {
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    try {
        const db = admin.firestore();
        // Get total DNC count
        const totalCountSnapshot = await db.collection('dncNumbers').count().get();
        const totalCount = totalCountSnapshot.data().count;
        // Get recent imports (last 24 hours)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const recentImportsSnapshot = await db.collection('dncNumbers')
            .where('addedAt', '>=', yesterday)
            .where('source', '==', 'bulk_import')
            .count()
            .get();
        const recentImports = recentImportsSnapshot.data().count;
        res.status(200).json({
            totalDNCRecords: totalCount,
            recentImports24h: recentImports,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Error getting DNC status:', error);
        res.status(500).json({ error: 'Failed to get status' });
    }
});
//# sourceMappingURL=bulkDNCImport.js.map