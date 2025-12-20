import { getWhatsAppFlowGroups } from './configService';
import { getFunctions, httpsCallable } from 'firebase/functions';

type GroupKey = 'G1' | 'G2' | 'G3' | 'OTHER';

interface TemplateConfig {
  templateName: string;
  languageCode: string;
}

interface MetaAccountConfig {
  businessPhoneId: string; // used in Graph URL
  accessToken: string;     // bearer token
}

interface RoutingConfig {
  meta: MetaAccountConfig;
  template: TemplateConfig;
}

function normalizeGroup(group?: string): GroupKey {
  const g = (group || '').toUpperCase();
  if (g === 'G1') return 'G1';
  if (g === 'G2') return 'G2';
  if (g === 'G3') return 'G3';
  return 'OTHER';
}

// Cache for verification groups to avoid repeated Firebase calls
let cachedRoutes: Record<GroupKey, RoutingConfig> | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Get routes from Firebase with caching
 */
async function getRoutesFromFirebase(): Promise<Record<GroupKey, RoutingConfig>> {
  const now = Date.now();
  
  // Return cached routes if still valid
  if (cachedRoutes && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedRoutes;
  }
  
  try {
    const flowGroups = await getWhatsAppFlowGroups();
    
    // Convert to RoutingConfig format from Flow Configuration
    const routes: Record<GroupKey, RoutingConfig> = {
      G1: {
        meta: {
          businessPhoneId: flowGroups.G1.businessPhoneId || '',
          accessToken: flowGroups.G1.accessToken || ''
        },
        template: {
          templateName: flowGroups.G1.templateName || '',
          languageCode: flowGroups.G1.languageCode || 'en'
        }
      },
      G2: {
        meta: {
          businessPhoneId: flowGroups.G2.businessPhoneId || '',
          accessToken: flowGroups.G2.accessToken || ''
        },
        template: {
          templateName: flowGroups.G2.templateName || '',
          languageCode: flowGroups.G2.languageCode || 'en'
        }
      },
      G3: {
        meta: {
          businessPhoneId: flowGroups.G3.businessPhoneId || '',
          accessToken: flowGroups.G3.accessToken || ''
        },
        template: {
          templateName: flowGroups.G3.templateName || '',
          languageCode: flowGroups.G3.languageCode || 'en'
        }
      },
      OTHER: {
        meta: {
          businessPhoneId: flowGroups.OTHER.businessPhoneId || '',
          accessToken: flowGroups.OTHER.accessToken || ''
        },
        template: {
          templateName: flowGroups.OTHER.templateName || '',
          languageCode: flowGroups.OTHER.languageCode || 'en'
        }
      }
    };
    
    // Update cache
    cachedRoutes = routes;
    cacheTimestamp = now;
    
    return routes;
  } catch (error) {
    console.error('Error fetching verification groups from Firebase:', error);
    
    // Fallback to empty routes if Firebase fails
    const fallbackRoutes: Record<GroupKey, RoutingConfig> = {
      G1: {
        meta: {
          businessPhoneId: '',
          accessToken: ''
        },
        template: {
          templateName: '',
          languageCode: 'en'
        }
      },
      G2: {
        meta: {
          businessPhoneId: '',
          accessToken: ''
        },
        template: {
          templateName: '',
          languageCode: 'en'
        }
      },
      G3: {
        meta: {
          businessPhoneId: '',
          accessToken: ''
        },
        template: {
          templateName: '',
          languageCode: 'en'
        }
      },
      OTHER: {
        meta: {
          businessPhoneId: '',
          accessToken: ''
        },
        template: {
          templateName: '',
          languageCode: 'en'
        }
      }
    };

    return fallbackRoutes;
  }
}

/**
 * Clear the routes cache (useful after updates)
 */
export function clearRoutesCache(): void {
  cachedRoutes = null;
  cacheTimestamp = 0;
}

export async function resolveWhatsAppRoute(group?: string): Promise<RoutingConfig> {
  const routes = await getRoutesFromFirebase();
  return routes[normalizeGroup(group)];
}

export function getPartnerLabel(group?: string): string {
  const key = normalizeGroup(group);
  if (key === 'G1') return 'Connect Authorised Channel Partner of Etisalat';
  if (key === 'G2') return 'Express Dial Authorised Channel Partner of Etisalat';
  if (key === 'G3') return 'Telecon Authorised Channel Partner of Etisalat';
  return 'Express Dial Authorised Channel Partner of Etisalat';
}

