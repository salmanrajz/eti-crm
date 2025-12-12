/**
 * ===============================================================================
 * SYSTEM TIME CHECK UTILITY
 * ===============================================================================
 * 
 * This utility checks if the user's system time is correct by comparing it
 * with Firebase server time. Incorrect system time can cause issues with:
 * - Timestamp-based queries
 * - Date filtering
 * - Session expiration
 * - Scheduled operations
 * 
 * USAGE:
 * Call checkSystemTime() to verify if the system time is within acceptable
 * tolerance of the server time.
 * ===============================================================================
 */

import { getDoc, doc, setDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Maximum allowed time difference in milliseconds (5 minutes)
 */
const MAX_TIME_DIFF_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if the system time is correct by comparing with Firebase server time
 * @returns Object with isValid flag and time difference in milliseconds
 */
export async function checkSystemTime(): Promise<{
  isValid: boolean;
  timeDiffMs: number;
  serverTime: Date | null;
  localTime: Date;
}> {
  try {
    const localTime = new Date();
    const localTimeBeforeRequest = Date.now();
    
    // Use a system document to get server timestamp
    const systemCheckRef = doc(db, '_system', 'timeCheck');
    
    try {
      // Write serverTimestamp to get actual server time
      await setDoc(systemCheckRef, {
        lastCheck: serverTimestamp(),
      }, { merge: true });
      
      // Small delay to ensure server has processed the write
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Read it back to get the server timestamp
      const systemCheckDoc = await getDoc(systemCheckRef);
      
      let serverTime: Date | null = null;
      
      if (systemCheckDoc.exists()) {
        const data = systemCheckDoc.data();
        // Look for server timestamp fields
        const timestamp = data.lastCheck || data.updatedAt || data.createdAt;
        
        if (timestamp) {
          if (timestamp instanceof Timestamp) {
            serverTime = timestamp.toDate();
          } else if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp) {
            serverTime = (timestamp as any).toDate();
          } else if (timestamp instanceof Date) {
            serverTime = timestamp;
          } else if (typeof timestamp === 'number') {
            serverTime = new Date(timestamp);
          }
        }
      }
      
      // If we still don't have server time, estimate based on network latency
      if (!serverTime) {
        const localTimeAfterRequest = Date.now();
        const networkLatency = (localTimeAfterRequest - localTimeBeforeRequest) / 2;
        
        // Estimate server time as local time minus half the network latency
        // This is an approximation, but better than nothing
        serverTime = new Date(localTime.getTime() - networkLatency);
      }
      
      const timeDiffMs = Math.abs(localTime.getTime() - serverTime.getTime());
      const isValid = timeDiffMs <= MAX_TIME_DIFF_MS;
      
      return {
        isValid,
        timeDiffMs,
        serverTime,
        localTime
      };
    } catch (error) {
      // If we can't access Firestore, do a basic sanity check
      const now = Date.now();
      const year2020 = new Date('2020-01-01').getTime();
      const year2100 = new Date('2100-01-01').getTime();
      
      if (now < year2020 || now > year2100) {
        return {
          isValid: false,
          timeDiffMs: Infinity,
          serverTime: null,
          localTime
        };
      }
      
      // If time seems reasonable, allow it (but log warning)
      console.warn('Could not verify system time with server. Using local time check only.');
      return {
        isValid: true,
        timeDiffMs: 0,
        serverTime: null,
        localTime
      };
    }
  } catch (error) {
    console.error('Error checking system time:', error);
    // On error, allow access but log warning
    return {
      isValid: true, // Allow access on error to avoid blocking users
      timeDiffMs: 0,
      serverTime: null,
      localTime: new Date()
    };
  }
}

/**
 * Format time difference for display
 */
export function formatTimeDifference(ms: number): string {
  const absMs = Math.abs(ms);
  const minutes = Math.floor(absMs / 60000);
  const seconds = Math.floor((absMs % 60000) / 1000);
  
  if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}

