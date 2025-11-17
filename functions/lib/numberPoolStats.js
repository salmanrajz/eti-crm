"use strict";
/**
 * ===============================================================================
 * NUMBER POOL STATISTICS MANAGEMENT - AUTOMATIC STATS TRACKING
 * ===============================================================================
 *
 * This file handles automatic statistics tracking for the number pool system.
 * It maintains real-time counts, pagination data, and category-specific statistics
 * that are essential for the frontend pagination and dashboard displays.
 *
 * FUNCTIONS INCLUDED:
 *
 * 1. updateNumberPoolStatsOnCreate - Firestore trigger for new numbers
 *    - Automatically increments total item counts
 *    - Updates category-specific counts
 *    - Calculates pagination data for all supported page sizes
 *    - Maintains real-time statistics for immediate frontend updates
 *
 * 2. updateNumberPoolStatsOnDelete - Firestore trigger for deleted numbers
 *    - Maintains monotonic count behavior (counts never decrease)
 *    - Ensures page numbers remain consistent and only increase
 *    - Prevents pagination issues when numbers are removed
 *
 * 3. initializeNumberPoolStats - Manual statistics initialization
 *    - Recalculates all statistics from current data
 *    - Useful for maintenance, data migrations, or fixing inconsistencies
 *    - Counts all numbers and categories accurately
 *
 * STATISTICS TRACKED:
 * - Total item counts (global and category-specific)
 * - Pagination data for page sizes: 10, 20, 50, 80, 100, 120 items per page
 * - Category-based counts and pagination
 * - Last updated timestamps for cache invalidation
 *
 * BUSINESS LOGIC:
 * - Monotonic counting ensures page numbers never decrease
 * - Category-based statistics for filtered views
 * - Transaction-safe updates to prevent race conditions
 * - Comprehensive pagination support for all UI views
 *
 * All functions use Firestore transactions for data consistency and are
 * deployed to the us-central1 region.
 * ===============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeNumberPoolStats = exports.aggregateStatsShards = exports.autoAggregateStats = exports.updateNumberPoolStatsOnDelete = exports.updateNumberPoolStatsOnCreate = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const functions = require("firebase-functions");
// Supported page sizes for pagination calculations
const PAGE_SIZES = [10, 20, 50, 80, 100, 120];
/**
 * ===============================================================================
 * FIRESTORE TRIGGER: Number Creation Handler (OPTIMIZED)
 * ===============================================================================
 * This trigger automatically updates statistics when a new number is added to the pool.
 * OPTIMIZED to use atomic increment operations instead of transactions for better performance.
 *
 * Statistics Updated:
 * - Global total item count (atomic increment)
 * - Category-specific item counts (atomic increment)
 * - Last updated timestamp
 *
 * Pagination Calculation:
 * - Page counts are calculated by initializeNumberPoolStats for accuracy
 * - This reduces contention and improves concurrent write performance
 *
 * Performance:
 * - Uses FieldValue.increment() for atomic, non-blocking updates
 * - Much faster than transactions for high-concurrency scenarios
 * - No read-modify-write cycle, just atomic increment
 */
/**
 * SHARDED COUNTER APPROACH - Reduces contention by distributing writes
 * Instead of 7500 writes to 1 document, we do 750 writes to 10 shards each
 */
