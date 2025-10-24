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
  
  // Show install button or banner
  showInstallPrompt();
});

function showInstallPrompt() {
  // Create install banner
  const installBanner = document.createElement('div');
  installBanner.id = 'install-banner';
  installBanner.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: white;
      padding: 16px 24px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.2);
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 90vw;
    ">
      <div>
        <div style="font-weight: 600; margin-bottom: 4px;">Install CRM App</div>
        <div style="font-size: 14px; opacity: 0.9;">Add to home screen for better experience</div>
      </div>
      <button id="install-btn" style="
        background: rgba(255,255,255,0.2);
        border: 1px solid rgba(255,255,255,0.3);
        color: white;
        padding: 8px 16px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
      ">Install</button>
      <button id="dismiss-btn" style="
        background: none;
        border: none;
        color: rgba(255,255,255,0.7);
        cursor: pointer;
        padding: 4px;
        font-size: 18px;
      ">×</button>
    </div>
  `;
  
  document.body.appendChild(installBanner);
  
  // Install button handler
  document.getElementById('install-btn').addEventListener('click', () => {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
       // console.log('User accepted the install prompt');
      } else {
        //console.log('User dismissed the install prompt');
      }
      deferredPrompt = null;
      hideInstallBanner();
    });
  });
  
  // Dismiss button handler
  document.getElementById('dismiss-btn').addEventListener('click', hideInstallBanner);
}

function hideInstallBanner() {
  const banner = document.getElementById('install-banner');
  if (banner) {
    banner.remove();
  }
}

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
