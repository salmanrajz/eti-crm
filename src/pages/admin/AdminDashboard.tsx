import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { deleteNumbersInBatch } from '../../api/numbers';
import { toast } from 'react-hot-toast';

export function AdminDashboard() {
  const { user } = useAuthStore();
  const [numbersToDelete, setNumbersToDelete] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [lastResult, setLastResult] = useState<{ count: number; notFound: number } | null>(null);

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h2>
          <p className="text-gray-600">You do not have permission to access this page.</p>
        </div>
      </div>
    );
  }

  const handleBatchDelete = async () => {
    if (!numbersToDelete.trim()) {
      toast.error('Please enter numbers to delete');
      return;
    }

    const numbers = numbersToDelete.split('\n').map(num => num.trim()).filter(num => num);
    
    if (numbers.length === 0) {
      toast.error('No valid numbers to delete');
      return;
    }

    if (numbers.length > 10000) {
      toast.error('Cannot delete more than 10000 numbers at once');
      return;
    }

    try {
      setIsDeleting(true);
      const result = await deleteNumbersInBatch(numbers);
      setLastResult(result);
      
      if (result.count > 0) {
        toast.success(`Successfully deleted ${result.count} numbers`);
      }
      
      if (result.notFound > 0) {
        toast.error(`${result.notFound} numbers were not found in the pool`);
      }
      
      setNumbersToDelete('');
    } catch (error) {
      toast.error('Failed to delete numbers');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Admin Dashboard</h2>
              <p className="text-gray-600">Logged in as: {user.email}</p>
            </div>
            
            {/* Batch Delete Section */}
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-4">Batch Delete Numbers</h3>
              <div className="space-y-4">
                <textarea
                  className="w-full h-40 p-2 border rounded-md"
                  placeholder="Enter numbers to delete (one per line)"
                  value={numbersToDelete}
                  onChange={(e) => setNumbersToDelete(e.target.value)}
                />
                <div className="text-sm text-gray-500">
                  Enter up to 10000 numbers, one per line
                </div>
                <button
                  onClick={handleBatchDelete}
                  disabled={isDeleting}
                  className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Delete Numbers'}
                </button>
                
                {/* Results Display */}
                {lastResult && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-md">
                    <h4 className="font-medium mb-2">Last Operation Results:</h4>
                    <div className="space-y-1">
                      <p className="text-green-600">Successfully deleted: {lastResult.count} numbers</p>
                      <p className="text-red-600">Not found in pool: {lastResult.notFound} numbers</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Existing dashboard content */}
            // ... existing code ...
          </div>
        </div>
      </div>
    </div>
  );
} 