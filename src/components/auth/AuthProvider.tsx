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
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { toast } from 'react-hot-toast';
import { generateDeviceFingerprint } from '../../utils/deviceFingerprint';
import { isDeviceTrusted } from '../../services/trustedDeviceService';

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
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            // Check if this is a fresh login or session restoration
            const isFreshLogin = sessionStorage.getItem('freshLogin') === 'true';
            
            if (isFreshLogin) {
              // Fresh login: User just entered credentials, allow login regardless of device trust
              sessionStorage.removeItem('freshLogin'); // Clean up
              
              const userData = userDoc.data();
              setUser({
                id: firebaseUser.uid,
                email: userData.email,
                role: userData.role,
                name: userData.name,
                teamId: userData.teamId,
                managerId: userData.managerId,
                coordinatorType: userData.coordinatorType,
                verifierGroups: userData.verifierGroups,
                phoneNumbers: userData.phoneNumbers,
                // Handle potentially missing timestamp fields
                createdAt: userData.createdAt?.toDate() || new Date(),
                updatedAt: userData.updatedAt?.toDate() || new Date()
              });
              
              // Check device trust in background for fresh login
              try {
                const deviceFingerprint = generateDeviceFingerprint();
                const trustedDevice = await isDeviceTrusted(firebaseUser.uid, deviceFingerprint);
                
                if (trustedDevice && trustedDevice.isActive && new Date() < trustedDevice.expiresAt) {
                  toast.success('Welcome back from trusted device!');
                }
              } catch (trustError) {
                console.log('Device trust check failed (non-blocking):', trustError);
              }
            } else {
              // Session restoration: Browser reopened, check device trust
              try {
                const deviceFingerprint = generateDeviceFingerprint();
                const trustedDevice = await isDeviceTrusted(firebaseUser.uid, deviceFingerprint);
                
                if (trustedDevice && trustedDevice.isActive && new Date() < trustedDevice.expiresAt) {
                  // Device is trusted and active, proceed with login
                  const userData = userDoc.data();
                  setUser({
                    id: firebaseUser.uid,
                    email: userData.email,
                    role: userData.role,
                    name: userData.name,
                    teamId: userData.teamId,
                    managerId: userData.managerId,
                    coordinatorType: userData.coordinatorType,
                    verifierGroups: userData.verifierGroups,
                    phoneNumbers: userData.phoneNumbers,
                    // Handle potentially missing timestamp fields
                    createdAt: userData.createdAt?.toDate() || new Date(),
                    updatedAt: userData.updatedAt?.toDate() || new Date()
                  });
                  
                  // Show welcome message for trusted device
                  toast.success('Welcome back from trusted device!');
                } else {
                  // Device is not trusted or expired, force logout
                  console.log('Device not trusted or expired, logging out...');
                  await auth.signOut();
                  setUser(null);
                  // Don't show error toast as this is expected behavior
                }
              } catch (trustError) {
                console.log('Device trust check failed, logging out for security:', trustError);
                // If trust check fails, logout for security
                await auth.signOut();
                setUser(null);
              }
            }
          } else {
            // Only admins can create users now
            await auth.signOut();
            toast.error('User account not found. Please contact an administrator.');
          }
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
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

    return () => unsubscribe();
  }, [setUser, setLoading]);

  return <>{children}</>;
}