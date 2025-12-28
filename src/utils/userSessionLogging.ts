/**
 * ===============================================================================
 * USER SESSION LOGGING UTILITY - ACTIVITY TRACKING AND AUDIT TRAIL
 * ===============================================================================
 * 
 * This module provides comprehensive logging capabilities for user activities,
 * including login, logout, session management, and other key user operations.
 * It creates detailed audit trails for administrative oversight and security monitoring.
 * 
 * FEATURES:
 * 
 * 1. COMPREHENSIVE ACTION LOGGING
 *    - Login and logout tracking
 *    - Session creation and termination
 *    - User activity monitoring
 *    - Page navigation tracking
 *    - Action logging for key operations
 * 
 * 2. AUDIT TRAIL CAPABILITIES
 *    - User attribution for all actions
 *    - IP address and device information
 *    - Timestamp and session duration tracking
 *    - Detailed action descriptions
 * 
 * 3. DATA FILTERING AND QUERYING
 *    - Advanced filtering by user, action, date range
 *    - Search capabilities across log entries
 *    - Pagination support for large datasets
 *    - Real-time log monitoring
 * 
 * USAGE:
 * Import logging functions to track all user activities and maintain
 * comprehensive audit trails for administrative and security purposes.
 * ===============================================================================
 */

import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  limit, 
  where, 
  getDocs,
  Timestamp,
  doc,
  getDoc,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../lib/firebase';

// ===============================================================================
// TYPE DEFINITIONS AND INTERFACES
// ===============================================================================

/**
 * Available action types for user session logging
 * Covers all major user operations and activities
 */
export type UserSessionAction = 
  | 'login'                      // User logged in
  | 'logout'                     // User logged out
  | 'session_start'              // Session started
  | 'session_end'                // Session ended
  | 'page_view'                  // Page/view accessed
  | 'action_performed'           // General action performed
  | 'data_accessed'             // Data accessed
  | 'data_modified'             // Data modified
  | 'export_performed'           // Data export performed
  | 'search_performed'           // Search performed
  | 'filter_applied'             // Filter applied
  | 'settings_changed'           // Settings modified
  | 'password_changed'           // Password changed
  | 'profile_updated'            // Profile updated
  | 'permission_denied'          // Permission denied attempt
  | 'error_occurred';            // Error occurred

/**
 * User session log entry interface defining the structure for logged activities
 */
export interface UserSessionLog {
  id: string;                    // Unique log entry identifier
  userId: string;                // ID of user
  userName: string;              // Name of user
  userRole: string;              // Role of user
  userEmail?: string;            // Email of user
  action: UserSessionAction;     // Type of action performed
  details?: string;              // Additional details or notes
  page?: string;                 // Page/route accessed
  ipAddress?: string;            // IP address (if available)
  userAgent?: string;            // User agent/browser info
  deviceInfo?: string;           // Device information
  sessionId?: string;            // Session identifier
  duration?: number;             // Session duration in seconds
  metadata?: any;                // Additional metadata
  timestamp: Timestamp;         // When the action occurred
  createdAt: Timestamp;         // When the log entry was created
}

/**
 * Filters for querying user session logs
 */
export interface UserSessionLogFilters {
  userId?: string;               // Filter by specific user
  userRole?: string;              // Filter by user role
  action?: UserSessionAction[];  // Filter by action types
  startDate?: Date;              // Start date for date range
  endDate?: Date;                // End date for date range
  searchTerm?: string;           // Search term for details/page
}

/**
 * Helper function to clean data before storing in Firebase
 * Removes undefined values to keep Firestore documents clean
 */
const cleanDataForFirebase = (data: any): any => {
  const cleaned: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
};

// ===============================================================================
// USER SESSION LOGGING FUNCTIONS
// ===============================================================================

/**
 * ===============================================================================
 * LOG USER SESSION ACTION
 * ===============================================================================
 * 
 * Logs a specific action performed by a user to create a comprehensive audit trail.
 * Includes user attribution, action details, and metadata for tracking activities.
 * 
 * @param userId - Unique identifier of the user
 * @param userName - Name of the user
 * @param userRole - Role of the user
 * @param action - Type of action being logged
 * @param details - Additional details or notes about the action
 * @param options - Optional metadata (page, IP, userAgent, deviceInfo, sessionId, duration, metadata)
 */
export const logUserSessionAction = async (
  userId: string,
  userName: string,
  userRole: string,
  action: UserSessionAction,
  details?: string,
  options?: {
    userEmail?: string;
    page?: string;
    ipAddress?: string;
    userAgent?: string;
    deviceInfo?: string;
    sessionId?: string;
    duration?: number;
    metadata?: any;
  }
): Promise<void> => {
  try {
    const logData = cleanDataForFirebase({
      userId,
      userName,
      userRole,
      userEmail: options?.userEmail,
      action,
      details,
      page: options?.page,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
      deviceInfo: options?.deviceInfo,
      sessionId: options?.sessionId,
      duration: options?.duration,
      metadata: options?.metadata,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp()
    });

    await addDoc(collection(db, 'user_session_logs'), logData);
  } catch (error) {
    console.error('Error logging user session action:', error);
    // Don't throw - logging failures shouldn't break the app
  }
};

