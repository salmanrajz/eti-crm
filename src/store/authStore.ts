import { create } from 'zustand';
import { User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  isAdmin: () => boolean;
  isManager: () => boolean;
  isAgent: () => boolean;
  isVerifier: () => boolean;
  isCoordinator: () => boolean;
  isFreelancer: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),
  isAdmin: () => get().user?.role === 'admin',
  isManager: () => get().user?.role === 'manager',
  isAgent: () => get().user?.role === 'agent',
  isVerifier: () => get().user?.role === 'verifier',
  isCoordinator: () => get().user?.role === 'coordinator',
  isFreelancer: () => get().user?.role === 'freelancer',
}));