/**
 * Test component to verify BulkDNCImport functionality
 */
import { useState } from 'react';
import { BulkDNCImport } from './BulkDNCImport';

export function BulkDNCTest() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Bulk DNC Import Test</h2>
      <button
        onClick={() => setIsOpen(true)}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
      >
        Open Bulk Import
      </button>
      
      <BulkDNCImport 
        isOpen={isOpen} 
        onClose={() => setIsOpen(false)} 
      />
    </div>
  );
}
