/**
 * ===============================================================================
 * NETWORK STATUS COMPONENT - INTERNET CONNECTIVITY MONITOR
 * ===============================================================================
 * 
 * This component monitors internet connectivity and displays a banner when
 * the user is offline. It uses the browser's navigator.onLine API and
 * listens to online/offline events.
 * 
 * FEATURES:
 * - Real-time internet connectivity monitoring
 * - Persistent banner when offline
 * - Automatic detection when connection is restored
 * - Non-intrusive UI that doesn't block user interaction
 * ===============================================================================
 */

import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine);

    // Listen for online/offline events
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        // Connection restored
        setWasOffline(false);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };

    // Add event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Cleanup
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [wasOffline]);

  // Don't show anything if online
  if (isOnline) {
    return null;
  }

  return (
    <AnimatePresence>
      {/* Backdrop overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999]"
      />
      
      {/* Centered content */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10000] w-full max-w-md mx-4"
      >
        <div className="bg-red-500/90 backdrop-blur-xl border border-red-400/50 shadow-2xl rounded-2xl p-6 sm:p-8">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-4 bg-red-600/30 rounded-full backdrop-blur-sm">
              <WifiOff className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl sm:text-2xl font-bold text-white">No Internet Connection</h3>
              <p className="text-sm sm:text-base text-red-50 leading-relaxed">
                Please check your network connection and try again.
              </p>
            </div>
            <div className="w-full pt-4 border-t border-red-400/30">
              <div className="text-left space-y-2 text-xs sm:text-sm text-red-100">
                <p className="font-semibold text-white mb-2">What you can do:</p>
                <ul className="space-y-1.5 list-disc list-inside">
                  <li>Check your Wi-Fi or mobile data connection</li>
                  <li>Try refreshing the page once connected</li>
                  <li>Restart your router if using Wi-Fi</li>
                  <li>Check if other websites are accessible</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

