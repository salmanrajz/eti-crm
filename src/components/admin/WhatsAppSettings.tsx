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
  Check,
  Key,
  Settings,
  Phone,
  ChevronRight,
  Shield,
} from 'lucide-react';

type MainTab = 'general' | 'notifications' | 'flow' | 'conversation';
type FlowGroup = 'G1' | 'G2' | 'G3' | 'OTHER';

const MAIN_TABS: { id: MainTab; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'general',      label: 'General',       icon: <Settings className="w-4 h-4" />,      color: 'indigo' },
  { id: 'notifications',label: 'Notifications', icon: <Bell className="w-4 h-4" />,           color: 'green'  },
  { id: 'flow',         label: 'Flow API',      icon: <Zap className="w-4 h-4" />,            color: 'teal'   },
  { id: 'conversation', label: 'Conv. Check',   icon: <MessageSquare className="w-4 h-4" />,  color: 'violet' },
];

const TAB_ACCENT: Record<MainTab, string> = {
  general:       'border-indigo-500 text-indigo-600 bg-indigo-50',
  notifications: 'border-green-500 text-green-600 bg-green-50',
  flow:          'border-teal-500 text-teal-600 bg-teal-50',
  conversation:  'border-violet-500 text-violet-600 bg-violet-50',
};

const INACTIVE_TAB = 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50';

const TOGGLE_ON_COLOR: Record<string, string> = {
  indigo: 'peer-checked:bg-indigo-500',
  orange: 'peer-checked:bg-orange-500',
  purple: 'peer-checked:bg-purple-500',
  green:  'peer-checked:bg-green-500',
  teal:   'peer-checked:bg-teal-500',
};

function Toggle({ checked, onChange, color = 'indigo' }: { checked: boolean; onChange: (v: boolean) => void; color?: string }) {
  const onColor = TOGGLE_ON_COLOR[color] ?? TOGGLE_ON_COLOR.indigo;
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
      <div className={`w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow ${onColor}`} />
    </label>
  );
}

