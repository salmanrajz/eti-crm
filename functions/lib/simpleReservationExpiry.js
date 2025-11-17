"use strict";
/**
 * ===============================================================================
 * RESERVATION EXPIRY MANAGEMENT - NUMBER RESERVATION LIFECYCLE
 * ===============================================================================
 *
 * This file handles the complete lifecycle management of number reservations in the CRM system.
 * It ensures that reserved numbers are automatically released when their reservation period expires,
 * making them available for other agents to claim.
 *
 * FUNCTIONS INCLUDED:
 *
 * 1. handleReservationExpiry - Firestore trigger for reservation monitoring
 *    - Monitors numberPool document updates
 *    - Detects when reservations have expired
 *    - Triggers immediate reservation release processing
 *
 * 2. processReservationExpiry - Core reservation release logic
 *    - Atomically releases expired reservations
 *    - Updates number status back to 'open'
 *    - Clears reservation data (reservedBy, reservedAt, expiresAt)
 *    - Sends notifications to the user who had the reservation
 *
 * 3. triggerReservationExpiry - Frontend-triggered expiry
 *    - Callable function for frontend to trigger expiry when timer runs out
 *    - Provides immediate response to user actions
 *    - Ensures reservations are released even when browser is active
 *
 * 4. testReservationExpiry - Manual testing function
 *    - Allows manual testing of reservation expiry logic
 *    - Useful for debugging and system testing
 *    - Requires authentication for security
 *
 * 5. backupReservationExpiry - Scheduled backup processor
 *    - Runs every 30 minutes as a safety net
 *    - Catches expired reservations missed by other triggers
 *    - Ensures reservations are released even if browser is closed
 *
 * BUSINESS LOGIC:
 * - Reservation expiry detection and automatic release
 * - Number status management (reserved → open)
 * - User notification system for expired reservations
 * - Multi-layered approach for reliability (frontend + scheduled + trigger)
 *
 * All functions use Firestore transactions to ensure data consistency and are
 * deployed to the us-central1 region.
 * ===============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.backupReservationExpiry = exports.testReservationExpiry = exports.triggerReservationExpiry = exports.processReservationExpiry = exports.handleReservationExpiry = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("firebase-admin/firestore");
const admin = require("firebase-admin");
const functions = require("firebase-functions");
/**
 * ===============================================================================
 * FIRESTORE TRIGGER: Reservation Monitoring
 * ===============================================================================
 * This trigger monitors numberPool document updates and detects expired reservations.
 * It provides real-time detection of reservation expiry events.
 *
 * Detection Logic:
 * - Checks for numbers with status 'reserved' and valid reservation data
 * - Validates expiry timestamps against current time
 * - Triggers immediate processing of expired reservations
 *
 * Processing:
 * - Calls processReservationExpiry for atomic reservation release
 * - Handles errors gracefully with comprehensive logging
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
        // FAST SKIP: Ignore bulk upload flag removals
        if (afterData.bulkUpload === true ||
            (beforeData.bulkUpload === true && afterData.bulkUpload === false)) {
            return; // Silent skip for bulk operations
        }
        // Check if this is a reservation-related update
        const hasReservation = afterData.status === 'reserved' && afterData.reservedBy && afterData.expiresAt;
        if (!hasReservation) {
            console.log(`Number ${numberId} has no active reservation, skipping`);
            return;
        }
        const expiresAt = (_e = afterData.expiresAt) === null || _e === void 0 ? void 0 : _e.toDate();
        const now = new Date();
        console.log(`Checking reservation expiry for number ${numberId}: expiresAt=${expiresAt}, now=${now}, expired=${expiresAt && expiresAt <= now}`);
        // Check if the reservation has expired
        if (expiresAt && expiresAt <= now) {
            console.log(`Real-time reservation expiry detected for number ${numberId}`);
            await (0, exports.processReservationExpiry)(numberId);
        }
    }
    catch (error) {
        console.error(`Error in real-time reservation expiry for number ${event.params.numberId}:`, error);
    }
});
/**
 * ===============================================================================
 * CORE FUNCTION: Reservation Expiry Processor
 * ===============================================================================
 * This is the core function that handles the actual reservation release logic.
 * It performs atomic transactions to ensure data consistency during reservation expiry.
 *
 * Business Logic:
 * - Validates that the reservation has actually expired
 * - Checks that the number is still in 'reserved' status
 * - Releases the reservation (status → 'open', clears reservation data)
 * - Sends notification to the user who had the reservation
 * - Updates last status change timestamp
 *
 * Data Updates:
 * - status: 'reserved' → 'open'
 * - reservedBy: user ID → null
 * - reservedAt: timestamp → null
 * - expiresAt: timestamp → null
 * - lastStatusChange: updated to current timestamp
 *
 * Transaction Safety:
 * - Uses Firestore transactions to ensure atomicity
 * - Validates current state before making changes
 * - Handles concurrent access and race conditions
 *
 * @param numberId - The ID of the number document to process
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
                lastStatusChange: firestore_2.FieldValue.serverTimestamp()
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
 * ===============================================================================
 * CALLABLE FUNCTION: Frontend-Triggered Reservation Expiry
 * ===============================================================================
 * This callable function allows the frontend to trigger reservation expiry immediately
 * when a user's timer expires, providing responsive user experience.
 *
 * Features:
 * - Immediate response to frontend timer expiry events
 * - Ensures reservations are released as soon as the timer runs out
 * - Provides feedback to the frontend about processing status
 *
 * Input Parameters:
 * - numberId: The ID of the number whose reservation should expire (required)
 *
 * Returns:
 * - success: boolean indicating operation success
 * - message: Human-readable status message
 *
 * Authentication: Required (authenticated users only)
 * Usage: Called from frontend when reservation timer expires
 */
