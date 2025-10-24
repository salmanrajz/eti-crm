/**
 * Geolocation service for getting user's current location
 */

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
}

export interface LocationInfo {
  coordinates: LocationCoordinates;
  address?: {
    city?: string;
    state?: string;
    country?: string;
    countryCode?: string;
    postalCode?: string;
  };
}

/**
 * Force clear any cached location permissions (if possible)
 */
function clearLocationCache() {
  // Try to clear any cached permissions by requesting with immediate rejection
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      () => {}, // Success callback - do nothing
      () => {}, // Error callback - do nothing
      { 
        enableHighAccuracy: false, 
        timeout: 1, 
        maximumAge: 0 
      }
    );
  }
}

/**
 * Request user's current location using browser geolocation API
 * Forces fresh permission request every time
 */
export function requestLocationPermission(): Promise<LocationCoordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser'));
      return;
    }

    // Clear any cached permissions first
    clearLocationCache();

    // Force fresh permission request by setting maximumAge to 0
    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000, // Increased timeout
      maximumAge: 0 // Force fresh location, no caching
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        });
      },
      (error) => {
        let errorMessage = 'Unable to get your location';
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied by user';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information is unavailable';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out';
            break;
        }
        
        reject(new Error(errorMessage));
      },
      options
    );
  });
}

/**
 * Reverse geocode coordinates to get address information
 */
export async function reverseGeocode(coordinates: LocationCoordinates): Promise<LocationInfo['address']> {
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}&localityLanguage=en`
    );
    
    if (!response.ok) {
      throw new Error('Reverse geocoding failed');
    }
    
    const data = await response.json();
    
    return {
      city: data.city || data.locality,
      state: data.principalSubdivision,
      country: data.countryName,
      countryCode: data.countryCode,
      postalCode: data.postcode
    };
  } catch (error) {
    console.error('Error reverse geocoding:', error);
    return undefined;
  }
}

/**
 * Get complete location information (coordinates + address)
 */
export async function getCompleteLocationInfo(): Promise<LocationInfo> {
  try {
    // Get coordinates
    const coordinates = await requestLocationPermission();
    
    // Get address information
    const address = await reverseGeocode(coordinates);
    
    return {
      coordinates,
      address
    };
  } catch (error) {
    console.error('Error getting location info:', error);
    throw error;
  }
}

/**
 * Check if geolocation is supported and permission can be requested
 */
export function isGeolocationSupported(): boolean {
  return 'geolocation' in navigator;
}

/**
 * Get location permission status
 */
export async function getLocationPermissionStatus(): Promise<PermissionState | null> {
  if (!navigator.permissions) {
    return null;
  }
  
  try {
    const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return permission.state;
  } catch (error) {
    console.error('Error checking location permission:', error);
    return null;
  }
}

/**
 * Force request location permission even if already granted
 * This will always show the native popup
 */
export function forceLocationPermissionRequest(): Promise<LocationCoordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser'));
      return;
    }

    // Use watchPosition instead of getCurrentPosition to force permission request
    // This often triggers the permission popup even if already granted
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        // Clear the watch immediately after getting position
        navigator.geolocation.clearWatch(watchId);
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        });
      },
      (error) => {
        navigator.geolocation.clearWatch(watchId);
        let errorMessage = 'Unable to get your location';
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied by user';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information is unavailable';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out';
            break;
        }
        
        reject(new Error(errorMessage));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );

    // Fallback timeout in case watchPosition doesn't work
    setTimeout(() => {
      navigator.geolocation.clearWatch(watchId);
      reject(new Error('Location request timed out'));
    }, 16000);
  });
}
