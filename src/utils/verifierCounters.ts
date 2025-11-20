/**
 * ===============================================================================
 * VERIFIER COUNTERS UTILITY - TRACK VERIFICATION METRICS IN USER PROFILE
 * ===============================================================================
 * 
 * This module manages verifier counters stored in the user profile instead of
 * calculating from leads. This provides better performance and accurate tracking.
 * 
 * FEATURES:
 * 
 * 1. COUNTER MANAGEMENT
 *    - Daily verified count (resets daily)
 *    - Monthly verified count (resets monthly)
 *    - Automatic reset logic based on date
 * 
 * 2. PERFORMANCE
 *    - Single document read instead of querying all leads
 *    - Atomic counter increments
 *    - Efficient date-based reset logic
 * 
 * USAGE:
 * Call `incrementVerifierCounters` whenever a lead is verified to update
 * the verifier's profile counters.
 * ===============================================================================
 */

import { doc, getDoc, updateDoc, serverTimestamp, runTransaction, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Interface for verifier counter data in user profile
 */
export interface VerifierCounters {
  dailyVerifiedCount: number;
  monthlyVerifiedCount: number;
  lastDailyReset: Date | null;
  lastMonthlyReset: Date | null;
}

/**
 * Increment verifier counters when a lead is verified
 * Handles automatic daily and monthly resets
 * 
 * @param verifierId - The ID of the verifier who verified the lead
 */
export async function incrementVerifierCounters(verifierId: string): Promise<void> {
  if (!verifierId) {
    console.error('Verifier ID is required');
    return;
  }

  try {
    const userRef = doc(db, 'users', verifierId);
    
    await runTransaction(db, async (transaction) => {
      const userDoc = await transaction.get(userRef);
      
      if (!userDoc.exists()) {
        console.error(`User document not found for verifier: ${verifierId}`);
        return;
      }

      const userData = userDoc.data();
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      // Get current counters or initialize
      let dailyCount = userData.dailyVerifiedCount || 0;
      let monthlyCount = userData.monthlyVerifiedCount || 0;
      let lastDailyReset = userData.lastDailyReset?.toDate?.() || null;
      let lastMonthlyReset = userData.lastMonthlyReset?.toDate?.() || null;

      // Reset daily counter if it's a new day
      if (!lastDailyReset || lastDailyReset < today) {
        dailyCount = 0;
        lastDailyReset = today;
      }

      // Reset monthly counter if it's a new month
      if (!lastMonthlyReset || lastMonthlyReset < firstDayOfMonth) {
        monthlyCount = 0;
        lastMonthlyReset = firstDayOfMonth;
      }

      // Increment counters
      dailyCount += 1;
      monthlyCount += 1;

      // Convert JavaScript dates to Firestore Timestamps for storage
      const lastDailyResetTimestamp = lastDailyReset ? Timestamp.fromDate(lastDailyReset) : Timestamp.fromDate(today);
      const lastMonthlyResetTimestamp = lastMonthlyReset ? Timestamp.fromDate(lastMonthlyReset) : Timestamp.fromDate(firstDayOfMonth);

      // Update user document with new counters
      transaction.update(userRef, {
        dailyVerifiedCount: dailyCount,
        monthlyVerifiedCount: monthlyCount,
        lastDailyReset: lastDailyResetTimestamp,
        lastMonthlyReset: lastMonthlyResetTimestamp,
        updatedAt: serverTimestamp()
      });
    });
  } catch (error) {
    console.error('Error incrementing verifier counters:', error);
    // Don't throw - we don't want to block verification if counter update fails
  }
}

/**
 * Get verifier counters from user profile
 * 
 * @param verifierId - The ID of the verifier
 * @returns Verifier counters or null if not found
 */
export async function getVerifierCounters(verifierId: string): Promise<VerifierCounters | null> {
  if (!verifierId) {
    return null;
  }

  try {
    const userRef = doc(db, 'users', verifierId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      return null;
    }

    const userData = userDoc.data();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let dailyCount = userData.dailyVerifiedCount || 0;
    let monthlyCount = userData.monthlyVerifiedCount || 0;
    let lastDailyReset = userData.lastDailyReset?.toDate?.() || null;
    let lastMonthlyReset = userData.lastMonthlyReset?.toDate?.() || null;

    // Check if reset is needed (but don't update, just return current values)
    // The reset will happen on the next increment
    if (lastDailyReset && lastDailyReset < today) {
      dailyCount = 0;
    }
    if (lastMonthlyReset && lastMonthlyReset < firstDayOfMonth) {
      monthlyCount = 0;
    }

    return {
      dailyVerifiedCount: dailyCount,
      monthlyVerifiedCount: monthlyCount,
      lastDailyReset: lastDailyReset,
      lastMonthlyReset: lastMonthlyReset
    };
  } catch (error) {
    console.error('Error getting verifier counters:', error);
    return null;
  }
}

