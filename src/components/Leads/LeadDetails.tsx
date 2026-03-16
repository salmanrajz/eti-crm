/**
 * ===============================================================================
 * LEAD DETAILS COMPONENT - LEAD INFORMATION AND MESSAGING INTERFACE
 * ===============================================================================
 * 
 * This component serves as the main container for individual lead management,
 * providing lead data loading, real-time messaging, and navigation between
 * different lead-related views (details, editing, creation).
 * 
 * FEATURES:
 * 
 * 1. LEAD DATA MANAGEMENT
 *    - Comprehensive lead data loading and state management
 *    - Real-time updates and data synchronization
 *    - Manager information integration and display
 *    - Proper date handling and timestamp conversion
 * 
 * 2. REAL-TIME MESSAGING SYSTEM
 *    - Live chat functionality with real-time message updates
 *    - Message history loading and display
 *    - New message creation and submission
 *    - Automatic scrolling to new messages
 * 
 * 3. NAVIGATION AND ROUTING
 *    - URL parameter handling for lead ID routing
 *    - Navigation between different lead views and states
 *    - Edit mode toggling and state management
 *    - Back navigation and routing control
 * 
 * 4. INTEGRATION WITH LEAD VIEWS
 *    - Seamless integration with LeadDetailsView for editing
 *    - CreateLead component integration for lead creation
 *    - Proper component state management and data flow
 * 
 * 5. MESSAGING FEATURES
 *    - Chat message real-time synchronization
 *    - Message input and submission handling
 *    - Scroll management for optimal user experience
 *    - Message loading and error handling
 * 
 * USAGE:
 * This component is the main entry point for individual lead management,
 * handling data loading, messaging, and routing to appropriate sub-components.
 * ===============================================================================
 */

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, collection, query, orderBy, onSnapshot, where, addDoc, getDocs } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { Lead, ChatMessage } from '../../types';
import { toast } from 'react-hot-toast';
import { Send, ArrowLeft, MessageSquare, Paperclip, Mic, Square, Loader2, Trash2, Download, Play, Pause, X, AlertCircle, AlertTriangle } from 'lucide-react';
import { Dialog } from '@headlessui/react';
import { LeadDetailsView } from './LeadDetailsView';
import { CreateLead } from './CreateLead';
import { format } from 'date-fns';
import { logNumberAction } from '../../utils/numberLogging';
import { logLeadAction } from '../../utils/leadLogging';

