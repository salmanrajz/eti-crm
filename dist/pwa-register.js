// PWA Registration Script
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
       // console.log('SW registered: ', registration);
        
        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New content is available, show update notification
              showUpdateNotification();
            }
          });
        });
      })
      .catch((registrationError) => {
      //  console.log('SW registration failed: ', registrationError);
      });
  });
}

// Show update notification
function showUpdateNotification() {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('CRM Update Available', {
      body: 'A new version is available. Refresh to update.',
      icon: '/icon.svg',
      badge: '/tab.svg',
      tag: 'update-notification'
    });
  }
}

// Request notification permission
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
       // console.log('Notification permission granted');
      }
    });
  }
}

// Install prompt handling
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67 and earlier from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later
  deferredPrompt = e;
  
  // Custom UI removed; prompt can be triggered elsewhere if needed
});


// Initialize PWA features
document.addEventListener('DOMContentLoaded', () => {
  requestNotificationPermission();
  
  // Add PWA meta tags dynamically
  const metaTags = [
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
    { name: 'apple-mobile-web-app-title', content: 'CRM' },
    { name: 'mobile-web-app-capable', content: 'yes' },
    { name: 'msapplication-TileColor', content: '#6366f1' },
    { name: 'msapplication-config', content: '/browserconfig.xml' }
  ];
  
  metaTags.forEach(tag => {
    const meta = document.createElement('meta');
    meta.name = tag.name;
    meta.content = tag.content;
    document.head.appendChild(meta);
  });
  
  // Add Apple touch icons
  const appleIcons = [
    { sizes: '180x180', href: '/apple-touch-icon.png' },
    { sizes: '152x152', href: '/apple-touch-icon-152x152.png' },
    { sizes: '144x144', href: '/apple-touch-icon-144x144.png' },
    { sizes: '120x120', href: '/apple-touch-icon-120x120.png' },
    { sizes: '114x114', href: '/apple-touch-icon-114x114.png' },
    { sizes: '76x76', href: '/apple-touch-icon-76x76.png' },
    { sizes: '72x72', href: '/apple-touch-icon-72x72.png' },
    { sizes: '60x60', href: '/apple-touch-icon-60x60.png' },
    { sizes: '57x57', href: '/apple-touch-icon-57x57.png' }
  ];
  
  appleIcons.forEach(icon => {
    const link = document.createElement('link');
    link.rel = 'apple-touch-icon';
    link.sizes = icon.sizes;
    link.href = icon.href;
    document.head.appendChild(link);
  });
}); 
