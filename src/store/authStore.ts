/**
 * ===============================================================================
 * AUTHENTICATION STATE MANAGEMENT - ZUSTAND STORE
 * ===============================================================================
 * 
 * This module provides global authentication state management using Zustand for
 * lightweight, performant state updates throughout the CRM application.
 * 
 * FEATURES:
 * - User state management (authentication status and user data)
 * - Loading state management for authentication flows
 * - Role-based helper methods for component conditional rendering
 * - Type-safe state operations with TypeScript
 * 
 * STATE STRUCTURE:
 * - user: Current authenticated user data or null if not authenticated
 * - loading: Boolean indicating if authentication state is being resolved
 * 
 * HELPER METHODS:
 * - Role checking methods (isAdmin, isManager, etc.) for component logic
 * - Direct state setters for user and loading states
 * 
 * USAGE:
 * Import useAuthStore hook in components to access authentication state
 * and use helper methods for role-based rendering and logic.
 * ===============================================================================
 */

import { create } from 'zustand';
import { User } from '../types';

/**
 * Authentication state interface defining the shape of auth-related state
 */
interface AuthState {
  user: User | null;                    // Current authenticated user or null
  loading: boolean;                     // Loading state for auth operations
  setUser: (user: User | null) => void; // Function to update user state
  setLoading: (loading: boolean) => void; // Function to update loading state
  
  // Role-based helper methods for conditional rendering and logic
  isAdmin: () => boolean;
  isManager: () => boolean;
  isAgent: () => boolean;
  isVerifier: () => boolean;
  isCoordinator: () => boolean;
  isFreelancer: () => boolean;
}

/**
 * Global authentication store using Zustand for lightweight state management
 * Provides user state, loading state, and role checking utilities
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  
  // State setters for updating authentication state
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  
  // Role checking helper methods for component logic
  isAdmin: () => get().user?.role === 'admin',
  isManager: () => get().user?.role === 'manager',
  isAgent: () => get().user?.role === 'agent',
  isVerifier: () => get().user?.role === 'verifier',
  isCoordinator: () => get().user?.role === 'coordinator',
  isFreelancer: () => get().user?.role === 'freelancer',
}));