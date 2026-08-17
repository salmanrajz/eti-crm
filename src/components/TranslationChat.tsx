/**
 * ===============================================================================
 * TRANSLATION CHAT COMPONENT - AI ASSISTANT AND NUMBER LOOKUP INTERFACE
 * ===============================================================================
 * 
 * This component provides an AI-powered chat interface with integrated number
 * pool lookup functionality. It enables users to search for numbers, get
 * lead information, and interact with an AI assistant for various CRM tasks.
 * 
 * FEATURES:
 * 
 * 1. AI CHAT INTERFACE
 *    - Conversational AI assistant with context awareness
 *    - Message history and conversation management
 *    - Typing indicators and response animations
 *    - Intelligent query processing and response generation
 * 
 * 2. NUMBER POOL INTEGRATION
 *    - Real-time number lookup and status checking
 *    - Number information display with detailed status badges
 *    - Integration with Firestore number pool database
 *    - Visual status indicators for number availability
 * 
 * 3. LEAD MANAGEMENT INTEGRATION
 *    - Lead information retrieval and display
 *    - Customer details and lead status checking
 *    - Plan information and lead history integration
 *    - Navigation to detailed lead views
 * 
 * 4. RESPONSIVE DESIGN AND UX
 *    - Floating chat widget with expandable interface
 *    - Mobile-optimized design with touch interactions
 *    - Smooth animations and transitions
 *    - Copy-to-clipboard functionality for shared information
 * 
 * 5. ADVANCED FUNCTIONALITY
 *    - Message type detection (text, number lookup, lead search)
 *    - Rich data display with formatted cards and badges
 *    - External link navigation and context switching
 *    - Error handling and user feedback systems
 * 
 * USAGE:
 * This component serves as a floating AI assistant throughout the CRM
 * system, providing contextual help and data lookup capabilities.
 * ===============================================================================
 */

import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { FiCopy, FiX, FiCheckCircle, FiExternalLink, FiRefreshCw } from 'react-icons/fi';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { NumberPool, Lead } from '../types';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowUp, Languages } from 'lucide-react';
import { motion } from 'framer-motion';
import chatIcon from '../../chatbox.png';

interface Message {
  text: string;
  isUser: boolean;
  timestamp: Date;
  type?: 'number' | 'lead' | 'text' | 'welcome';
  data?: {
    number?: NumberPool;
    leads?: Lead[];
  };
}

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const statusConfig = {
    open: {
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: '🔓',
      label: 'OPEN'
    },
    reserved: {
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: '⏳',
      label: 'RESERVED'
    },
    pending_verification: {
      color: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: '🔍',
      label: 'PENDING VERIFICATION'
    },
    activated_non_verified: {
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: '⏱️',
      label: 'ACTIVATED - PENDING VERIFICATION'
    },
    verified: {
      color: 'bg-violet-50 text-violet-700 border-violet-200',
      icon: '✅',
      label: 'VERIFIED'
    },
    assigned: {
      color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      icon: '📱',
      label: 'ASSIGNED'
    },
    rejected: {
      color: 'bg-rose-50 text-rose-700 border-rose-200',
      icon: '❌',
      label: 'REJECTED'
    },
    follow_up: {
      color: 'bg-orange-50 text-orange-700 border-orange-200',
      icon: '🔄',
      label: 'FOLLOW UP'
    },
    later: {
      color: 'bg-orange-50 text-orange-700 border-orange-200',
      icon: '🕐',
      label: 'LATER'
    },
    not_found: {
      color: 'bg-gray-50 text-gray-700 border-gray-200',
      icon: '❓',
      label: 'NOT IN POOL'
    }
  };

  const config = statusConfig[status as keyof typeof statusConfig] || {
    color: 'bg-gray-50 text-gray-700 border-gray-200',
    icon: '•',
    label: status.toUpperCase()
  };

  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
      config.color
    )}>
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
};

