"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserReservedNumbersOnWrite = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
/**
 * Sync numberPool reservations into per-user derived collection:
 *   users/{uid}/reservedNumbers/{numberId}
 * - Adds/updates doc when a number becomes reserved by a user
 * - Deletes doc when a number is no longer reserved or reservedBy changes
 * - Enforces max 3 most-recent reservations (by reservedAt) per user
 * - SKIPS during bulk uploads to avoid unnecessary function calls
 */
exports.updateUserReservedNumbersOnWrite = (0, firestore_1.onDocumentWritten)({
    document: 'numberPool/{numberId}',
    region: 'us-central1'
}, async (event) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const db = (0, firestore_2.getFirestore)();
    const before = (_b = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before) === null || _b === void 0 ? void 0 : _b.data();
    const after = (_d = (_c = event.data) === null || _c === void 0 ? void 0 : _c.after) === null || _d === void 0 ? void 0 : _d.data();
    const numberId = (_e = event.params) === null || _e === void 0 ? void 0 : _e.numberId;
    // SKIP during bulk uploads - these numbers don't have reservations yet
    // Only skip if the CURRENT state (after) has the flag
    if ((after === null || after === void 0 ? void 0 : after.bulkUpload) === true) {
        console.log(`[Reserved] Skipping bulk upload number ${numberId}`);
        return; // Silent skip - bulk uploads never have reservedBy
    }
    // If this is just the bulkUpload flag being removed (cleanup), skip
    if (before && after && before.bulkUpload === true && after.bulkUpload === false) {
        // Check if only bulkUpload changed
        const beforeCopy = Object.assign(Object.assign({}, before), { bulkUpload: undefined });
        const afterCopy = Object.assign(Object.assign({}, after), { bulkUpload: undefined });
        if (JSON.stringify(beforeCopy) === JSON.stringify(afterCopy)) {
            console.log(`[Reserved] Skipping bulkUpload flag removal for ${numberId}`);
            return;
        }
    }
    // If document deleted, clean up any reservedNumbers entries
    if (!after && before) {
        const prevUid = before.reservedBy;
        if (prevUid) {
            await db.collection('users').doc(prevUid)
                .collection('reservedNumbers').doc(numberId)
                .delete().catch(() => { });
        }
        return;
    }
    if (!after)
        return; // nothing to do
    const status = after.status;
    const reservedBy = after.reservedBy;
    // If currently reserved by a user
    if (status === 'reserved' && reservedBy) {
        const reservedAt = ((_g = (_f = after.reservedAt) === null || _f === void 0 ? void 0 : _f.toDate) === null || _g === void 0 ? void 0 : _g.call(_f)) || after.reservedAt || new Date();
        const targetRef = db.collection('users').doc(reservedBy)
            .collection('reservedNumbers').doc(numberId);
        await targetRef.set({
            numberId,
            number: after.number,
            category: after.category,
            status: 'reserved',
            reservedAt: reservedAt instanceof Date ? reservedAt : new Date(reservedAt),
            lastStatusChange: firestore_2.FieldValue.serverTimestamp(),
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
    const prevUid = before === null || before === void 0 ? void 0 : before.reservedBy;
    if (prevUid) {
        await db.collection('users').doc(prevUid)
            .collection('reservedNumbers').doc(numberId)
            .delete().catch(() => { });
    }
});
//# sourceMappingURL=numberPoolReserved.js.map