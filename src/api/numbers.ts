/**
 * ===============================================================================
 * NUMBERS API SERVICE - BATCH NUMBER DELETION UTILITIES
 * ===============================================================================
 * 
 * This module provides API functions for managing number operations in the
 * number pool collection. Currently focused on efficient batch deletion
 * operations while respecting Firebase Firestore limitations.
 * 
 * FUNCTIONS INCLUDED:
 * 
 * deleteNumbersInBatch - Efficiently deletes multiple numbers in batches
 * - Handles Firebase's "in" query limit of 10 items per query
 * - Uses batch operations for atomic deletions
 * - Returns detailed results about successful and failed deletions
 * 
 * FIREBASE LIMITATIONS HANDLED:
 * - Firebase "in" queries are limited to 10 items maximum
 * - Batch operations are used for atomic, efficient deletion
 * - Proper error handling and result reporting
 * 
 * USAGE:
 * Import this service in components that need to perform bulk number
 * deletion operations in the number pool management interface.
 * ===============================================================================
 */

import { collection, query, where, getDocs, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * ===============================================================================
 * BATCH NUMBER DELETION FUNCTION
 * ===============================================================================
 * 
 * Efficiently deletes multiple phone numbers from the numberPool collection
 * in batches to respect Firebase Firestore limitations. Numbers are moved to
 * the returnedNumbers collection with status "returned" before deletion.
 * 
 * @param numbers - Array of phone number strings to delete from the number pool
 * @param userId - Optional user ID of the user performing the deletion
 * @returns Promise resolving to deletion results object
 * 
 * Returns object with:
 * - success: boolean indicating operation success
 * - count: number of documents actually deleted
 * - notFound: number of requested numbers that weren't found
 * 
 * Error Handling:
 * - Throws error if batch operation fails
 * - Logs detailed error information for debugging
 * 
 * Performance:
 * - Processes numbers in chunks of 10 to avoid Firebase "in" query limit
 * - Uses batch operations for atomic, efficient deletions
 */
export const deleteNumbersInBatch = async (numbers: string[], userId?: string) => {
  try {
    const numbersRef = collection(db, 'numberPool');
    const returnedNumbersRef = collection(db, 'returnedNumbers');
    
    // Process numbers in chunks of 10 to avoid Firebase's "in" query limit
    const chunkSize = 10;
    let totalDeleted = 0;
    
    // Process each chunk of numbers separately
    for (let i = 0; i < numbers.length; i += chunkSize) {
      const chunk = numbers.slice(i, i + chunkSize);
      
      // Query for documents matching these numbers
      const q = query(numbersRef, where('number', 'in', chunk));
      const querySnapshot = await getDocs(q);
      
      // Create batches for this chunk
      const deleteBatch = writeBatch(db);
      const returnedBatch = writeBatch(db);
      
      // Process each document: move to returnedNumbers, then delete
      querySnapshot.forEach((docSnapshot) => {
        const numberData = docSnapshot.data();
        
        // Create returned number document with status "returned"
        const returnedNumberData = {
          ...numberData,
          status: 'returned' as const,
          returnedAt: serverTimestamp(),
          deletedBy: userId || null,
          id: docSnapshot.id, // Keep original id for reference
        };
        
        // Add to returnedNumbers collection
        const returnedDocRef = doc(returnedNumbersRef, docSnapshot.id);
        returnedBatch.set(returnedDocRef, returnedNumberData);
        
        // Delete from numberPool
        deleteBatch.delete(docSnapshot.ref);
      });
      
      // Commit both batches for this chunk
      await returnedBatch.commit();
      await deleteBatch.commit();
      
      // Track total deleted documents
      totalDeleted += querySnapshot.size;
    }
    
    // Return detailed results for UI feedback
    return { 
      success: true, 
      count: totalDeleted,
      notFound: numbers.length - totalDeleted
    };
  } catch (error) {
    console.error('Error deleting numbers in batch:', error);
    throw error;
  }
}; 