exports.triggerReservationExpiry = (0, https_1.onCall)({
    region: 'us-central1'
}, async (request) => {
    if (!request.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in to trigger reservation expiry");
    }
    const { numberId } = request.data;
    if (!numberId) {
        throw new functions.https.HttpsError("invalid-argument", "Number ID is required");
    }
    try {
        console.log(`Frontend triggered expiry for number ${numberId}`);
        await (0, exports.processReservationExpiry)(numberId);
        return {
            success: true,
            message: `Reservation expiry processed for number ${numberId}`
        };
    }
    catch (error) {
        console.error('Error triggering reservation expiry:', error);
        throw new functions.https.HttpsError("internal", `Failed to trigger expiry: ${error.message}`);
    }
});
/**
 * ===============================================================================
 * CALLABLE FUNCTION: Manual Reservation Expiry Testing
 * ===============================================================================
 * This callable function allows manual testing of reservation expiry logic.
 * It's useful for debugging, system testing, and administrative maintenance.
 *
 * Features:
 * - Manual triggering of reservation expiry for specific numbers
 * - Useful for testing and debugging reservation logic
 * - Provides detailed success/failure feedback
 *
 * Input Parameters:
 * - numberId: The ID of the number to test expiry for (required)
 *
 * Returns:
 * - success: boolean indicating operation success
 * - message: Human-readable status message
 *
 * Authentication: Required (authenticated users only)
 * Usage: Called from admin tools, debugging scripts, or testing utilities
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
        console.log(`Manual test: Processing reservation expiry for number ${numberId}`);
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
/**
 * ===============================================================================
 * SCHEDULED FUNCTION: Backup Reservation Expiry Safety Net
 * ===============================================================================
 * This scheduled function runs every 30 minutes as a comprehensive safety net
 * to catch any expired reservations that may have been missed by other triggers.
 *
 * Safety Features:
 * - Processes all expired reservations every 30 minutes
 * - Catches reservations missed by frontend triggers (e.g., browser closed)
 * - Ensures no expired reservations remain in the system
 * - Provides comprehensive coverage for edge cases
 *
 * Query Strategy:
 * - Finds all numbers with status 'reserved' and expired timestamps
 * - Processes each expired reservation individually
 * - Uses the same core processing logic as other triggers
 *
 * Reliability:
 * - Multi-layered approach ensures high reliability
 * - Works even when users close browsers or lose connectivity
 * - Prevents stale reservations from blocking the number pool
 */
exports.backupReservationExpiry = (0, scheduler_1.onSchedule)({
    schedule: 'every 30 minutes', // Check every 30 minutes for expired reservations
    region: 'us-central1'
}, async (event) => {
    try {
        console.log('Running backup reservation expiry check...');
        const now = new Date();
        const db = admin.firestore();
        // Find all reserved numbers that have expired
        const expiredQuery = db.collection('numberPool')
            .where('status', '==', 'reserved')
            .where('expiresAt', '<=', now);
        const snapshot = await expiredQuery.get();
        if (snapshot.empty) {
            console.log('Backup check: No expired reservations found');
            return;
        }
        console.log(`Backup check: Found ${snapshot.size} expired reservations, releasing them...`);
        // Process each expired reservation using the shared function
        for (const doc of snapshot.docs) {
            await (0, exports.processReservationExpiry)(doc.id);
        }
        console.log(`Backup check: Successfully released ${snapshot.size} expired reservations`);
    }
    catch (error) {
        console.error('Error in backup reservation expiry check:', error);
    }
});
//# sourceMappingURL=simpleReservationExpiry.js.map