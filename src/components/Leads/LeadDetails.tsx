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
import { Send, ArrowLeft, MessageSquare, Paperclip, Mic, Square, Loader2, Trash2, Download, Play, Pause, X, AlertCircle } from 'lucide-react';
import { LeadDetailsView } from './LeadDetailsView';
import { CreateLead } from './CreateLead';
import { format } from 'date-fns';
import { logNumberAction } from '../../utils/numberLogging';

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
  const { user } = useAuthStore();
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
  const [showVerifyConfirm, setShowVerifyConfirm] = useState(false);
  const [pendingVerifierUpdates, setPendingVerifierUpdates] = useState<Partial<Lead> | null>(null);
  const [changeList, setChangeList] = useState<Array<{ field: string; original: string; edited: string }>>([]);
  const [isConfirmSaving, setIsConfirmSaving] = useState(false);
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState<number>(0);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);
  const [userDetails, setUserDetails] = useState<Record<string, { name: string }>>({});

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    // Defer to ensure DOM is painted
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }, 0);
  };

  useEffect(() => {
    if (!id) return;
    loadLead();
    loadMessages().then(() => scrollToBottom('auto')); // jump to latest on initial load
    const unsubscribe = subscribeToMessages();
    return () => unsubscribe();
  }, [id]);

  // Cleanup recording on unmount
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
        
        // Fetch manager data if managerId exists
        let managerData = null;
        let resolvedAgentName = '';
        let resolvedTeamName = '';

        if (leadData.managerId) {
          try {
            const managerRef = doc(db, 'users', leadData.managerId);
            const managerDoc = await getDoc(managerRef);
            if (managerDoc.exists()) {
              managerData = {
                id: managerDoc.id,
                ...managerDoc.data()
              };
            }
          } catch (error) {
            console.error('Error fetching manager data:', error);
          }
        }

        // Fetch agent name from users collection
        if (leadData.agentId) {
          try {
            const agentRef = doc(db, 'users', leadData.agentId);
            const agentDoc = await getDoc(agentRef);
            if (agentDoc.exists()) {
              const agentData = agentDoc.data() as any;
              resolvedAgentName =
                agentData.name ||
                agentData.fullName ||
                agentData.displayName ||
                '';
            }
          } catch (error) {
            console.error('Error fetching agent data for lead:', id, error);
          }
        }

        // Fetch team name from teams collection
        if (leadData.teamId) {
          try {
            const teamRef = doc(db, 'teams', leadData.teamId);
            const teamDoc = await getDoc(teamRef);
            if (teamDoc.exists()) {
              const teamData = teamDoc.data() as any;
              resolvedTeamName = teamData.name || '';
            }
          } catch (error) {
            console.error('Error fetching team data for lead:', id, error);
          }
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
          managerNotes: leadData.managerNotes || ''
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

  async function loadMessages() {
    if (!id) return;
    
    try {
      const messagesQuery = query(
        collection(db, 'chatMessages'),
        where('leadId', '==', id),
        orderBy('createdAt', 'asc')
      );
      
      const querySnapshot = await getDocs(messagesQuery);
      const messagesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      })) as ChatMessage[];
      
      setMessages(messagesData);
      
      // Fetch user details for all unique users in messages
      const uniqueUserIds = [...new Set(messagesData.map(msg => msg.userId))];
      const userDetailsPromises = uniqueUserIds.map(async (userId) => {
        if (!userDetails[userId]) {
          try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              return {
                id: userId,
                name: userData.name || userData.fullName || userData.displayName || 'Unknown User'
              };
            }
          } catch (error) {
            console.error('Error fetching user details:', error);
          }
        }
        return null;
      });

      const newUserDetails = await Promise.all(userDetailsPromises);
      const validUserDetails = newUserDetails.filter((detail): detail is { id: string; name: string } => detail !== null);
      
      setUserDetails(prev => ({
        ...prev,
        ...Object.fromEntries(validUserDetails.map(detail => [detail.id, { name: detail.name }]))
      }));
      
      scrollToBottom('auto');
    } catch (error) {
      console.error('Error loading messages:', error);
      toast.error('Failed to load chat messages');
    }
  }

  function subscribeToMessages() {
    if (!id) return () => {};

    const q = query(
      collection(db, 'chatMessages'),
      where('leadId', '==', id),
      orderBy('createdAt', 'asc')
    );

    return onSnapshot(q, async (snapshot) => {
      const messagesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      })) as ChatMessage[];
      
      setMessages(prevMessages => {
        // Check if a new message was added (not just an update)
        const hasNewMessage = messagesData.length > prevMessages.length || 
          (messagesData.length > 0 && prevMessages.length > 0 && 
           messagesData[messagesData.length - 1].id !== prevMessages[prevMessages.length - 1].id);
                
        if (hasNewMessage) {
          // Auto-scroll to bottom when new message arrives
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
        
        return messagesData;
      });
      
      // Fetch user details for any new users in messages
      const uniqueUserIds = [...new Set(messagesData.map(msg => msg.userId))];
      const userDetailsPromises = uniqueUserIds.map(async (userId) => {
        if (!userDetails[userId]) {
                      try {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              return {
                id: userId,
                name: userData.name || userData.fullName || userData.displayName || 'Unknown User'
              };
            }
          } catch (error) {
            console.error('Error fetching user details:', error);
          }
        }
        return null;
      });

      const newUserDetails = await Promise.all(userDetailsPromises);
      const validUserDetails = newUserDetails.filter((detail): detail is { id: string; name: string } => detail !== null);
      
      if (validUserDetails.length > 0) {
        setUserDetails(prev => ({
          ...prev,
          ...Object.fromEntries(validUserDetails.map(detail => [detail.id, { name: detail.name }]))
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
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    if (!newMessage.trim() || !user || !id || sendingMessage) return;
    
    // Prevent sending messages for rejected or activated leads
    if (lead?.status === 'rejected') {
      toast.error('Cannot send messages to rejected leads');
      return;
    }
    if (lead?.status === 'activated') {
      toast.error('Cannot send messages to activated leads');
      return;
    }

    const messageToSend = newMessage.trim();
    setNewMessage('');
    await addChatEntry({ messageText: messageToSend });
    
    // Auto-scroll to bottom after sending
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

      const leadData = leadDoc.data();
      
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

  const handleMediaSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    
    // Clear any previous error
    setFileSizeError(null);
    
    const isPdf = file.type === 'application/pdf';
    const mediaType: ChatMessage['mediaType'] =
      file.type.startsWith('image') ? 'image' :
      file.type.startsWith('video') ? 'video' :
      file.type.startsWith('audio') ? 'audio' :
      isPdf ? 'pdf' : 'file';
    await handleMediaFileUpload(file, mediaType);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      if (pendingVerifierUpdates.plans && user.role === 'verifier') {
        const realPlans = pendingVerifierUpdates.plans.filter(p => !p.numberId?.startsWith('virtual-'));
        const updatePromises = realPlans.map(async plan => {
          try {
            const numberRef = doc(db, 'numberPool', plan.numberId);
            await updateDoc(numberRef, {
              // Keep number status aligned with lead status; do not downgrade to pending_verification
              status: leadData.status === 'activated_non_verified' ? 'activated_non_verified' : 'pending_verification',
              lastStatusChange: new Date(),
              leadId: id
            });
          } catch (err) {
            console.error('Failed updating numberPool for plan', plan.numberId, err);
          }
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 py-2 px-0 sm:px-4 md:px-6 lg:px-8">
      <div className="w-full max-w-6xl mx-auto">
        <div className="mb-4 px-2 sm:px-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Lead Details</h1>
              <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600">View and manage lead information</p>
            </div>
        <button
          onClick={() => navigate('/dashboard/leads')}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Leads
        </button>
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
                  if (user.role === 'agent' && (data.status === 'non_verified' || data.status === 'follow_verification')) {
                    await updateDoc(leadRef, {
                      status: 'pending_verification',
                      updatedAt: new Date(),
                      updatedBy: user.id
                    });
                    // Update numbers to pending_verification
                    const plans = (data.plans || []).filter((p: any) => p?.numberId && !p.numberId.startsWith('virtual-'));
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

        {/* Chat Section - Show for all leads, but read-only for rejected and activated leads */}
          {lead && (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
              <div className="flex items-center">
                <MessageSquare className="h-5 w-5 text-indigo-600 mr-2" />
                <h2 className="text-lg font-medium text-gray-900">Chat</h2>
                </div>
                {lead.status === 'rejected' && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    Read-only (Lead Rejected)
                  </span>
                )}
                {lead.status === 'activated' && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    Read-only (Lead Activated)
                  </span>
                )}
              </div>
            </div>

            <div className="h-96 overflow-y-auto p-3 sm:p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                messages.map((message) => {
                  // Special rendering for audio messages - no container, just audio + date/time below
                  if (message.mediaType === 'audio') {
                    return (
                      <div
                        key={message.id}
                        className={`flex ${message.userId === user?.id ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className="max-w-[85%]">
                          <div className="text-xs font-medium mb-1 text-gray-700">
                            {message.userId === user?.id 
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
                              {format(message.createdAt, 'MMM d, h:mm a')}
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
                    className={`flex ${message.userId === user?.id ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg px-4 py-2 ${
                        message.userId === user?.id
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      <div className="text-xs font-medium mb-1">
                          {message.userId === user?.id 
                            ? `You (${message.userRole})` 
                            : userDetails[message.userId]?.name 
                              ? `${userDetails[message.userId].name} (${message.userRole})`
                              : message.userRole}
                      </div>
                        {message.message && (
                      <div className="text-sm whitespace-pre-wrap break-words">{message.message}</div>
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
                        {format(message.createdAt, 'MMM d, h:mm a')}
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

            {/* File Size Error Banner */}
            {fileSizeError && (
              <div className="border-t border-red-200 bg-red-50 px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3 animate-in slide-in-from-top">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                  <p className="text-sm text-red-800 font-medium flex-1">{fileSizeError}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFileSizeError(null)}
                  className="flex-shrink-0 p-1 rounded-full hover:bg-red-100 transition-colors"
                  aria-label="Dismiss error"
                >
                  <X className="h-4 w-4 text-red-600" />
                </button>
              </div>
            )}

            <div className="border-t border-gray-200 px-3 sm:px-4 py-3 sm:py-4">
              <form onSubmit={sendMessage} className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <textarea
                    rows={1}
                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base disabled:bg-gray-100 disabled:cursor-not-allowed resize-none py-1.5 px-3 min-h-[2.5rem] max-h-[4rem]"
                    placeholder={
                      lead?.status === 'rejected' 
                        ? 'Cannot send messages to rejected leads' 
                        : lead?.status === 'activated'
                        ? 'Cannot send messages to activated leads'
                        : 'Type a message...💡 You can send audio notes, images, PDFs, and files (max 3MB)'
                    }
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                    disabled={lead?.status === 'rejected' || lead?.status === 'activated' || sendingMessage || uploadingMedia}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !sendingMessage && !uploadingMedia && newMessage.trim()) {
                        e.preventDefault();
                        sendMessage(e);
                      }
                    }}
                  />
                </div>
                <button
                  type="button"
                  disabled={uploadingMedia || sendingMessage || recording || lead?.status === 'rejected' || lead?.status === 'activated'}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  title="Attach file"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                {!recording && (
                  <button
                    type="button"
                    disabled={uploadingMedia || sendingMessage || lead?.status === 'rejected' || lead?.status === 'activated'}
                    onClick={(e) => {
                      e.preventDefault();
                      startRecording();
                    }}
                    className="inline-flex items-center px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    title="Record voice note"
                  >
                    <Mic className="h-4 w-4" />
                  </button>
                )}
                {recording && (
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <canvas
                        ref={waveformCanvasRef}
                        width={600}
                        height={100}
                        className="h-10 w-full"
                      />
                      <span className="text-xs text-red-500 font-semibold text-center">
                        Recording... {Math.floor(recordingElapsed / 1000)}s
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        cancelRecording();
                      }}
                      className="inline-flex items-center px-2 py-1 rounded-lg border border-red-300 bg-red-50 text-red-600 hover:bg-red-100 transition-colors flex-shrink-0"
                      title="Delete recording"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={
                    lead?.status === 'rejected' ||
                    lead?.status === 'activated' ||
                    sendingMessage ||
                    uploadingMedia ||
                    (!newMessage.trim() && !recording)
                  }
                  onClick={(e) => {
                    if (recording) {
                      e.preventDefault();
                      stopRecording();
                    }
                  }}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {uploadingMedia || sendingMessage ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </span>
                  ) : recording ? (
                    <span className="flex items-center gap-2">
                      <Square className="h-4 w-4" />
                      Stop & Send
                    </span>
                  ) : (
                  <Send className="h-4 w-4" />
                  )}
                </button>
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
          )}
        </div>
      </div>
    </div>
  );
}