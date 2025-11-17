/**
 * ===============================================================================
 * CLAIM EXPIRY MANAGEMENT - AUTOMATIC NUMBER CLAIM TRANSFERS
 * ===============================================================================
 * 
 * This file handles the automatic expiry and transfer of number claims in the CRM system.
 * It ensures that when agents don't finalize their claims within the allocated time,
 * the numbers are automatically transferred to the next agent in the queue or finalized.
 * 
 * FUNCTIONS INCLUDED:
 * 
 * 1. handleClaimExpiry - Firestore trigger for document updates
 *    - Monitors numberPool document changes
 *    - Detects when claims are about to expire or have expired
 *    - Processes expired claims immediately
 * 
 * 2. processClaimExpiry - Core claim processing logic
 *    - Handles the atomic transfer of expired claims
 *    - Manages claim queue transitions
 *    - Updates number ownership and status
 *    - Sends notifications to relevant agents
 * 
 * 3. realtimeClaimExpiry - Real-time expiry detection
 *    - Monitors for claims that just expired (within 30 seconds)
 *    - Provides immediate response to claim expiry events
 * 
 * 4. smartBatchClaimExpiry - Scheduled batch processor
 *    - Runs every 1 minute
 *    - Processes up to 50 expired claims in batches of 10
 *    - Handles high-volume scenarios efficiently
 * 
 * 5. emergencyClaimExpiry - Safety net processor
 *    - Runs every 5 minutes
 *    - Catches any claims that expired more than 5 minutes ago
 *    - Ensures no expired claims are missed
 * 
 * BUSINESS LOGIC:
 * - Claim expiry windows (typically 20 minutes for active claims)
 * - Queue management (transfers to next agent if queue exists)
 * - Final claim completion (transfers ownership if no queue)
 * - Notification system for all affected agents
 * - Performance tracking and versioning
 * 
 * All functions use Firestore transactions to ensure data consistency
 * and are deployed to the us-central1 region.
 * ===============================================================================
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FieldValue } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';

/**
 * ===============================================================================
 * FIRESTORE TRIGGER: Document Update Handler
 * ===============================================================================
 * This trigger monitors numberPool document updates and processes expired claims.
 * It fires whenever a document is updated and checks if claim processing is needed.
 * 
 * Detection Logic:
 * - Checks for active claiming agents with expiry timestamps
 * - Detects manual claim expiry checks triggered by the frontend
 * - Validates expiry timestamps against current time
 * 
 * Processing:
 * - Calls processClaimExpiry for immediate claim transfer
 * - Handles errors gracefully with comprehensive logging
 */
export const handleClaimExpiry = onDocumentUpdated({
  document: 'numberPool/{numberId}',
  region: 'us-central1'
}, async (event) => {
  try {
    const numberId = event.params.numberId;
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();
    
    if (!beforeData || !afterData) {
      console.log(`No data available for number ${numberId}, skipping`);
      return;
    }

    // FAST SKIP: Ignore bulk upload flag removals
    if (afterData.bulkUpload === true || 
        (beforeData.bulkUpload === true && afterData.bulkUpload === false)) {
      return; // Silent skip for bulk operations
    }

    // Check if this is a claim-related update or if we need to check for expired claims
    const hasClaimingAgent = afterData.claimingAgentId && afterData.claimingExpiresAt;
    const isClaimExpiryCheck = afterData.claimExpiryCheck;
    
    if (!hasClaimingAgent && !isClaimExpiryCheck) {
      console.log(`Number ${numberId} has no active claim or expiry check, skipping`);
      return;
    }

    const claimingExpiresAt = afterData.claimingExpiresAt?.toDate();
    const now = new Date();

    // Check if the claim has expired (either triggered by client or naturally expired)
    if (!claimingExpiresAt || claimingExpiresAt > now) {
      console.log(`Number ${numberId} claim not expired yet, expires at ${claimingExpiresAt}`);
      return;
    }

    console.log(`Processing expired claim for number ${numberId}`);

    // Use the instant processor
    await processClaimExpiry(numberId);

    console.log(`Successfully processed expired claim for number ${numberId}`);
  } catch (error) {
    console.error(`Error processing claim expiry for number ${event.params.numberId}:`, error);
  }
});

/**
 * ===============================================================================
 * CORE FUNCTION: Claim Expiry Processor
 * ===============================================================================
 * This is the core function that handles the actual claim transfer logic when a claim expires.
 * It performs atomic transactions to ensure data consistency during claim transfers.
 * 
 * Business Logic:
 * - Validates that the claim has actually expired
 * - Checks if there are agents in the claim queue
 * - Transfers ownership to the next agent in queue (20-minute window)
 * - Finalizes claim if no queue exists (transfers to claiming agent)
 * - Sends notifications to all affected agents
 * - Updates performance tracking and versioning
 * 
 * Transaction Safety:
 * - Uses Firestore transactions to ensure atomicity
 * - Handles concurrent access and race conditions
 * - Validates current state before making changes
 * 
 * @param numberId - The ID of the number document to process
 */
