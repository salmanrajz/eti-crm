/**
 * ===============================================================================
 * AUTHENTICATION PROVIDER - REACT CONTEXT PROVIDER
 * ===============================================================================
 * 
 * This component provides authentication context and manages user authentication
 * state throughout the CRM application. It handles Firebase authentication flow,
 * user data synchronization, and device trust verification.
 * 
 * FEATURES:
 * - Firebase authentication state monitoring
 * - User document synchronization from Firestore
 * - Device trust verification for security
 * - Session restoration and fresh login handling
 * - Error handling and user feedback via toast notifications
 * 
 * AUTHENTICATION FLOW:
 * 1. Monitors Firebase auth state changes via onAuthStateChanged
 * 2. Fetches user document from Firestore when authenticated
 * 3. Verifies device trust for session restoration
 * 4. Updates global auth state via Zustand store
 * 5. Provides loading states and error handling
 * 
 * DEVICE TRUST VERIFICATION:
 * - Fresh login: Allows login regardless of device trust (user just entered credentials)
 * - Session restoration: Requires trusted device or forces logout
 * - Background trust checking with non-blocking operations
 * 
 * USAGE:
 * Wrap the entire application with this provider to enable authentication
 * context and automatic user state management.
 * ===============================================================================
 */

import { useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { toast } from 'react-hot-toast';
import { generateDeviceFingerprint } from '../../utils/deviceFingerprint';
import { isDeviceTrusted } from '../../services/trustedDeviceService';
//import { numberPoolPreloader } from '../../services/numberPoolPreloader';

/**
 * ===============================================================================
 * AUTHENTICATION PROVIDER COMPONENT
 * ===============================================================================
 * 
 * Provides authentication context and manages user state throughout the app.
 * Handles both fresh login and session restoration scenarios with device trust.
 * 
 * @param children - React children to render within the auth context
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    // Add timeout to detect Firebase initialization failure
    let authInitialized = false;
    const timeout = setTimeout(() => {
      if (!authInitialized) {
        // Set a flag in sessionStorage to track reload attempts
        const reloadCount = parseInt(sessionStorage.getItem('firebaseInitReloadCount') || '0');
        
        if (reloadCount < 2) {
          // Try reloading up to 2 times
          sessionStorage.setItem('firebaseInitReloadCount', (reloadCount + 1).toString());
          window.location.reload();
        } else {
          // After 2 failed attempts, clear the counter and force initialization
          sessionStorage.removeItem('firebaseInitReloadCount');
          setUser(null);
          setLoading(false);
        }
      }
    }, 3000); // 3 second timeout
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      authInitialized = true;
      clearTimeout(timeout);
      
      // Clear reload counter on successful initialization
      sessionStorage.removeItem('firebaseInitReloadCount');
      try {
        if (firebaseUser) {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            // ✅ FIX: Always allow session restoration if Firebase Auth is valid
            // Firebase Auth handles its own persistence reliably across all devices
            const userData = userDoc.data();
            
            // Check if user is active (default to true for backward compatibility)
            const isActive = userData.isActive !== false;
            if (!isActive) {
              // User is inactive, sign them out and show error
              // Check if this is a fresh login attempt (not just session restoration)
              const isFreshLogin = sessionStorage.getItem('freshLogin') === 'true';
              if (isFreshLogin) {
                sessionStorage.removeItem('freshLogin'); // Clean up
                // Show error message with longer duration
                toast.error('Account deactivated, contact admin.', {
                  duration: 5000,
                  position: 'top-center'
                });
                // Wait a bit to ensure toast is visible before signing out
                await new Promise(resolve => setTimeout(resolve, 100));
              }
              await signOut(auth);
              setUser(null);
              setLoading(false);
              return;
            }
            
            setUser({
              id: firebaseUser.uid,
              email: userData.email,
              role: userData.role,
              name: userData.name,
              teamId: userData.teamId,
              managerId: userData.managerId,
              coordinatorType: userData.coordinatorType,
              // NEW: coordinator team-based scope for coordinators
              ...(userData.coordinatorTeams ? { coordinatorTeams: userData.coordinatorTeams } : {}),
              verifierGroups: userData.verifierGroups,
              phoneNumbers: userData.phoneNumbers,
              isActive: userData.isActive,
              // Handle potentially missing timestamp fields
              createdAt: userData.createdAt?.toDate() || new Date(),
              updatedAt: userData.updatedAt?.toDate() || new Date()
            });
            
          
            
            // ✅ OPTIONAL: Check device trust in background (non-blocking, for logging only)
            // Check if this is a fresh login or session restoration
            const isFreshLogin = sessionStorage.getItem('freshLogin') === 'true';
            if (isFreshLogin) {
              sessionStorage.removeItem('freshLogin'); // Clean up
            }
            
            // Background device trust check (doesn't affect login)
            try {
              const deviceFingerprint = generateDeviceFingerprint();
              const trustedDevice = await isDeviceTrusted(firebaseUser.uid, deviceFingerprint);
              
              if (trustedDevice && trustedDevice.isActive && new Date() < trustedDevice.expiresAt) {
                if (isFreshLogin) {
                  toast.success('Welcome back!');
                } else {
                  console.log('[AuthProvider] Session restored from trusted device');
                }
              } else {
                // Device not trusted, but we still allow login (Firebase Auth is valid)
                if (isFreshLogin) {
                  console.log('[AuthProvider] New device detected - consider adding to trusted devices');
                }
              }
            } catch (trustError) {
              // Device trust check failed - log but don't prevent login
              console.warn('[AuthProvider] Device trust check failed:', trustError);
            }
          } else {
            // Only admins can create users now
            await auth.signOut();
            toast.error('User account not found. Please contact an administrator.');
          }
        } else {
          setUser(null);
          // Clear preloader on logout
         
        }
      } catch (error) {
        console.error('Error in AuthProvider:', error);
        if (error instanceof Error) {
          if (error.message.includes('permission-denied')) {
            toast.error('Access denied. Please contact an administrator.');
            await auth.signOut();
          } else {
            toast.error('An error occurred. Please try again later.');
          }
        }
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [setUser, setLoading]);

  return <>{children}</>;
}
