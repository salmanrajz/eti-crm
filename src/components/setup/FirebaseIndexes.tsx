import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

export function FirebaseIndexes() {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeResult, setRecomputeResult] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [initResult, setInitResult] = useState<string | null>(null);

  async function handleRecomputeStats() {
    try {
      setRecomputing(true);
      setRecomputeResult(null);
      const fn = httpsCallable(getFunctions(), 'recomputeNumberPoolStats');
      const res = await fn({});
      setRecomputeResult('Recompute completed successfully.');
    } catch (err: any) {
      setRecomputeResult(`Failed to recompute stats: ${err?.message || 'Unknown error'}`);
    } finally {
      setRecomputing(false);
    }
  }

  async function handleInitializeStats() {
    try {
      setInitializing(true);
      setInitResult(null);
      const fn = httpsCallable(getFunctions(), 'initializeNumberPoolStats');
      const res = await fn({});
      const data = res.data as any;
      setInitResult(
        `Initialization completed successfully! ` +
        `Total: ${data.totalItems} items. ` +
        `Categories: ${Object.keys(data.categoryCounts || {}).length}, ` +
        `Groups: ${Object.keys(data.groupCounts || {}).length}, ` +
        `Initials: ${Object.keys(data.initialsCounts || {}).length}`
      );
    } catch (err: any) {
      setInitResult(`Failed to initialize stats: ${err?.message || 'Unknown error'}`);
    } finally {
      setInitializing(false);
    }
  }

  const indexes = [
    {
      name: 'Team Leads by Team ID and Creation Date',
      collection: 'leads',
      fields: [
        { field: 'teamId', order: 'ASCENDING' },
        { field: 'createdAt', order: 'DESCENDING' }
      ],
      url: `https://console.firebase.google.com/v1/r/project/${projectId}/firestore/indexes?create_composite=Ckhwcm9qZWN0cy9jcm1zLTRmNTQzL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9sZWFkcy9pbmRleGVzL18QARoKCgZ0ZWFtSWQQARoNCgljcmVhdGVkQXQQAhoMCghfX25hbWVfXxAC`
    },
    {
      name: 'Leads by Agent and Creation Date',
      collection: 'leads',
      fields: [
        { field: 'agentId', order: 'ASCENDING' },
        { field: 'createdAt', order: 'DESCENDING' }
      ],
      url: `https://console.firebase.google.com/v1/r/project/${projectId}/firestore/indexes?create_composite=Ckhwcm9qZWN0cy9jcm1zLTRmNTQzL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9sZWFkcy9pbmRleGVzL18QARoLCgdhZ2VudElkEAEaDQoJY3JlYXRlZEF0EAIaDAoIX19uYW1lX18QAg`
    },
    {
      name: 'Leads by Status and Creation Date',
      collection: 'leads',
      fields: [
        { field: 'status', order: 'ASCENDING' },
        { field: 'createdAt', order: 'DESCENDING' }
      ],
      url: `https://console.firebase.google.com/v1/r/project/${projectId}/firestore/indexes?create_composite=Ckhwcm9qZWN0cy9jcm1zLTRmNTQzL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9sZWFkcy9pbmRleGVzL18QARoKCgZzdGF0dXMQARoNCgljcmVhdGVkQXQQAhoMCghfX25hbWVfXxAC`
    },
    {
      name: 'Number Pool by Reserved By and Reserved At',
      collection: 'numberPool',
      fields: [
        { field: 'status', order: 'ASCENDING' },
        { field: 'category', order: 'ASCENDING' },
        { field: 'createdAt', order: 'DESCENDING' }
      ],
      url: `https://console.firebase.google.com/v1/r/project/${projectId}/firestore/indexes?create_composite=Ck1wcm9qZWN0cy9jcm1zLTRmNTQzL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9udW1iZXJQb29sL2luZGV4ZXMvXxABGg4KCnJlc2VydmVkQnkQARoOCgpyZXNlcnZlZEF0EAIaDAoIX19uYW1lX18QAg`
    },
    {
      name: 'Chat Messages by Lead ID and Creation Date',
      collection: 'chatMessages',
      fields: [
        { field: 'leadId', order: 'ASCENDING' },
        { field: 'createdAt', order: 'DESCENDING' }
      ],
      url: `https://console.firebase.google.com/v1/r/project/${projectId}/firestore/indexes?create_composite=Ck9wcm9qZWN0cy9jcm1zLTRmNTQzL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9jaGF0TWVzc2FnZXMvaW5kZXhlcy9fEAEaCgoGbGVhZElkEAEaDQoJY3JlYXRlZEF0EAIaDAoIX19uYW1lX18QAg`
    }
  ];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Firebase Indexes Setup</h1>
      
      <div className="bg-white shadow rounded-lg p-6">
        <p className="text-gray-600 mb-6">
          To enable all features of the application, you need to create the following indexes in Firebase.
          Click each link below to create the required indexes:
        </p>

        <div className="space-y-6">
          {indexes.map((index) => (
            <div key={index.name} className="border rounded-lg p-4">
              <h3 className="text-lg font-medium text-gray-900 mb-2">{index.name}</h3>
              
              <div className="mb-4">
                <p className="text-sm text-gray-500">Collection: {index.collection}</p>
                <div className="mt-2">
                  <p className="text-sm font-medium text-gray-700">Fields:</p>
                  <ul className="mt-1 space-y-1">
                    {index.fields.map((field) => (
                      <li key={field.field} className="text-sm text-gray-600">
                        • {field.field} ({field.order})
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <a
                href={index.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Create Index <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </div>
          ))}
        </div>

        <div className="mt-6 bg-blue-50 border-l-4 border-blue-400 p-4">
          <div className="flex">
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                After clicking each link:
                <ol className="mt-2 list-decimal list-inside space-y-1">
                  <li>Sign in to your Firebase Console if prompted</li>
                  <li>Click "Create Index" in the Firebase Console</li>
                  <li>Wait for the index to finish building (this may take a few minutes)</li>
                  <li>Refresh this page once all indexes are created</li>
                </ol>
              </p>
            </div>
          </div>
        </div>

        {/* Temporary Admin Tool: Recompute NumberPool Stats */}
        <div className="mt-8 border-t pt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Admin Tools</h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleRecomputeStats}
              disabled={recomputing || initializing}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-60"
            >
              {recomputing ? 'Recomputing stats…' : 'Recompute NumberPool Stats'}
            </button>
            <button
              onClick={handleInitializeStats}
              disabled={recomputing || initializing}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60"
            >
              {initializing ? 'Initializing stats (this may take a few minutes)…' : 'Initialize NumberPool Stats (with Initials)'}
            </button>
          </div>
          {recomputeResult && (
            <p className="mt-3 text-sm text-gray-700">{recomputeResult}</p>
          )}
          {initResult && (
            <p className="mt-3 text-sm text-gray-700">{initResult}</p>
          )}
        </div>
      </div>
    </div>
  );
}