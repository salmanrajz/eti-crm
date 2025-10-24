import React, { useState, useRef, useEffect } from 'react';
import { Switch } from '@headlessui/react';
import { toast } from 'react-hot-toast';
import { FiCopy, FiSend, FiX, FiMessageSquare, FiUser, FiPackage, FiCalendar, FiCheckCircle, FiAlertCircle, FiExternalLink } from 'react-icons/fi';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { NumberPool, Lead } from '../types';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import chatIcon from '../../chatbox.png';

interface Message {
  text: string;
  isUser: boolean;
  timestamp: Date;
  type?: 'number' | 'lead' | 'text';
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

const MessageContent: React.FC<{ message: Message }> = ({ message }) => {
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
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [copiedEnIndex, setCopiedEnIndex] = useState<number | null>(null);
  const [copiedArIndex, setCopiedArIndex] = useState<number | null>(null);

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
      if (chatBoxRef.current && !chatBoxRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      
      // Show welcome message if this is the first time opening
      if (!hasShownWelcome && messages.length === 0) {
        const welcomeMessage: Message = {
          text: "Hello! I'm your AI assistant. I can help you with:\n\n• Translating text between English and Arabic\n• Checking number pool status\n• Finding lead information\n\nHow may I help you today?",
          isUser: false,
          timestamp: new Date(),
          type: 'text'
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
        // Handle translation request
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'gpt-4',
            messages: [
              {
                role: 'system',
                content: effectiveTranslateToArabic
                  ? 'You are a precise translator. Output exactly two lines with no labels or extra words. Line 1: the requested English phrase only. Line 2: the Arabic translation only. Do not include text like "in Arabic", numbering, punctuation labels, or explanations. No extra lines.'
                  : 'You are a precise editor. If input is English, return the corrected English phrase only. If input is Arabic and user wants English, return only the English translation text. Do not add phrases like "in Arabic" or explanations.',
              },
              {
                role: 'user',
                content: inputText,
              },
            ],
          }),
        });

        const data = await response.json();
        const rawText: string = data?.choices?.[0]?.message?.content || '';
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
        <div className="fixed inset-0 z-[100] flex items-end justify-end p-4 sm:p-6" ref={chatBoxRef}>
          <div className="bg-white rounded-lg shadow-xl border border-gray-200 flex flex-col w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-md h-[500px] sm:h-[600px]">
            <div className="p-3 border-b flex justify-between items-center bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-t-lg">
              <div>
              <h2 className="text-sm font-semibold">AI Assistant</h2>
                <p className="text-[10px] opacity-90 -mt-0.5">Translate • Numbers • Leads</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs">Arabic</span>
                  <Switch
                    checked={translateToArabic}
                    onChange={setTranslateToArabic}
                    className={`${
                      translateToArabic ? 'bg-white/20' : 'bg-white/10'
                    } relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2`}
                  >
                    <span
                      className={`${
                        translateToArabic ? 'translate-x-4' : 'translate-x-1'
                      } inline-block h-2 w-2 transform rounded-full bg-white transition-transform`}
                    />
                  </Switch>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-white/80 hover:text-white"
                >
                  <FiX size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-gradient-to-b from-white to-gray-50/60">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${
                    message.isUser ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-3 shadow-sm ring-1 ${
                      message.isUser
                        ? 'bg-indigo-600 text-white ring-indigo-500/20'
                        : 'bg-white text-gray-800 ring-gray-200'
                    }`}
                  >
                    <MessageContent message={message} />
                    {!message.isUser && message.type === 'text' && !message.data?.number && !message.data?.leads && !message.text.includes("Hello! I'm your AI assistant") && (
                      <div className="mt-1.5 flex items-center gap-2">
                        {(() => {
                          const lines = message.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                          const englishLine = lines.find(l => !(/[\u0600-\u06FF]/.test(l)));
                          const arabicLine = lines.find(l => /[\u0600-\u06FF]/.test(l));
                          const isEnCopied = copiedEnIndex === index;
                          const isArCopied = copiedArIndex === index;
                          return (
                            <>
                              <motion.button
                                whileHover={{ scale: englishLine ? 1.04 : 1 }}
                                whileTap={{ scale: englishLine ? 0.96 : 1 }}
                                onClick={() => {
                                  if (!englishLine) return;
                                  navigator.clipboard.writeText(englishLine).then(() => {
                                    setCopiedEnIndex(index);
                                    toast.success('Copied English');
                                    setTimeout(() => setCopiedEnIndex(prev => (prev === index ? null : prev)), 600);
                                  });
                                }}
                                disabled={!englishLine}
                                className={`text-xs flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                                  englishLine ? (isEnCopied ? 'text-white bg-emerald-500' : 'text-gray-700 bg-gray-100 hover:bg-gray-200') : 'text-gray-400 bg-gray-100 cursor-not-allowed'
                                }`}
                                style={{ transition: 'all 0.15s ease-in-out' }}
                              >
                                {isEnCopied ? <FiCheckCircle size={12} /> : <FiCopy size={12} />}
                                {isEnCopied ? 'Copied' : 'Copy English'}
                              </motion.button>
                              <motion.button
                                whileHover={{ scale: arabicLine ? 1.04 : 1 }}
                                whileTap={{ scale: arabicLine ? 0.96 : 1 }}
                                onClick={() => {
                                  if (!arabicLine) return;
                                  navigator.clipboard.writeText(arabicLine).then(() => {
                                    setCopiedArIndex(index);
                                    toast.success('Copied Arabic');
                                    setTimeout(() => setCopiedArIndex(prev => (prev === index ? null : prev)), 600);
                                  });
                                }}
                                disabled={!arabicLine}
                                className={`text-xs flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                                  arabicLine ? (isArCopied ? 'text-white bg-emerald-500' : 'text-gray-700 bg-gray-100 hover:bg-gray-200') : 'text-gray-400 bg-gray-100 cursor-not-allowed'
                                }`}
                                style={{ transition: 'all 0.15s ease-in-out' }}
                              >
                                {isArCopied ? <FiCheckCircle size={12} /> : <FiCopy size={12} />}
                                {isArCopied ? 'Copied' : 'Copy Arabic'}
                              </motion.button>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {/* Typing indicator */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white ring-1 ring-gray-200 rounded-2xl px-3 py-2 shadow-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.2s]"></span>
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form id="tc-form" onSubmit={handleSubmit} className="p-3 border-t">
              <div className="flex gap-2 items-center">
                <div className="flex-1 flex items-center gap-2 bg-white rounded-full border border-gray-200 px-3 py-2 shadow-sm">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                    placeholder="Type in English or Arabic…"
                    className="flex-1 bg-transparent text-sm focus:outline-none"
                  disabled={isLoading}
                />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="bg-indigo-600 text-white w-10 h-10 rounded-full hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow"
                >
                  {isLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <FiSend size={16} />
                  )}
                </button>
              </div>
              {/* Quick suggestions */}
             
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default TranslationChat; 
