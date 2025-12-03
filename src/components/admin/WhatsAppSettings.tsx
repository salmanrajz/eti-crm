import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { 
  getWhatsAppVerificationEnabled, 
  updateWhatsAppVerificationEnabled,
  getWhatsAppCredentials,
  updateWhatsAppCredentials,
  getWhatsAppVerificationGroups,
  updateWhatsAppVerificationGroups,
  type WhatsAppCredentials,
  type WhatsAppVerificationGroupsConfig
} from '../../utils/configService';
import { clearRoutesCache } from '../../utils/whatsappRouter';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MessageSquare, 
  Save, 
  Loader2, 
  Eye, 
  EyeOff, 
  Lock, 
  Users, 
  XCircle,
  Bell,
  Sparkles,
  Zap,
  Check
} from 'lucide-react';

export function WhatsAppSettings() {
  const { user } = useAuthStore();
  const [whatsappEnabled, setWhatsappEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  // WhatsApp credentials state
  const [credentials, setCredentials] = useState<WhatsAppCredentials>({
    apiUrl: '',
    accessToken: '',
    phoneNumberId: ''
  });
  const [showAccessToken, setShowAccessToken] = useState(false);
  
  // WhatsApp verification groups state
  const [verificationGroups, setVerificationGroups] = useState<WhatsAppVerificationGroupsConfig>({
    G1: { businessPhoneId: '', accessToken: '', templateName: '', languageCode: 'en' },
    G2: { businessPhoneId: '', accessToken: '', templateName: '', languageCode: 'en' },
    G3: { businessPhoneId: '', accessToken: '', templateName: '', languageCode: 'en' },
    OTHER: { businessPhoneId: '', accessToken: '', templateName: '', languageCode: 'en' },
    languageCode: 'en'
  });
  const [showGroupTokens, setShowGroupTokens] = useState<Record<string, boolean>>({
    G1: false,
    G2: false,
    G3: false,
    OTHER: false
  });
  const [activeGroupTab, setActiveGroupTab] = useState<'G1' | 'G2' | 'G3' | 'OTHER' | 'MANAGER'>('G1');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [enabled, creds, groups] = await Promise.all([
        getWhatsAppVerificationEnabled(),
        getWhatsAppCredentials(),
        getWhatsAppVerificationGroups()
      ]);
      setWhatsappEnabled(enabled);
      setCredentials(creds);
      setVerificationGroups(groups);
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
      
      // Update WhatsApp verification setting, credentials, and verification groups
      await Promise.all([
        updateWhatsAppVerificationEnabled(whatsappEnabled, user.id),
        updateWhatsAppCredentials(credentials, user.id),
        updateWhatsAppVerificationGroups(verificationGroups, user.id)
      ]);
      
      // Clear the routes cache so new settings are immediately used
      clearRoutesCache();
      
      // Set saved state to show success in button
      setSaved(true);
      
      // Show success snackbar
      toast.success('WhatsApp settings updated successfully!', {
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
      
      // Reset saved state after 3 seconds
      setTimeout(() => {
        setSaved(false);
      }, 3000);
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
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-xl shadow-lg p-6"
      >
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h3>
          <p className="text-gray-600">You do not have permission to access these settings.</p>
        </div>
      </motion.div>
    );
  }

  if (loading) {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-white rounded-xl shadow-lg p-6"
      >
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <span className="ml-3 text-gray-600 font-medium">Loading settings...</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-xl shadow-xl overflow-hidden"
    >
      {/* Header with gradient */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <MessageSquare className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">WhatsApp Settings</h3>
              <p className="text-sm text-white/90 mt-0.5">
                Configure WhatsApp verification settings for lead creation
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center space-x-2 px-3 py-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-white" />
            <span className="text-sm font-medium text-white">Admin Panel</span>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* WhatsApp Verification Section with Manager Notifications */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100 shadow-sm"
        >
          <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2">
                <Zap className="h-5 w-5 text-indigo-600" />
                <h4 className="text-lg font-semibold text-gray-900">WhatsApp Verification</h4>
              </div>
            <p className="text-sm text-gray-600">
              Enable or disable the "Verify via WhatsApp" button in the create lead form
            </p>
          </div>
            
          <div className="ml-4">
              <label className="relative inline-flex items-center cursor-pointer group">
              <input
                type="checkbox"
                checked={whatsappEnabled}
                onChange={(e) => setWhatsappEnabled(e.target.checked)}
                className="sr-only peer"
              />
                <motion.div 
                  className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-indigo-600 peer-checked:to-purple-600 shadow-lg"
                  whileTap={{ scale: 0.95 }}
                />
            </label>
          </div>
          </div>
        </motion.div>

        {/* WhatsApp Verification Groups Section */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-100 shadow-sm"
        >
          <div className="flex items-center mb-4">
            <div className="p-2 bg-purple-100 rounded-lg mr-3">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h4 className="text-lg font-semibold text-gray-900">WhatsApp Verification Groups</h4>
              <p className="text-sm text-gray-600 mt-0.5">
                Configure credentials for each group (G1, G2, G3, OTHER) used for lead verification
              </p>
            </div>
          </div>

          {/* Modern Group Tabs */}
          <div className="bg-white/60 rounded-lg p-1 mb-6 border border-purple-200">
            <nav className="flex space-x-1" aria-label="Tabs">
              {(['G1', 'G2', 'G3', 'OTHER', 'MANAGER'] as const).map((group) => (
                <motion.button
                  key={group}
                  onClick={() => setActiveGroupTab(group)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`
                    flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all duration-200 relative
                    ${activeGroupTab === group
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-white/80'
                    }
                  `}
                >
                  {activeGroupTab === group && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 rounded-md"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center justify-center space-x-1">
                    {group === 'OTHER' ? 'Default' : group === 'MANAGER' ? (
                      <>
                        <Bell className="h-3.5 w-3.5" />
                        <span>Manager</span>
                      </>
                    ) : group}
                  </span>
                </motion.button>
              ))}
            </nav>
          </div>

          {/* Group Configuration Form */}
          <AnimatePresence mode="wait">
            {/* Manager Notifications Tab */}
            {activeGroupTab === 'MANAGER' && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="bg-white rounded-lg p-5 border border-purple-200 shadow-sm"
              >
                <div className="mb-5 pb-4 border-b border-gray-200">
                  <div className="flex items-center space-x-2 mb-2">
                    <Bell className="h-5 w-5 text-purple-600" />
                    <h5 className="text-base font-bold text-gray-900">Manager Notifications</h5>
                  </div>
                  <p className="text-xs text-gray-500">
                    Configure WhatsApp credentials for sending notifications to managers
                  </p>
                </div>

                <div className="space-y-4">
                  {/* API URL */}
                  <div>
                    <label htmlFor="manager-apiUrl" className="block text-sm font-medium text-gray-700 mb-2">
                      API URL
                    </label>
                    <input
                      type="url"
                      id="manager-apiUrl"
                      value={credentials.apiUrl}
                      onChange={(e) => setCredentials(prev => ({ ...prev, apiUrl: e.target.value }))}
                      placeholder="https://graph.facebook.com/v17.0/542227575631617/messages"
                      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 sm:text-sm px-3 py-2.5 border transition-all"
                    />
                  </div>

                  {/* Phone Number ID */}
                  <div>
                    <label htmlFor="manager-phoneNumberId" className="block text-sm font-medium text-gray-700 mb-2">
                      Phone Number ID
                    </label>
                    <input
                      type="text"
                      id="manager-phoneNumberId"
                      value={credentials.phoneNumberId}
                      onChange={(e) => setCredentials(prev => ({ ...prev, phoneNumberId: e.target.value }))}
                      placeholder="542227575631617"
                      className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 sm:text-sm px-3 py-2.5 border transition-all"
                    />
                  </div>

                  {/* Access Token */}
                  <div>
                    <label htmlFor="manager-accessToken" className="block text-sm font-medium text-gray-700 mb-2">
                      Access Token
                    </label>
                    <div className="relative">
                      <input
                        type={showAccessToken ? "text" : "password"}
                        id="manager-accessToken"
                        value={credentials.accessToken}
                        onChange={(e) => setCredentials(prev => ({ ...prev, accessToken: e.target.value }))}
                        placeholder="Enter WhatsApp Business API Access Token"
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 sm:text-sm px-3 py-2.5 pr-10 border transition-all"
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                        <motion.button
                          type="button"
                          onClick={() => setShowAccessToken(!showAccessToken)}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
                        >
                          {showAccessToken ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Group Configuration Forms */}
            {(['G1', 'G2', 'G3', 'OTHER'] as const).map((group) => (
              <motion.div
                key={group}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: activeGroupTab === group ? 1 : 0, x: activeGroupTab === group ? 0 : 20 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className={activeGroupTab === group ? 'block' : 'hidden'}
              >
                <div className="bg-white rounded-lg p-5 border border-purple-200 shadow-sm">
                  <div className="mb-5 pb-4 border-b border-gray-200">
                    <div>
                      <h5 className="text-base font-bold text-gray-900 mb-1">
                        {group === 'G1' && 'Connect Authorised Channel Partner of Etisalat'}
                        {group === 'G2' && 'Express Dial Authorised Channel Partner of Etisalat'}
                        {group === 'G3' && 'Telecon Authorised Channel Partner of Etisalat'}
                        {group === 'OTHER' && 'Default Group'}
                      </h5>
                      <p className="text-xs text-gray-500">
                        Configure credentials for {group === 'OTHER' ? 'default' : group.toLowerCase()} group verification
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {/* Business Phone ID */}
                    <div>
                      <label htmlFor={`${group}-phoneId`} className="block text-sm font-medium text-gray-700 mb-2">
                        Business Phone ID
                      </label>
                      <input
                        type="text"
                        id={`${group}-phoneId`}
                        value={verificationGroups[group].businessPhoneId}
                        onChange={(e) => setVerificationGroups(prev => ({
                          ...prev,
                          [group]: { ...prev[group], businessPhoneId: e.target.value }
                        }))}
                        placeholder="176399048891733"
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 sm:text-sm px-3 py-2.5 border transition-all"
                      />
                    </div>

                    {/* Access Token */}
                    <div>
                      <label htmlFor={`${group}-token`} className="block text-sm font-medium text-gray-700 mb-2">
                        Access Token
                      </label>
                      <div className="relative">
                        <input
                          type={showGroupTokens[group] ? "text" : "password"}
                          id={`${group}-token`}
                          value={verificationGroups[group].accessToken}
                          onChange={(e) => setVerificationGroups(prev => ({
                            ...prev,
                            [group]: { ...prev[group], accessToken: e.target.value }
                          }))}
                          placeholder="Enter WhatsApp Business API Access Token"
                          className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 sm:text-sm px-3 py-2.5 pr-10 border transition-all"
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                          <motion.button
                            type="button"
                            onClick={() => setShowGroupTokens(prev => ({ ...prev, [group]: !prev[group] }))}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
                          >
                            {showGroupTokens[group] ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </motion.button>
                        </div>
                      </div>
                    </div>

                    {/* Template Name */}
                    <div>
                      <label htmlFor={`${group}-template`} className="block text-sm font-medium text-gray-700 mb-2">
                        Template Name
                      </label>
                      <input
                        type="text"
                        id={`${group}-template`}
                        value={verificationGroups[group].templateName}
                        onChange={(e) => setVerificationGroups(prev => ({
                          ...prev,
                          [group]: { ...prev[group], templateName: e.target.value }
                        }))}
                        placeholder={group === 'OTHER' ? 'verification_default' : `verification_${group.toLowerCase()}`}
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 sm:text-sm px-3 py-2.5 border transition-all"
                      />
        </div>

                    {/* Language Code */}
                    <div>
                      <label htmlFor={`${group}-lang`} className="block text-sm font-medium text-gray-700 mb-2">
                        Language Code
                      </label>
                      <input
                        type="text"
                        id={`${group}-lang`}
                        value={verificationGroups[group].languageCode}
                        onChange={(e) => setVerificationGroups(prev => ({
                          ...prev,
                          [group]: { ...prev[group], languageCode: e.target.value }
                        }))}
                        placeholder="en"
                        className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 sm:text-sm px-3 py-2.5 border transition-all"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>

        {/* Modern Save Button */}
        <motion.div 
          className="flex justify-end pt-4 border-t border-gray-200"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <motion.button
            onClick={handleSave}
            disabled={saving || loading}
            whileHover={!saving && !loading && !saved ? { scale: 1.02 } : {}}
            whileTap={!saving && !loading && !saved ? { scale: 0.98 } : {}}
            className={`
              relative inline-flex items-center px-8 py-3.5 border border-transparent text-base font-semibold rounded-xl shadow-lg text-white focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-200 overflow-hidden group
              ${saving || loading
                ? 'bg-gray-400 cursor-not-allowed'
                : saved
                ? 'bg-gradient-to-r from-green-500 to-emerald-600 shadow-green-500/50'
                : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 focus:ring-indigo-500 shadow-indigo-500/50'
              }
            `}
          >
            {/* Shimmer effect */}
            {!saving && !loading && !saved && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                initial={{ x: '-100%' }}
                whileHover={{ x: '100%' }}
                transition={{ duration: 0.6, ease: 'easeInOut' }}
              />
            )}
            
            <AnimatePresence mode="wait">
            {saving ? (
                <motion.div
                  key="saving"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center space-x-2"
                >
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Saving Settings...</span>
                </motion.div>
            ) : loading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center space-x-2"
                >
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading...</span>
                </motion.div>
              ) : saved ? (
                <motion.div
                  key="saved"
                  initial={{ opacity: 0, scale: 0.8, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center space-x-2 relative z-10"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  >
                    <Check className="h-5 w-5" />
                  </motion.div>
                  <span>Saved!</span>
                </motion.div>
              ) : (
                <motion.div
                  key="save"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center space-x-2 relative z-10"
                >
                  <Save className="h-5 w-5 group-hover:rotate-12 transition-transform duration-300" />
                  <span>Save Settings</span>
                  <Sparkles className="h-4 w-4 group-hover:animate-pulse" />
                </motion.div>
            )}
            </AnimatePresence>
          </motion.button>
        </motion.div>
      </div>
    </motion.div>
  );
}