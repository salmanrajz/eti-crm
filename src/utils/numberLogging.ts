/**
 * ===============================================================================
 * NUMBER LOGGING UTILITY - ACTIVITY TRACKING AND AUDIT TRAIL
 * ===============================================================================
 * 
 * This module provides comprehensive logging capabilities for number pool activities,
 * including reservations, claims, status changes, and other key actions. It creates
 * detailed audit trails for administrative oversight and debugging purposes.
 * 
 * FEATURES:
 * 
 * 1. COMPREHENSIVE ACTION LOGGING
 *    - Number creation, updates, and deletions
 *    - Reservation and claim tracking
 *    - Status change monitoring
 *    - Lead creation and modification logging
 * 
 * 2. AUDIT TRAIL CAPABILITIES
 *    - User attribution for all actions
 *    - Before/after data comparison
 *    - Timestamp and user role tracking
 *    - Detailed action descriptions
 * 
 * 3. DATA FILTERING AND QUERYING
 *    - Advanced filtering by user, action, date range
 *    - Search capabilities across log entries
 *    - Pagination support for large datasets
 *    - Real-time log monitoring
 * 
 * USAGE:
 * Import logging functions to track all number pool activities and maintain
 * comprehensive audit trails for administrative and debugging purposes.
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
  getDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';

// ===============================================================================
// TYPE DEFINITIONS AND INTERFACES
// ===============================================================================

/**
 * Available action types for number pool logging
 * Covers all major operations that can be performed on numbers
 */
export type NumberLogAction = 
  | 'created'                    // Number added to pool
  | 'updated'                    // General number updates
  | 'reserved'                   // Number reserved by agent
  | 'claimed'                    // Number claimed/struck by agent
  | 'opened'                     // Number released from reservation
  | 'released'                   // Number released from claim
  | 'deleted'                    // Number removed from pool
  | 'lead_created'               // Lead created with this number
  | 'status_changed'             // Status field modified
  | 'passcode_changed'           // Passcode field modified
  | 'group_changed'              // Group assignment changed
  | 'team_visibility_changed';   // Team visibility modified

/**
 * Number log entry interface defining the structure for logged activities
 */
export interface NumberLog {
  id: string;                    // Unique log entry identifier
  numberId: string;              // ID of the number in the pool
  number: string;                // The actual phone number
  action: NumberLogAction;       // Type of action performed
  userId: string;                // ID of user who performed the action
  userName: string;              // Name of user who performed the action
  userRole: string;              // Role of user who performed the action
  oldData?: any;                 // Previous state data (for updates)
  newData?: any;                 // New state data (for updates)
  details?: string;              // Additional details or notes
  timestamp: Timestamp;          // When the action occurred
  createdAt: Timestamp;          // When the log entry was created
}

/**
 * Filtering options for querying number logs
 */
export interface NumberLogFilters {
  action?: NumberLogAction;      // Filter by specific action type
  userId?: string;               // Filter by user who performed action
  numberId?: string;             // Filter by specific number
  startDate?: Date;              // Filter logs after this date
  endDate?: Date;                // Filter logs before this date
  searchTerm?: string;           // Search across log content
}

/**
 * Clean data object by removing undefined values
 */
const cleanDataForFirebase = (data: any): any => {
  if (!data || typeof data !== 'object') return data;
  
  const cleaned: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
};

// ===============================================================================
// NUMBER LOGGING FUNCTIONS
// ===============================================================================

/**
 * ===============================================================================
 * LOG NUMBER ACTION
 * ===============================================================================
 * 
 * Logs a specific action performed on a number in the number pool to create
 * a comprehensive audit trail. Includes user attribution, action details,
 * and before/after data for tracking changes.
 * 
 * @param numberId - Unique identifier of the number in the database
 * @param number - The actual phone number value
 * @param action - Type of action being logged
 * @param oldData - Previous state data (for update operations)
 * @param newData - New state data (for update operations)
 * @param details - Additional details or notes about the action
 */
