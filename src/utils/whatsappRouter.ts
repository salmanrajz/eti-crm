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

// IMPORTANT: you can later move these to env or Firestore settings
const ROUTES: Record<GroupKey, RoutingConfig> = {
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

export function resolveWhatsAppRoute(group?: string): RoutingConfig {
  return ROUTES[normalizeGroup(group)];
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
  const { meta, template } = resolveWhatsAppRoute(group);
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
  const lang = options.languageCode || (ROUTES[normalizeGroup(group)].template.languageCode);
  const { meta } = resolveWhatsAppRoute(group);
  if (!meta.businessPhoneId || !meta.accessToken) {
    throw new Error('WhatsApp meta account is not configured for this route');
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


