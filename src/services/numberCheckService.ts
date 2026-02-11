import { auth } from '../lib/firebase';

interface NumberCheckResult {
  isActive: boolean;
  status: number;
  message: string;
}

export class NumberCheckService {
  private static readonly FUNCTION_URL = 'https://us-central1-crms-4f543.cloudfunctions.net/checkNumberStatusHTTP';
  
  /**
   * Check if a number is active via ETI API through Firebase Cloud Function
   * @param number - The phone number to check (e.g., '0501234567')
   * @returns Promise<NumberCheckResult>
   */
  static async checkNumberStatus(number: string): Promise<NumberCheckResult> {
    try {
      // Clean the number (remove any spaces, dashes, etc.)
      const cleanNumber = number.replace(/[\s\-\(\)]/g, '');
      
      // Validate number format
      if (!/^\d{10,11}$/.test(cleanNumber)) {
        return {
          isActive: false,
          status: 400,
          message: 'Invalid number format'
        };
      }

      // Get current user ID for authentication
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return {
          isActive: false,
          status: 401,
          message: 'Authentication required'
        };
      }

      // Call Firebase HTTP Cloud Function
      const response = await fetch(this.FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number: cleanNumber,
          uid: currentUser.uid
        }),
        // Add timeout to prevent hanging requests
        signal: AbortSignal.timeout(20000) // 20 second timeout
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Handle timeout specifically
        if (response.status === 408) {
          return {
            isActive: false,
            status: 408,
            message: 'API timeout - assuming number is inactive'
          };
        }
        
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      return {
        isActive: data.isActive,
        status: data.status,
        message: data.message
      };
      
    } catch (error: any) {
      console.error('Error checking number status:', error);
      
      // Handle different types of errors
      if (error.name === 'AbortError') {
        return {
          isActive: false,
          status: 408,
          message: 'Request timeout - unable to verify number status'
        };
      }
      
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        return {
          isActive: false,
          status: 503,
          message: 'Network error - unable to connect to verification service'
        };
      }
      
      return {
        isActive: false,
        status: 500,
        message: error.message || 'Unable to verify number status'
      };
    }
  }

  /**
   * Check if a number can be reserved (not active)
   * @param number - The phone number to check
   * @returns Promise<boolean> - true if can be reserved, false if active
   */
  static async canReserveNumber(number: string): Promise<boolean> {
    const result = await this.checkNumberStatus(number);
    return !result.isActive;
  }
}
