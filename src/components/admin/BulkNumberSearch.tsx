/**
 * ===============================================================================
 * BULK NUMBER SEARCH COMPONENT - ADMIN TOOL
 * ===============================================================================
 * 
 * This component allows administrators to search for multiple numbers from the
 * number pool at once. Users can paste a list of numbers (one per line or
 * comma-separated) and get detailed information about each number.
 * 
 * FEATURES:
 * 
 * 1. BULK SEARCH CAPABILITY
 *    - Accept multiple numbers in various formats
 *    - Support for one-per-line or comma-separated input
 *    - Efficient batch queries to Firebase
 * 
 * 2. COMPREHENSIVE RESULTS
 *    - Display number, status, category, group, code
 *    - Show plan information if available
 *    - Indicate if number is not found
 * 
 * 3. EXPORT FUNCTIONALITY
 *    - Export results to CSV
 *    - Copy results to clipboard
 * 
 * USAGE:
 * This component is accessible from the Admin Dashboard and allows
 * administrators to quickly check the status of multiple numbers.
 * ===============================================================================
 */

import { useState } from 'react';
import { collection, query, where, getDocs, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { NumberPool } from '../../types';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  X, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  Download,
  Copy,
  FileText,
  AlertCircle
} from 'lucide-react';

interface BulkNumberSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SearchResult {
  number: string;
  found: boolean;
  data?: NumberPool;
  error?: string;
}

