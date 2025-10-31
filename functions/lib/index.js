"use strict";
/**
 * ===============================================================================
 * MAIN CLOUD FUNCTIONS FILE - CRM SYSTEM SERVER-SIDE LOGIC
 * ===============================================================================
 *
 * This file contains the core Firebase Cloud Functions for the CRM system.
 * It handles the main business logic including:
 *
 * CORE BUSINESS FUNCTIONS:
 * - Number claiming system (claimNumber)
 * - Lead rejection processing (processLeadRejection)
 * - Number availability checking (checkNumberAvailability)
 * - Admin password reset functionality (resetUserPassword)
 *
 * SEARCH & TOKENIZATION:
 * - Phone number search token generation for fast searching
 * - Automatic token maintenance for number pool documents
 * - Batch token backfill for existing documents
 *
 * WHATSAPP INTEGRATION:
 * - Webhook handler for inbound WhatsApp messages (whatsappWebhook)
 * - Message routing and lead resolution
 * - Consent parsing from interactive flows and text messages
 *
 * EXTERNAL API INTEGRATION:
 * - ETI API proxy for number status checking (checkNumberStatus, checkNumberStatusHTTP)
 * - CORS handling for client-side API calls
 *
 * UTILITY FUNCTIONS:
 * - Strike limit checking for number claims
 * - Statistics recomputation (recomputeNumberPoolStats)
 *
 * This file imports and exports functions from other modules:
 * - numberPoolStats.ts: Statistics management
 * - claimExpiry.ts: Claim expiry handling
 * - simpleReservationExpiry.ts: Reservation expiry management
 *
 * All functions are deployed to us-central1 region and handle authentication,
 * data validation, transaction management, and error handling.
 * ===============================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkNumberStatusHTTP = exports.checkNumberStatus = exports.recomputeNumberPoolStats = exports.uploadVerificationMediaToAzure = exports.bulkDNCImportStatus = exports.bulkDNCImport = exports.backupReservationExpiry = exports.triggerReservationExpiry = exports.testReservationExpiry = exports.processReservationExpiry = exports.handleReservationExpiry = exports.emergencyClaimExpiry = exports.smartBatchClaimExpiry = exports.realtimeClaimExpiry = exports.handleClaimExpiry = exports.updateNumberPoolStatsOnDelete = exports.updateNumberPoolStatsOnCreate = exports.resetUserPassword = exports.whatsappWebhook = exports.checkNumberAvailability = exports.processLeadRejection = exports.claimNumber = exports.backfillNumberTokens = exports.onNumberPoolWrite = void 0;
require("dotenv/config");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const numberPoolStats_1 = require("./numberPoolStats");
Object.defineProperty(exports, "updateNumberPoolStatsOnCreate", { enumerable: true, get: function () { return numberPoolStats_1.updateNumberPoolStatsOnCreate; } });
Object.defineProperty(exports, "updateNumberPoolStatsOnDelete", { enumerable: true, get: function () { return numberPoolStats_1.updateNumberPoolStatsOnDelete; } });
const azureStorage_1 = require("./azureStorage");
Object.defineProperty(exports, "uploadVerificationMediaToAzure", { enumerable: true, get: function () { return azureStorage_1.uploadVerificationMediaToAzure; } });
const claimExpiry_1 = require("./claimExpiry");
Object.defineProperty(exports, "handleClaimExpiry", { enumerable: true, get: function () { return claimExpiry_1.handleClaimExpiry; } });
Object.defineProperty(exports, "realtimeClaimExpiry", { enumerable: true, get: function () { return claimExpiry_1.realtimeClaimExpiry; } });
Object.defineProperty(exports, "smartBatchClaimExpiry", { enumerable: true, get: function () { return claimExpiry_1.smartBatchClaimExpiry; } });
Object.defineProperty(exports, "emergencyClaimExpiry", { enumerable: true, get: function () { return claimExpiry_1.emergencyClaimExpiry; } });
const simpleReservationExpiry_1 = require("./simpleReservationExpiry");
Object.defineProperty(exports, "handleReservationExpiry", { enumerable: true, get: function () { return simpleReservationExpiry_1.handleReservationExpiry; } });
Object.defineProperty(exports, "processReservationExpiry", { enumerable: true, get: function () { return simpleReservationExpiry_1.processReservationExpiry; } });
Object.defineProperty(exports, "testReservationExpiry", { enumerable: true, get: function () { return simpleReservationExpiry_1.testReservationExpiry; } });
Object.defineProperty(exports, "triggerReservationExpiry", { enumerable: true, get: function () { return simpleReservationExpiry_1.triggerReservationExpiry; } });
Object.defineProperty(exports, "backupReservationExpiry", { enumerable: true, get: function () { return simpleReservationExpiry_1.backupReservationExpiry; } });
// Initialize Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
// ===============================================================================
// SEARCH TOKENIZATION UTILITIES
// ===============================================================================
// These utilities generate searchable tokens from phone numbers to enable
// fast partial number searches in the number pool.
/**
 * Normalizes a string by removing all non-alphanumeric characters and converting to lowercase
 * This is used to clean phone numbers for consistent token generation
 *
 * @param input - The string to normalize
 * @returns Clean string with only alphanumeric characters in lowercase
 */
function normalizeString(input) {
    return (input || '').toString().replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
}
/**
 * Generates comprehensive search tokens from a phone number for fast partial matching
 * Creates multiple n-grams and search patterns to catch various user search patterns
 *
 * Algorithm generates:
 * 1. All 3-7 character substrings from last 7 digits
 * 2. Common consecutive digit groups (first 3, middle 3, last 3)
 * 3. Last 4 digits (very common search pattern)
 * 4. Overlapping 4-digit windows for comprehensive coverage
 * 5. Full number if it's 7 digits or less
 *
 * @param phoneNumber - The phone number to generate tokens for
 * @returns Array of searchable token strings
 */
