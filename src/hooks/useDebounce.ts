/**
 * ===============================================================================
 * DEBOUNCE HOOK - REACT HOOK FOR DEBOUNCED VALUES
 * ===============================================================================
 * 
 * A custom React hook that debounces a value, delaying updates until after
 * the specified delay has passed since the last change. This is useful for
 * optimizing performance when dealing with frequently changing values like
 * search inputs, API calls, or expensive computations.
 * 
 * FEATURES:
 * - Generic type support for any value type
 * - Automatic cleanup of timeouts to prevent memory leaks
 * - Efficient re-rendering only when debounced value actually changes
 * 
 * USAGE:
 * ```typescript
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearchTerm = useDebounce(searchTerm, 300);
 * 
 * useEffect(() => {
 *   // This effect only runs when debouncedSearchTerm changes
 *   // after 300ms of no changes to searchTerm
 *   performSearch(debouncedSearchTerm);
 * }, [debouncedSearchTerm]);
 * ```
 * 
 * @param value - The value to debounce
 * @param delay - The delay in milliseconds before updating the debounced value
 * @returns The debounced value
 * ===============================================================================
 */

import { useState, useEffect } from 'react';

/**
 * Custom hook that debounces a value, preventing updates until the specified
 * delay has passed since the last change to the input value.
 * 
 * @param value - The value to debounce (any type)
 * @param delay - Delay in milliseconds before updating the debounced value
 * @returns The debounced value of the same type as input
 */
export function useDebounce<T>(value: T, delay: number): T {
  // State to hold the debounced value
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up a timeout to update the debounced value after the delay
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cleanup function to clear the timeout if value changes before delay completes
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]); // Re-run effect when value or delay changes

  return debouncedValue;
}