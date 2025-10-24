import { useState } from 'react';
import { read, utils } from 'xlsx';
import { createUserWithDocument } from '../../lib/firebase';
import { toast } from 'react-hot-toast';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import type { UserRole } from '../../types';

interface UserRow {
  email: string;
  name: string;
  role: UserRole;
  password: string;
}

const VALID_ROLES: UserRole[] = ['agent', 'verifier', 'coordinator', 'manager'];

export function BulkUserUpload() {
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
      
      // Check required fields
      if (!row.email || !row.name || !row.role || !row.password) {
        errors.push(`Row ${rowNumber}: Missing required fields`);
        return;
      }

      // Validate email format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
        errors.push(`Row ${rowNumber}: Invalid email format - ${row.email}`);
        return;
      }

      // Validate role
      if (!VALID_ROLES.includes(row.role)) {
        errors.push(`Row ${rowNumber}: Invalid role "${row.role}". Must be one of: ${VALID_ROLES.join(', ')}`);
        return;
      }

      // Validate password length
      if (row.password.length < 6) {
        errors.push(`Row ${rowNumber}: Password must be at least 6 characters long`);
        return;
      }

      // If all validations pass, add to valid users
      validUsers.push({
        email: row.email.trim(),
        name: row.name.trim(),
        role: row.role as UserRole,
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

      // Read the Excel file
      const data = await file.arrayBuffer();
      const workbook = read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = utils.sheet_to_json(worksheet);

      // Validate the data
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
        await createUserWithDocument(
          user.email,
          user.password,
          user.role,
          user.name
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

    // Reset state
    setValidatedUsers([]);
    setValidationErrors([]);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-2">
            Bulk User Upload
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            Upload an Excel file containing user information to create multiple users at once.
          </p>

          {/* File Upload */}
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

          {/* Validation Errors */}
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

          {/* Validated Users Preview */}
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
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {validatedUsers.map((user, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2 text-sm text-gray-500">{user.name}</td>
                        <td className="px-3 py-2 text-sm text-gray-500">{user.email}</td>
                        <td className="px-3 py-2 text-sm text-gray-500">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                            user.role === 'manager' ? 'bg-blue-100 text-blue-800' :
                            user.role === 'agent' ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {user.role}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Upload Progress */}
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

          {/* Create Users Button */}
          <div className="flex justify-end">
            <button
              type="button"
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
      </div>

      {/* Instructions */}
      <div className="mt-6 bg-blue-50 border-l-4 border-blue-400 p-4">
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
                <li className="ml-4">- role (required, must be: agent, verifier, coordinator, or manager)</li>
                <li className="ml-4">- password (required, minimum 6 characters)</li>
                <li>Each row represents one user to be created</li>
                <li>Passwords will be set as provided in the Excel file</li>
                <li>Users should change their password upon first login</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}