function generatePhoneNumberTokens(phoneNumber) {
    const normalized = normalizeString(phoneNumber);
    if (normalized.length < 4)
        return []; // Skip very short numbers
    // Extract last 7 digits for primary search (ignoring country/area codes)
    const last7 = normalized.slice(-7);
    const tokens = new Set();
    // Generate comprehensive n-grams for different search patterns:
    // 1. All possible 3-7 character substrings from last 7 digits
    for (let len = 3; len <= Math.min(7, last7.length); len++) {
        for (let i = 0; i <= last7.length - len; i++) {
            tokens.add(last7.substring(i, i + len));
        }
    }
    // 2. Common search patterns: consecutive digit groups
    // Handle cases like searching "652" in "7652225"
    if (last7.length >= 6) {
        // First 3, middle 3, last 3 of the 7 digits
        tokens.add(last7.substring(0, 3)); // First 3
        if (last7.length >= 7) {
            tokens.add(last7.substring(2, 5)); // Middle 3 
            tokens.add(last7.substring(4, 7)); // Last 3
        }
    }
    // 3. Special handling for common UAE patterns (if applicable)
    // Last 4 digits (very common search pattern)
    if (last7.length >= 4) {
        tokens.add(last7.slice(-4));
    }
    // 4. Overlapping 4-digit windows for comprehensive coverage
    for (let i = 0; i <= last7.length - 4; i++) {
        tokens.add(last7.substring(i, i + 4));
    }
    // 5. Edge case: if original number is exactly 7 digits or less, also include full number
    if (normalized.length <= 7) {
        tokens.add(normalized);
    }
    return Array.from(tokens);
}
/**
 * Updates the search tokens for a number pool document
 * This function generates and stores normalized search tokens for fast number searching
 *
 * @param docRef - The Firestore document reference to update
 * @param data - The document data containing the phone number
 */
async function upsertTokensForNumberPoolDoc(docRef, data) {
    const numberRaw = (data && (data.number || data.msisdn || ''));
    const numberTokens = generatePhoneNumberTokens(numberRaw);
    await docRef.set({
        numberNormalized: normalizeString(numberRaw),
        numberTokens,
        tokensUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}
/**
 * ===============================================================================
 * FIRESTORE TRIGGER: Automatic Token Generation
 * ===============================================================================
 * This trigger automatically maintains search tokens for number pool documents.
 * It fires whenever a document in the 'numberPool' collection is created or updated.
 *
 * Token Update Conditions:
 * 1. numberTokens field is missing
 * 2. Phone number has changed since last token update
 * 3. This is a new document
 *
 * This ensures that all search tokens are always up-to-date for fast searching.
 */
exports.onNumberPoolWrite = functions.firestore
    .document('numberPool/{id}')
    .onWrite(async (change, context) => {
    const after = change.after;
    if (!after.exists)
        return;
    const data = after.data();
    const before = change.before.exists ? change.before.data() : null;
    // Only update tokens if:
    // 1. numberTokens are missing, OR
    // 2. number changed since last token update, OR
    // 3. new document
    const needsTokenUpdate = !(data === null || data === void 0 ? void 0 : data.numberTokens) ||
        (before && (before.number !== data.number)) ||
        !before; // new document
    if (!needsTokenUpdate)
        return;
    try {
        await upsertTokensForNumberPoolDoc(after.ref, after.data());
    }
    catch (e) {
        console.error('Failed to upsert tokens for numberPool doc', after.id, e);
    }
});
/**
 * ===============================================================================
 * CALLABLE FUNCTION: Batch Token Backfill
 * ===============================================================================
 * This function allows administrators to backfill search tokens for existing
 * number pool documents that may be missing tokens or have outdated tokens.
 *
 * Features:
 * - Processes documents in configurable batch sizes (default: 500, max: 1000)
 * - Supports pagination with cursor-based iteration
 * - Handles large datasets efficiently with batched processing
 *
 * Authentication: Required (authenticated users only)
 * Usage: Call from admin dashboard or maintenance scripts
 */
exports.backfillNumberTokens = functions.https.onCall(async (data, context) => {
    // Optional auth check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Auth required');
    }
    // Only allow admins (optional)
    try {
        const batchSize = Math.min(Number((data === null || data === void 0 ? void 0 : data.batchSize) || 500), 1000);
        const cursor = data === null || data === void 0 ? void 0 : data.cursor;
        let queryRef = db.collection('numberPool').orderBy(admin.firestore.FieldPath.documentId()).limit(batchSize);
        if (cursor)
            queryRef = queryRef.startAfter(cursor);
        const snap = await queryRef.get();
        const writes = [];
        snap.docs.forEach(doc => {
            writes.push(upsertTokensForNumberPoolDoc(doc.ref, doc.data()));
        });
        await Promise.all(writes);
        const nextCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1].id : null;
        return { processed: snap.size, nextCursor };
    }
    catch (e) {
        console.error('backfillNumberTokens failed', e);
        throw new functions.https.HttpsError('internal', 'Backfill failed');
    }
});
/**
 * ===============================================================================
 * CALLABLE FUNCTION: Number Claiming System
 * ===============================================================================
 * This function handles the complete number claiming workflow for agents.
 * It manages the atomic process of claiming a number with full validation and notifications.
 *
 * Business Logic:
 * - Validates user authentication and number availability
 * - Enforces strike limits (max 2 claims per 24 hours)
 * - Checks for existing claims and number status
 * - Updates number document with new claim in transaction
 * - Sends notifications to original agent if applicable
 *
 * Input Parameters:
 * - numberId: The ID of the number to claim (required)
 * - userId: The ID of the user making the claim (required)
 *
 * Returns:
 * - success: boolean indicating operation success
 * - message: Human-readable status message
 * - claim: The claim object that was created
 *
 * Authentication: Required (authenticated users only)
 * Transaction: Yes (ensures atomicity across multiple document updates)
 */
