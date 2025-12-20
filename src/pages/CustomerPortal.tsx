/**
 * ===============================================================================
 * CUSTOMER PORTAL - PUBLIC CUSTOMER-FACING INTERFACE
 * ===============================================================================
 *
 * Premium customer portal where customers can:
 * - Search and select numbers from specified groups
 * - Select plans
 * - Enter customer details
 * - Submit lead information
 *
 * ===============================================================================
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, updateDoc, collection, addDoc, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AgentLink, NumberPool, Plan, Lead } from '../types';
import { unifiedSearch } from '../utils/unifiedSearch';
import { getPlans } from '../utils/planService';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Phone,
  CheckCircle,
  Loader2,
  ArrowRight,
  ChevronLeft,
  Shield,
  Zap,
  X,
  Smartphone,
  Check,
  ShoppingCart,
  AlertCircle,
  Key,
  Lock
} from 'lucide-react';
import { countryList } from '../utils/countries';
import clsx from 'clsx';

const uaeEmirates = [
  'Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'
];

interface SelectedNumber {
  numberId: string;
  number: string;
  plan: string;
  category: string;
  group?: string;
}

export function CustomerPortal() {
  const { linkId } = useParams<{ linkId: string }>();
  const navigate = useNavigate();

  const [agentLink, setAgentLink] = useState<AgentLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [enteredOTP, setEnteredOTP] = useState('');
  const [otpError, setOtpError] = useState('');
  const [step, setStep] = useState<'phone' | 'search' | 'plans' | 'details' | 'success'>('phone');

  const [enteredPhone, setEnteredPhone] = useState('');
  const [similarNumbers, setSimilarNumbers] = useState<NumberPool[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<NumberPool[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLastDoc, setSearchLastDoc] = useState<any>(null);
  const [selectedNumbers, setSelectedNumbers] = useState<SelectedNumber[]>([]);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlans, setSelectedPlans] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    customerNumber: '',
    customerAddress: '',
    country: 'AE',
    customerAge: '',
    gender: '',
    emirate: '',
    area: '',
    nationality: '',
    language: 'English',
    hasEmirateId: false,
    advancePayment: false,
  });

  useEffect(() => {
    loadAgentLink();
    loadPlans();
  }, [linkId]);

  const loadAgentLink = async () => {
    if (!linkId) {
      toast.error('Invalid link');
      navigate('/');
      return;
    }

    try {
      const q = query(
        collection(db, 'agentLinks'),
        where('linkId', '==', linkId),
        limit(1)
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        toast.error('Link not found or expired');
        navigate('/');
        return;
      }

      const linkDoc = snapshot.docs[0];
      const linkData = {
        id: linkDoc.id,
        ...linkDoc.data(),
        createdAt: linkDoc.data().createdAt?.toDate() || new Date(),
        updatedAt: linkDoc.data().updatedAt?.toDate() || new Date(),
        expiresAt: linkDoc.data().expiresAt?.toDate() || undefined,
        otpExpiresAt: linkDoc.data().otpExpiresAt?.toDate() || undefined,
        lastUsedAt: linkDoc.data().lastUsedAt?.toDate() || undefined,
      } as AgentLink;

      if (!linkData.isActive) {
        toast.error('This link is no longer active');
        navigate('/');
        return;
      }

      // Check if OTP is required
      if (linkData.otp) {
        // OTP is required, don't set otpVerified yet
        setAgentLink(linkData);
      } else {
        // No OTP required, allow access
        setAgentLink(linkData);
        setOtpVerified(true);
      }
    } catch (error) {
      console.error('Error loading link:', error);
      toast.error('Failed to load portal');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const loadPlans = async () => {
    try {
      const plansData = await getPlans();
      setPlans(plansData.filter(p => p.isActive));
    } catch (error) {
      console.error('Error loading plans:', error);
    }
  };

  const findSimilarNumbers = useCallback(async (phone: string) => {
    if (!phone.trim() || !agentLink) return;

    setIsSearching(true);
    try {
      const cleanPhone = phone.replace(/\D/g, '');
      const lastDigits = cleanPhone.slice(-5);
      const last4Digits = cleanPhone.slice(-4);
      const last3Digits = cleanPhone.slice(-3);

      const results: NumberPool[] = [];

      if (lastDigits.length >= 5) {
        const result5 = await unifiedSearch.search(lastDigits, {
          category: 'all',
          limit: 20,
          endsWith: true,
          statusFilter: 'open',
        });
        results.push(...result5.data);
      }

      if (last4Digits.length >= 4) {
        const result4 = await unifiedSearch.search(last4Digits, {
          category: 'all',
          limit: 20,
          endsWith: true,
          statusFilter: 'open',
        });
        results.push(...result4.data);
      }

      if (last3Digits.length >= 3) {
        const result3 = await unifiedSearch.search(last3Digits, {
          category: 'all',
          limit: 20,
          endsWith: true,
          statusFilter: 'open',
        });
        results.push(...result3.data);
      }

      const uniqueResults = Array.from(
        new Map(results.map(num => [num.id, num])).values()
      );

      const filtered = uniqueResults.filter(num =>
        agentLink.allowedGroups.includes(num.group || 'Standard') &&
        num.status === 'open'
      );

      filtered.sort((a, b) => {
        const aMatch = a.number.endsWith(lastDigits) ? 3 :
                      a.number.endsWith(last4Digits) ? 2 :
                      a.number.endsWith(last3Digits) ? 1 : 0;
        const bMatch = b.number.endsWith(lastDigits) ? 3 :
                      b.number.endsWith(last4Digits) ? 2 :
                      b.number.endsWith(last3Digits) ? 1 : 0;
        return bMatch - aMatch;
      });

      setSimilarNumbers(filtered.slice(0, 20));
    } catch (error) {
      console.error('Error finding similar numbers:', error);
    } finally {
      setIsSearching(false);
    }
  }, [agentLink]);

  const handleSearch = useCallback(async (loadMore: boolean = false, cursorDoc: any = null) => {
    if (!searchTerm.trim() || !agentLink) {
      setSearchResults([]);
      setSearchHasMore(false);
      setSearchLastDoc(null);
      return;
    }

    if (loadMore) {
      setIsLoadingMore(true);
    } else {
      setIsSearching(true);
      setSearchResults([]);
      setSearchLastDoc(null);
    }

    try {
      const result = await unifiedSearch.search(searchTerm, {
        category: 'all',
        limit: 50,
        startAfter: loadMore ? cursorDoc : null,
        statusFilter: 'open',
      });

      const filtered = result.data.filter(num =>
        agentLink.allowedGroups.includes(num.group || 'Standard') &&
        num.status === 'open'
      );

      if (loadMore) {
        setSearchResults(prev => [...prev, ...filtered]);
      } else {
        setSearchResults(filtered);
      }

      setSearchHasMore(result.hasMore || false);
      setSearchLastDoc(result.lastDoc || null);
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Search failed');
    } finally {
      setIsSearching(false);
      setIsLoadingMore(false);
    }
  }, [searchTerm, agentLink]);

  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && searchHasMore && searchLastDoc) {
      handleSearch(true, searchLastDoc);
    }
  }, [isLoadingMore, searchHasMore, searchLastDoc, handleSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm.trim().length >= 2) {
        handleSearch();
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, handleSearch]);

  const handlePhoneSubmit = async () => {
    if (!enteredPhone.trim() || enteredPhone.replace(/\D/g, '').length < 10) {
      toast.error('Please enter a valid phone number (05X XXX XXXX)');
      return;
    }

    const cleanPhone = enteredPhone.replace(/\D/g, '');
    setFormData(prev => ({ ...prev, customerPhone: cleanPhone }));

    await findSimilarNumbers(cleanPhone);

    setStep('search');
  };

  const getMatchingDigits = (number: string, enteredNumber: string) => {
    const entered = enteredNumber.replace(/\D/g, '');
    const numberDigits = number.replace(/\D/g, '');
    const matches = [];
    
    // Check from the end (last digits match first)
    for (let i = 1; i <= Math.min(entered.length, numberDigits.length); i++) {
      const enteredSuffix = entered.slice(-i);
      const numberSuffix = numberDigits.slice(-i);
      if (enteredSuffix === numberSuffix) {
        matches.push(i);
      } else {
        break;
      }
    }
    
    return matches.length > 0 ? matches[matches.length - 1] : 0;
  };

  const renderNumberWithHighlights = (number: string, enteredNumber: string) => {
    const numberDigits = number.replace(/\D/g, '');
    const matchingCount = getMatchingDigits(number, enteredNumber);
    
    if (matchingCount === 0) {
      return <span>{number}</span>;
    }
    
    // Simple approach: highlight the last N matching digits
    const result = [];
    let digitIndex = 0;
    
    for (let i = 0; i < number.length; i++) {
      const char = number[i];
      if (/\d/.test(char)) {
        digitIndex++;
        const isMatching = digitIndex > (numberDigits.length - matchingCount);
        if (isMatching) {
          result.push(
            <span key={i} className="bg-gradient-to-r from-amber-400 to-amber-500 text-white font-black px-0.5 rounded mr-0.5">
              {char}
            </span>
          );
        } else {
          result.push(<span key={i}>{char}</span>);
        }
      } else {
        result.push(<span key={i}>{char}</span>);
      }
    }
    
    return <>{result}</>;
  };

  const getCategoryColor = (category: string) => {
    const lowerCategory = category.toLowerCase();
    if (lowerCategory.includes('silver')) {
      return {
        text: 'text-slate-600',
        bg: 'bg-slate-200/80',
        border: 'border-slate-300/50'
      };
    } else if (lowerCategory.includes('gold')) {
      return {
        text: 'text-amber-700',
        bg: 'bg-amber-200/80',
        border: 'border-amber-300/50'
      };
    }
    return {
      text: 'text-orange-700',
      bg: 'bg-orange-100/80',
      border: 'border-orange-200/50'
    };
  };

  const handleSelectNumber = (number: NumberPool) => {
    const uniqueId = number.number;
    if (selectedNumbers.some(n => n.numberId === uniqueId)) {
      setSelectedNumbers(prev => prev.filter(n => n.numberId !== uniqueId));
      setSelectedPlans(prev => {
        const newPlans = { ...prev };
        delete newPlans[uniqueId];
        return newPlans;
      });
      return;
    }

    setSelectedNumbers(prev => [...prev, {
      numberId: uniqueId,
      number: number.number,
      plan: '',
      category: number.category || '',
      group: number.group,
    }]);
  };

  const handlePlanSelect = (numberId: string, planName: string) => {
    setSelectedPlans(prev => ({
      ...prev,
      [numberId]: planName,
    }));

    setSelectedNumbers(prev => prev.map(n =>
      n.numberId === numberId ? { ...n, plan: planName } : n
    ));
  };

  const handleContinueToPlans = async () => {
    setLoadingPlans(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    setStep('plans');
    setLoadingPlans(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedNumbers.length === 0) {
      toast.error('Please select at least one number');
      return;
    }

    const numbersWithoutPlans = selectedNumbers.filter(n => !selectedPlans[n.numberId]);
    if (numbersWithoutPlans.length > 0) {
      toast.error('Please select a plan for all numbers');
      return;
    }

    if (!formData.customerName || !formData.customerPhone || !formData.customerAddress) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!agentLink) return;

    setIsSubmitting(true);
    try {
      const leadData: Partial<Lead> & { nationality?: string } = {
        customerName: formData.customerName,
        customerPhone: formData.customerPhone,
        customerNumber: formData.customerNumber || formData.customerPhone,
        customerAddress: formData.customerAddress,
        country: formData.country,
        customerAge: parseInt(formData.customerAge) || 0,
        gender: formData.gender,
        emirate: formData.emirate,
        area: formData.area,
        nationality: formData.nationality,
        language: formData.language,
        hasEmirateId: formData.hasEmirateId,
        advancePayment: formData.advancePayment,
        plans: selectedNumbers.map(n => ({
          numberId: n.numberId,
          number: n.number,
          plan: selectedPlans[n.numberId],
          category: n.category,
          group: n.group || 'Standard',
          type: 'standard',
          status: 'pending_verification',
        })),
        agentId: agentLink.agentId,
        status: 'pending_verification',
        createdAt: new Date(),
        updatedAt: new Date(),
        startDate: new Date(),
        notes: 'Submitted via Customer Portal',
        followUpDate: new Date(),
        verificationNotes: '',
        coordinatorNotes: '',
        rejectionReason: '',
        numberType: '',
        remarks: 'Please Verify',
        sharedWith: [],
        latitude: 0,
        longitude: 0,
        locationUrl: '',
        confirmLocationUrl: false,
        startTime: '',
        productType: 'New Connection',
      };

      // Save to customer portal submissions collection instead of leads
      await addDoc(collection(db, 'customerPortalSubmissions'), {
        ...leadData,
        linkId: linkId,
        submittedAt: new Date(),
        status: 'pending', // pending, reviewed, converted
      });

      if (agentLink.id) {
        await updateDoc(doc(db, 'agentLinks', agentLink.id), {
          usageCount: (agentLink.usageCount || 0) + 1,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        });
      }

      setStep('success');
      toast.success('Your request has been submitted successfully!');
    } catch (error) {
      console.error('Error submitting lead:', error);
      toast.error('Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50 to-amber-50 flex items-center justify-center">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-16 h-16 border-4 border-slate-200 border-t-orange-500 rounded-full mx-auto mb-4"
          />
          <p className="text-slate-600 font-medium">Loading your experience...</p>
        </div>
      </div>
    );
  }

  const handleOTPSubmit = () => {
    if (!agentLink?.otp) {
      setOtpError('OTP is required to access this portal');
      return;
    }

    if (enteredOTP.trim() === '') {
      setOtpError('Please enter the OTP');
      return;
    }

    // Check if OTP is expired
    if (agentLink.otpExpiresAt) {
      const now = new Date();
      const expiresAt = new Date(agentLink.otpExpiresAt);
      if (now > expiresAt) {
        setOtpError('OTP has expired. Please contact the agent for a new OTP.');
        setEnteredOTP('');
        return;
      }
    }

    if (enteredOTP.trim() !== agentLink.otp) {
      setOtpError('Invalid OTP. Please check and try again.');
      setEnteredOTP('');
      return;
    }

    setOtpVerified(true);
    setOtpError('');
    toast.success('Access granted!');
  };

  if (!agentLink) return null;

  // Show OTP verification screen if OTP is required and not verified
  if (agentLink.otp && !otpVerified) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50 to-amber-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <div className="relative bg-white/70 backdrop-blur-2xl rounded-2xl sm:rounded-3xl border border-white/60 shadow-xl sm:shadow-2xl overflow-hidden">
            {/* Gradient border effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/20 via-amber-500/20 to-orange-500/20 rounded-2xl sm:rounded-3xl p-[1px]">
              <div className="h-full w-full bg-white/70 backdrop-blur-2xl rounded-2xl sm:rounded-3xl" />
            </div>
            
            <div className="relative p-6 sm:p-8 md:p-10">
              {/* Icon Section */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="flex justify-center mb-6"
              >
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-400 to-amber-500 rounded-full blur-2xl opacity-60 animate-pulse" />
                  <div className="relative w-20 h-20 sm:w-24 sm:h-24 bg-gradient-to-br from-orange-500 via-orange-400 to-amber-500 rounded-2xl sm:rounded-3xl flex items-center justify-center shadow-xl shadow-orange-500/50">
                    <Lock className="w-10 h-10 sm:w-12 sm:h-12 text-white" strokeWidth={2.5} />
                    <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent rounded-2xl sm:rounded-3xl" />
                  </div>
                </div>
              </motion.div>

              {/* Title and Description */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-center mb-6"
              >
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900 mb-2">
                  Enter Access Code
                </h2>
                <p className="text-gray-600 text-sm sm:text-base font-medium">
                  Please enter the OTP provided by our sales agent to access the portal
                </p>
              </motion.div>

              {/* OTP Input Section */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 }}
                className="mb-6"
              >
                <div className="flex justify-center gap-2 sm:gap-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.5, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ 
                        delay: 0.5 + index * 0.05, 
                        type: "spring", 
                        stiffness: 300,
                        damping: 20
                      }}
                      className="relative"
                    >
                      <input
                        id={`otp-${index}`}
                        type="tel"
                        maxLength={1}
                        value={enteredOTP[index] || ''}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          if (!val && e.target.value) return;

                          const newOTP = enteredOTP.split('');
                          newOTP[index] = val;
                          const newOTPStr = newOTP.join('').slice(0, 6);
                          setEnteredOTP(newOTPStr);
                          setOtpError('');

                          if (val && index < 5) {
                            const nextInput = document.getElementById(`otp-${index + 1}`);
                            nextInput?.focus();
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && !enteredOTP[index] && index > 0) {
                            const prevInput = document.getElementById(`otp-${index - 1}`);
                            prevInput?.focus();

                            const newOTP = enteredOTP.split('');
                            newOTP[index - 1] = '';
                            setEnteredOTP(newOTP.join(''));
                          }
                        }}
                        className={clsx(
                          "w-12 h-14 sm:w-14 sm:h-16 md:w-16 md:h-20 text-center text-2xl sm:text-3xl font-black rounded-xl sm:rounded-2xl outline-none transition-all duration-300 relative border-[3px]",
                          enteredOTP[index]
                            ? "bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/40 border-orange-400"
                            : "bg-white border-gray-300 focus:border-orange-500 focus:bg-white focus:shadow-lg"
                        )}
                      />
                      {!enteredOTP[index] && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                          <span className="text-2xl sm:text-3xl font-black text-gray-300 select-none">
                            •
                          </span>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
                {otpError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 text-center"
                  >
                    <p className="text-red-600 text-sm font-semibold flex items-center justify-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      {otpError}
                    </p>
                  </motion.div>
                )}
              </motion.div>

              {/* Submit Button */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="flex justify-center"
              >
                <motion.button
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleOTPSubmit}
                  disabled={enteredOTP.length < 6}
                  className="relative group overflow-hidden"
                  style={{ maxWidth: '280px', width: '100%' }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 rounded-xl sm:rounded-2xl shadow-xl shadow-orange-500/40" />
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 rounded-xl sm:rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                  
                  <div className="relative py-3 sm:py-3.5 md:py-4 rounded-xl sm:rounded-2xl font-black text-sm sm:text-base md:text-lg text-white flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed px-6 sm:px-8">
                    <Key className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>Verify & Access</span>
                    <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </motion.button>
              </motion.div>

              {/* Info Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="mt-6 bg-orange-50/80 rounded-xl border border-orange-200/60 p-4"
              >
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-gray-800 mb-1">
                      Secure Access
                    </p>
                    <p className="text-xs text-gray-600">
                      This portal is protected. Please contact our sales agent if you don't have the access code.
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .safe-area-inset {
          padding-top: env(safe-area-inset-top);
          padding-bottom: env(safe-area-inset-bottom);
        }
        .h-safe-top {
          height: env(safe-area-inset-top, 0px);
        }
        .pb-safe-bottom {
          padding-bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
        }
      `}</style>
      <div className="min-h-screen bg-white relative overflow-hidden">
        {/* Native-like status bar area */}
        <div className="h-safe-top bg-white" />
      
      {/* Native app container - full width */}
      <div className="relative z-10 w-full min-h-screen flex flex-col">

        {/* Native-like header */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="sticky top-0 z-50 bg-white border-b border-gray-100"
        >
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {step !== 'phone' && step !== 'success' && (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    if (step === 'search') setStep('phone');
                    if (step === 'plans') setStep('search');
                    if (step === 'details') setStep('plans');
                  }}
                  className="w-10 h-10 -ml-2 flex items-center justify-center rounded-full active:bg-gray-100"
                >
                  <ChevronLeft className="w-6 h-6 text-gray-700" strokeWidth={2} />
                </motion.button>
              )}
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-white" strokeWidth={2.5} />
                </div>
                <div>
                  <h1 className="font-bold text-lg text-gray-900">Premium Select</h1>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Content area with safe padding */}
        <div className="flex-1 px-4 pb-safe-bottom flex flex-col overflow-y-auto">
          <AnimatePresence mode="wait">

            {step === 'phone' && (
              <motion.div
                key="phone"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="flex flex-col flex-1 justify-center relative py-2 sm:py-4 md:py-6"
              >
                {/* Main Content Card - Glass Morphism */}
                <motion.div
                  initial={{ opacity: 0, y: 30, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 100 }}
                  className="relative z-10"
                >
                  <div className="relative">
                    {/* Glass morphism card */}
                    <div className="relative bg-white/70 backdrop-blur-2xl rounded-2xl sm:rounded-3xl border border-white/60 shadow-xl sm:shadow-2xl overflow-hidden">
                      {/* Gradient border effect */}
                      <div className="absolute inset-0 bg-gradient-to-br from-orange-500/20 via-amber-500/20 to-orange-500/20 rounded-2xl sm:rounded-3xl p-[1px]">
                        <div className="h-full w-full bg-white/70 backdrop-blur-2xl rounded-2xl sm:rounded-3xl" />
                      </div>
                      
                      <div className="relative p-4 sm:p-6 md:p-8 lg:p-10 pb-6 sm:pb-8 md:pb-10">
                        {/* Large Icon Section */}
                        <motion.div
                          initial={{ scale: 0, rotate: -180 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
                          className="flex justify-center mb-5 sm:mb-6 md:mb-8"
                        >
                          <div className="relative">
                            {/* Glowing background circle */}
                            <div className="absolute inset-0 bg-gradient-to-br from-orange-400 to-amber-500 rounded-full blur-2xl opacity-60 animate-pulse" />
                            {/* Icon container */}
                            <div className="relative w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 lg:w-32 lg:h-32 bg-gradient-to-br from-orange-500 via-orange-400 to-amber-500 rounded-2xl sm:rounded-3xl flex items-center justify-center shadow-xl sm:shadow-2xl shadow-orange-500/50">
                              <Phone className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 text-white" strokeWidth={2.5} />
                              {/* Shine effect */}
                              <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent rounded-2xl sm:rounded-3xl" />
                            </div>
                          </div>
                        </motion.div>

                        {/* Title and Description */}
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.4 }}
                          className="text-center mb-5 sm:mb-6 md:mb-7"
                        >
                          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-gray-900 mb-1.5 sm:mb-2 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 bg-clip-text text-transparent">
                            Enter Your Number
                          </h2>
                          <p className="text-gray-600 text-xs sm:text-sm md:text-base lg:text-lg font-medium max-w-md mx-auto leading-relaxed px-2">
                            We'll find the perfect number matches for you
                          </p>
                        </motion.div>

                        {/* Phone Input Section */}
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.5 }}
                          className="mb-5 sm:mb-6 md:mb-7"
                        >
                          <div className="flex justify-center items-center gap-1 sm:gap-1.5 md:gap-2 lg:gap-2.5 flex-nowrap w-full px-1 sm:px-2">
                            {Array.from({ length: 10 }).map((_, index) => {
                              const formatLabels = ['0', '5', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X'];
                              const showSeparator = index === 2 || index === 5;
                              return (
                                <motion.div
                                  key={index}
                                  initial={{ opacity: 0, scale: 0.5, y: 20 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  transition={{ 
                                    delay: 0.6 + index * 0.04, 
                                    type: "spring", 
                                    stiffness: 300,
                                    damping: 20
                                  }}
                                  className="relative flex-shrink-0 overflow-visible"
                                >
                                  {showSeparator && index === 2 && (
                                    <div className="absolute -left-1 sm:-left-1.5 md:-left-2 top-1/2 -translate-y-1/2 text-gray-300 text-xs sm:text-sm md:text-base lg:text-lg font-bold z-10">-</div>
                                  )}
                                  {showSeparator && index === 5 && (
                                    <div className="absolute -left-1 sm:-left-1.5 md:-left-2 top-1/2 -translate-y-1/2 text-gray-300 text-xs sm:text-sm md:text-base lg:text-lg font-bold z-10">-</div>
                                  )}
                                  <div className="relative p-0.5 sm:p-1">
                                    <input
                                      id={`digit-${index}`}
                                      type="tel"
                                      maxLength={1}
                                      value={enteredPhone[index] || ''}
                                      onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '');
                                        if (!val && e.target.value) return;

                                        const newPhone = enteredPhone.split('');
                                        newPhone[index] = val;
                                        const newPhoneStr = newPhone.join('').slice(0, 10);
                                        setEnteredPhone(newPhoneStr);

                                        if (val && index < 9) {
                                          const nextInput = document.getElementById(`digit-${index + 1}`);
                                          nextInput?.focus();
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Backspace' && !enteredPhone[index] && index > 0) {
                                          const prevInput = document.getElementById(`digit-${index - 1}`);
                                          prevInput?.focus();

                                          const newPhone = enteredPhone.split('');
                                          newPhone[index - 1] = '';
                                          setEnteredPhone(newPhone.join(''));
                                        }
                                      }}
                                      className={clsx(
                                        "w-6 h-9 sm:w-7 sm:h-11 md:w-9 md:h-14 lg:w-11 lg:h-16 xl:w-13 xl:h-20 text-center text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl font-black rounded-md sm:rounded-lg md:rounded-xl outline-none transition-all duration-300 relative border-2 sm:border-[3px]",
                                        enteredPhone[index]
                                          ? "bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg sm:shadow-xl shadow-orange-500/40 border-orange-400"
                                          : "bg-white border-gray-300 focus:border-orange-500 focus:bg-white focus:shadow-lg text-transparent"
                                      )}
                                    />
                                    {!enteredPhone[index] && (
                                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                                        <span className="text-sm sm:text-base md:text-lg lg:text-xl xl:text-2xl font-black text-gray-300 select-none">
                                          {formatLabels[index]}
                                        </span>
                                      </div>
                                    )}
                                    {enteredPhone[index] && (
                                      <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent rounded-lg sm:rounded-xl md:rounded-2xl pointer-events-none"
                                      />
                                    )}
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </motion.div>

                        {/* Submit Button */}
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.7 }}
                          className="mb-5 sm:mb-6 md:mb-7 flex justify-center"
                        >
                          <motion.button
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handlePhoneSubmit}
                            disabled={enteredPhone.length < 10 || isSearching}
                            className="relative group overflow-hidden w-full max-w-[240px] sm:max-w-[260px] md:max-w-[280px]"
                          >
                            {/* Button background with glass morphism */}
                            <div className="absolute inset-0 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 rounded-xl sm:rounded-2xl shadow-xl sm:shadow-2xl shadow-orange-500/40" />
                            <div className="absolute inset-0 bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 rounded-xl sm:rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                            
                            {/* Shine effect */}
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                            
                            {/* Button content */}
                            <div className="relative py-2.5 sm:py-3 md:py-3.5 lg:py-4 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm md:text-base lg:text-lg text-white flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed px-5 sm:px-6 md:px-8">
                              {isSearching ? (
                                <>
                                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                                  <span className="text-xs sm:text-sm">Finding numbers...</span>
                                </>
                              ) : (
                                <>
                                  <span>Find Perfect Numbers</span>
                                  <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
                                </>
                              )}
                            </div>
                          </motion.button>
                        </motion.div>

                        {/* Information Cards - Moved below button */}
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.8 }}
                          className="grid grid-cols-3 gap-1.5 sm:gap-2 md:gap-3 lg:gap-4"
                        >
                          {/* Feature Card 1 */}
                          <div className="relative rounded-lg sm:rounded-xl md:rounded-2xl border border-orange-400/40 p-3 sm:p-3.5 md:p-4 shadow-lg overflow-hidden backdrop-blur-2xl min-h-[90px] sm:min-h-[100px] md:min-h-[110px] flex flex-col justify-center"
                            style={{
                              background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(251, 191, 36, 0.15) 100%)',
                            }}
                          >
                            {/* Glass morphism overlays */}
                            <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-white/10 to-transparent rounded-lg sm:rounded-xl md:rounded-2xl pointer-events-none" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent rounded-lg sm:rounded-xl md:rounded-2xl pointer-events-none" />
                            <div className="absolute inset-0 rounded-lg sm:rounded-xl md:rounded-2xl border border-white/30 pointer-events-none" />
                            
                            <div className="relative z-10 flex flex-col items-center text-center gap-1.5 sm:gap-2 justify-center h-full">
                              <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg flex-shrink-0 mb-0.5">
                                <Zap className="w-4 h-4 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5 text-white" />
                              </div>
                              <h3 className="font-bold text-gray-900 text-xs sm:text-xs md:text-sm leading-tight">Instant Search</h3>
                              <p className="text-[10px] sm:text-[10px] md:text-xs text-gray-700 leading-tight px-0.5">
                                Find similar numbers instantly
                              </p>
                            </div>
                          </div>

                          {/* Feature Card 2 */}
                          <div className="relative rounded-lg sm:rounded-xl md:rounded-2xl border border-orange-400/40 p-3 sm:p-3.5 md:p-4 shadow-lg overflow-hidden backdrop-blur-2xl min-h-[90px] sm:min-h-[100px] md:min-h-[110px] flex flex-col justify-center"
                            style={{
                              background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(251, 191, 36, 0.15) 100%)',
                            }}
                          >
                            {/* Glass morphism overlays */}
                            <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-white/10 to-transparent rounded-lg sm:rounded-xl md:rounded-2xl pointer-events-none" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent rounded-lg sm:rounded-xl md:rounded-2xl pointer-events-none" />
                            <div className="absolute inset-0 rounded-lg sm:rounded-xl md:rounded-2xl border border-white/30 pointer-events-none" />
                            
                            <div className="relative z-10 flex flex-col items-center text-center gap-1.5 sm:gap-2 justify-center h-full">
                              <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg flex-shrink-0 mb-0.5">
                                <Shield className="w-4 h-4 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5 text-white" />
                              </div>
                              <h3 className="font-bold text-gray-900 text-xs sm:text-xs md:text-sm leading-tight">Secure & Safe</h3>
                              <p className="text-[10px] sm:text-[10px] md:text-xs text-gray-700 leading-tight px-0.5">
                                Your data is protected
                              </p>
                            </div>
                          </div>

                          {/* Feature Card 3 */}
                          <div className="relative rounded-lg sm:rounded-xl md:rounded-2xl border border-orange-400/40 p-3 sm:p-3.5 md:p-4 shadow-lg overflow-hidden backdrop-blur-2xl min-h-[90px] sm:min-h-[100px] md:min-h-[110px] flex flex-col justify-center"
                            style={{
                              background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15) 0%, rgba(251, 191, 36, 0.15) 100%)',
                            }}
                          >
                            {/* Glass morphism overlays */}
                            <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-white/10 to-transparent rounded-lg sm:rounded-xl md:rounded-2xl pointer-events-none" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent rounded-lg sm:rounded-xl md:rounded-2xl pointer-events-none" />
                            <div className="absolute inset-0 rounded-lg sm:rounded-xl md:rounded-2xl border border-white/30 pointer-events-none" />
                            
                            <div className="relative z-10 flex flex-col items-center text-center gap-1.5 sm:gap-2 justify-center h-full">
                              <div className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg flex-shrink-0 mb-0.5">
                                <CheckCircle className="w-4 h-4 sm:w-4.5 sm:h-4.5 md:w-5 md:h-5 text-white" />
                              </div>
                              <h3 className="font-bold text-gray-900 text-xs sm:text-xs md:text-sm leading-tight">Best Matches</h3>
                              <p className="text-[10px] sm:text-[10px] md:text-xs text-gray-700 leading-tight px-0.5">
                                Curated recommendations
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}

            {step === 'search' && (
              <motion.div
                key="search"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4 pb-20"
              >
                <div className="bg-gray-50 rounded-2xl p-3 border border-gray-100">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search for Any other number of your choice."
                      className="w-full bg-white pl-11 pr-4 py-3.5 rounded-xl text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 font-medium text-base"
                    />
                    {isSearching && (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="absolute right-4 top-1/2 -translate-y-1/2"
                      >
                        <Loader2 className="w-5 h-5 text-orange-500" />
                      </motion.div>
                    )}
                  </div>
                </div>


                {!isSearching && !searchTerm && similarNumbers.length > 0 && (
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-gray-900 mb-3 sm:mb-4 lg:mb-5 uppercase tracking-wide">Recommended</h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
                      {similarNumbers.map((num, i) => {
                        const isSelected = selectedNumbers.some(n => n.numberId === num.id);
                        return (
                          <motion.button
                            key={num.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleSelectNumber(num)}
                            className={clsx(
                              "relative p-2.5 sm:p-3 lg:p-4 rounded-lg sm:rounded-xl lg:rounded-2xl border transition-all duration-300 group overflow-hidden backdrop-blur-2xl",
                              isSelected
                                ? "bg-gradient-to-br from-orange-500/90 to-amber-500/90 border-orange-400/60 shadow-2xl shadow-orange-500/40"
                                : "bg-white/60 border-white/40 hover:border-orange-400/60 hover:shadow-2xl shadow-lg"
                            )}
                            style={{
                              boxShadow: isSelected 
                                ? '0 20px 25px -5px rgba(249, 115, 22, 0.3), 0 10px 10px -5px rgba(249, 115, 22, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
                                : '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.5)'
                            }}
                          >
                            {/* Glass morphism overlay - top shine */}
                            <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-white/10 to-transparent rounded-lg sm:rounded-xl lg:rounded-2xl pointer-events-none" />
                            
                            {/* Glass morphism overlay - bottom depth */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent rounded-lg sm:rounded-xl lg:rounded-2xl pointer-events-none" />
                            
                            {/* 3D border effect */}
                            <div className="absolute inset-0 rounded-lg sm:rounded-xl lg:rounded-2xl border border-white/30 pointer-events-none" />
                            
                            {/* Shine effect on hover */}
                            {!isSelected && (
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 rounded-lg sm:rounded-xl lg:rounded-2xl" />
                            )}
                            
                            {/* Content */}
                            <div className="relative z-10 flex flex-col items-center justify-center min-h-[80px] sm:min-h-[100px] lg:min-h-[120px]">
                              {/* Number with highlighted matching digits */}
                              <div className="mb-1.5 sm:mb-2 lg:mb-3">
                                <span className={clsx(
                                  "block text-base sm:text-lg md:text-xl lg:text-2xl font-black font-mono tracking-wide text-center",
                                  isSelected ? "text-white" : "text-gray-900"
                                )}>
                                  {renderNumberWithHighlights(num.number, enteredPhone)}
                                </span>
                              </div>
                              
                              {/* Category badge - centered at bottom */}
                              {num.category && (() => {
                                const categoryColors = getCategoryColor(num.category);
                                return (
                                  <span className={clsx(
                                    "text-[10px] sm:text-xs lg:text-sm font-bold uppercase tracking-wide px-1.5 sm:px-2 lg:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg lg:rounded-xl inline-block backdrop-blur-sm border shadow-sm",
                                    isSelected
                                      ? "bg-white/20 text-white border-white/30"
                                      : `${categoryColors.bg} ${categoryColors.text} ${categoryColors.border}`
                                  )}>
                                    {num.category}
                                  </span>
                                );
                              })()}
                            </div>
                            
                            {/* Arrow indicator - bottom right */}
                            <div className={clsx(
                              "absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 rounded-full flex items-center justify-center transition-all backdrop-blur-sm border shadow-sm z-20",
                              isSelected
                                ? "bg-white/30 text-white border-white/40"
                                : "bg-gray-100/80 text-gray-600 border-gray-200/50 group-hover:bg-orange-100/80 group-hover:text-orange-600 group-hover:border-orange-200/50"
                            )}>
                              <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {searchResults.length > 0 && (
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-gray-900 mb-3 sm:mb-4 lg:mb-5 uppercase tracking-wide">Search Results</h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
                      {searchResults.map((num, i) => {
                        const isSelected = selectedNumbers.some(n => n.numberId === num.id);
                        return (
                          <motion.button
                            key={num.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleSelectNumber(num)}
                            className={clsx(
                              "relative p-2.5 sm:p-3 lg:p-4 rounded-lg sm:rounded-xl lg:rounded-2xl border transition-all duration-300 group overflow-hidden backdrop-blur-2xl",
                              isSelected
                                ? "bg-gradient-to-br from-orange-500/90 to-amber-500/90 border-orange-400/60 shadow-2xl shadow-orange-500/40"
                                : "bg-white/60 border-white/40 hover:border-orange-400/60 hover:shadow-2xl shadow-lg"
                            )}
                            style={{
                              boxShadow: isSelected 
                                ? '0 20px 25px -5px rgba(249, 115, 22, 0.3), 0 10px 10px -5px rgba(249, 115, 22, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
                                : '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.5)'
                            }}
                          >
                            {/* Glass morphism overlay - top shine */}
                            <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-white/10 to-transparent rounded-lg sm:rounded-xl lg:rounded-2xl pointer-events-none" />
                            
                            {/* Glass morphism overlay - bottom depth */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent rounded-lg sm:rounded-xl lg:rounded-2xl pointer-events-none" />
                            
                            {/* 3D border effect */}
                            <div className="absolute inset-0 rounded-lg sm:rounded-xl lg:rounded-2xl border border-white/30 pointer-events-none" />
                            
                            {/* Shine effect on hover */}
                            {!isSelected && (
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 rounded-lg sm:rounded-xl lg:rounded-2xl" />
                            )}
                            
                            {/* Content */}
                            <div className="relative z-10 flex flex-col items-center justify-center min-h-[80px] sm:min-h-[100px] lg:min-h-[120px]">
                              {/* Number */}
                              <div className="mb-1.5 sm:mb-2 lg:mb-3">
                                <span className={clsx(
                                  "block text-base sm:text-lg md:text-xl lg:text-2xl font-black font-mono tracking-wide text-center",
                                  isSelected ? "text-white" : "text-gray-900"
                                )}>
                                  {num.number}
                                </span>
                              </div>
                              
                              {/* Category badge - centered at bottom */}
                              {num.category && (() => {
                                const categoryColors = getCategoryColor(num.category);
                                return (
                                  <span className={clsx(
                                    "text-[10px] sm:text-xs lg:text-sm font-bold uppercase tracking-wide px-1.5 sm:px-2 lg:px-2.5 py-0.5 sm:py-1 rounded-md sm:rounded-lg lg:rounded-xl inline-block backdrop-blur-sm border shadow-sm",
                                    isSelected
                                      ? "bg-white/20 text-white border-white/30"
                                      : `${categoryColors.bg} ${categoryColors.text} ${categoryColors.border}`
                                  )}>
                                    {num.category}
                                  </span>
                                );
                              })()}
                            </div>
                            
                            {/* Arrow indicator - bottom right */}
                            <div className={clsx(
                              "absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 rounded-full flex items-center justify-center transition-all backdrop-blur-sm border shadow-sm z-20",
                              isSelected
                                ? "bg-white/30 text-white border-white/40"
                                : "bg-gray-100/80 text-gray-600 border-gray-200/50 group-hover:bg-orange-100/80 group-hover:text-orange-600 group-hover:border-orange-200/50"
                            )}>
                              <ArrowRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-5 lg:h-5" />
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                    
                    {/* Load More Button */}
                    {searchHasMore && (
                      <div className="flex justify-center mt-6">
                        <motion.button
                          whileHover={{ scale: 1.02, y: -2 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleLoadMore}
                          disabled={isLoadingMore}
                          className="relative group overflow-hidden"
                          style={{ maxWidth: '280px', width: '100%' }}
                        >
                          {/* Button background with glass morphism */}
                          <div className="absolute inset-0 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 rounded-xl sm:rounded-2xl shadow-xl sm:shadow-2xl shadow-orange-500/40" />
                          <div className="absolute inset-0 bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 rounded-xl sm:rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                          
                          {/* Shine effect */}
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                          
                          {/* Button content */}
                          <div className="relative py-3 sm:py-3.5 md:py-4 rounded-xl sm:rounded-2xl font-black text-sm sm:text-base md:text-lg text-white flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed px-6 sm:px-8">
                            {isLoadingMore ? (
                              <>
                                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                                <span className="text-xs sm:text-sm">Loading more...</span>
                              </>
                            ) : (
                              <>
                                <span>Load More Numbers</span>
                                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
                              </>
                            )}
                          </div>
                        </motion.button>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

            {step === 'plans' && (
              <motion.div
                key="plans"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6 pb-40"
              >
                <div className="text-center mb-4 sm:mb-6">
                   <h2 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-800">Choose Plan</h2>
                </div>

                {selectedNumbers.map((num, numIndex) => {
                  // Filter plans based on the number's category (case-insensitive)
                  const filteredPlans = plans.filter(plan => 
                    plan.category?.toLowerCase() === num.category?.toLowerCase()
                  );
                  
                  return (
                  <div key={num.numberId} className="space-y-4 mb-8">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-1 h-6 bg-gradient-to-b from-orange-500 to-amber-500 rounded-full"></div>
                        <h3 className="font-bold text-lg sm:text-xl text-slate-800">{num.number}</h3>
                        {num.category && (
                          <span className="text-xs font-bold text-orange-600 uppercase tracking-wider bg-orange-100 px-2 py-1 rounded-full">
                            {num.category}
                          </span>
                        )}
                    </div>

                    {filteredPlans.length === 0 ? (
                      <div className="p-6 bg-white/60 backdrop-blur-xl border border-white/60 rounded-2xl text-center shadow-lg">
                        <p className="text-slate-600 font-semibold">No plans available for {num.category} category</p>
                        <p className="text-sm text-slate-500 mt-1">Please contact support</p>
                      </div>
                    ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                        {filteredPlans.map((plan, i) => {
                          const isSelected = selectedPlans[num.numberId] === plan.name;
                          return (
                             <motion.button
                                key={plan.id}
                                type="button"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: (numIndex * 0.1) + (i * 0.05) }}
                                whileHover={{ scale: 1.02, y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => handlePlanSelect(num.numberId, plan.name)}
                                className={clsx(
                                    "relative p-4 sm:p-5 rounded-xl sm:rounded-2xl border transition-all duration-300 cursor-pointer text-left overflow-hidden backdrop-blur-2xl group",
                                    isSelected
                                        ? "bg-gradient-to-br from-orange-500/90 to-amber-500/90 border-orange-400/60 shadow-2xl shadow-orange-500/40"
                                        : "bg-white/60 border-orange-400/40 hover:border-orange-400/60 hover:shadow-2xl shadow-lg"
                                )}
                                style={{
                                  boxShadow: isSelected 
                                    ? '0 20px 25px -5px rgba(249, 115, 22, 0.3), 0 10px 10px -5px rgba(249, 115, 22, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
                                    : '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.5)'
                                }}
                             >
                                {/* Glass morphism overlays */}
                                <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-white/10 to-transparent rounded-xl sm:rounded-2xl pointer-events-none" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent rounded-xl sm:rounded-2xl pointer-events-none" />
                                <div className="absolute inset-0 rounded-xl sm:rounded-2xl border border-white/30 pointer-events-none" />
                                
                                {/* Shine effect on hover */}
                                {!isSelected && (
                                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 rounded-xl sm:rounded-2xl" />
                                )}
                                
                                {/* Selection indicator - top right */}
                                {isSelected && (
                                  <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="absolute top-2 right-2 w-6 h-6 sm:w-7 sm:h-7 bg-white rounded-full flex items-center justify-center shadow-lg z-10"
                                  >
                                    <Check className="w-4 h-4 text-orange-600" />
                                  </motion.div>
                                )}
                                
                                {/* Content */}
                                <div className="relative z-10">
                                    <h4 className={clsx(
                                      "font-bold text-base sm:text-lg mb-2",
                                      isSelected ? "text-white" : "text-slate-800"
                                    )}>
                                      {plan.name}
                                    </h4>
                                    <div className={clsx(
                                      "text-2xl sm:text-3xl font-black mb-2 flex items-baseline gap-1",
                                      isSelected ? "text-white" : "text-slate-800"
                                    )}>
                                        {plan.amount}
                                        <span className={clsx(
                                          "text-xs sm:text-sm font-bold",
                                          isSelected ? "text-white/80" : "text-slate-500"
                                        )}>
                                          AED/Month
                                        </span>
                                    </div>
                                    <p className={clsx(
                                      "text-xs sm:text-sm leading-relaxed mb-3 font-medium",
                                      isSelected ? "text-white/90" : "text-slate-600"
                                    )}>
                                      {plan.benefits}
                                    </p>
                                    {plan.duration && (
                                        <div className="flex items-center gap-1 sm:gap-2 flex-nowrap">
                                            <span className={clsx(
                                              "text-[9px] sm:text-xs font-semibold uppercase tracking-wide whitespace-nowrap",
                                              isSelected ? "text-white/80" : "text-slate-500"
                                            )}>
                                              Contract Duration:
                                            </span>
                                            <div className={clsx(
                                                "inline-block px-1.5 sm:px-2 lg:px-3 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[9px] sm:text-[10px] lg:text-xs font-bold uppercase tracking-wide backdrop-blur-sm border flex-shrink-0",
                                                isSelected
                                                  ? "bg-white/20 text-white border-white/30"
                                                  : "bg-orange-100/80 text-orange-700 border-orange-200/50 shadow-sm"
                                            )}>
                                                {plan.duration}
                                            </div>
                                        </div>
                                    )}
                                </div>
                             </motion.button>
                          );
                        })}
                    </div>
                    )}
                  </div>
                  );
                })}
              </motion.div>
            )}

            {step === 'details' && (
              <motion.div
                key="details"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-5"
              >
                <div className="text-center mb-6">
                  <div className="inline-block mb-3 px-4 py-2 bg-white/70 backdrop-blur-sm rounded-full border border-orange-200/60">
                    <span className="text-orange-600 text-sm font-bold">Step 3 of 4</span>
                  </div>
                   <h2 className="text-3xl font-black text-slate-800 mb-2">Your Details</h2>
                   <p className="text-slate-600 font-medium">Almost there! Just a few more details</p>
                </div>

                {/* Selected Numbers & Plans Summary */}
                <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl border-2 border-orange-200 p-5 mb-6">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-orange-600" />
                    Selected Numbers & Plans
                  </h3>
                  <div className="space-y-3">
                    {selectedNumbers.map((n) => {
                      const selectedPlan = plans.find(p => p.name === selectedPlans[n.numberId]);
                      return (
                        <motion.div
                          key={n.numberId}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-white rounded-xl border border-orange-200 p-4 shadow-sm"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-lg flex items-center justify-center">
                                <Phone className="w-5 h-5 text-white" />
                              </div>
                              <div>
                                <div className="font-bold text-slate-800 text-lg">{n.number}</div>
                                {n.category && (
                                  <div className="text-xs font-semibold text-orange-600 uppercase tracking-wide">
                                    {n.category}
                                  </div>
                                )}
                              </div>
                            </div>
                            {selectedPlan ? (
                              <div className="text-right">
                                <div className="font-bold text-orange-600 text-sm">{selectedPlan.name}</div>
                                <div className="text-xs text-slate-600 font-semibold">{selectedPlan.amount} AED/Month</div>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 font-semibold">No plan selected</span>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-4">
                        <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
                            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 block">Full Name</label>
                            <input
                                required
                                type="text"
                                value={formData.customerName}
                                onChange={e => setFormData({...formData, customerName: e.target.value})}
                                className="w-full bg-transparent text-gray-900 font-medium text-base focus:outline-none"
                                placeholder="Mohammad"
                            />
                        </div>

                        <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
                            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 block">Contact Number</label>
                            <input
                                required
                                type="tel"
                                value={formData.customerPhone}
                                onChange={e => setFormData({...formData, customerPhone: e.target.value})}
                                className="w-full bg-transparent text-gray-900 font-medium text-base focus:outline-none"
                                placeholder="050 000 0000"
                            />
                        </div>

                        <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
                            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 block">Delivery Address</label>
                            <input
                                required
                                type="text"
                                value={formData.customerAddress}
                                onChange={e => setFormData({...formData, customerAddress: e.target.value})}
                                className="w-full bg-transparent text-gray-900 font-medium text-base focus:outline-none"
                                placeholder="Building, Street, Area"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                             <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
                                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 block">Emirate</label>
                                <select
                                    value={formData.emirate}
                                    onChange={e => setFormData({...formData, emirate: e.target.value})}
                                    className="w-full bg-transparent text-slate-800 font-medium focus:outline-none appearance-none"
                                >
                                    <option value="">Select</option>
                                    {uaeEmirates.map(e => <option key={e} value={e}>{e}</option>)}
                                </select>
                            </div>
                            <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
                                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 block">Nationality</label>
                                <select
                                    value={formData.nationality}
                                    onChange={e => setFormData({...formData, nationality: e.target.value})}
                                    className="w-full bg-transparent text-slate-800 font-medium focus:outline-none appearance-none"
                                >
                                    <option value="">Select</option>
                                    {countryList.map(c => <option key={c.code} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                             <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
                                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 block">Gender</label>
                                <select
                                    value={formData.gender}
                                    onChange={e => setFormData({...formData, gender: e.target.value})}
                                    className="w-full bg-transparent text-slate-800 font-medium focus:outline-none appearance-none"
                                >
                                    <option value="">Select</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                </select>
                            </div>
                            <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
                                <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 block">Age</label>
                                <input
                                    type="number"
                                    value={formData.customerAge}
                                    onChange={e => setFormData({...formData, customerAge: e.target.value})}
                                    className="w-full bg-transparent text-slate-800 font-medium focus:outline-none"
                                    placeholder="25"
                                />
                            </div>
                        </div>

                         <div className="bg-white rounded-2xl border-2 border-gray-100 p-4">
                            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 block">Language</label>
                            <select
                                value={formData.language}
                                onChange={e => setFormData({...formData, language: e.target.value})}
                                className="w-full bg-transparent text-slate-800 font-medium focus:outline-none appearance-none"
                            >
                                <option value="English">English</option>
                                <option value="Arabic">Arabic</option>
                                <option value="Hindi">Hindi</option>
                                <option value="Urdu">Urdu</option>
                            </select>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border-2 border-gray-100 p-4 flex items-center gap-3">
                        <input
                            type="checkbox"
                            id="eid"
                            checked={formData.hasEmirateId}
                            onChange={e => setFormData({...formData, hasEmirateId: e.target.checked})}
                            className="w-5 h-5 rounded border-2 border-slate-300 text-orange-500 focus:ring-orange-500"
                        />
                        <label htmlFor="eid" className="text-sm font-bold text-slate-700">
                          I have a valid Emirates ID
                        </label>
                    </div>

                    <motion.button
                        whileHover={!isSubmitting ? { scale: 1.02 } : {}}
                        whileTap={!isSubmitting ? { scale: 0.98 } : {}}
                        type="submit"
                        disabled={isSubmitting}
                        className={`w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white py-5 rounded-2xl font-bold text-lg shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2 transition-all ${
                          isSubmitting 
                            ? 'opacity-75 cursor-not-allowed' 
                            : 'hover:shadow-2xl hover:shadow-orange-500/30'
                        }`}
                    >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Submitting...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-5 h-5" />
                            <span>Submit Request</span>
                          </>
                        )}
                    </motion.button>
                </form>
              </motion.div>
            )}

            {step === 'success' && (
               <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="flex flex-col items-center justify-center text-center py-16"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/30 mb-8"
                >
                    <CheckCircle className="w-12 h-12 text-white" strokeWidth={3} />
                </motion.div>
                <h2 className="text-4xl font-black text-slate-800 mb-3">All Set!</h2>
                <p className="text-slate-600 max-w-sm mx-auto mb-8 leading-relaxed font-medium">
                    Thank you, <span className="text-orange-600 font-bold">{formData.customerName}</span>. We'll contact you shortly on <span className="text-orange-600 font-bold">{formData.customerPhone}</span>.
                </p>
                <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-md p-5 flex items-center gap-3">
                    <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                      <Shield className="w-6 h-6 text-green-600" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-slate-800">Secure & Encrypted</p>
                      <p className="text-xs text-slate-600">Your data is protected</p>
                    </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        <AnimatePresence>
          {step === 'search' && selectedNumbers.length > 0 && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-50 p-4"
            >
              <div className="max-w-md mx-auto px-2">
                <div className="relative">
                  {/* Glass morphism glow effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-500/30 to-amber-500/30 rounded-2xl sm:rounded-3xl blur-2xl"></div>
                  
                  {/* Main glass card */}
                  <div className="relative bg-white/70 backdrop-blur-2xl rounded-2xl sm:rounded-3xl border border-white/60 shadow-2xl overflow-hidden">
                    {/* Top gradient line */}
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500"></div>
                    
                    {/* Glass overlay effects */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-white/10 to-transparent rounded-2xl sm:rounded-3xl pointer-events-none"></div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent rounded-2xl sm:rounded-3xl pointer-events-none"></div>

                    <div className="relative p-3 sm:p-4">
                      {/* Header - Compact */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg">
                            <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                          </div>
                          <div>
                            <h3 className="text-xs sm:text-sm font-black text-gray-900 uppercase tracking-wide">Selected Numbers</h3>
                            <p className="text-[10px] sm:text-xs text-gray-600 font-semibold">{selectedNumbers.length} number{selectedNumbers.length > 1 ? 's' : ''} ready</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 bg-gradient-to-br from-orange-500 to-amber-500 text-white font-black text-base sm:text-lg px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl shadow-lg backdrop-blur-sm border border-white/30">
                          {selectedNumbers.length}
                          <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                      </div>

                      {/* Selected Numbers - Compact scrollable */}
                      <div className="mb-3 max-h-20 sm:max-h-24 overflow-y-auto scrollbar-hide">
                        <div className="flex flex-wrap gap-1.5 sm:gap-2">
                          {selectedNumbers.map((n, i) => (
                            <motion.div
                              key={n.numberId}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={{ delay: i * 0.02, type: "spring", stiffness: 400 }}
                              className="group relative"
                            >
                              <div className="bg-white/80 backdrop-blur-sm border border-gray-200/60 text-gray-900 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-sm hover:shadow-md transition-all">
                                <span className="text-orange-600 font-mono">{n.number}</span>
                                <motion.button
                                  whileHover={{ scale: 1.2, rotate: 90 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => handleSelectNumber({ id: n.numberId, number: n.number } as any)}
                                  className="w-4 h-4 sm:w-5 sm:h-5 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white transition-colors flex-shrink-0"
                                >
                                  <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                </motion.button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>

                      {/* Continue Button - Compact */}
                      <div className="flex justify-center">
                        <motion.button
                          whileHover={{ scale: 1.02, y: -1 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleContinueToPlans}
                          disabled={loadingPlans}
                          className="bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 hover:from-orange-600 hover:via-amber-600 hover:to-orange-600 text-white px-6 sm:px-8 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl font-black text-sm sm:text-base shadow-xl shadow-orange-500/30 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 relative overflow-hidden group"
                        >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                        {loadingPlans ? (
                          <>
                            <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                            <span className="text-xs sm:text-sm">Preparing plans...</span>
                          </>
                        ) : (
                          <>
                            <span>Continue to Plans</span>
                            <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
                          </>
                        )}
                      </motion.button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {step === 'plans' && selectedNumbers.length > 0 && (
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-50 p-4"
            >
              <div className="max-w-md mx-auto">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-amber-500 rounded-3xl blur-xl opacity-40"></div>
                  <div className="relative bg-white/95 backdrop-blur-2xl rounded-3xl border-2 border-orange-200/60 shadow-2xl overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500"></div>

                    <div className="p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-2xl flex items-center justify-center shadow-lg">
                            <ShoppingCart className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">Your Selection</h3>
                            <p className="text-xs text-slate-500 font-semibold">
                              {Object.keys(selectedPlans).length} of {selectedNumbers.length} plan{selectedNumbers.length > 1 ? 's' : ''} selected
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 bg-gradient-to-br from-orange-500 to-amber-500 text-white font-black text-lg px-4 py-2 rounded-2xl shadow-lg">
                          {Object.keys(selectedPlans).length}/{selectedNumbers.length}
                        </div>
                      </div>

                      <div className="mb-4 max-h-32 overflow-y-auto scrollbar-hide">
                        <div className="space-y-2">
                          {selectedNumbers.map((n, i) => {
                            const selectedPlan = plans.find(p => p.name === selectedPlans[n.numberId]);
                            return (
                              <motion.div
                                key={n.numberId}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.03, type: "spring", stiffness: 400 }}
                                className={clsx(
                                  "p-3 rounded-xl border-2 transition-all",
                                  selectedPlan
                                    ? "bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200"
                                    : "bg-slate-50 border-slate-200"
                                )}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Phone className="w-4 h-4 text-orange-600" />
                                    <span className="font-bold text-slate-800 text-sm">{n.number}</span>
                                  </div>
                                  {selectedPlan ? (
                                    <div className="flex items-center gap-2">
                                      <div className="text-right">
                                        <div className="text-xs font-bold text-orange-600">{selectedPlan.name}</div>
                                        <div className="text-xs text-slate-600">{selectedPlan.amount} AED/Month</div>
                                      </div>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedPlans(prev => {
                                            const newPlans = { ...prev };
                                            delete newPlans[n.numberId];
                                            return newPlans;
                                          });
                                        }}
                                        className="w-6 h-6 bg-red-100 hover:bg-red-200 rounded-full flex items-center justify-center transition-colors group/x"
                                      >
                                        <X className="w-3 h-3 text-red-600 group-hover/x:text-red-700" />
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-400 font-semibold">Select a plan</span>
                                  )}
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      </div>

                      {selectedNumbers.every(n => selectedPlans[n.numberId]) ? (
                        <motion.button
                          initial={{ scale: 0.95 }}
                          animate={{ scale: 1 }}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setStep('details')}
                          className="w-full bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 hover:from-orange-600 hover:via-amber-600 hover:to-orange-600 text-white py-4 rounded-2xl font-black text-base shadow-2xl shadow-orange-500/30 transition-all flex items-center justify-center gap-2 relative overflow-hidden group"
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
                          <span>Continue to Details</span>
                          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </motion.button>
                      ) : (
                        <div className="w-full bg-slate-100 text-slate-400 py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2 cursor-not-allowed">
                          <AlertCircle className="w-5 h-5" />
                          <span>Select plans for all numbers</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
    </>
  );
}
