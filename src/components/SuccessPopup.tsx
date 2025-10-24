/**
 * ===============================================================================
 * SUCCESS POPUP COMPONENT - SUCCESS NOTIFICATION MODAL
 * ===============================================================================
 * 
 * This component provides a reusable success notification modal with
 * automatic dismissal, smooth animations, and customizable messaging.
 * 
 * FEATURES:
 * 
 * 1. SUCCESS NOTIFICATIONS
 *    - Success icon and message display
 *    - Customizable title and message content
 *    - Professional styling with backdrop blur
 * 
 * 2. AUTOMATIC DISMISSAL
 *    - Configurable auto-close delay
 *    - Manual close button for immediate dismissal
 *    - Proper cleanup and state management
 * 
 * 3. ANIMATIONS AND UX
 *    - Smooth fade-in and zoom animations
 *    - Backdrop click to close functionality
 *    - Responsive design for various screen sizes
 * 
 * USAGE:
 * This component is used throughout the application to display
 * success messages after completing important actions.
 * ===============================================================================
 */

import React, { useEffect } from 'react';
import { CheckCircle, X } from 'lucide-react';

interface SuccessPopupProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  autoCloseDelay?: number;
}

export const SuccessPopup: React.FC<SuccessPopupProps> = ({
  isOpen,
  onClose,
  title,
  message,
  autoCloseDelay = 3000
}) => {
  useEffect(() => {
    if (isOpen && autoCloseDelay > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseDelay);

      return () => clearTimeout(timer);
    }
  }, [isOpen, autoCloseDelay, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />
      
      {/* Popup */}
      <div className="relative bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 transform transition-all duration-300 animate-in fade-in-0 zoom-in-95">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Success icon */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center animate-pulse">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
            {/* Ripple effect */}
            <div className="absolute inset-0 w-20 h-20 bg-green-200 rounded-full animate-ping opacity-20"></div>
          </div>
        </div>

        {/* Content */}
        <div className="text-center">
          <h3 className="text-2xl font-bold text-gray-900 mb-2">
            {title}
          </h3>
          {message && (
            <p className="text-gray-600 leading-relaxed">
              {message}
            </p>
          )}
        </div>

        {/* Progress bar */}
        {autoCloseDelay > 0 && (
          <div className="mt-6">
            <div className="w-full bg-gray-200 rounded-full h-1">
              <div 
                className="bg-gradient-to-r from-green-500 to-green-600 h-1 rounded-full progress-bar"
                style={{
                  animation: `progressShrink ${autoCloseDelay}ms linear forwards`
                }}
              />
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes progressShrink {
            from {
              width: 100%;
            }
            to {
              width: 0%;
            }
          }
        `
      }} />
    </div>
  );
};
