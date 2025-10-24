import { useState } from 'react';
import { read, utils } from 'xlsx';
import { createUserWithDocument } from '../../lib/firebase';
import { toast } from 'react-hot-toast';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import type { Team } from '../../types';

interface UserRow {
  email: string;
  name: string;
  password: string;
}

interface TeamBulkUploadProps {
  team: Team;
  onComplete: () => void;
}

export function TeamBulkUpload({ team, onComplete }: TeamBulkUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validatedUsers, setValidatedUsers] = useState<UserRow[]>([]);
  const [creationProgress, setCreationProgress] = useState<{
    total: number;
    current: number;
    success: number;
    failed: number;
  }>({
    total: 0,
    current: 0,
    success: 0,
    failed: 0
  });

  const validateExcelData = (data: any[]): { valid: UserRow[]; errors: string[] } => {
    const errors: string[] = [];
    const validUsers: UserRow[] = [];

    data.forEach((row, index) => {
      const rowNumber = index + 2; // Account for header row
      
      if (!row.email || !row.name || !row.password) {
        errors.push(`Row ${rowNumber}: Missing required fields`);
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
        errors.push(`Row ${rowNumber}: Invalid email format - ${row.email}`);
        return;
      }

      if (row.password.length < 6) {
        errors.push(`Row ${rowNumber}: Password must be at least 6 characters long`);
        return;
      }

      validUsers.push({
        email: row.email.trim(),
        name: row.name.trim(),
        password: row.password
      });
    });

    return { valid: validUsers, errors };
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setValidationErrors([]);
      setValidatedUsers([]);

      const data = await file.arrayBuffer();
      const workbook = read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = utils.sheet_to_json(worksheet);

      const { valid, errors } = validateExcelData(jsonData);

      if (errors.length > 0) {
        setValidationErrors(errors);
        toast.error('Validation failed. Please check the errors below.');
      } else {
        setValidatedUsers(valid);
        toast.success(`Successfully validated ${valid.length} users`);
      }
    } catch (error) {
      console.error('Error reading Excel file:', error);
      toast.error('Failed to read Excel file');
    }
  };

  const handleCreateUsers = async () => {
    if (validatedUsers.length === 0) {
      toast.error('No valid users to create');
      return;
    }

    setUploading(true);
    setCreationProgress({
      total: validatedUsers.length,
      current: 0,
      success: 0,
      failed: 0
    });

    for (const [index, user] of validatedUsers.entries()) {
      try {
        // Create user with agent role and team assignment
        await createUserWithDocument(
          user.email,
          user.password,
          'agent',
          user.name,
          {
            teamId: team.id,
            managerId: team.managerId
          }
        );

        setCreationProgress(prev => ({
          ...prev,
          current: index + 1,
          success: prev.success + 1
        }));
      } catch (error) {
        console.error(`Error creating user ${user.email}:`, error);
        setCreationProgress(prev => ({
          ...prev,
          current: index + 1,
          failed: prev.failed + 1
        }));
      }
    }

    setUploading(false);
    toast.success(`Created ${creationProgress.success} users successfully`);
    if (creationProgress.failed > 0) {
      toast.error(`Failed to create ${creationProgress.failed} users`);
    }

    setValidatedUsers([]);
    setValidationErrors([]);
    onComplete();
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Bulk Upload Users to {team.name}
        </h3>
        <p className="text-sm text-gray-500">
          Upload an Excel file containing user information to add multiple agents to this team.
        </p>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Upload Excel File
        </label>
        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
          <div className="space-y-1 text-center">
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <div className="flex text-sm text-gray-600">
              <label
                htmlFor="excel-upload"
                className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
              >
                <span>Upload Excel file</span>
                <input
                  id="excel-upload"
                  name="excel-upload"
                  type="file"
                  accept=".xlsx,.xls"
                  className="sr-only"
                  onChange={handleFileUpload}
                />
              </label>
              <p className="pl-1">or drag and drop</p>
            </div>
            <p className="text-xs text-gray-500">
              Excel files only (.xlsx, .xls)
            </p>
          </div>
        </div>
      </div>

      {validationErrors.length > 0 && (
        <div className="mb-6 p-4 bg-red-50 rounded-md">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400 mr-2" />
            <h4 className="text-sm font-medium text-red-800">
              Validation Errors:
            </h4>
          </div>
          <ul className="mt-2 list-disc list-inside text-sm text-red-700">
            {validationErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {validatedUsers.length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            Validated Users ({validatedUsers.length})
          </h4>
          <div className="bg-gray-50 rounded-md p-4 max-h-60 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {validatedUsers.map((user, index) => (
                  <tr key={index}>
                    <td className="px-3 py-2 text-sm text-gray-500">{user.name}</td>
                    <td className="px-3 py-2 text-sm text-gray-500">{user.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {uploading && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              Creating users... ({creationProgress.current} / {creationProgress.total})
            </span>
            <div className="flex items-center space-x-4">
              <div className="flex items-center text-green-700">
                <CheckCircle2 className="h-4 w-4 mr-1" />
                <span className="text-sm">{creationProgress.success}</span>
              </div>
              <div className="flex items-center text-red-700">
                <XCircle className="h-4 w-4 mr-1" />
                <span className="text-sm">{creationProgress.failed}</span>
              </div>
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(creationProgress.current / creationProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="mb-6 bg-blue-50 border-l-4 border-blue-400 p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <FileSpreadsheet className="h-5 w-5 text-blue-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Instructions</h3>
            <div className="mt-2 text-sm text-blue-700">
              <ul className="list-disc list-inside">
                <li>The Excel file must have these exact column headers:</li>
                <li className="ml-4">- email (required, must be valid email format)</li>
                <li className="ml-4">- name (required)</li>
                <li className="ml-4">- password (required, minimum 6 characters)</li>
                <li>Each row represents one agent to be added to this team</li>
                <li>All users will be created with the agent role</li>
                <li>Users should change their password upon first login</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end space-x-3">
        <button
          onClick={onComplete}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleCreateUsers}
          disabled={uploading || validatedUsers.length === 0}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          {uploading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Creating Users...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Create Users
            </>
          )}
        </button>
      </div>
    </div>
  );
}