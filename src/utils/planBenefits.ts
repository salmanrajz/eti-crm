export interface PlanBenefit {
  amount: string;
  benefits: string;
  duration: string;
}

export const planBenefits: { [key: string]: PlanBenefit } = {
  'New Freedom 250 - 12 M - 3 Mbps - Unlimited Data - 1000 Local mins': {
    amount: '250',
    benefits: '1000 local minutes, Non-Stop Data (up to 3 Mbps)',
    duration: '1'
  },
  'New Freedom 250 - 12 M - 3 Mbps - Unlimited Data - 500 Flexible Mint': {
    amount: '250',
    benefits: '500 flexible minutes, Non-Stop Data (up to 3 Mbps)',
    duration: '1'
  },
  'New Freedom 260 With Unlimited Country to 1 Preffered International Number Local': {
    amount: '260',
    benefits: 'Unlimited calls to 1 preferred international number, 600 flexible minutes, 20 GB data',
    duration: '1'
  },
  'New Freedom Plan 325 - 12 M - Local': {
    amount: '325',
    benefits: 'Unlimited local minutes, 27 GB data',
    duration: '1'
  },
  'New Freedom 325 - 12 M - 10 Mbps - Unlimited Data - 1800 Local Mins': {
    amount: '325',
    benefits: '1800 local minutes, Non-Stop Data (up to 10 Mbps)',
    duration: '1'
  },
  'New Freedom 325 - 12 M - 10 Mbps - Unlimited Data - 900 Flexi Mins': {
    amount: '325',
    benefits: '900 flexible minutes, Non-Stop Data (up to 10 Mbps)',
    duration: '1'
  },
  'Emirati Freedom 400': {
    amount: '400',
    benefits: 'Unlimited local calls, 40 GB data',
    duration: '1'
  },
  'New Freedom 500 - 12 M - 20 Mbps - Unlimited Data - 3000 Local Mins': {
    amount: '500',
    benefits: '3000 local minutes, Non-Stop Data (up to 20 Mbps)',
    duration: '1'
  }
}; 