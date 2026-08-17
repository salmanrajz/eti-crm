import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Lead, User } from '../types';
import { logOutboundVerificationMessage } from './whatsappVerification';

const ENGLISH_TEMPLATE_NAME = 'tayasarrr';
const ENGLISH_TEMPLATE_LANGUAGE = 'en';
const ARABIC_TEMPLATE_NAME = 'tayasarrr_arabic';
const ARABIC_TEMPLATE_LANGUAGE = 'ar';
const UAE_DIAL_CODE = '971';

const WHATSAPP_API_URL = 'https://graph.facebook.com/v25.0/542227575631617/messages';
const WHATSAPP_ACCESS_TOKEN = 'EAAQzFQxG0goBR5XZAhlyZBZB4XK5jdlfHBuzpD8eNBsop4u5VsTgkuM2Bn1FwWXL48EaM5WCTYWZBvC7KmQlu2aEycMWDtLfAuiUJzgheZCIzxy2eVbFZBOMFj0BVvG0U3IR39jYDT9CuIEZBCmPu9ZB6nq9M8DZBRosdRO66mZBn9VKOrOaffw6jl5El6kwZCbwBcBDa1uPZCtLivU3aa0UqojsobQOh3ZAGwv76htOP7OmkkUfrPnNZARtcw7ZBRj7I5oT52OPCWm4sBJ2SrFLvDKUZCeeZADVP6hoBvRhmCyZCFdMsZD';

interface PlanTemplateDetails {
  amount: string;
  benefits: string;
}

interface SendVerifierCustomerTemplateOptions {
  lead: Lead;
  verifier: User;
  leadUrl?: string;
}

interface TemplateConfig {
  name: string;
  language: string;
}

function formatUaeWhatsAppNumber(customerNumber?: string): string {
  let normalizedNumber = (customerNumber || '').toString().replace(/\D/g, '');

  if (!normalizedNumber) {
    throw new Error('Customer number missing in lead');
  }

  // Sirf UAE numbers allow hain: 05xxxxxxxx, 5xxxxxxxx, 9715xxxxxxxx, 009715xxxxxxxx.
  if (normalizedNumber.startsWith('00')) {
    normalizedNumber = normalizedNumber.substring(2);
  }

  if (normalizedNumber.startsWith(UAE_DIAL_CODE)) {
    if (!/^9715\d{8}$/.test(normalizedNumber)) {
      throw new Error('Only UAE mobile numbers can receive WhatsApp templates');
    }
    return normalizedNumber;
  }

  if (normalizedNumber.startsWith('0')) {
    normalizedNumber = normalizedNumber.substring(1);
  }

  if (!/^5\d{8}$/.test(normalizedNumber)) {
    throw new Error('Only UAE mobile numbers can receive WhatsApp templates');
  }

  // Local UAE number ko WhatsApp international format me convert karte hain.
  return `${UAE_DIAL_CODE}${normalizedNumber}`;
}

async function getPlanTemplateDetails(planName?: string): Promise<PlanTemplateDetails> {
  if (!planName) {
    return { amount: 'N/A', benefits: 'N/A' };
  }

  try {
    const plansQuery = query(collection(db, 'plans'), where('name', '==', planName));
    const plansSnapshot = await getDocs(plansQuery);
    const planData = plansSnapshot.docs[0]?.data();

    return {
      amount: planData?.amount || planName,
      benefits: planData?.benefits || 'N/A'
    };
  } catch (error) {
    console.error('Error loading plan details for WhatsApp template:', error);
    return { amount: planName, benefits: 'N/A' };
  }
}

async function buildTemplateParameters(lead: Lead): Promise<string[]> {
  const selectedNumbers = lead.plans?.map(plan => plan.number).filter(Boolean).join(', ') || 'N/A';
  const firstPlanName = lead.plans?.[0]?.plan || lead.plan || '';
  const planDetails = await getPlanTemplateDetails(firstPlanName);

  return [
    selectedNumbers,
    planDetails.amount,
    planDetails.benefits,
    '1 Year'
  ];
}

function resolveTemplateConfig(lead: Lead): TemplateConfig {
  const language = (lead.language || '').trim().toLowerCase();
  const isArabic = language === 'arabic' || language === 'ar' || language.includes('arabic');

  // Agar lead Arabic language ki hai to Arabic template use hoga, warna English default rahega.
  return isArabic
    ? { name: ARABIC_TEMPLATE_NAME, language: ARABIC_TEMPLATE_LANGUAGE }
    : { name: ENGLISH_TEMPLATE_NAME, language: ENGLISH_TEMPLATE_LANGUAGE };
}

function buildTemplatePayload(to: string, parameters: string[], templateConfig: TemplateConfig) {
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateConfig.name,
      language: {
        code: templateConfig.language
      },
      components: [
        {
          type: 'body',
          parameters: parameters.map(text => ({
            type: 'text',
            text
          }))
        }
      ]
    }
  };
}

async function parseWhatsAppResponse(response: Response): Promise<any> {
  const responseText = await response.text();

  try {
    return responseText ? JSON.parse(responseText) : {};
  } catch {
    return { raw: responseText };
  }
}

export async function sendVerifierCustomerTemplateWhatsApp({
  lead,
  verifier
}: SendVerifierCustomerTemplateOptions) {
  const to = formatUaeWhatsAppNumber(lead.customerNumber);
  const parameters = await buildTemplateParameters(lead);
  const templateConfig = resolveTemplateConfig(lead);
  const payload = buildTemplatePayload(to, parameters, templateConfig);

  const response = await fetch(WHATSAPP_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const responseData = await parseWhatsAppResponse(response);

  if (!response.ok) {
    const message = responseData?.error?.message || responseData?.raw || 'Failed to send WhatsApp template';

    await logOutboundVerificationMessage(
      lead.id,
      to,
      templateConfig.name,
      parameters,
      {
        status: 'failed',
        error: {
          message,
          details: JSON.stringify(responseData)
        }
      }
    );

    throw new Error(message);
  }

  await logOutboundVerificationMessage(
    lead.id,
    to,
    templateConfig.name,
    parameters,
    {
      messageText: `Customer template sent by ${verifier?.name || 'Verifier'}`,
      sendResponse: responseData,
      status: responseData?.messages?.[0]?.message_status || 'accepted'
    }
  );

  return {
    response: responseData
  };
}
