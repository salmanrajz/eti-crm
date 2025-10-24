import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, query, where, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { User, NumberPool, Lead } from '../../types';
import { toast } from 'react-hot-toast';
import { logNumberAction } from '../../utils/numberLogging';
import { format } from 'date-fns';
// import { countries } from 'countries-list';
import { FormSection } from './FormSection';
import { FormInput } from './FormInput';
import { FormSelect } from './FormSelect';
// import { NumberPool as NumberPoolComponent } from '../../pages/numbers/NumberPool';
import {
  User2,
  Phone,
  Globe,
  Calendar,
  MapPin,
  // CreditCard,
  Languages,
  Users,
  Package,
  MessageSquare,
  Building2
} from 'lucide-react';
import { QuickNumberSelect } from './QuickNumberSelect';
import { countryList } from '../../utils/countries';
import { planBenefits } from '../../utils/planBenefits';
import { collection as fbCollection, setDoc, doc as fbDoc, serverTimestamp as fbServerTimestamp } from 'firebase/firestore';
import { logOutboundVerificationMessage } from '../../utils/whatsappVerification';

const WHATSAPP_PHONE_NUMBER_ID = '176399048891733';
const WHATSAPP_API_URL = 'https://graph.facebook.com/v17.0/542227575631617/messages';
const WHATSAPP_ACCESS_TOKEN = 'EAAQzFQxG0goBO4DZABL7PrPyIdmFxDbP3hFYQCiioiJZAo4P4JbABnGw1qmBzVJUerTHkZB2qZAfWdaos16NJUYmXIewPTmV90neQjceLWnycrhZBfayZAP5EHCYD4qwBDNAiMvdBz8gLj6pwjDCCCVVA2UasKMPgvFx5GGwXfIMBBCc0tOvOCvTc6VeNkgD5GyAZDZD';

const emirates = [
  'Abu Dhabi',
  'Dubai',
  'Sharjah',
  'Ajman',
  'Umm Al Quwain',
  'Ras Al Khaimah',
  'Fujairah'
];

const areas = {
  'Abu Dhabi': ['Abu Dhabi City', 'Al Ain', 'Al Dhafra', 'Musaffah', 'Khalifa City'],
  'Dubai': ['Deira', 'Bur Dubai', 'Dubai Marina', 'JLT', 'Downtown Dubai'],
  'Sharjah': ['Al Majaz', 'Al Nahda', 'Al Qasimia', 'Al Taawun'],
  'Ajman': ['Ajman City', 'Al Jurf', 'Al Rashidiya'],
  'Umm Al Quwain': ['UAQ City', 'Al Salamah', 'Al Raas'],
  'Ras Al Khaimah': ['RAK City', 'Al Hamra', 'Al Nakheel'],
  'Fujairah': ['Fujairah City', 'Dibba', 'Al Faseel']
};

const languages = ['Arabic', 'English', 'Hindi', 'Urdu', 'Malayalam', 'Filipino', 'Bengali'];
const productTypes = ['New', 'Port In'];
// const numberTypes = ['Gold', 'Gold Plus', 'Platinum', 'Silver', 'Silver Plus', 'Standard'];
// const numberCategories = ['Standard', 'Silver', 'Silver Plus', 'Gold', 'Gold Plus', 'Platinum'] as const;

