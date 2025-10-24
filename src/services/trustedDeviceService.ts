import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc,
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { TrustedDevice, DeviceFingerprint, TrustedDeviceSettings } from '../types';
import { 
  generateDeviceFingerprint, 
  generateDeviceName, 
  getClientIP, 
  getLocationFromIP,
  compareDeviceFingerprints,
  calculateTrustLevel 
} from '../utils/deviceFingerprint';
import { getCompleteLocationInfo, isGeolocationSupported } from '../utils/geolocationService';

const TRUSTED_DEVICES_COLLECTION = 'trustedDevices';
const SETTINGS_DOC_ID = 'trustedDeviceSettings';

// Default settings
const DEFAULT_SETTINGS: TrustedDeviceSettings = {
  trustDurationDays: 30,
  maxTrustedDevices: 5,
  requireIpValidation: false,
  allowAdminRevoke: true,
  notifyNewDevice: true
};

/**
 * Trust a device for a user
 */
export async function trustDevice(
  userId: string, 
  deviceFingerprint: DeviceFingerprint,
  deviceName?: string,
  requestLocation: boolean = false
): Promise<TrustedDevice> {
  try {
    // Use default settings to avoid permission issues
    const settings = DEFAULT_SETTINGS;
    const ipAddress = await getClientIP();
    const ipLocation = await getLocationFromIP(ipAddress);
    
    // Generate device name if not provided
    const finalDeviceName = deviceName || generateDeviceName(deviceFingerprint);
    
    // Check if device is already trusted
    const existingDevice = await findTrustedDeviceByFingerprint(userId, deviceFingerprint);
    console.log('Existing device check:', existingDevice ? `Found device with ID: ${existingDevice.id}` : 'No existing device found');
    
    if (existingDevice && existingDevice.id) {
      // Update last seen and extend expiration
      console.log('Updating last seen for device:', existingDevice.id);
      await updateDeviceLastSeen(existingDevice.id);
      return existingDevice;
    }
    
    // Check device limit
    const userDevices = await getUserTrustedDevices(userId);
    if (userDevices.length >= settings.maxTrustedDevices) {
      throw new Error(`Maximum number of trusted devices (${settings.maxTrustedDevices}) reached`);
    }
    
    // Get location information if requested and supported
    let locationData = {
      ipAddress,
      country: ipLocation.country,
      city: ipLocation.city
    };
    
    if (requestLocation && isGeolocationSupported()) {
      try {
        const locationInfo = await getCompleteLocationInfo();
        locationData = {
          ipAddress,
          country: locationInfo.address?.country || ipLocation.country,
          city: locationInfo.address?.city || ipLocation.city,
          coordinates: locationInfo.coordinates,
          address: locationInfo.address
        };
      } catch (locationError) {
        console.warn('Failed to get location data, using IP-based location:', locationError);
        // Continue with IP-based location if geolocation fails
      }
    }
    
    // Create new trusted device
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + settings.trustDurationDays);
    
    const trustedDevice: TrustedDevice = {
      id: '', // Will be set by Firestore
      deviceId: deviceFingerprint.deviceId,
      userId,
      deviceName: finalDeviceName,
      deviceInfo: {
        userAgent: deviceFingerprint.userAgent,
        platform: deviceFingerprint.platform,
        browser: deviceFingerprint.browser,
        os: deviceFingerprint.os,
        screenResolution: deviceFingerprint.screenResolution,
        timezone: deviceFingerprint.timezone
      },
      location: locationData,
      createdAt: new Date(),
      lastSeen: new Date(),
      expiresAt,
      isActive: true,
      trustLevel: calculateTrustLevel(deviceFingerprint)
    };
    
    // Save to Firestore using addDoc instead of setDoc
    const docRef = await addDoc(collection(db, TRUSTED_DEVICES_COLLECTION), {
      deviceId: trustedDevice.deviceId,
      userId: trustedDevice.userId,
      deviceName: trustedDevice.deviceName,
      deviceInfo: trustedDevice.deviceInfo,
      location: trustedDevice.location,
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      expiresAt: trustedDevice.expiresAt, // Use the calculated expiration date
      isActive: trustedDevice.isActive,
      trustLevel: trustedDevice.trustLevel
    });
    
    // Return the created device with the new ID
    return {
      ...trustedDevice,
      id: docRef.id
    };
  } catch (error) {
    console.error('Error trusting device:', error);
    throw error;
  }
}

/**
 * Check if current device is trusted
 */
export async function isDeviceTrusted(
  userId: string, 
  deviceFingerprint: DeviceFingerprint
): Promise<TrustedDevice | null> {
  try {
    const trustedDevice = await findTrustedDeviceByFingerprint(userId, deviceFingerprint);
    
    if (!trustedDevice) {
      return null;
    }
    
    // Check if device is still active and not expired
    if (!trustedDevice.isActive || new Date() > trustedDevice.expiresAt) {
      return null;
    }
    
    // Update last seen
    console.log('Updating last seen for trusted device:', trustedDevice.id);
    await updateDeviceLastSeen(trustedDevice.id);
    
    return trustedDevice;
  } catch (error) {
    console.error('Error checking trusted device:', error);
    return null;
  }
}

/**
 * Find trusted device by fingerprint
 */
