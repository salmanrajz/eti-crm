import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Phone, CheckCircle, XCircle, AlertCircle, AlertTriangle, Loader2, Copy, Check, MessageCircle, MessageSquare, Shield } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { checkDNCNumber, checkMultipleDNCNumbers, DNCResult } from '../../utils/dncCheck';
import { useAuthStore } from '../../store/authStore';

interface DNCCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'single' | 'multiple';
}

export function DNCCheckModal({ isOpen, onClose, defaultTab = 'single' }: DNCCheckModalProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [multipleNumbers, setMultipleNumbers] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<DNCResult[]>([]);
  const [activeTab, setActiveTab] = useState<'single' | 'multiple'>(defaultTab);
  const [copiedNumber, setCopiedNumber] = useState<string | null>(null);
  
  const { user } = useAuthStore();

  // Update activeTab when defaultTab prop changes
  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const handleSingleCheck = async () => {
    if (!phoneNumber.trim()) {
      toast.error('Please enter a phone number');
      return;
    }

    setIsLoading(true);
    setResults([]);

    try {
      const result = await checkDNCNumber(phoneNumber.trim(), user?.id);
      setResults([result]);
      
      if (result.isDNC) {
        toast.error(`🚫 DNC BLOCKED: ${result.number} is in DNC database - DO NOT CALL`);
      } else if (result.exists) {
        toast.success(`✅ WhatsApp account found: ${result.formattedNumber} (NOT in DNC - Safe to call)`);
      } else if (result.error) {
        toast.error(`❌ ${result.error}`);
      } else {
        toast.error('❌ No WhatsApp account found');
      }
    } catch (error: any) {
      console.error('DNC Check Error:', error);
      
      let errorMessage = 'Failed to lookup number';
      if (error.response?.status === 500) {
        errorMessage = 'Invalid Number - No Numbers found for Calling';
      } else if (error.code === 'ERR_NETWORK') {
        errorMessage = 'Network error - Please check your connection or try again later';
      } else if (error.message?.includes('timeout')) {
        errorMessage = 'Request timeout - Please try again';
      }
      
      toast.error(errorMessage);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMultipleCheck = async () => {
    if (!multipleNumbers.trim()) {
      toast.error('Please enter phone numbers');
      return;
    }

    // Parse numbers (split by newline, comma, or space)
    const numbers = multipleNumbers
      .split(/[\n,\s]+/)
      .map(num => num.trim())
      .filter(num => num.length > 0);

    if (numbers.length === 0) {
      toast.error('Please enter valid phone numbers');
      return;
    }

    if (numbers.length > 300) {
      toast.error('Maximum 300 numbers allowed per batch');
      return;
    }

    setIsLoading(true);
    setResults([]);

    try {
      const results = await checkMultipleDNCNumbers(numbers, user?.id);
      setResults(results);
      
      const whatsappCount = results.filter(r => r.exists).length;
      const errorCount = results.filter(r => r.error).length;
      const noWhatsappCount = results.length - whatsappCount - errorCount;
      
      toast.success(
        `Looked up ${numbers.length} numbers: ${whatsappCount} WhatsApp accounts found, ${noWhatsappCount} no WhatsApp, ${errorCount} errors`
      );
    } catch (error: any) {
      console.error('DNC Check Error:', error);
      
      let errorMessage = 'Failed to lookup numbers';
      if (error.response?.status === 500) {
        errorMessage = 'Invalid Numbers - No Numbers found for Calling';
      } else if (error.code === 'ERR_NETWORK') {
        errorMessage = 'Network error - Please check your connection or try again later';
      } else if (error.message?.includes('timeout')) {
        errorMessage = 'Request timeout - Please try again';
      }
      
      toast.error(errorMessage);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedNumber(text);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopiedNumber(null), 2000);
    } catch (error) {
      toast.error('Failed to copy');
    }
  };

  const clearResults = () => {
    setResults([]);
    setPhoneNumber('');
    setMultipleNumbers('');
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="dnc-modal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-white/20 rounded-xl">
                  <Phone className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">WhatsApp Number Lookup</h2>
                  <p className="text-indigo-100 text-sm">Check WhatsApp account existence and DNC status</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>
          </div>


          {/* Tab Navigation */}
          <div className="border-b border-gray-200">
            <div className="flex">
              <button
                onClick={() => setActiveTab('single')}
                className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'single'
                    ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Single Lookup
              </button>
              <button
                onClick={() => setActiveTab('multiple')}
                className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'multiple'
                    ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Bulk Lookup
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 max-h-[calc(90vh-200px)] overflow-y-auto">
            
            {activeTab === 'single' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="e.g., +971501234567"
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                  />
                  
                </div>

                <button
                  onClick={handleSingleCheck}
                  disabled={isLoading || !phoneNumber.trim()}
                  className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white py-3 px-4 rounded-xl font-medium hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center space-x-2"
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Phone className="h-5 w-5" />
                  )}
                  <span>{isLoading ? 'Looking up...' : 'Lookup Number'}</span>
                </button>
              </div>
            )}

            {activeTab === 'multiple' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Numbers (one per line, comma, or space separated)
                  </label>
                  <textarea
                    value={multipleNumbers}
                    onChange={(e) => setMultipleNumbers(e.target.value)}
                    placeholder="+971501234567"
                    rows={6}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors resize-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Maximum 300 numbers per batch.
                  </p>
                </div>

                <button
                  onClick={handleMultipleCheck}
                  disabled={isLoading || !multipleNumbers.trim()}
                  className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white py-3 px-4 rounded-xl font-medium hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center space-x-2"
                >
                  {isLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Phone className="h-5 w-5" />
                  )}
                  <span>{isLoading ? 'Looking up...' : 'Lookup Numbers'}</span>
                </button>
              </div>
            )}


            {/* Results */}
            {results.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Results</h3>
                  <button
                    onClick={clearResults}
                    className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Clear Results
                  </button>
                </div>

                <div className="space-y-3 max-h-60 overflow-y-auto">
                  {results.map((result, index) => (
                    <motion.div
                      key={`${result.number || 'empty'}-${index}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`p-4 rounded-xl border-2 ${
                        result.exists
                          ? 'border-red-200 bg-red-50'
                          : result.error
                          ? 'border-orange-200 bg-orange-50'
                          : 'border-green-200 bg-green-50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-3">
                            {result.exists ? (
                              <XCircle className="h-5 w-5 text-red-500" />
                            ) : result.error ? (
                              <AlertCircle className="h-5 w-5 text-orange-500" />
                            ) : (
                              <CheckCircle className="h-5 w-5 text-green-500" />
                            )}
                            <span className="font-medium text-gray-900">
                              {result.number}
                            </span>
                          </div>
                          
                          {/* WhatsApp Account Status */}
                          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center space-x-2 mb-2">
                              <MessageCircle className="h-4 w-4 text-blue-600" />
                              <span className="text-sm font-medium text-blue-800">WhatsApp Account Status</span>
                            </div>
                            {result.whatsappApiNumber && result.whatsappApiNumber !== result.number && (
                              <div className="text-xs text-blue-600 mb-2">
                                Checked: {result.whatsappApiNumber}
                              </div>
                            )}
                            {result.isDNC ? (
                              <div className="flex items-center space-x-2">
                                <AlertTriangle className="h-4 w-4 text-orange-500" />
                                <span className="text-sm text-orange-700 font-medium">
                                  ⚠️ Number is in DNC - WhatsApp check skipped
                                </span>
                              </div>
                            ) : result.exists ? (
                              <div className="flex items-center space-x-2">
                                <MessageSquare className="h-4 w-4 text-green-600" />
                                <span className="text-sm text-green-700 font-medium">
                                  ✅ WhatsApp account exists
                                </span>
                              </div>
                            ) : result.error ? (
                              <div className="flex items-center space-x-2">
                                <XCircle className="h-4 w-4 text-gray-500" />
                                <span className="text-sm text-gray-600">
                                  ❓ Cannot verify WhatsApp account
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-2">
                                <XCircle className="h-4 w-4 text-red-500" />
                                <span className="text-sm text-red-700 font-medium">
                                  ❌ No WhatsApp account found
                                </span>
                              </div>
                            )}
                            
                            {result.formattedNumber && (
                              <div className="text-xs text-blue-600 mt-1">
                                WhatsApp ID: {result.formattedNumber}
                              </div>
                            )}
                          </div>
                          
                          {/* DNC Status */}
                          <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                            <div className="flex items-center space-x-2 mb-2">
                              <Shield className="h-4 w-4 text-gray-600" />
                              <span className="text-sm font-medium text-gray-800">DNC Status</span>
                            </div>
                           
                            {result.isDNC ? (
                              <div className="flex items-center space-x-2">
                                <XCircle className="h-4 w-4 text-red-500" />
                                <span className="text-sm text-red-700 font-medium">
                                  🚫 Number is in DNC database - DO NOT CALL
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-2">
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <span className="text-sm text-green-700 font-medium">
                                  ✅ Number is NOT in DNC database - Safe to call
                                </span>
                              </div>
                            )}
                          </div>
                          
                          {/* Number Pool Status */}
                          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="flex items-center space-x-2 mb-2">
                              <Phone className="h-4 w-4 text-blue-600" />
                              <span className="text-sm font-medium text-blue-800">Number Pool Status</span>
                            </div>
                            {result.inNumberPool ? (
                              <div className="flex items-center space-x-2">
                                <CheckCircle className="h-4 w-4 text-green-500" />
                                <span className="text-sm text-green-700 font-medium">
                                  ✅ Number is available in the number pool
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center space-x-2">
                                <AlertCircle className="h-4 w-4 text-orange-500" />
                                <span className="text-sm text-orange-600 font-medium">
                                  {result.numberPoolWarning || '⚠️ Number is not available in the number pool'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {(result.formattedNumber || result.number) && (
                          <button
                            onClick={() => copyToClipboard(result.formattedNumber || result.number)}
                            className="ml-3 p-2 text-gray-400 hover:text-gray-600 transition-colors"
                            title="Copy number"
                          >
                            {copiedNumber === (result.formattedNumber || result.number) ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>


        </motion.div>
      </motion.div>

    </AnimatePresence>
  );
}