export const processClaimExpiry = async (numberId: string) => {
  try {
    console.log(`Processing claim expiry for number ${numberId}`);
    const now = new Date();
    const db = admin.firestore();
    
    await db.runTransaction(async (transaction) => {
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

      // Check if claim has expired
      const claimingExpiresAt = currentData.claimingExpiresAt?.toDate();
      if (!claimingExpiresAt || claimingExpiresAt > now) {
        console.log(`Number ${numberId} claim not expired yet, skipping`);
        return;
      }

      const claimingAgentId = currentData.claimingAgentId;
      const originalAgentId = currentData.reservedBy;
      const claimQueue = currentData.claimQueue || [];

      if (claimingAgentId && originalAgentId) {
        // Check if there are more claims in the queue
        const nextClaim = claimQueue.find((claim: any) => claim.agentId !== claimingAgentId);

        if (nextClaim) {
          // Transfer to next agent in queue
          const newExpiresAt = new Date(now.getTime() + 20 * 60 * 1000); // 20 minutes
          const remainingQueue = claimQueue.filter((claim: any) => claim.agentId !== claimingAgentId);

          transaction.update(numberRef, {
            // Transfer ownership to claiming agent
            reservedBy: claimingAgentId,
            reservedAt: FieldValue.serverTimestamp(),
            lastStatusChange: FieldValue.serverTimestamp(),
            // Set up next claim
            claimingAgentId: nextClaim.agentId,
            claimingStartedAt: FieldValue.serverTimestamp(),
            claimingExpiresAt: newExpiresAt,
            claimQueue: remainingQueue,
            claimCount: 0,
            // Clear claim expiry check flag
            claimExpiryCheck: FieldValue.delete(),
            // Add performance tracking
            lastProcessedAt: FieldValue.serverTimestamp(),
            processingVersion: FieldValue.increment(1)
          });

          // Send notification to next claiming agent
          const notificationRef = db.collection('notifications').doc();
          transaction.set(notificationRef, {
            userId: nextClaim.agentId,
            type: 'number_claimed',
            title: 'Number Claim Started',
            message: `The number is now available for your claim. You have 20 minutes to take ownership.`,
            read: false,
            createdAt: FieldValue.serverTimestamp(),
            numberId: numberId,
            priority: 'high'
          });

          console.log(`Transferred number ${numberId} to next agent ${nextClaim.agentId}`);
        } else {
          // No more claims in queue, finalize the current claim
          transaction.update(numberRef, {
            // Transfer ownership to claiming agent
            reservedBy: claimingAgentId,
            reservedAt: FieldValue.serverTimestamp(),
            lastStatusChange: FieldValue.serverTimestamp(),
            // Clear claiming agent information
            claimingAgentId: null,
            claimingStartedAt: null,
            claimingExpiresAt: null,
            // Clear claim queue and reset claim count
            claimQueue: [],
            claimCount: 0,
            // Clear claim expiry check flag
            claimExpiryCheck: FieldValue.delete(),
            // Add performance tracking
            lastProcessedAt: FieldValue.serverTimestamp(),
            processingVersion: FieldValue.increment(1)
          });

          console.log(`Finalized claim for number ${numberId} - transferred to ${claimingAgentId}`);
        }

        // Send notification to original agent about the transfer
        const originalNotificationRef = db.collection('notifications').doc();
        transaction.set(originalNotificationRef, {
          userId: originalAgentId,
          type: 'number_claimed',
          title: 'Number Claim Completed',
          message: `The number has been claimed by another agent after the claim period expired.`,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          numberId: numberId,
          priority: 'normal'
        });
      }
    });

    console.log(`Successfully processed claim expiry for number ${numberId}`);
  } catch (error) {
    console.error(`Error processing claim expiry for number ${numberId}:`, error);
  }
};

/**
 * ===============================================================================
 * FIRESTORE TRIGGER: Real-time Expiry Detection
 * ===============================================================================
 * This trigger provides real-time detection of claim expiries by monitoring
 * document changes with precise timing checks.
 * 
 * Features:
 * - Detects claims that expired within the last 30 seconds
 * - Provides immediate response to expiry events
 * - Avoids duplicate processing of already-expired claims
 * - Works in conjunction with other expiry processors
 */