export function BulkNumberSearch({ isOpen, onClose }: BulkNumberSearchProps) {
  const [inputText, setInputText] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // Parse input text into array of numbers
  const parseNumbers = (text: string): string[] => {
    if (!text.trim()) return [];
    
    // Split by newlines and commas, then clean each number
    const lines = text.split(/[\n,;]/);
    const numbers = lines
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        // Remove any non-digit characters except leading + or 0
        let cleaned = line.replace(/[^\d+]/g, '');
        // If it starts with +971, convert to 0 format
        if (cleaned.startsWith('+971')) {
          cleaned = '0' + cleaned.slice(4);
        }
        // If it starts with 971, convert to 0 format
        if (cleaned.startsWith('971')) {
          cleaned = '0' + cleaned.slice(3);
        }
        // Ensure it starts with 0 if it's a 10-digit number
        if (cleaned.length === 10 && !cleaned.startsWith('0')) {
          cleaned = '0' + cleaned;
        }
        return cleaned;
      })
      .filter(num => num.length >= 7); // Minimum 7 digits
    
    return [...new Set(numbers)]; // Remove duplicates
  };

  // Search for numbers in Firebase
  const handleSearch = async () => {
    const numbers = parseNumbers(inputText);
    
    if (numbers.length === 0) {
      toast.error('Please enter at least one valid number');
      return;
    }

    if (numbers.length > 1000) {
      toast.error('Please enter maximum 1000 numbers at a time');
      return;
    }

    setSearching(true);
    setSearched(false);
    setResults([]);

    try {
      const searchResults: SearchResult[] = [];
      
      // Process in batches of 10 (Firestore 'in' query limit)
      const batchSize = 10;
      for (let i = 0; i < numbers.length; i += batchSize) {
        const batch = numbers.slice(i, i + batchSize);
        
        try {
          // Query Firebase for numbers in this batch
          const q = query(
            collection(db, 'numberPool'),
            where('number', 'in', batch)
          );
          
          const snapshot = await getDocs(q);
          const foundNumbers = new Set(
            snapshot.docs.map(doc => doc.data().number)
          );
          
          // Create results for this batch
          batch.forEach(number => {
            if (foundNumbers.has(number)) {
              const doc = snapshot.docs.find(d => d.data().number === number);
              if (doc) {
                searchResults.push({
                  number,
                  found: true,
                  data: {
                    id: doc.id,
                    ...doc.data()
                  } as NumberPool
                });
              }
            } else {
              searchResults.push({
                number,
                found: false
              });
            }
          });
        } catch (error) {
          console.error('Error searching batch:', error);
          // Add error results for this batch
          batch.forEach(number => {
            searchResults.push({
              number,
              found: false,
              error: 'Search error'
            });
          });
        }
      }

      setResults(searchResults);
      setSearched(true);
      
      const foundCount = searchResults.filter(r => r.found).length;
      const notFoundCount = searchResults.length - foundCount;
      
      toast.success(
        `Search complete: ${foundCount} found, ${notFoundCount} not found`,
        { duration: 3000 }
      );
    } catch (error) {
      console.error('Bulk search error:', error);
      toast.error('Error searching numbers. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  // Export results to CSV
  const handleExportCSV = () => {
    if (results.length === 0) {
      toast.error('No results to export');
      return;
    }

    const headers = ['Number', 'Status', 'Category', 'Group', 'Code', 'Plan', 'Found'];
    const rows = results.map(result => [
      result.number,
      result.data?.status || 'N/A',
      result.data?.category || 'N/A',
      result.data?.group || 'N/A',
      result.data?.code || 'N/A',
      result.data?.plan || 'N/A',
      result.found ? 'Yes' : 'No'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk-number-search-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Results exported to CSV');
  };

  // Copy results to clipboard
  const handleCopyResults = () => {
    if (results.length === 0) {
      toast.error('No results to copy');
      return;
    }

    const text = results
      .map(result => {
        if (result.found && result.data) {
          return `${result.number},${result.data.status},${result.data.category},${result.data.group || 'N/A'},${result.data.code || 'N/A'}`;
        }
        return `${result.number},Not Found`;
      })
      .join('\n');

    navigator.clipboard.writeText(text);
    toast.success('Results copied to clipboard');
  };

  // Clear all
  const handleClear = () => {
    setInputText('');
    setResults([]);
    setSearched(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col m-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Search className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Bulk Number Search</h2>
              <p className="text-sm text-gray-500">Search multiple numbers from number pool</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Input Section */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Enter Numbers (one per line, or comma-separated)
            </label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="0501234567&#10;0502345678&#10;0503456789&#10;Or: 0501234567, 0502345678, 0503456789"
              className="w-full h-40 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none font-mono text-sm"
              disabled={searching}
            />
            <p className="mt-2 text-xs text-gray-500">
              Supports formats: 0501234567, +971501234567, 971501234567. Maximum 1000 numbers.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={handleSearch}
              disabled={searching || !inputText.trim()}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {searching ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <Search className="h-5 w-5" />
                  <span>Search Numbers</span>
                </>
              )}
            </button>
            
            {searched && results.length > 0 && (
              <>
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  <Download className="h-5 w-5" />
                  <span>Export CSV</span>
                </button>
                <button
                  onClick={handleCopyResults}
                  className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  <Copy className="h-5 w-5" />
                  <span>Copy Results</span>
                </button>
              </>
            )}
            
            <button
              onClick={handleClear}
              className="flex items-center gap-2 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
            >
              <X className="h-5 w-5" />
              <span>Clear</span>
            </button>
          </div>

          {/* Results Section */}
          {searched && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">
                    Results ({results.length} total)
                  </h3>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-green-600 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" />
                      {results.filter(r => r.found).length} Found
                    </span>
                    <span className="text-red-600 flex items-center gap-1">
                      <XCircle className="h-4 w-4" />
                      {results.filter(r => !r.found).length} Not Found
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="overflow-x-auto max-h-96">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Number</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Group</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Code</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Plan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    <AnimatePresence>
                      {results.map((result, index) => (
                        <motion.tr
                          key={`${result.number}-${index}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ delay: index * 0.01 }}
                          className={result.found ? 'bg-white' : 'bg-red-50'}
                        >
                          <td className="px-4 py-3 text-sm font-mono text-gray-900">
                            {result.number}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {result.found ? (
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                result.data?.status === 'open' ? 'bg-green-100 text-green-800' :
                                result.data?.status === 'reserved' ? 'bg-yellow-100 text-yellow-800' :
                                result.data?.status === 'activated' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {result.data?.status || 'N/A'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                Not Found
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {result.data?.category || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {result.data?.group || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {result.data?.code || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {result.data?.plan || '-'}
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