export async function sendWhatsAppTemplateByGroup(options: {
  to: string; // E.164
  group?: string; // e.g., 'G1'
  bodyParameters?: Array<{ type: 'text'; text: string }>; // template body params
  templateOverride?: TemplateConfig; // optional override
}) {
  const { to, group, bodyParameters = [], templateOverride } = options;
  const { meta, template } = await resolveWhatsAppRoute(group);
  const tpl = templateOverride || template;
  if (!meta.businessPhoneId || !meta.accessToken) {
    const groupName = group || 'UNKNOWN';
    throw new Error(`WhatsApp meta account is not configured for this route (Group: ${groupName}). Please configure Business Phone ID and Access Token in Admin Dashboard > WhatsApp Settings > WhatsApp Flow Configuration > ${groupName} tab > Graph API Credentials section.`);
  }
  const url = `https://graph.facebook.com/v19.0/${meta.businessPhoneId}/messages`;
  const payload: any = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: tpl.templateName,
      language: { code: tpl.languageCode },
      ...(bodyParameters.length > 0
        ? { components: [{ type: 'body', parameters: bodyParameters }] }
        : {})
    }
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${meta.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`WhatsApp send failed: ${res.status} ${res.statusText} ${err}`);
  }
  return res.json().catch(() => ({}));
}

export async function sendWhatsAppWithComponentsByGroup(options: {
  to: string;
  group?: string;
  templateName: string;
  languageCode?: string;
  components: any[]; // raw WhatsApp components (e.g., body + button flow)
}) {
  const { to, group, templateName, components } = options;
  const routes = await getRoutesFromFirebase();
  const lang = options.languageCode || routes[normalizeGroup(group)].template.languageCode;
  const { meta } = await resolveWhatsAppRoute(group);
  
  if (!meta.businessPhoneId || !meta.accessToken) {
    const errorMsg = `WhatsApp meta account is not configured for this route. Group: ${group || 'UNKNOWN'}, BusinessPhoneId: ${meta.businessPhoneId ? 'SET' : 'MISSING'}, AccessToken: ${meta.accessToken ? 'SET' : 'MISSING'}. Please configure these credentials in Admin Dashboard > WhatsApp Settings > WhatsApp Flow Configuration > ${group || 'Group'} tab > Graph API Credentials section.`;
    throw new Error(errorMsg);
  }
  
  const url = `https://graph.facebook.com/v19.0/${meta.businessPhoneId}/messages`;
  const payload: any = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: lang },
      components
    }
  };
  
  try {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${meta.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
    
    const responseText = await res.text();
    
  if (!res.ok) {
      let parsedError;
      try {
        parsedError = JSON.parse(responseText);
      } catch {
        parsedError = responseText;
      }
      
      throw new Error(`WhatsApp send failed: ${res.status} ${res.statusText} ${JSON.stringify(parsedError)}`);
  }
    
    let responseJson;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = {};
    }
    
    return responseJson;
  } catch (error: any) {
    throw error;
  }
}

/**
 * Trigger WhatsApp verification flow using the new API endpoint
 * @param options - Flow trigger options
 * @returns API response
 */
export async function triggerFlowExternal(options: {
  phoneNumber: string; // Customer phone number (with country code, e.g., "971501234567")
  group?: string; // Group (G1, G2, G3, or OTHER)
  language?: string; // Language code (e.g., "English", "Arabic")
  templateVariables: {
    value1: string;
    value2: string;
    value3: string;
    value4: string;
  };
}) {
  const { phoneNumber, group, language, templateVariables } = options;
  
  try {
    const functions = getFunctions();
    const triggerFlow = httpsCallable(functions, 'triggerWhatsAppFlow');
    
    const result = await triggerFlow({
      phoneNumber: phoneNumber,
      group: group,
      language: language,
      templateVariables: {
        value1: templateVariables.value1,
        value2: templateVariables.value2,
        value3: templateVariables.value3,
        value4: templateVariables.value4
      }
    });
    
    return result.data as any;
  } catch (error: any) {
    // Re-throw with a more descriptive message if it's a Firebase error
    if (error?.code === 'functions/internal') {
      throw new Error(error.message || 'Failed to trigger WhatsApp flow');
    }
    throw error;
  }
}

/**
 * Check WhatsApp conversation status
 * @param phoneNumber - Customer phone number (with country code, e.g., "971501234567")
 * @returns Conversation data
 */
export async function checkConversation(phoneNumber: string, leadId?: string) {
  try {
    const functions = getFunctions();
    const checkConversationFunc = httpsCallable(functions, 'checkWhatsAppConversation');
    
    const result = await checkConversationFunc({
      phoneNumber: phoneNumber,
      leadId: leadId
    });
    
    const data = result.data as any;
    
    // If the function returned an error response, return it gracefully
    if (data && data.success === false) {
      console.warn('Conversation check returned error:', data.error);
      return {
        success: false,
        error: data.error,
        messages: []
      };
    }
    
    return data;
  } catch (error: any) {
    // Handle Firebase function errors gracefully
    console.error('Error calling checkConversation:', error);
    
    // Return error object instead of throwing
    return {
      success: false,
      error: error?.message || 'Failed to check WhatsApp conversation',
      messages: []
    };
  }
}


