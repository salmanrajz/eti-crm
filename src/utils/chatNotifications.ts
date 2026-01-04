/**
 * ===============================================================================
 * CHAT NOTIFICATIONS UTILITY
 * ===============================================================================
 * 
 * This utility handles sending WhatsApp notifications to managers, admins,
 * and coordinators when chat messages are added to leads. It provides a 
 * centralized way to trigger notifications regardless of where the message 
 * originates from (regular chat, verifier action, coordinator action, etc.).
 * 
 * NOTIFICATION RULES:
 * - Admin: Gets notifications for ALL chat messages
 * - Manager: Gets notifications for their assigned leads (existing behavior)
 * - Coordinator: Gets group-based notifications ONLY for verified leads
 * 
 * USAGE:
 * Call sendChatMessageWhatsAppNotification after adding a message to
 * chatMessages collection to automatically notify relevant users.
 * ===============================================================================
 */

import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Lead, CoordinatorType } from '../types';
import { getWhatsAppCredentials } from './configService';

/**
 * Helper function to extract phone numbers from user data
 */
function extractPhoneNumbers(userData: any): string[] {
  if (Array.isArray(userData.phoneNumbers)) {
    return userData.phoneNumbers;
  } else if (typeof userData.phoneNumbers === 'string') {
    return [userData.phoneNumbers];
  } else if (userData.phoneNumber) {
    return [userData.phoneNumber];
  }
  return [];
}

/**
 * Helper function to get the group from lead's plans
 */
function getLeadGroup(lead: Lead): string | null {
  if (!lead.plans || lead.plans.length === 0) return null;
  return lead.plans[0]?.group || null;
}

/**
 * Helper function to check if coordinator matches lead's group
 * Handles case-insensitive matching: coordinatorType is lowercase (g1, g2, g3) and leadGroup can be any case (G1, g1, etc.)
 */
function coordinatorMatchesGroup(coordinatorType: CoordinatorType, leadGroup: string | null): boolean {
  if (!leadGroup) return false;
  
  const normalizedGroup = leadGroup.toUpperCase();
  
  switch (coordinatorType) {
    case 'g1':
      return normalizedGroup === 'G1';
    case 'g2':
      return normalizedGroup === 'G2';
    case 'g3':
      return normalizedGroup === 'G3';
    case 'all':
      return ['G1', 'G2', 'G3', 'OTHER'].includes(normalizedGroup);
    default:
      return false;
  }
}

/**
 * Sends WhatsApp notification to admin, manager, and coordinators when a chat message is added
 * @param lead - The lead object containing managerId and other details
 * @param messageText - The chat message text to include in notification
 * @param senderName - The name of the person who sent the message
 * @param mediaType - Optional media type (audio, image, video, file, pdf) to customize the notification message
 */