const NUM_SHARDS = 10; // Number of shards for distributed counting
exports.updateNumberPoolStatsOnCreate = (0, firestore_1.onDocumentCreated)({
    document: 'numberPool/{numberId}',
    region: 'us-central1'
}, async (event) => {
    var _a;
    try {
        const numberData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
        if (!numberData)
            return;
        // Skip stats update during bulk uploads to prevent contention
        // Bulk uploads will update stats once at the end via initializeNumberPoolStats
        if (numberData.bulkUpload === true) {
            return; // Silent skip during bulk operations
        }
        const category = numberData.category || 'all';
        const db = (0, firestore_2.getFirestore)();
        // SHARDED COUNTER: Randomly pick a shard (0-9)
        // This distributes writes across 10 documents instead of 1
        const shardId = Math.floor(Math.random() * NUM_SHARDS);
        const shardRef = db.collection('stats').doc(`numberPool_shard_${shardId}`);
        // OPTIMIZED: Use atomic increment on a shard
        const categoryKey = `totalItems_${category}`;
        const updates = {
            totalItems: firestore_2.FieldValue.increment(1),
            [categoryKey]: firestore_2.FieldValue.increment(1),
            lastUpdated: firestore_2.FieldValue.serverTimestamp(),
            needsPageRecalc: true,
            shardId // Track which shard this is
        };
        // Atomic update - distributed across shards!
        await shardRef.set(updates, { merge: true });
    }
    catch (error) {
        console.error('Error updating number pool stats on create:', error);
        // Don't throw - allow the number creation to succeed even if stats fail
    }
});
/**
 * ===============================================================================
 * FIRESTORE TRIGGER: Number Deletion Handler
 * ===============================================================================
 * This trigger handles number deletions while maintaining monotonic counting behavior.
 * This ensures page numbers remain consistent and only increase over time.
 *
 * Business Logic:
 * - Maintains monotonic counts (counts never decrease)
 * - Prevents pagination issues when numbers are removed from the pool
 * - Ensures UI consistency for users who may have cached pagination data
 * - Logs deletion events for audit purposes
 *
 * Note: This is intentionally designed to NOT decrement counts to maintain
 * monotonic behavior as requested by business requirements.
 */
exports.updateNumberPoolStatsOnDelete = (0, firestore_1.onDocumentDeleted)({
    document: 'numberPool/{numberId}',
    region: 'us-central1'
}, async (event) => {
    var _a;
    try {
        const numberData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
        if (!numberData)
            return;
        // As per requirement, we don't decrement counts to keep them monotonic
        // This ensures page numbers only increase when new items are added
        console.log(`Number deleted: ${event.params.numberId}, but keeping stats monotonic`);
    }
    catch (error) {
        console.error('Error handling number pool stats on delete:', error);
    }
});
/**
 * ===============================================================================
 * AGGREGATE SHARDS - Combine sharded counters into main stats
 * ===============================================================================
 * This function reads all shards and aggregates them into the main stats document.
 * Runs automatically every 10 seconds via Cloud Scheduler.
 */
const aggregateStatsToMainDocument = async () => {
    try {
        const db = (0, firestore_2.getFirestore)();
        const statsRef = db.collection('stats').doc('numberPool');
        // Read all shards
        const shardPromises = [];
        for (let i = 0; i < NUM_SHARDS; i++) {
            shardPromises.push(db.collection('stats').doc(`numberPool_shard_${i}`).get());
        }
        const shardDocs = await Promise.all(shardPromises);
        // Aggregate counts from all shards
        let totalItems = 0;
        const categoryCounts = {};
        shardDocs.forEach(doc => {
            if (!doc.exists)
                return;
            const data = doc.data();
            // Add to total
            totalItems += (data === null || data === void 0 ? void 0 : data.totalItems) || 0;
            // Add category counts
            Object.keys(data || {}).forEach(key => {
                if (key.startsWith('totalItems_')) {
                    const category = key.replace('totalItems_', '');
                    categoryCounts[category] = (categoryCounts[category] || 0) + ((data === null || data === void 0 ? void 0 : data[key]) || 0);
                }
            });
        });
        // Update main stats document with aggregated counts AND page calculations
        const updates = {
            totalItems,
            lastUpdated: firestore_2.FieldValue.serverTimestamp(),
            needsPageRecalc: false // We're calculating now!
        };
        // Add category counts AND calculate pages for each category
        Object.entries(categoryCounts).forEach(([category, count]) => {
            updates[`totalItems_${category}`] = count;
            // Calculate total pages for each page size for this category
            for (const pageSize of PAGE_SIZES) {
                updates[`totalPages_${pageSize}_${category}`] = Math.ceil(count / pageSize);
            }
        });
        // Calculate global total pages for each page size
        for (const pageSize of PAGE_SIZES) {
            updates[`totalPages_${pageSize}`] = Math.ceil(totalItems / pageSize);
        }
        await statsRef.set(updates, { merge: true });
        console.log(`[StatsAggregation] Aggregated ${totalItems} items from ${NUM_SHARDS} shards`);
        return { totalItems, categoryCounts };
    }
    catch (error) {
        console.error('[StatsAggregation] Error:', error);
        throw error;
    }
};
/**
 * SCHEDULED FUNCTION: Auto-aggregate shards every 1 minute
 * This keeps the main stats/numberPool document updated automatically
 * (Cloud Scheduler minimum is 1 minute)
 */
