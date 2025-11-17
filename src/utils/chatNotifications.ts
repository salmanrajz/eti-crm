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
 */
export async function sendChatMessageWhatsAppNotification(
  lead: Lead,
  messageText: string,
  senderName: string
): Promise<void> {

  try {
    // Fetch the latest lead data to ensure we have the most up-to-date status
    // This is important when status changes happen before the notification is sent
    let latestLead = lead;
    try {
      const leadRef = doc(db, 'leads', lead.id);
      const leadDoc = await getDoc(leadRef);
      if (leadDoc.exists()) {
        latestLead = { id: leadDoc.id, ...leadDoc.data() } as Lead;
      }
    } catch (error) {
      console.error('Error fetching latest lead data, using provided lead:', error);
      // Continue with the provided lead if fetch fails
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

    // Format the message according to the specified format
    const formattedMessage = `*Lead Notification:*

👤 Customer Name: *${latestLead?.customerName || "N/A"}*

📞 Customer Number: *${latestLead?.customerNumber || "N/A"}*

🔢 Selected Number: *${latestLead?.plans?.[0]?.number || "N/A"}*

📊 Lead Status: *${latestLead?.status || "N/A"}*

📝 Remarks: *${messageText}* by *${senderName || "N/A"}*

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

    // 3. Add coordinators' phone numbers (only if lead is verified and matches their group)
    if (latestLead.status === 'verified') {
      try {
        const leadGroup = getLeadGroup(latestLead);
        
        if (leadGroup) {
          const coordinatorsQuery = query(collection(db, 'users'), where('role', '==', 'coordinator'));
          const coordinatorsSnapshot = await getDocs(coordinatorsQuery);
          
          coordinatorsSnapshot.docs.forEach(coordDoc => {
            const coordData = coordDoc.data();
            const coordinatorType = coordData.coordinatorType as CoordinatorType;
            
            // Check if this coordinator handles the lead's group
            if (coordinatorMatchesGroup(coordinatorType, leadGroup)) {
              const coordPhones = extractPhoneNumbers(coordData);
              if (coordPhones.length > 0) {
                coordPhones.forEach(phone => {
                  allPhoneNumbers.add(phone);
                });
              }
            }
          });
        }
      } catch (error) {
        console.error('Error fetching coordinators for WhatsApp notification:', error);
      }
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