export async function sendChatMessageWhatsAppNotification(
  lead: Lead,
  messageText: string,
  senderName: string,
  mediaType?: 'audio' | 'image' | 'video' | 'file' | 'pdf'
): Promise<void> {

  try {
    // Fetch the latest lead data to ensure we have the most up-to-date status
    // This is important when status changes happen before the notification is sent
    // Also critical for leadNumber which might not be immediately available for new leads
    let latestLead = lead;
    let leadNumberRetry = 0;
    const maxRetries = 5; // Increased retries for new leads

    // Extended retry logic for new leads - leadNumber generation might be asynchronous
    // This addresses the issue where new lead notifications show "N/A" instead of proper lead number
    while (leadNumberRetry < maxRetries && (!latestLead.leadNumber || latestLead.leadNumber === latestLead.id)) {
    try {
      const leadRef = doc(db, 'leads', lead.id);
      const leadDoc = await getDoc(leadRef);
      if (leadDoc.exists()) {
        latestLead = { id: leadDoc.id, ...leadDoc.data() } as Lead;
      }

        // For new leads, use longer delays as leadNumber generation might be asynchronous
        if ((!latestLead.leadNumber || latestLead.leadNumber === latestLead.id) && leadNumberRetry < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second for new leads
        }
    } catch (error) {
        console.error('Error fetching latest lead data for new lead:', error);
      // Continue with the provided lead if fetch fails
        break;
      }
      leadNumberRetry++;
    }

    // Fetch manager's phone numbers (if manager exists)
    let managerPhoneNumbers: string[] = [];
    if (latestLead.managerId) {
      try {
        const managerRef = doc(db, 'users', latestLead.managerId);
        const managerDoc = await getDoc(managerRef);
        
        if (managerDoc.exists()) {
          const managerData = managerDoc.data();
          managerPhoneNumbers = extractPhoneNumbers(managerData);
        }
      } catch (error) {
        console.error('Error fetching manager data:', error);
        // Continue even if manager fetch fails - we still want to notify admin/coordinators
      }
    }

    // Fetch agent's name if lead has an agent
    let agentName = "N/A";
    if (latestLead?.agentId) {
      try {
        const agentRef = doc(db, 'users', latestLead.agentId);
        const agentDoc = await getDoc(agentRef);
        if (agentDoc.exists()) {
          const agentData = agentDoc.data();
          agentName = agentData.name || "N/A";
        }
      } catch (error) {
        console.error('Error fetching agent data:', error);
        // Continue with "N/A" if agent fetch fails
      }
    }

    // Determine lead group (from first plan) and build numbers list
    const plans = Array.isArray(latestLead?.plans) ? latestLead.plans : [];
    const numbersList =
      plans.length > 0
        ? plans
            .map((p: any) => {
              const num = (p?.number || '').toString().trim();
              const grp = (p?.group || '').toString().trim();
              return `${num || 'N/A'}${grp ? ` (${grp})` : ''}`;
            })
            .join(', ')
        : 'N/A';

    const formatStatus = (status?: string) => {
      if (!status) return 'N/A';
      return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    };

    // Format the message according to the specified format
    const etisalatId =
      typeof latestLead?.etisalatLeadId === 'string'
        ? latestLead.etisalatLeadId.trim()
        : undefined;
    const planEtisalatIds = Array.isArray(latestLead?.plans)
      ? latestLead.plans
          .map((p: any) => (typeof p?.etisalatLeadId === 'string' ? p.etisalatLeadId.trim() : undefined))
          .filter((v: string | undefined) => v && v.length > 0)
      : [];
    const uniqueEtisalatIds = Array.from(new Set([...(etisalatId ? [etisalatId] : []), ...planEtisalatIds]));
    const etisalatLine = uniqueEtisalatIds.length > 0
      ? `\n\n🆔 Etisalat ID${uniqueEtisalatIds.length > 1 ? 's' : ''}: ${uniqueEtisalatIds.map(id => `*${id}*`).join(', ')}`
      : '';

    const customerName =
      typeof latestLead?.customerName === 'string'
        ? latestLead.customerName.trim()
        : undefined;
    const customerNumber =
      typeof latestLead?.customerNumber === 'string'
        ? latestLead.customerNumber.trim()
        : undefined;
    const formattedMessage = `*Lead Notification:*

🔢 Lead Number: *${latestLead?.leadNumber || "N/A"}*

👤 Customer Name: *${customerName || "N/A"}*

📞 Customer Number: *${customerNumber || "N/A"}*

🔢 Numbers: ${numbersList}${etisalatLine}

📊 Lead Status: *${formatStatus(latestLead?.status)}*

📝 Remarks: ${(() => {
      if (mediaType === 'audio') {
        return '🎤 *Voice note*';
      } else if (mediaType === 'image') {
        return '🖼️ *Image attachment*';
      } else if (mediaType === 'video') {
        return '🎥 *Video attachment*';
      } else if (mediaType === 'pdf') {
        return '📄 *PDF attachment*';
      } else if (mediaType === 'file') {
        return '📎 *File attachment*';
      } else {
        return `*${messageText}*`;
      }
    })()} by *${senderName || "N/A"}*

🧑‍💼 Agent Name: ${agentName}

🔗 Lead URL: ${window.location.origin}/dashboard/leads/${latestLead.id}`;

    // Get WhatsApp credentials from Firebase
    const whatsappCredentials = await getWhatsAppCredentials();
    const WHATSAPP_API_URL = whatsappCredentials.apiUrl;
    const WHATSAPP_ACCESS_TOKEN = whatsappCredentials.accessToken;

    // Collect all phone numbers to notify
    const allPhoneNumbers = new Set<string>();

    // 1. Add manager's phone numbers (if manager exists)
    if (latestLead.managerId) {
      managerPhoneNumbers.forEach(phone => allPhoneNumbers.add(phone));
    }

    // 2. Add ALL admins' phone numbers (admin gets notifications for ALL messages)
    try {
      const adminsQuery = query(collection(db, 'users'), where('role', '==', 'admin'));
      const adminsSnapshot = await getDocs(adminsQuery);
      adminsSnapshot.docs.forEach(adminDoc => {
        const adminData = adminDoc.data();
        const adminPhones = extractPhoneNumbers(adminData);
        adminPhones.forEach(phone => allPhoneNumbers.add(phone));
      });
    } catch (error) {
      console.error('Error fetching admins for WhatsApp notification:', error);
    }

    // 3. Add coordinators' phone numbers (all states except create/pending_verification)
    try {
      const leadGroup = getLeadGroup(latestLead);
      const coordinatorsQuery = query(collection(db, 'users'), where('role', '==', 'coordinator'));
      const coordinatorsSnapshot = await getDocs(coordinatorsQuery);
      
      coordinatorsSnapshot.docs.forEach(coordDoc => {
        const coordData = coordDoc.data();
        const coordinatorType = coordData.coordinatorType as CoordinatorType;
        const coordPhones = extractPhoneNumbers(coordData);
        const matchesGroup = leadGroup ? coordinatorMatchesGroup(coordinatorType, leadGroup) : true;
        const shouldNotify =
          latestLead.status !== 'pending_verification' &&
          latestLead.status !== 'non_verified'; // skip create/pending
        if (coordPhones.length > 0 && (matchesGroup || !leadGroup) && shouldNotify) {
          coordPhones.forEach(phone => {
            allPhoneNumbers.add(phone);
          });
        }
      });
    } catch (error) {
      console.error('Error fetching coordinators for WhatsApp notification:', error);
    }

    // Send WhatsApp notification to all collected phone numbers
    const notificationPromises = Array.from(allPhoneNumbers).map(async (phoneNumber) => {
      try {
        const response = await fetch(WHATSAPP_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: phoneNumber,
            type: "text",
            text: {
              body: formattedMessage
            }
          })
        });

        if (!response.ok) {
          console.error('Failed to send WhatsApp notification:', await response.text());
        }
      } catch (error) {
        console.error('Error sending WhatsApp notification:', error);
        // Don't throw - we don't want to fail the chat message creation if notification fails
      }
    });

    await Promise.all(notificationPromises);
  } catch (error) {
    console.error('Error in WhatsApp notification process:', error);
    // Don't throw - we don't want to fail the chat message creation if notification fails
  }
}

