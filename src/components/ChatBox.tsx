/**
 * ===============================================================================
 * CHAT BOX COMPONENT - REAL-TIME NUMBER POOL CHAT INTERFACE
 * ===============================================================================
 * 
 * This component provides a real-time chat interface for communication about
 * specific numbers in the number pool. It enables agents to discuss and coordinate
 * number-related activities with proper user identification and message history.
 * 
 * FEATURES:
 * 
 * 1. REAL-TIME CHAT FUNCTIONALITY
 *    - Live message synchronization via Firestore listeners
 *    - Automatic scroll to new messages for optimal user experience
 *    - Message timestamps and user identification
 *    - Persistent chat history for each number
 * 
 * 2. USER MANAGEMENT AND IDENTIFICATION
 *    - User details fetching and display for admin users
 *    - Proper user attribution for all messages
 *    - Real-time user information updates
 * 
 * 3. NUMBER-SPECIFIC CONTEXT
 *    - Chat tied to specific number IDs for organized communication
 *    - Integration with number pool claiming and reservation workflows
 *    - Context-aware messaging for number-related discussions
 * 
 * 4. RESPONSIVE DESIGN
 *    - Mobile-optimized interface with proper touch interactions
 *    - Smooth animations and loading states
 *    - Proper keyboard handling and message input
 * 
 * USAGE:
 * This component is used in number pool management interfaces to provide
 * agents with communication channels for coordinating number-related activities.
 * ===============================================================================
 */

import { useState, useEffect, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, getDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { ChatMessage } from '../types';
import { Send, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';

interface ChatBoxProps {
  numberId: string;
  originalAgentId: string;
  claimingAgentId: string;
  onClose: () => void;
}

interface UserDetails {
  id: string;
  name: string;
  email: string;
}

export function ChatBox({ numberId, originalAgentId, claimingAgentId, onClose }: ChatBoxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const { user, isAdmin } = useAuthStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [userDetails, setUserDetails] = useState<Record<string, UserDetails>>({});

  useEffect(() => {
    if (!numberId) return;

    const q = query(
      collection(db, 'chatMessages'),
      where('numberId', '==', numberId),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const newMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      })) as ChatMessage[];
      
      setMessages(newMessages);
      setLoading(false);

      // Fetch user details for all unique users in messages
      if (isAdmin()) {
        const uniqueUserIds = [...new Set(newMessages.map(msg => msg.userId))];
        const userDetailsPromises = uniqueUserIds.map(async (userId) => {
          if (!userDetails[userId]) {
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              return {
                id: userId,
                name: userData.name || 'Unknown User',
                email: userData.email || 'No email'
              };
            }
          }
          return null;
        });

        const newUserDetails = await Promise.all(userDetailsPromises);
        const validUserDetails = newUserDetails.filter((detail): detail is UserDetails => detail !== null);
        
        setUserDetails(prev => ({
          ...prev,
          ...Object.fromEntries(validUserDetails.map(detail => [detail.id, detail]))
        }));
      }
    });

    return () => unsubscribe();
  }, [numberId, isAdmin]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    try {
      // Add the message to chatMessages collection
      const messageRef = await addDoc(collection(db, 'chatMessages'), {
        numberId,
        userId: user.id,
        userRole: user.role,
        message: newMessage.trim(),
        createdAt: serverTimestamp(),
        readBy: [user.id]
      });

      // Determine the recipient (the other party)
      const recipientId = user.id === claimingAgentId ? originalAgentId : claimingAgentId;

      // Send notification only to the other party
      await addDoc(collection(db, 'notifications'), {
        userId: recipientId,
        type: 'number_claimed' as const,
        title: 'New Chat Message',
        message: `${user.role} sent you a message about number claim`,
        read: false,
        createdAt: serverTimestamp(),
        data: {
          numberId,
          chatMessageId: messageRef.id
        }
      });

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message');
    }
  };

  const renderUserInfo = (message: ChatMessage) => {
    if (!isAdmin()) {
      return (
        <div className="text-xs mb-1 opacity-75">
          {message.userRole} • {message.createdAt?.toLocaleTimeString()}
        </div>
      );
    }

    const userDetail = userDetails[message.userId];
    return (
      <div className="text-xs mb-1 opacity-75">
        {userDetail ? (
          <>
            <span className="font-semibold">{userDetail.name}</span>
            <span className="mx-1">•</span>
            <span className="text-gray-500">{userDetail.email}</span>
            <span className="mx-1">•</span>
            <span>{message.userRole}</span>
            <span className="mx-1">•</span>
            <span>{message.createdAt?.toLocaleTimeString()}</span>
          </>
        ) : (
          <>
            {message.userRole} • {message.createdAt?.toLocaleTimeString()}
          </>
        )}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed bottom-4 right-4 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50"
    >
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900">Number Claim Chat</h3>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="h-96 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.userId === user?.id ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.userId === user?.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                {renderUserInfo(message)}
                <div>{message.message}</div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200">
        <div className="flex space-x-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="bg-indigo-600 text-white rounded-lg px-4 py-2 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </form>
    </motion.div>
  );
} 