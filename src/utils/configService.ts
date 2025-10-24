/**
 * ===============================================================================
 * CONFIGURATION SERVICE - APPLICATION CONFIGURATION MANAGEMENT
 * ===============================================================================
 * 
 * This module provides centralized configuration management for the CRM system,
 * handling WhatsApp API endpoints, verification settings, and other application
 * configuration that can be updated dynamically by administrators.
 * 
 * FEATURES:
 * 
 * 1. WHATSAPP INTEGRATION CONFIGURATION
 *    - Dynamic WhatsApp API endpoint management
 *    - Verification feature enable/disable controls
 *    - Admin-configurable API settings
 * 
 * 2. CONFIGURATION PERSISTENCE
 *    - Firestore-based configuration storage
 *    - Real-time configuration updates
 *    - Audit trail with update tracking
 * 
 * 3. VALIDATION AND ERROR HANDLING
 *    - URL validation for API endpoints
 *    - Comprehensive error handling with fallbacks
 *    - Default value management
 * 
 * USAGE:
 * Import configuration functions to access and manage system-wide settings
 * for WhatsApp integration and other configurable features.
 * ===============================================================================
 */

import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

/**
 * ===============================================================================
 * CONFIGURATION INTERFACES
 * ===============================================================================
 */

/**
 * Application configuration interface defining all configurable system settings
 */
export interface AppConfig {
  id?: string;                           // Document ID in Firestore
  whatsappApiEndpoint: string;          // WhatsApp Business API endpoint URL
  whatsappVerificationEnabled: boolean; // Verification feature toggle
  updatedBy: string;                    // User who last updated the configuration
  updatedAt: Date;                      // Timestamp of last configuration update
}

/**
 * Configuration document ID in Firestore
 * Centralized configuration storage key
 */
const CONFIG_DOC_ID = 'app_config';

// ===============================================================================
// WHATSAPP API CONFIGURATION FUNCTIONS
// ===============================================================================

/**
 * ===============================================================================
 * GET WHATSAPP API ENDPOINT
 * ===============================================================================
 * 
 * Retrieves the current WhatsApp Business API endpoint configuration from Firestore.
 * Returns a default endpoint if no configuration is found or an error occurs.
 * 
 * @returns Promise<string> - The configured or default WhatsApp API endpoint URL
 */
export async function getWhatsAppApiEndpoint(): Promise<string> {
  try {
    const configDoc = await getDoc(doc(db, 'config', CONFIG_DOC_ID));
    
    if (configDoc.exists()) {
      const data = configDoc.data();
      return data.whatsappApiEndpoint || 'http://20.46.233.188:3000/check';
    }
    
    // Return default endpoint if no config exists
    return 'http://20.46.233.188:3000/check';
  } catch (error) {
    console.error('Error getting WhatsApp API endpoint:', error);
    // Return default endpoint on error
    return 'http://20.46.233.188:3000/check';
  }
}

/**
 * ===============================================================================
 * UPDATE WHATSAPP API ENDPOINT
 * ===============================================================================
 * 
 * Updates the WhatsApp Business API endpoint configuration in Firestore with
 * validation to ensure the endpoint is a valid URL format.
 * 
 * @param endpoint - The new WhatsApp API endpoint URL
 * @param updatedBy - User ID of the administrator making the update
 * @throws Error if endpoint validation fails or Firestore update fails
 */
export async function updateWhatsAppApiEndpoint(
  endpoint: string, 
  updatedBy: string
): Promise<void> {
  try {
    console.log('Updating WhatsApp API endpoint:', { endpoint, updatedBy });
    
    // Validate the endpoint format
    if (!endpoint.trim()) {
      throw new Error('Endpoint cannot be empty');
    }
    
    // Basic URL validation
    try {
      new URL(endpoint);
    } catch {
      throw new Error('Please enter a valid URL');
    }
    
    const configData: any = {
      whatsappApiEndpoint: endpoint.trim(),
      updatedBy,
      updatedAt: serverTimestamp()
    };
    
    console.log('API endpoint config data to save:', configData);
    await setDoc(doc(db, 'config', CONFIG_DOC_ID), configData, { merge: true });
    console.log('WhatsApp API endpoint updated successfully');
  } catch (error) {
    console.error('Error updating WhatsApp API endpoint:', error);
    throw error;
  }
}

/**
 * Get WhatsApp verification enabled status
 */
export async function getWhatsAppVerificationEnabled(): Promise<boolean> {
  try {
    const configDoc = await getDoc(doc(db, 'config', CONFIG_DOC_ID));
    
    if (configDoc.exists()) {
      const data = configDoc.data();
      return data.whatsappVerificationEnabled !== false; // Default to true if not set
    }
    
    // Return default value if no config exists
    return true;
  } catch (error) {
    console.error('Error getting WhatsApp verification setting:', error);
    // Return default value on error
    return true;
  }
}

/**
 * Update WhatsApp verification enabled status
 */
export async function updateWhatsAppVerificationEnabled(
  enabled: boolean, 
  updatedBy: string
): Promise<void> {
  try {
    const configData: any = {
      whatsappVerificationEnabled: enabled,
      updatedBy,
      updatedAt: serverTimestamp()
    };
    
    await setDoc(doc(db, 'config', CONFIG_DOC_ID), configData, { merge: true });
  } catch (error) {
    console.error('Error updating WhatsApp verification setting:', error);
    throw error;
  }
}

/**
 * Get full app configuration
 */
export async function getAppConfig(): Promise<AppConfig | null> {
  try {
    const configDoc = await getDoc(doc(db, 'config', CONFIG_DOC_ID));
    
    if (configDoc.exists()) {
      const data = configDoc.data();
      return {
        id: configDoc.id,
        whatsappApiEndpoint: data.whatsappApiEndpoint || 'http://20.84.63.80:3000/check',
        whatsappVerificationEnabled: data.whatsappVerificationEnabled !== false,
        updatedBy: data.updatedBy || '',
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date()
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error getting app config:', error);
    return null;
  }
}
