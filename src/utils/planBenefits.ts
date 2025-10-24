/**
 * ===============================================================================
 * PLAN BENEFITS UTILITY - PLAN BENEFIT DEFINITIONS AND MAPPING
 * ===============================================================================
 * 
 * This module provides static plan benefit definitions for the CRM system,
 * mapping plan names to their corresponding benefits, amounts, and durations.
 * Used for displaying plan information and benefit details in the UI.
 * 
 * FEATURES:
 * 
 * 1. PLAN BENEFIT MAPPING
 *    - Static mapping of plan names to benefit structures
 *    - Amount, benefits, and duration information for each plan
 *    - Type-safe benefit definitions with structured data
 * 
 * 2. PLAN DISPLAY SUPPORT
 *    - Ready-to-display benefit information for UI components
 *    - Formatted benefit descriptions and pricing details
 *    - Duration and feature information for plan comparisons
 * 
 * USAGE:
 * Import planBenefits for accessing plan benefit information in components
 * that need to display plan details, pricing, and feature lists.
 * ===============================================================================
 */

/**
 * Interface defining the structure for plan benefit information
 */
export interface PlanBenefit {
  amount: string;      // Plan price amount
  benefits: string;    // Plan benefits description
  duration: string;    // Plan duration in months
}

/**
 * Static mapping of plan names to their benefit information
 * Contains comprehensive benefit data for all available plans
 */
export const planBenefits: { [key: string]: PlanBenefit } = {
  'New Freedom 250 - 12 M - 3 Mbps - Unlimited Data - 1000 Local mins': {
    amount: '250',
    benefits: '1000 local minutes, Non-Stop Data (up to 3 Mbps)',
    duration: '1'
  },
  'New Freedom 250 - 12 M - 3 Mbps - Unlimited Data - 500 Flexible Mint': {
    amount: '250',
    benefits: '500 flexible minutes, Non-Stop Data (up to 3 Mbps)',
    duration: '1'
  },
  'New Freedom 260 With Unlimited Country to 1 Preffered International Number Local': {
    amount: '260',
    benefits: 'Unlimited calls to 1 preferred international number, 600 flexible minutes, 20 GB data',
    duration: '1'
  },
  'New Freedom Plan 325 - 12 M - Local': {
    amount: '325',
    benefits: 'Unlimited local minutes, 27 GB data',
    duration: '1'
  },
  'New Freedom 325 - 12 M - 10 Mbps - Unlimited Data - 1800 Local Mins': {
    amount: '325',
    benefits: '1800 local minutes, Non-Stop Data (up to 10 Mbps)',
    duration: '1'
  },
  'New Freedom 325 - 12 M - 10 Mbps - Unlimited Data - 900 Flexi Mins': {
    amount: '325',
    benefits: '900 flexible minutes, Non-Stop Data (up to 10 Mbps)',
    duration: '1'
  },
  'Emirati Freedom 400': {
    amount: '400',
    benefits: 'Unlimited local calls, 40 GB data',
    duration: '1'
  },
  'New Freedom 500 - 12 M - 20 Mbps - Unlimited Data - 3000 Local Mins': {
    amount: '500',
    benefits: '3000 local minutes, Non-Stop Data (up to 20 Mbps)',
    duration: '1'
  }
}; 