exports.claimNumber = functions.https.onCall(async (data, context) => {
    // Ensure user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in to claim a number");
    }
    const { numberId, userId } = data;
    if (!numberId || !userId) {
        throw new functions.https.HttpsError("invalid-argument", "Number ID and User ID are required");
    }
    // Verify the user exists
    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
        throw new functions.https.HttpsError("not-found", "User not found");
    }
    // Check if user has reached strike limit (2 strikes in 24 hours)
    const strikeLimit = await checkStrikeLimit(userId);
    if (!strikeLimit.canStrike) {
        throw new functions.https.HttpsError("permission-denied", `Strike limit reached. You can strike again ${strikeLimit.nextAvailableTime}`);
    }
    // Run in a transaction to ensure atomicity
    return db.runTransaction(async (transaction) => {
        // Get the number document
        const numberRef = db.collection("numberPool").doc(numberId);
        const numberDoc = await transaction.get(numberRef);
        if (!numberDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Number not found");
        }
        const numberData = numberDoc.data();
        if (!numberData) {
            throw new functions.https.HttpsError("internal", "Number data is missing");
        }
        // Check if number is already claimed by this user
        if (numberData.claims) {
            const existingClaim = numberData.claims.find((claim) => claim.userId === userId && claim.status === "pending");
            if (existingClaim) {
                throw new functions.https.HttpsError("already-exists", "You have already claimed this number");
            }
        }
        // Check if number is available for claiming
        if (numberData.status === "activated") {
            throw new functions.https.HttpsError("failed-precondition", "This number is already activated and cannot be claimed");
        }
        // Add the claim to the number
        const newClaim = {
            userId,
            claimedAt: admin.firestore.Timestamp.now(),
            status: "pending"
        };
        // Update the number document
        transaction.update(numberRef, {
            claims: FieldValue.arrayUnion(newClaim),
            lastClaimedAt: admin.firestore.Timestamp.now()
        });
        // Create notification for the original agent
        if (numberData.leadId) {
            const leadRef = db.collection("leads").doc(numberData.leadId);
            const leadDoc = await transaction.get(leadRef);
            if (leadDoc.exists) {
                const leadData = leadDoc.data();
                if (leadData && leadData.agentId && leadData.agentId !== userId) {
                    const notificationRef = db.collection("notifications").doc();
                    transaction.set(notificationRef, {
                        userId: leadData.agentId,
                        type: "number_claimed",
                        title: "Number Claimed",
                        message: `Your number ${numberData.number} has been claimed by another agent`,
                        read: false,
                        createdAt: admin.firestore.Timestamp.now(),
                        data: {
                            numberId,
                            leadId: numberData.leadId
                        }
                    });
                }
            }
        }
        return {
            success: true,
            message: "Number claimed successfully",
            claim: newClaim
        };
    });
});
/**
 * ===============================================================================
 * CALLABLE FUNCTION: Lead Rejection Processing
 * ===============================================================================
 * This function handles the complete workflow when a lead is rejected by a verifier.
 * It updates the lead status and manages the number pool queue system.
 *
 * Business Logic:
 * - Updates lead status to "rejected" with verification notes
 * - Processes each number in the rejected lead's plans
 * - Manages claim queue transitions (moves next agent to active claim)
 * - Releases numbers back to "open" status if no queue exists
 * - Sends notifications to relevant agents and the original lead creator
 * - Handles 2-minute claim windows for queued agents
 *
 * Input Parameters:
 * - leadId: The ID of the lead being rejected (required)
 * - verifierId: The ID of the verifier rejecting the lead (required)
 * - verificationNote: Optional notes about why the lead was rejected
 *
 * Returns:
 * - success: boolean indicating operation success
 * - message: Human-readable status message
 *
 * Authentication: Required (authenticated users only)
 * Transaction: Yes (ensures atomicity across lead and number updates)
 */