export const logNumberAction = async (
  numberId: string,
  number: string,
  action: NumberLogAction,
  oldData?: any,
  newData?: any,
  details?: string
): Promise<void> => {
  try {
    const { user } = useAuthStore.getState();
    
    if (!user) {
      return;
    }

    const logData = {
      numberId,
      number,
      action,
      userId: user.id,
      userName: user.name || user.email || 'Unknown User',
      userRole: user.role,
      oldData: oldData ? cleanDataForFirebase(oldData) : null,
      newData: newData ? cleanDataForFirebase(newData) : null,
      details: details || null,
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, 'number_logs'), logData);
  } catch (error) {
     
  }
};

/**
 * Fetch number logs with optional filters
 */
export const fetchNumberLogs = async (
  filters: NumberLogFilters = {},
  limitCount: number = 100
): Promise<NumberLog[]> => {
  try {
    let q = query(
      collection(db, 'number_logs'),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    // Apply filters
    if (filters.action) {
      q = query(q, where('action', '==', filters.action));
    }
    
    if (filters.userId) {
      q = query(q, where('userId', '==', filters.userId));
    }
    
    if (filters.numberId) {
      q = query(q, where('numberId', '==', filters.numberId));
    }

    const snapshot = await getDocs(q);
    const logs: NumberLog[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      logs.push({
        id: doc.id,
        ...data
      } as NumberLog);
    });

    // Apply client-side filters for date range and search
    let filteredLogs = logs;

    if (filters.startDate || filters.endDate) {
      filteredLogs = filteredLogs.filter(log => {
        const logDate = log.timestamp.toDate();
        if (filters.startDate && logDate < filters.startDate) return false;
        if (filters.endDate && logDate > filters.endDate) return false;
        return true;
      });
    }

    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      filteredLogs = filteredLogs.filter(log => 
        log.number.toLowerCase().includes(searchLower) ||
        log.userName.toLowerCase().includes(searchLower) ||
        log.details?.toLowerCase().includes(searchLower) ||
        log.action.toLowerCase().includes(searchLower)
      );
    }

    return filteredLogs;
  } catch (error) {
    return [];
  }
};

/**
 * Get action color for UI display
 */
export const getActionColor = (action: NumberLogAction): string => {
  switch (action) {
    case 'created':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'updated':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'reserved':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'claimed':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'opened':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'released':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'deleted':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'lead_created':
      return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    case 'status_changed':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'passcode_changed':
      return 'bg-pink-100 text-pink-800 border-pink-200';
    case 'group_changed':
      return 'bg-cyan-100 text-cyan-800 border-cyan-200';
    case 'team_visibility_changed':
      return 'bg-violet-100 text-violet-800 border-violet-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

/**
 * Get action icon for UI display
 */
export const getActionIcon = (action: NumberLogAction): string => {
  switch (action) {
    case 'created':
      return 'Plus';
    case 'updated':
      return 'Edit';
    case 'reserved':
      return 'Clock';
    case 'claimed':
      return 'UserCheck';
    case 'opened':
      return 'Unlock';
    case 'released':
      return 'RotateCcw';
    case 'deleted':
      return 'Trash2';
    case 'lead_created':
      return 'UserPlus';
    case 'status_changed':
      return 'RefreshCw';
    case 'passcode_changed':
      return 'Key';
    case 'group_changed':
      return 'Users';
    case 'team_visibility_changed':
      return 'Eye';
    default:
      return 'Activity';
  }
};

/**
 * Format action text for display
 */
export const formatActionText = (action: NumberLogAction): string => {
  switch (action) {
    case 'created':
      return 'Created';
    case 'updated':
      return 'Updated';
    case 'reserved':
      return 'Reserved';
    case 'claimed':
      return 'Claimed';
    case 'opened':
      return 'Set Open';
    case 'released':
      return 'Released';
    case 'deleted':
      return 'Deleted';
    case 'lead_created':
      return 'Lead Created';
    case 'status_changed':
      return 'Status Changed';
    case 'passcode_changed':
      return 'Passcode Changed';
    case 'group_changed':
      return 'Group Changed';
    case 'team_visibility_changed':
      return 'Visibility Changed';
    default:
      return action;
  }
};

/**
 * Resolve user ID to user name
 */
export const resolveUserName = async (userId: string): Promise<string> => {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return userData.name || userData.email || 'Unknown User';
    }
    return 'Unknown User';
  } catch (error) {
    return 'Unknown User';
  }
};

