import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { generateDeviceFingerprint } from '../utils/deviceFingerprint';
import { isDeviceTrusted, trustDevice } from '../services/trustedDeviceService';
import { toast } from 'react-hot-toast';

interface UseTrustedDeviceResult {
  isTrusted: boolean;
  isLoading: boolean;
  trustDevice: () => Promise<void>;
  isTrusting: boolean;
}

export function useTrustedDevice(user: User | null): UseTrustedDeviceResult {
  const [isTrusted, setIsTrusted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isTrusting, setIsTrusting] = useState(false);

  useEffect(() => {
    if (user) {
      checkTrustedDevice();
    } else {
      setIsTrusted(false);
      setIsLoading(false);
    }
  }, [user]);

  const checkTrustedDevice = async () => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      const deviceFingerprint = generateDeviceFingerprint();
      const trustedDevice = await isDeviceTrusted(user.uid, deviceFingerprint);
      setIsTrusted(!!trustedDevice);
    } catch (error) {
      console.error('Error checking trusted device:', error);
      setIsTrusted(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTrustDevice = async () => {
    if (!user) return;
    
    try {
      setIsTrusting(true);
      const deviceFingerprint = generateDeviceFingerprint();
      await trustDevice(user.uid, deviceFingerprint);
      setIsTrusted(true);
      toast.success('Device marked as trusted for 30 days');
    } catch (error) {
      console.error('Error trusting device:', error);
      toast.error('Failed to mark device as trusted');
    } finally {
      setIsTrusting(false);
    }
  };

  return {
    isTrusted,
    isLoading,
    trustDevice: handleTrustDevice,
    isTrusting
  };
}
