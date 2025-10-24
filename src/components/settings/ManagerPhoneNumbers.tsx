import { useState, useEffect } from 'react';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../store/authStore';
import { toast } from 'react-hot-toast';
import { Phone, Plus, Trash2 } from 'lucide-react';

export function ManagerPhoneNumbers() {
  const { user } = useAuthStore();
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>([]);
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPhoneNumbers();
  }, []);

  const loadPhoneNumbers = async () => {
    try {
      if (!user?.id) return;
      
      const userRef = doc(db, 'users', user.id);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setPhoneNumbers(userData.phoneNumbers || []);
      }
    } catch (error) {
      console.error('Error loading phone numbers:', error);
      toast.error('Failed to load phone numbers');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPhoneNumber = async () => {
    try {
      if (!newPhoneNumber.trim()) {
        toast.error('Please enter a phone number');
        return;
      }

      // Basic phone number validation
      const phoneRegex = /^\+?[1-9]\d{1,14}$/;
      if (!phoneRegex.test(newPhoneNumber.trim())) {
        toast.error('Please enter a valid phone number');
        return;
      }

      const updatedPhoneNumbers = [...phoneNumbers, newPhoneNumber.trim()];
      
      const userRef = doc(db, 'users', user!.id);
      await updateDoc(userRef, {
        phoneNumbers: updatedPhoneNumbers,
        updatedAt: new Date()
      });

      setPhoneNumbers(updatedPhoneNumbers);
      setNewPhoneNumber('');
      toast.success('Phone number added successfully');
    } catch (error) {
      console.error('Error adding phone number:', error);
      toast.error('Failed to add phone number');
    }
  };

  const handleRemovePhoneNumber = async (index: number) => {
    try {
      const updatedPhoneNumbers = phoneNumbers.filter((_, i) => i !== index);
      
      const userRef = doc(db, 'users', user!.id);
      await updateDoc(userRef, {
        phoneNumbers: updatedPhoneNumbers,
        updatedAt: new Date()
      });

      setPhoneNumbers(updatedPhoneNumbers);
      toast.success('Phone number removed successfully');
    } catch (error) {
      console.error('Error removing phone number:', error);
      toast.error('Failed to remove phone number');
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
        <div className="space-y-3">
          <div className="h-10 bg-gray-200 rounded"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-gray-900">Phone Numbers</h3>
        <p className="mt-1 text-sm text-gray-500">
          Add multiple phone numbers to receive team updates and notifications.
        </p>
      </div>

      <div className="space-y-4">
        {phoneNumbers.map((phone, index) => (
          <div key={index} className="flex items-center justify-between p-4 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center space-x-3">
              <Phone className="h-5 w-5 text-indigo-500" />
              <span className="text-gray-900">{phone}</span>
            </div>
            <button
              onClick={() => handleRemovePhoneNumber(index)}
              className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-full transition-colors"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        ))}

        <div className="flex items-center space-x-3">
          <div className="flex-1">
            <input
              type="tel"
              value={newPhoneNumber}
              onChange={(e) => setNewPhoneNumber(e.target.value)}
              placeholder="Enter phone number (e.g., +1234567890)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={handleAddPhoneNumber}
            className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add
          </button>
        </div>
      </div>
    </div>
  );
} 