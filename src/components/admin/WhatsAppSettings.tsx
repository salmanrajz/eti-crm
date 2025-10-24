import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { 
  getWhatsAppVerificationEnabled, 
  updateWhatsAppVerificationEnabled
} from '../../utils/configService';
import { toast } from 'react-hot-toast';
import { MessageSquare, Save, Loader2 } from 'lucide-react';

export function WhatsAppSettings() {
  const { user } = useAuthStore();
  const [whatsappEnabled, setWhatsappEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const enabled = await getWhatsAppVerificationEnabled();
      setWhatsappEnabled(enabled);
    } catch (error) {
      console.error('Error loading settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id) {
      toast.error('User not authenticated');
      return;
    }

    if (user?.role !== 'admin') {
      toast.error('Only admins can save settings');
      return;
    }

    try {
      setSaving(true);
      
      // Update WhatsApp verification setting
      await updateWhatsAppVerificationEnabled(whatsappEnabled, user.id);
      
      // Show success snackbar
      toast.success('WhatsApp verification settings updated successfully!', {
        duration: 4000,
        position: 'top-center',
        style: {
          background: '#10B981',
          color: '#fff',
          borderRadius: '8px',
          padding: '12px 16px',
          fontSize: '14px',
          fontWeight: '500',
        },
        icon: '✅',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error(`Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        duration: 5000,
        position: 'top-center',
        style: {
          background: '#EF4444',
          color: '#fff',
          borderRadius: '8px',
          padding: '12px 16px',
          fontSize: '14px',
          fontWeight: '500',
        },
        icon: '❌',
      });
    } finally {
      setSaving(false);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Access Denied</h3>
          <p className="text-gray-600">You do not have permission to access these settings.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
          <span className="ml-2 text-gray-600">Loading settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center">
          <MessageSquare className="h-6 w-6 text-indigo-600 mr-3" />
          <h3 className="text-lg font-medium text-gray-900">WhatsApp Settings</h3>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Enable or disable the WhatsApp verification button in lead creation
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* WhatsApp Verification Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h4 className="text-sm font-medium text-gray-900">WhatsApp Verification</h4>
            <p className="text-sm text-gray-600">
              Enable or disable the "Verify via WhatsApp" button in the create lead form
            </p>
          </div>
          <div className="ml-4">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={whatsappEnabled}
                onChange={(e) => setWhatsappEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>
        </div>


        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className={`inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 ${
              saving || loading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500 hover:shadow-md transform hover:-translate-y-0.5'
            }`}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
