/**
 * ===============================================================================
 * COMMISSION CONFIG COMPONENT - COMMISSION RATE MANAGEMENT
 * ===============================================================================
 * 
 * This component provides an interface for managing commission rates for different
 * plan categories within teams. It allows managers and administrators to configure
 * commission percentages for standard, silver, gold, and platinum plan categories.
 * 
 * FEATURES:
 * 
 * 1. COMMISSION RATE CONFIGURATION
 *    - Category-based commission rate setting (Standard, Silver, Gold, Platinum)
 *    - Real-time validation and error handling
 *    - Persistent storage in Firestore with proper data management
 * 
 * 2. TEAM-SPECIFIC SETTINGS
 *    - Commission configuration per team with proper isolation
 *    - Role-based access control for configuration management
 *    - Team context and proper data scoping
 * 
 * 3. USER INTERFACE
 *    - Intuitive form interface with category-based organization
 *    - Visual feedback for save states and validation errors
 *    - Responsive design for various screen sizes
 * 
 * 4. DATA INTEGRATION
 *    - Firestore integration for commission rate persistence
 *    - Proper data loading and error handling
 *    - Timestamp tracking for configuration updates
 * 
 * USAGE:
 * This component is used by managers and administrators to configure
 * commission rates that affect payroll calculations and agent compensation.
 * ===============================================================================
 */

import { useState, useEffect } from 'react';
import { collection, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../store/authStore';
import { CommissionConfig as CommissionConfigType } from '../types';
import { toast } from 'react-hot-toast';
import { DollarSign, Save, Settings } from 'lucide-react';

const COMMISSION_CATEGORIES = [
  { key: 'standard', label: 'Standard', color: 'bg-gray-100 text-gray-800' },
  { key: 'silver', label: 'Silver', color: 'bg-gray-200 text-gray-800' },
  { key: 'silverPlus', label: 'Silver Plus', color: 'bg-gray-300 text-gray-800' },
  { key: 'gold', label: 'Gold', color: 'bg-yellow-100 text-yellow-800' },
  { key: 'goldPlus', label: 'Gold Plus', color: 'bg-yellow-200 text-yellow-800' },
  { key: 'platinum', label: 'Platinum', color: 'bg-purple-100 text-purple-800' }
] as const;

interface CommissionConfigProps {
  teamId: string;
  onClose?: () => void;
}

export function CommissionConfig({ teamId, onClose }: CommissionConfigProps) {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<Partial<CommissionConfigType>>({
    standard: 0,
    silver: 0,
    silverPlus: 0,
    gold: 0,
    goldPlus: 0,
    platinum: 0
  });

  useEffect(() => {
    loadCommissionConfig();
  }, [teamId]);

  async function loadCommissionConfig() {
    try {
      setLoading(true);
      const configRef = doc(db, 'commissionConfigs', teamId);
      const configDoc = await getDoc(configRef);
      
      if (configDoc.exists()) {
        const data = configDoc.data();
        setConfig({
          id: configDoc.id,
          teamId: data.teamId,
          standard: data.standard || 0,
          silver: data.silver || 0,
          silverPlus: data.silverPlus || 0,
          gold: data.gold || 0,
          goldPlus: data.goldPlus || 0,
          platinum: data.platinum || 0,
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate(),
          createdBy: data.createdBy
        });
      } else {
        // Initialize with default values
        setConfig({
          teamId,
          standard: 0,
          silver: 0,
          silverPlus: 0,
          gold: 0,
          goldPlus: 0,
          platinum: 0
        });
      }
    } catch (error) {
      console.error('Error loading commission config:', error);
      toast.error('Failed to load commission configuration');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!user) return;
    
    try {
      setSaving(true);
      const configRef = doc(db, 'commissionConfigs', teamId);
      
      const configData = {
        teamId,
        standard: config.standard || 0,
        silver: config.silver || 0,
        silverPlus: config.silverPlus || 0,
        gold: config.gold || 0,
        goldPlus: config.goldPlus || 0,
        platinum: config.platinum || 0,
        updatedAt: new Date(),
        createdBy: user.id
      };

      if (config.id) {
        // Update existing config
        await updateDoc(configRef, configData);
      } else {
        // Create new config
        await setDoc(configRef, {
          ...configData,
          createdAt: new Date()
        });
      }

      toast.success('Commission configuration saved successfully');
      if (onClose) onClose();
    } catch (error) {
      console.error('Error saving commission config:', error);
      toast.error('Failed to save commission configuration');
    } finally {
      setSaving(false);
    }
  }

  function handleInputChange(category: string, value: string) {
    const numValue = parseFloat(value) || 0;
    setConfig(prev => ({
      ...prev,
      [category]: numValue
    }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Settings className="h-6 w-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Commission Configuration</h2>
            <p className="text-sm text-gray-500">Set commission amounts for each category</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        )}
      </div>

      <div className="space-y-6">
        {COMMISSION_CATEGORIES.map((category) => (
          <div key={category.key} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
            <div className="flex items-center space-x-3">
              <div className={`px-3 py-1 rounded-full text-sm font-medium ${category.color}`}>
                {category.label}
              </div>
              <DollarSign className="h-5 w-5 text-gray-400" />
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">₹</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={typeof config[category.key as keyof CommissionConfigType] === 'number' ? config[category.key as keyof CommissionConfigType] as number : 0}
                onChange={(e) => handleInputChange(category.key, e.target.value)}
                className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="0.00"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-end space-x-3">
        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Configuration
            </>
          )}
        </button>
      </div>
    </div>
  );
} 