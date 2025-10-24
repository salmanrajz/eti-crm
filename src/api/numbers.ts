import { collection, query, where, getDocs, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const deleteNumbersInBatch = async (numbers: string[]) => {
  try {
    const batch = writeBatch(db);
    const numbersRef = collection(db, 'numberPool');
    
    // Process numbers in chunks of 10 to avoid Firebase's "in" query limit
    const chunkSize = 10;
    let totalDeleted = 0;
    
    for (let i = 0; i < numbers.length; i += chunkSize) {
      const chunk = numbers.slice(i, i + chunkSize);
      const q = query(numbersRef, where('number', 'in', chunk));
      const querySnapshot = await getDocs(q);
      
      // Add each document to the batch for deletion
      querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      totalDeleted += querySnapshot.size;
    }
    
    // Commit the batch
    await batch.commit();
    
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