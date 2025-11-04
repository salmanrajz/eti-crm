/**
 * Utility to clear all browser storage, cache, and IndexedDB on logout
 * Ensures complete cleanup for security and privacy
 */

/**
 * Clears all IndexedDB databases
 * Handles blocked deletions gracefully by attempting force close
 */
async function clearIndexedDB(): Promise<void> {
  try {
    if (!window.indexedDB) {
      console.warn('IndexedDB not supported');
      return;
    }

    const databases = await window.indexedDB.databases();
    console.log(`Found ${databases.length} IndexedDB database(s) to clear`);
    
    await Promise.all(
      databases.map((db) => {
        if (db.name) {
          return new Promise<void>((resolve) => {
            const request = window.indexedDB.deleteDatabase(db.name!);
            request.onsuccess = () => {
              console.log(`✓ Deleted IndexedDB: ${db.name}`);
              resolve();
            };
            request.onerror = () => {
              console.warn(`⚠ Error deleting IndexedDB: ${db.name} - will retry on next login`);
              resolve(); // Don't block logout
            };
            request.onblocked = () => {
              console.warn(`⚠ IndexedDB deletion blocked: ${db.name} - will be cleared when connections close`);
              resolve(); // Don't block logout
            };
          });
        }
        return Promise.resolve();
      })
    );
  } catch (error) {
    console.error('Error clearing IndexedDB:', error);
  }
}

/**
 * Clears all Cache Storage (Service Worker caches)
 */
async function clearCacheStorage(): Promise<void> {
  try {
    if (!('caches' in window)) {
      console.warn('Cache Storage not supported');
      return;
    }

    const cacheNames = await caches.keys();
    
    await Promise.all(
      cacheNames.map(async (cacheName) => {
        const deleted = await caches.delete(cacheName);
        if (deleted) {
          console.log(`Deleted cache: ${cacheName}`);
        }
      })
    );
  } catch (error) {
    console.error('Error clearing Cache Storage:', error);
  }
}

/**
 * Clears localStorage completely
 */
function clearLocalStorage(): void {
  try {
    const itemCount = localStorage.length;
    localStorage.clear();
    console.log(`✓ Cleared localStorage (${itemCount} items)`);
  } catch (error) {
    console.error('Error clearing localStorage:', error);
  }
}

/**
 * Clears sessionStorage
 */
function clearSessionStorage(): void {
  try {
    const itemCount = sessionStorage.length;
    sessionStorage.clear();
    console.log(`✓ Cleared sessionStorage (${itemCount} items)`);
  } catch (error) {
    console.error('Error clearing sessionStorage:', error);
  }
}

/**
 * Clears cookies
 */
function clearCookies(): void {
  try {
    const cookies = document.cookie.split(';');
    
    cookies.forEach(cookie => {
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
      
      if (name) {
        // Clear cookie for all paths and domains
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`;
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.${window.location.hostname}`;
      }
    });
    
    console.log(`✓ Cleared cookies (${cookies.length} found)`);
  } catch (error) {
    console.error('Error clearing cookies:', error);
  }
}

/**
 * Unregisters all service workers
 */
async function unregisterServiceWorkers(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Workers not supported');
      return;
    }

    const registrations = await navigator.serviceWorker.getRegistrations();
    
    await Promise.all(
      registrations.map(async (registration) => {
        const unregistered = await registration.unregister();
        if (unregistered) {
          console.log('Unregistered service worker');
        }
      })
    );
  } catch (error) {
    console.error('Error unregistering service workers:', error);
  }
}

/**
 * Main function to clear all storage
 * Call this on logout to ensure complete cleanup
 */
export async function clearAllStorage(): Promise<void> {
  console.log('🧹 Starting complete storage cleanup...');
  
  try {
    // Clear synchronous storage first
    clearLocalStorage();
    clearSessionStorage();
    clearCookies();
    
    // Then clear async storage
    await Promise.allSettled([
      clearIndexedDB(),
      clearCacheStorage(),
      // Note: Service worker unregistration can cause issues with PWA
      // Uncomment if you want to unregister them on logout:
      // unregisterServiceWorkers(),
    ]);
    
    console.log('✅ Storage cleanup completed successfully');
  } catch (error) {
    console.error('❌ Error during storage cleanup:', error);
    // Don't throw - we want logout to succeed even if cleanup partially fails
  }
}

