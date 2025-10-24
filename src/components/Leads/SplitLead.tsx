/**
 * ===============================================================================
 * SPLIT LEAD COMPONENT - LEAD SPLITTING AND MANAGEMENT INTERFACE
 * ===============================================================================
 * 
 * This component provides functionality for splitting leads that contain multiple
 * phone numbers into separate individual leads. It supports various splitting
 * strategies and group management for proper lead distribution and workflow.
 * 
 * FEATURES:
 * 
 * 1. LEAD SPLITTING STRATEGIES
 *    - Split into separate leads maintaining existing groups
 *    - Combine into single lead with group reassignment
 *    - Split and assign to specific groups for coordination
 * 
 * 2. GROUP MANAGEMENT
 *    - Group selection for lead assignment and coordination
 *    - Support for multiple group assignments (G1, G2, G3, etc.)
 *    - Group validation and assignment logic
 * 
 * 3. LEAD DATA HANDLING
 *    - Proper lead data validation and field mapping
 *    - Plan number validation and processing
 *    - Comment and documentation support for audit trails
 * 
 * 4. FIREBASE INTEGRATION
 *    - Atomic lead splitting with proper data integrity
 *    - Lead creation and updates in Firestore
 *    - Error handling and user feedback via toast notifications
 * 
 * USAGE:
 * This component is used by coordinators and managers to handle leads with
 * multiple numbers by splitting them into appropriate individual leads for
 * proper workflow management and assignment.
 * ===============================================================================
 */

import { useState } from 'react';
import { Dialog } from '@headlessui/react';
import { X, SplitSquareHorizontal, AlertCircle, Users, Hash } from 'lucide-react';
import { Lead } from '../../types';
import { db } from '../../lib/firebase';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { toast } from 'react-hot-toast';

interface SplitLeadProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead;
  onSplit: () => void;
}

type SplitOption = 'split_separate' | 'combine_single' | 'split_assign_groups';