const VoiceNotePlayer = ({ src, durationMs, onPlay, currentlyPlaying }: { src: string; durationMs?: number; onPlay: () => void; currentlyPlaying: string | null }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationMs ? durationMs / 1000 : 0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (currentlyPlaying && currentlyPlaying !== src && isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    }
  }, [currentlyPlaying, src, isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      setCurrentTime(audio.currentTime);
      setProgress((audio.currentTime / audio.duration) * 100);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };
    
    const handleLoadedMetadata = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      } else if (durationMs) {
        setDuration(durationMs / 1000);
      }
    };

    // If duration is already available from props or metadata, set it immediately
    if (durationMs) {
      setDuration(durationMs / 1000);
    } else if (audio.duration && isFinite(audio.duration)) {
      setDuration(audio.duration);
    }

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('durationchange', handleLoadedMetadata); // Add durationchange listener

    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('durationchange', handleLoadedMetadata);
    };
  }, [durationMs, src]); // Add src dependency to reset when source changes

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        onPlay(); // Notify parent that this player is starting
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };
  
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = (Number(e.target.value) / 100) * audio.duration;
    if (isFinite(newTime)) {
      audio.currentTime = newTime;
      setProgress(Number(e.target.value));
    }
  };

  const formatTime = (time: number) => {
    if (!isFinite(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-3 bg-white rounded-full p-2 pr-4 min-w-[240px] border border-gray-200 shadow-sm">
      <button
        onClick={togglePlay}
        className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
      >
        {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
      </button>
      
      <div className="flex-1 flex flex-col justify-center min-w-[140px] pt-4">
        <div className="relative w-full h-1.5 bg-gray-100 rounded-full overflow-hidden cursor-pointer group">
          <div 
            className="absolute top-0 left-0 h-full bg-indigo-500 rounded-full transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
          <input
            type="range"
            min="0"
            max="100"
            value={progress || 0}
            onChange={handleSeek}
            className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-500 font-medium px-0.5 mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
        </div>
      </div>
      
      <audio ref={audioRef} src={src} className="hidden" preload="metadata" />
    </div>
  );
};

export function LeadDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isVerifier, isCoordinator, isAdmin } = useAuthStore();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const isCancellingRef = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingStart, setRecordingStart] = useState<number | null>(null);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const chatFormRef = useRef<HTMLFormElement>(null);
  const [showVerifyConfirm, setShowVerifyConfirm] = useState(false);
  const [pendingVerifierUpdates, setPendingVerifierUpdates] = useState<Partial<Lead> | null>(null);
  const [changeList, setChangeList] = useState<Array<{ field: string; original: string; edited: string }>>([]);
  const [isConfirmSaving, setIsConfirmSaving] = useState(false);
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState<{ reason: string; number: string } | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState<number>(0);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);
  const [userDetails, setUserDetails] = useState<Record<string, { name: string }>>({});
  // Ref-based cache of already-fetched user IDs.
  // Using a ref (not state) so the onSnapshot callback always sees the latest value
  // without stale-closure issues — state captured inside onSnapshot is frozen at setup time.
  const fetchedUserIdsRef = useRef<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<{ file: File; type: ChatMessage['mediaType']; previewUrl: string } | null>(null);
  const [showNumberErrorModal, setShowNumberErrorModal] = useState(false);
  const [missingNumbers, setMissingNumbers] = useState<string[]>([]);
  const [showChatPanel, setShowChatPanel] = useState(true);

  const scrollChatToBottom = (behavior: ScrollBehavior = 'auto') => {
    const el = chatScrollContainerRef.current;
    if (!el) return;
    const run = () => {
      el.scrollTop = el.scrollHeight;
    };
    const runSmooth = () => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    };
    // Defer until after React has committed and the browser has laid out (so scrollHeight is correct)
    const afterLayout = (fn: () => void) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(fn);
      });
    };
    if (behavior === 'smooth') {
      afterLayout(runSmooth);
    } else {
      afterLayout(run);
    }
  };

  useEffect(() => {
    if (!id) return;
    loadLead();
    // subscribeToMessages fires immediately with the full initial dataset (like getDocs),
    // so loadMessages() was a redundant duplicate read. Removed — one less Firestore query.
    const unsubscribe = subscribeToMessages();
    return () => unsubscribe();
  }, [id]);

  // When chat panel is open, hide mobile bottom nav in web by adding a body class
  useEffect(() => {
    if (showChatPanel) {
      document.body.classList.add('chat-panel-open');
    } else {
      document.body.classList.remove('chat-panel-open');
    }
    return () => {
      document.body.classList.remove('chat-panel-open');
    };
  }, [showChatPanel]);

  // Auto-scroll chat panel to bottom on load and whenever messages change
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1]?.id : null;
  useEffect(() => {
    if (!showChatPanel || messages.length === 0 || !lead) return;
    scrollChatToBottom('auto');
    const t1 = setTimeout(() => scrollChatToBottom('auto'), 80);
    const t2 = setTimeout(() => scrollChatToBottom('auto'), 250);
    const t3 = setTimeout(() => scrollChatToBottom('auto'), 600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [showChatPanel, messages.length, lastMessageId, lead]);

  // Cleanup recording and preview on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach(track => track.stop());
      }
      // Cleanup preview URL
      if (previewFile?.previewUrl) {
        URL.revokeObjectURL(previewFile.previewUrl);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // Removed auto-scroll on message changes - only scroll on page refresh
  // Auto-scroll on new messages removed per user request

  async function loadLead() {
    try {
      const leadDoc = await getDoc(doc(db, 'leads', id!));
      
      if (leadDoc.exists()) {
        const leadData = leadDoc.data();
        
        const startDate = leadData.startDate?.toDate?.() || leadData.startDate || new Date();
        const createdAt = leadData.createdAt?.toDate?.() || leadData.createdAt || new Date();
        const updatedAt = leadData.updatedAt?.toDate?.() || leadData.updatedAt || new Date();

        // Fetch manager, agent and team IN PARALLEL — previously these were 3 sequential
        // awaits (each waiting for the prior), adding up to 3 extra round-trips of latency.
        let managerData = null;
        let resolvedAgentName = '';
        let resolvedTeamName = '';

        const [managerDoc, agentDoc, teamDoc] = await Promise.all([
          leadData.managerId
            ? getDoc(doc(db, 'users', leadData.managerId)).catch(() => null)
            : Promise.resolve(null),
          leadData.agentId
            ? getDoc(doc(db, 'users', leadData.agentId)).catch((e) => { console.error('Error fetching agent data for lead:', id, e); return null; })
            : Promise.resolve(null),
          leadData.teamId
            ? getDoc(doc(db, 'teams', leadData.teamId)).catch((e) => { console.error('Error fetching team data for lead:', id, e); return null; })
            : Promise.resolve(null),
        ]);

        if (managerDoc?.exists()) {
          managerData = { id: managerDoc.id, ...managerDoc.data() };
        }
        if (agentDoc?.exists()) {
          const agentData = agentDoc.data() as any;
          resolvedAgentName = agentData.name || agentData.fullName || agentData.displayName || '';
        }
        if (teamDoc?.exists()) {
          resolvedTeamName = (teamDoc.data() as any).name || '';
        }
        
        const lead = {
          id: leadDoc.id,
          numberId: leadData.numberId,
          customerName: leadData.customerName,
          customerPhone: leadData.customerPhone,
          customerAddress: leadData.customerAddress,
          plan: leadData.plan,
          status: leadData.status,
          agentId: leadData.agentId,
          agentName: resolvedAgentName,
          verifierId: leadData.verifierId,
          coordinatorId: leadData.coordinatorId,
          assignmentId: leadData.assignmentId,
          teamId: leadData.teamId,
          teamName: resolvedTeamName,
          managerId: leadData.managerId,
          manager: managerData,
          createdAt,
          updatedAt,
          startDate,
          notes: leadData.notes || '',
          followUpDate: leadData.followUpDate?.toDate?.() || leadData.followUpDate || new Date(),
          verificationNotes: leadData.verificationNotes || '',
          coordinatorNotes: leadData.coordinatorNotes || '',
          rejectionReason: leadData.rejectionReason || '',
          customerNumber: leadData.customerNumber || '',
          country: leadData.country || '',
          customerAge: leadData.customerAge || 0,
          productType: leadData.productType || '',
          gender: leadData.gender || '',
          emirate: leadData.emirate || '',
          area: leadData.area || '',
          hasEmirateId: leadData.hasEmirateId || false,
          advancePayment: leadData.advancePayment || false,
          language: leadData.language || '',
          pendingVerificationAtLocation: leadData.pendingVerificationAtLocation || false,
          sharedWith: leadData.sharedWith || [],
          latitude: leadData.latitude || 0,
          longitude: leadData.longitude || 0,
          locationUrl: leadData.locationUrl || '',
          confirmLocationUrl: leadData.confirmLocationUrl || false,
          startTime: leadData.startTime || '',
          numberType: leadData.numberType || '',
          remarks: leadData.remarks || '',
          homeWifiEmail: leadData.homeWifiEmail || '',
          homeWifiId: leadData.homeWifiId || '',
          plans: leadData.plans || [],
          verificationMedia: leadData.verificationMedia || [],
          etisalatLeadId: leadData.etisalatLeadId || '',
          managerAssigned: leadData.managerAssigned || false,
          managerNotes: leadData.managerNotes || '',
          leadNumber: leadData.leadNumber || '',
          leadNumberGeneratedAt: leadData.leadNumberGeneratedAt?.toDate?.() || leadData.leadNumberGeneratedAt || undefined
        } as Lead;
        
        setLead(lead);
      } else {
        console.error('Lead document does not exist');
        toast.error('Lead not found');
        navigate('/dashboard/leads');
      }
    } catch (error) {
      console.error('Error loading lead:', error);
      toast.error('Failed to load lead details');
      navigate('/dashboard/leads');
    } finally {
      setLoading(false);
    }
  }


  function subscribeToMessages() {
    if (!id) return () => {};

    const q = query(
      collection(db, 'chatMessages'),
      where('leadId', '==', id),
      orderBy('createdAt', 'asc')
    );

    let isFirstEvent = true; // scroll to bottom only on the initial snapshot

    return onSnapshot(q, async (snapshot) => {
      const messagesData = snapshot.docs.map(d => {
        const data = d.data();
        const createdAt = data.createdAt?.toDate?.() || data.createdAt || new Date();
        const validDate = createdAt instanceof Date && !isNaN(createdAt.getTime())
          ? createdAt : new Date();
        return { id: d.id, ...data, createdAt: validDate };
      }) as ChatMessage[];

      setMessages(messagesData);

      // Scroll to bottom on initial load (replaces the removed loadMessages call)
      if (isFirstEvent) {
        isFirstEvent = false;
        scrollChatToBottom('auto');
      }

      // Only fetch user details for IDs not yet in the ref-based cache.
      // Previously this used `userDetails` state which was stale (frozen at {} when
      // subscribeToMessages was called), causing ALL user names to be re-fetched on
      // every single new message. The ref is always fresh regardless of closure age.
      const unseenIds = [...new Set(messagesData.map(msg => msg.userId))]
        .filter(uid => !fetchedUserIdsRef.current.has(uid));

      if (unseenIds.length === 0) return;

      // Mark as in-flight immediately so concurrent events don't double-fetch
      unseenIds.forEach(uid => fetchedUserIdsRef.current.add(uid));

      const fetched = await Promise.all(
        unseenIds.map(async (userId) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              return { id: userId, name: userData.name || userData.fullName || userData.displayName || 'Unknown User' };
            }
          } catch {
            // remove from cache so a retry is possible next event
            fetchedUserIdsRef.current.delete(userId);
          }
          return null;
        })
      );

      const valid = fetched.filter((d): d is { id: string; name: string } => d !== null);
      if (valid.length > 0) {
        setUserDetails(prev => ({
          ...prev,
          ...Object.fromEntries(valid.map(d => [d.id, { name: d.name }])),
        }));
      }
    });
  }
      
  async function addChatEntry(params: { messageText?: string; mediaUrl?: string; mediaType?: ChatMessage['mediaType']; durationMs?: number }) {
    const { messageText, mediaUrl, mediaType, durationMs } = params;
    if ((!messageText || !messageText.trim()) && !mediaUrl) {
      toast.error('Please add a message or media');
      return;
    }
    if (!user || !id) return;

    // Prevent sending messages for rejected or activated leads
    if (lead?.status === 'rejected') {
      toast.error('Cannot send messages to rejected leads');
      return;
    }
    if (lead?.status === 'activated') {
      toast.error('Cannot send messages to activated leads');
      return;
    }
    
    const textToSend = messageText?.trim() || (mediaType === 'audio' ? 'Voice note' : 'Media');
      const tempId = `temp-${Date.now()}`;
    const isTextOnly = !mediaUrl && messageText?.trim();
    const isAudio = mediaType === 'audio';
      
    try {
      // Only show "Sending..." on button for non-audio media, not for text-only or audio
      // Audio will show "Sending..." in chat box only
      if (!isTextOnly && !isAudio) {
        setSendingMessage(true);
      }
      
      const baseMessage: ChatMessage = {
        id: tempId,
        leadId: id,
        userId: user.id,
        userRole: user.role,
        message: textToSend,
        createdAt: new Date(),
        readBy: [user.id]
      };
      const message: ChatMessage = {
        ...baseMessage,
        ...(mediaUrl ? { mediaUrl } : {}),
        ...(mediaType ? { mediaType } : {}),
        ...(durationMs ? { durationMs } : {})
      };

      setMessages(prev => [...prev, message]);
      setNewMessage('');

      const payload: any = {
        leadId: id,
        userId: user.id,
        userRole: user.role,
        message: textToSend,
        createdAt: new Date(),
        readBy: [user.id]
      };
      if (mediaUrl) payload.mediaUrl = mediaUrl;
      if (mediaType) payload.mediaType = mediaType;
      if (durationMs !== undefined) payload.durationMs = durationMs;

      const docRef = await addDoc(collection(db, 'chatMessages'), payload);

      // Update message with real ID immediately
      setMessages(prev => prev.map(msg => 
        msg.id === tempId ? { ...msg, id: docRef.id } : msg
      ));

      // Reset sending state immediately for instant UI feedback
      // Only reset if we set it (non-audio media)
      if (!isTextOnly && !isAudio) {
        setSendingMessage(false);
      }
      
      // Auto-scroll to bottom after message is saved
      setTimeout(() => {
        scrollChatToBottom('smooth');
      }, 100);

      // Send notifications in background (non-blocking)
      (async () => {
        try {
          // Send WhatsApp notification to manager after message is added to chat
          if (lead && (messageText?.trim() || mediaUrl)) {
            const { sendChatMessageWhatsAppNotification } = await import('../../utils/chatNotifications');
            await sendChatMessageWhatsAppNotification(lead, textToSend, user.name || 'Unknown', mediaType);
          }

          const notificationRecipients: string[] = [];
      if (user.role !== 'agent' && lead?.agentId) {
        notificationRecipients.push(lead.agentId);
      }

      for (const recipientId of notificationRecipients) {
        if (recipientId) {
          await addDoc(collection(db, 'notifications'), {
            userId: recipientId,
            type: 'new_message',
            title: 'New Message',
                message: `${user.name}: ${textToSend}`,
            read: false,
            createdAt: new Date(),
            data: {
              leadId: id,
              messageId: docRef.id
            }
          });
        }
      }
        } catch (notificationError) {
          console.error('Error sending notifications (non-blocking):', notificationError);
          // Don't show error to user as message was already sent successfully
        }
      })();
    } catch (error) {
      console.error('Detailed error sending message:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        code: error instanceof Error ? (error as any).code : 'No code',
        stack: error instanceof Error ? error.stack : 'No stack trace',
        leadId: id,
        userId: user?.id,
        managerId: lead?.managerId
      });
      toast.error('Failed to send message. Please try again.');
      
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
      setSendingMessage(false);
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if ((!newMessage.trim() && !previewFile) || !user || !id || sendingMessage) return;
    
    // Prevent sending messages for rejected or activated leads
    if (lead?.status === 'rejected') {
      toast.error('Cannot send messages to rejected leads');
      return;
    }
    if (lead?.status === 'activated' && user?.role !== 'coordinator' && user?.role !== 'admin') {
      toast.error('Cannot send messages to activated leads');
      return;
    }

    const messageToSend = newMessage.trim();
    setNewMessage('');
    
    // If there's a preview file, upload it first
    if (previewFile) {
      const { file, type } = previewFile;
      removePreview(); // Clear preview immediately
      await handleMediaFileUpload(file, type);
    }
    
    // Send text message if there's text
    if (messageToSend) {
      await addChatEntry({ messageText: messageToSend });
    }
    
    // Auto-scroll to bottom after sending
    setTimeout(() => {
      scrollChatToBottom('smooth');
    }, 100);
  }

  async function handleLeadUpdate(updates: Partial<Lead>) {
    if (!id || !user) {
      throw new Error('Missing lead ID or user information');
    }

    try {
      // If verifier, build change list and show confirmation prior to save
      if (user.role === 'verifier' && lead) {
        const changes = buildChangeList(lead, updates);
        if (changes.length === 0) {
          toast.success('No changes detected.');
          setIsEditing(false);
          return;
        }
        setPendingVerifierUpdates(updates);
        setChangeList(changes);
        setShowVerifyConfirm(true);
        return;
      }

      // Check if lead is verified
      const leadRef = doc(db, 'leads', id);
      const leadDoc = await getDoc(leadRef);
      
      if (!leadDoc.exists()) {
        const errorMessage = 'Lead not found';
        toast.error(errorMessage);
        throw new Error(errorMessage);
      }

      const leadData = leadDoc.data() as Lead;
      
      // Validate that all numbers in lead plans exist in numberPool
      const plans = leadData.plans || [];
      const realPlans = plans.filter((p: any) => p.numberId && !p.numberId.startsWith('virtual-'));
      
      if (realPlans.length > 0) {
        const missingNumbers: string[] = [];
        const checkPromises = realPlans.map(async (plan: any) => {
          try {
            const numberRef = doc(db, 'numberPool', plan.numberId);
            const numberDoc = await getDoc(numberRef);
            if (!numberDoc.exists()) {
              missingNumbers.push(plan.number || plan.numberId);
            }
          } catch (error) {
            console.error(`Error checking number ${plan.numberId}:`, error);
            missingNumbers.push(plan.number || plan.numberId);
          }
        });
        
        await Promise.all(checkPromises);
        
        if (missingNumbers.length > 0) {
          setMissingNumbers(missingNumbers);
          setShowNumberErrorModal(true);
          throw new Error(`Number not available: ${missingNumbers.join(', ')}`);
        }
      }
      
      // If lead is verified, only allow updates from admin, manager, or coordinator
      if (leadData.status === 'verified' && !['admin', 'manager', 'coordinator'].includes(user.role)) {
        const errorMessage = 'Cannot update verified lead';
        toast.error(errorMessage);
        throw new Error(errorMessage);
      }

      // Preserve the original agentId and other important fields
      // Agent resubmission is allowed from both 'non_verified' and legacy 'follow_verification' statuses
      const isAgentResubmittingFollowUp =
        user.role === 'agent' &&
        (leadData.status === 'non_verified' || leadData.status === 'follow_verification');
      
      // For coordinators: only allow editing name, address, and age - no reverification, status remains unchanged
      let isCoordinatorEditingVerified = false;
      if (user.role === 'coordinator') {
        // Exclude status and system fields from check (these are handled separately)
        const updatesWithoutSystemFields = { ...updates };
        delete updatesWithoutSystemFields.status;
        delete updatesWithoutSystemFields.updatedAt;
        delete updatesWithoutSystemFields.updatedBy;
        
        // Allowed fields for coordinators: customerName, customerAddress, customerAge
        const allowedCoordinatorFields = ['customerName', 'customerAddress', 'customerAge'];
        
        // Check if coordinator is trying to edit non-allowed fields
        const attemptedFields = Object.keys(updatesWithoutSystemFields);
        const disallowedFields = attemptedFields.filter(field => !allowedCoordinatorFields.includes(field));
        
        if (disallowedFields.length > 0) {
          const errorMessage = `Coordinators can only edit: Name, Address, and Age. Cannot edit: ${disallowedFields.join(', ')}`;
          toast.error(errorMessage);
          throw new Error(errorMessage);
        }
        
        // Coordinator edits to allowed fields should NOT trigger reverification
        // Status will remain unchanged (handled below)
        isCoordinatorEditingVerified = false;
      }
      
      // For coordinators and admins: status should always remain unchanged
      let nextStatus;
      if (user.role === 'coordinator' || user.role === 'admin') {
        // Coordinator and admin edits should preserve the current status
        nextStatus = leadData.status;
      } else {
        nextStatus = isAgentResubmittingFollowUp ? 'pending_verification' : 
                        isCoordinatorEditingVerified ? 'pending_verification' : 
                        (updates.status || leadData.status);
      }
      
      const updateData: any = {
        ...updates,
        // If agent resubmits from non_verified, move back to pending_verification
        // For coordinators, status always remains unchanged
        status: nextStatus,
        // Preserve these fields regardless of who is updating
        agentId: leadData.agentId,
        teamId: leadData.teamId,
        managerId: leadData.managerId,
        updatedAt: new Date(),
        updatedBy: user.id
      };

      // If status changes, ensure plan statuses are aligned with the lead status
      const statusChanged = nextStatus !== leadData.status;
      if (statusChanged) {
        if (updates.plans && Array.isArray(updates.plans)) {
          updateData.plans = updates.plans.map((p: any) => ({
            ...p,
            status: nextStatus
          }));
        } else if (leadData.plans && Array.isArray(leadData.plans)) {
          updateData.plans = leadData.plans.map((p: any) => ({
            ...p,
            status: nextStatus
          }));
        }
      }

      // Update the lead in Firestore
      await updateDoc(leadRef, updateData);
      
      // Log lead update
      try {
        const action: 'updated' | 'status_changed' | 'resubmitted' = statusChanged 
          ? 'status_changed' 
          : isAgentResubmittingFollowUp 
            ? 'resubmitted' 
            : 'updated';
        
        await logLeadAction(
          id,
          leadData.leadNumber || id,
          action,
          leadData,
          { ...leadData, ...updateData },
          statusChanged 
            ? `Status changed from ${leadData.status} to ${nextStatus}` 
            : isAgentResubmittingFollowUp 
              ? 'Lead resubmitted by agent' 
              : 'Lead updated'
        );
      } catch (error) {
        console.error('Error logging lead update:', error);
      }

      // Handle number status changes when plans are modified
      if (updates.plans) {
        const oldPlans = leadData.plans || [];
        const newPlans = updates.plans || [];
        
        // Find removed numbers (in old plans but not in new plans)
        const removedNumbers = oldPlans.filter((oldPlan: any) => 
          !newPlans.some((newPlan: any) => newPlan.numberId === oldPlan.numberId)
        );
        
        // Find added numbers (in new plans but not in old plans)
        const addedNumbers = newPlans.filter((newPlan: any) => 
          !oldPlans.some((oldPlan: any) => oldPlan.numberId === newPlan.numberId)
        );
        
        // Validate added numbers: only numberPool; number must be open or reserved by this agent.
        // Skip when verifier/coordinator/admin is editing – the number is already reserved for the agent.
        const skipNumberPoolCheck = isVerifier() || isCoordinator() || isAdmin();
        const addedReal = addedNumbers.filter((p: any) => p?.numberId && !p.numberId.startsWith('virtual-'));
        if (!skipNumberPoolCheck && addedReal.length > 0) {
          const currentAgentId = leadData.agentId || user?.id || '';
          for (let i = 0; i < addedReal.length; i++) {
            const plan = addedReal[i];
            const poolSnap = await getDoc(doc(db, 'numberPool', plan.numberId));
            const displayNumber = plan.number || plan.numberId;
            if (!poolSnap.exists()) {
              setMissingNumbers([displayNumber]);
              setShowNumberErrorModal(true);
              throw new Error('Number not in pool');
            }
            const data = poolSnap.data();
            const status = data?.status;
            const reservedBy = data?.reservedBy;
            // Only allow if status is exactly 'open' or exactly 'reserved' by this agent.
            const allowed =
              status === 'open' ||
              (status === 'reserved' && reservedBy === currentAgentId);
            if (!allowed) {
              setMissingNumbers([displayNumber]);
              setShowNumberErrorModal(true);
              throw new Error('Number not available');
            }
          }
        }
        
        // Find existing numbers (in both old and new plans)
        const existingNumbers = newPlans.filter((newPlan: any) => 
          oldPlans.some((oldPlan: any) => oldPlan.numberId === newPlan.numberId)
        );
        
        const updatePromises: Promise<void>[] = [];
        
        // Handle removed numbers - set to 'open'
        removedNumbers.forEach((plan: any) => {
          if (plan?.numberId) {
            updatePromises.push(
              updateDoc(doc(db, 'numberPool', plan.numberId), {
                status: 'open',
                lastStatusChange: new Date(),
                leadId: null,
                reservedBy: null,
                claimingAgentId: null,
                originalAgentId: null
              }).then(() => {
                // Log the number release
                return logNumberAction(
                  plan.numberId,
                  plan.number || '',
                  'lead_removed',
                  { status: plan.status, leadId: id },
                  { status: 'open', leadId: null },
                  `Number removed from lead by ${user.name}`
                );
              })
            );
          }
        });
        
        // Handle added numbers - set status based on user role and lead status
        addedNumbers.forEach((plan: any) => {
          if (plan?.numberId) {
            // For admins, new numbers inherit the current lead status
            // For others, new numbers go to 'pending_verification'
            const newStatus = user.role === 'admin' ? nextStatus : 'pending_verification';
            
            updatePromises.push(
              updateDoc(doc(db, 'numberPool', plan.numberId), {
                status: newStatus,
                lastStatusChange: new Date(),
                leadId: id,
                reservedBy: leadData.agentId
              }).then(() => {
                // Log the number assignment
                return logNumberAction(
                  plan.numberId,
                  plan.number || '',
                  'lead_assigned',
                  { status: 'open' },
                  { status: newStatus, leadId: id },
                  `Number added to lead by ${user.name}`
                );
              })
            );
          }
        });
        
        // Handle existing numbers - update status based on lead status changes
        if (isAgentResubmittingFollowUp || user.role === 'verifier' || isCoordinatorEditingVerified) {
          existingNumbers.forEach((plan: any) => {
            if (plan?.numberId) {
              updatePromises.push(
                updateDoc(doc(db, 'numberPool', plan.numberId), {
                  status: 'pending_verification',
                  lastStatusChange: new Date(),
                  leadId: id
                })
              );
            }
          });
        }
        
        await Promise.all(updatePromises);
      }


      // Send notification to verifiers when coordinator edits verified lead
      if (isCoordinatorEditingVerified) {
        try {
          // Get all verifiers to notify them about the lead going back to verification
          const verifiersQuery = query(
            collection(db, 'users'),
            where('role', '==', 'verifier')
          );
          const verifiersSnapshot = await getDocs(verifiersQuery);
          
          const notificationPromises = verifiersSnapshot.docs.map(async (verifierDoc) => {
            const verifierData = verifierDoc.data();
            return addDoc(collection(db, 'notifications'), {
              userId: verifierDoc.id,
              type: 'lead_verification',
              title: 'Lead Requires Re-verification',
              message: `Coordinator ${user.name} has updated a verified lead and it requires re-verification`,
              read: false,
              createdAt: new Date(),
              data: {
                leadId: id,
                customerName: lead?.customerName,
                customerNumber: lead?.customerNumber,
                selectedNumber: lead?.plans?.[0]?.number,
                status: 'pending_verification',
                coordinatorName: user?.name,
                reason: 'Lead updated by coordinator'
              }
            });
          });

          await Promise.all(notificationPromises);
        } catch (error) {
          console.error('Error sending verifier notifications:', error);
        }
      }

      // Create notification for relevant users
      const notificationRecipients: string[] = [];
      
      // Only send notification to agent if the update is not from the agent
      if (user.role !== 'agent' && lead?.agentId) {
        notificationRecipients.push(lead.agentId);
      }

      // Create notifications for each recipient
      for (const recipientId of notificationRecipients) {
        if (recipientId) {
          await addDoc(collection(db, 'notifications'), {
            userId: recipientId,
            type: 'lead_update',
            title: isAgentResubmittingFollowUp ? 'Lead Resubmitted' : 'Lead Updated',
            message: isAgentResubmittingFollowUp ? `${user.name} resubmitted the lead for verification` : `${user.name} updated the lead`,
            read: false,
            createdAt: new Date(),
            data: {
              leadId: id
            }
          });
        }
      }

      // Update local state
      setLead(prev => prev ? { ...prev, ...updates, status: nextStatus } : null);
      let successMessage = 'Lead updated successfully';
      if (isAgentResubmittingFollowUp) {
        successMessage = 'Lead resubmitted for verification';
      } else if (isCoordinatorEditingVerified) {
        successMessage = 'Lead updated and sent back to verification';
      }
      toast.success(successMessage);
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating lead:', error);
      toast.error('Failed to update lead');
    }
  }

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    
    // Check file size (3 MB = 3 * 1024 * 1024 bytes)
    const maxSize = 3 * 1024 * 1024; // 3 MB
    if (file.size > maxSize) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      const errorMessage = `File "${file.name}" is ${fileSizeMB} MB. Maximum allowed: 3 MB. Please choose a smaller file.`;
      
      // Show error banner above chat input
      setFileSizeError(errorMessage);
      
      // Auto-hide after 8 seconds
      setTimeout(() => {
        setFileSizeError(null);
      }, 8000);
      
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }
    
    // Clear any previous error and preview
    setFileSizeError(null);
    if (previewFile?.previewUrl) {
      URL.revokeObjectURL(previewFile.previewUrl);
    }
    
    const isPdf = file.type === 'application/pdf';
    const mediaType: ChatMessage['mediaType'] =
      file.type.startsWith('image') ? 'image' :
      file.type.startsWith('video') ? 'video' :
      file.type.startsWith('audio') ? 'audio' :
      isPdf ? 'pdf' : 'file';
    
    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setPreviewFile({ file, type: mediaType, previewUrl });
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removePreview = () => {
    if (previewFile?.previewUrl) {
      URL.revokeObjectURL(previewFile.previewUrl);
    }
    setPreviewFile(null);
  };

  const cancelRecording = () => {
    if (!recording) return;
    
    // Set flag to prevent processing in onstop handler
    isCancellingRef.current = true;
    
    // Stop animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    
    // Clear interval
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    
    // Clear chunks to prevent processing
    recordingChunksRef.current = [];
    
    // Stop recorder (onstop will check isCancellingRef and skip processing)
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        // Ignore errors if already stopped
      }
      mediaRecorderRef.current = null;
    }
    
    // Stop audio context
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    
    // Stop stream tracks
    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach(track => track.stop());
      recordingStreamRef.current = null;
    }
    
    // Reset state
    setRecording(false);
    setRecordingStart(null);
    setRecordingElapsed(0);
    // Keep isCancellingRef.current = true until onstop completes
  };

  const stopRecording = async (sendAfterStop: boolean = true) => {
    if (!recording || !mediaRecorderRef.current) return;
    
    // Clear interval
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    
    if (!sendAfterStop) {
      // Cancel recording
      cancelRecording();
      return;
    }
    
    // Stop recording (will trigger onstop handler to send)
    setRecording(false);
    mediaRecorderRef.current.stop();
  };

  const startRecording = async () => {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      // Reset cancellation flag and clear chunks
      isCancellingRef.current = false;
      recordingChunksRef.current = [];
      
      // Store references
      mediaRecorderRef.current = recorder;
      recordingStreamRef.current = stream;
      
      const startTime = Date.now();
      setRecording(true);
      setRecordingStart(startTime);
      setRecordingElapsed(0);

      // Set up audio visualization
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      recorder.ondataavailable = (e) => {
        // Only add chunks if not cancelling and data exists
        if (!isCancellingRef.current && e.data.size > 0) {
          recordingChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        // Stop animation frame
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        
        // Clear interval
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
          recordingIntervalRef.current = null;
        }
        
        // Stop audio context
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
        analyserRef.current = null;
        
        // Stop stream tracks
        if (recordingStreamRef.current) {
          recordingStreamRef.current.getTracks().forEach(t => t.stop());
          recordingStreamRef.current = null;
        }
        
        // Check cancellation flag BEFORE processing
        const wasCancelled = isCancellingRef.current;
        const hasChunks = recordingChunksRef.current.length > 0;
        
        // Reset cancellation flag
        isCancellingRef.current = false;
        
        // Only process if not cancelled and we have chunks with actual data
        if (!wasCancelled && hasChunks) {
          // Verify chunks have actual audio data (at least 1KB to avoid empty recordings)
          let totalSize = 0;
          for (const chunk of recordingChunksRef.current) {
            if (chunk instanceof Blob) {
              totalSize += chunk.size;
            } else {
              totalSize += (chunk as any).length || 0;
            }
          }
          
          // Only upload if we have meaningful audio data
          if (totalSize > 1024) {
            try {
              const blob = new Blob(recordingChunksRef.current, { type: 'audio/webm' });
              const file = new File([blob], `voice-note-${Date.now()}.webm`, { type: 'audio/webm' });
              const durationMs = recordingStart ? Date.now() - recordingStart : undefined;
              await handleMediaFileUpload(file, 'audio', durationMs);
            } catch (error) {
              console.error('Error processing recording:', error);
              toast.error('Failed to save voice note');
            }
          }
        }
        
        // Reset state
        setRecording(false);
        setRecordingStart(null);
        setRecordingElapsed(0);
        mediaRecorderRef.current = null;
        recordingChunksRef.current = [];
      };

      // Start with timeslice for faster chunk processing
      recorder.start(1000); // Request data every second for faster processing
      
      // Start waveform visualization
      const drawWaveform = () => {
        if (!analyserRef.current || !waveformCanvasRef.current || !mediaRecorderRef.current) {
          return;
        }
        
        // Check if recorder is still recording
        if (mediaRecorderRef.current.state === 'inactive') {
          return;
        }
        
        const canvas = waveformCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // Ensure canvas dimensions - use higher resolution for sharper rendering
        if (canvas.width !== 600) canvas.width = 600;
        if (canvas.height !== 100) canvas.height = 100;
        
        const analyser = analyserRef.current;
        const bufferLength = analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        
        // Use time domain data for waveform/ECG style
        analyser.getByteTimeDomainData(dataArray);
        
        // Clear canvas with light background
        ctx.fillStyle = '#fef2f2'; // Light red background
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw ECG-style waveform line
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ef4444'; // Red color
        ctx.beginPath();
        
        const sliceWidth = canvas.width * 1.0 / bufferLength;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
          // Normalize value centered around 128 (silence)
          // Range 0-255 -> -1.0 to 1.0
          const normalized = (dataArray[i] - 128) / 128.0;
          
          // Apply significant gain to make waves larger
          // 3x multiplier to stretch the wave vertically
          const amplified = normalized * 3.0;
          
          // Convert back to canvas coordinate (0 is top, height is bottom)
          // Center is height/2
          // We invert y because canvas y increases downward
          const y = (canvas.height / 2) + (amplified * (canvas.height / 2));
          
          // Clamp to canvas bounds to prevent drawing outside
          const clampedY = Math.max(0, Math.min(canvas.height, y));
          
          if (i === 0) {
            ctx.moveTo(x, clampedY);
          } else {
            ctx.lineTo(x, clampedY);
          }
          
          x += sliceWidth;
        }
        
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
        
        animationFrameRef.current = requestAnimationFrame(drawWaveform);
      };
      
      // Start drawing immediately and ensure it continues
      const startDrawing = () => {
        if (waveformCanvasRef.current && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          drawWaveform();
        } else {
          // Retry if canvas/recorder not ready yet
          setTimeout(startDrawing, 50);
        }
      };
      startDrawing();
      
      // Update elapsed time every second
      recordingIntervalRef.current = setInterval(() => {
        setRecordingElapsed(Date.now() - startTime);
      }, 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Microphone permission denied or unavailable');
    }
  };

  const handleDownload = async (e: React.MouseEvent<HTMLAnchorElement>, url: string, filename: string) => {
    e.preventDefault();
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback to opening in new tab
      window.open(url, '_blank');
    }
  };

  const handleMediaFileUpload = async (file: File, mediaType: ChatMessage['mediaType'], durationMs?: number) => {
    if (!id || !user) return;
    
    // Check file size (3 MB = 3 * 1024 * 1024 bytes)
    const maxSize = 3 * 1024 * 1024; // 3 MB
    if (file.size > maxSize) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      const errorMessage = `File "${file.name}" is ${fileSizeMB} MB. Maximum allowed: 3 MB. Please choose a smaller file.`;
      
      // Show error banner above chat input
      setFileSizeError(errorMessage);
      
      // Auto-hide after 8 seconds
      setTimeout(() => {
        setFileSizeError(null);
      }, 8000);
      
      return;
    }
    
    // Create temporary message for optimistic UI
    const tempId = `temp-${Date.now()}`;
    const tempUrl = URL.createObjectURL(file);
    
    const baseMessage: ChatMessage = {
      id: tempId,
      leadId: id,
      userId: user.id,
      userRole: user.role,
      message: file.name,
      createdAt: new Date(),
      readBy: [user.id]
    };
    
    const message: ChatMessage = {
      ...baseMessage,
      mediaUrl: tempUrl,
      mediaType,
      ...(durationMs ? { durationMs } : {})
    };

    // Add to UI immediately
    setMessages(prev => [...prev, message]);
    
    // Scroll to bottom
    setTimeout(() => {
      scrollChatToBottom('smooth');
    }, 100);
    
    // For non-audio media, show loading state on button
    if (mediaType !== 'audio') {
      setUploadingMedia(true);
    }
    
    try {
      const storage = getStorage();
      const storageRef = ref(storage, `leads/${id}/chat/${Date.now()}-${file.name}`);
      
      // Optimize upload: use smaller chunks for faster processing
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      
      // Save to Firestore
      const payload: any = {
        leadId: id,
        userId: user.id,
        userRole: user.role,
        message: file.name,
        mediaUrl: url,
        mediaType,
        createdAt: new Date(),
        readBy: [user.id]
      };
      if (durationMs !== undefined) payload.durationMs = durationMs;
      
      const docRef = await addDoc(collection(db, 'chatMessages'), payload);
      
      // Update message with real ID and URL
      setMessages(prev => prev.map(msg => 
        msg.id === tempId ? { ...msg, id: docRef.id, mediaUrl: url } : msg
      ));

      // Send notifications in background (non-blocking)
      (async () => {
        try {
          // Send WhatsApp notification for media messages
          if (lead) {
            const { sendChatMessageWhatsAppNotification } = await import('../../utils/chatNotifications');
            await sendChatMessageWhatsAppNotification(lead, file.name, user.name || 'Unknown', mediaType);
          }

          const notificationRecipients: string[] = [];
          if (user.role !== 'agent' && lead?.agentId) {
            notificationRecipients.push(lead.agentId);
          }

          for (const recipientId of notificationRecipients) {
            if (recipientId) {
              await addDoc(collection(db, 'notifications'), {
                userId: recipientId,
                type: 'new_message',
                title: 'New Message',
                message: `${user.name}: Sent ${mediaType}`,
                read: false,
                createdAt: new Date(),
                data: {
                  leadId: id,
                  messageId: docRef.id
                }
              });
            }
          }
        } catch (error) {
          console.error('Error sending background notifications:', error);
        }
      })();
      
    } catch (error) {
      console.error('Error uploading media file:', error);
      toast.error('Failed to upload media');
      // Remove failed message
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
    } finally {
      if (mediaType !== 'audio') {
        setUploadingMedia(false);
      }
      // Revoke temp URL to free memory
      URL.revokeObjectURL(tempUrl);
    }
  };

  function formatValueForDisplay(key: string, value: any): string {
    if (value === null || value === undefined) return '';
    if (key === 'plans' && Array.isArray(value)) {
      return value.map((p: any) => `${p.number || ''}${p.plan ? ` (${p.plan})` : ''}`).join(', ');
    }
    if (key === 'sharedWith' && Array.isArray(value)) {
      return value.join(', ');
    }
    if (value instanceof Date) {
      return format(value, 'MMM d, yyyy HH:mm');
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    return String(value);
  }

  function buildChangeList(original: Lead, updates: Partial<Lead>) {
    const displayNames: Record<string, string> = {
      customerName: 'Customer Name',
      customerNumber: 'Customer Number',
      customerAddress: 'Address',
      country: 'Country',
      customerAge: 'Age',
      productType: 'Product Type',
      gender: 'Gender',
      emirate: 'Emirate',
      area: 'Area',
      hasEmirateId: 'Emirates ID Available',
      advancePayment: 'Advance Payment',
      language: 'Language',
      sharedWith: 'Shared With',
      locationUrl: 'Location URL',
      startDate: 'Date',
      startTime: 'Time',
      numberType: 'Number Type',
      remarks: 'Remarks',
      plans: 'Plans'
    };

    const ignoreKeys = new Set(['updatedAt', 'updatedBy', 'agentId', 'teamId', 'managerId', 'verifierId', 'createdAt']);
    const changes: Array<{ field: string; original: string; edited: string }> = [];
    Object.keys(updates).forEach((key) => {
      if (ignoreKeys.has(key)) return;
      const edited = (updates as any)[key];
      const originalVal = (original as any)[key];
      
      // Special handling for plans: check if plans are actually the same
      if (key === 'plans') {
        const originalPlans = originalVal || [];
        const editedPlans = edited || [];
        
        // Compare plans by numberId, number, and plan
        const plansEqual = originalPlans.length === editedPlans.length &&
          originalPlans.every((origPlan: any, index: number) => {
            const editPlan = editedPlans[index];
            return origPlan?.numberId === editPlan?.numberId &&
                   origPlan?.number === editPlan?.number &&
                   origPlan?.plan === editPlan?.plan;
          });
        
        if (plansEqual) {
          return; // Skip if plans are the same
        }
      }
      
      const isEqual = JSON.stringify(edited) === JSON.stringify(originalVal);
      if (!isEqual) {
        const fieldName = displayNames[key] || key;
        changes.push({
          field: fieldName,
          original: formatValueForDisplay(key, originalVal),
          edited: formatValueForDisplay(key, edited)
        });
      }
    });
    return changes;
  }

  async function confirmVerifierSave() {
    if (!pendingVerifierUpdates || !id || !user) return;
    try {
      setIsConfirmSaving(true);
      // Proceed with actual save using the same logic as non-verifier path
      const leadRef = doc(db, 'leads', id);
      const leadDoc = await getDoc(leadRef);
      if (!leadDoc.exists()) {
        toast.error('Lead not found');
        return;
      }
      const leadData = leadDoc.data();
      if (leadData.status === 'verified' && !['admin', 'manager', 'coordinator'].includes(user.role)) {
        toast.error('Cannot update verified lead');
        return;
      }
      // Capture old data for logging (before update)
      const oldDataForLog = { ...leadData };
      
      const updateData = {
        ...pendingVerifierUpdates,
        // Preserve current status for activated_non_verified so it does NOT revert to pending_verification on edit
        status: leadData.status === 'activated_non_verified' ? 'activated_non_verified' : pendingVerifierUpdates.status || leadData.status,
        agentId: leadData.agentId,
        teamId: leadData.teamId,
        managerId: leadData.managerId,
        updatedAt: new Date(),
        updatedBy: user.id
      };
      
      await updateDoc(leadRef, updateData);
      
      // Fetch updated lead data for logging
      const updatedLeadDoc = await getDoc(leadRef);
      const newDataForLog = updatedLeadDoc.exists() ? updatedLeadDoc.data() : { ...leadData, ...updateData };
      
      // Build detailed change list for logging
      const changedFields: string[] = [];
      const changeDetails: string[] = [];
      
      // Helper function to format values for display
      const formatValue = (val: any): string => {
        if (val === null) return 'null';
        if (val === undefined) return 'undefined';
        if (typeof val === 'object') {
          if (Array.isArray(val)) {
            return `[${val.length} item${val.length !== 1 ? 's' : ''}]`;
          }
          // For objects, show a summary
          const keys = Object.keys(val);
          if (keys.length === 0) return '{}';
          return `{${keys.length} field${keys.length !== 1 ? 's' : ''}}`;
        }
        const str = String(val);
        // Truncate very long strings
        return str.length > 50 ? str.substring(0, 47) + '...' : str;
      };
      
      // Compare all fields that were updated
      const fieldsToCheck = new Set([
        ...Object.keys(updateData),
        ...Object.keys(oldDataForLog)
      ]);
      
      fieldsToCheck.forEach(key => {
        // Skip system fields that change automatically
        if (key === 'updatedAt' || key === 'updatedBy') return;
        
        const oldValue = oldDataForLog[key];
        const newValue = newDataForLog[key];
        
        // Check if value actually changed
        let isEqual = false;
        
        if (oldValue === newValue) {
          isEqual = true;
        } else if (oldValue === null || oldValue === undefined || newValue === null || newValue === undefined) {
          isEqual = false; // One is null/undefined and the other isn't
        } else if (typeof oldValue === 'object' && typeof newValue === 'object') {
          // Deep comparison for objects/arrays
          try {
            isEqual = JSON.stringify(oldValue) === JSON.stringify(newValue);
          } catch {
            // If JSON.stringify fails, consider them different
            isEqual = false;
          }
        } else {
          isEqual = false;
        }
        
        if (!isEqual) {
          changedFields.push(key);
          changeDetails.push(`${key}: "${formatValue(oldValue)}" → "${formatValue(newValue)}"`);
        }
      });
      
      // Log verifier changes with complete old and new data
      try {
        const detailsText = changedFields.length > 0
          ? `Verifier ${user.name || user.email} updated lead. Changed fields: ${changedFields.join(', ')}. Changes: ${changeDetails.join('; ')}`
          : `Verifier ${user.name || user.email} updated lead`;
        
        await logLeadAction(
          id,
          leadData.leadNumber || id,
          'updated',
          oldDataForLog,
          newDataForLog,
          detailsText
        );
      } catch (logError) {
        console.error('Error logging verifier lead update:', logError);
        // Don't fail the update if logging fails
      }
      if (pendingVerifierUpdates.plans && user.role === 'verifier') {
        const originalPlans = (leadData.plans || []).filter((p: any) => p?.numberId && !p.numberId.startsWith('virtual-'));
        const newPlans = pendingVerifierUpdates.plans.filter(p => !p.numberId?.startsWith('virtual-'));
        
        // Find removed numbers (in original plans but not in new plans)
        const removedNumbers = originalPlans.filter((oldPlan: any) => 
          !newPlans.some((newPlan: any) => newPlan.numberId === oldPlan.numberId)
        );
        
        const updatePromises: Promise<void>[] = [];
        
        // Handle removed numbers - set to 'open'
        removedNumbers.forEach((plan: any) => {
          if (plan?.numberId) {
            updatePromises.push(
              (async () => {
                try {
                  const numberRef = doc(db, 'numberPool', plan.numberId);
                  const numberDoc = await getDoc(numberRef);
                  
                  if (numberDoc.exists()) {
                    const numberData = numberDoc.data();
                    await updateDoc(numberRef, {
                      status: 'open',
                      lastStatusChange: new Date(),
                      leadId: null,
                      reservedBy: null,
                      reservedAt: null,
                      claimingAgentId: null,
                      claimingStartedAt: null,
                      claimingExpiresAt: null,
                      claimQueue: []
                    });
                    
                    // Log the number release
                    await logNumberAction(
                      plan.numberId,
                      plan.number || '',
                      'lead_removed',
                      { status: numberData?.status || 'unknown', leadId: id },
                      { status: 'open', leadId: null },
                      `Number removed from lead by verifier ${user.name}`
                    );
                  }
                } catch (err) {
                  console.error('Failed updating removed number in numberPool', plan.numberId, err);
                }
              })()
            );
          }
        });
        
        // Handle remaining/new numbers - update status and reserve for lead creator (agent), never for verifier
        const realPlans = newPlans;
        const agentId = leadData.agentId;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        realPlans.forEach((plan: any) => {
          updatePromises.push(
            (async () => {
          try {
            const numberRef = doc(db, 'numberPool', plan.numberId);
            await updateDoc(numberRef, {
              status: leadData.status === 'activated_non_verified' ? 'activated_non_verified' : 'pending_verification',
              lastStatusChange: now,
              leadId: id,
              // Always reserve for the lead creator (agent); never link the verifier's id to the number
              reservedBy: agentId || null,
              reservedAt: now,
              expiresAt
            });
          } catch (err) {
            console.error('Failed updating numberPool for plan', plan.numberId, err);
          }
            })()
          );
        });
        
        await Promise.all(updatePromises);
      }
      setLead(prev => prev ? { ...prev, ...pendingVerifierUpdates } : null);
      toast.success('Lead updated successfully');
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating lead:', error);
      toast.error('Failed to update lead');
    } finally {
      setIsConfirmSaving(false);
      setShowVerifyConfirm(false);
      setPendingVerifierUpdates(null);
      setChangeList([]);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  if (!lead && !loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Lead not found</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-2 px-0 sm:px-4 md:px-6 lg:px-8"
      style={{
        paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="w-full max-w-6xl mx-auto">
          <div className="mb-4 px-2 sm:px-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button
              onClick={() => navigate('/dashboard/leads')}
              className="inline-flex items-center min-h-[44px] px-3 py-2 text-xs sm:text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 touch-manipulation"
            >
              <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 flex-shrink-0" />
              <span className="whitespace-nowrap">Back to Leads</span>
            </button>
            <div className="flex-1 text-center mx-2 sm:mx-4 min-w-0 hidden sm:block">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 truncate">Lead Details</h1>
              <p className="mt-0.5 sm:mt-1 text-xs sm:text-sm md:text-base text-gray-600">View and manage lead information</p>
            </div>
            <div className="flex items-center gap-2">
              {lead && (
                <button
                  onClick={() => setShowChatPanel(true)}
                  className="inline-flex items-center min-h-[44px] px-3 py-2 text-xs sm:text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 touch-manipulation"
                >
                  <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 flex-shrink-0" />
                  <span className="whitespace-nowrap">Chat</span>
                </button>
              )}
              <button
                onClick={() => navigate('/dashboard')}
                className="inline-flex items-center min-h-[44px] px-3 py-2 text-xs sm:text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 touch-manipulation"
              >
                <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 flex-shrink-0" />
                <span className="whitespace-nowrap">Back to Dashboard</span>
              </button>
            </div>
          </div>
      </div>

        <div className="space-y-4 sm:space-y-6">
        {/* Lead Details */}
          {lead && !isEditing && (
            <LeadDetailsView
              lead={lead}
              onEdit={() => setIsEditing(true)}
              isResubmitting={isResubmitting}
              onResubmit={async () => {
                if (!id || !user) return;
                try {
                  setIsResubmitting(true);
                  const leadRef = doc(db, 'leads', id);
                  const current = await getDoc(leadRef);
                  if (!current.exists()) return;
                  const data = current.data();
                  // Allow agent resubmission for both 'non_verified' and legacy 'follow_verification' statuses
                  // Also allow multi-team managers to resubmit leads from their managed teams
                  const canResubmit = (user.role === 'agent' && data.agentId === user.id) ||
                    (user.role === 'manager' && user.managedTeams && user.managedTeams.includes(data.teamId || '') && (data.status === 'non_verified' || data.status === 'follow_verification'));

                  if (canResubmit) {
                    // Get all numbers attached to this lead
                    const plans = (data.plans || []).filter((p: any) => p?.numberId && !p.numberId.startsWith('virtual-'));
                    
                    // Validate that all numbers are either open or reserved by this agent
                    const numberChecks = await Promise.all(
                      plans.map(async (p: any) => {
                        try {
                          const numberRef = doc(db, 'numberPool', p.numberId);
                          const numberDoc = await getDoc(numberRef);
                          if (!numberDoc.exists()) {
                            return { numberId: p.numberId, valid: false, reason: 'Number not found' };
                          }
                          const numberData = numberDoc.data();
                          const numberStatus = numberData?.status;
                          const reservedBy = numberData?.reservedBy;
                          const numberLeadId = numberData?.leadId;
                          
                          // Number is valid only if: open, OR reserved by this agent, OR attached to this lead with resubmittable status (non_verified/follow_verification)
                          const isOpen = numberStatus === 'open';
                          const isReservedByAgent = numberStatus === 'reserved' && (reservedBy === user.id || reservedBy === data.agentId);
                          const isOnThisLeadResubmittable = numberLeadId === id && ['non_verified', 'follow_verification'].includes(numberStatus);
                          const isValid = isOpen || isReservedByAgent || isOnThisLeadResubmittable;
                          
                          if (!isValid) {
                            const reason = numberStatus === 'reserved' 
                              ? 'Number is reserved by another agent'
                              : numberStatus === 'follow_up' || numberStatus === 'verified' || numberStatus === 'assigned' || numberStatus === 'activated'
                              ? `Number is in use (status: ${numberStatus}). It must be open or reserved by you to resubmit.`
                              : `Number status is ${numberStatus}`;
                            return { numberId: p.numberId, valid: false, reason, number: numberData?.number || p.numberId };
                          }
                          
                          return { numberId: p.numberId, valid: true };
                        } catch (error) {
                          console.error(`Error checking number ${p.numberId}:`, error);
                          return { numberId: p.numberId, valid: false, reason: 'Error checking number status' };
                        }
                      })
                    );
                    
                    // Check if any numbers are invalid
                    const invalidNumbers = numberChecks.filter(check => !check.valid);
                    if (invalidNumbers.length > 0) {
                      const invalidNumber = invalidNumbers[0];
                      const numberDisplay = invalidNumber.number || invalidNumber.numberId;
                      setResubmitError({
                        reason: invalidNumber.reason,
                        number: numberDisplay
                      });
                      setIsResubmitting(false);
                      return;
                    }
                    
                    // All numbers are valid, proceed with resubmission
                    await updateDoc(leadRef, {
                      status: 'pending_verification',
                      updatedAt: new Date(),
                      updatedBy: user.id
                    });
                    // Update numbers to pending_verification
                    await Promise.all(
                      plans.map((p: any) => updateDoc(doc(db, 'numberPool', p.numberId), {
                        status: 'pending_verification',
                        lastStatusChange: new Date(),
                        leadId: id
                      }))
                    );
                    setLead(prev => prev ? { ...prev, status: 'pending_verification' } : prev);
                    toast.success('Lead resubmitted for verification');
                  }
                } catch (e) {
                  console.error(e);
                  toast.error('Failed to resubmit lead');
                } finally {
                  setIsResubmitting(false);
                }
              }}
            />
          )}
          {lead && isEditing && (
            <CreateLead
              isEditing={true}
              initialData={lead}
              onSave={handleLeadUpdate}
              onCancel={() => setIsEditing(false)}
            />
          )}

          {showVerifyConfirm && user?.role === 'verifier' && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-3xl w-full mx-4 shadow-xl">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Confirm Changes</h3>
                {changeList.length === 0 ? (
                  <p className="text-gray-600">No changes detected.</p>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Field Name</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Original Value</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Edited Value</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {changeList.map((c, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-2 text-sm text-gray-900 font-medium">{c.field}</td>
                            <td className="px-4 py-2 text-sm text-gray-600">{c.original || '-'}</td>
                            <td className="px-4 py-2 text-sm text-gray-900">{c.edited || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setShowVerifyConfirm(false);
                      setPendingVerifierUpdates(null);
                      setChangeList([]);
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                  {changeList.length > 0 && (
                    <button
                      onClick={confirmVerifierSave}
                      disabled={isConfirmSaving}
                      className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${isConfirmSaving ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                    >
                      {isConfirmSaving ? 'Saving...' : 'Confirm & Save'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Resubmit Error Card */}
          {resubmitError && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl p-6 sm:p-8 max-w-md w-full mx-4 shadow-xl">
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-red-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900">Cannot Resubmit Lead</h3>
                </div>
                <div className="mb-6">
                  <p className="text-gray-700 mb-2">
                    <span className="font-medium">Reason:</span> {resubmitError.reason}
                  </p>
                  <p className="text-gray-700">
                    <span className="font-medium">Number:</span> {resubmitError.number}
                  </p>
                  <p className="text-sm text-gray-500 mt-3">
                    The number attached to this lead is not available for resubmission. Please ensure the number is either open or reserved by you.
                  </p>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => setResubmitError(null)}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

        {/* Lead Chat - Right-side popup panel (responsive + safe areas) */}
      {lead && showChatPanel && (
        <>
          <div
            className="fixed inset-0 z-[100]"
            aria-hidden="true"
            onClick={() => setShowChatPanel(false)}
          />
          <div
             className="fixed right-0 top-auto bottom-0 h-[58vh] sm:h-[60vh] md:h-[62vh] w-[min(96vw,360px)] sm:w-full sm:min-w-[360px] sm:max-w-lg md:max-w-xl bg-white shadow-2xl z-[101] flex flex-col overflow-hidden border-l border-gray-200 rounded-tl-xl sm:rounded-l-xl"

            style={{
              paddingTop: 'env(safe-area-inset-top, 0px)',
              paddingRight: 'env(safe-area-inset-right, 0px)',
              maxHeight: '100dvh',
            }}
          >
            <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-gray-200 flex items-center justify-between flex-shrink-0 gap-1.5 min-h-0">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <MessageSquare className="h-4 w-4 text-indigo-600 flex-shrink-0" />
                <h2 className="text-sm font-medium text-gray-900 truncate">Chat</h2>
                {lead.status === 'rejected' && (
                  <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0 whitespace-nowrap">
                    Read-only
                  </span>
                )}
                {lead.status === 'activated' && user?.role !== 'coordinator' && user?.role !== 'admin' && (
                  <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0 whitespace-nowrap">
                    Read-only
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowChatPanel(false)}
                className="flex-shrink-0 inline-flex items-center justify-center px-3 min-w-[40px] min-h-[40px] rounded-lg bg-red-500 hover:bg-red-600 active:bg-red-700 text-white transition-colors touch-manipulation"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div
              ref={chatScrollContainerRef}
              className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 sm:p-4 space-y-3 sm:space-y-4 overscroll-behavior-contain"
              style={{ WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'] }}
            >
              {messages.length === 0 ? (
                <div className="text-center text-gray-500 py-8 px-4 text-sm sm:text-base">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                messages.map((message) => {
                  // Special rendering for audio messages - no container, just audio + date/time below
                  if (message.mediaType === 'audio') {
                    return (
                      <div
                        key={message.id}
                        className={`flex ${message.userId === user?.id ? 'justify-end' : 'justify-start'} min-w-0`}
                      >
                        <div className="max-w-[85%] min-w-0">
                          <div className="text-xs font-medium mb-1 text-gray-700">
                            {message.userId === 'system'
                              ? 'System'
                              : message.userId === user?.id 
                                ? `You (${message.userRole})` 
                                : userDetails[message.userId]?.name 
                                  ? `${userDetails[message.userId].name} (${message.userRole})`
                                  : message.userRole}
                          </div>
                          <VoiceNotePlayer 
                            src={message.mediaUrl!} 
                            durationMs={message.durationMs} 
                            currentlyPlaying={currentlyPlaying}
                            onPlay={() => setCurrentlyPlaying(message.mediaUrl!)}
                          />
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-gray-500">
                              {message.createdAt && message.createdAt instanceof Date && !isNaN(message.createdAt.getTime()) 
                                ? format(message.createdAt, 'MMM d, h:mm a')
                                : 'Just now'}
                            </span>
                            {message.id.startsWith('temp-') && (
                              <span className="text-xs text-orange-500 font-medium animate-pulse whitespace-nowrap">Sending...</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }
                  
                  // Regular message rendering for text, images, videos, files
                  return (
                  <div
                    key={message.id}
                    className={`flex ${message.userId === user?.id ? 'justify-end' : 'justify-start'} min-w-0`}
                  >
                    <div
                      className={`max-w-[85%] min-w-0 rounded-xl sm:rounded-lg px-3 py-2 sm:px-4 ${
                        message.userId === user?.id
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      <div className="text-[11px] sm:text-xs font-medium mb-1">
                          {message.userId === 'system'
                            ? 'System'
                            : message.userId === user?.id 
                              ? `You (${message.userRole})` 
                              : userDetails[message.userId]?.name 
                                ? `${userDetails[message.userId].name} (${message.userRole})`
                                : message.userRole}
                      </div>
                        {message.message && (
                      <div className="text-[15px] sm:text-sm whitespace-pre-wrap break-words leading-snug">{message.message}</div>
                        )}
                        {message.mediaUrl && (
                          <div className="mt-2 space-y-2">
                            {message.mediaType === 'image' && (
                              <div className="relative group">
                                <a
                                  href={message.mediaUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block"
                                >
                                  <img
                                    src={message.mediaUrl}
                                    alt="Attachment"
                                    className="max-h-72 rounded-lg border border-gray-200 shadow-sm object-contain"
                                  />
                                </a>
                                <a
                                  href={message.mediaUrl}
                                  onClick={(e) => handleDownload(e, message.mediaUrl!, `image-${Date.now()}.jpg`)}
                                  className="absolute bottom-2 right-2 px-3 py-1.5 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex items-center gap-2"
                                  title="Download Image"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  <span className="text-xs font-medium">Download</span>
                                </a>
                              </div>
                            )}
                            {message.mediaType === 'video' && (
                              <video
                                controls
                                src={message.mediaUrl}
                                className="w-full max-h-80 rounded-lg border border-gray-200 shadow-sm"
                              />
                            )}
                            {(!message.mediaType || message.mediaType === 'file' || message.mediaType === 'pdf') && (
                              <a
                                href={message.mediaUrl}
                                onClick={(e) => handleDownload(e, message.mediaUrl!, message.message || 'file')}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors text-xs font-semibold"
                              >
                                <Download className="h-3.5 w-3.5" />
                                Download {message.mediaType === 'pdf' ? 'PDF' : 'File'}
                              </a>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs opacity-75">
                            {message.createdAt && message.createdAt instanceof Date && !isNaN(message.createdAt.getTime()) 
                              ? format(message.createdAt, 'MMM d, h:mm a')
                              : 'Just now'}
                          </span>
                          {message.id.startsWith('temp-') && message.mediaUrl && (message.mediaType === 'image' || message.mediaType === 'video' || message.mediaType === 'file' || message.mediaType === 'pdf') && (
                            <span className="text-xs text-orange-500 font-medium animate-pulse">Sending...</span>
                          )}
                      </div>
                    </div>
                  </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* File Size Error Banner - Mobile optimized */}
            {fileSizeError && (
              <div className="border-t border-red-200 bg-red-50 px-3 sm:px-4 py-3 sm:py-2.5 flex items-start sm:items-center justify-between gap-2 sm:gap-3 animate-in slide-in-from-top">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5 sm:mt-0" />
                  <p className="text-sm sm:text-sm text-red-800 font-medium flex-1 leading-relaxed break-words">{fileSizeError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFileSizeError(null)}
                  className="flex-shrink-0 p-2 sm:p-1 rounded-full hover:bg-red-100 active:bg-red-200 transition-colors touch-manipulation min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] flex items-center justify-center"
                  aria-label="Dismiss error"
                >
                  <X className="h-5 w-5 sm:h-4 sm:w-4 text-red-600" />
                </button>
              </div>
            )}

            {/* Media Preview - Show before sending */}
            {previewFile && (
              <div className="border-t border-gray-200 bg-gray-50 px-3 sm:px-4 py-3 sm:py-4">
                <div className="flex flex-col gap-3">
                  {/* Preview content */}
                  <div className="min-w-0">
                    <div className="text-xs text-gray-500 font-medium mb-2">Preview attachment</div>
                    {previewFile.type === 'image' && (
                      <div className="relative inline-block max-w-full rounded-lg overflow-hidden border border-gray-300 bg-white shadow-sm">
                        <img
                          src={previewFile.previewUrl}
                          alt="Preview"
                          className="max-h-48 sm:max-h-64 w-auto object-contain rounded-lg"
                        />
                      </div>
                    )}
                    {previewFile.type === 'video' && (
                      <div className="relative inline-block max-w-full rounded-lg overflow-hidden border border-gray-300 bg-black shadow-sm">
                        <video
                          src={previewFile.previewUrl}
                          controls
                          className="max-h-48 sm:max-h-64 w-auto object-contain rounded-lg"
                        />
                      </div>
                    )}
                    {previewFile.type === 'audio' && (
                      <div className="bg-white rounded-lg border border-gray-300 p-3 shadow-sm max-w-md">
                        <audio src={previewFile.previewUrl} controls className="w-full" />
                      </div>
                    )}
                    {(previewFile.type === 'file' || previewFile.type === 'pdf') && (
                      <div className="bg-white rounded-lg border border-gray-300 p-4 shadow-sm inline-flex items-center gap-3">
                        <div className="p-2 bg-red-100 rounded-lg">
                          <Paperclip className="h-5 w-5 text-red-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{previewFile.file.name}</div>
                          <div className="text-xs text-gray-500">
                            {((previewFile.file.size / 1024) / 1024).toFixed(2)} MB
                            {previewFile.type === 'pdf' && ' • PDF'}
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="text-xs text-gray-600 mt-2 break-words truncate max-w-full">{previewFile.file.name}</div>
                  </div>
                  {/* Buttons at bottom */}
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={removePreview}
                      className="p-2 rounded-lg hover:bg-gray-200 active:bg-gray-300 transition-colors touch-manipulation min-w-[40px] min-h-[40px] flex items-center justify-center"
                      title="Remove preview"
                      aria-label="Remove preview"
                    >
                      <X className="h-5 w-5 sm:h-4 sm:w-4 text-gray-600" />
                    </button>
                    <button
                      type="button"
                      onClick={() => chatFormRef.current?.requestSubmit()}
                      disabled={sendingMessage || uploadingMedia || lead?.status === 'rejected' || (lead?.status === 'activated' && user?.role !== 'coordinator' && user?.role !== 'admin')}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation min-h-[40px]"
                      title="Send attachment"
                    >
                      {uploadingMedia || sendingMessage ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          <span>Send</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div
              className="border-t border-gray-200 bg-white flex-shrink-0"
              style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
            >
              <form ref={chatFormRef} onSubmit={sendMessage} className="flex flex-col gap-2 p-2 sm:p-3">
                {recording && (
                  <div className="flex items-center gap-2 w-full bg-red-50 rounded-xl p-3 border border-red-200">
                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                      <canvas
                        ref={waveformCanvasRef}
                        width={600}
                        height={100}
                        className="h-10 w-full rounded"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs sm:text-sm text-red-600 font-semibold flex items-center gap-1.5 min-w-0">
                          <span className="h-2 w-2 bg-red-600 rounded-full animate-pulse flex-shrink-0" />
                          <span className="truncate">Recording… {Math.floor(recordingElapsed / 1000)}s</span>
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            cancelRecording();
                          }}
                          className="flex-shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-red-300 bg-red-100 text-red-700 hover:bg-red-200 active:bg-red-300 transition-colors touch-manipulation min-h-[44px]"
                          title="Cancel recording"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="text-xs font-medium">Cancel</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-row items-center gap-1.5">
                  <div className="flex-1 min-w-0">
                    <textarea
                      rows={1}
                      placeholder=""
                      className="w-full rounded-lg border border-gray-300 bg-gray-50/50 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:bg-white text-sm disabled:bg-gray-100 disabled:cursor-not-allowed resize-none py-1.5 px-3 h-9 min-h-[2.25rem] max-h-[96px] leading-snug touch-manipulation box-border"
                      value={newMessage}
                      onChange={(e) => {
                        setNewMessage(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 112)}px`;
                      }}
                      disabled={lead?.status === 'rejected' || (lead?.status === 'activated' && user?.role !== 'coordinator' && user?.role !== 'admin') || sendingMessage || uploadingMedia || recording}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !sendingMessage && !uploadingMedia && !recording && newMessage.trim()) {
                          e.preventDefault();
                          sendMessage(e);
                        }
                      }}
                      aria-label="Message"
                    />
                  </div>

                  {!recording && (
                    <>
                      <button
                        type="button"
                        disabled={uploadingMedia || sendingMessage || lead?.status === 'rejected' || (lead?.status === 'activated' && user?.role !== 'coordinator' && user?.role !== 'admin')}
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation"
                        title="Attach file"
                        aria-label="Attach file"
                      >
                        <Paperclip className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        disabled={uploadingMedia || sendingMessage || lead?.status === 'rejected' || (lead?.status === 'activated' && user?.role !== 'coordinator' && user?.role !== 'admin')}
                        onClick={(e) => {
                          e.preventDefault();
                          startRecording();
                        }}
                        className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation"
                        title="Record voice note"
                        aria-label="Record voice note"
                      >
                        <Mic className="h-5 w-5" />
                      </button>
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={
                      lead?.status === 'rejected' ||
                      (lead?.status === 'activated' && user?.role !== 'coordinator' && user?.role !== 'admin') ||
                      sendingMessage ||
                      uploadingMedia ||
                      (!newMessage.trim() && !recording && !previewFile)
                    }
                    onClick={(e) => {
                      if (recording) {
                        e.preventDefault();
                        stopRecording();
                      }
                    }}
                    className="flex-shrink-0 inline-flex items-center justify-center gap-1.5 px-5 h-9 sm:px-4 sm:h-10 rounded-lg border border-transparent text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors touch-manipulation"
                    aria-label="Send"
                  >
                    {uploadingMedia || sendingMessage ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : recording ? (
                      <Square className="h-5 w-5" />
                    ) : (
                      <>
                        <Send className="h-5 w-5" />
                        <span className="hidden xs:inline text-xs font-medium">Send</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*,.pdf"
                  className="hidden"
                  onChange={handleMediaSelect}
                />
              </form>
            </div>
          </div>
        </>
      )}
        </div>
      </div>

      {/* Number Error Modal */}
      <Dialog open={showNumberErrorModal} onClose={() => setShowNumberErrorModal(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black bg-opacity-30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="mx-auto max-w-md w-full bg-white rounded-xl shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <Dialog.Title className="text-xl font-bold text-gray-900">
                Number Not Available
              </Dialog.Title>
            </div>
            <div className="mb-6">
              <p className="text-gray-600 mb-3">
                The following number(s) are not available in the number pool:
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <ul className="list-disc list-inside space-y-1">
                  {missingNumbers.map((number, idx) => (
                    <li key={idx} className="text-red-800 font-mono text-sm">
                      {number}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-sm text-gray-500 mt-3">
                Please ensure all numbers exist in the number pool before performing this action.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowNumberErrorModal(false)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}