exports.processLeadRejection = functions.https.onCall(async (data, context) => {
    // Ensure user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in to reject a lead");
    }
    const { leadId, verificationNote, verifierId } = data;
    if (!leadId || !verifierId) {
        throw new functions.https.HttpsError("invalid-argument", "Lead ID and Verifier ID are required");
    }
    // Run in a transaction to ensure atomicity
    return db.runTransaction(async (transaction) => {
        // Get the lead document
        const leadRef = db.collection("leads").doc(leadId);
        const leadDoc = await transaction.get(leadRef);
        if (!leadDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Lead not found");
        }
        const leadData = leadDoc.data();
        if (!leadData) {
            throw new functions.https.HttpsError("internal", "Lead data is missing");
        }
        // Update lead status
        transaction.update(leadRef, {
            status: "rejected",
            verifierId,
            verificationNote: verificationNote || "",
            updatedAt: admin.firestore.Timestamp.now()
        });
        // Process each number in the lead
        const plans = leadData.plans || [];
        for (const plan of plans) {
            if (!plan.numberId)
                continue;
            const numberRef = db.collection("numberPool").doc(plan.numberId);
            const numberDoc = await transaction.get(numberRef);
            if (!numberDoc.exists)
                continue;
            const numberData = numberDoc.data();
            if (!numberData)
                continue;
            // Check if there's a claim queue
            if (numberData.claimQueue && numberData.claimQueue.length > 0) {
                // Get the next agent in queue
                const nextClaim = numberData.claimQueue[0];
                const remainingQueue = numberData.claimQueue.slice(1);
                // Update the number with the next claim
                transaction.update(numberRef, {
                    status: "reserved",
                    lastStatusChange: admin.firestore.Timestamp.now(),
                    claimingAgentId: nextClaim.agentId,
                    claimingStartedAt: admin.firestore.Timestamp.now(),
                    claimingExpiresAt: new Date(Date.now() + 2 * 60 * 1000), // 2 minutes
                    claimQueue: remainingQueue,
                    leadId
                });
                // If there's a second claim, send notification
                if (remainingQueue.length > 0) {
                    const notificationRef = db.collection("notifications").doc();
                    transaction.set(notificationRef, {
                        userId: remainingQueue[0].agentId,
                        type: "number_claimed",
                        title: "Number Claim Started",
                        message: "The number is now available for your claim. You have 2 minutes to take ownership.",
                        read: false,
                        createdAt: admin.firestore.Timestamp.now(),
                        numberId: plan.numberId
                    });
                }
            }
            else {
                // No claims in queue, set to open
                transaction.update(numberRef, {
                    status: "open",
                    lastStatusChange: admin.firestore.Timestamp.now(),
                    claimingAgentId: null,
                    claimingStartedAt: null,
                    claimingExpiresAt: null,
                    claimQueue: [],
                    leadId
                });
            }
        }
        // Send notification to the agent
        if (leadData.agentId) {
            const notificationRef = db.collection("notifications").doc();
            transaction.set(notificationRef, {
                userId: leadData.agentId,
                type: "lead_verification",
                title: "Lead Rejected",
                message: `Your lead has been rejected${verificationNote ? `: ${verificationNote}` : ""}`,
                read: false,
                createdAt: admin.firestore.Timestamp.now(),
                data: {
                    leadId
                }
            });
        }
        return {
            success: true,
            message: "Lead rejected successfully"
        };
    });
});
/**
 * ===============================================================================
 * CALLABLE FUNCTION: Number Availability Checker
 * ===============================================================================
 * This function checks if a specific number is available for claiming.
 * It validates the number's current status and any active claim windows.
 *
 * Business Logic:
 * - Retrieves number document and validates existence
 * - Checks if number status is "open" (immediately available)
 * - Validates if number is "reserved" but claim has expired
 * - Returns detailed availability information
 *
 * Input Parameters:
 * - numberId: The ID of the number to check (required)
 *
 * Returns:
 * - isAvailable: boolean indicating if number can be claimed now
 * - status: Current status of the number ("open", "reserved", etc.)
 * - expiresAt: Timestamp when current claim expires (if applicable)
 *
 * Authentication: Required (authenticated users only)
 */
exports.checkNumberAvailability = functions.https.onCall(async (data, context) => {
    // Ensure user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in to check number availability");
    }
    const { numberId } = data;
    if (!numberId) {
        throw new functions.https.HttpsError("invalid-argument", "Number ID is required");
    }
    // Get the number document
    const numberRef = db.collection("numberPool").doc(numberId);
    const numberDoc = await numberRef.get();
    if (!numberDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Number not found");
    }
    const numberData = numberDoc.data();
    if (!numberData) {
        throw new functions.https.HttpsError("internal", "Number data is missing");
    }
    // Check if number is available for claiming
    const isAvailable = numberData.status === "open" ||
        (numberData.status === "reserved" &&
            numberData.claimingExpiresAt &&
            numberData.claimingExpiresAt.toDate() < new Date());
    return {
        isAvailable,
        status: numberData.status,
        expiresAt: numberData.claimingExpiresAt ? numberData.claimingExpiresAt.toDate() : null
    };
});
/**
 * ===============================================================================
 * HTTP WEBOOK: WhatsApp Message Handler
 * ===============================================================================
 * This webhook handles inbound messages from WhatsApp Business API.
 * It processes customer messages, routes them to appropriate leads, and parses consent data.
 *
 * Features:
 * - WhatsApp webhook verification (GET requests)
 * - Message routing via leadId metadata or phone number matching
 * - Consent parsing from text messages and interactive flows
 * - Unmatched message storage for later reconciliation
 * - Batch processing for multiple messages
 *
 * Message Routing Logic:
 * 1. Extract leadId from webhook metadata or query parameters
 * 2. Fallback to WhatsApp routing map (48-hour window)
 * 3. Final fallback to phone number matching (last 8/10 digits)
 *
 * Consent Parsing:
 * - Text-based consent detection using keyword matching
 * - Interactive flow (NFM) consent parsing from JSON responses
 * - Stores parsed consent data in lead's WhatsApp logs
 *
 * HTTP Methods:
 * - GET: Webhook verification (hub.verify_token validation)
 * - POST: Message processing and storage
 *
 * Authentication: WhatsApp verify token validation
 */
