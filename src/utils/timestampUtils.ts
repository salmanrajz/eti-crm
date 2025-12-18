import { format } from 'date-fns';

/**
 * Universal timestamp normalization utility
 * Handles all timestamp formats consistently across the application
 */

/**
 * Normalizes any timestamp value to a Date object
 * Handles: ISO strings, Firestore Timestamps, Date objects, string dates
 * 
 * @param value - Timestamp value in any format
 * @returns Date object or null if invalid
 */
export function normalizeTimestamp(value: any): Date | null {
  if (!value) return null;
  
  // Already a Date object
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  
  // Firestore Timestamp object
  if (typeof value.toDate === 'function') {
    return value.toDate();
  }
  
  // Firestore Timestamp with toMillis
  if (typeof value.toMillis === 'function') {
    return new Date(value.toMillis());
  }
  
  // String values
  if (typeof value === 'string') {
    // ISO string with timezone (e.g., "2025-12-16T14:33:06Z" or "2025-12-16T14:33:06+00:00")
    // The Cloud Function sends ISO strings with 'Z' suffix (UTC)
    if (value.includes('T') && (value.includes('Z') || value.match(/[+-]\d{2}:\d{2}$/))) {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    
    // API format: "2025-12-16 14:33:06" 
    // IMPORTANT: The Cloud Function now sends ISO strings, but if we receive raw format,
    // it should be treated as UTC (since API says timezone: "UTC")
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
      // Parse as UTC by adding 'Z' suffix
      const dateStr = value.replace(' ', 'T') + 'Z';
      const parsed = new Date(dateStr);
      return isNaN(parsed.getTime()) ? null : parsed;
    }
    
    // Generic string date - try parsing as-is
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  
  // Number (milliseconds since epoch)
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  
  return null;
}

/**
 * Formats a timestamp for display
 * 
 * @param date - Date object or null (should be in UTC)
 * @param formatStr - Optional format string (default: 'MMM d, yyyy HH:mm')
 * @returns Formatted string or empty string if date is null
 * 
 * IMPORTANT: Shows API time directly without timezone conversion
 * The date should already be in UTC from the API
 * Formats using UTC components directly to avoid timezone conversion
 */
export function formatTimestamp(date: Date | null, formatStr: string = 'MMM d, yyyy HH:mm'): string {
  if (!date) return '';
  
  // Format the UTC time directly without any timezone conversion
  // Extract UTC components and format manually to avoid timezone conversion issues
  try {
    // Ensure we're working with a valid Date object
    if (isNaN(date.getTime())) {
      console.warn('Invalid date passed to formatTimestamp:', date);
      return '';
    }
    
    // Always use UTC methods to get components - this ensures we get UTC time regardless of local timezone
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const day = date.getUTCDate();
    const hour = date.getUTCHours(); // Always use UTC hours
    const minute = date.getUTCMinutes(); // Always use UTC minutes
    const second = date.getUTCSeconds();
    
    // Format manually using UTC components to avoid timezone conversion
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthNamesFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    
    // Handle common format strings manually
    // Replace in order to avoid partial replacements (e.g., 'MM' before 'MMM')
    let result = formatStr;
    result = result.replace(/yyyy/g, String(year));
    result = result.replace(/MMMM/g, monthNamesFull[month]);
    result = result.replace(/MMM/g, monthNames[month]);
    result = result.replace(/MM/g, String(month + 1).padStart(2, '0'));
    result = result.replace(/\bM\b/g, String(month + 1));
    result = result.replace(/dd/g, String(day).padStart(2, '0'));
    result = result.replace(/\bd\b/g, String(day));
    result = result.replace(/HH/g, String(hour).padStart(2, '0'));
    result = result.replace(/\bH\b/g, String(hour));
    result = result.replace(/hh/g, String(hour % 12 || 12).padStart(2, '0'));
    result = result.replace(/\bh\b/g, String(hour % 12 || 12));
    result = result.replace(/mm/g, String(minute).padStart(2, '0'));
    result = result.replace(/\bm\b/g, String(minute));
    result = result.replace(/ss/g, String(second).padStart(2, '0'));
    result = result.replace(/\bs\b/g, String(second));
    
    return result;
  } catch (e) {
    // Fallback: use date-fns but this will have timezone conversion
    console.warn('Error formatting timestamp manually, using date-fns fallback:', e, date);
    return format(date, formatStr);
  }
}

/**
 * Gets timestamp in milliseconds for sorting
 * 
 * @param date - Date object or null
 * @returns Timestamp in milliseconds, or 0 if date is null
 */
export function getTimestampForSort(date: Date | null): number {
  if (!date) return 0;
  return date.getTime();
}