function ToggleRow({ title, description, checked, onChange, color }: {
  title: string; description: string; checked: boolean; onChange: (v: boolean) => void; color?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
      </div>
      <div className="flex-shrink-0 pt-0.5">
        <Toggle checked={checked} onChange={onChange} color={color} />
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">{children}</label>;
}

function TextInput({ value, onChange, placeholder, type = 'text', mono = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all outline-none ${mono ? 'font-mono' : ''}`}
    />
  );
}

function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 pr-10 text-sm font-mono border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 transition-all outline-none"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

const tabVariants = {
  enter: { opacity: 0, y: 8 },
  center: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

export function WhatsAppSettings() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<MainTab>('general');
  const [activeFlowGroup, setActiveFlowGroup] = useState<FlowGroup>('G1');

  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [numberActiveCheckEnabled, setNumberActiveCheckEnabled] = useState(true);
  const [forcedGroupEnabled, setForcedGroupEnabled] = useState(false);
  const [forcedGroup, setForcedGroup] = useState('G1');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [credentials, setCredentials] = useState<WhatsAppCredentials>({ apiUrl: '', accessToken: '', phoneNumberId: '' });

  const [flowGroups, setFlowGroups] = useState<WhatsAppFlowGroupsConfig>({
    G1: { url: '', key: '', flowId: '', arabicFlowId: '', channelName: '' },
    G2: { url: '', key: '', flowId: '', arabicFlowId: '', channelName: '' },
    G3: { url: '', key: '', flowId: '', arabicFlowId: '', channelName: '' },
    OTHER: { url: '', key: '', flowId: '', arabicFlowId: '', channelName: '' },
  });

  const [conversationCheck, setConversationCheck] = useState<WhatsAppConversationCheckConfig>({ url: '', key: '', channelName: '' });

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [enabled, numberCheckEnabled, creds, flows, convCheck, fgEnabled, fgValue] = await Promise.all([
        getWhatsAppVerificationEnabled(),
        getNumberActiveCheckEnabled(),
        getWhatsAppCredentials(),
        getWhatsAppFlowGroups(),
        getWhatsAppConversationCheck(),
        getForcedGroupEnabled(),
        getForcedGroup(),
      ]);
      setWhatsappEnabled(enabled);
      setNumberActiveCheckEnabled(numberCheckEnabled);
      setCredentials(creds);
      setFlowGroups(flows);
      setConversationCheck(convCheck);
      setForcedGroupEnabled(fgEnabled);
      setForcedGroup(fgValue || 'G1');
    } catch {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user?.id || user.role !== 'admin') { toast.error('Admin access required'); return; }
    try {
      setSaving(true);
      await Promise.all([
        updateWhatsAppVerificationEnabled(whatsappEnabled, user.id),
        updateNumberActiveCheckEnabled(numberActiveCheckEnabled, user.id),
        updateWhatsAppCredentials(credentials, user.id),
        updateWhatsAppFlowGroups(flowGroups, user.id),
        updateWhatsAppConversationCheck(conversationCheck, user.id),
        updateForcedGroupSettings(forcedGroupEnabled, forcedGroupEnabled ? forcedGroup : null, user.id),
      ]);
      clearRoutesCache();
      setSaved(true);
      toast.success('Settings saved!');
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      toast.error(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <XCircle className="h-12 w-12 text-red-400 mb-3" />
        <h3 className="text-base font-semibold text-gray-800">Access Denied</h3>
        <p className="text-sm text-gray-500 mt-1">Only admins can view these settings.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
        <span className="ml-2.5 text-sm text-gray-500 font-medium">Loading settings…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 px-4 sm:px-6 py-4 sm:py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white leading-tight">WhatsApp Settings</h3>
              <p className="text-xs text-white/80 mt-0.5">Configure API credentials & verification</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/15 rounded-lg">
            <Shield className="w-3.5 h-3.5 text-white" />
            <span className="text-xs font-medium text-white hidden sm:inline">Admin</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex overflow-x-auto scrollbar-hide">
          {MAIN_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium border-b-2 whitespace-nowrap transition-all flex-shrink-0 ${
                activeTab === tab.id ? TAB_ACCENT[tab.id] : INACTIVE_TAB
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {activeTab === tab.id && (
                <ChevronRight className="w-3 h-3 opacity-50 hidden sm:inline" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            variants={tabVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="p-4 sm:p-6"
          >

            {/* ── GENERAL TAB ── */}
            {activeTab === 'general' && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Toggles</p>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50 px-4">
                  <ToggleRow
                    title="WhatsApp Verification"
                    description='Enables the "Verify via WhatsApp" button in the create lead form.'
                    checked={whatsappEnabled}
                    onChange={setWhatsappEnabled}
                    color="indigo"
                  />
                  <ToggleRow
                    title="Number Active Check"
                    description="Prevents agents from adding numbers that are already active in another lead."
                    checked={numberActiveCheckEnabled}
                    onChange={setNumberActiveCheckEnabled}
                    color="orange"
                  />
                  <ToggleRow
                    title="Force Group Assignment"
                    description="Overrides the number's group and assigns all new leads to a fixed group."
                    checked={forcedGroupEnabled}
                    onChange={setForcedGroupEnabled}
                    color="purple"
                  />
                </div>

                <AnimatePresence>
                  {forcedGroupEnabled && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-purple-50 border border-purple-100 rounded-2xl p-4 mt-2">
                        <FieldLabel>Forced Group</FieldLabel>
                        <div className="grid grid-cols-4 gap-2">
                          {(['G1', 'G2', 'G3', 'OTHER'] as const).map(g => (
                            <button
                              key={g}
                              onClick={() => setForcedGroup(g)}
                              className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${
                                forcedGroup === g
                                  ? 'bg-purple-600 text-white shadow-md shadow-purple-200'
                                  : 'bg-white text-gray-600 border border-gray-200 hover:border-purple-300'
                              }`}
                            >
                              {g}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-purple-600 mt-2.5">All new leads will be assigned to <strong>{forcedGroup}</strong>.</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* ── NOTIFICATIONS TAB ── */}
            {activeTab === 'notifications' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-1.5 bg-green-100 rounded-lg">
                    <Key className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Chat Notification Credentials</p>
                    <p className="text-xs text-gray-500">WhatsApp Graph API token for sending chatbox notifications to managers & admins.</p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
                  <div>
                    <FieldLabel>API URL</FieldLabel>
                    <TextInput
                      value={credentials.apiUrl}
                      onChange={v => setCredentials(p => ({ ...p, apiUrl: v }))}
                      placeholder="https://graph.facebook.com/v17.0/<phone-id>/messages"
                      type="url"
                    />
                  </div>
                  <div>
                    <FieldLabel>Access Token</FieldLabel>
                    <SecretInput
                      value={credentials.accessToken}
                      onChange={v => setCredentials(p => ({ ...p, accessToken: v }))}
                      placeholder="EAAxxxxxxx…"
                    />
                  </div>
                  <div>
                    <FieldLabel>Phone Number ID</FieldLabel>
                    <TextInput
                      value={credentials.phoneNumberId}
                      onChange={v => setCredentials(p => ({ ...p, phoneNumberId: v }))}
                      placeholder="542227575631617"
                      mono
                    />
                    <p className="text-xs text-gray-400 mt-1.5">Numeric ID from the Meta Business developer console.</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── FLOW API TAB ── */}
            {activeTab === 'flow' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-1.5 bg-teal-100 rounded-lg">
                    <Zap className="w-4 h-4 text-teal-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">WhatsApp Flow Configuration</p>
                    <p className="text-xs text-gray-500">Configure flow URL, key, and flow IDs per group.</p>
                  </div>
                </div>

                {/* Group pills */}
                <div className="flex gap-2">
                  {(['G1', 'G2', 'G3', 'OTHER'] as const).map(g => (
                    <button
                      key={g}
                      onClick={() => setActiveFlowGroup(g)}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                        activeFlowGroup === g
                          ? 'bg-teal-600 text-white shadow-md shadow-teal-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeFlowGroup}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                    className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4"
                  >
                    <div>
                      <FieldLabel>Flow API URL</FieldLabel>
                      <TextInput
                        value={flowGroups[activeFlowGroup].url}
                        onChange={v => setFlowGroups(p => ({ ...p, [activeFlowGroup]: { ...p[activeFlowGroup], url: v } }))}
                        placeholder="https://api.truvestuae.com/api/webhook/triggerFlowExternal"
                        type="url"
                      />
                    </div>
                    <div>
                      <FieldLabel>API Key</FieldLabel>
                      <SecretInput
                        value={flowGroups[activeFlowGroup].key}
                        onChange={v => setFlowGroups(p => ({ ...p, [activeFlowGroup]: { ...p[activeFlowGroup], key: v } }))}
                        placeholder="connectwithcrm"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <FieldLabel>Flow ID (English)</FieldLabel>
                        <TextInput
                          value={flowGroups[activeFlowGroup].flowId}
                          onChange={v => setFlowGroups(p => ({ ...p, [activeFlowGroup]: { ...p[activeFlowGroup], flowId: v } }))}
                          placeholder="TestingBot2"
                          mono
                        />
                      </div>
                      <div>
                        <FieldLabel>Arabic Flow ID</FieldLabel>
                        <TextInput
                          value={flowGroups[activeFlowGroup].arabicFlowId || ''}
                          onChange={v => setFlowGroups(p => ({ ...p, [activeFlowGroup]: { ...p[activeFlowGroup], arabicFlowId: v } }))}
                          placeholder="ArabicNewFlow"
                          mono
                        />
                      </div>
                    </div>
                    <div>
                      <FieldLabel>Channel Name</FieldLabel>
                      <TextInput
                        value={flowGroups[activeFlowGroup].channelName}
                        onChange={v => setFlowGroups(p => ({ ...p, [activeFlowGroup]: { ...p[activeFlowGroup], channelName: v } }))}
                        placeholder="Express Dial"
                      />
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            )}

            {/* ── CONVERSATION CHECK TAB ── */}
            {activeTab === 'conversation' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="p-1.5 bg-violet-100 rounded-lg">
                    <Phone className="w-4 h-4 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Conversation Check API</p>
                    <p className="text-xs text-gray-500">Shared API for checking WhatsApp conversation status across all groups.</p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
                  <div>
                    <FieldLabel>API URL</FieldLabel>
                    <TextInput
                      value={conversationCheck.url}
                      onChange={v => setConversationCheck(p => ({ ...p, url: v }))}
                      placeholder="https://api.truvestuae.com/api/conversation/check"
                      type="url"
                    />
                  </div>
                  <div>
                    <FieldLabel>API Key</FieldLabel>
                    <SecretInput
                      value={conversationCheck.key}
                      onChange={v => setConversationCheck(p => ({ ...p, key: v }))}
                      placeholder="connectwithcrm"
                    />
                  </div>
                  <div>
                    <FieldLabel>Channel Name</FieldLabel>
                    <TextInput
                      value={conversationCheck.channelName}
                      onChange={v => setConversationCheck(p => ({ ...p, channelName: v }))}
                      placeholder="Express Dial"
                    />
                  </div>
                </div>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      {/* Sticky Save Footer */}
      <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 sm:px-6 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <motion.button
          onClick={handleSave}
          disabled={saving || loading}
          whileHover={!saving && !saved ? { scale: 1.01 } : {}}
          whileTap={!saving && !saved ? { scale: 0.98 } : {}}
          className={`w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-semibold text-white shadow-md transition-all ${
            saving || loading
              ? 'bg-gray-300 cursor-not-allowed shadow-none'
              : saved
              ? 'bg-gradient-to-r from-green-500 to-emerald-500 shadow-green-200'
              : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 shadow-indigo-200 hover:shadow-lg'
          }`}
        >
          <AnimatePresence mode="wait">
            {saving ? (
              <motion.span key="saving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Saving…
              </motion.span>
            ) : saved ? (
              <motion.span key="saved" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                <Check className="w-4 h-4" /> Saved!
              </motion.span>
            ) : (
              <motion.span key="save" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2">
                <Save className="w-4 h-4" /> Save Settings <Sparkles className="w-3.5 h-3.5 opacity-70" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}
