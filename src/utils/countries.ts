/**
 * ===============================================================================
 * COUNTRIES UTILITY - COUNTRY CODE AND NAME MAPPING
 * ===============================================================================
 * 
 * This module provides a comprehensive list of countries with their ISO country
 * codes and names, primarily used for international phone number formatting and
 * customer location selection in the CRM system.
 * 
 * FEATURES:
 * 
 * 1. COUNTRY MAPPING
 *    - ISO country code and name pairs
 *    - Comprehensive list covering major markets
 *    - Easy lookup for international operations
 * 
 * 2. USE CASES
 *    - Phone number formatting and validation
 *    - Customer location selection
 *    - International business operations
 * 
 * USAGE:
 * Import countryList for dropdown selections and country code lookups
 * throughout the CRM system, especially in customer management.
 * ===============================================================================
 */

/**
 * ===============================================================================
 * COUNTRY INTERFACE AND DATA
 * ===============================================================================
 */

/**
 * Country interface defining the structure for country data
 */
export interface Country {
  code: string; // ISO country code (e.g., 'AE', 'US', 'IN')
  name: string; // Full country name (e.g., 'United Arab Emirates')
}

/**
 * Comprehensive list of countries with their ISO codes and names
 * Covers major markets including Middle East, Asia, Europe, and Americas
 */
export const countryList: Country[] = [
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'QA', name: 'Qatar' },
  { code: 'KW', name: 'Kuwait' },
  { code: 'BH', name: 'Bahrain' },
  { code: 'OM', name: 'Oman' },
  { code: 'IN', name: 'India' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'EG', name: 'Egypt' },
  { code: 'PH', name: 'Philippines' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'TH', name: 'Thailand' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'CN', name: 'China' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'IT', name: 'Italy' },
  { code: 'ES', name: 'Spain' },
  { code: 'PT', name: 'Portugal' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'AT', name: 'Austria' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'PL', name: 'Poland' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'HU', name: 'Hungary' },
  { code: 'RO', name: 'Romania' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'GR', name: 'Greece' },
  { code: 'TR', name: 'Turkey' },
  { code: 'IL', name: 'Israel' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'KE', name: 'Kenya' },
  { code: 'GH', name: 'Ghana' },
  { code: 'ET', name: 'Ethiopia' }
]; 