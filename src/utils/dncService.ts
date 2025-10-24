import { db } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, orderBy, limit, startAfter, serverTimestamp, DocumentSnapshot, getDoc } from 'firebase/firestore';

export interface DNCRecord {
  id?: string;
  number: string;
  addedBy: string;
  addedAt: Date;
  reason?: string;
  source?: string; // 'manual', 'api', 'import'
  status: 'active' | 'inactive';
}

export interface WhatsAppCheckLog {
  id?: string;
  number: string;
  checkedBy: string;
  checkedAt: Date;
  result: 'exists' | 'not_exists' | 'error';
  whatsappJid?: string;
  isDNC: boolean;
  inNumberPool: boolean;
  errorMessage?: string;
  apiEndpoint: string;
  responseTime?: number;
}

/**
 * Check if a number is in the DNC database
 * @param number - Phone number to check (with country code)
 * @returns Promise<boolean> - true if number is in DNC, false otherwise
 */
export async function checkDNCNumber(number: string): Promise<boolean> {
  try {
    // Clean the number - remove any non-digit characters except +
    const cleanNumber = number.replace(/[^\d+]/g, '');
    
    // Query the DNC collection for this number
    const dncQuery = query(
      collection(db, 'dncNumbers'),
      where('number', '==', cleanNumber),
      where('status', '==', 'active')
    );
    
    const querySnapshot = await getDocs(dncQuery);
    return !querySnapshot.empty;
  } catch (error) {
    console.error('Error checking DNC number:', error);
    return false; // Return false on error to allow calling
  }
}

/**
 * Add a number to the DNC database
 * @param number - Phone number to add
 * @param addedBy - User ID who added the number
 * @param reason - Optional reason for adding to DNC
 * @param source - Source of the DNC entry
 */
export async function addToDNC(
  number: string, 
  addedBy: string, 
  reason?: string, 
  source: string = 'manual'
): Promise<void> {
  try {
    const cleanNumber = number.replace(/[^\d+]/g, '');
    
    const dncRecord: any = {
      number: cleanNumber,
      addedBy,
      addedAt: serverTimestamp(),
      source,
      status: 'active'
    };
    
    // Only add reason if it's provided and not empty
    if (reason && reason.trim()) {
      dncRecord.reason = reason.trim();
    }
    
    await addDoc(collection(db, 'dncNumbers'), dncRecord);
  } catch (error) {
    console.error('Error adding number to DNC:', error);
    throw error;
  }
}

/**
 * Remove a number from the DNC database
 * @param number - Phone number to remove
 */
export async function removeFromDNC(number: string): Promise<void> {
  try {
    const cleanNumber = number.replace(/[^\d+]/g, '');
    
    const dncQuery = query(
      collection(db, 'dncNumbers'),
      where('number', '==', cleanNumber)
    );
    
    const querySnapshot = await getDocs(dncQuery);
    
    // Delete all matching documents
    const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
  } catch (error) {
    console.error('Error removing number from DNC:', error);
    throw error;
  }
}

/**
 * Get all DNC numbers (admin only)
 * @param limitCount - Maximum number of records to return
 * @param lastDoc - Last document for pagination (optional)
 */
export async function getAllDNCNumbers(
  limitCount: number = 50, 
  lastDoc?: DocumentSnapshot
): Promise<{ records: DNCRecord[]; lastDoc: DocumentSnapshot | null; hasMore: boolean }> {
  try {
    let dncQuery = query(
      collection(db, 'dncNumbers'),
      orderBy('addedAt', 'desc'),
      limit(limitCount + 1) // Get one extra to check if there are more
    );

    if (lastDoc) {
      dncQuery = query(
        collection(db, 'dncNumbers'),
        orderBy('addedAt', 'desc'),
        startAfter(lastDoc),
        limit(limitCount + 1)
      );
    }
    
    const querySnapshot = await getDocs(dncQuery);
    const docs = querySnapshot.docs;
    
    const hasMore = docs.length > limitCount;
    const records = docs.slice(0, limitCount).map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        addedAt: data.addedAt?.toDate ? data.addedAt.toDate() : new Date(data.addedAt)
      } as DNCRecord;
    });

    return {
      records,
      lastDoc: hasMore ? docs[limitCount - 1] : null,
      hasMore
    };
  } catch (error) {
    console.error('Error getting DNC numbers:', error);
    return { records: [], lastDoc: null, hasMore: false };
  }
}

/**
 * Check multiple numbers against DNC database
 * @param numbers - Array of phone numbers to check
 * @returns Promise<Record<string, boolean>> - Object with number as key and DNC status as value
 */