/**
 * Resolve lead ID to lead number
 */
export const resolveLeadNumber = async (leadId: string): Promise<string> => {
  try {
    const leadDoc = await getDoc(doc(db, 'leads', leadId));
    if (leadDoc.exists()) {
      const leadData = leadDoc.data();
      return leadData.leadNumber || leadId;
    }
    return leadId;
  } catch (error) {
    return leadId;
  }
};

/**
 * Format timestamp for display
 */
export const formatTimestamp = (timestamp: any): string => {
  if (!timestamp) return 'Unknown';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
};

/**
 * Format data value for display
 */
export const formatDataValue = (value: any): string => {
  if (value === null || value === undefined) return 'empty';
  if (typeof value === 'object' && value.toDate) {
    // Firebase timestamp
    return formatTimestamp(value);
  }
  if (typeof value === 'object' && value.seconds) {
    // Firebase timestamp object
    return formatTimestamp(value);
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
};

/**
 * Format data value with user name resolution for display
 */
export const formatDataValueWithUserNames = async (value: any, key: string): Promise<string> => {
  if (value === null || value === undefined) return 'empty';
  
  // Exclude sensitive fields from being displayed in details
  if (key === 'numberTokens' || key === 'tokensUpdatedAt') {
    return null; // Return null to indicate this field should be filtered out
  }
  
  // Special handling: format claimQueue as a readable list
  if (key === 'claimQueue' && Array.isArray(value)) {
    if (value.length === 0) return 'empty';

    const parts: string[] = [];
    for (const entry of value) {
      const agentId = entry?.agentId;
      const claimedAt = entry?.claimedAt;
      let displayName = String(agentId || 'Unknown');

      if (agentId) {
        try {
          const resolved = await resolveUserName(agentId);
          if (resolved && resolved !== 'Unknown User') {
            displayName = resolved;
          }
        } catch (_) {}
      }

      const timeStr = claimedAt ? formatDataValue(claimedAt) : 'unknown time';
      parts.push(`${displayName} at ${timeStr}`);
    }

    return parts.join(', ');
  }
  
  // Resolve leadId to leadNumber
  if (key === 'leadId') {
    if (typeof value === 'string' && value) {
      try {
        const leadNumber = await resolveLeadNumber(value);
        return leadNumber !== value ? leadNumber : value;
      } catch {
        return value;
      }
    }
  }
  
  // Resolve common user ID fields to names
  if (key === 'reservedBy' || key === 'claimingAgentId' || key === 'userId' || key === 'originalAgentId' || key === 'respondedBy') {
    if (typeof value === 'string') {
      try {
        const userName = await resolveUserName(value);
        return userName !== 'Unknown User' ? userName : value;
      } catch {
        return value;
      }
    }
  }
  
  return formatDataValue(value);
};

/**
 * Process details string to replace agent IDs with names
 * This function finds patterns like "agent {agentId}" and replaces them with agent names
 */
export const processDetailsWithAgentNames = async (details: string | null | undefined): Promise<string> => {
  if (!details) return '';
  
  // Pattern to match "agent {agentId}" or "for agent {agentId}"
  const agentIdPattern = /(?:for\s+)?agent\s+([A-Za-z0-9]{20,})/gi;
  const matches = [...details.matchAll(agentIdPattern)];
  
  if (matches.length === 0) return details;
  
  let processedDetails = details;
  const replacements: Map<string, string> = new Map();
  
  // Resolve all agent IDs to names
  for (const match of matches) {
    const agentId = match[1];
    if (!replacements.has(agentId)) {
      const agentName = await resolveUserName(agentId);
      replacements.set(agentId, agentName);
    }
  }
  
  // Replace all occurrences
  for (const [agentId, agentName] of replacements.entries()) {
    const regex = new RegExp(`(?:for\\s+)?agent\\s+${agentId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi');
    processedDetails = processedDetails.replace(regex, (match) => {
      // Preserve "for " prefix if it exists
      return match.includes('for ') ? `for agent ${agentName}` : `agent ${agentName}`;
    });
  }
  
  return processedDetails;
};