const NumberCard: React.FC<{ number: NumberPool }> = ({ number }) => {
  const isNotFound = number.id === 'not-found';
  const reservationCount = number.reservationCount ?? 0;
  const claimQueueCount = number.claimQueue?.length ?? 0;
  const strikeCount = (number.claims || []).filter((c: { status: string }) => c.status === 'pending').length;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Number Information</h3>
          <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
            #{number.number}
          </span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Category:</span>
            <span className="font-medium text-gray-900">
              {isNotFound ? 'Not in Number Pool' : number.category}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Status:</span>
            <StatusBadge status={number.status} />
          </div>
          {!isNotFound && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                <span className="opacity-80">R</span>
                <span>{reservationCount}</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                <span className="opacity-80">C</span>
                <span>{claimQueueCount}</span>
              </span>
              <span className={clsx(
                'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border',
                strikeCount > 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-500 border-gray-200'
              )}>
                <span className="opacity-80">S</span>
                <span>{strikeCount}</span>
              </span>
            </div>
          )}
          {isNotFound && (
            <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-xs text-yellow-800">
                This number is not currently in the number pool.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const LeadCard: React.FC<{ lead: Lead }> = ({ lead }) => {
  const navigate = useNavigate();
  const number = lead.plans?.find(p => p.number)?.number || 'N/A';
  
  const handleViewLead = () => {
    navigate(`/dashboard/leads/${lead.id}`);
  };
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Lead Information</h3>
          <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
            #{number}
          </span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Customer:</span>
            <span className="font-medium text-gray-900">{lead.customerName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Customer Number:</span>
            <span className="font-medium text-gray-900">{lead.customerNumber}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Selected Number:</span>
            <span className="font-medium text-gray-900">{number}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Status:</span>
            <StatusBadge status={lead.status} />
          </div>
          <button
            onClick={handleViewLead}
            className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-colors"
          >
            <FiExternalLink className="h-4 w-4" />
            View Lead Details
          </button>
        </div>
      </div>
    </div>
  );
};

const WelcomeCard: React.FC = () => {
  const capabilities = [
    { label: 'Translate', detail: 'English ↔ Arabic' },
    { label: 'Numbers', detail: 'Check pool status' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center shadow-sm shrink-0">
          <Sparkles size={14} className="text-white" />
        </div>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-semibold text-gray-900">Hello! I’m your AI assistant</p>
          <p className="text-xs text-gray-500 mt-0.5">Here’s what I can help you with</p>
        </div>
      </div>

      <div className="space-y-1.5">
        {capabilities.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2.5 rounded-xl bg-white/70 border border-white/80 px-3 py-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
            <div className="min-w-0 flex items-baseline gap-1.5">
              <span className="text-xs font-semibold text-gray-800">{item.label}</span>
              <span className="text-[11px] text-gray-500">— {item.detail}</span>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-600 pt-0.5">How may I help you today?</p>
    </div>
  );
};

const MessageContent: React.FC<{ message: Message }> = ({ message }) => {
  if (message.type === 'welcome') {
    return <WelcomeCard />;
  }

  if (message.type === 'text' && (message.data?.number || message.data?.leads)) {
    return (
      <div className="space-y-3">
        {message.data?.number && <NumberCard number={message.data.number} />}
        {message.data?.leads && message.data.leads.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm font-medium text-gray-700">
              Found {message.data.leads.length} matching leads:
            </div>
            {message.data.leads.map((lead, index) => (
              <LeadCard key={lead.id || index} lead={lead} />
            ))}
          </div>
        )}
      </div>
    );
  }
  
  return <div className="whitespace-pre-wrap text-sm">{message.text}</div>;
};

const TranslationChat: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [translateToArabic, setTranslateToArabic] = useState(false);
  const [hasShownWelcome, setHasShownWelcome] = useState(false);
  const [showWelcomeFlash, setShowWelcomeFlash] = useState(true);
  const [bubbleExit, setBubbleExit] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [copiedEnIndex, setCopiedEnIndex] = useState<number | null>(null);
  const [copiedArIndex, setCopiedArIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  
  // Initialize Firebase Functions
  const functions = getFunctions();
  const translateTextFunction = httpsCallable(functions, 'translateText');

  // Helper: check if a string contains Arabic script characters
  const containsArabic = (text: string): boolean => /[\u0600-\u06FF]/.test(text);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is outside the chat box
      if (chatBoxRef.current && !chatBoxRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      // Focus input when chat opens
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      
      document.addEventListener('mousedown', handleClickOutside);
      
      // Show welcome message if this is the first time opening
      if (!hasShownWelcome && messages.length === 0) {
        const welcomeMessage: Message = {
          text: "Hello! I'm your AI assistant",
          isUser: false,
          timestamp: new Date(),
          type: 'welcome'
        };
        setMessages([welcomeMessage]);
        setHasShownWelcome(true);
      }
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, hasShownWelcome, messages.length]);

  useEffect(() => {
    if (showWelcomeFlash) {
      const timer = setTimeout(() => setBubbleExit(true), 4500);
      const timer2 = setTimeout(() => {
        setShowWelcomeFlash(false);
        setBubbleExit(false);
      }, 5000);
      return () => { clearTimeout(timer); clearTimeout(timer2); };
    }
  }, [showWelcomeFlash]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;

    // Auto-switch to Arabic mode if user requests Arabic or types in Arabic
    const mentionsArabic = /(translate\s*(it|this)?\s*(to)?\s*arabic|to\s*arabic|in\s*arabic|arabic\s*please)/i.test(inputText);
    const autoArabic = mentionsArabic || containsArabic(inputText);
    const effectiveTranslateToArabic = autoArabic ? true : translateToArabic;
    if (autoArabic && !translateToArabic) {
      setTranslateToArabic(true);
    }

    const userMessage: Message = {
      text: inputText,
      isUser: true,
      timestamp: new Date(),
      type: 'text'
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      // Check if the input contains a 10-digit number
      const numberMatch = inputText.match(/\b\d{10}\b/);
      let responseMessage: Message;

      if (numberMatch) {
        const number = numberMatch[0];
        let numberData: NumberPool | null = null;
        let matchingLeads: any[] = [];

        // Get number pool information
        const numbersQuery = query(
          collection(db, 'numberPool'),
          where('number', '==', number)
        );
        const numberSnapshot = await getDocs(numbersQuery);
        
        if (!numberSnapshot.empty) {
          numberData = numberSnapshot.docs[0].data() as NumberPool;
        } else {
          // Create a "not found" number object
          numberData = {
            id: 'not-found',
            number: number,
            category: 'Standard',
            code: 'N/A',
            status: 'not_found',
            lastStatusChange: new Date()
          } as unknown as NumberPool;
        }

        // Get lead information
        if (!user?.id) {
          responseMessage = {
            text: '',
            isUser: false,
            timestamp: new Date(),
            type: 'text',
            data: {
              number: numberData
            }
          };
        } else {
          // Try different number formats
          const numberFormats = [
            number,                    // Original number
            number.replace(/^0+/, ''), // Remove leading zeros
            `+971${number}`,          // Add UAE country code
            `971${number}`,           // Add UAE country code without +
            `0${number}`              // Add leading zero
          ];

          console.log('Searching for number formats:', numberFormats);

          // First try direct customerPhone match
          const leadsQuery = query(
            collection(db, 'leads'),
            where('agentId', '==', user.id)
          );
          const leadSnapshot = await getDocs(leadsQuery);
          
          console.log('Total leads found for agent:', leadSnapshot.size);

          let matchingLeads = leadSnapshot.docs.filter(doc => {
            const data = doc.data() as Lead;
            const leadNumbers = [
              data.customerPhone,
              data.customerNumber,
              ...(data.plans?.map(p => p.number) || []),
              ...(data.customerNumbers?.map(cn => [cn.number, cn.alternativeNumber]).flat() || [])
            ].filter(Boolean); // Remove null/undefined values

            console.log('Checking lead:', {
              id: doc.id,
              customerName: data.customerName,
              allNumbers: leadNumbers
            });

            // Check if any of the number formats match any of the lead's numbers
            const isMatch = numberFormats.some(format => 
              leadNumbers.some(leadNumber => 
                leadNumber && leadNumber.toString().includes(format)
              )
            );

            if (isMatch) {
              console.log('Found matching lead:', {
                id: doc.id,
                customerName: data.customerName,
                matchedNumbers: leadNumbers.filter(n => 
                  numberFormats.some(format => n && n.toString().includes(format))
                )
              });
            }

            return isMatch;
          });

          console.log('Total matching leads found:', matchingLeads.length);

          responseMessage = {
            text: '',
            isUser: false,
            timestamp: new Date(),
            type: 'text',
            data: {
              number: numberData,
              leads: matchingLeads.length > 0 ? matchingLeads.map(doc => ({
                ...doc.data() as Lead,
                id: doc.id
              })) : undefined
            }
          };
        }
      } else {
        // Handle translation request using secure cloud function
        const result = await translateTextFunction({
          text: inputText,
          translateToArabic: effectiveTranslateToArabic,
        });
        
        const data = result.data as { success: boolean; text: string };
        if (!data.success || !data.text) {
          throw new Error('Translation failed');
        }
        
        const rawText: string = data.text;
        let finalText = rawText;
        if (effectiveTranslateToArabic) {
          // Post-process to ensure exactly two clean lines without labels/numbering
          const cleanedLines = rawText
            .split('\n')
            .map(l => l.replace(/^\s*(responses?:\s*)?/i, ''))
            .map(l => l.replace(/^\s*[•\-\*]+\s*/, ''))
            .map(l => l.replace(/^\s*\d+\)\s*/, ''))
            .map(l => l.replace(/\b(in\s*arabic|arabic\s*version|english\s*translation|arabic\s*translation|in\s*english)\b/gi, ''))
            .map(l => l.replace(/^\s*(english|arabic)\s*:\s*/i, ''))
            .map(l => l.replace(/[“”]/g, '"'))
            .map(l => l.replace(/^\s*"|"\s*$/g, ''))
            .map(l => l.trim())
            .filter(l => l.length > 0);

          // Prefer first non-Arabic as English, first Arabic as Arabic
          const englishLine = cleanedLines.find(l => !/[\u0600-\u06FF]/.test(l)) || '';
          const arabicLine = cleanedLines.find(l => /[\u0600-\u06FF]/.test(l)) || '';

          if (englishLine && arabicLine) {
            finalText = `${englishLine}\n${arabicLine}`;
          } else if (cleanedLines.length >= 2) {
            finalText = `${cleanedLines[0]}\n${cleanedLines[1]}`;
          } else {
            // Last resort: strip labels/numbering from raw text
            const fallback = rawText.replace(/(^|\n)\s*(responses?:\s*)?/gi, '$1')
              .replace(/(^|\n)\s*\d+\)\s*/g, '$1')
              .replace(/\b(in\s*arabic|arabic\s*version|english\s*translation|arabic\s*translation|in\s*english)\b/gi, '')
              .trim();
            finalText = fallback;
          }
        } else {
          // Remove Arabic content from English-only responses
          const nonArabicLines = rawText
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0 && !/[\u0600-\u06FF]/.test(l));
          if (nonArabicLines.length > 0) {
            finalText = nonArabicLines.join('\n');
          } else {
            // Fallback: strip Arabic characters inline
            finalText = rawText.replace(/[\u0600-\u06FF]/g, '').replace(/\s{2,}/g, ' ').trim();
          }
        }
        responseMessage = {
          text: finalText,
          isUser: false,
          timestamp: new Date(),
          type: 'text'
        };
      }

      setMessages((prev) => [...prev, responseMessage]);
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        text: 'Sorry, there was an error processing your request.',
        isUser: false,
        timestamp: new Date(),
        type: 'text'
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    if (translateToArabic && containsArabic(text)) {
      // When in Arabic mode and Arabic exists, try to copy the Arabic line
      const lines = text.split('\n');
      // Prefer the last line with Arabic, else fall back to any Arabic substring
      const arabicLine = [...lines].reverse().find(l => containsArabic(l));
      if (arabicLine) {
        const cleaned = arabicLine.replace(/^\d+\)\s*/, '');
        navigator.clipboard.writeText(cleaned);
        return;
      }
    }
    // Fallback: copy full text
    navigator.clipboard.writeText(text);
  };

  const handleRefresh = () => {
    setMessages([]);
    setHasShownWelcome(false);
    setInputText('');
    setIsLoading(false);
    setCopiedEnIndex(null);
    setCopiedArIndex(null);
    setCopiedIndex(null);
  };

  const lastUserMessageIndex = messages.reduce(
    (last, msg, i) => (msg.isUser ? i : last),
    -1
  );

  return (
    <>
      {/* Modern AI Welcome Message as a chat bubble from the button */}
      {showWelcomeFlash && (
        <div className="hidden sm:flex fixed right-8 bottom-24 z-50 flex-col items-end">
          <div className={`relative ${bubbleExit ? 'animate-ai-bubble-exit' : 'animate-ai-slide-up'}`}> 
            <div className="flex items-end">
              <div className="px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold text-gray-900 bg-gradient-to-r from-orange-50 to-gray-50 shadow-sm border border-gray-200 flex items-center relative" style={{marginLeft: 0}}>
                <span>Hi, I’m Tab. Ask me.</span>
                <span className="ml-1 animate-wave text-lg" role="img" aria-label="waving hand">👋</span>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modern AI Floating Button with pulse/glow */}
      <button
        onClick={() => setIsOpen(true)}
        className="hidden sm:flex fixed bottom-6 right-6 z-50 w-20 h-20 flex items-center justify-center transition-all duration-200 hover:scale-110 focus:outline-none"
        aria-label="AI Assistant"
      >
        <span className="sr-only">Open AI Assistant</span>
        <motion.img
          src={chatIcon}
          alt="Translate"
          className="w-16 h-16"
          animate={{ rotate: [-10, 10, -10] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      </button>

      {/* Chat Modal */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-[100] flex items-end justify-end p-3 sm:p-6 pointer-events-none"
        >
          <div className="pointer-events-auto relative w-full max-w-[380px] sm:max-w-[400px]">
            <div
              className="relative flex flex-col w-full h-[min(88vh,640px)] rounded-[28px] overflow-hidden shadow-[0_8px_40px_rgba(99,102,241,0.22),0_2px_12px_rgba(0,0,0,0.08)] border border-white/60"
              style={{
                background: `
                  radial-gradient(ellipse 80% 50% at 20% 10%, rgba(255,255,255,0.95) 0%, transparent 70%),
                  radial-gradient(ellipse 60% 40% at 80% 30%, rgba(199,210,254,0.5) 0%, transparent 60%),
                  radial-gradient(ellipse 70% 50% at 50% 80%, rgba(196,181,253,0.35) 0%, transparent 65%),
                  linear-gradient(165deg, #f8faff 0%, #eef2ff 35%, #e9e0ff 65%, #ddd6fe 100%)
                `
              }}
              ref={chatBoxRef}
            >
            {/* Header pill */}
            <div className="relative z-10 px-3 pt-3 pb-1">
              <div
                className="flex items-center gap-2 h-11 px-2 rounded-full border border-white/70 shadow-sm backdrop-blur-md"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(224,231,255,0.88) 45%, rgba(221,214,254,0.9) 100%)',
                }}
              >
                <button
                  type="button"
                  onClick={() => setTranslateToArabic(!translateToArabic)}
                  className={clsx(
                    'shrink-0 flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs font-medium transition-all',
                    translateToArabic
                      ? 'bg-indigo-500 text-white shadow-sm'
                      : 'bg-white/60 text-gray-600 hover:bg-white/90 hover:text-gray-800'
                  )}
                  title={translateToArabic ? 'Arabic mode on' : 'Arabic mode off'}
                >
                  <Languages size={13} />
                  <span>AR</span>
                </button>

                <div className="flex-1 min-w-0 flex items-center justify-center gap-1.5">
                  <Sparkles size={14} className="shrink-0 text-indigo-500" />
                  <div className="min-w-0 text-center leading-tight">
                    <p className="text-[12px] font-semibold text-gray-800 truncate">AI Assistant</p>
                    <p className="text-[9px] text-gray-500 truncate">Translate • Numbers • Leads</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRefresh}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-white/60 text-gray-500 hover:bg-white/90 hover:text-gray-700 transition-colors"
                  aria-label="Refresh conversation"
                >
                  <FiRefreshCw size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-white/60 text-gray-500 hover:bg-white/90 hover:text-gray-700 transition-colors"
                  aria-label="Close"
                >
                  <FiX size={15} />
                </button>
              </div>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pt-3 pb-2 space-y-4 min-h-0">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={clsx(
                    'flex flex-col',
                    message.isUser ? 'items-end' : 'items-start'
                  )}
                >
                  {!message.isUser &&
                    message.type === 'text' &&
                    !message.data?.number &&
                    !message.data?.leads && (
                      <div className="flex items-center gap-3 mb-1.5 ml-1">
                        <button
                          type="button"
                          onClick={() => {
                            copyToClipboard(message.text);
                            setCopiedIndex(index);
                            toast.success('Copied');
                            setTimeout(() => setCopiedIndex((prev) => (prev === index ? null : prev)), 600);
                          }}
                          className={clsx(
                            'p-0.5 transition-colors',
                            copiedIndex === index ? 'text-indigo-500' : 'text-gray-400 hover:text-gray-600'
                          )}
                          aria-label="Copy"
                        >
                          {copiedIndex === index ? <FiCheckCircle size={14} /> : <FiCopy size={14} />}
                        </button>
                      </div>
                    )}

                  <div
                    className={clsx(
                      'rounded-2xl px-4 py-2.5 shadow-sm',
                      message.type === 'welcome'
                        ? 'max-w-[95%] bg-white/80 backdrop-blur-sm text-gray-800 border border-white/90'
                        : message.isUser
                          ? 'max-w-[88%] bg-white/90 backdrop-blur-sm text-gray-800 border border-white/80'
                          : 'max-w-[88%] bg-white/90 backdrop-blur-sm text-gray-800 border border-white/80'
                    )}
                  >
                    <MessageContent message={message} />
                    {!message.isUser &&
                      message.type === 'text' &&
                      !message.data?.number &&
                      !message.data?.leads &&
                      translateToArabic && (
                        <div className="mt-2 flex items-center gap-2 pt-2 border-t border-gray-100">
                          {(() => {
                            const lines = message.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                            const englishLine = lines.find(l => !/[\u0600-\u06FF]/.test(l));
                            const arabicLine = lines.find(l => /[\u0600-\u06FF]/.test(l));
                            const isEnCopied = copiedEnIndex === index;
                            const isArCopied = copiedArIndex === index;
                            return (
                              <>
                                {englishLine && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(englishLine).then(() => {
                                        setCopiedEnIndex(index);
                                        toast.success('Copied English');
                                        setTimeout(() => setCopiedEnIndex((prev) => (prev === index ? null : prev)), 600);
                                      });
                                    }}
                                    className={clsx(
                                      'text-[10px] flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors',
                                      isEnCopied ? 'text-indigo-600 bg-indigo-50' : 'text-gray-500 bg-gray-50 hover:bg-gray-100'
                                    )}
                                  >
                                    {isEnCopied ? <FiCheckCircle size={10} /> : <FiCopy size={10} />}
                                    EN
                                  </button>
                                )}
                                {arabicLine && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(arabicLine).then(() => {
                                        setCopiedArIndex(index);
                                        toast.success('Copied Arabic');
                                        setTimeout(() => setCopiedArIndex((prev) => (prev === index ? null : prev)), 600);
                                      });
                                    }}
                                    className={clsx(
                                      'text-[10px] flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors',
                                      isArCopied ? 'text-indigo-600 bg-indigo-50' : 'text-gray-500 bg-gray-50 hover:bg-gray-100'
                                    )}
                                  >
                                    {isArCopied ? <FiCheckCircle size={10} /> : <FiCopy size={10} />}
                                    AR
                                  </button>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                  </div>

                  {message.isUser && isLoading && index === lastUserMessageIndex && (
                    <span className="text-[11px] text-gray-400 mt-1 mr-1">Sending</span>
                  )}
                </div>
              ))}

              {/* Thinking indicator — centered when loading */}
              {isLoading && (
                <div className="flex items-center justify-center gap-2 py-8">
                  <Sparkles size={16} className="text-indigo-500 animate-pulse" />
                  <span className="text-sm text-gray-600 font-medium">Thinking...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 px-4 pt-2 pb-4">
              <form id="tc-form" onSubmit={handleSubmit}>
                <div className="relative flex items-center">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={isLoading ? 'Wait for response...' : 'Type in English or Arabic…'}
                    className="w-full bg-white/55 backdrop-blur-md text-sm text-gray-800 placeholder:text-gray-400 rounded-full border border-white/70 py-3 pl-5 pr-14 focus:outline-none focus:ring-2 focus:ring-indigo-300/40 focus:border-white/90 shadow-sm disabled:opacity-70"
                    disabled={isLoading}
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !inputText.trim()}
                    className="absolute right-1.5 w-9 h-9 flex items-center justify-center rounded-full bg-[#a5b4fc] hover:bg-[#818cf8] text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                    aria-label="Send"
                  >
                    <ArrowUp size={18} strokeWidth={2.5} />
                  </button>
                </div>
              </form>
            </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TranslationChat; 
