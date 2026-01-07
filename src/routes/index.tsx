import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Login } from '../pages/Login';
import { Dashboard } from '../pages/Dashboard';
import { DashboardLayout } from '../components/layout/DashboardLayout';
import { NumberPool } from '../pages/numbers/NumberPool';
import { CreateLead } from '../components/Leads/CreateLead';
import { LeadList } from '../components/Leads/LeadList';
import { LeadDetails } from '../components/Leads/LeadDetails';
import { FirebaseIndexes } from '../components/setup/FirebaseIndexes';
import { UserManagement } from '../pages/admin/UserManagement';
import { NumberPoolUpload } from '../pages/admin/NumberPoolUpload';
import { TeamManagement } from '../pages/admin/TeamManagement';
import { BulkUserUpload } from '../pages/admin/BulkUserUpload';
import { Unauthorized } from '../pages/Unauthorized';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleBasedRoute } from '../components/auth/RoleBasedRoute';
import { Settings } from '../pages/settings/Settings';
import { AgentPerformance } from '../components/dashboards/AgentPerformance';
import { TeamPerformance } from '../components/dashboards/TeamPerformance';
import { ManagerDashboard } from '../components/dashboards/ManagerDashboard';
import { ModernLoading } from '../components/ModernLoading';
import { useMinimumLoading } from '../hooks/useMinimumLoading';
import { NumberLogsDashboard } from '../components/dashboards/NumberLogsDashboard';
import { LeadLogsDashboard } from '../components/dashboards/LeadLogsDashboard';
import { UserSessionLogsDashboard } from '../components/dashboards/UserSessionLogsDashboard';
import { Reports } from '../components/admin/Reports';
import { CustomerPortal } from '../pages/CustomerPortal';

export function AppRoutes() {
  const { user, loading } = useAuthStore();
  const location = useLocation();
  const isCustomerPortal = location.pathname.startsWith('/customer/');
  
  // Reduce minimum loading time to 800ms to prevent issues with Firebase init delays
  const showLoading = useMinimumLoading(loading, 800);

  // Skip loading animation on customer portal
  if (showLoading && !isCustomerPortal) {
    return <ModernLoading />;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <Login />}
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="numbers" element={<NumberPool />} />
        <Route path="leads" element={<LeadList />} />
        <Route
          path="leads/create"
          element={
            <RoleBasedRoute allowedRoles={['agent', 'freelancer', 'manager']}>
              <CreateLead />
            </RoleBasedRoute>
          }
        />
        <Route path="leads/:id" element={<LeadDetails />} />
        <Route path="setup/indexes" element={<FirebaseIndexes />} />
        <Route path="settings" element={<Settings />} />
        <Route
          path="performance"
          element={
            <RoleBasedRoute allowedRoles={['agent', 'freelancer']}>
              <AgentPerformance user={user!} />
            </RoleBasedRoute>
          }
        />
        <Route
          path="team-performance"
          element={
            <RoleBasedRoute allowedRoles={['agent', 'freelancer']}>
              <TeamPerformance user={user!} />
            </RoleBasedRoute>
          }
        />
        <Route
          path="bonus-management"
          element={
            <RoleBasedRoute allowedRoles={['manager']}>
              <ManagerDashboard user={user!} />
            </RoleBasedRoute>
          }
        />
        <Route
          path="admin"
          element={<Navigate to="/dashboard" replace />}
        />
        <Route
          path="admin/users"
          element={
            <RoleBasedRoute allowedRoles={['admin']}>
              <UserManagement />
            </RoleBasedRoute>
          }
        />
        <Route
          path="admin/users/bulk-upload"
          element={
            <RoleBasedRoute allowedRoles={['admin']}>
              <BulkUserUpload />
            </RoleBasedRoute>
          }
        />
        <Route
          path="admin/teams"
          element={
            <RoleBasedRoute allowedRoles={['admin']}>
              <TeamManagement />
            </RoleBasedRoute>
          }
        />
        <Route
          path="admin/numbers/upload"
          element={
            <RoleBasedRoute allowedRoles={['admin']}>
              <NumberPoolUpload />
            </RoleBasedRoute>
          }
        />
        <Route
          path="number-logs"
          element={
            <RoleBasedRoute allowedRoles={['admin']}>
              <NumberLogsDashboard />
            </RoleBasedRoute>
          }
        />
        <Route
          path="lead-logs"
          element={
            <RoleBasedRoute allowedRoles={['admin']}>
              <LeadLogsDashboard />
            </RoleBasedRoute>
          }
        />
        <Route
          path="user-session-logs"
          element={
            <RoleBasedRoute allowedRoles={['admin']}>
              <UserSessionLogsDashboard />
            </RoleBasedRoute>
          }
        />
        <Route
          path="admin/reports"
          element={
            <RoleBasedRoute allowedRoles={['admin']}>
              <Reports />
            </RoleBasedRoute>
          }
        />
      </Route>
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="/customer/:linkId" element={<CustomerPortal />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      {/* Catch-all route: redirect any unmatched paths to dashboard */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
