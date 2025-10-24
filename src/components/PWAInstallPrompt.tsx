/**
 * ===============================================================================
 * PWA INSTALL PROMPT COMPONENT - PROGRESSIVE WEB APP INSTALLATION
 * ===============================================================================
 * 
 * This component provides a progressive web app installation prompt that
 * appears when the browser detects that the app can be installed. It
 * handles the installation process and provides user-friendly feedback.
 * 
 * FEATURES:
 * 
 * 1. INSTALLATION DETECTION
 *    - Automatic detection of PWA installation capability
 *    - Browser compatibility checking and handling
 *    - Installation state tracking and management
 * 
 * 2. USER EXPERIENCE
 *    - Smooth animations and transitions
 *    - Clear installation instructions and feedback
 *    - Dismissible prompt with proper state management
 * 
 * 3. BROWSER INTEGRATION
 *    - Integration with browser beforeinstallprompt event
 *    - Proper event handling and cleanup
 *    - Installation completion detection and feedback
 * 
 * USAGE:
 * This component is integrated into the main app layout to provide
 * PWA installation capabilities for improved user experience.
 * ===============================================================================
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    // Listen for appinstalled event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    setDeferredPrompt(null);
  };

  if (isInstalled || !showPrompt) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:w-80"
      >
        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
            </div>
            
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                Install CRM App
              </h3>
              <p className="text-xs text-gray-600 mb-3">
                Add to home screen for a better experience with offline access
              </p>
              
              <div className="flex gap-2">
                <button
                  onClick={handleInstall}
                  className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-medium px-3 py-2 rounded-lg hover:from-indigo-600 hover:to-purple-700 transition-all duration-200 flex items-center justify-center gap-1"
                >
                  <Download className="w-3 h-3" />
                  Install
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-3 py-2 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
} 