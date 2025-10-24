/**
 * ===============================================================================
 * RESERVATION EXPIRY MANAGEMENT - LEGACY RESERVATION SYSTEM (COMPILED VERSION)
 * ===============================================================================
 * 
 * This is the compiled JavaScript version of the legacy reservation expiry system.
 * This file contains an older, more complex implementation of reservation management
 * with additional features like batch processing and emergency handling.
 * 
 * FUNCTIONS INCLUDED:
 * 
 * 1. handleReservationExpiry - Firestore trigger for reservation monitoring
 *    - Monitors numberPool document updates for reservation changes
 *    - Detects expired reservations and triggers processing
 * 
 * 2. processReservationExpiry - Core reservation release logic
 *    - Handles atomic release of expired reservations
 *    - Updates number status and clears reservation data
 * 
 * 3. realtimeReservationExpiry - Real-time expiry detection
 *    - Monitors for recently expired reservations
 *    - Provides immediate response to expiry events
 * 
 * 4. smartBatchReservationExpiry - Batch processor
 *    - Runs on schedule to process expired reservations in batches
 *    - Handles high-volume scenarios efficiently
 * 
 * 5. emergencyReservationExpiry - Emergency safety net
 *    - Catches any expired reservations missed by other processors
 *    - Ensures comprehensive coverage
 * 
 * 6. testReservationExpiry - Manual testing function
 *    - Allows manual triggering for testing and debugging
 * 
 * NOTE: This appears to be a legacy version. The current implementation
 * uses simpleReservationExpiry.js for cleaner, simpler reservation management.
 * 
 * NOTE: This is a compiled file. Source code may not be available in current codebase.
 * ===============================================================================
 */

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testReservationExpiry = exports.emergencyReservationExpiry = exports.smartBatchReservationExpiry = exports.realtimeReservationExpiry = exports.processReservationExpiry = exports.handleReservationExpiry = void 0;

// Import Firebase Functions v2 modules and Admin SDK
const firestore_1 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("firebase-admin/firestore");
const admin = require("firebase-admin");
const functions = require("firebase-functions");
/**
 * Triggered when a number document is updated
 * Checks if a reservation has expired and handles automatic release
 */
exports.handleReservationExpiry = (0, firestore_1.onDocumentUpdated)({
    document: 'numberPool/{numberId}',
    region: 'us-central1'
}, async (event) => {
    var _a, _b, _c, _d, _e;
    try {
        const numberId = event.params.numberId;
        const beforeData = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before) === null || _b === void 0 ? void 0 : _b.data();
        const afterData = (_d = (_c = event.data) === null || _c === void 0 ? void 0 : _c.after) === null || _d === void 0 ? void 0 : _d.data();
        if (!beforeData || !afterData) {
            console.log(`No data available for number ${numberId}, skipping`);
            return;
        }
        // Check if this is a reservation-related update or if we need to check for expired reservations
        const hasReservation = afterData.status === 'reserved' && afterData.reservedBy && afterData.expiresAt;
        const isReservationExpiryCheck = afterData.reservationExpiryCheck;
        if (!hasReservation && !isReservationExpiryCheck) {
            console.log(`Number ${numberId} has no active reservation or expiry check, skipping`);
            return;
        }
        const expiresAt = (_e = afterData.expiresAt) === null || _e === void 0 ? void 0 : _e.toDate();
        const now = new Date();
        // Check if the reservation has expired (either triggered by client or naturally expired)
        if (!expiresAt || expiresAt > now) {
            console.log(`Number ${numberId} reservation not expired yet, expires at ${expiresAt}`);
            return;
        }
        console.log(`Processing expired reservation for number ${numberId}`);
        // Use the instant processor
        await (0, exports.processReservationExpiry)(numberId);
        console.log(`Successfully processed expired reservation for number ${numberId}`);
    }
    catch (error) {
        console.error(`Error processing reservation expiry for number ${event.params.numberId}:`, error);
    }
});
/**
 * Advanced reservation expiry processor with optimizations
 * Processes reservations instantly when they expire with smart batching
 */
const processReservationExpiry = async (numberId) => {
    try {
        console.log(`Processing reservation expiry for number ${numberId}`);
        const now = new Date();
        const db = admin.firestore();
        await db.runTransaction(async (transaction) => {
            var _a;
            const numberRef = db.collection('numberPool').doc(numberId);
            const currentDoc = await transaction.get(numberRef);
            if (!currentDoc.exists) {
                console.log(`Number ${numberId} no longer exists, skipping`);
                return;
            }
            const currentData = currentDoc.data();
            if (!currentData) {
                console.log(`Number ${numberId} has no data, skipping`);
                return;
            }
            // Check if reservation has expired
            const expiresAt = (_a = currentData.expiresAt) === null || _a === void 0 ? void 0 : _a.toDate();
            if (!expiresAt || expiresAt > now) {
                console.log(`Number ${numberId} reservation not expired yet, skipping`);
                return;
            }
            // Only process if status is still 'reserved'
            if (currentData.status !== 'reserved') {
                console.log(`Number ${numberId} is no longer reserved (status: ${currentData.status}), skipping`);
                return;
            }
            const reservedBy = currentData.reservedBy;
            // Release the reservation and make the number available again
            transaction.update(numberRef, {
                status: 'open',
                reservedBy: null,
                reservedAt: null,
                expiresAt: null,
                lastStatusChange: firestore_2.FieldValue.serverTimestamp(),
                // Clear reservation expiry check flag
                reservationExpiryCheck: firestore_2.FieldValue.delete(),
                // Add performance tracking
                lastProcessedAt: firestore_2.FieldValue.serverTimestamp(),
                processingVersion: firestore_2.FieldValue.increment(1)
            });
            console.log(`Released expired reservation for number ${numberId} (was reserved by ${reservedBy})`);
            // Send notification to the user who had the reservation
            if (reservedBy) {
                const notificationRef = db.collection('notifications').doc();
                transaction.set(notificationRef, {
                    userId: reservedBy,
                    type: 'reservation_expired',
                    title: 'Number Reservation Expired',
                    message: `Your reservation for number ${currentData.number} has expired and the number is now available to others.`,
                    read: false,
                    createdAt: firestore_2.FieldValue.serverTimestamp(),
                    numberId: numberId,
                    priority: 'normal'
                });
            }
        });
        console.log(`Successfully processed reservation expiry for number ${numberId}`);
    }
    catch (error) {
        console.error(`Error processing reservation expiry for number ${numberId}:`, error);
    }
};
exports.processReservationExpiry = processReservationExpiry;
/**
 * Real-time reservation expiry trigger
 * Fires exactly when a reservation expires by monitoring document changes
 */
