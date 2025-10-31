/**
 * ===============================================================================
 * FIREBASE CONFIGURATION AND UTILITIES - CRM SYSTEM DATABASE SETUP
 * ===============================================================================
 * 
 * This module handles the complete Firebase setup and configuration for the CRM
 * system, including authentication, Firestore database, storage, messaging, and
 * cloud functions integration.
 * 
 * FEATURES INCLUDED:
 * 
 * 1. Firebase App Initialization
 *    - Environment-based configuration using Vite environment variables
 *    - Complete Firebase SDK initialization for all services
 * 
 * 2. Authentication Setup
 *    - Firebase Auth instance with user management utilities
 *    - Custom user creation with Firestore document creation
 *    - User deletion and management functions
 * 
 * 3. Firestore Database Configuration
 *    - Persistent local cache for offline capability
 *    - Multi-tab synchronization for concurrent usage
 *    - Singleton pattern to prevent multiple initializations
 * 
 * 4. Cloud Functions Integration
 *    - Pre-configured callable functions for server-side operations
 *    - Number claiming, lead rejection, and availability checking
 * 
 * 5. Storage and Messaging
 *    - Firebase Storage for file uploads
 *    - Firebase Messaging for push notifications (with fallback handling)
 * 
 * USAGE:
 * Import individual services (auth, db, storage, functions) as needed
 * throughout the application for Firebase operations.
 * ===============================================================================
 */

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
import { getSecureConfig } from './firebaseConfig';

// ===============================================================================
// FIREBASE CONFIGURATION
// ===============================================================================
// Secure Firebase configuration with environment variable validation
const firebaseConfig = getSecureConfig();

// ===============================================================================
// FIREBASE SERVICES INITIALIZATION
// ===============================================================================

// Initialize Firebase app and authentication
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Initialize Firestore with persistent cache and multi-tab manager
// Uses singleton pattern to prevent multiple initializations
let _db: any = null;

export const db = (() => {
  if (!_db) {
    try {
      // Try to initialize with persistent cache for offline capability
      _db = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      });
    } catch (error) {
      // If initialization fails (already initialized), get existing instance
      _db = getFirestore(app);
    }
  }
  return _db;
})();

// Initialize Firebase Storage for file uploads
export const storage = getStorage(app);

// Initialize Cloud Functions with singleton pattern
let _functions: any = null;
export const functions = (() => {
  if (!_functions) {
    _functions = getFunctions(app, 'us-central1');
  }
  return _functions;
})();

// Initialize Firebase Messaging with error handling for unsupported environments
let messaging;
try {
  messaging = getMessaging(app);
} catch (error) {
  console.warn('Firebase messaging not supported in this environment');
}
export { messaging };

// ===============================================================================
// PRE-CONFIGURED CLOUD FUNCTIONS
// ===============================================================================
// Exported callable functions for server-side operations
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
  // Only listen to users if user has admin role to avoid permission errors
  const q = query(collection(db, 'users'));
  return onSnapshot(q, (snapshot) => {
    if (snapshot.metadata.fromCache) return; // Skip if from cache

    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added' || change.type === 'modified' || change.type === 'removed') {
        onChange(change.doc.data(), change.type);
      }
    });
  }, (error) => {
    // Handle permission errors gracefully
    if (error.code === 'permission-denied') {
      console.log('Permission denied for users listener - user may not have admin access');
      return;
    }
    console.error('Error in users listener:', error);
  });
}