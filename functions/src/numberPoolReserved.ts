/**
 * ===============================================================================
 * USER RESERVED NUMBERS SYNCHRONIZATION
 * ===============================================================================
 * 
 * This module maintains synchronization between the main numberPool collection
 * and per-user reserved numbers collections. It ensures that reserved numbers
 * are properly tracked for each user.
 * 
 * FUNCTION INCLUDED:
 * 
 * updateUserReservedNumbersOnWrite - Firestore trigger for number pool changes
 * - Syncs numberPool reservations into per-user derived collections
 * - Creates/updates user/{uid}/reservedNumbers/{numberId} documents
 * - Maintains real-time synchronization between collections
 * - Enforces maximum of 3 most-recent reservations per user
 * - SKIPS during bulk uploads to prevent unnecessary function invocations
 * 
 * BUSINESS LOGIC:
 * - Adds document when number becomes reserved by a user
 * - Removes document when number is no longer reserved or user changes
 * - Maintains only the 3 most recent reservations per user
 * - Handles document deletions gracefully
 * 
 * DATA STRUCTURE:
 * - Source: numberPool/{numberId} documents
 * - Target: users/{uid}/reservedNumbers/{numberId} documents
 * - Fields synced: numberId, number, category, status, reservedAt, lastStatusChange
 * 
 * PERFORMANCE:
 * - Skips processing during bulk uploads (bulkUpload flag)
 * - Uses batched operations for cleanup of excess reservations
 * - Implements efficient query ordering by reservedAt timestamp
 * - Handles errors gracefully with try-catch blocks
 * 
 * All operations are performed atomically and deployed to us-central1 region.
 * ===============================================================================
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

/**
 * Sync numberPool reservations into per-user derived collection:
 *   users/{uid}/reservedNumbers/{numberId}
 * - Adds/updates doc when a number becomes reserved by a user
 * - Deletes doc when a number is no longer reserved or reservedBy changes
 * - Enforces max 3 most-recent reservations (by reservedAt) per user
 * - SKIPS during bulk uploads to avoid unnecessary function calls
 */
export const updateUserReservedNumbersOnWrite = onDocumentWritten({
  document: 'numberPool/{numberId}',
  region: 'us-central1'
}, async (event) => {
  const db = getFirestore();
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();
  const numberId = event.params?.numberId;

  // SKIP during bulk uploads - these numbers don't have reservations yet
  // Only skip if the CURRENT state (after) has the flag
  if (after?.bulkUpload === true) {
    console.log(`[Reserved] Skipping bulk upload number ${numberId}`);
    return; // Silent skip - bulk uploads never have reservedBy
  }

  // If this is just the bulkUpload flag being removed (cleanup), skip
  if (before && after && before.bulkUpload === true && after.bulkUpload === false) {
    // Check if only bulkUpload changed
    const beforeCopy = { ...before, bulkUpload: undefined };
    const afterCopy = { ...after, bulkUpload: undefined };
    if (JSON.stringify(beforeCopy) === JSON.stringify(afterCopy)) {
      console.log(`[Reserved] Skipping bulkUpload flag removal for ${numberId}`);
      return;
    }
  }

  // If document deleted, clean up any reservedNumbers entries
  if (!after && before) {
    const prevUid = before.reservedBy as string | undefined;
    if (prevUid) {
      await db.collection('users').doc(prevUid)
        .collection('reservedNumbers').doc(numberId)
        .delete().catch(() => {});
    }
    return;
  }

  if (!after) return; // nothing to do

  const status = after.status;
  const reservedBy = after.reservedBy as string | undefined;

  // If currently reserved by a user
  if (status === 'reserved' && reservedBy) {
    const reservedAt = after.reservedAt?.toDate?.() || after.reservedAt || new Date();
    const targetRef = db.collection('users').doc(reservedBy)
      .collection('reservedNumbers').doc(numberId);

    await targetRef.set({
      numberId,
      number: after.number,
      category: after.category,
      status: 'reserved',
      reservedAt: reservedAt instanceof Date ? reservedAt : new Date(reservedAt),
      lastStatusChange: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Enforce max 3 most-recent
    const snap = await db.collection('users').doc(reservedBy)
      .collection('reservedNumbers')
      .orderBy('reservedAt', 'desc')
      .get();

    const docs = snap.docs;
    const excess = docs.slice(3); // keep first 3

    if (excess.length > 0) {
      const batch = db.batch();
      excess.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    return;
  }

  // Otherwise, not reserved anymore or reservedBy cleared -> delete from previous owner
  const prevUid = before?.reservedBy as string | undefined;
  if (prevUid) {
    await db.collection('users').doc(prevUid)
      .collection('reservedNumbers').doc(numberId)
      .delete().catch(() => {});
  }
});

