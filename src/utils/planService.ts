/**
 * ===============================================================================
 * PLAN SERVICE UTILITY - PLAN AND CATEGORY MANAGEMENT
 * ===============================================================================
 * 
 * This module provides services for managing plans and plan categories from
 * Firebase Firestore with caching capabilities for optimal performance.
 * It handles plan retrieval, categorization, and dynamic plan option generation.
 * 
 * FEATURES:
 * 
 * 1. PLAN MANAGEMENT
 *    - Active plan retrieval with caching
 *    - Plan category organization and filtering
 *    - Dynamic plan option generation for UI components
 * 
 * 2. CACHING OPTIMIZATION
 *    - 5-minute cache duration for plan data
 *    - Memory-efficient caching strategy
 *    - Automatic cache invalidation and refresh
 * 
 * 3. DATA STRUCTURE MANAGEMENT
 *    - Plan and category interfaces with validation
 *    - Grouped plan options for form components
 *    - Type-safe plan and category handling
 * 
 * USAGE:
 * Import plan service functions to access and manage plan data for
 * lead creation, form populating, and plan configuration throughout the CRM.
 * ===============================================================================
 */

import { collection, query, getDocs, orderBy, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface Plan {
  id: string;
  name: string;
  category: string;
  description?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PlanCategory {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PlanOption {
  value: string;
  label: string;
}

export interface PlanCategoryGroup {
  label: string;
  options: PlanOption[];
}

// Cache for plans and categories
let plansCache: Plan[] | null = null;
let categoriesCache: PlanCategory[] | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getPlans(): Promise<Plan[]> {
  const now = Date.now();
  
  if (plansCache && (now - lastFetchTime) < CACHE_DURATION) {
    return plansCache;
  }

  try {
    const plansQuery = query(
      collection(db, 'plans'),
      where('isActive', '==', true),
      orderBy('category'),
      orderBy('name')
    );
    
    const snapshot = await getDocs(plansQuery);
    const plans = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Plan[];

    plansCache = plans;
    lastFetchTime = now;
    return plans;
  } catch (error) {
    console.error('Error fetching plans:', error);
    return plansCache || [];
  }
}

export async function getPlanCategories(): Promise<PlanCategory[]> {
  const now = Date.now();
  
  if (categoriesCache && (now - lastFetchTime) < CACHE_DURATION) {
    return categoriesCache;
  }

  try {
    const categoriesQuery = query(
      collection(db, 'planCategories'),
      where('isActive', '==', true),
      orderBy('name')
    );
    
    const snapshot = await getDocs(categoriesQuery);
    const categories = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as PlanCategory[];

    categoriesCache = categories;
    lastFetchTime = now;
    return categories;
  } catch (error) {
    console.error('Error fetching plan categories:', error);
    return categoriesCache || [];
  }
}

export async function getPlanCategoriesWithPlans(): Promise<PlanCategoryGroup[]> {
  try {
    const [plans, categories] = await Promise.all([
      getPlans(),
      getPlanCategories()
    ]);

    return categories.map(category => ({
      label: `✅ ${category.name} Plans`,
      options: plans
        .filter(plan => plan.category === category.name)
        .map(plan => ({
          value: plan.name,
          label: plan.name
        }))
    })).filter(category => category.options.length > 0);
  } catch (error) {
    console.error('Error fetching plan categories with plans:', error);
    return [];
  }
}

// Clear cache when plans or categories are updated
export function clearPlanCache(): void {
  plansCache = null;
  categoriesCache = null;
  lastFetchTime = 0;
}
