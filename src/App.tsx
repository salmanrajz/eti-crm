/**
 * ===============================================================================
 * MAIN APPLICATION COMPONENT - CRM SYSTEM ROOT LAYOUT
 * ===============================================================================
 * 
 * This is the root component of the CRM application that sets up the core
 * application structure including routing, authentication, and global UI elements.
 * 
 * FEATURES:
 * - React Router setup with future compatibility flags
 * - Authentication provider wrapper for user state management
 * - Global toast notification system with responsive positioning
 * - PWA install prompt for mobile/desktop app installation
 * - Responsive toast styling based on screen size
 * 
 * ROUTER CONFIGURATION:
 * - Uses BrowserRouter for client-side routing
 * - Configured with React Router v7 future flags for smooth upgrades
 * - Includes startTransition and relativeSplatPath optimizations
 * 
 * TOAST SYSTEM:
 * - Responsive positioning (bottom-center on mobile, top-right on desktop)
 * - Custom styling with dark theme and rounded corners
 * - 4-second duration for optimal user experience
 * - Full-width styling on mobile devices
 * ===============================================================================
 */

import { BrowserRouter as Router, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './components/auth/AuthProvider';
import { AppRoutes } from './routes';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { SystemTimeCheck } from './components/SystemTimeCheck';
import { NetworkStatus } from './components/NetworkStatus';
// Removed custom PWAInstallPrompt to keep only the native small prompt
import { useEffect } from 'react';

// Configure future flags for React Router v7 compatibility and performance
const router = {
  future: {
    v7_startTransition: true,    // Enable concurrent features
    v7_relativeSplatPath: true   // Better path resolution
  }
};

/**
 * ===============================================================================
 * MAIN APP COMPONENT
 * ===============================================================================
 * 
 * The root component that renders the entire CRM application with:
 * - Router setup for navigation
 * - Authentication context provider
 * - Global notifications (toast) system
 * - PWA installation prompts
 * 
 * Layout structure:
 * Router -> AuthProvider -> Main Layout -> Routes + Components
 */
// Inner component to access location
function AppContent() {
  const location = useLocation();
  const isCustomerPortal = location.pathname.startsWith('/customer/');

  return (
    <>
      {/* Network status monitor - shows banner when offline */}
      {!isCustomerPortal && <NetworkStatus />}
      
      {/* System time check - blocks access if time is incorrect */}
      {!isCustomerPortal && <SystemTimeCheck />}
      
      {/* Main application container with responsive background */}
      <div className="min-h-screen bg-gray-50">
        {/* Application routes and navigation */}
        <AppRoutes />
        
        {/* Global toast notification system with responsive configuration */}
        <Toaster
          position={window.innerWidth < 640 ? 'bottom-center' : 'top-right'}
          toastOptions={{
            className: 'fixed left-0 right-0 bottom-4 w-full max-w-full rounded-xl shadow-lg text-center break-all whitespace-pre-line text-sm sm:text-base px-2 py-3 sm:px-6 sm:py-4 z-[9999] mx-0',
            style: {
              background: '#222',
              color: '#fff',
              fontSize: window.innerWidth < 640 ? '1rem' : '1.05rem',
              borderRadius: '1rem',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            },
            duration: 4000, // 4 second display duration
          }}
        />
        
        {/* Progressive Web App installation prompt - hidden on customer portal */}
        {!isCustomerPortal && <PWAInstallPrompt />}
      </div>
    </>
  );
}

function App() {
  // Security protections disabled for development
  // useEffect(() => {
  //   // All security measures commented out
  // }, []);

  return (
    <Router future={router.future}>
      {/* Authentication context provider for user state management */}
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;
