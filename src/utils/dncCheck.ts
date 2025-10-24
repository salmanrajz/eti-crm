import axios from 'axios';
import { checkDNCNumber as checkFirebaseDNC, logWhatsAppCheck } from './dncService';
import { getWhatsAppApiEndpoint } from './configService';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

/**
 * DNC (Do Not Call) Check Utility
 * 
 * This utility checks phone numbers against a DNC database to ensure compliance.
 * 
 * Dynamic Configuration with CORS Handling:
 * - Uses Firebase configuration for WhatsApp API endpoint
 * - Admin can change endpoint through DNC Management interface
 * - Automatically uses proxy for known endpoints to avoid CORS issues
 * - Falls back to direct calls for other endpoints
 * - In production, ensure the configured endpoint handles CORS properly
 */

interface DNCResponse {
  exists: boolean;
  jid?: string;
}

export interface DNCResult {
  number: string;
  exists: boolean;
  formattedNumber?: string;
  error?: string;
  isDNC?: boolean; // true if number is in DNC database
  dncSource?: string; // source of DNC entry
  inNumberPool?: boolean; // true if number is available in number pool
  numberPoolWarning?: string; // warning message if number is not in pool
  whatsappApiNumber?: string; // The number format used for WhatsApp API calls
}

/**
 * Check if a number exists in the number pool
 * @param number - The phone number to check (with country code)
 * @returns Promise<boolean>
 */
async function checkNumberPool(number: string): Promise<boolean> {
  try {
    const cleanNumber = number.replace(/[^\d+]/g, '');
    
    // Query the numberPool collection for this number
    const numberPoolQuery = query(
      collection(db, 'numberPool'),
      where('number', '==', cleanNumber)
    );
    
    const querySnapshot = await getDocs(numberPoolQuery);
    
    // Return true if at least one document exists
    return !querySnapshot.empty;
  } catch (error) {
    console.error('Error checking number pool:', error);
    return false; // Default to false if there's an error
  }
}

/**
 * Check if a number exists in the DNC system
 * @param number - The phone number to check (with country code)
 * @param userId - User ID who is performing the check (for logging)
 * @param debugMode - Enable debug logging
 * @returns Promise<DNCResult>
 */
