import { getWhatsAppVerificationGroups } from './configService';

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
    const groups = await getWhatsAppVerificationGroups();
    
    // Convert to RoutingConfig format
    const routes: Record<GroupKey, RoutingConfig> = {
      G1: {
        meta: {
          businessPhoneId: groups.G1.businessPhoneId,
          accessToken: groups.G1.accessToken
        },
        template: {
          templateName: groups.G1.templateName,
          languageCode: groups.G1.languageCode
        }
      },
      G2: {
        meta: {
          businessPhoneId: groups.G2.businessPhoneId,
          accessToken: groups.G2.accessToken
        },
        template: {
          templateName: groups.G2.templateName,
          languageCode: groups.G2.languageCode
        }
      },
      G3: {
        meta: {
          businessPhoneId: groups.G3.businessPhoneId,
          accessToken: groups.G3.accessToken
        },
        template: {
          templateName: groups.G3.templateName,
          languageCode: groups.G3.languageCode
        }
      },
      OTHER: {
        meta: {
          businessPhoneId: groups.OTHER.businessPhoneId,
          accessToken: groups.OTHER.accessToken
        },
        template: {
          templateName: groups.OTHER.templateName,
          languageCode: groups.OTHER.languageCode
        }
      }
    };
    
    // Update cache
    cachedRoutes = routes;
    cacheTimestamp = now;
    
    return routes;
  } catch (error) {
    console.error('Error fetching verification groups from Firebase:', error);
    
    // Fallback to environment variables if Firebase fails
    const fallbackRoutes: Record<GroupKey, RoutingConfig> = {
  G1: {
    meta: {
      businessPhoneId: import.meta.env.VITE_WA_G1_PHONE_ID || '',
      accessToken: import.meta.env.VITE_WA_G1_TOKEN || ''
    },
    template: {
      templateName: import.meta.env.VITE_WA_G1_TEMPLATE || 'verification_g1',
      languageCode: import.meta.env.VITE_WA_LANG || 'en'
    }
  },
  G2: {
    meta: {
      businessPhoneId: import.meta.env.VITE_WA_G2_PHONE_ID || '',
      accessToken: import.meta.env.VITE_WA_G2_TOKEN || ''
    },
    template: {
      templateName: import.meta.env.VITE_WA_G2_TEMPLATE || 'verification_g2',
      languageCode: import.meta.env.VITE_WA_LANG || 'en'
    }
  },
  G3: {
    meta: {
      businessPhoneId: import.meta.env.VITE_WA_G3_PHONE_ID || '',
      accessToken: import.meta.env.VITE_WA_G3_TOKEN || ''
    },
    template: {
      templateName: import.meta.env.VITE_WA_G3_TEMPLATE || 'verification_g3',
      languageCode: import.meta.env.VITE_WA_LANG || 'en'
    }
  },
  OTHER: {
    meta: {
      businessPhoneId: import.meta.env.VITE_WA_DEF_PHONE_ID || '',
      accessToken: import.meta.env.VITE_WA_DEF_TOKEN || ''
    },
    template: {
      templateName: import.meta.env.VITE_WA_DEF_TEMPLATE || 'verification_default',
      languageCode: import.meta.env.VITE_WA_LANG || 'en'
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
    throw new Error('WhatsApp meta account is not configured for this route');
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
    const errorMsg = `WhatsApp meta account is not configured for this route. Group: ${group}, BusinessPhoneId: ${meta.businessPhoneId ? 'SET' : 'MISSING'}, AccessToken: ${meta.accessToken ? 'SET' : 'MISSING'}`;
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