const plans = {
  newFreedom: [
    'NewFreedom125-12M-Local',
    'NewFreedom150-NC-Local',
    'NewFreedom150-NC-Flexi',
    'NewFreedom200-12M-Flexi',
    'NewFreedom225-NC-Local',
    'NewFreedomPlan225-NC-Flexi',
    'NewFreedomPlan375-NC-Flexi',
    'NewFreedomPlan375-NC-Local',
    'NewFreedomPlan700-NC-Unlimited Flexi',
    'NewFreedomPlan1300-NC-Unlimited Flexi & Unlimited local Data',
    'NewFreedomPlan325-12M-Flexi',
    'NewFreedomPlan325-12M-Local',
    'NewFreedomPlan600-12M-Unlimited Flexi',
    'NewFreedomPlan1200-12M-Unlimited Flexi & Unlimited local Data',
    'New Freedom 50 Flexi Minutes',
    'New Freedom 200 - FLEXIBLE',
    'New Freedom 200 - LOCAL',
    'New Freedom 250 - 12 M - 3 Mbps - Unlimited Data - 1000 Local mins',
    'New Freedom 250 - 12 M - 3 Mbps - Unlimited Data - 1000 Local mins (SS)',
    'New Freedom 250 - 12 M - 3 Mbps - Unlimited Data - 500 Flexible Mint',
    'New Freedom 250 - 12 M - 3 Mbps - Unlimited Data - 500 Flexible Mins (SS)',
    'New Freedom 250 - 12 M - 3 Mbps - Unlimited Data - 500 Flexible Mins NC',
    'New Freedom 325 Flexi minutes 12 months commitment',
    'New Freedom 325 Local minutes 12 months commitment',
    'New Freedom 325 - 12 M - 10 Mbps - Unlimited Data 900 Flexi Mins',
    'New Freedom 325 - 12 M - 10 Mbps - Unlimited Data 900 Flexi Mins (SS)',
    'New Freedom 325 - 12 M - 10 Mbps - Unlimited Data 1800 Local Mins',
    'New Freedom 325 - 12 M - 10 Mbps - Unlimited Data 1800 Local Mins (SS)',
    'New Freedom 500 - 12 M - 20 Mbps - Unlimited Data 1500 Flexi Mins',
    'New Freedom 500 - 12 M - 20 Mbps - Unlimited Data 1500 Flexi Mins (SS)',
    'New Fredoom 500 - 12 M - 20 Mbps - Unlimited Data 3000 Local Mins',
    'New Fredoom 500 - 12 M - 20 Mbps - Unlimited Data 3000 Local Mins (SS)',
    'New Freedom 600 - NC - 20 Mbps - Unlimited Data 1500 Flexi Mins',
    'New Fredoom 600 - NC - 20 Mbps - Unlimited Data 3000 Local Mins',
    'New Freedom 600 unlimited 12 months commitment',
    'New Freedom 1200 unlimited 12 months commitment',
    'New Freedom 260 With Unlimited Country to 1 Preffered International Number Local',
    'New Freedom 260 With Unlimited Country to 1 Preffered International Number Flexi',
    'New freedom 500 non stop data (24 months) - Local',
    'New freedom 500 non stop data (24 months) - Flexi'
  ],
  oldFreedom: [
    'FreedomPlan200-NC-Flexi (old)',
    'FreedomPlan200-NC-Local (old)',
    'FreedomPlan250-NC-Flexi (old)',
    'FreedomPlan250-NC-Local (old)',
    'FreedomPlan300-NC-Flexi (old)',
    'FreedomPlan300-NC-Local (old)',
    'FreedomPlan600-NC-Local (old)',
    'FreedomPlan600-NC-Flexi (old)',
    'FreedomPlan1200-NC-Flexi (Old)',
    'FreedomPlan1200-NC-Local (Old)',
    'FreedomPlan1000-12M-Local (Old)',
    'FreedomPlan1000-12M-Flexi (Old)',
    'FreedomPlan500-12M-Flexi (old)',
    'FreedomPlan500-12M-Local (old)',
    'FreedomPlan275-12M-Local (old)',
    'FreedomPlan275-12M-Flexi (old)',
    'FreedomPlan225-12M-Flexi (old)',
    'FreedomPlan225-12M-Local (old)',
    'FreedomPlan175-12M-Local (old)',
    'FreedomPlan175-12M-Flexi (Old)',
    'Freedom Plan 275 local (Old)',
    'Freedom Plan 275 Flexible',
    'Freedom plan 275 - Local plan 12 months contract',
    'Freedom plan 500 - Flexi plan 12 months contract',
    'Freedom plan 500 - Local plan 12 months contract',
    'Freedom plan 1000 Flexi plan 12 months contract',
    'Freedom plan 1000 - Local plan 12 months contract'
  ],
  smart: [
    'Smart 250-NC (1 preferred number local)',
    'Smart 250-12M (1 preferred number local)',
    'Smart250-24M (1 preferred number local)',
    'Smart600-NC (2 preferred number local)',
    'Smart600-12M (2 preferred number local)',
    'Smart600-24M (2 preferred number local)',
    'Smart1000-NC (3 preferred number local)'
  ],
  emirati: [
    'Emirati150-12M',
    'Emirati150-24M',
    'Emirati 250-NC (1 preferred number local)',
    'Emirati 250-24M (1 preferred number local)',
    'Emirati 600-NC (2 preferred number local)',
    'Emirati 1000-NC (3 preferred number local)',
    'Emirati freedom plan 750',
    'Emirati Freedom Plan 250 - 12 Months',
    'Emirati Freedom 400',
    'Emirati Freedom 450 - No Contract',
    'Emirati Freedom 1500',
    'Emirati Freedom 1600 - No Contract',
    'Emirati Freedom 250 - 12 Months contract'
  ],
  premium: [
    'Premium Postpaid Local 500-24M (GOLD)',
    'Premium Postpaid Flexi 500-24M (GOLD)',
    'Premium Postpaid Local 1000-24M (PLATINUM)',
    'Premium Postpaid Flexi 1000-24M (PLATINUM)',
    'PREMIUM AED 1000',
    'PREMIUM AED 1000 FLEXI'
  ],
  homeWifi: [
    'Basic Home WiFi',
    'Standard Home WiFi',
    'Premium Home WiFi',
    'VIP Home WiFi'
  ]
};

interface PlanOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface PlanCategory {
  label: string;
  options: PlanOption[];
}

const planCategories: PlanCategory[] = [
  { 
    label: '✅ New Freedom Plans',
    options: plans.newFreedom.map(plan => ({ value: plan, label: plan }))
  },
  {
    label: '✅ Freedom Plans (Old)',
    options: plans.oldFreedom.map(plan => ({ value: plan, label: plan }))
  },
  {
    label: '✅ Smart Plans',
    options: plans.smart.map(plan => ({ value: plan, label: plan }))
  },
  {
    label: '✅ Emirati Plans',
    options: plans.emirati.map(plan => ({ value: plan, label: plan }))
  },
  {
    label: '✅ Premium Postpaid Plans',
    options: plans.premium.map(plan => ({ value: plan, label: plan }))
  },
  {
    label: '✅ Home WiFi Plans',
    options: plans.homeWifi.map(plan => ({ value: plan, label: plan }))
  }
];

interface PlanSelection {
  numberId: string;
  number: string;
  plan: string;
  category: string;
  group?: string;
  type?: string;
  status?: string;
}

