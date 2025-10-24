import { ManagerPhoneNumbers } from '../../components/settings/ManagerPhoneNumbers';
import { useAuthStore } from '../../store/authStore';

export function Settings() {
  const { user } = useAuthStore();
  const isManager = user?.role === 'manager';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage your account settings and preferences.
          </p>
        </div>

        {isManager && (
          <div className="bg-white shadow rounded-lg p-6">
            <ManagerPhoneNumbers />
          </div>
        )}

        {/* Add other settings sections here */}
      </div>
    </div>
  );
} 