export async function checkMultipleDNCNumbers(numbers: string[]): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  
  // Process numbers in batches to avoid overwhelming Firestore
  const batchSize = 10;
  for (let i = 0; i < numbers.length; i += batchSize) {
    const batch = numbers.slice(i, i + batchSize);
    const batchPromises = batch.map(async (number) => {
      const isDNC = await checkDNCNumber(number);
      results[number] = isDNC;
    });
    
    await Promise.all(batchPromises);
  }
  
  return results;
}

/**
 * Get user names by IDs
 * @param userIds - Array of user IDs
 * @returns Promise<Record<string, string>> - Object with user ID as key and user name as value
 */
export async function getUserNames(userIds: string[]): Promise<Record<string, string>> {
  try {
    const userNames: Record<string, string> = {};
    
    // Process in batches to avoid overwhelming Firestore
    const batchSize = 10;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (userId) => {
        try {
          const userDoc = await getDoc(doc(db, 'users', userId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            userNames[userId] = userData.name || 'Unknown User';
          } else {
            userNames[userId] = 'Unknown User';
          }
        } catch (error) {
          userNames[userId] = 'Unknown User';
        }
      });
      
      await Promise.all(batchPromises);
    }
    
    return userNames;
  } catch (error) {
    console.error('Error getting user names:', error);
    return {};
  }
}

/**
 * Get user details (name and team) by IDs
 * @param userIds - Array of user IDs
 * @returns Promise<Record<string, {name: string, teamName: string}>> - Object with user ID as key and user details as value
 */
export async function getUserDetails(userIds: string[]): Promise<Record<string, {name: string, teamName: string}>> {
  try {
    const userDetails: Record<string, {name: string, teamName: string}> = {};
    
    // Process in batches to avoid overwhelming Firestore
    const batchSize = 10;
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize);
      const batchPromises = batch.map(async (userId) => {
        try {
          const userDoc = await getDoc(doc(db, 'users', userId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            let teamName = 'No Team';
            
            // Get team name if user has a team
            if (userData.teamId) {
              try {
                const teamDoc = await getDoc(doc(db, 'teams', userData.teamId));
                if (teamDoc.exists()) {
                  teamName = teamDoc.data().name || 'Unknown Team';
                }
              } catch (error) {
                teamName = 'Unknown Team';
              }
            }
            
            userDetails[userId] = {
              name: userData.name || 'Unknown User',
              teamName: teamName
            };
          } else {
            userDetails[userId] = {
              name: 'Unknown User',
              teamName: 'No Team'
            };
          }
        } catch (error) {
          userDetails[userId] = {
            name: 'Unknown User',
            teamName: 'No Team'
          };
        }
      });
      
      await Promise.all(batchPromises);
    }
    
    return userDetails;
  } catch (error) {
    console.error('Error getting user details:', error);
    return {};
  }
}

/**
 * Log a WhatsApp number check result
 * @param logData - WhatsApp check log data
 */
export async function logWhatsAppCheck(logData: Omit<WhatsAppCheckLog, 'id' | 'checkedAt'>): Promise<void> {
  try {
    const logRecord = {
      ...logData,
      checkedAt: serverTimestamp()
    };
    
    await addDoc(collection(db, 'whatsappCheckLogs'), logRecord);
  } catch (error) {
    console.error('Error logging WhatsApp check:', error);
    // Don't throw error to avoid breaking the main functionality
  }
}

/**
 * Get WhatsApp check logs with pagination (admin only)
 * @param limitCount - Maximum number of records to return
 * @param lastDoc - Last document for pagination (optional)
 */
export async function getWhatsAppCheckLogs(
  limitCount: number = 50, 
  lastDoc?: DocumentSnapshot
): Promise<{ records: WhatsAppCheckLog[]; lastDoc: DocumentSnapshot | null; hasMore: boolean }> {
  try {
    let logsQuery = query(
      collection(db, 'whatsappCheckLogs'),
      orderBy('checkedAt', 'desc'),
      limit(limitCount + 1) // Get one extra to check if there are more
    );

    if (lastDoc) {
      logsQuery = query(
        collection(db, 'whatsappCheckLogs'),
        orderBy('checkedAt', 'desc'),
        startAfter(lastDoc),
        limit(limitCount + 1)
      );
    }
    
    const querySnapshot = await getDocs(logsQuery);
    const docs = querySnapshot.docs;
    
    const hasMore = docs.length > limitCount;
    const records = docs.slice(0, limitCount).map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        checkedAt: data.checkedAt?.toDate ? data.checkedAt.toDate() : new Date(data.checkedAt)
      } as WhatsAppCheckLog;
    });

    return {
      records,
      lastDoc: hasMore ? docs[limitCount - 1] : null,
      hasMore
    };
  } catch (error) {
    console.error('Error getting WhatsApp check logs:', error);
    return { records: [], lastDoc: null, hasMore: false };
  }
}