exports.whatsappWebhook = functions.https.onRequest(async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    try {
        const cfg = functions.config();
        const configuredToken = (cfg && cfg.whatsapp && cfg.whatsapp.verify_token) || process.env.WHATSAPP_VERIFY_TOKEN;
        console.log('whatsappWebhook', {
            method: req.method,
            contentType: req.headers['content-type'],
            query: req.query,
            hasBody: !!req.body,
            bodyType: typeof req.body
        });
        // Ensure JSON body parsed
        if (typeof req.body === 'string') {
            try {
                req.body = JSON.parse(req.body);
            }
            catch (e) {
                console.warn('Failed to parse string body as JSON');
            }
        }
        if (req.method === 'GET') {
            // WhatsApp webhook verification
            const mode = req.query['hub.mode'];
            const token = req.query['hub.verify_token'];
            const challenge = req.query['hub.challenge'];
            if (mode === 'subscribe' && token === configuredToken) {
                res.status(200).send(challenge);
                return;
            }
            res.sendStatus(403);
            return;
        }
        if (req.method !== 'POST') {
            res.sendStatus(405);
            return;
        }
        const body = req.body || {};
        // Extract leadId from metadata or query; adjust based on your integration
        let leadId = req.query.leadId || ((_a = body === null || body === void 0 ? void 0 : body.metadata) === null || _a === void 0 ? void 0 : _a.leadId) || ((_g = (_f = (_e = (_d = (_c = (_b = body === null || body === void 0 ? void 0 : body.entry) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.changes) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.value) === null || _f === void 0 ? void 0 : _f.metadata) === null || _g === void 0 ? void 0 : _g.leadId);
        const messages = ((_m = (_l = (_k = (_j = (_h = body === null || body === void 0 ? void 0 : body.entry) === null || _h === void 0 ? void 0 : _h[0]) === null || _j === void 0 ? void 0 : _j.changes) === null || _k === void 0 ? void 0 : _k[0]) === null || _l === void 0 ? void 0 : _l.value) === null || _m === void 0 ? void 0 : _m.messages) || [];
        console.log('whatsappWebhook received messages:', Array.isArray(messages) ? messages.length : 0);
        if (messages.length === 0) {
            res.sendStatus(200);
            return;
        }
        const batch = db.batch();
        async function getLatestLeadByCustomerNumber(value) {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
            try {
                const snap = await db.collection('leads')
                    .where('customerNumber', '==', value)
                    .get();
                if (snap.empty)
                    return null;
                let newest = snap.docs[0];
                let newestTs = (((_c = (_b = (_a = newest.data()) === null || _a === void 0 ? void 0 : _a.createdAt) === null || _b === void 0 ? void 0 : _b.toDate) === null || _c === void 0 ? void 0 : _c.call(_b)) || ((_d = newest.data()) === null || _d === void 0 ? void 0 : _d.createdAt) || ((_f = (_e = newest.createTime) === null || _e === void 0 ? void 0 : _e.toDate) === null || _f === void 0 ? void 0 : _f.call(_e)));
                for (const doc of snap.docs) {
                    const data = doc.data();
                    const ts = (((_h = (_g = data === null || data === void 0 ? void 0 : data.createdAt) === null || _g === void 0 ? void 0 : _g.toDate) === null || _h === void 0 ? void 0 : _h.call(_g)) || (data === null || data === void 0 ? void 0 : data.createdAt) || ((_k = (_j = doc.createTime) === null || _j === void 0 ? void 0 : _j.toDate) === null || _k === void 0 ? void 0 : _k.call(_j)));
                    if (!newestTs || (ts && ts > newestTs)) {
                        newest = doc;
                        newestTs = ts;
                    }
                }
                return newest;
            }
            catch (e) {
                console.warn('getLatestLeadByCustomerNumber failed:', e);
                return null;
            }
        }
        for (const msg of messages) {
            const from = (msg.from || '').replace(/\D/g, '');
            const text = ((_o = msg.text) === null || _o === void 0 ? void 0 : _o.body) || '';
            console.log('Inbound message from:', from, 'text length:', text.length);
            // Resolve leadId via routing map first; we will still prefer the newest lead by number
            let resolvedLeadId = leadId;
            if (!resolvedLeadId) {
                try {
                    const routingSnap = await db.collection('whatsappRouting').doc(from).get();
                    if (routingSnap.exists) {
                        const route = routingSnap.data();
                        const sentAt = ((_q = (_p = route === null || route === void 0 ? void 0 : route.sentAt) === null || _p === void 0 ? void 0 : _p.toDate) === null || _q === void 0 ? void 0 : _q.call(_p)) || (route === null || route === void 0 ? void 0 : route.sentAt);
                        const within48h = sentAt ? (Date.now() - new Date(sentAt).getTime() < 48 * 60 * 60 * 1000) : true;
                        if ((route === null || route === void 0 ? void 0 : route.leadId) && within48h) {
                            resolvedLeadId = route.leadId;
                        }
                    }
                }
                catch (e) {
                    console.warn('Routing map lookup failed:', e);
                }
            }
            // Normalize WhatsApp number 971XXXXXXXXX -> 0XXXXXXXXX and prefer the newest lead by customerNumber
            try {
                let normalizedUae = from;
                if (from.startsWith('971')) {
                    normalizedUae = '0' + from.slice(3);
                    console.log(`Normalized ${from} -> ${normalizedUae} (971 -> 0)`);
                }
                else if (from.startsWith('+971')) {
                    normalizedUae = '0' + from.slice(4);
                    console.log(`Normalized ${from} -> ${normalizedUae} (+971 -> 0)`);
                }
                else if (!from.startsWith('0') && from.length === 10) {
                    normalizedUae = '0' + from;
                    console.log(`Normalized ${from} -> ${normalizedUae} (10-digit -> 0)`);
                }
                const latestLeadDoc = await getLatestLeadByCustomerNumber(normalizedUae);
                if (latestLeadDoc) {
                    const latestId = latestLeadDoc.id;
                    if (resolvedLeadId && resolvedLeadId !== latestId) {
                        console.log(`Overriding resolvedLeadId ${resolvedLeadId} -> latest by number ${latestId}`);
                    }
                    resolvedLeadId = latestId;
                }
                else if (!resolvedLeadId) {
                    console.log(`No lead found by customerNumber (${normalizedUae}) and no prior resolution`);
                }
            }
            catch (e) {
                console.warn('Latest lead resolution by customerNumber failed:', e);
            }
            if (!resolvedLeadId) {
                // Store unmatched for later reconciliation
                const unmatchedRef = db.collection('whatsappInboundUnmatched').doc();
                batch.set(unmatchedRef, {
                    from,
                    last8: from.slice(-8),
                    last10: from.slice(-10),
                    messageText: text,
                    payload: msg,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
                console.warn('No lead resolved; stored unmatched message for from:', from);
                continue;
            }
            const logRef = db.collection('leads').doc(resolvedLeadId).collection('whatsappLogs').doc();
            console.log('Resolved leadId:', resolvedLeadId, 'writing log doc:', logRef.id);
            // Consent parsing: text and interactive flow (nfm_reply)
            const lower = (text || '').toLowerCase();
            const truthy = (k) => lower.includes('accept') || lower.includes('agree') || lower.includes('agreed') || lower.includes('yes') || lower.includes(k.toLowerCase());
            let consents = {
                acceptAllTerms: truthy('terms'),
                ownershipAfterContract: truthy('chosen number becomes yours') || truthy('ownership'),
                usageRestrictionsAgree: truthy('transfer of ownership') || truthy('porting out') || truthy('switching to prepaid') || truthy('restrictions'),
                proRatedAgree: truthy('pro-rated') || truthy('prorated'),
                gracePeriodAcknowledge: truthy('five days') || truthy('cancel the plan without any charges'),
                dataAccuracyAcknowledge: truthy('information provided regarding the number and plan is accurate') || truthy('accurate')
            };
            try {
                if (msg.type === 'interactive' && ((_s = (_r = msg.interactive) === null || _r === void 0 ? void 0 : _r.nfm_reply) === null || _s === void 0 ? void 0 : _s.response_json)) {
                    const respJsonStr = msg.interactive.nfm_reply.response_json;
                    const resp = JSON.parse(respJsonStr);
                    const isTrueByIncl = (subs) => {
                        for (const k of Object.keys(resp || {})) {
                            const kl = k.toLowerCase();
                            if (subs.some(s => kl.includes(s)) && resp[k] === true)
                                return true;
                        }
                        return false;
                    };
                    const ownershipKey = ['chosen_number_becomes_yours_only_after_completing_the_contract'];
                    const restrictionsKey = ['transfer_of_ownership_is_not_permitted', 'porting_out_to_other_telecom_providers_is_restricted', 'switching_to_prepaid_are_not_allowed'];
                    const proratedKey = ['prorated', 'pro_rated'];
                    const graceKey = ['cancel_the_plan_without_any_charges', 'five_days'];
                    const accuracyKey = ['information_provided_regarding_the_number_and_plan_is_accurate'];
                    const acceptAllKey = ['accept_all_the_terms'];
                    consents = {
                        acceptAllTerms: isTrueByIncl(acceptAllKey) || consents.acceptAllTerms,
                        ownershipAfterContract: isTrueByIncl(ownershipKey) || consents.ownershipAfterContract,
                        usageRestrictionsAgree: isTrueByIncl(restrictionsKey) || consents.usageRestrictionsAgree,
                        proRatedAgree: isTrueByIncl(proratedKey) || consents.proRatedAgree,
                        gracePeriodAcknowledge: isTrueByIncl(graceKey) || consents.gracePeriodAcknowledge,
                        dataAccuracyAcknowledge: isTrueByIncl(accuracyKey) || consents.dataAccuracyAcknowledge
                    };
                }
            }
            catch (e) {
                console.warn('Failed to parse interactive flow response_json:', e);
            }
            batch.set(logRef, {
                direction: 'inbound',
                from,
                messageText: text,
                payload: msg,
                consents,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        await batch.commit();
        console.log('Batch commit complete for', messages.length, 'message(s)');
        res.sendStatus(200);
        return;
    }
    catch (err) {
        console.error('whatsappWebhook error', err);
        res.sendStatus(500);
        return;
    }
});
/**
 * ===============================================================================
 * CALLABLE FUNCTION: Admin Password Reset
 * ===============================================================================
 * This function allows administrators to reset passwords for any user in the system.
 * It integrates with Firebase Authentication and maintains audit trail in Firestore.
 *
 * Business Logic:
 * - Validates requesting user has admin role
 * - Updates password in Firebase Authentication
 * - Records reset information in user document for audit trail
 * - Sets passwordResetRequired flag to force user to change password
 *
 * Input Parameters:
 * - userId: The ID of the user whose password to reset (required)
 * - newPassword: The new password to set (required)
 *
 * Returns:
 * - success: boolean indicating operation success
 * - message: Human-readable status message
 *
 * Authentication: Required (admin role required)
 * Audit Trail: Records who reset the password and when
 */
exports.resetUserPassword = functions.https.onCall(async (data, context) => {
    // Ensure user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "You must be logged in to reset a password");
    }
    const { userId, newPassword } = data;
    if (!userId || !newPassword) {
        throw new functions.https.HttpsError("invalid-argument", "User ID and new password are required");
    }
    // Verify the requesting user is an admin
    const adminUserRef = db.collection("users").doc(context.auth.uid);
    const adminUserDoc = await adminUserRef.get();
    if (!adminUserDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Admin user not found");
    }
    const adminUserData = adminUserDoc.data();
    if (!adminUserData || adminUserData.role !== 'admin') {
        throw new functions.https.HttpsError("permission-denied", "Only admins can reset passwords");
    }
    try {
        // Update the user's password using Firebase Admin SDK
        await admin.auth().updateUser(userId, {
            password: newPassword
        });
        // Update the user document with reset information
        const userRef = db.collection("users").doc(userId);
        await userRef.update({
            passwordResetRequired: true,
            passwordResetBy: context.auth.uid,
            passwordResetAt: admin.firestore.Timestamp.now(),
            updatedAt: admin.firestore.Timestamp.now()
        });
        return {
            success: true,
            message: "Password has been successfully reset"
        };
    }
    catch (error) {
        console.error('Password reset failed:', error);
        if (error.code === 'auth/user-not-found') {
            throw new functions.https.HttpsError("not-found", "User not found in Firebase Auth");
        }
        else if (error.code === 'auth/invalid-password') {
            throw new functions.https.HttpsError("invalid-argument", "The new password is invalid");
        }
        else {
            throw new functions.https.HttpsError("internal", "Failed to reset password: " + error.message);
        }
    }
});
/**
 * ===============================================================================
 * UTILITY FUNCTION: Strike Limit Checker
 * ===============================================================================
 * This helper function enforces business rules for number claiming by checking
 * if a user has exceeded their claim strike limit within a 24-hour period.
 *
 * Business Rules:
 * - Maximum of 2 claims per user per 24-hour period
 * - Counts all claims made in the last 24 hours across all numbers
 * - Returns detailed information about remaining strikes and next available time
 *
 * @param userId - The ID of the user to check strike limit for
 * @returns Object containing strike limit information:
 *   - remainingStrikes: Number of claims remaining (0-2)
 *   - lastStrikeTime: Timestamp of most recent claim
 *   - canStrike: Boolean indicating if user can make another claim
 *   - nextAvailableTime: Human-readable time when user can claim again
 */
async function checkStrikeLimit(userId) {
    // Get all claims made by this agent in the last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const numbersQuery = db.collection("numberPool")
        .where("claims", "!=", null);
    const numbersSnapshot = await numbersQuery.get();
    let strikeCount = 0;
    let lastStrikeTime = null;
    numbersSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const claims = data.claims || [];
        claims.forEach((claim) => {
            if (claim.userId === userId && claim.claimedAt.toDate() > twentyFourHoursAgo) {
                strikeCount++;
                const claimTime = claim.claimedAt.toDate();
                if (!lastStrikeTime || claimTime > lastStrikeTime) {
                    lastStrikeTime = claimTime;
                }
            }
        });
    });
    const remainingStrikes = Math.max(0, 2 - strikeCount);
    const canStrike = remainingStrikes > 0;
    let nextAvailableTime = "";
    if (lastStrikeTime !== null) {
        const nextAvailable = new Date(lastStrikeTime.getTime() + 24 * 60 * 60 * 1000);
        nextAvailableTime = nextAvailable.toLocaleString();
    }
    return {
        remainingStrikes,
        lastStrikeTime,
        canStrike,
        nextAvailableTime
    };
}
// Export bulk DNC import functions
var bulkDNCImport_1 = require("./bulkDNCImport");
Object.defineProperty(exports, "bulkDNCImport", { enumerable: true, get: function () { return bulkDNCImport_1.bulkDNCImport; } });
Object.defineProperty(exports, "bulkDNCImportStatus", { enumerable: true, get: function () { return bulkDNCImport_1.bulkDNCImportStatus; } });
/**
 * ===============================================================================
 * CALLABLE FUNCTION: Statistics Recalculation
 * ===============================================================================
 * This function manually recalculates number pool statistics.
 * Useful for administrative maintenance or after bulk data operations.
 *
 * Authentication: Required (authenticated users only)
 * Usage: Call from admin dashboard or maintenance scripts
 */
exports.recomputeNumberPoolStats = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Auth required');
    }
    try {
        await (0, numberPoolStats_1.initializeNumberPoolStats)();
        return { ok: true };
    }
    catch (e) {
        console.error('recomputeNumberPoolStats failed', e);
        throw new functions.https.HttpsError('internal', (e === null || e === void 0 ? void 0 : e.message) || 'Failed to recompute stats');
    }
});
/**
 * ===============================================================================
 * CALLABLE FUNCTION: ETI API Number Status Checker
 * ===============================================================================
 * This function serves as a proxy to the ETI API for checking number status.
 * It bypasses CORS issues and handles authentication on the server side.
 *
 * Features:
 * - Validates and cleans phone number input (10-11 digits)
 * - Makes HTTP request to ETI API (quickpay.riuman.com)
 * - Handles timeouts and error responses gracefully
 * - Parses and returns structured response data
 *
 * Input Parameters:
 * - number: Phone number to check (10-11 digits, cleaned automatically)
 *
 * Returns:
 * - isActive: Boolean indicating if number is active
 * - status: HTTP status from ETI API
 * - message: Human-readable status message
 * - etiResponse: Full response from ETI API for debugging
 *
 * Authentication: Required (authenticated users only)
 * Timeout: 10 seconds
 */