export const realtimeClaimExpiry = onDocumentUpdated({
  document: 'numberPool/{numberId}',
  region: 'us-central1'
}, async (event) => {
  try {
    const numberId = event.params.numberId;
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();
    
    if (!beforeData || !afterData) {
      return;
    }

    // FAST SKIP: Ignore bulk upload flag removals
    if (afterData.bulkUpload === true || 
        (beforeData.bulkUpload === true && afterData.bulkUpload === false)) {
      return; // Silent skip for bulk operations
    }

    // Check if this is a claim-related update
    const hasClaimingAgent = afterData.claimingAgentId && afterData.claimingExpiresAt;
    if (!hasClaimingAgent) {
      return;
    }

    const claimingExpiresAt = afterData.claimingExpiresAt?.toDate();
    const now = new Date();

    // Check if the claim has just expired (within the last 30 seconds)
    if (claimingExpiresAt && claimingExpiresAt <= now && claimingExpiresAt > new Date(now.getTime() - 30000)) {
      console.log(`Real-time claim expiry detected for number ${numberId}`);
      await processClaimExpiry(numberId);
    }
  } catch (error) {
    console.error(`Error in real-time claim expiry for number ${event.params.numberId}:`, error);
  }
});

/**
 * ===============================================================================
 * SCHEDULED FUNCTION: Smart Batch Claim Expiry Processor
 * ===============================================================================
 * This scheduled function runs every 1 minute to process expired claims in batches.
 * It handles high-volume scenarios efficiently and ensures no claims are missed.
 * 
 * Performance Features:
 * - Processes up to 50 expired claims per run
 * - Batches claims in groups of 10 for optimal performance
 * - Uses parallel processing within batches
 * - Includes small delays between batches to prevent system overload
 * 
 * Query Strategy:
 * - Finds numbers with status 'reserved' and active claiming agents
 * - Filters by expiry timestamp (claims that should have expired)
 * - Limits results to prevent timeout issues
 */
export const smartBatchClaimExpiry = onSchedule({
  schedule: 'every 1 minutes',
  region: 'us-central1'
}, async (event) => {
  try {
    console.log('Running smart batch claim expiry check...');
    const now = new Date();
    const db = admin.firestore();
    
    // Query for numbers with expired claims
    const expiredClaimsQuery = db.collection('numberPool')
      .where('status', '==', 'reserved')
      .where('claimingAgentId', '!=', null)
      .where('claimingExpiresAt', '<=', now)
      .limit(50); // Process max 50 at a time for performance
    
    const snapshot = await expiredClaimsQuery.get();
    
    if (snapshot.empty) {
      console.log('No expired claims found in batch check');
      return;
    }
    
    console.log(`Found ${snapshot.size} expired claims in batch check`);
    
    // Process in batches of 10 for optimal performance
    const batchSize = 10;
    const docs = snapshot.docs;
    
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);
      
      // Process batch in parallel for speed
      await Promise.all(
        batch.map(doc => processClaimExpiry(doc.id))
      );
      
      // Small delay between batches to prevent overwhelming the system
      if (i + batchSize < docs.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log('Smart batch claim expiry check completed');
  } catch (error) {
    console.error('Error in smart batch claim expiry check:', error);
  }
});

/**
 * ===============================================================================
 * SCHEDULED FUNCTION: Emergency Claim Expiry Safety Net
 * ===============================================================================
 * This scheduled function runs every 5 minutes as a final safety net to catch
 * any expired claims that may have been missed by other processors.
 * 
 * Safety Features:
 * - Processes claims that expired more than 5 minutes ago
 * - Provides comprehensive coverage for edge cases
 * - Handles system failures or missed triggers
 * - Ensures no expired claims remain unprocessed
 * 
 * Query Strategy:
 * - Looks for claims expired more than 5 minutes ago
 * - Processes all found expired claims immediately
 * - No batching limits for emergency processing
 */
export const emergencyClaimExpiry = onSchedule({
  schedule: 'every 5 minutes',
  region: 'us-central1'
}, async (event) => {
  try {
    console.log('Running emergency claim expiry check...');
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const db = admin.firestore();
    
    // Query for numbers with claims that expired more than 5 minutes ago
    const expiredClaimsQuery = db.collection('numberPool')
      .where('status', '==', 'reserved')
      .where('claimingAgentId', '!=', null)
      .where('claimingExpiresAt', '<=', fiveMinutesAgo);
    
    const snapshot = await expiredClaimsQuery.get();
    
    if (snapshot.empty) {
      console.log('No emergency expired claims found');
      return;
    }
    
    console.log(`Found ${snapshot.size} emergency expired claims`);
    
    // Process emergency claims immediately
    for (const doc of snapshot.docs) {
      await processClaimExpiry(doc.id);
    }
    
    console.log('Emergency claim expiry check completed');
  } catch (error) {
    console.error('Error in emergency claim expiry check:', error);
  }
});
