import { memo } from 'react';
import { useAuthStore } from '../store/authStore';
import { AdminDashboard } from '../components/dashboards/AdminDashboard';
import { ManagerDashboard } from '../components/dashboards/ManagerDashboard';
import { AgentDashboard } from '../components/dashboards/AgentDashboard';
import { VerifierDashboard } from '../components/dashboards/VerifierDashboard';
import { CoordinatorDashboard } from '../components/dashboards/CoordinatorDashboard';

// ✅ OPTIMIZED: Memoized Dashboard component to prevent unnecessary re-renders
export const Dashboard = memo(function Dashboard() {
  const { user, isAdmin, isManager, isAgent, isVerifier, isCoordinator, isFreelancer } = useAuthStore();

  // ✅ OPTIMIZED: Early return pattern for better performance
  if (!user) return null;

  // ✅ OPTIMIZED: Role-based rendering with memoized components
  if (isCoordinator()) {
    return <CoordinatorDashboard user={user} />;
  }

  if (isVerifier()) {
    return <VerifierDashboard user={user} />;
  }

  if (isAdmin()) {
    return <AdminDashboard user={user} />;
  }

  if (isManager()) {
    return <ManagerDashboard user={user} />;
  }

  if (isAgent() || isFreelancer()) {
    return <AgentDashboard user={user} />;
  }

  return null;
});