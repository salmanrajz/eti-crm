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
exports.initializeNumberPoolStats = exports.updateNumberPoolStatsOnDelete = exports.updateNumberPoolStatsOnCreate = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
// Supported page sizes for pagination calculations
const PAGE_SIZES = [10, 20, 50, 80, 100, 120];
/**
 * ===============================================================================
 * FIRESTORE TRIGGER: Number Creation Handler
 * ===============================================================================
 * This trigger automatically updates statistics when a new number is added to the pool.
 * It maintains real-time counts and pagination data for immediate frontend updates.
 *
 * Statistics Updated:
 * - Global total item count
 * - Category-specific item counts
 * - Pagination data for all supported page sizes (10, 20, 50, 80, 100, 120)
 * - Category-specific pagination calculations
 * - Last updated timestamp
 *
 * Transaction Safety:
 * - Uses Firestore transactions to ensure atomicity
 * - Prevents race conditions during concurrent number additions
 * - Maintains data consistency across all statistics fields
 */
exports.updateNumberPoolStatsOnCreate = (0, firestore_1.onDocumentCreated)({
    document: 'numberPool/{numberId}',
    region: 'us-central1'
}, async (event) => {
    var _a;
    try {
        const numberData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
        if (!numberData)
            return;
        const category = numberData.category || 'all';
        const db = (0, firestore_2.getFirestore)();
        const statsRef = db.collection('stats').doc('numberPool');
        // Use transaction to ensure atomicity
        await db.runTransaction(async (transaction) => {
            const statsDoc = await transaction.get(statsRef);
            const currentStats = (statsDoc.exists ? statsDoc.data() : {});
            // Increment total items
            const newTotalItems = ((currentStats === null || currentStats === void 0 ? void 0 : currentStats.totalItems) || 0) + 1;
            // Increment category-specific total items
            const categoryKey = `totalItems_${category}`;
            const newCategoryTotalItems = ((currentStats === null || currentStats === void 0 ? void 0 : currentStats[categoryKey]) || 0) + 1;
            // Calculate new total pages for each page size
            const updates = {
                totalItems: newTotalItems,
                [categoryKey]: newCategoryTotalItems,
                lastUpdated: firestore_2.FieldValue.serverTimestamp()
            };
            // Calculate total pages for each page size
            for (const pageSize of PAGE_SIZES) {
                updates[`totalPages_${pageSize}`] = Math.ceil(newTotalItems / pageSize);
                updates[`totalPages_${pageSize}_${category}`] = Math.ceil(newCategoryTotalItems / pageSize);
            }
            transaction.set(statsRef, updates, { merge: true });
        });
        console.log(`Updated number pool stats: +1 item, category: ${category}`);
    }
    catch (error) {
        console.error('Error updating number pool stats on create:', error);
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
 * UTILITY FUNCTION: Statistics Initialization
 * ===============================================================================
 * This function recalculates and initializes all number pool statistics from scratch.
 * It's useful for maintenance, data migrations, or fixing inconsistencies.
 *
 * Features:
 * - Counts all existing numbers in the pool
 * - Calculates category-specific counts
 * - Generates pagination data for all supported page sizes
 * - Initializes or updates the central statistics document
 *
 * Usage:
 * - Called manually from admin dashboard or maintenance scripts
 * - Useful after bulk data operations or system migrations
 * - Can be used to fix any statistics inconsistencies
 *
 * Performance:
 * - Reads all number pool documents (consider impact on large datasets)
 * - Uses efficient batch operations for statistics updates
 * - Provides detailed logging for monitoring and debugging
 */
const initializeNumberPoolStats = async () => {
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
        await statsRef.set(updates, { merge: true });
        console.log(`Initialized number pool stats: ${totalItems} total items`);
        console.log('Category counts:', categoryCounts);
    }
    catch (error) {
        console.error('Error initializing number pool stats:', error);
    }
};
exports.initializeNumberPoolStats = initializeNumberPoolStats;
//# sourceMappingURL=numberPoolStats.js.map