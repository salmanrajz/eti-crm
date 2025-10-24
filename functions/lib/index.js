"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappWebhook = exports.checkNumberAvailability = exports.processLeadRejection = exports.claimNumber = exports.backfillNumberTokens = exports.onNumberPoolWrite = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
// -------------------
// Utils: tokenization
// -------------------
function normalizeString(input) {
    return (input || '').toString().replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
}
// Optimized n-gram generation for phone numbers with comprehensive search coverage
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
// (removed generateTextTokens; we only store number tokens)
async function upsertTokensForNumberPoolDoc(docRef, data) {
    const numberRaw = (data && (data.number || data.msisdn || ''));
    const numberTokens = generatePhoneNumberTokens(numberRaw);
    await docRef.set({
        numberNormalized: normalizeString(numberRaw),
        numberTokens,
        tokensUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}
// Maintain tokens on writes to numberPool
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
// Callable: backfill tokens for existing docs
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
 * Cloud Function to claim a number
 * This function handles the entire process of claiming a number atomically
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
 * Cloud Function to process a lead rejection
 * This function handles updating the lead status and managing the number pool
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
 * Cloud Function to check if a number is available for claiming
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
 * Webhook to capture inbound WhatsApp messages
 * Expected payload includes leadId in query or body.metadata for routing.
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
        for (const msg of messages) {
            const from = (msg.from || '').replace(/\D/g, '');
            const text = ((_o = msg.text) === null || _o === void 0 ? void 0 : _o.body) || '';
            console.log('Inbound message from:', from, 'text length:', text.length);
            // Resolve leadId via routing map first, then by phone, if not provided
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
            // Fallback by matching last 8 or 10 digits
            if (!resolvedLeadId) {
                try {
                    const last8 = from.slice(-8);
                    const last10 = from.slice(-10);
                    async function findLeadByCustomerNumber(num) {
                        const snap = await db.collection('leads').where('customerNumber', '==', num).limit(1).get();
                        return snap.empty ? null : snap.docs[0].id;
                    }
                    resolvedLeadId = (await findLeadByCustomerNumber(last8)) || (await findLeadByCustomerNumber(last10)) || '';
                }
                catch (e) {
                    console.warn('Lead resolution by phone failed:', e);
                }
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
 * Helper function to check if a user has reached their strike limit
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
//# sourceMappingURL=index.js.map