exports.checkNumberStatus = functions.https.onCall(async (data, context) => {
    console.log('checkNumberStatus function called with data:', data);
    if (!context.auth) {
        console.log('Authentication failed');
        throw new functions.https.HttpsError('unauthenticated', 'Auth required');
    }
    const { number } = data;
    if (!number) {
        console.log('Number parameter missing');
        throw new functions.https.HttpsError('invalid-argument', 'Number is required');
    }
    // Clean the number (remove any spaces, dashes, etc.)
    const cleanNumber = number.replace(/[\s\-\(\)]/g, '');
    console.log('Cleaned number:', cleanNumber);
    // Validate number format
    if (!/^\d{10,11}$/.test(cleanNumber)) {
        console.log('Invalid number format:', cleanNumber);
        throw new functions.https.HttpsError('invalid-argument', 'Invalid number format');
    }
    try {
        const url = `https://quickpay.riuman.com/number-check-eti?number=${cleanNumber}`;
        console.log('Making request to:', url);
        const response = await new Promise((resolve, reject) => {
            const https = require('https');
            const http = require('http');
            const client = url.startsWith('https') ? https : http;
            const request = client.get(url, {
                timeout: 10000, // Reduced from 15s to 10s
                headers: {
                    'User-Agent': 'Firebase-Cloud-Function/1.0'
                }
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    console.log('ETI API response - Status:', res.statusCode, 'Data:', data);
                    resolve({
                        status: res.statusCode,
                        data: data
                    });
                });
            });
            request.on('error', (error) => {
                console.error('Request error:', error);
                reject(error);
            });
            request.on('timeout', () => {
                console.error('Request timeout');
                request.destroy();
                reject(new Error('Request timeout'));
            });
        });
        // Parse the ETI API JSON response
        let etiResponse;
        try {
            etiResponse = JSON.parse(response.data);
            console.log('Parsed ETI API response:', etiResponse);
        }
        catch (parseError) {
            console.error('Failed to parse ETI API response:', response.data);
            etiResponse = { status: 500, message: 'Invalid response format' };
        }
        // Determine if number is active based on ETI API response
        const isActive = etiResponse.status === 200;
        const result = {
            isActive: isActive,
            status: etiResponse.status,
            message: isActive ? 'Number is active' : 'Number is not active',
            etiResponse: etiResponse // Include full response for debugging
        };
        console.log('Returning result:', result);
        return result;
    }
    catch (error) {
        console.error('Error checking number status:', error);
        // Return a more specific error based on the error type
        if (error.message === 'Request timeout') {
            throw new functions.https.HttpsError('deadline-exceeded', 'Request timeout - ETI API took too long to respond');
        }
        throw new functions.https.HttpsError('internal', `Unable to verify number status: ${error.message}`);
    }
});
/**
 * ===============================================================================
 * HTTP FUNCTION: ETI API Proxy with CORS Support
 * ===============================================================================
 * This HTTP function provides the same ETI API number checking functionality
 * as the callable function but with better CORS handling for direct HTTP requests.
 *
 * Features:
 * - Full CORS headers for cross-origin requests
 * - OPTIONS method handling for preflight requests
 * - Same validation and API integration as callable version
 * - HTTP status codes for better error handling
 *
 * HTTP Methods:
 * - OPTIONS: Preflight CORS handling
 * - POST: Number status checking
 *
 * Request Body:
 * - number: Phone number to check (required)
 * - uid: User ID for authentication (required)
 *
 * Response: JSON object with same structure as callable version
 * CORS: Enabled for all origins with appropriate headers
 */
