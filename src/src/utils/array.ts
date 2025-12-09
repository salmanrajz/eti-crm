/**
 * ===============================================================================
 * ARRAY UTILITY FUNCTIONS - DATA ARRAY PROCESSING UTILITIES
 * ===============================================================================
 * 
 * This module provides utility functions for array manipulation and processing
 * used throughout the CRM system for data chunking and batch operations.
 * 
 * FEATURES:
 * 
 * 1. ARRAY CHUNKING
 *    - Split large arrays into smaller, manageable chunks
 *    - Useful for batch processing and pagination
 *    - Memory-efficient processing of large datasets
 * 
 * USAGE:
 * Import array utilities for efficient data processing and batch operations
 * throughout the CRM system.
 * ===============================================================================
 */

/**
 * ===============================================================================
 * ARRAY CHUNKING FUNCTION
 * ===============================================================================
 * 
 * Splits an array into smaller chunks of the specified size for efficient
 * processing of large datasets and batch operations.
 * 
 * @param array - The array to be chunked
 * @param size - The maximum size of each chunk
 * @returns Array of smaller arrays (chunks)
 * 
 * Example:
 * chunk([1, 2, 3, 4, 5, 6], 2) => [[1, 2], [3, 4], [5, 6]]
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}