exports.autoAggregateStats = functions.pubsub
    .schedule('every 1 minutes')
    .timeZone('Asia/Kolkata') // Your timezone
    .onRun(async (context) => {
    await aggregateStatsToMainDocument();
    return null;
});
/**
 * CALLABLE FUNCTION: Manual aggregation (for immediate updates)
 */
exports.aggregateStatsShards = functions.https.onCall(async (data, context) => {
    // Auth check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Auth required');
    }
    try {
        const result = await aggregateStatsToMainDocument();
        return {
            success: true,
            totalItems: result.totalItems,
            categoryCounts: result.categoryCounts,
            shardsProcessed: NUM_SHARDS
        };
    }
    catch (error) {
        console.error('Error aggregating stats shards:', error);
        throw new functions.https.HttpsError('internal', 'Failed to aggregate stats');
    }
});
/**
 * ===============================================================================
 * CALLABLE FUNCTION: Statistics Initialization
 * ===============================================================================
 * This function recalculates and initializes all number pool statistics from scratch.
 * It's useful for maintenance, data migrations, or fixing inconsistencies.
 *
 * Features:
 * - V1 callable function (CORS handled automatically by Firebase SDK)
 * - Counts all existing numbers in the pool
 * - Calculates category-specific counts
 * - Generates pagination data for all supported page sizes
 * - Initializes or updates the central statistics document
 *
 * Usage:
 * - Called from admin dashboard after bulk uploads
 * - Useful after bulk data operations or system migrations
 * - Can be used to fix any statistics inconsistencies
 *
 * Performance:
 * - Reads all number pool documents (consider impact on large datasets)
 * - Uses efficient batch operations for statistics updates
 * - Provides detailed logging for monitoring and debugging
 *
 * Authentication: Required (authenticated users only)
 */
exports.initializeNumberPoolStats = functions.https.onCall(async (data, context) => {
    // Auth check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Auth required');
    }
    try {
        const db = (0, firestore_2.getFirestore)();
        const numbersRef = db.collection('numberPool');
        const statsRef = db.collection('stats').doc('numberPool');
        // Get all numbers to count them
        const snapshot = await numbersRef.get();
        const totalItems = snapshot.size;
        // Count by category
        const categoryCounts = {};
        snapshot.docs.forEach(doc => {
            const category = doc.data().category || 'all';
            categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        });
        // Calculate total pages for each page size
        const updates = {
            totalItems,
            lastUpdated: firestore_2.FieldValue.serverTimestamp()
        };
        // Add category-specific counts
        Object.entries(categoryCounts).forEach(([category, count]) => {
            updates[`totalItems_${category}`] = count;
            // Calculate total pages for each page size for this category
            for (const pageSize of PAGE_SIZES) {
                updates[`totalPages_${pageSize}_${category}`] = Math.ceil(count / pageSize);
            }
        });
        // Calculate global total pages for each page size
        for (const pageSize of PAGE_SIZES) {
            updates[`totalPages_${pageSize}`] = Math.ceil(totalItems / pageSize);
        }
        // Clear the recalculation flag
        updates.needsPageRecalc = false;
        await statsRef.set(updates, { merge: true });
        console.log(`Initialized number pool stats: ${totalItems} total items`);
        console.log('Category counts:', categoryCounts);
        return {
            success: true,
            totalItems,
            categoryCounts
        };
    }
    catch (error) {
        console.error('Error initializing number pool stats:', error);
        throw new functions.https.HttpsError('internal', 'Failed to initialize stats');
    }
});
//# sourceMappingURL=numberPoolStats.js.map