const CACHE_NAME = 'crm-v1.0.1'; // Updated version to clear old cache
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/tab.svg'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
 // console.log('[SW] Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
      //  console.log('[SW] Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        // Force activation of new service worker
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
//  console.log('[SW] Activate event');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
           // console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip Chrome extension requests
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // Skip Firebase and external API requests
  if (url.hostname.includes('firebaseapp.com') || 
      url.hostname.includes('googleapis.com') || 
      url.hostname.includes('gstatic.com')) {
    return;
  }

  // Handle JavaScript module requests with proper headers
  if (request.url.includes('/assets/') && 
      (request.url.endsWith('.js') || request.url.endsWith('.mjs'))) {
    event.respondWith(
      fetch(request).then(response => {
        // Clone the response to avoid consuming it
        const responseClone = response.clone();
        
        // Ensure proper MIME type for JavaScript modules
        const headers = new Headers(responseClone.headers);
        headers.set('Content-Type', 'application/javascript');
        
        return new Response(responseClone.body, {
          status: responseClone.status,
          statusText: responseClone.statusText,
          headers: headers
        });
      }).catch(() => {
        // If network fails, try cache
        return caches.match(request);
      })
    );
    return;
  }

  // Handle navigation requests (SPA routing)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match('/index.html');
      })
    );
    return;
  }

  // Handle other requests
  event.respondWith(
    caches.match(request).then((response) => {
      // Return cached version or fetch from network
      return response || fetch(request).then((fetchResponse) => {
        // Don't cache if response is not valid
        if (!fetchResponse || fetchResponse.status !== 200 || fetchResponse.type !== 'basic') {
          return fetchResponse;
        }

        // Clone the response for caching
        const responseToCache = fetchResponse.clone();
        
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });

        return fetchResponse;
      });
    })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

function doBackgroundSync() {
  // Handle background sync tasks
  //console.log('Background sync triggered');
  return Promise.resolve();
}

// Push notification handling
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New notification from CRM',
    icon: '/icon.svg',
    badge: '/tab.svg',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
          actions: [
        {
          action: 'explore',
          title: 'View',
          icon: '/icon.svg'
        },
        {
          action: 'close',
          title: 'Close',
          icon: '/icon.svg'
        }
      ]
  };

  event.waitUntil(
    self.registration.showNotification('CRM Notification', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/dashboard')
    );
  }
}); 