interface FormData {
  customerName: string;
  customerNumber: string;
  customerAddress: string;
  country: string;
  customerAge: string;
  productType: string;
  gender: string;
  emirate: string;
  area: string;
  hasEmirateId: boolean;
  advancePayment: boolean;
  language: string;
  sharedWith: string;
  locationUrl: string;
  confirmLocationUrl: boolean;
  startDate: string;
  startTime: string;
  numberType: string;
  remarks: string;
}

interface FormErrors {
  customerName?: string;
  customerNumber?: string;
  customerAge?: string;
  locationUrl?: string;
  plans?: string;
  customerAddress?: string;
  [key: string]: string | undefined;
}

interface CreateLeadProps {
  isEditing?: boolean;
  initialData?: Lead;
  onSave?: (data: Partial<Lead>) => Promise<void>;
  onCancel?: () => void;
}

// const INITIAL_LOAD_SIZE = 50;
// const SEARCH_DEBOUNCE = 150;

function CreateLead({ isEditing, initialData, onSave, onCancel }: CreateLeadProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [selectedPlans, setSelectedPlans] = useState<PlanSelection[]>(
    initialData?.plans || []
  );
  const [currentNumber, setCurrentNumber] = useState(
    initialData?.plans?.[0]?.number || ''
  );
  const [currentPlan, setCurrentPlan] = useState(
    initialData?.plans?.[0]?.plan || ''
  );
  const [currentNumberData, setCurrentNumberData] = useState<NumberPool | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>(
    initialData?.plans?.[0]?.category || 'Standard'
  );
  const [showNumberPool, setShowNumberPool] = useState(true);
  const [teamManagerId, setTeamManagerId] = useState<string | null>(null);
  const planErrorRef = useRef<HTMLDivElement | null>(null);

  const [formData, setFormData] = useState<FormData>({
    customerName: initialData?.customerName || '',
    customerNumber: initialData?.customerNumber || '',
    customerAddress: initialData?.customerAddress || '',
    country: initialData?.country || 'AE',
    customerAge: initialData?.customerAge?.toString() || '',
    productType: initialData?.productType || 'New',
    gender: initialData?.gender || 'Male',
    emirate: initialData?.emirate || 'Dubai',
    area: initialData?.area || areas['Dubai'][0],
    hasEmirateId: initialData?.hasEmirateId || false,
    advancePayment: initialData?.advancePayment || false,
    language: initialData?.language || 'English',
    sharedWith: initialData?.sharedWith?.[0] || '',
    locationUrl: initialData?.locationUrl || '',
    confirmLocationUrl: initialData?.confirmLocationUrl || false,
    startDate: initialData?.startDate ? format(initialData.startDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
    startTime: initialData?.startTime || format(new Date(), 'HH:mm'),
    numberType: initialData?.numberType || 'Standard',
    remarks: initialData?.remarks || 'Please Verify'
  });

  useEffect(() => {
    if (!isEditing && !user?.teamId) {
      toast.error('You must be assigned to a team to create leads');
      navigate('/dashboard');
      return;
    }

    loadTeamMembers();
  }, [user, navigate, isEditing]);

  async function loadTeamMembers() {
    try {
      if (!user?.teamId) return;

      // First get the team to get the manager ID
      const teamRef = doc(db, 'teams', user.teamId);
      const teamDoc = await getDoc(teamRef);
      
      if (!teamDoc.exists()) {
        console.error('Team not found');
        return;
      }

      const teamData = teamDoc.data();
      
      // Then get team members
      const teamQuery = query(
        collection(db, 'users'),
        where('teamId', '==', user.teamId),
        where('role', 'in', ['agent', 'verifier', 'coordinator'])
      );
      const snapshot = await getDocs(teamQuery);
      const members = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as User))
        .filter(member => member.id !== user.id);
      setTeamMembers(members);

      // Store the team's manager ID
      setTeamManagerId(teamData.managerId);
    } catch (error) {
      console.error('Error loading team members:', error);
      toast.error('Failed to load team members');
    }
  }

  const handleNumberSelect = useCallback((number: NumberPool) => {
    setCurrentNumber(number.number);
    setCurrentNumberData(number);
    setSelectedCategory(number.category);
    setShowNumberPool(false);
    setFormErrors(prev => {
      const { plans, ...rest } = prev;
      return rest;
    });
  }, []);

  const handlePlanSelect = useCallback((plan: string) => {
    setCurrentPlan(plan);
    setFormErrors(prev => {
      const { plans, ...rest } = prev;
      return rest;
    });
  }, []);

  const handleAddPlan = useCallback(() => {
    if (!currentNumber || !currentNumberData) {
      toast.error('Please select a number');
      setFormErrors(prev => ({
        ...prev,
        plans: 'Please select a number'
      }));
      return;
    }

    if (!currentPlan || currentPlan === '') {
      toast.error('Please select a plan');
      setFormErrors(prev => ({
        ...prev,
        plans: 'Please select a plan'
      }));
      return;
    }

    if (selectedPlans.some(p => p.numberId === currentNumberData.id)) {
      toast.error('This number has already been selected');
      setFormErrors(prev => ({
        ...prev,
        plans: 'This number has already been selected'
      }));
      return;
    }



    setSelectedPlans(prev => [...prev, {
      numberId: currentNumberData.id,
      number: currentNumber,
      plan: currentPlan,
      category: currentNumberData.category,
      group: currentNumberData.group
    }]);

    setCurrentNumber('');
    setCurrentPlan('');
    setCurrentNumberData(null);
    setSelectedCategory('Standard');
    setFormErrors(prev => {
      const { plans, ...rest } = prev;
      return rest;
    });
  }, [currentNumber, currentNumberData, currentPlan, selectedPlans]);

  const handleRemovePlan = useCallback((numberId: string) => {
    setSelectedPlans(prev => prev.filter(p => p.numberId !== numberId));
    setFormErrors(prev => {
      const { plans, ...rest } = prev;
      return rest;
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent, isWhatsAppVerification = false) => {
    e.preventDefault();
    
    // Validate form data
    const errors: FormErrors = {};
    // Name
    if (!formData.customerName || formData.customerName.trim().length === 0) {
      errors.customerName = 'Customer name is required';
    }
    // Phone
    if (!formData.customerNumber || formData.customerNumber.trim().length === 0) {
      errors.customerNumber = 'Customer number is required';
    } else if (!/^(?:\d{8}|\d{10})$/.test(formData.customerNumber.trim())) {
      errors.customerNumber = 'Phone number must be 8 or 10 digits';
    }
    // Address
    if (!formData.customerAddress || formData.customerAddress.trim().length === 0) {
      errors.customerAddress = 'Customer address is required';
    }
    // Age
    if (!formData.customerAge || formData.customerAge.trim().length === 0) {
      errors.customerAge = 'Customer age is required';
    } else {
      const age = parseInt(formData.customerAge, 10);
      if (Number.isNaN(age) || age < 21) {
        errors.customerAge = 'Age must be 21 or above';
      }
    }
    // Date & Time
    if (!formData.startDate) {
      errors.startDate = 'Date is required';
    }
    if (!formData.startTime) {
      errors.startTime = 'Time is required';
    }
    // Optional URL validation
    if (formData.locationUrl && formData.locationUrl.trim().length > 0) {
      try {
        // eslint-disable-next-line no-new
        new URL(formData.locationUrl.trim());
      } catch {
        errors.locationUrl = 'Please enter a valid URL';
      }
    }
    // Plans
    if (!selectedPlans.length) {
      errors.plans = 'At least one plan must be selected';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      if (errors.plans) {
        const planEl = document.getElementById('planSelect');
        if (planEl) {
          planEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          try { (planEl as HTMLElement).focus?.(); } catch {}
        } else if (planErrorRef.current) {
          planErrorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else {
        toast.error('Please correct the highlighted fields before submitting');
      }
      return;
    }

    setLoading(true);
    try {
      // Check if numbers are from different groups
      
      // Get all unique groups from selected plans
      const groups = [...new Set(selectedPlans.map(plan => plan.group))];
      
      // If there are multiple groups, route to coordinator
      const hasDifferentGroups = groups.length > 1;

      // Find appropriate verifier based on group
      let assignedVerifierId: string | null = null;
      if (!hasDifferentGroups && groups.length === 1) {
        // Find verifier for this specific group
        const targetGroup = groups[0]?.toLowerCase(); // Normalize to lowercase
        try {
          const verifiersQuery = query(
            collection(db, 'users'),
            where('role', '==', 'verifier')
          );
          const verifiersSnapshot = await getDocs(verifiersQuery);
          const verifiers = verifiersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as User[];

          // Filter verifiers that can handle this group
          const eligibleVerifiers = verifiers.filter(v => {
            const verifierGroups = v.verifierGroups || [];
            const hasAllGroups = verifierGroups.includes('all') || verifierGroups.length === 0;
            if (hasAllGroups) return true;

            // Check if verifier's groups include the target group
            return verifierGroups.some(group => group.toLowerCase() === targetGroup);
          });

          // Prefer specific group verifiers over 'all' group verifiers
          const specificVerifier = eligibleVerifiers.find(v => {
            const verifierGroups = v.verifierGroups || [];
            return verifierGroups.some(group => group.toLowerCase() === targetGroup);
          });
          const allGroupVerifier = eligibleVerifiers.find(v => {
            const verifierGroups = v.verifierGroups || [];
            return verifierGroups.includes('all') || verifierGroups.length === 0;
          });

          assignedVerifierId = specificVerifier?.id || allGroupVerifier?.id || null;
        } catch (error) {
          console.error('Error finding verifier:', error);
          // Continue without assigning verifier
        }
      }

      // Clean up form data to remove any undefined values
      const cleanedFormData = Object.fromEntries(
        Object.entries(formData).filter(([_, value]) => value !== undefined)
      );

      const leadData: Partial<Lead> = {
        ...cleanedFormData,
        customerAddress: formData.customerAddress,
        customerAge: parseInt(formData.customerAge),
        plans: selectedPlans.map(plan => ({
          numberId: plan.numberId,
          number: plan.number,
          plan: plan.plan,
          category: plan.category,
          group: plan.group || 'Standard',
          type: plan.type || 'standard',
          status: 'pending_verification'
        })),
        status: hasDifferentGroups ? 'pending_coordinator' : 'pending_verification',
          agentId: user!.id,
          teamId: user!.teamId,
        managerId: teamManagerId || null,
        ...(assignedVerifierId && { verifierId: assignedVerifierId }),
          createdAt: new Date(),
        updatedAt: new Date(),
        startDate: new Date(formData.startDate),
        sharedWith: formData.sharedWith ? [formData.sharedWith] : [],
        remarks: formData.remarks || 'Please Verify'
      };

      // Remove any remaining undefined values
      const finalLeadData = Object.fromEntries(
        Object.entries(leadData).filter(([_, value]) => value !== undefined)
      ) as Partial<Lead>;



      if (isEditing && onSave) {
        await onSave(finalLeadData);
                } else {
        const docRef = await addDoc(collection(db, 'leads'), finalLeadData);

        // Update all numbers in the lead's plans
        const plans = finalLeadData.plans as Array<{
          numberId: string;
          number: string;
          plan: string;
          category: string;
          group?: string;
          type: string;
          status: string;
        }>;

        if (plans && plans.length > 0) {
          const updatePromises = plans.map(async (plan) => {
            const numberRef = doc(db, 'numberPool', plan.numberId);
            
            // Get old data for logging
            const numberDoc = await getDoc(numberRef);
            const oldData = numberDoc.exists() ? numberDoc.data() : null;
            
            await updateDoc(numberRef, {
              status: 'pending_verification',
              lastStatusChange: new Date(),
              leadId: docRef.id
            });
            
            // Log the lead creation action
            await logNumberAction(
              plan.numberId,
              plan.number,
              'lead_created',
              oldData,
              { status: 'pending_verification', leadId: docRef.id },
              `Lead created with plan: ${plan.plan}`
            );
          });
          
          await Promise.all(updatePromises);
        }

        toast.success(hasDifferentGroups ? 
          'Lead created and routed to coordinator for review' : 
          'Lead created successfully');
        
        // Navigate to the lead details page
        navigate(`/dashboard/leads/${docRef.id}`, { replace: true });

        // Get manager's phone numbers for notification
        let managerPhoneNumbers: string[] = [];
        if (teamManagerId) {
          try {
            const managerRef = doc(db, 'users', teamManagerId);
            const managerDoc = await getDoc(managerRef);
            
            if (managerDoc.exists()) {
              const managerData = managerDoc.data();
              if (Array.isArray(managerData.phoneNumbers)) {
                managerPhoneNumbers = managerData.phoneNumbers;
              } else if (typeof managerData.phoneNumbers === 'string') {
                managerPhoneNumbers = [managerData.phoneNumbers];
              } else if (managerData.phoneNumber) {
                managerPhoneNumbers = [managerData.phoneNumber];
              }
            }
          } catch (error) {
            console.error('Error fetching manager data:', error);
          }
        }



        // Send WhatsApp notification to manager
        if (managerPhoneNumbers.length > 0) {
          for (const phoneNumber of managerPhoneNumbers) {
            try {
              const newleadResponse = await fetch(WHATSAPP_API_URL, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  messaging_product: "whatsapp",
                  to: phoneNumber,
                  type: "template",
                  template: {
                    name: "newlead",
                    language: {
                      code: "en"
                    },
                    components: [
                      {
                        type: "body",
                        parameters: [
                          {
                            type: "text",
                            text: formData.customerName || "N/A"
                          },
                          {
                            type: "text",
                            text: formData.customerNumber || "N/A"
                          },
                          {
                            type: "text",
                            text: selectedPlans[0]?.number || "N/A"
                          },
                          {
                            type: "text",
                            text: "New Lead for verification"
                          },
                          {
                            type: "text",
                            text: user!.name || "N/A"
                          },
                          {
                            type: "text",
                            text: `${window.location.origin}/dashboard/leads/${docRef.id}`
                          }
                        ]
                      }
                    ]
                  }
                })
              });

              if (!newleadResponse.ok) {
                console.error('Failed to send newlead template to manager:', await newleadResponse.text());
              } else {
                // Successfully sent notification
              }
            } catch (error) {
              console.error('Error sending WhatsApp notification to manager:', error);
            }
          }
        } else {
          console.log('No manager phone numbers found for notification');
        }

        // If WhatsApp verification is requested, mark method on lead and send the message
        if (isWhatsAppVerification) {
          try {
            await updateDoc(doc(db, 'leads', docRef.id), {
              verificationMethod: 'whatsapp',
              whatsappInitiatedAt: new Date()
            });
          } catch (e) {
            console.warn('Failed to set verificationMethod on lead:', e);
          }
          // Format the phone number to ensure it has the country code
          let formattedNumber = formData.customerNumber;
          
          // Remove any existing country code or plus sign
          if (formattedNumber.startsWith('+')) {
            formattedNumber = formattedNumber.substring(1);
          }
          
          // Get the country code from the selected country
          // Map country code; fallback to 971
          const countryCode = formData.country === 'AE' ? '971'
            : formData.country === 'SA' ? '966'
            : formData.country === 'QA' ? '974'
            : formData.country === 'KW' ? '965'
            : formData.country === 'BH' ? '973'
            : formData.country === 'OM' ? '968'
            : formData.country === 'IN' ? '91'
            : formData.country === 'PK' ? '92'
            : formData.country === 'EG' ? '20'
            : formData.country === 'PH' ? '63'
            : formData.country === 'ID' ? '62'
            : formData.country === 'MY' ? '60'
            : formData.country === 'SG' ? '65'
            : formData.country === 'TH' ? '66'
            : formData.country === 'VN' ? '84'
            : formData.country === 'CN' ? '86'
            : formData.country === 'JP' ? '81'
            : formData.country === 'KR' ? '82'
            : formData.country === 'AU' ? '61'
            : formData.country === 'NZ' ? '64'
            : formData.country === 'GB' ? '44'
            : formData.country === 'US' ? '1'
            : formData.country === 'CA' ? '1'
            : formData.country === 'FR' ? '33'
            : formData.country === 'DE' ? '49'
            : formData.country === 'IT' ? '39'
            : formData.country === 'ES' ? '34'
            : formData.country === 'PT' ? '351'
            : formData.country === 'NL' ? '31'
            : formData.country === 'BE' ? '32'
            : formData.country === 'CH' ? '41'
            : formData.country === 'AT' ? '43'
            : formData.country === 'SE' ? '46'
            : formData.country === 'NO' ? '47'
            : formData.country === 'DK' ? '45'
            : formData.country === 'FI' ? '358'
            : formData.country === 'PL' ? '48'
            : formData.country === 'CZ' ? '420'
            : formData.country === 'SK' ? '421'
            : formData.country === 'HU' ? '36'
            : formData.country === 'RO' ? '40'
            : formData.country === 'BG' ? '359'
            : formData.country === 'GR' ? '30'
            : formData.country === 'TR' ? '90'
            : formData.country === 'IL' ? '972'
            : formData.country === 'ZA' ? '27'
            : formData.country === 'NG' ? '234'
            : formData.country === 'KE' ? '254'
            : formData.country === 'GH' ? '233'
            : formData.country === 'ET' ? '251'
            : '971';
          
          // Remove any existing country code
          if (formattedNumber.startsWith(countryCode)) {
            formattedNumber = formattedNumber.substring(countryCode.length);
          }
          
          // Add the country code
          formattedNumber = `${countryCode}${formattedNumber}`;
          


          // Write routing map to ensure inbound replies map to this lead
          try {
            const routeDoc = fbDoc(db, 'whatsappRouting', formattedNumber.replace(/\D/g, ''));
            await setDoc(routeDoc, { leadId: docRef.id, sentAt: fbServerTimestamp() }, { merge: true });
          } catch (e) {
            console.warn('Failed to write whatsapp routing map:', e);
          }

          // Get the selected plan details
          const selectedPlan = selectedPlans[0]?.plan;
          
          // Get plan details from our mapping
          const planDetails = selectedPlan ? planBenefits[selectedPlan as keyof typeof planBenefits] : null;

          // If plan not found, try to find a close match
          if (!planDetails) {
            console.error('Plan details not found for:', selectedPlan);
            console.log('Trying to find close match...');
            
            // Try to find a close match by removing extra spaces and comparing
            const normalizedSelectedPlan = selectedPlan?.trim().replace(/\s+/g, ' ');
          const matchingPlan = Object.keys(planBenefits).find(plan => 
              plan.trim().replace(/\s+/g, ' ') === normalizedSelectedPlan
            );
            
            if (matchingPlan) {
              console.log('Found matching plan:', matchingPlan);
              const matchedPlanDetails = planBenefits[matchingPlan as keyof typeof planBenefits];
              console.log('Matched Plan Details:', matchedPlanDetails);
              
              // Log outbound verification message
              try {
                await logOutboundVerificationMessage(
                  docRef.id,
                  formattedNumber,
                  'flow_template_temp',
                  [
                    user?.name || 'N/A',
                    'Express Dial',
                    selectedPlans[0]?.number || 'N/A',
                    matchedPlanDetails.amount,
                    matchedPlanDetails.benefits,
                    matchedPlanDetails.duration
                  ]
                );
              } catch (e) {
                console.warn('Failed to log outbound verification message (matchedPlanDetails):', e);
              }

              await fetch(WHATSAPP_API_URL, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  messaging_product: "whatsapp",
                  to: formattedNumber,
                  type: "template",
                  template: {
                    name: "flow_template_temp",
                    language: {
                      code: "en"
                    },
                    components: [
                      {
                        type: "body",
                        parameters: [
                          {
                            type: "text",
                            text: user?.name || "N/A"
                          },
                          {
                            type: "text",
                            text: "Express Dial"
                          },
                          {
                            type: "text",
                            text: selectedPlans[0]?.number || "N/A"
                          },
                          {
                            type: "text",
                            text: matchedPlanDetails.amount
                          },
                          {
                            type: "text",
                            text: matchedPlanDetails.benefits
                          },
                          {
                            type: "text",
                            text: matchedPlanDetails.duration
                          }
                        ]
                      },
                      {
                        type: "button",
                        sub_type: "flow",
                        index: 0
                      }
                    ]
                  }
                })
              });
              return;
            }
            
            toast.error('Selected plan not found in our records');
            return;
          }

          // Log outbound verification message
          try {
            await logOutboundVerificationMessage(
              docRef.id,
              formattedNumber,
              'flow_template_temp',
              [
                user?.name || 'N/A',
                'Express Dial',
                selectedPlans[0]?.number || 'N/A',
                planDetails.amount,
                planDetails.benefits,
                planDetails.duration
              ]
            );
          } catch (e) {
            console.warn('Failed to log outbound verification message (planDetails):', e);
          }

          const actsResponse = await fetch(WHATSAPP_API_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: formattedNumber,
              type: "template",
              template: {
                name: "flow_template_temp",
                language: {
                  code: "en"
                },
                components: [
                  {
                    type: "body",
                    parameters: [
                      {
                        type: "text",
                        text: user?.name || "N/A"
                      },
                      {
                        type: "text",
                        text: "Express Dial"
                      },
                      {
                        type: "text",
                        text: selectedPlans[0]?.number || "N/A"
                      },
                      {
                        type: "text",
                        text: planDetails.amount
                      },
                      {
                        type: "text",
                        text: planDetails.benefits
                      },
                      {
                        type: "text",
                        text: planDetails.duration
                      }
                    ]
                  },
                  {
                    type: "button",
                    sub_type: "flow",
                    index: 0
                  }
                ]
              }
            })
          });

          if (!actsResponse.ok) {
            console.error('Failed to send acts template:', await actsResponse.text());
            toast.error('Failed to send verification message to customer');
          } else {
            toast.success('Verification message sent to customer');
          }
        }
      }
    } catch (error) {
      console.error('Error creating lead:', error);
      toast.error('Failed to create lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header - Now scrolls with page content */}
      <div className="bg-white/95 backdrop-blur-sm border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-4">
            {/* Header Content */}
            <div className="flex items-center justify-between">
              <div className="text-center sm:text-left">
                <h1 className="text-xl sm:text-3xl font-bold text-gray-900">
                  {isEditing ? 'Edit Lead' : 'Create New Lead'}
                </h1>
                <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600">
                  {isEditing ? 'Update lead information' : 'Fill in the customer details to create a new lead'}
                </p>
              </div>
              
              {/* Modern Cancel Button */}
              <button
                type="button"
                onClick={isEditing ? onCancel : () => navigate('/dashboard/leads')}
                className="flex items-center justify-center w-10 h-10 sm:w-auto sm:h-auto sm:px-4 sm:py-2 text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-full sm:rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                title="Cancel"
              >
                <svg className="w-5 h-5 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="hidden sm:inline text-sm font-medium">Cancel</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <form onSubmit={(e) => handleSubmit(e)} className="space-y-8">
          <div className="grid grid-cols-1 gap-8">
          <FormSection
            icon={User2}
            title="Customer Information"
            description="Basic customer details"
          >
            <FormInput
              label="Full Name"
              icon={User2}
              type="text"
              required
              value={formData.customerName}
              onChange={(e) => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
              error={formErrors.customerName}
            />

              <FormInput
              label="Phone Number"
              icon={Phone}
              type="tel"
              required
              pattern="(?:\d{8}|\d{10})"
              maxLength={10}
              inputMode="numeric"
              value={formData.customerNumber}
              onChange={(e) => {
                // Only allow numeric input and max 10 digits (UI cap). Validation allows 8 or 10.
                const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                setFormData(prev => ({ ...prev, customerNumber: value }));
              }}
              error={formErrors.customerNumber}
            />

            <FormSelect
              label="Country"
              icon={Globe}
              options={countryList.map(country => ({
                value: country.code,
                label: country.name
              }))}
              value={formData.country}
              onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
            />

            <FormInput
              label="Age"
              icon={User2}
              type="number"
              required
              min="21"
              value={formData.customerAge}
              onChange={(e) => setFormData(prev => ({ ...prev, customerAge: e.target.value }))}
              error={formErrors.customerAge}
            />

            <FormSelect
              label="Product Type"
              icon={Package}
              options={productTypes.map(type => ({ value: type, label: type }))}
              value={formData.productType}
              onChange={(e) => setFormData(prev => ({ ...prev, productType: e.target.value }))}
            />

            <FormSelect
              label="Gender"
              icon={User2}
              options={[
                { value: 'Male', label: 'Male' },
                { value: 'Female', label: 'Female' },
                { value: 'Other', label: 'Other' }
              ]}
              value={formData.gender}
              onChange={(e) => setFormData(prev => ({ ...prev, gender: e.target.value }))}
            />
          </FormSection>

          <FormSection
            icon={Building2}
            title="Location Information"
            description="Customer location details"
          >
            <FormSelect
              label="Emirate"
              icon={MapPin}
              options={emirates.map(emirate => ({ value: emirate, label: emirate }))}
              value={formData.emirate}
              onChange={(e) => {
                const newEmirate = e.target.value;
                setFormData(prev => ({
                  ...prev,
                  emirate: newEmirate,
                  area: areas[newEmirate as keyof typeof areas][0]
                }));
              }}
            />

            <FormSelect
              label="Area"
              icon={MapPin}
              options={areas[formData.emirate as keyof typeof areas].map(area => ({
                value: area,
                label: area
              }))}
              value={formData.area}
              onChange={(e) => setFormData(prev => ({ ...prev, area: e.target.value }))}
            />

            <FormInput
              label="Address"
              icon={MapPin}
              type="text"
              required
              value={formData.customerAddress}
              onChange={(e) => setFormData(prev => ({ ...prev, customerAddress: e.target.value }))}
              error={formErrors.customerAddress}
            />

            <div className="col-span-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:border-indigo-500 transition-colors duration-200">
                  <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                      className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    checked={formData.hasEmirateId}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      hasEmirateId: e.target.checked 
                    }))}
                  />
                    <div>
                      <span className="text-sm font-medium text-gray-900">Emirates ID Available</span>
                      <p className="text-xs text-gray-500">Customer has valid Emirates ID</p>
                    </div>
                </label>
                </div>

                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:border-indigo-500 transition-colors duration-200">
                  <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                      className="h-5 w-5 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    checked={formData.advancePayment}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      advancePayment: e.target.checked 
                    }))}
                  />
                    <div>
                      <span className="text-sm font-medium text-gray-900">Advance Payment</span>
                      <p className="text-xs text-gray-500">Customer has made advance payment</p>
                    </div>
                </label>
                </div>
              </div>
            </div>

            <div className="col-span-2">
              <FormInput
                label="Location URL"
                icon={Globe}
                type="url"
                placeholder="https://maps.google.com/..."
                value={formData.locationUrl}
                onChange={(e) => setFormData(prev => ({ ...prev, locationUrl: e.target.value }))}
                error={formErrors.locationUrl}
              />
            </div>
          </FormSection>

          <FormSection
            icon={Package}
            title="Number and Plan Selection"
            description="Select numbers and assign plans"
          >
            <div className="col-span-2 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="col-span-3">
                  {showNumberPool ? (
                      <QuickNumberSelect 
                        onSelect={handleNumberSelect}
                      selectedCategory={selectedCategory}
                      onCategoryChange={(category) => setSelectedCategory(category)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowNumberPool(true)}
                      className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      Select Another Number
                    </button>
                  )}
                </div>
              </div>
              {currentNumber && (
                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{currentNumber}</p>
                      <p className="text-sm text-gray-500">{selectedCategory}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentNumber('');
                        setCurrentNumberData(null);
                      }}
                      className="text-sm font-medium text-red-600 hover:text-red-700"
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>
              )}
              
              <div ref={planErrorRef} />
              <FormSelect
                label="Plan"
                icon={Package}
                options={[
                  { value: '', label: 'Select a plan' },
                  ...planCategories.flatMap((category, categoryIndex) => [
                    { value: `category-${categoryIndex}`, label: category.label, disabled: true },
                    ...category.options.map((option, optionIndex) => ({
                      ...option,
                      value: option.value || `plan-${categoryIndex}-${optionIndex}`
                    }))
                    ])
                ]}
                value={currentPlan}
                  onChange={(e) => handlePlanSelect(e.target.value)}
                  error={formErrors.plans}
              />

              <button
                type="button"
                onClick={handleAddPlan}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Add Number with Plan
              </button>

              {selectedPlans.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Selected Numbers and Plans</h3>
                  <div className="space-y-3">
                    {selectedPlans.map((plan) => (
                      <div
                        key={plan.numberId}
                        className="flex items-center justify-between bg-white p-4 rounded-lg border border-gray-200 shadow-sm"
                      >
                        <div className="flex-1">
                          <div className="flex items-center space-x-4">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{plan.number}</p>
                              <p className="text-sm text-gray-500">{plan.category}</p>
                            </div>
                            <div className="px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                              {plan.plan}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePlan(plan.numberId)}
                          className="ml-4 text-sm font-medium text-red-600 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </FormSection>

          <FormSection
            icon={Users}
            title="Additional Information"
            description="Communication and scheduling preferences"
          >
            <FormSelect
              label="Language"
              icon={Languages}
              options={languages.map(lang => ({ value: lang, label: lang }))}
              value={formData.language}
              onChange={(e) => setFormData(prev => ({ ...prev, language: e.target.value }))}
            />

            <FormSelect
              label="Share With Team Member"
              icon={Users}
              options={[
                { value: '', label: 'Select team member' },
                ...teamMembers.map(member => ({
                  value: member.id,
                  label: `${member.name} (${member.role})`
                }))
              ]}
              value={formData.sharedWith}
              onChange={(e) => setFormData(prev => ({ ...prev, sharedWith: e.target.value }))}
            />

            <FormInput
              label="Date"
              icon={Calendar}
              type="date"
              required
              value={formData.startDate}
              onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
              error={formErrors.startDate}
            />

            <FormInput
              label="Time"
              icon={Calendar}
              type="time"
              required
              value={formData.startTime}
              onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
              error={formErrors.startTime}
            />
          </FormSection>

          <FormSection
            icon={MessageSquare}
            title="Remarks"
            description="Additional notes and comments"
          >
            <div className="col-span-2">
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-gray-200">
                  <h3 className="text-sm font-medium text-gray-900">Remarks</h3>
                </div>
                <div className="p-4">
              <textarea
                rows={4}
                  className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                placeholder="Add any additional notes or remarks..."
                value={formData.remarks}
                onChange={(e) => setFormData(prev => ({ ...prev, remarks: e.target.value }))}
              />
                </div>
              </div>
            </div>
          </FormSection>
          </div>

          {/* Bottom Action Buttons - Restored as requested */}
          <div className="flex justify-end space-x-4 mt-8">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading 
                    ? 'Saving Changes...'
                    : (user?.role === 'agent' && initialData?.status === 'follow_verification' 
                        ? 'Save Changes and Resubmit' 
                        : 'Save Changes')}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/leads')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Creating Lead...' : 'Create Lead'}
                </button>
                <button
                  type="button"
                  onClick={(e) => handleSubmit(e as any, true)}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Creating Lead...' : 'Verify via WhatsApp'}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export { CreateLead };
