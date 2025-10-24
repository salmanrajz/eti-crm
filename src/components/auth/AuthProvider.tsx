import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { toast } from 'react-hot-toast';
import type { User } from '../../types';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
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