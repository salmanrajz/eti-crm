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
 * WhatsApp credentials interface for notification API
 */
export interface WhatsAppCredentials {
  apiUrl: string;                        // WhatsApp Business API URL (e.g., 'https://graph.facebook.com/v17.0/{phoneId}/messages')
  accessToken: string;                   // WhatsApp Business API Access Token
  phoneNumberId: string;                 // WhatsApp Business Phone Number ID
  updatedBy?: string;                    // User who last updated the credentials
  updatedAt?: Date;                      // Timestamp of last update
}

/**
 * WhatsApp verification group credentials interface
 */
export interface WhatsAppVerificationGroupCredentials {
  businessPhoneId: string;               // WhatsApp Business Phone ID (used in Graph API URL)
  accessToken: string;                   // WhatsApp Business API Access Token
  templateName: string;                  // WhatsApp template name for verification
  languageCode: string;                  // Template language code (e.g., 'en')
  updatedBy?: string;                    // User who last updated the credentials
  updatedAt?: Date;                      // Timestamp of last update
}

/**
 * All WhatsApp verification groups configuration
 */
export interface WhatsAppVerificationGroupsConfig {
  G1: WhatsAppVerificationGroupCredentials;
  G2: WhatsAppVerificationGroupCredentials;
  G3: WhatsAppVerificationGroupCredentials;
  OTHER: WhatsAppVerificationGroupCredentials;
  languageCode?: string;                 // Default language code for all groups
  updatedBy?: string;
  updatedAt?: Date;
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

// ===============================================================================
// WHATSAPP CREDENTIALS FUNCTIONS
// ===============================================================================

/**
 * Configuration document ID for WhatsApp credentials
 */
const WHATSAPP_CREDENTIALS_DOC_ID = 'whatsapp_credentials';

/**
 * Default WhatsApp credentials (fallback values)
 */
const DEFAULT_WHATSAPP_CREDENTIALS: WhatsAppCredentials = {
  apiUrl: 'https://graph.facebook.com/v17.0/542227575631617/messages',
  accessToken: 'EAAQzFQxG0goBO4DZABL7PrPyIdmFxDbP3hFYQCiioiJZAo4P4JbABnGw1qmBzVJUerTHkZB2qZAfWdaos16NJUYmXIewPTmV90neQjceLWnycrhZBfayZAP5EHCYD4qwBDNAiMvdBz8gLj6pwjDCCCVVA2UasKMPgvFx5GGwXfIMBBCc0tOvOCvTc6VeNkgD5GyAZDZD',
  phoneNumberId: '542227575631617'
};

/**
 * Get WhatsApp credentials from Firebase
 * @returns Promise<WhatsAppCredentials> - The configured or default WhatsApp credentials
 */
export async function getWhatsAppCredentials(): Promise<WhatsAppCredentials> {
  try {
    const credentialsDoc = await getDoc(doc(db, 'config', WHATSAPP_CREDENTIALS_DOC_ID));
    
    if (credentialsDoc.exists()) {
      const data = credentialsDoc.data();
      return {
        apiUrl: data.apiUrl || DEFAULT_WHATSAPP_CREDENTIALS.apiUrl,
        accessToken: data.accessToken || DEFAULT_WHATSAPP_CREDENTIALS.accessToken,
        phoneNumberId: data.phoneNumberId || DEFAULT_WHATSAPP_CREDENTIALS.phoneNumberId,
        updatedBy: data.updatedBy || '',
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined
      };
    }
    
    // Return default credentials if no config exists
    return DEFAULT_WHATSAPP_CREDENTIALS;
  } catch (error) {
    console.error('Error getting WhatsApp credentials:', error);
    // Return default credentials on error
    return DEFAULT_WHATSAPP_CREDENTIALS;
  }
}

/**
 * Update WhatsApp credentials in Firebase
 * @param credentials - The new WhatsApp credentials
 * @param updatedBy - User ID of the administrator making the update
 * @throws Error if validation fails or Firestore update fails
 */
export async function updateWhatsAppCredentials(
  credentials: Partial<WhatsAppCredentials>,
  updatedBy: string
): Promise<void> {
  try {
    console.log('Updating WhatsApp credentials:', { ...credentials, accessToken: '***REDACTED***' });
    
    // Validate required fields
    if (credentials.apiUrl !== undefined && !credentials.apiUrl.trim()) {
      throw new Error('API URL cannot be empty');
    }
    
    if (credentials.accessToken !== undefined && !credentials.accessToken.trim()) {
      throw new Error('Access Token cannot be empty');
    }
    
    if (credentials.phoneNumberId !== undefined && !credentials.phoneNumberId.trim()) {
      throw new Error('Phone Number ID cannot be empty');
    }
    
    // Validate API URL format if provided
    if (credentials.apiUrl) {
      try {
        new URL(credentials.apiUrl);
      } catch {
        throw new Error('Please enter a valid API URL');
      }
    }
    
    const credentialsData: any = {
      ...credentials,
      updatedBy,
      updatedAt: serverTimestamp()
    };
    
    await setDoc(doc(db, 'config', WHATSAPP_CREDENTIALS_DOC_ID), credentialsData, { merge: true });
    console.log('WhatsApp credentials updated successfully');
  } catch (error) {
    console.error('Error updating WhatsApp credentials:', error);
    throw error;
  }
}

// ===============================================================================
// WHATSAPP VERIFICATION GROUP CREDENTIALS FUNCTIONS
// ===============================================================================

/**
 * Configuration document ID for WhatsApp verification group credentials
 */
const WHATSAPP_VERIFICATION_GROUPS_DOC_ID = 'whatsapp_verification_groups';

/**
 * Default WhatsApp verification group credentials (fallback values from environment)
 */
const DEFAULT_VERIFICATION_GROUPS: WhatsAppVerificationGroupsConfig = {
  G1: {
    businessPhoneId: import.meta.env.VITE_WA_G1_PHONE_ID || '',
    accessToken: import.meta.env.VITE_WA_G1_TOKEN || '',
    templateName: import.meta.env.VITE_WA_G1_TEMPLATE || 'verification_g1',
    languageCode: import.meta.env.VITE_WA_LANG || 'en'
  },
  G2: {
    businessPhoneId: import.meta.env.VITE_WA_G2_PHONE_ID || '',
    accessToken: import.meta.env.VITE_WA_G2_TOKEN || '',
    templateName: import.meta.env.VITE_WA_G2_TEMPLATE || 'verification_g2',
    languageCode: import.meta.env.VITE_WA_LANG || 'en'
  },
  G3: {
    businessPhoneId: import.meta.env.VITE_WA_G3_PHONE_ID || '',
    accessToken: import.meta.env.VITE_WA_G3_TOKEN || '',
    templateName: import.meta.env.VITE_WA_G3_TEMPLATE || 'verification_g3',
    languageCode: import.meta.env.VITE_WA_LANG || 'en'
  },
  OTHER: {
    businessPhoneId: import.meta.env.VITE_WA_DEF_PHONE_ID || '',
    accessToken: import.meta.env.VITE_WA_DEF_TOKEN || '',
    templateName: import.meta.env.VITE_WA_DEF_TEMPLATE || 'verification_default',
    languageCode: import.meta.env.VITE_WA_LANG || 'en'
  },
  languageCode: import.meta.env.VITE_WA_LANG || 'en'
};

/**
 * Get WhatsApp verification group credentials from Firebase
 * @returns Promise<WhatsAppVerificationGroupsConfig> - The configured or default group credentials
 */
export async function getWhatsAppVerificationGroups(): Promise<WhatsAppVerificationGroupsConfig> {
  try {
    const groupsDoc = await getDoc(doc(db, 'config', WHATSAPP_VERIFICATION_GROUPS_DOC_ID));
    
    if (groupsDoc.exists()) {
      const data = groupsDoc.data();
      const defaultLang = data.languageCode || DEFAULT_VERIFICATION_GROUPS.languageCode || 'en';
      
      return {
        G1: {
          businessPhoneId: data.G1?.businessPhoneId || DEFAULT_VERIFICATION_GROUPS.G1.businessPhoneId,
          accessToken: data.G1?.accessToken || DEFAULT_VERIFICATION_GROUPS.G1.accessToken,
          templateName: data.G1?.templateName || DEFAULT_VERIFICATION_GROUPS.G1.templateName,
          languageCode: data.G1?.languageCode || defaultLang,
          updatedBy: data.G1?.updatedBy || '',
          updatedAt: data.G1?.updatedAt?.toDate ? data.G1.updatedAt.toDate() : undefined
        },
        G2: {
          businessPhoneId: data.G2?.businessPhoneId || DEFAULT_VERIFICATION_GROUPS.G2.businessPhoneId,
          accessToken: data.G2?.accessToken || DEFAULT_VERIFICATION_GROUPS.G2.accessToken,
          templateName: data.G2?.templateName || DEFAULT_VERIFICATION_GROUPS.G2.templateName,
          languageCode: data.G2?.languageCode || defaultLang,
          updatedBy: data.G2?.updatedBy || '',
          updatedAt: data.G2?.updatedAt?.toDate ? data.G2.updatedAt.toDate() : undefined
        },
        G3: {
          businessPhoneId: data.G3?.businessPhoneId || DEFAULT_VERIFICATION_GROUPS.G3.businessPhoneId,
          accessToken: data.G3?.accessToken || DEFAULT_VERIFICATION_GROUPS.G3.accessToken,
          templateName: data.G3?.templateName || DEFAULT_VERIFICATION_GROUPS.G3.templateName,
          languageCode: data.G3?.languageCode || defaultLang,
          updatedBy: data.G3?.updatedBy || '',
          updatedAt: data.G3?.updatedAt?.toDate ? data.G3.updatedAt.toDate() : undefined
        },
        OTHER: {
          businessPhoneId: data.OTHER?.businessPhoneId || DEFAULT_VERIFICATION_GROUPS.OTHER.businessPhoneId,
          accessToken: data.OTHER?.accessToken || DEFAULT_VERIFICATION_GROUPS.OTHER.accessToken,
          templateName: data.OTHER?.templateName || DEFAULT_VERIFICATION_GROUPS.OTHER.templateName,
          languageCode: data.OTHER?.languageCode || defaultLang,
          updatedBy: data.OTHER?.updatedBy || '',
          updatedAt: data.OTHER?.updatedAt?.toDate ? data.OTHER.updatedAt.toDate() : undefined
        },
        languageCode: defaultLang,
        updatedBy: data.updatedBy || '',
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : undefined
      };
    }
    
    // Return default credentials if no config exists
    return DEFAULT_VERIFICATION_GROUPS;
  } catch (error) {
    console.error('Error getting WhatsApp verification groups:', error);
    // Return default credentials on error
    return DEFAULT_VERIFICATION_GROUPS;
  }
}

/**
 * Update WhatsApp verification group credentials in Firebase
 * @param groups - The new group credentials configuration
 * @param updatedBy - User ID of the administrator making the update
 * @throws Error if validation fails or Firestore update fails
 */
export async function updateWhatsAppVerificationGroups(
  groups: Partial<WhatsAppVerificationGroupsConfig>,
  updatedBy: string
): Promise<void> {
  try {
    console.log('Updating WhatsApp verification groups:', { 
      ...groups, 
      G1: groups.G1 ? { ...groups.G1, accessToken: '***REDACTED***' } : undefined,
      G2: groups.G2 ? { ...groups.G2, accessToken: '***REDACTED***' } : undefined,
      G3: groups.G3 ? { ...groups.G3, accessToken: '***REDACTED***' } : undefined,
      OTHER: groups.OTHER ? { ...groups.OTHER, accessToken: '***REDACTED***' } : undefined
    });
    
    // Validate group credentials if provided
    const validateGroup = (group: Partial<WhatsAppVerificationGroupCredentials> | undefined, groupName: string) => {
      if (!group) return;
      
      if (group.businessPhoneId !== undefined && !group.businessPhoneId.trim()) {
        throw new Error(`${groupName} Business Phone ID cannot be empty`);
      }
      
      if (group.accessToken !== undefined && !group.accessToken.trim()) {
        throw new Error(`${groupName} Access Token cannot be empty`);
      }
      
      if (group.templateName !== undefined && !group.templateName.trim()) {
        throw new Error(`${groupName} Template Name cannot be empty`);
      }
      
      if (group.languageCode !== undefined && !group.languageCode.trim()) {
        throw new Error(`${groupName} Language Code cannot be empty`);
      }
    };
    
    validateGroup(groups.G1, 'G1');
    validateGroup(groups.G2, 'G2');
    validateGroup(groups.G3, 'G3');
    validateGroup(groups.OTHER, 'OTHER');
    
    // Build update data
    const updateData: any = {
      updatedBy,
      updatedAt: serverTimestamp()
    };
    
    // Add group updates with timestamps
    if (groups.G1) {
      updateData.G1 = {
        ...groups.G1,
        updatedBy,
        updatedAt: serverTimestamp()
      };
    }
    
    if (groups.G2) {
      updateData.G2 = {
        ...groups.G2,
        updatedBy,
        updatedAt: serverTimestamp()
      };
    }
    
    if (groups.G3) {
      updateData.G3 = {
        ...groups.G3,
        updatedBy,
        updatedAt: serverTimestamp()
      };
    }
    
    if (groups.OTHER) {
      updateData.OTHER = {
        ...groups.OTHER,
        updatedBy,
        updatedAt: serverTimestamp()
      };
    }
    
    if (groups.languageCode !== undefined) {
      updateData.languageCode = groups.languageCode;
    }
    
    await setDoc(doc(db, 'config', WHATSAPP_VERIFICATION_GROUPS_DOC_ID), updateData, { merge: true });
    console.log('WhatsApp verification groups updated successfully');
  } catch (error) {
    console.error('Error updating WhatsApp verification groups:', error);
    throw error;
  }
}