export function SplitLead({ isOpen, onClose, lead, onSplit }: SplitLeadProps) {
  const [isSplitting, setIsSplitting] = useState(false);
  const [comment, setComment] = useState('');
  const [splitOption, setSplitOption] = useState<SplitOption>('split_separate');
  const [combineGroup, setCombineGroup] = useState<string>('G1');
  const [firstLeadGroup, setFirstLeadGroup] = useState<string>('G1');
  const [secondLeadGroup, setSecondLeadGroup] = useState<string>('G2');

  // Get unique groups from the lead's plans
  const leadGroups = lead.plans?.map(plan => plan.group).filter(Boolean) || [];
  const uniqueGroups = [...new Set(leadGroups)];

  const handleSplit = async () => {
    if (!lead.plans || lead.plans.length < 2) {
      toast.error('Cannot split lead with less than 2 numbers');
      return;
    }

    console.log('Original lead:', lead);
    console.log('Original plans:', lead.plans);
    console.log('Split option:', splitOption);

    // Function to remove undefined fields from an object
    const removeUndefinedFields = (obj: any) => {
      return Object.fromEntries(
        Object.entries(obj).filter(([_, value]) => value !== undefined)
      );
    };

    // Validate that all required fields are present in the plans
    const validatePlan = (plan: any, groupOverride?: string) => {
      console.log('Validating plan:', plan);
      if (!plan.numberId || !plan.number || !plan.plan || !plan.category) {
        console.error('Missing required fields:', {
          numberId: plan.numberId,
          number: plan.number,
          plan: plan.plan,
          category: plan.category
        });
        throw new Error('Invalid plan data: missing required fields');
      }
      const validatedPlan = {
        numberId: plan.numberId,
        number: plan.number,
        plan: plan.plan,
        category: plan.category,
        group: groupOverride || plan.group || 'Standard',
        type: plan.type || 'standard',
        status: plan.status || 'pending'
      };
      console.log('Validated plan:', validatedPlan);
      return validatedPlan;
    };

    setIsSplitting(true);
    try {
      const { id, numberId, ...leadWithoutId } = lead;
      const cleanedLeadData = removeUndefinedFields(leadWithoutId);

      if (splitOption === 'split_separate') {
        // Split into two separate leads with existing groups
        const firstPlan = validatePlan(lead.plans[0]);
        const firstLead = {
          ...cleanedLeadData,
          plans: [firstPlan],
          status: 'pending_verification',
          coordinatorNotes: comment || 'Lead split from original lead - keeping existing groups',
          createdAt: new Date(),
          updatedAt: new Date(),
          originalLeadId: lead.id,
          customerAddress: lead.customerAddress,
        };

        const secondPlan = validatePlan(lead.plans[1]);
        const secondLead = {
          ...cleanedLeadData,
          plans: [secondPlan],
          status: 'pending_verification',
          coordinatorNotes: comment || 'Lead split from original lead - keeping existing groups',
          createdAt: new Date(),
          updatedAt: new Date(),
          originalLeadId: lead.id,
          customerAddress: lead.customerAddress,
        };

        const [firstLeadRef, secondLeadRef] = await Promise.all([
          addDoc(collection(db, 'leads'), firstLead),
          addDoc(collection(db, 'leads'), secondLead)
        ]);

        // Update original lead
        await updateDoc(doc(db, 'leads', lead.id), {
          status: 'split',
          coordinatorNotes: comment || 'Lead was split into two separate leads with existing groups',
          updatedAt: new Date(),
          splitLeadIds: [firstLeadRef.id, secondLeadRef.id]
        });

        // Update number statuses
        await Promise.all([
          updateDoc(doc(db, 'numberPool', firstPlan.numberId), {
            status: 'pending_verification',
            lastStatusChange: new Date(),
            leadId: firstLeadRef.id
          }),
          updateDoc(doc(db, 'numberPool', secondPlan.numberId), {
            status: 'pending_verification',
            lastStatusChange: new Date(),
            leadId: secondLeadRef.id
          })
        ]);

        toast.success('Lead split into two separate leads with existing groups');

      } else if (splitOption === 'combine_single') {
        // Combine both numbers into a single lead with specified group
        const combinedPlans = lead.plans.map(plan => validatePlan(plan, combineGroup));
        const combinedLead = {
          ...cleanedLeadData,
          plans: combinedPlans,
          status: 'pending_verification',
          coordinatorNotes: comment || `Lead combined into single lead with group ${combineGroup}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          originalLeadId: lead.id,
          customerAddress: lead.customerAddress,
        };

        const combinedLeadRef = await addDoc(collection(db, 'leads'), combinedLead);

        // Update original lead
        await updateDoc(doc(db, 'leads', lead.id), {
          status: 'split',
          coordinatorNotes: comment || `Lead was combined into single lead with group ${combineGroup}`,
          updatedAt: new Date(),
          splitLeadIds: [combinedLeadRef.id]
        });

        // Update all number statuses and group names in number pool
        await Promise.all(
          combinedPlans.map(plan =>
            updateDoc(doc(db, 'numberPool', plan.numberId), {
              status: 'pending_verification',
              lastStatusChange: new Date(),
              leadId: combinedLeadRef.id,
              group: combineGroup // Update the group name in number pool
            })
          )
        );

        toast.success(`Lead combined into single lead with group ${combineGroup}`);

      } else if (splitOption === 'split_assign_groups') {
        // Split into two leads with assigned groups
        const firstPlan = validatePlan(lead.plans[0], firstLeadGroup);
        const firstLead = {
          ...cleanedLeadData,
          plans: [firstPlan],
          status: 'pending_verification',
          coordinatorNotes: comment || `Lead split and assigned to group ${firstLeadGroup}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          originalLeadId: lead.id,
          customerAddress: lead.customerAddress,
        };

        const secondPlan = validatePlan(lead.plans[1], secondLeadGroup);
        const secondLead = {
          ...cleanedLeadData,
          plans: [secondPlan],
          status: 'pending_verification',
          coordinatorNotes: comment || `Lead split and assigned to group ${secondLeadGroup}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          originalLeadId: lead.id,
          customerAddress: lead.customerAddress,
        };

        const [firstLeadRef, secondLeadRef] = await Promise.all([
          addDoc(collection(db, 'leads'), firstLead),
          addDoc(collection(db, 'leads'), secondLead)
        ]);

        // Update original lead
        await updateDoc(doc(db, 'leads', lead.id), {
          status: 'split',
          coordinatorNotes: comment || `Lead was split and assigned to groups ${firstLeadGroup} and ${secondLeadGroup}`,
          updatedAt: new Date(),
          splitLeadIds: [firstLeadRef.id, secondLeadRef.id]
        });

        // Update number statuses and group names in number pool
        await Promise.all([
          updateDoc(doc(db, 'numberPool', firstPlan.numberId), {
            status: 'pending_verification',
            lastStatusChange: new Date(),
            leadId: firstLeadRef.id,
            group: firstLeadGroup // Update the group name in number pool
          }),
          updateDoc(doc(db, 'numberPool', secondPlan.numberId), {
            status: 'pending_verification',
            lastStatusChange: new Date(),
            leadId: secondLeadRef.id,
            group: secondLeadGroup // Update the group name in number pool
          })
        ]);

        toast.success(`Lead split and assigned to groups ${firstLeadGroup} and ${secondLeadGroup}`);
      }

      onSplit();
      onClose();
    } catch (error) {
      console.error('Error splitting lead:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to split lead');
    } finally {
      setIsSplitting(false);
    }
  };

  const handleKeepAsIs = async () => {
    try {
      await updateDoc(doc(db, 'leads', lead.id), {
        status: 'pending_verification',
        coordinatorNotes: comment || 'Lead kept as is after review',
        updatedAt: new Date()
      });

      // Update all numbers in the lead's plans
      const updatePromises = lead.plans.map(plan => {
        const numberRef = doc(db, 'numberPool', plan.numberId);
        return updateDoc(numberRef, {
          status: 'reserved',
          lastStatusChange: new Date(),
          leadId: lead.id
        });
      });

      await Promise.all(updatePromises);

      toast.success('Lead kept as is and forwarded to verifier');
      onSplit();
      onClose();
    } catch (error) {
      console.error('Error updating lead:', error);
      toast.error('Failed to update lead');
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto max-w-3xl w-full bg-white rounded-xl shadow-lg p-6 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-xl font-semibold flex items-center gap-2">
              <SplitSquareHorizontal className="w-5 h-5" />
              Enhanced Split Lead Options
            </Dialog.Title>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium text-yellow-800">
                    Multiple Numbers Detected
                  </h3>
                  <p className="mt-1 text-sm text-yellow-700">
                    This lead contains {lead.plans?.length} numbers from groups: {uniqueGroups.join(', ')}. 
                    Choose how you want to handle this lead.
                  </p>
                </div>
              </div>
            </div>

            {/* Split Options */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Split Options</h3>
              
              {/* Option 1: Split with existing groups */}
              <div className="border border-gray-200 rounded-lg p-4">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="splitOption"
                    value="split_separate"
                    checked={splitOption === 'split_separate'}
                    onChange={(e) => setSplitOption(e.target.value as SplitOption)}
                    className="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <SplitSquareHorizontal className="w-4 h-4 text-blue-600" />
                      <span className="font-medium text-gray-900">Split into Separate Leads</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Split into two separate leads, keeping the existing group assignments for each number.
                    </p>
                    <div className="mt-2 text-xs text-gray-500">
                      <strong>Result:</strong> 2 separate leads with original groups
                    </div>
                  </div>
                </label>
              </div>

              {/* Option 2: Combine into single group */}
              <div className="border border-gray-200 rounded-lg p-4">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="splitOption"
                    value="combine_single"
                    checked={splitOption === 'combine_single'}
                    onChange={(e) => setSplitOption(e.target.value as SplitOption)}
                    className="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-green-600" />
                      <span className="font-medium text-gray-900">Combine into Single Lead</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Combine both numbers into a single lead with a specified group.
                    </p>
                    {splitOption === 'combine_single' && (
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Assign to Group:
                        </label>
                        <select
                          value={combineGroup}
                          onChange={(e) => setCombineGroup(e.target.value)}
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                        >
                          <option value="G1">G1</option>
                          <option value="G2">G2</option>
                          <option value="G3">G3</option>
                        </select>
                      </div>
                    )}
                    <div className="mt-2 text-xs text-gray-500">
                      <strong>Result:</strong> 1 lead with both numbers in selected group
                    </div>
                  </div>
                </label>
              </div>

              {/* Option 3: Split and assign groups */}
              <div className="border border-gray-200 rounded-lg p-4">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="splitOption"
                    value="split_assign_groups"
                    checked={splitOption === 'split_assign_groups'}
                    onChange={(e) => setSplitOption(e.target.value as SplitOption)}
                    className="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Hash className="w-4 h-4 text-purple-600" />
                      <span className="font-medium text-gray-900">Split and Assign Groups</span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Split into two separate leads and assign specific groups to each.
                    </p>
                    {splitOption === 'split_assign_groups' && (
                      <div className="mt-3 space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            First Lead Group:
                          </label>
                          <select
                            value={firstLeadGroup}
                            onChange={(e) => setFirstLeadGroup(e.target.value)}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          >
                            <option value="G1">G1</option>
                            <option value="G2">G2</option>
                            <option value="G3">G3</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Second Lead Group:
                          </label>
                          <select
                            value={secondLeadGroup}
                            onChange={(e) => setSecondLeadGroup(e.target.value)}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          >
                            <option value="G1">G1</option>
                            <option value="G2">G2</option>
                            <option value="G3">G3</option>
                          </select>
                        </div>
                      </div>
                    )}
                    <div className="mt-2 text-xs text-gray-500">
                      <strong>Result:</strong> 2 separate leads with assigned groups
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Comment Section */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Comment
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                rows={3}
                placeholder="Add any remarks about this decision..."
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleKeepAsIs}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Keep As Is
              </button>
              <button
                onClick={handleSplit}
                disabled={isSplitting}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isSplitting ? 'Processing...' : 'Process Lead'}
              </button>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
} 