exports.checkNumberStatusHTTP = functions.https.onRequest(async (req, res) => {
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    // Only allow POST requests
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }
    try {
        const { number, uid } = req.body;
        if (!number) {
            res.status(400).json({ error: 'Number is required' });
            return;
        }
        if (!uid) {
            res.status(401).json({ error: 'Authentication required' });
            return;
        }
        // Clean the number (remove any spaces, dashes, etc.)
        const cleanNumber = number.replace(/[\s\-\(\)]/g, '');
        // Validate number format
        if (!/^\d{10,11}$/.test(cleanNumber)) {
            res.status(400).json({ error: 'Invalid number format' });
            return;
        }
        const url = `https://quickpay.riuman.com/number-check-eti?number=${cleanNumber}`;
        const response = await new Promise((resolve, reject) => {
            const https = require('https');
            const http = require('http');
            const client = url.startsWith('https') ? https : http;
            const request = client.get(url, {
                timeout: 10000, // Reduced from 15s to 10s
                headers: {
                    'User-Agent': 'Firebase-Cloud-Function/1.0'
                }
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    console.log('ETI API raw response - Status:', res.statusCode, 'Data:', data);
                    resolve({
                        status: res.statusCode,
                        data: data
                    });
                });
            });
            request.on('error', (error) => {
                reject(error);
            });
            request.on('timeout', () => {
                request.destroy();
                reject(new Error('Request timeout'));
            });
        });
        // Parse the ETI API JSON response
        let etiResponse;
        try {
            etiResponse = JSON.parse(response.data);
            console.log('Parsed ETI API response:', etiResponse);
        }
        catch (parseError) {
            console.error('Failed to parse ETI API response:', response.data);
            etiResponse = { status: 500, message: 'Invalid response format' };
        }
        // Determine if number is active based on ETI API response
        const isActive = etiResponse.status === 200;
        const result = {
            isActive: isActive,
            status: etiResponse.status,
            message: isActive ? 'Number is active' : 'Number is not active',
            etiResponse: etiResponse // Include full response for debugging
        };
        res.status(200).json(result);
    }
    catch (error) {
        console.error('Error checking number status:', error);
        // If it's a timeout, return a more specific error
        if (error.message === 'Request timeout') {
            res.status(408).json({
                error: 'ETI API timeout - please try again',
                isActive: false,
                status: 408,
                message: 'API timeout - assuming number is inactive'
            });
            return;
        }
        res.status(500).json({
            error: 'Unable to verify number status',
            isActive: false,
            status: 500,
            message: 'Service unavailable'
        });
    }
});
//# sourceMappingURL=index.js.map