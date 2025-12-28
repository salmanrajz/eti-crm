/**
 * ===============================================================================
 * LEAD LOGGING UTILITY - ACTIVITY TRACKING AND AUDIT TRAIL
 * ===============================================================================
 * 
 * This module provides comprehensive logging capabilities for lead activities,
 * including creation, updates, status changes, verification actions, and other
 * key operations. It creates detailed audit trails for administrative oversight
 * and debugging purposes.
 * 
 * FEATURES:
 * 
 * 1. COMPREHENSIVE ACTION LOGGING
 *    - Lead creation, updates, and deletions
 *    - Status change tracking
 *    - Verification and rejection actions
 *    - Edit change monitoring
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
 * Import logging functions to track all lead activities and maintain
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
 * Available action types for lead logging
 * Covers all major operations that can be performed on leads
 */
export type LeadLogAction = 
  | 'created'                    // Lead created
  | 'updated'                    // General lead updates
  | 'status_changed'             // Status field modified
  | 'verified'                   // Lead verified by verifier
  | 'rejected'                   // Lead rejected by verifier
  | 'non_verified'               // Lead marked as non-verified
  | 'activated'                   // Lead activated
  | 'assigned'                    // Lead assigned to coordinator
  | 'reassigned'                 // Lead reassigned
  | 'resubmitted'                // Lead resubmitted by agent
  | 'split'                      // Lead split into multiple leads
  | 'deleted'                    // Lead deleted
  | 'plan_added'                 // Plan added to lead
  | 'plan_removed'               // Plan removed from lead
  | 'plan_updated'               // Plan updated
  | 'customer_info_changed'      // Customer information changed
  | 'notes_added'                // Notes added
  | 'media_uploaded'             // Media uploaded
  | 'transferred';               // Lead transferred to another agent

/**
 * Lead log entry interface defining the structure for logged activities
 */
export interface LeadLog {
  id: string;                    // Unique log entry identifier
  leadId: string;               // ID of the lead
  leadNumber: string;            // The lead number
  action: LeadLogAction;        // Type of action performed
  userId: string;               // ID of user who performed the action
  userName: string;             // Name of user who performed the action
  userRole: string;             // Role of user who performed the action
  oldData?: any;                 // Previous state data (for updates)
  newData?: any;                 // New state data (for updates)
  details?: string;             // Additional details or notes
  timestamp: Timestamp;          // When the action occurred
  createdAt: Timestamp;         // When the log entry was created
}

/**
 * Filtering options for querying lead logs
 */
export interface LeadLogFilters {
  action?: LeadLogAction;       // Filter by specific action type
  userId?: string;               // Filter by user who performed action
  leadId?: string;              // Filter by specific lead
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
// LEAD LOGGING FUNCTIONS
// ===============================================================================

/**
 * ===============================================================================
 * LOG LEAD ACTION
 * ===============================================================================
 * 
 * Logs a specific action performed on a lead to create a comprehensive audit trail.
 * Includes user attribution, action details, and before/after data for tracking changes.
 * 
 * @param leadId - Unique identifier of the lead in the database
 * @param leadNumber - The lead number
 * @param action - Type of action being logged
 * @param oldData - Previous state data (for update operations)
 * @param newData - New state data (for update operations)
 * @param details - Additional details or notes about the action
 */
export const logLeadAction = async (
  leadId: string,
  leadNumber: string,
  action: LeadLogAction,
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
      leadId,
      leadNumber,
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

    await addDoc(collection(db, 'lead_logs'), logData);
  } catch (error) {
    console.error('Error logging lead action:', error);
  }
};

/**
 * Fetch lead logs with optional filters
 */
export const fetchLeadLogs = async (
  filters: LeadLogFilters = {},
  limitCount: number = 100
): Promise<LeadLog[]> => {
  try {
    let q = query(
      collection(db, 'lead_logs'),
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
    
    if (filters.leadId) {
      q = query(q, where('leadId', '==', filters.leadId));
    }

    const snapshot = await getDocs(q);
    const logs: LeadLog[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      logs.push({
        id: doc.id,
        ...data
      } as LeadLog);
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
        log.leadNumber.toLowerCase().includes(searchLower) ||
        log.userName.toLowerCase().includes(searchLower) ||
        log.details?.toLowerCase().includes(searchLower) ||
        log.action.toLowerCase().includes(searchLower)
      );
    }

    return filteredLogs;
  } catch (error) {
    console.error('Error fetching lead logs:', error);
    return [];
  }
};

/**
 * Get action color for UI display
 */