exports.realtimeReservationExpiry = (0, firestore_1.onDocumentUpdated)({
    document: 'numberPool/{numberId}',
    region: 'us-central1'
}, async (event) => {
    var _a, _b, _c, _d, _e;
    try {
        const numberId = event.params.numberId;
        const beforeData = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before) === null || _b === void 0 ? void 0 : _b.data();
        const afterData = (_d = (_c = event.data) === null || _c === void 0 ? void 0 : _c.after) === null || _d === void 0 ? void 0 : _d.data();
        if (!beforeData || !afterData) {
            return;
        }
        // Check if this is a reservation-related update
        const hasReservation = afterData.status === 'reserved' && afterData.reservedBy && afterData.expiresAt;
        if (!hasReservation) {
            return;
        }
        const expiresAt = (_e = afterData.expiresAt) === null || _e === void 0 ? void 0 : _e.toDate();
        const now = new Date();
        // Check if the reservation has just expired (within the last 30 seconds)
        if (expiresAt && expiresAt <= now && expiresAt > new Date(now.getTime() - 30000)) {
            console.log(`Real-time reservation expiry detected for number ${numberId}`);
            await (0, exports.processReservationExpiry)(numberId);
        }
    }
    catch (error) {
        console.error(`Error in real-time reservation expiry for number ${event.params.numberId}:`, error);
    }
});
/**
 * Smart batch reservation expiry processor - runs every 1 minute
 * Processes multiple expiries efficiently with batching
 */
exports.smartBatchReservationExpiry = (0, scheduler_1.onSchedule)({
    schedule: 'every 1 minutes',
    region: 'us-central1'
}, async (event) => {
    try {
        console.log('Running smart batch reservation expiry check...');
        const now = new Date();
        const db = admin.firestore();
        // Query for numbers with expired reservations
        const expiredReservationsQuery = db.collection('numberPool')
            .where('status', '==', 'reserved')
            .where('expiresAt', '<=', now)
            .limit(50); // Process max 50 at a time for performance
        const snapshot = await expiredReservationsQuery.get();
        if (snapshot.empty) {
            console.log('No expired reservations found in batch check');
            return;
        }
        console.log(`Found ${snapshot.size} expired reservations in batch check`);
        // Process in batches of 10 for optimal performance
        const batchSize = 10;
        const docs = snapshot.docs;
        for (let i = 0; i < docs.length; i += batchSize) {
            const batch = docs.slice(i, i + batchSize);
            // Process batch in parallel for speed
            await Promise.all(batch.map(doc => (0, exports.processReservationExpiry)(doc.id)));
            // Small delay between batches to prevent overwhelming the system
            if (i + batchSize < docs.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        console.log('Smart batch reservation expiry check completed');
    }
    catch (error) {
        console.error('Error in smart batch reservation expiry check:', error);
    }
});
/**
 * Emergency reservation expiry processor - runs every 5 minutes
 * Catches any missed expiries as a final safety net
 */
exports.emergencyReservationExpiry = (0, scheduler_1.onSchedule)({
    schedule: 'every 5 minutes',
    region: 'us-central1'
}, async (event) => {
    try {
        console.log('Running emergency reservation expiry check...');
        const now = new Date();
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
        const db = admin.firestore();
        // Query for numbers with reservations that expired more than 5 minutes ago
        const expiredReservationsQuery = db.collection('numberPool')
            .where('status', '==', 'reserved')
            .where('expiresAt', '<=', fiveMinutesAgo);
        const snapshot = await expiredReservationsQuery.get();
        if (snapshot.empty) {
            console.log('No emergency expired reservations found');
            return;
        }
        console.log(`Found ${snapshot.size} emergency expired reservations`);
        // Process emergency reservations immediately
        for (const doc of snapshot.docs) {
            await (0, exports.processReservationExpiry)(doc.id);
        }
        console.log('Emergency reservation expiry check completed');
    }
    catch (error) {
        console.error('Error in emergency reservation expiry check:', error);
    }
});
/**
 * Manual trigger function for testing reservation expiry
 * This function can be called manually to test the reservation expiry logic
 */
exports.testReservationExpiry = (0, https_1.onCall)({
    region: 'us-central1'
}, async (request) => {
    // Ensure user is authenticated
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in to test reservation expiry");
    }
    const { numberId } = request.data;
    if (!numberId) {
        throw new functions.https.HttpsError("invalid-argument", "Number ID is required");
    }
    try {
        await (0, exports.processReservationExpiry)(numberId);
        return {
            success: true,
            message: `Reservation expiry test completed for number ${numberId}`
        };
    }
    catch (error) {
        console.error('Test reservation expiry failed:', error);
        throw new functions.https.HttpsError("internal", `Failed to test reservation expiry: ${error.message}`);
    }
});
//# sourceMappingURL=reservationExpiry.js.map