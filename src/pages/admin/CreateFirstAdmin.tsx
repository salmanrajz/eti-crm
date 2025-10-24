/**
 * ===============================================================================
 * CREATE FIRST ADMIN PAGE - INITIAL SYSTEM SETUP
 * ===============================================================================
 * 
 * This page handles the initial setup of the CRM system by creating the first
 * administrator account. It includes security checks to prevent multiple admin
 * creation and provides a clean setup interface for system initialization.
 * 
 * FEATURES:
 * 
 * 1. INITIAL SYSTEM SETUP
 *    - One-time admin account creation for system initialization
 *    - Security checks to prevent multiple admin setup attempts
 *    - Clean setup completion flow with navigation options
 * 
 * 2. SECURITY VALIDATION
 *    - Admin existence checking before allowing new admin creation
 *    - Firebase authentication integration with proper error handling
 *    - User document creation with admin role assignment
 * 
 * 3. USER EXPERIENCE
 *    - Simple form interface for email and password input
 *    - Loading states and progress feedback
 *    - Success confirmation with navigation to login
 * 
 * 4. ERROR HANDLING
 *    - Comprehensive error handling for Firebase operations
 *    - User-friendly error messages for common issues
 *    - Proper cleanup and state management
 * 
 * USAGE:
 * This page is used during the initial setup of the CRM system to create
 * the first administrator account before the system can be used.
 * ===============================================================================
 */

import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { toast } from 'react-hot-toast';
import { Shield } from 'lucide-react';

export function CreateFirstAdmin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);

  // ===============================================================================
  // ADMIN CREATION HANDLER
  // ===============================================================================
  
  /**
   * Handles first admin account creation with security validation
   * Prevents multiple admin creation and handles Firebase integration
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Check if any admin already exists to prevent multiple setup
      const usersRef = doc(db, 'users', 'admin-check');
      const adminCheck = await getDoc(usersRef);
      
      if (adminCheck.exists()) {
        toast.error('Admin already exists. Please contact an existing admin for access.');
        return;
      }

      // Create the user in Firebase Auth
      const { user } = await createUserWithEmailAndPassword(auth, email, password);
      
      // Create the user document with admin role
      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        role: 'admin',
        name: email.split('@')[0],
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Set admin check document
      await setDoc(usersRef, {
        exists: true,
        createdAt: new Date()
      });

      toast.success('Admin account created successfully!');
      setSetupComplete(true);
    } catch (error) {
      console.error('Error creating admin:', error);
      if (error instanceof Error) {
        if (error.message.includes('email-already-in-use')) {
          toast.error('Email already in use');
        } else {
          toast.error('Failed to create admin account');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  if (setupComplete) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full text-center">
          <Shield className="mx-auto h-12 w-12 text-green-600" />
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">Setup Complete!</h2>
          <p className="mt-2 text-sm text-gray-600">
            Your admin account has been created. You can now log in with your credentials.
          </p>
          <div className="mt-6">
            <a
              href="/login"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Go to Login
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <Shield className="mx-auto h-12 w-12 text-indigo-600" />
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create First Admin Account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            This form will only work once to create the first admin user
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Creating Admin...' : 'Create Admin Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}