export const getLeadActionColor = (action: LeadLogAction): string => {
  switch (action) {
    case 'created':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'updated':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'status_changed':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'verified':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'rejected':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'non_verified':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'activated':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'assigned':
      return 'bg-indigo-100 text-indigo-800 border-indigo-200';
    case 'reassigned':
      return 'bg-cyan-100 text-cyan-800 border-cyan-200';
    case 'resubmitted':
      return 'bg-pink-100 text-pink-800 border-pink-200';
    case 'split':
      return 'bg-violet-100 text-violet-800 border-violet-200';
    case 'deleted':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'plan_added':
      return 'bg-teal-100 text-teal-800 border-teal-200';
    case 'plan_removed':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    case 'plan_updated':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'customer_info_changed':
      return 'bg-sky-100 text-sky-800 border-sky-200';
    case 'notes_added':
      return 'bg-lime-100 text-lime-800 border-lime-200';
    case 'media_uploaded':
      return 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200';
    case 'transferred':
      return 'bg-slate-100 text-slate-800 border-slate-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

/**
 * Get action icon for UI display
 */
export const getLeadActionIcon = (action: LeadLogAction): string => {
  switch (action) {
    case 'created':
      return 'Plus';
    case 'updated':
      return 'Edit';
    case 'status_changed':
      return 'RefreshCw';
    case 'verified':
      return 'CheckCircle';
    case 'rejected':
      return 'XCircle';
    case 'non_verified':
      return 'AlertCircle';
    case 'activated':
      return 'Zap';
    case 'assigned':
      return 'UserCheck';
    case 'reassigned':
      return 'UserCog';
    case 'resubmitted':
      return 'RotateCcw';
    case 'split':
      return 'Scissors';
    case 'deleted':
      return 'Trash2';
    case 'plan_added':
      return 'PlusCircle';
    case 'plan_removed':
      return 'MinusCircle';
    case 'plan_updated':
      return 'Edit2';
    case 'customer_info_changed':
      return 'User';
    case 'notes_added':
      return 'FileText';
    case 'media_uploaded':
      return 'Image';
    case 'transferred':
      return 'ArrowRight';
    default:
      return 'Activity';
  }
};

/**
 * Format action text for display
 */
export const formatLeadActionText = (action: LeadLogAction): string => {
  switch (action) {
    case 'created':
      return 'Created';
    case 'updated':
      return 'Updated';
    case 'status_changed':
      return 'Status Changed';
    case 'verified':
      return 'Verified';
    case 'rejected':
      return 'Rejected';
    case 'non_verified':
      return 'Non Verified';
    case 'activated':
      return 'Activated';
    case 'assigned':
      return 'Assigned';
    case 'reassigned':
      return 'Reassigned';
    case 'resubmitted':
      return 'Resubmitted';
    case 'split':
      return 'Split';
    case 'deleted':
      return 'Deleted';
    case 'plan_added':
      return 'Plan Added';
    case 'plan_removed':
      return 'Plan Removed';
    case 'plan_updated':
      return 'Plan Updated';
    case 'customer_info_changed':
      return 'Customer Info Changed';
    case 'notes_added':
      return 'Notes Added';
    case 'media_uploaded':
      return 'Media Uploaded';
    case 'transferred':
      return 'Transferred';
    default:
      return action;
  }
};

/**
 * Resolve user ID to user name
 */
export const resolveLeadUserName = async (userId: string): Promise<string> => {
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
 * Format timestamp for display
 */
export const formatLeadTimestamp = (timestamp: any): string => {
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
export const formatLeadDataValue = (value: any): string => {
  if (value === null || value === undefined) return 'empty';
  if (typeof value === 'object' && value.toDate) {
    // Firebase timestamp
    return formatLeadTimestamp(value);
  }
  if (typeof value === 'object' && value.seconds) {
    // Firebase timestamp object
    return formatLeadTimestamp(value);
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
};

/**
 * Format data value with user name resolution for display
 */
export const formatLeadDataValueWithUserNames = async (value: any, key: string): Promise<string> => {
  if (value === null || value === undefined) return 'empty';
  
  // Resolve common user ID fields to names
  if (key === 'agentId' || key === 'verifierId' || key === 'coordinatorId' || key === 'managerId' || key === 'userId' || key === 'updatedBy' || key === 'createdBy') {
    if (typeof value === 'string') {
      try {
        const userName = await resolveLeadUserName(value);
        return userName !== 'Unknown User' ? userName : value;
      } catch {
        return value;
      }
    }
  }
  
  // Handle arrays of user IDs
  if (key === 'sharedWith' && Array.isArray(value)) {
    if (value.length === 0) return 'empty';
    const names = await Promise.all(value.map(async (id: string) => {
      try {
        return await resolveLeadUserName(id);
      } catch {
        return id;
      }
    }));
    return names.join(', ');
  }
  
  return formatLeadDataValue(value);
};

/**
 * Process details string to replace user IDs with names
 */
export const processLeadDetailsWithUserNames = async (details: string | null | undefined): Promise<string> => {
  if (!details) return '';
  
  // Pattern to match user IDs (Firestore IDs are typically 28 characters)
  const userIdPattern = /([A-Za-z0-9]{20,})/g;
  const matches = [...details.matchAll(userIdPattern)];
  
  if (matches.length === 0) return details;
  
  let processedDetails = details;
  const replacements: Map<string, string> = new Map();
  
  // Resolve all user IDs to names
  for (const match of matches) {
    const userId = match[1];
    if (!replacements.has(userId)) {
      const userName = await resolveLeadUserName(userId);
      if (userName !== 'Unknown User') {
        replacements.set(userId, userName);
      }
    }
  }
  
  // Replace all occurrences
  for (const [userId, userName] of replacements.entries()) {
    const regex = new RegExp(userId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    processedDetails = processedDetails.replace(regex, userName);
  }
  
  return processedDetails;
};

