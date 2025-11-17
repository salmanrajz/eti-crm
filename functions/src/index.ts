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

import 'dotenv/config';
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { updateNumberPoolStatsOnCreate, updateNumberPoolStatsOnDelete, initializeNumberPoolStats, aggregateStatsShards, autoAggregateStats } from './numberPoolStats';
import { uploadVerificationMediaToAzure } from './azureStorage';
import { handleClaimExpiry, realtimeClaimExpiry, smartBatchClaimExpiry, emergencyClaimExpiry } from './claimExpiry';
import { handleReservationExpiry, processReservationExpiry, testReservationExpiry, triggerReservationExpiry, backupReservationExpiry } from './simpleReservationExpiry';

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
function normalizeString(input: string): string {
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
function generatePhoneNumberTokens(phoneNumber: string): string[] {
  const normalized = normalizeString(phoneNumber);
  if (normalized.length < 4) return []; // Skip very short numbers
  
  // Extract last 7 digits for primary search (ignoring country/area codes)
  const last7 = normalized.slice(-7);
  const tokens = new Set<string>();
  
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
async function upsertTokensForNumberPoolDoc(docRef: FirebaseFirestore.DocumentReference, data: any) {
  const numberRaw = (data && (data.number || data.msisdn || '')) as string;
  const numberTokens = generatePhoneNumberTokens(numberRaw);
  await docRef.set({
    numberNormalized: normalizeString(numberRaw),
    numberTokens,
    tokensUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

/**
 * ===============================================================================
 * FIRESTORE TRIGGER: Automatic Token Generation on Create
 * ===============================================================================
 * This trigger automatically generates search tokens when a new number is created.
 * Optimized to use onCreate instead of onWrite for better performance.
 * 
 * Token Generation:
 * - Fires only on document creation (not updates)
 * - Generates phone number search tokens
 * - Skips during bulk uploads (handled by backfillNumberTokens)
 * 
 * This ensures fast searching while minimizing function invocations.
 */
export const onNumberPoolCreate = functions.firestore
  .document('numberPool/{id}')
  .onCreate(async (snapshot, context) => {
    const data = snapshot.data();
    
    // Skip token generation during bulk uploads to prevent function spam
    // Bulk uploads will generate tokens via backfillNumberTokens after upload completes
    if (data?.bulkUpload === true) {
      return; // Silent skip, no logging needed for bulk
    }
    
    // Only generate tokens if they don't already exist
    if (data?.numberTokens) {
      return; // Tokens already present
    }
    
    try {
      await upsertTokensForNumberPoolDoc(snapshot.ref, data);
    } catch (e) {
      console.error('Failed to generate tokens for numberPool doc', snapshot.id, e);
    }
  });

/**
 * ===============================================================================
 * FIRESTORE TRIGGER: Token Update on Number Change
 * ===============================================================================
 * This trigger updates search tokens when a number's phone number changes.
 * Only fires on updates where the actual number field has changed.
 */
export const onNumberPoolUpdate = functions.firestore
  .document('numberPool/{id}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    
    // FAST SKIP: Ignore bulk upload operations and flag removals
    if (after?.bulkUpload === true || 
        (before.bulkUpload === true && after.bulkUpload === false)) {
      return; // Silent skip for bulk operations
    }
    
    // Only update if the actual number changed
    if (before.number === after.number) {
      return; // Number didn't change, no token update needed
    }
    
    try {
      await upsertTokensForNumberPoolDoc(change.after.ref, after);
    } catch (e) {
      console.error('Failed to update tokens for numberPool doc', change.after.id, e);
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
 * - V1 callable function (CORS handled automatically by Firebase SDK)
 * - Processes documents in configurable batch sizes (default: 500, max: 1000)
 * - Supports pagination with cursor-based iteration
 * - Handles large datasets efficiently with batched processing
 * 
 * Authentication: Required (authenticated users only)
 * Usage: Call from admin dashboard or maintenance scripts
 */
export const backfillNumberTokens = functions.https.onCall(async (data, context) => {
  // Auth check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  
  try {
    const batchSize = Math.min(Number(data?.batchSize || 500), 1000);
    const cursor = data?.cursor as string | undefined;
    
    let queryRef = db.collection('numberPool').orderBy(admin.firestore.FieldPath.documentId()).limit(batchSize);
    if (cursor) queryRef = queryRef.startAfter(cursor);
    
    const snap = await queryRef.get();
    const writes: Promise<any>[] = [];
    
    snap.docs.forEach(doc => {
      writes.push(upsertTokensForNumberPoolDoc(doc.ref, doc.data()));
    });
    
    await Promise.all(writes);
    
    const nextCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1].id : null;
    
    return { processed: snap.size, nextCursor };
  } catch (e) {
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
export const claimNumber = functions.https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to claim a number"
    );
  }

  const { numberId, userId } = data;
  
  if (!numberId || !userId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Number ID and User ID are required"
    );
  }

  // Verify the user exists
  const userRef = db.collection("users").doc(userId);
  const userDoc = await userRef.get();
  
  if (!userDoc.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "User not found"
    );
  }

  // Check if user has reached strike limit (2 strikes in 24 hours)
  const strikeLimit = await checkStrikeLimit(userId);
  
  if (!strikeLimit.canStrike) {
    throw new functions.https.HttpsError(
      "permission-denied",
      `Strike limit reached. You can strike again ${strikeLimit.nextAvailableTime}`
    );
  }

  // Run in a transaction to ensure atomicity
  return db.runTransaction(async (transaction) => {
    // Get the number document
    const numberRef = db.collection("numberPool").doc(numberId);
    const numberDoc = await transaction.get(numberRef);
    
    if (!numberDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Number not found"
      );
    }
    
    const numberData = numberDoc.data();
    
    if (!numberData) {
      throw new functions.https.HttpsError(
        "internal",
        "Number data is missing"
      );
    }

    // Check if number is already claimed by this user
    if (numberData.claims) {
      const existingClaim = numberData.claims.find(
        (claim: any) => claim.userId === userId && claim.status === "pending"
      );
      
      if (existingClaim) {
        throw new functions.https.HttpsError(
          "already-exists",
          "You have already claimed this number"
        );
      }
    }

    // Check if number is available for claiming
    if (numberData.status === "activated") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "This number is already activated and cannot be claimed"
      );
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
export const processLeadRejection = functions.https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to reject a lead"
    );
  }

  const { leadId, verificationNote, verifierId } = data;
  
  if (!leadId || !verifierId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Lead ID and Verifier ID are required"
    );
  }

  // Run in a transaction to ensure atomicity
  return db.runTransaction(async (transaction) => {
    // Get the lead document
    const leadRef = db.collection("leads").doc(leadId);
    const leadDoc = await transaction.get(leadRef);
    
    if (!leadDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Lead not found"
      );
    }
    
    const leadData = leadDoc.data();
    
    if (!leadData) {
      throw new functions.https.HttpsError(
        "internal",
        "Lead data is missing"
      );
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
      if (!plan.numberId) continue;

      const numberRef = db.collection("numberPool").doc(plan.numberId);
      const numberDoc = await transaction.get(numberRef);
      
      if (!numberDoc.exists) continue;
      
      const numberData = numberDoc.data();
      
      if (!numberData) continue;

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
      } else {
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
export const checkNumberAvailability = functions.https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to check number availability"
    );
  }

  const { numberId } = data;
  
  if (!numberId) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Number ID is required"
    );
  }

  // Get the number document
  const numberRef = db.collection("numberPool").doc(numberId);
  const numberDoc = await numberRef.get();
  
  if (!numberDoc.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "Number not found"
    );
  }
  
  const numberData = numberDoc.data();
  
  if (!numberData) {
    throw new functions.https.HttpsError(
      "internal",
      "Number data is missing"
    );
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
export const whatsappWebhook = functions.https.onRequest(async (req, res) => {
  try {
    const cfg = functions.config();
    const configuredToken = (cfg && (cfg as any).whatsapp && (cfg as any).whatsapp.verify_token) || process.env.WHATSAPP_VERIFY_TOKEN;
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
        req.body = JSON.parse(req.body as unknown as string);
      } catch (e) {
        console.warn('Failed to parse string body as JSON');
      }
    }
    if (req.method === 'GET') {
      // WhatsApp webhook verification
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      if (mode === 'subscribe' && token === configuredToken) {
        res.status(200).send(challenge as any);
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
    let leadId = (req.query.leadId as string) || body?.metadata?.leadId || body?.entry?.[0]?.changes?.[0]?.value?.metadata?.leadId;
    const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages || [];
    console.log('whatsappWebhook received messages:', Array.isArray(messages) ? messages.length : 0);
    if (messages.length === 0) {
      res.sendStatus(200);
      return;
    }

    const batch = db.batch();

    async function getLatestLeadByCustomerNumber(value: string) {
      try {
        const snap = await db.collection('leads')
          .where('customerNumber', '==', value)
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();
        if (!snap.empty) {
          return snap.docs[0];
        }
      } catch (e) {
        console.warn('getLatestLeadByCustomerNumber failed:', e);
      }
      return null;
    }
    for (const msg of messages) {
      const from = (msg.from || '').replace(/\D/g, '');
      const text = msg.text?.body || '';
      console.log('Inbound message from:', from, 'text length:', text.length);
      // Resolve leadId via routing map first; we will still prefer the newest lead by number
      let resolvedLeadId = leadId;
      if (!resolvedLeadId) {
        try {
          const routingSnap = await db.collection('whatsappRouting').doc(from).get();
          if (routingSnap.exists) {
            const route = routingSnap.data() as any;
            const sentAt = route?.sentAt?.toDate?.() || route?.sentAt;
            const within48h = sentAt ? (Date.now() - new Date(sentAt).getTime() < 48 * 60 * 60 * 1000) : true;
            if (route?.leadId && within48h) {
              resolvedLeadId = route.leadId;
            }
          }
        } catch (e) {
          console.warn('Routing map lookup failed:', e);
        }
      }

      // Normalize WhatsApp number 971XXXXXXXXX -> 0XXXXXXXXX and prefer the newest lead by customerNumber
      try {
        let normalizedUae = from;
        if (from.startsWith('971')) {
          normalizedUae = '0' + from.slice(3);
          console.log(`Normalized ${from} -> ${normalizedUae} (971 -> 0)`);
        } else if (from.startsWith('+971')) {
          normalizedUae = '0' + from.slice(4);
          console.log(`Normalized ${from} -> ${normalizedUae} (+971 -> 0)`);
        } else if (!from.startsWith('0') && from.length === 10) {
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
        } else if (!resolvedLeadId) {
          console.log(`No lead found by customerNumber (${normalizedUae}) and no prior resolution`);
        }
      } catch (e) {
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
      const truthy = (k: string) => lower.includes('accept') || lower.includes('agree') || lower.includes('agreed') || lower.includes('yes') || lower.includes(k.toLowerCase());
      let consents: any = {
        acceptAllTerms: truthy('terms'),
        ownershipAfterContract: truthy('chosen number becomes yours') || truthy('ownership'),
        usageRestrictionsAgree: truthy('transfer of ownership') || truthy('porting out') || truthy('switching to prepaid') || truthy('restrictions'),
        proRatedAgree: truthy('pro-rated') || truthy('prorated'),
        gracePeriodAcknowledge: truthy('five days') || truthy('cancel the plan without any charges'),
        dataAccuracyAcknowledge: truthy('information provided regarding the number and plan is accurate') || truthy('accurate')
      };
      try {
        if (msg.type === 'interactive' && msg.interactive?.nfm_reply?.response_json) {
          const respJsonStr = msg.interactive.nfm_reply.response_json as string;
          const resp = JSON.parse(respJsonStr);
          const isTrueByIncl = (subs: string[]) => {
            for (const k of Object.keys(resp || {})) {
              const kl = k.toLowerCase();
              if (subs.some(s => kl.includes(s)) && resp[k] === true) return true;
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
      } catch (e) {
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
  } catch (err) {
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
export const resetUserPassword = functions.https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to reset a password"
    );
  }

  const { userId, newPassword } = data;
  
  if (!userId || !newPassword) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "User ID and new password are required"
    );
  }

  // Verify the requesting user is an admin
  const adminUserRef = db.collection("users").doc(context.auth.uid);
  const adminUserDoc = await adminUserRef.get();
  
  if (!adminUserDoc.exists) {
    throw new functions.https.HttpsError(
      "not-found",
      "Admin user not found"
    );
  }

  const adminUserData = adminUserDoc.data();
  if (!adminUserData || adminUserData.role !== 'admin') {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can reset passwords"
    );
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
  } catch (error: any) {
    console.error('Password reset failed:', error);
    
    if (error.code === 'auth/user-not-found') {
      throw new functions.https.HttpsError(
        "not-found",
        "User not found in Firebase Auth"
      );
    } else if (error.code === 'auth/invalid-password') {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "The new password is invalid"
      );
    } else {
      throw new functions.https.HttpsError(
        "internal",
        "Failed to reset password: " + error.message
      );
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
async function checkStrikeLimit(userId: string) {
  // Get all claims made by this agent in the last 24 hours
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  const numbersQuery = db.collection("numberPool")
    .where("claims", "!=", null);
  
  const numbersSnapshot = await numbersQuery.get();
  let strikeCount = 0;
  let lastStrikeTime: Date | null = null;

  numbersSnapshot.docs.forEach(doc => {
    const data = doc.data();
    const claims = data.claims || [];
    
    claims.forEach((claim: any) => {
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
    const nextAvailable = new Date((lastStrikeTime as Date).getTime() + 24 * 60 * 60 * 1000);
    nextAvailableTime = nextAvailable.toLocaleString();
  }

  return {
    remainingStrikes,
    lastStrikeTime,
    canStrike,
    nextAvailableTime
  };
}

// Export number pool stats functions
export { updateNumberPoolStatsOnCreate, updateNumberPoolStatsOnDelete, initializeNumberPoolStats, aggregateStatsShards, autoAggregateStats };

// Export claim expiry functions
export { handleClaimExpiry, realtimeClaimExpiry, smartBatchClaimExpiry, emergencyClaimExpiry };

// Export simple reservation expiry functions
export { handleReservationExpiry, processReservationExpiry, testReservationExpiry, triggerReservationExpiry, backupReservationExpiry };

// Export user reserved numbers sync function
export { updateUserReservedNumbersOnWrite } from './numberPoolReserved';

// Export bulk DNC import functions
export { bulkDNCImport, bulkDNCImportStatus } from './bulkDNCImport';

// Export ultra-fast bulk number upload
export { bulkNumberUploadV2 } from './bulkNumberUpload';

// Export Algolia transform function (skips bulk uploads)
export { algoliaTransform } from './algoliaTransform';

// Export Azure upload callable
export { uploadVerificationMediaToAzure };

/**
 * ===============================================================================
 * CALLABLE FUNCTION: Statistics Recalculation (Deprecated)
 * ===============================================================================
 * This function manually recalculates number pool statistics.
 * NOTE: initializeNumberPoolStats is now a v2 callable function.
 * This legacy wrapper duplicates the logic for backward compatibility.
 * 
 * @deprecated Use initializeNumberPoolStats directly instead
 * Authentication: Required (authenticated users only)
 * Usage: Call from admin dashboard or maintenance scripts
 */
export const recomputeNumberPoolStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  try {
    // Duplicate the stats calculation logic here since v2 callable can't be called from v1
    const numbersRef = db.collection('numberPool');
    const statsRef = db.collection('stats').doc('numberPool');
    
    const snapshot = await numbersRef.get();
    const totalItems = snapshot.size;
    
    const categoryCounts: { [key: string]: number } = {};
    snapshot.docs.forEach(doc => {
      const category = doc.data().category || 'all';
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });
    
    const updates: any = {
      totalItems,
      lastUpdated: FieldValue.serverTimestamp()
    };
    
    Object.entries(categoryCounts).forEach(([category, count]) => {
      updates[`totalItems_${category}`] = count;
      for (const pageSize of [10, 20, 50, 80, 100, 120]) {
        updates[`totalPages_${pageSize}_${category}`] = Math.ceil(count / pageSize);
      }
    });
    
    for (const pageSize of [10, 20, 50, 80, 100, 120]) {
      updates[`totalPages_${pageSize}`] = Math.ceil(totalItems / pageSize);
    }
    
    updates.needsPageRecalc = false;
    await statsRef.set(updates, { merge: true });
    
    return { ok: true, totalItems, categoryCounts };
  } catch (e: any) {
    console.error('recomputeNumberPoolStats failed', e);
    throw new functions.https.HttpsError('internal', e?.message || 'Failed to recompute stats');
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
export const checkNumberStatus = functions.https.onCall(async (data, context) => {
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
    
    const response = await new Promise<{ status: number; data: any }>((resolve, reject) => {
      const https = require('https');
      const http = require('http');
      
      const client = url.startsWith('https') ? https : http;
      
      const request = client.get(url, {
        timeout: 10000, // Reduced from 15s to 10s
        headers: {
          'User-Agent': 'Firebase-Cloud-Function/1.0'
        }
      }, (res: any) => {
        let data = '';
        
        res.on('data', (chunk: any) => {
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
      
      request.on('error', (error: any) => {
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
    } catch (parseError) {
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

  } catch (error: any) {
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
export const checkNumberStatusHTTP = functions.https.onRequest(async (req, res) => {
  // Set CORS headers for all responses
  // Allow all origins for CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.set('Access-Control-Max-Age', '3600');
  
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
    
    const response = await new Promise<{ status: number; data: any }>((resolve, reject) => {
      const https = require('https');
      const http = require('http');
      
      const client = url.startsWith('https') ? https : http;
      
      const request = client.get(url, {
        timeout: 10000, // Reduced from 15s to 10s
        headers: {
          'User-Agent': 'Firebase-Cloud-Function/1.0'
        }
      }, (res: any) => {
        let data = '';
        
        res.on('data', (chunk: any) => {
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
      
      request.on('error', (error: any) => {
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
    } catch (parseError) {
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

    } catch (error: any) {
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

export const createUserAsAdmin = functions.https.onCall(async (data, context) => {
  // Require authentication
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Auth required');
  }
  try {
    const callerUid = context.auth.uid;
    const callerDoc = await admin.firestore().collection('users').doc(callerUid).get();
    const callerData = callerDoc.data();
    if (!callerData || (callerData.role !== 'admin' && callerData.role !== 'manager' && callerData.role !== 'coordinator')) {
      throw new functions.https.HttpsError('permission-denied', 'Only admins/managers/coordinators can create users');
    }

    const { email, password, role, name, extra } = data || {};
    if (!email || !password || !role || !name) {
      throw new functions.https.HttpsError('invalid-argument', 'email, password, role, and name are required');
    }

    // Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
      disabled: false,
    });

    // Write user document
    const userRef = admin.firestore().collection('users').doc(userRecord.uid);
    const payload: any = {
      id: userRecord.uid,
      email,
      role,
      name,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (extra && typeof extra === 'object') {
      Object.assign(payload, extra);
    }
    await userRef.set(payload, { merge: true });

    return { ok: true, uid: userRecord.uid };
  } catch (e: any) {
    console.error('createUserAsAdmin failed', e);
    if (e.code === 'auth/email-already-exists') {
      throw new functions.https.HttpsError('already-exists', 'Email already in use');
    }
    throw new functions.https.HttpsError('internal', e?.message || 'Failed to create user');
  }
});