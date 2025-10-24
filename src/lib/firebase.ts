import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { 
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore, 
  doc, 
  setDoc, 
  serverTimestamp, 
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  onSnapshot
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging } from 'firebase/messaging';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { UserRole, CoordinatorType } from '../types';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Initialize Firestore with persistent cache and multi-tab manager
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
});

export const storage = getStorage(app);
export const functions = getFunctions(app);

let messaging;
try {
  messaging = getMessaging(app);
} catch (error) {
  console.warn('Firebase messaging not supported in this environment');
}
export { messaging };

// Cloud Functions
export const claimNumberFunction = httpsCallable(functions, 'claimNumber');
export const processLeadRejectionFunction = httpsCallable(functions, 'processLeadRejection');
export const checkNumberAvailabilityFunction = httpsCallable(functions, 'checkNumberAvailability');

interface CreateUserOptions {
  teamId?: string;
  managerId?: string;
  coordinatorType?: CoordinatorType;
}

export async function createUserWithDocument(
  email: string, 
  password: string, 
  role: UserRole, 
  name: string,
  options: CreateUserOptions = {}
) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const userId = userCredential.user.uid;

    const userRef = doc(db, 'users', userId);
    const userData = {
      id: userId,
      email,
      role,
      name,
      ...(options.teamId && { teamId: options.teamId }),
      ...(options.managerId && { managerId: options.managerId }),
      ...(options.coordinatorType && { coordinatorType: options.coordinatorType }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(userRef, userData, { merge: true });
    await signOut(auth);
    return userCredential.user;
  } catch (error: any) {
    console.error('Error creating user:', error);

    if (error.code === 'auth/email-already-in-use') {
      throw new Error('Email already in use');
    } else if (error.code === 'auth/invalid-email') {
      throw new Error('Invalid email format');
    } else if (error.code === 'auth/weak-password') {
      throw new Error('Password is too weak');
    } else if (error.code === 'permission-denied') {
      throw new Error('Permission denied. Please check your admin privileges.');
    } else if (error.code === 'unavailable') {
      throw new Error('Firebase service is currently unavailable. Please check your internet connection.');
    }
    throw error;
  }
}

export async function deleteUsers(userIds: string[]) {
  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[]
  };

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('No authenticated user');
  }

  for (const userId of userIds) {
    try {
      const userRef = doc(db, 'users', userId);
      await deleteDoc(userRef);
      results.success++;
    } catch (error) {
      console.error(`Error deleting user ${userId}:`, error);
      results.failed++;
      results.errors.push(`Failed to delete user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return results;
}

// Realtime listener setup with read optimization
export function listenToUsers(onChange: (doc: any, type: string) => void) {
  const q = query(collection(db, 'users'));
  return onSnapshot(q, (snapshot) => {
    if (snapshot.metadata.fromCache) return; // Skip if from cache

    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added' || change.type === 'modified' || change.type === 'removed') {
        onChange(change.doc.data(), change.type);
      }
    });
  });
}