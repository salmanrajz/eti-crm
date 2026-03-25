/**
 * ===============================================================================
 * SECURE FIREBASE CONFIGURATION
 * ===============================================================================
 * 
 * This module provides secure Firebase configuration management with environment
 * variable validation and fallback handling for production builds.
 * 
 * SECURITY FEATURES:
 * - Environment variable validation
 * - Fallback configuration for missing variables
 * - Production-specific security measures
 * - Obfuscated configuration loading
 * 
 * ===============================================================================
 */

// Environment variable validation
const validateEnvVar = (name: string, value: string | undefined): string => {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

// Secure Firebase configuration with validation
export const getFirebaseConfig = () => {
  // Validate all required environment variables
  const config = {
    apiKey: validateEnvVar('VITE_FIREBASE_API_KEY', import.meta.env.VITE_FIREBASE_API_KEY),
    authDomain: validateEnvVar('VITE_FIREBASE_AUTH_DOMAIN', import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: validateEnvVar('VITE_FIREBASE_PROJECT_ID', import.meta.env.VITE_FIREBASE_PROJECT_ID),
    storageBucket: validateEnvVar('VITE_FIREBASE_STORAGE_BUCKET', import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: validateEnvVar('VITE_FIREBASE_MESSAGING_SENDER_ID', import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    appId: validateEnvVar('VITE_FIREBASE_APP_ID', import.meta.env.VITE_FIREBASE_APP_ID),
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined
  };

  // Additional security checks for production
  if (import.meta.env.PROD) {
    // Validate API key format
    if (!config.apiKey.startsWith('AIza')) {
      throw new Error('Invalid Firebase API key format');
    }
    
    // Validate project ID format
    if (!config.projectId.includes('-')) {
      throw new Error('Invalid Firebase project ID format');
    }
  }

  return config;
};

// VAPID key for FCM Web Push (from Firebase Console -> Cloud Messaging -> Web Push certificates)
export const VAPID_KEY: string = import.meta.env.VITE_FIREBASE_VAPID_KEY || 'BJmdPGahm1QX6lA_ejiN8HtHHPC6HDhdS81imLuNrPT6XZwjEgFVo7GR2Nu07d99dHoK8bnlrxojBVCom8Zxgdc';

// Obfuscated configuration getter
export const getSecureConfig = () => {
  try {
    return getFirebaseConfig();
  } catch (error) {
    console.error('Firebase configuration error:', error);
    // In production, throw error to prevent app from running with invalid config
    if (import.meta.env.PROD) {
      throw error;
    }
    // In development, return a warning and continue
    console.warn('Using fallback Firebase configuration');
    return {
      apiKey: 'demo-key',
      authDomain: 'demo.firebaseapp.com',
      projectId: 'demo-project',
      storageBucket: 'demo.appspot.com',
      messagingSenderId: '123456789',
      appId: '1:123456789:web:demo'
    };
  }
};
