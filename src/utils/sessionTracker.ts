/**
 * ===============================================================================
 * SESSION TRACKING UTILITY - AUTOMATIC SESSION MANAGEMENT
 * ===============================================================================
 * 
 * This module provides automatic session tracking for users, even when they
 * don't explicitly log out. It handles browser close, tab close, and navigation
 * away events to properly log session end and calculate session duration.
 * 
 * FEATURES:
 * - Automatic session end detection on browser/tab close
 * - Session duration calculation
 * - Handles unclosed sessions on next login
 * - Cross-browser compatibility
 * ===============================================================================
 */

import { logUserSessionAction, getUserAgentInfo, getDeviceInfo } from './userSessionLogging';
import { useAuthStore } from '../store/authStore';

/**
 * Initialize session tracking for the current user
 * Sets up event listeners to detect when user leaves
 */
export function initializeSessionTracking() {
  if (typeof window === 'undefined') return;

  const user = useAuthStore.getState().user;
  if (!user) return;

  const sessionId = sessionStorage.getItem('currentSessionId');
  const sessionStartTime = sessionStorage.getItem('sessionStartTime');

  if (!sessionId || !sessionStartTime) {
    // No active session to track
    return;
  }

  /**
   * Calculate and log session end
   */
  const logSessionEnd = async (reason: string = 'User left') => {
    try {
      const currentUser = useAuthStore.getState().user;
      if (!currentUser) return;

      const currentSessionId = sessionStorage.getItem('currentSessionId');
      const startTime = sessionStorage.getItem('sessionStartTime');
      
      if (!currentSessionId || !startTime) return;

      // Check if we already logged this session end
      const loggedSessionId = sessionStorage.getItem('loggedSessionEnd');
      if (loggedSessionId === currentSessionId) {
        return; // Already logged
      }

      const duration = Math.floor((Date.now() - parseInt(startTime)) / 1000);

      await logUserSessionAction(
        currentUser.id,
        currentUser.name || currentUser.email || 'Unknown',
        currentUser.role,
        'session_end',
        reason,
        {
          userEmail: currentUser.email,
          page: window.location.pathname,
          userAgent: getUserAgentInfo(),
          deviceInfo: getDeviceInfo(),
          sessionId: currentSessionId,
          duration: duration
        });

      // Mark this session as logged
      sessionStorage.setItem('loggedSessionEnd', currentSessionId);
    } catch (error) {
      // Don't block navigation if logging fails
      console.warn('Failed to log session end:', error);
    }
  };

  /**
   * Handle page hide (more reliable than beforeunload in some browsers)
   * This fires when the page is being unloaded, even if the browser is closed
   * Note: We can't reliably use async operations here, so we'll mark the session
   * as needing to be logged and handle it on next login
   */
  const handlePageHide = (e: PageTransitionEvent) => {
    if (e.persisted) {
      // Page is being cached (back/forward navigation)
      // Don't log session end
      return;
    }
    // Page is being unloaded - mark session as needing to be logged
    // We'll check and log it on next login via checkAndLogUnclosedSession
    const currentSessionId = sessionStorage.getItem('currentSessionId');
    const startTime = sessionStorage.getItem('sessionStartTime');
    
    if (currentSessionId && startTime) {
      // Store in localStorage so we can check on next login
      localStorage.setItem('previousSessionId', currentSessionId);
      localStorage.setItem('previousSessionStartTime', startTime);
      // Don't mark as logged yet - will be logged on next login
    }
  };

  // Add event listener for page hide (most reliable for detecting browser/tab close)
  window.addEventListener('pagehide', handlePageHide);

  // Return cleanup function
  return () => {
    window.removeEventListener('pagehide', handlePageHide);
  };
}

/**
 * Check for and log any unclosed sessions from previous login
 * This is called when a user logs in to handle cases where they didn't log out
 */
export async function checkAndLogUnclosedSession() {
  if (typeof window === 'undefined') return;

  const user = useAuthStore.getState().user;
  if (!user) return;

  // Check if there's an unclosed session from before
  const previousSessionId = localStorage.getItem('previousSessionId');
  const previousSessionStartTime = localStorage.getItem('previousSessionStartTime');
  const loggedSessionEnd = localStorage.getItem('loggedSessionEnd');
  const currentSessionId = sessionStorage.getItem('currentSessionId');

  // Only log if:
  // 1. There's a previous session
  // 2. It hasn't been logged yet
  // 3. It's different from the current session (user logged in again)
  if (previousSessionId && 
      previousSessionStartTime && 
      loggedSessionEnd !== previousSessionId &&
      previousSessionId !== currentSessionId) {
    // There's an unclosed session - log it as ended
    try {
      // Calculate duration from session start to now (when they logged in again)
      // This gives us the approximate session duration
      const duration = Math.floor((Date.now() - parseInt(previousSessionStartTime)) / 1000);

      await logUserSessionAction(
        user.id,
        user.name || user.email || 'Unknown',
        user.role,
        'session_end',
        'Session ended (user did not log out, likely closed browser/tab)',
        {
          userEmail: user.email,
          page: window.location.pathname,
          userAgent: getUserAgentInfo(),
          deviceInfo: getDeviceInfo(),
          sessionId: previousSessionId,
          duration: duration
        }
      );

      // Mark as logged
      localStorage.setItem('loggedSessionEnd', previousSessionId);
    } catch (error) {
      console.warn('Failed to log unclosed session:', error);
    }
  }

  // Store current session info in localStorage (persists across page reloads)
  // This will be used to detect unclosed sessions on next login
  if (currentSessionId) {
    const currentSessionStartTime = sessionStorage.getItem('sessionStartTime');
    if (currentSessionStartTime) {
      localStorage.setItem('previousSessionId', currentSessionId);
      localStorage.setItem('previousSessionStartTime', currentSessionStartTime);
    }
  }
}

/**
 * Clean up session tracking
 */
export function cleanupSessionTracking() {
  // Cleanup is handled by the returned function from initializeSessionTracking
}