/**
 * ===============================================================================
 * FETCH USER SESSION LOGS
 * ===============================================================================
 * 
 * Retrieves user session logs with optional filtering and pagination.
 * 
 * @param filters - Filtering options for logs
 * @param limitCount - Maximum number of logs to retrieve (default: 100)
 * @returns Array of user session log entries
 */
export const fetchUserSessionLogs = async (
  filters: UserSessionLogFilters = {},
  limitCount: number = 100
): Promise<UserSessionLog[]> => {
  try {
    let q = query(collection(db, 'user_session_logs'), orderBy('timestamp', 'desc'));

    // Apply filters
    if (filters.userId) {
      q = query(q, where('userId', '==', filters.userId));
    }
    if (filters.userRole) {
      q = query(q, where('userRole', '==', filters.userRole));
    }
    if (filters.action && filters.action.length > 0) {
      if (filters.action.length === 1) {
        q = query(q, where('action', '==', filters.action[0]));
      } else {
        // Firestore 'in' query supports up to 10 items
        const actionChunks = [];
        for (let i = 0; i < filters.action.length; i += 10) {
          actionChunks.push(filters.action.slice(i, i + 10));
        }
        q = query(q, where('action', 'in', actionChunks[0]));
      }
    }
    if (filters.startDate) {
      q = query(q, where('timestamp', '>=', Timestamp.fromDate(filters.startDate)));
    }
    if (filters.endDate) {
      q = query(q, where('timestamp', '<=', Timestamp.fromDate(filters.endDate)));
    }

    q = query(q, limit(limitCount));

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as UserSessionLog[];
  } catch (error) {
    console.error('Error fetching user session logs:', error);
    return [];
  }
};

/**
 * ===============================================================================
 * UI HELPER FUNCTIONS
 * ===============================================================================
 */

/**
 * Get color class for action type
 */
export const getUserSessionActionColor = (action: UserSessionAction): string => {
  switch (action) {
    case 'login':
    case 'session_start':
      return 'bg-green-100 text-green-800';
    case 'logout':
    case 'session_end':
      return 'bg-red-100 text-red-800';
    case 'page_view':
      return 'bg-blue-100 text-blue-800';
    case 'action_performed':
      return 'bg-purple-100 text-purple-800';
    case 'data_accessed':
      return 'bg-cyan-100 text-cyan-800';
    case 'data_modified':
      return 'bg-orange-100 text-orange-800';
    case 'export_performed':
      return 'bg-indigo-100 text-indigo-800';
    case 'search_performed':
    case 'filter_applied':
      return 'bg-yellow-100 text-yellow-800';
    case 'settings_changed':
    case 'profile_updated':
    case 'password_changed':
      return 'bg-pink-100 text-pink-800';
    case 'permission_denied':
      return 'bg-red-100 text-red-800';
    case 'error_occurred':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

/**
 * Get icon for action type
 */
export const getUserSessionActionIcon = (action: UserSessionAction): string => {
  switch (action) {
    case 'login':
    case 'session_start':
      return '🔓';
    case 'logout':
    case 'session_end':
      return '🔒';
    case 'page_view':
      return '👁️';
    case 'action_performed':
      return '⚡';
    case 'data_accessed':
      return '📖';
    case 'data_modified':
      return '✏️';
    case 'export_performed':
      return '📥';
    case 'search_performed':
      return '🔍';
    case 'filter_applied':
      return '🔎';
    case 'settings_changed':
      return '⚙️';
    case 'password_changed':
      return '🔑';
    case 'profile_updated':
      return '👤';
    case 'permission_denied':
      return '🚫';
    case 'error_occurred':
      return '❌';
    default:
      return '📝';
  }
};

/**
 * Format action text for display
 */
export const formatUserSessionActionText = (action: UserSessionAction): string => {
  return action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
};

/**
 * Format timestamp for display
 */
export const formatUserSessionTimestamp = (timestamp: Timestamp | Date | null | undefined): string => {
  if (!timestamp) return 'N/A';
  
  let date: Date;
  if (timestamp instanceof Timestamp) {
    date = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    return 'N/A';
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(date);
};

/**
 * Get user agent info (simplified)
 */
export const getUserAgentInfo = (): string => {
  if (typeof navigator === 'undefined') return 'Unknown';
  
  const ua = navigator.userAgent;
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  return 'Unknown';
};

/**
 * Get device info (simplified)
 */
export const getDeviceInfo = (): string => {
  if (typeof navigator === 'undefined') return 'Unknown';
  
  const ua = navigator.userAgent;
  if (/Mobile|Android|iPhone|iPad/.test(ua)) {
    return 'Mobile';
  }
  return 'Desktop';
};