async function findTrustedDeviceByFingerprint(
  userId: string, 
  deviceFingerprint: DeviceFingerprint
): Promise<TrustedDevice | null> {
  try {
    // Skip the query if userId is empty (during login check)
    if (!userId) {
      return null;
    }
    
    const q = query(
      collection(db, TRUSTED_DEVICES_COLLECTION),
      where('userId', '==', userId),
      where('isActive', '==', true)
    );
    
    const querySnapshot = await getDocs(q);
    
    for (const docSnapshot of querySnapshot.docs) {
      const data = docSnapshot.data();
      const device = { ...data, id: docSnapshot.id } as TrustedDevice;
      
      // Debug: Check if ID is properly set
      if (!device.id) {
        console.warn('Device found but ID is empty:', docSnapshot.id, device);
        continue;
      }
      
      // Convert Firestore timestamps to Date objects
      device.createdAt = device.createdAt?.toDate?.() || device.createdAt || new Date();
      device.lastSeen = device.lastSeen?.toDate?.() || device.lastSeen || new Date();
      device.expiresAt = device.expiresAt?.toDate?.() || device.expiresAt || new Date();
      
      // Compare device fingerprints
      const storedFingerprint: DeviceFingerprint = {
        deviceId: device.deviceId,
        userAgent: device.deviceInfo.userAgent,
        platform: device.deviceInfo.platform,
        browser: device.deviceInfo.browser,
        os: device.deviceInfo.os,
        screenResolution: device.deviceInfo.screenResolution,
        timezone: device.deviceInfo.timezone,
        language: '', // Not stored in deviceInfo
        cookieEnabled: true, // Assume true for stored devices
        doNotTrack: false // Assume false for stored devices
      };
      
      if (compareDeviceFingerprints(deviceFingerprint, storedFingerprint)) {
        console.log('Found matching trusted device:', device.id, device.deviceName);
        return device;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error finding trusted device:', error);
    return null;
  }
}

/**
 * Get all trusted devices for a user
 */
export async function getUserTrustedDevices(userId: string): Promise<TrustedDevice[]> {
  try {
    const q = query(
      collection(db, TRUSTED_DEVICES_COLLECTION),
      where('userId', '==', userId),
      orderBy('lastSeen', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const devices: TrustedDevice[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const device = { ...data, id: doc.id } as TrustedDevice;
      
      // Convert Firestore timestamps to Date objects
      device.createdAt = device.createdAt?.toDate?.() || device.createdAt || new Date();
      device.lastSeen = device.lastSeen?.toDate?.() || device.lastSeen || new Date();
      device.expiresAt = device.expiresAt?.toDate?.() || device.expiresAt || new Date();
      
      devices.push(device);
    });
    
    return devices;
  } catch (error) {
    console.error('Error getting user trusted devices:', error);
    return [];
  }
}

/**
 * Revoke a trusted device
 */
export async function revokeTrustedDevice(deviceId: string): Promise<void> {
  try {
    await updateDoc(doc(db, TRUSTED_DEVICES_COLLECTION, deviceId), {
      isActive: false,
      revokedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error revoking trusted device:', error);
    throw error;
  }
}

/**
 * Delete a trusted device permanently
 */
export async function deleteTrustedDevice(deviceId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, TRUSTED_DEVICES_COLLECTION, deviceId));
  } catch (error) {
    console.error('Error deleting trusted device:', error);
    throw error;
  }
}

/**
 * Update device last seen timestamp
 */
async function updateDeviceLastSeen(deviceId: string): Promise<void> {
  try {
    if (!deviceId) {
      console.warn('Cannot update device last seen: deviceId is empty');
      return;
    }
    await updateDoc(doc(db, TRUSTED_DEVICES_COLLECTION, deviceId), {
      lastSeen: serverTimestamp()
    });
  } catch (error) {
    console.error('Error updating device last seen:', error);
  }
}

/**
 * Get trusted device settings
 */
export async function getTrustedDeviceSettings(): Promise<TrustedDeviceSettings> {
  try {
    const docRef = doc(db, 'settings', SETTINGS_DOC_ID);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { ...DEFAULT_SETTINGS, ...docSnap.data() } as TrustedDeviceSettings;
    }
    
    // Return default settings without creating document to avoid permission issues
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Error getting trusted device settings:', error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * Update trusted device settings (admin only)
 */
export async function updateTrustedDeviceSettings(
  settings: Partial<TrustedDeviceSettings>
): Promise<void> {
  try {
    const docRef = doc(db, 'settings', SETTINGS_DOC_ID);
    await setDoc(docRef, settings, { merge: true });
  } catch (error) {
    console.error('Error updating trusted device settings:', error);
    throw error;
  }
}

/**
 * Get all trusted devices (admin only)
 */
export async function getAllTrustedDevices(): Promise<TrustedDevice[]> {
  try {
    const q = query(
      collection(db, TRUSTED_DEVICES_COLLECTION),
      orderBy('lastSeen', 'desc'),
      limit(100) // Limit for performance
    );
    
    const querySnapshot = await getDocs(q);
    const devices: TrustedDevice[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const device = { ...data, id: doc.id } as TrustedDevice;
      
      // Convert Firestore timestamps to Date objects
      device.createdAt = device.createdAt?.toDate?.() || device.createdAt || new Date();
      device.lastSeen = device.lastSeen?.toDate?.() || device.lastSeen || new Date();
      device.expiresAt = device.expiresAt?.toDate?.() || device.expiresAt || new Date();
      
      devices.push(device);
    });
    
    return devices;
  } catch (error) {
    console.error('Error getting all trusted devices:', error);
    return [];
  }
}

/**
 * Clean up expired trusted devices
 */
export async function cleanupExpiredDevices(): Promise<void> {
  try {
    const q = query(
      collection(db, TRUSTED_DEVICES_COLLECTION),
      where('expiresAt', '<', new Date()),
      where('isActive', '==', true)
    );
    
    const querySnapshot = await getDocs(q);
    const batch = [];
    
    querySnapshot.forEach((doc) => {
      batch.push(updateDoc(doc.ref, { isActive: false }));
    });
    
    await Promise.all(batch);
  } catch (error) {
    console.error('Error cleaning up expired devices:', error);
  }
}
