import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { 
  getWhatsAppVerificationEnabled, 
  updateWhatsAppVerificationEnabled,
  getWhatsAppCredentials,
  updateWhatsAppCredentials,
  getNumberActiveCheckEnabled,
  updateNumberActiveCheckEnabled,
  getWhatsAppFlowGroups,
  updateWhatsAppFlowGroups,
  getWhatsAppConversationCheck,
  updateWhatsAppConversationCheck,
  getForcedGroupEnabled,
  getForcedGroup,
  updateForcedGroupSettings,
  type WhatsAppCredentials,
  type WhatsAppFlowGroupsConfig,
  type WhatsAppConversationCheckConfig
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
  XCircle,
  Bell,
  Sparkles,
  Zap,
  Check
} from 'lucide-react';

export function WhatsAppSettings() {
  const { user } = useAuthStore();
  const [whatsappEnabled, setWhatsappEnabled] = useState<boolean>(true);
  const [numberActiveCheckEnabled, setNumberActiveCheckEnabled] = useState<boolean>(true);
  const [forcedGroupEnabled, setForcedGroupEnabled] = useState<boolean>(false);
  const [forcedGroup, setForcedGroup] = useState<string>('G1');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  // WhatsApp credentials state
  const [credentials, setCredentials] = useState<WhatsAppCredentials>({
    apiUrl: '',
    accessToken: '',
    phoneNumberId: ''
  });
  
  // WhatsApp flow configuration state
  const [flowGroups, setFlowGroups] = useState<WhatsAppFlowGroupsConfig>({
    G1: { url: '', key: '', flowId: '', arabicFlowId: '', channelName: '' },
    G2: { url: '', key: '', flowId: '', arabicFlowId: '', channelName: '' },
    G3: { url: '', key: '', flowId: '', arabicFlowId: '', channelName: '' },
    OTHER: { url: '', key: '', flowId: '', arabicFlowId: '', channelName: '' }
  });
  const [showFlowKeys, setShowFlowKeys] = useState<Record<string, boolean>>({
    G1: false,
    G2: false,
    G3: false,
    OTHER: false
  });
  const [activeFlowTab, setActiveFlowTab] = useState<'G1' | 'G2' | 'G3' | 'OTHER'>('G1');
  
  // WhatsApp conversation check configuration state
  const [conversationCheck, setConversationCheck] = useState<WhatsAppConversationCheckConfig>({
    url: '',
    key: '',
    channelName: ''
  });
  const [showConversationKey, setShowConversationKey] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [enabled, numberCheckEnabled, creds, flows, conversationCheckConfig, forcedGroupEnabledValue, forcedGroupValue] = await Promise.all([
        getWhatsAppVerificationEnabled(),
        getNumberActiveCheckEnabled(),
        getWhatsAppCredentials(),
        getWhatsAppFlowGroups(),
        getWhatsAppConversationCheck(),
        getForcedGroupEnabled(),
        getForcedGroup()
      ]);
      setWhatsappEnabled(enabled);
      setNumberActiveCheckEnabled(numberCheckEnabled);
      setCredentials(creds);
      setFlowGroups(flows);
      setConversationCheck(conversationCheckConfig);
      setForcedGroupEnabled(forcedGroupEnabledValue);
      setForcedGroup(forcedGroupValue || 'G1');
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
      
      // Update WhatsApp verification setting, number active check, credentials, flow groups, conversation check, and forced group settings
      await Promise.all([
        updateWhatsAppVerificationEnabled(whatsappEnabled, user.id),
        updateNumberActiveCheckEnabled(numberActiveCheckEnabled, user.id),
        updateWhatsAppCredentials(credentials, user.id),
        updateWhatsAppFlowGroups(flowGroups, user.id),
        updateWhatsAppConversationCheck(conversationCheck, user.id),
        updateForcedGroupSettings(forcedGroupEnabled, forcedGroupEnabled ? forcedGroup : null, user.id)
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

        {/* Number Active Check Section */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-gradient-to-br from-orange-50 to-red-50 rounded-xl p-6 border border-orange-100 shadow-sm"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2">
                <Bell className="h-5 w-5 text-orange-600" />
                <h4 className="text-lg font-semibold text-gray-900">Number Active Check</h4>
              </div>
              <p className="text-sm text-gray-600">
                Enable or disable the number active status check when creating leads. When enabled, users cannot add active numbers to leads.
              </p>
            </div>
            
            <div className="ml-4">
              <label className="relative inline-flex items-center cursor-pointer group">
                <input
                  type="checkbox"
                  checked={numberActiveCheckEnabled}
                  onChange={(e) => setNumberActiveCheckEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <motion.div 
                  className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-orange-600 peer-checked:to-red-600 shadow-lg"
                  whileTap={{ scale: 0.95 }}
                />
              </label>
            </div>
          </div>
        </motion.div>

        {/* Forced Group Assignment Section */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 border border-purple-100 shadow-sm"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2">
                <Zap className="h-5 w-5 text-purple-600" />
                <h4 className="text-lg font-semibold text-gray-900">Force Group Assignment</h4>
              </div>
              <p className="text-sm text-gray-600">
                When enabled, all new leads will be assigned to the selected group, regardless of the number's actual group. When disabled, leads use the number's actual group.
              </p>
            </div>
            
            <div className="ml-4">
              <label className="relative inline-flex items-center cursor-pointer group">
                <input
                  type="checkbox"
                  checked={forcedGroupEnabled}
                  onChange={(e) => setForcedGroupEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <motion.div 
                  className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-purple-600 peer-checked:to-indigo-600 shadow-lg"
                  whileTap={{ scale: 0.95 }}
                />
              </label>
            </div>
          </div>

          {forcedGroupEnabled && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Group to Force
              </label>
              <select
                value={forcedGroup}
                onChange={(e) => setForcedGroup(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-white"
              >
                <option value="G1">G1</option>
                <option value="G2">G2</option>
                <option value="G3">G3</option>
                <option value="OTHER">OTHER</option>
              </select>
              <p className="text-xs text-gray-500 mt-2">
                All new leads will be assigned to this group when created.
              </p>
            </div>
          )}
        </motion.div>

        {/* WhatsApp Flow Configuration Section */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl p-6 border border-teal-100 shadow-sm"
        >
          <div className="flex items-center mb-4">
            <div className="p-2 bg-teal-100 rounded-lg mr-3">
              <Zap className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <h4 className="text-lg font-semibold text-gray-900">WhatsApp Flow Configuration</h4>
              <p className="text-sm text-gray-600 mt-0.5">
                Configure flow settings (URL, Key, FlowID, ChannelName) for each group
              </p>
            </div>
          </div>

          {/* Group Tabs */}
          <div className="flex space-x-2 mb-4 border-b border-teal-200">
            {(['G1', 'G2', 'G3', 'OTHER'] as const).map((group) => (
              <button
                  key={group}
                onClick={() => setActiveFlowTab(group)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeFlowTab === group
                    ? 'text-teal-600 border-b-2 border-teal-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                >
                {group}
              </button>
              ))}
          </div>

          {/* Flow Configuration Form */}
                <div className="space-y-4">
                  <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Flow API URL
                    </label>
                    <input
                      type="url"
                value={flowGroups[activeFlowTab].url}
                onChange={(e) => setFlowGroups(prev => ({
                  ...prev,
                  [activeFlowTab]: { ...prev[activeFlowTab], url: e.target.value }
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="https://api.truvestuae.com/api/webhook/triggerFlowExternal"
                    />
                  </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showFlowKeys[activeFlowTab] ? 'text' : 'password'}
                  value={flowGroups[activeFlowTab].key}
                  onChange={(e) => setFlowGroups(prev => ({
                    ...prev,
                    [activeFlowTab]: { ...prev[activeFlowTab], key: e.target.value }
                  }))}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  placeholder="connectwithcrm"
                />
                <button
                  type="button"
                  onClick={() => setShowFlowKeys(prev => ({ ...prev, [activeFlowTab]: !prev[activeFlowTab] }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showFlowKeys[activeFlowTab] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

                  <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Flow ID (Default/English)
                    </label>
                    <input
                      type="text"
                value={flowGroups[activeFlowTab].flowId}
                onChange={(e) => setFlowGroups(prev => ({
                  ...prev,
                  [activeFlowTab]: { ...prev[activeFlowTab], flowId: e.target.value }
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="TestingBot2"
                    />
                  </div>

                  <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Arabic Flow ID
                    </label>
                      <input
                type="text"
                value={flowGroups[activeFlowTab].arabicFlowId || ''}
                onChange={(e) => setFlowGroups(prev => ({
                  ...prev,
                  [activeFlowTab]: { ...prev[activeFlowTab], arabicFlowId: e.target.value }
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="ArabicNewFlow"
              />
              <p className="mt-1 text-xs text-gray-500">
                Flow ID to use when language is Arabic. If not set, will use default Flow ID.
              </p>
                      </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Channel Name
              </label>
              <input
                type="text"
                value={flowGroups[activeFlowTab].channelName}
                onChange={(e) => setFlowGroups(prev => ({
                  ...prev,
                  [activeFlowTab]: { ...prev[activeFlowTab], channelName: e.target.value }
                }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                placeholder="Express Dial"
              />
                  </div>
                </div>
              </motion.div>

        {/* WhatsApp Conversation Check Configuration Section */}
              <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-xl p-6 border border-violet-100 shadow-sm"
        >
          <div className="flex items-center mb-4">
            <div className="p-2 bg-violet-100 rounded-lg mr-3">
              <MessageSquare className="h-5 w-5 text-violet-600" />
            </div>
                    <div>
              <h4 className="text-lg font-semibold text-gray-900">Conversation Check API</h4>
              <p className="text-sm text-gray-600 mt-0.5">
                Configure API settings for checking WhatsApp conversations (common to all groups)
                      </p>
                    </div>
                  </div>

          {/* Conversation Check Configuration Form */}
                  <div className="space-y-4">
                    <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API URL
                      </label>
                      <input
                type="url"
                value={conversationCheck.url}
                onChange={(e) => setConversationCheck(prev => ({ ...prev, url: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                placeholder="https://api.truvestuae.com/api/conversation/check"
                      />
                    </div>

                    <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Key
                      </label>
                      <div className="relative">
                        <input
                  type={showConversationKey ? 'text' : 'password'}
                  value={conversationCheck.key}
                  onChange={(e) => setConversationCheck(prev => ({ ...prev, key: e.target.value }))}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                  placeholder="connectwithcrm"
                />
                <button
                            type="button"
                  onClick={() => setShowConversationKey(!showConversationKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                          >
                  {showConversationKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                      </div>
                    </div>

                    <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Channel Name
                      </label>
                      <input
                        type="text"
                value={conversationCheck.channelName}
                onChange={(e) => setConversationCheck(prev => ({ ...prev, channelName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                placeholder="Express Dial"
                      />
                    </div>
                  </div>
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