export async function checkDNCNumber(number: string, userId?: string, debugMode: boolean = false): Promise<DNCResult> {
  // Remove any non-digit characters except +
  const cleanNumber = number.replace(/[^\d+]/g, '');
  
  // For DNC and number pool checks, use the original format
  // For WhatsApp API calls, convert to international format if it's a UAE local number
  const dncCheckNumber = cleanNumber; // Use original format for DNC checks
  
  // Convert to international format for WhatsApp API if it's a UAE local number (05XXXXXXXX)
  let whatsappApiNumber = cleanNumber;
  if (/^05\d{8}$/.test(cleanNumber)) {
    // Remove only the leading 0, keep the 5: 057171772 -> +97157171772
    whatsappApiNumber = '+971' + cleanNumber.substring(1);
  } else if (/^971\d{8,9}$/.test(cleanNumber)) {
    whatsappApiNumber = '+' + cleanNumber;
  }
  
  if (debugMode) {
    console.log('🔍 [DNC DEBUG] Starting DNC check for number:', cleanNumber);
    console.log('🔍 [DNC DEBUG] DNC check number:', dncCheckNumber);
    console.log('🔍 [DNC DEBUG] WhatsApp API number:', whatsappApiNumber);
    console.log('🔍 [DNC DEBUG] Timestamp:', new Date().toISOString());
  }
  
  // ALWAYS check if number is in our Firebase DNC database FIRST (using original format)
  const isInDNCDatabase = await checkFirebaseDNC(dncCheckNumber);
  
  // ALWAYS check if number exists in the number pool (using original format)
  const isInNumberPool = await checkNumberPool(dncCheckNumber);
  
  if (debugMode) {
    console.log('🔍 [DNC DEBUG] Firebase DNC check result:', isInDNCDatabase);
    console.log('🔍 [DNC DEBUG] Number pool check result:', isInNumberPool);
  }
  
  // If number is in DNC database, return immediately with DNC status
  if (isInDNCDatabase) {
    const result = {
      number: cleanNumber, // Always return the original input format
      exists: false, // We don't know WhatsApp status, but we know it's DNC
      isDNC: true,
      dncSource: 'firebase',
      inNumberPool: isInNumberPool,
      numberPoolWarning: !isInNumberPool ? `⚠️ Number ${cleanNumber} is not available in the number pool` : undefined,
      message: '🚫 Number is in DNC database - DO NOT CALL',
      whatsappApiNumber: whatsappApiNumber // Include the number that would be used for WhatsApp API call
    };

    // Log the DNC result
    if (userId) {
      await logWhatsAppCheck({
        number: cleanNumber,
        checkedBy: userId,
        result: 'not_exists',
        isDNC: true,
        inNumberPool: isInNumberPool,
        apiEndpoint: 'firebase_dnc_check',
        responseTime: 0
      });
    }

    return result;
  }
  
  // Get the configured WhatsApp API endpoint from Firebase
  const configuredEndpoint = await getWhatsAppApiEndpoint();
  
  // If the configured endpoint matches our proxy target, use the proxy to avoid CORS
  // Otherwise, use the configured endpoint directly
  let endpointToUse = configuredEndpoint;
  
  // Check if the configured endpoint matches our proxy target
  if (configuredEndpoint.includes('20.46.233.188:3000/check')) {
    endpointToUse = '/api/whatsapp';
  }
  
  const endpoints = [endpointToUse];
  
  try {
    
    for (const endpoint of endpoints) {
      try {
        if (debugMode) {
          console.log('🌐 [DNC DEBUG] Attempting to call endpoint:', endpoint);
          console.log('🌐 [DNC DEBUG] Request payload:', { number: whatsappApiNumber });
        }
        
        const startTime = Date.now();
        const response = await axios.post<DNCResponse>(
          endpoint,
          { number: whatsappApiNumber },
          {
            headers: {
              'Content-Type': 'application/json',
            },
            timeout: 10000, // 10 second timeout
          }
        );
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        if (debugMode) {
          console.log('✅ [DNC DEBUG] API Response received:', response.data);
          console.log('⏱️ [DNC DEBUG] Request duration:', duration + 'ms');
          console.log('📊 [DNC DEBUG] Response status:', response.status);
          console.log('📊 [DNC DEBUG] Response headers:', response.headers);
        }

        const { data } = response;

        if (data.exists === true && data.jid) {
          // Remove '@s.whatsapp.net' suffix to get the formatted number
          const formattedNumber = data.jid.replace(/@s\.whatsapp\.net$/, '');
          
          const result = {
            number: cleanNumber, // Always return the original input format
            exists: true,
            formattedNumber,
            isDNC: isInDNCDatabase,
            dncSource: isInDNCDatabase ? 'firebase' : 'none',
            inNumberPool: isInNumberPool,
            numberPoolWarning: !isInNumberPool ? `⚠️ Number ${cleanNumber} is not available in the number pool` : undefined,
            whatsappApiNumber: whatsappApiNumber // Include the number used for WhatsApp API call
          };

          // Log the successful check
          if (userId) {
            await logWhatsAppCheck({
              number: cleanNumber,
              checkedBy: userId,
              result: 'exists',
              whatsappJid: data.jid,
              isDNC: isInDNCDatabase,
              inNumberPool: isInNumberPool,
              apiEndpoint: endpoint,
              responseTime: duration
            });
          }

          return result;
        }

        const result = {
          number: cleanNumber, // Always return the original input format
          exists: false,
          isDNC: isInDNCDatabase,
          dncSource: isInDNCDatabase ? 'firebase' : 'none',
          inNumberPool: isInNumberPool,
          numberPoolWarning: !isInNumberPool ? `⚠️ Number ${cleanNumber} is not available in the number pool` : undefined,
          whatsappApiNumber: whatsappApiNumber // Include the number used for WhatsApp API call
        };

        // Log the check result (no WhatsApp account)
        if (userId) {
          await logWhatsAppCheck({
            number: cleanNumber,
            checkedBy: userId,
            result: 'not_exists',
            isDNC: isInDNCDatabase,
            inNumberPool: isInNumberPool,
            apiEndpoint: endpoint,
            responseTime: duration
          });
        }

        return result;
      } catch (endpointError: any) {
        if (debugMode) {
          console.error('❌ [DNC DEBUG] Endpoint failed:', endpoint);
          console.error('❌ [DNC DEBUG] Error details:', endpointError);
          console.error('❌ [DNC DEBUG] Error message:', endpointError.message);
          console.error('❌ [DNC DEBUG] Error code:', endpointError.code);
        }
        
        // If this is not the last endpoint, continue to next one
        if (endpoint !== endpoints[endpoints.length - 1]) {
          console.warn(`Failed to connect to ${endpoint}, trying next endpoint:`, endpointError.message);
          continue;
        }
        
        // If this is the last endpoint, throw the error
        throw endpointError;
      }
    }
    
    // If we reach here, all endpoints failed
    throw new Error('All WhatsApp API endpoints failed');
  } catch (error: any) {
    console.error('WhatsApp API Error:', error);
    
    // Even if WhatsApp API fails, we still return DNC status
    // DNC status has already been checked above, so we use those results
    let errorMessage = 'Failed to lookup WhatsApp status';
    
    if (error.response?.status === 500) {
      errorMessage = 'Invalid Number - No Numbers found for Calling';
    } else if (error.code === 'ERR_NETWORK') {
      errorMessage = 'Network error - Please check your connection or try again later';
    } else if (error.message?.includes('timeout') || error.code === 'ECONNABORTED') {
      errorMessage = 'Request timeout - Please try again';
    }
    
    // Return result with DNC status (already checked above) and WhatsApp error
    const result = {
      number: cleanNumber, // Always return the original input format
      exists: false,
      error: errorMessage,
      isDNC: isInDNCDatabase, // Use the DNC status we already checked
      dncSource: isInDNCDatabase ? 'firebase' : 'none',
      inNumberPool: isInNumberPool, // Use the number pool status we already checked
      numberPoolWarning: !isInNumberPool ? `⚠️ Number ${cleanNumber} is not available in the number pool` : undefined,
      message: isInDNCDatabase ? '🚫 Number is in DNC database - DO NOT CALL' : '❌ WhatsApp lookup failed',
      whatsappApiNumber: whatsappApiNumber // Include the number used for WhatsApp API call
    };

    // Log the error
    if (userId) {
      await logWhatsAppCheck({
        number: cleanNumber,
        checkedBy: userId,
        result: 'error',
        errorMessage: errorMessage,
        isDNC: isInDNCDatabase,
        inNumberPool: isInNumberPool,
        apiEndpoint: 'whatsapp_api_failed',
        responseTime: 0
      });
    }

    return result;
  }
}

/**
 * Check multiple numbers for DNC status
 * @param numbers - Array of phone numbers to check
 * @param userId - User ID who is performing the check (for logging)
 * @param debugMode - Enable debug logging
 * @returns Promise<DNCResult[]>
 */
export async function checkMultipleDNCNumbers(numbers: string[], userId?: string, debugMode: boolean = false): Promise<DNCResult[]> {
  const results: DNCResult[] = [];
  
  if (debugMode) {
    console.log('🔍 [DNC DEBUG] Starting batch check for', numbers.length, 'numbers');
  }
  
  // Process numbers sequentially to avoid overwhelming the API
  for (const number of numbers) {
    try {
      const result = await checkDNCNumber(number, userId, debugMode);
      results.push(result);
      
      // Add a small delay between requests to be respectful to the API
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      results.push({
        number,
        exists: false,
        error: 'Failed to check number',
      });
    }
  }
  
  return results;
}
