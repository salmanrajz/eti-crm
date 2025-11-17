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
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { Lead, ChatMessage } from '../../types';
import { toast } from 'react-hot-toast';
import { Send, ArrowLeft, MessageSquare } from 'lucide-react';
import { LeadDetailsView } from './LeadDetailsView';
import { CreateLead } from './CreateLead';
import { format } from 'date-fns';
import { logNumberAction } from '../../utils/numberLogging';

export function LeadDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showVerifyConfirm, setShowVerifyConfirm] = useState(false);
  const [pendingVerifierUpdates, setPendingVerifierUpdates] = useState<Partial<Lead> | null>(null);
  const [changeList, setChangeList] = useState<Array<{ field: string; original: string; edited: string }>>([]);
  const [isConfirmSaving, setIsConfirmSaving] = useState(false);
  const [isResubmitting, setIsResubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadLead();
    loadMessages();
    const unsubscribe = subscribeToMessages();
    return () => unsubscribe();
  }, [id]);

  // Removed auto-scroll on message changes - only scroll on page refresh
  // Auto-scroll on new messages removed per user request

  async function loadLead() {
    try {
      //console.log('Loading lead with ID:', id);
      const leadDoc = await getDoc(doc(db, 'leads', id!));
      
      if (leadDoc.exists()) {
        //console.log('Lead document exists:', leadDoc.data());
        const leadData = leadDoc.data();
        
        const startDate = leadData.startDate?.toDate?.() || leadData.startDate || new Date();
        const createdAt = leadData.createdAt?.toDate?.() || leadData.createdAt || new Date();
        const updatedAt = leadData.updatedAt?.toDate?.() || leadData.updatedAt || new Date();
        
        // Fetch manager data if managerId exists
        let managerData = null;
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
        
        const lead = {
          id: leadDoc.id,
          numberId: leadData.numberId,
          customerName: leadData.customerName,
          customerPhone: leadData.customerPhone,
          customerAddress: leadData.customerAddress,
          plan: leadData.plan,
          status: leadData.status,
          agentId: leadData.agentId,
          verifierId: leadData.verifierId,
          coordinatorId: leadData.coordinatorId,
          assignmentId: leadData.assignmentId,
          teamId: leadData.teamId,
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
          plans: leadData.plans || [],
          verificationMedia: leadData.verificationMedia || [],
          etisalatLeadId: leadData.etisalatLeadId || '',
          managerAssigned: leadData.managerAssigned || false,
          managerNotes: leadData.managerNotes || ''
        } as Lead;
        
       // console.log('Processed lead data:', lead);
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

    return onSnapshot(q, (snapshot) => {
      const messagesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      })) as ChatMessage[];
      setMessages(messagesData);
    });
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !user || !id) return;

      // Create a temporary message ID
      const tempId = `temp-${Date.now()}`;
      
    try {
      // Create the message object
      const message: ChatMessage = {
        id: tempId,
        leadId: id,
        userId: user.id,
        userRole: user.role,
        message: newMessage.trim(),
        createdAt: new Date(),
        readBy: [user.id]
      };

      // Add the message to the local state immediately
      setMessages(prev => [...prev, message]);
      setNewMessage('');

      // Removed auto-scroll when sending message - only scroll on page refresh

      // Add the message to Firestore
      const docRef = await addDoc(collection(db, 'chatMessages'), {
        leadId: id,
        userId: user.id,
        userRole: user.role,
        message: newMessage.trim(),
        createdAt: new Date(),
        readBy: [user.id]
      });

      // Send WhatsApp notification to manager after message is added to chat
      if (lead) {
        const { sendChatMessageWhatsAppNotification } = await import('../../utils/chatNotifications');
        await sendChatMessageWhatsAppNotification(lead, newMessage.trim(), user.name || 'Unknown');
      }

      // Update the local state with the real Firestore ID
      setMessages(prev => prev.map(msg => 
        msg.id === tempId ? { ...msg, id: docRef.id } : msg
      ));

      // Create notification for relevant users
      const notificationRecipients: string[] = [];
      
      // Only send notification to agent if the message is not from the agent
      if (user.role !== 'agent' && lead?.agentId) {
        notificationRecipients.push(lead.agentId);
      }

      // Create notifications for each recipient
      for (const recipientId of notificationRecipients) {
        if (recipientId) {
          await addDoc(collection(db, 'notifications'), {
            userId: recipientId,
            type: 'new_message',
            title: 'New Message',
            message: `${user.name}: ${newMessage.trim()}`,
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
      
      // Remove the temporary message if the Firestore write failed
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
    }
  }

  async function handleLeadUpdate(updates: Partial<Lead>) {
    if (!id || !user) return;

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
        toast.error('Lead not found');
        return;
      }

      const leadData = leadDoc.data();
      
      // If lead is verified, only allow updates from admin, manager, or coordinator
      if (leadData.status === 'verified' && !['admin', 'manager', 'coordinator'].includes(user.role)) {
        toast.error('Cannot update verified lead');
        return;
      }

      // Preserve the original agentId and other important fields
      const isAgentResubmittingFollowUp = user.role === 'agent' && leadData.status === 'follow_verification';
      const isCoordinatorEditingVerified = user.role === 'coordinator' && leadData.status === 'verified' && Object.keys(updates).length > 0;
      const nextStatus = isAgentResubmittingFollowUp ? 'pending_verification' : 
                        isCoordinatorEditingVerified ? 'pending_verification' : 
                        (updates.status || leadData.status);
      const updateData = {
        ...updates,
        // If agent resubmits from follow_verification, move back to pending_verification
        status: nextStatus,
        // Preserve these fields regardless of who is updating
        agentId: leadData.agentId,
        teamId: leadData.teamId,
        managerId: leadData.managerId,
        updatedAt: new Date(),
        updatedBy: user.id
      };

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
        
        // Handle added numbers - always set to 'pending_verification' for new numbers
        addedNumbers.forEach((plan: any) => {
          if (plan?.numberId) {
            const newStatus = 'pending_verification';
            
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
              status: 'pending_verification',
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
                  if (user.role === 'agent' && data.status === 'follow_verification') {
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

        {/* Chat Section - Hide if lead is rejected or activated */}
          {lead && lead.status !== 'rejected' && lead.status !== 'activated' && (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
              <div className="flex items-center">
                <MessageSquare className="h-5 w-5 text-indigo-600 mr-2" />
                <h2 className="text-lg font-medium text-gray-900">Chat</h2>
              </div>
            </div>

            <div className="h-96 overflow-y-auto p-3 sm:p-4 space-y-4">
              {messages.length === 0 ? (
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
                      className={`max-w-[85%] rounded-lg px-4 py-2 ${
                        message.userId === user?.id
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      <div className="text-xs font-medium mb-1">
                        {message.userId === user?.id ? 'You' : message.userRole}
                      </div>
                      <div className="text-sm whitespace-pre-wrap break-words">{message.message}</div>
                      <div className="text-xs mt-1 opacity-75">
                        {format(message.createdAt, 'MMM d, h:mm a')}
                      </div>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-gray-200 px-3 sm:px-4 py-3 sm:py-4">
              <form onSubmit={sendMessage} className="flex space-x-3">
                <input
                  type="text"
                  className="flex-1 rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                />
                <button
                  type="submit"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}