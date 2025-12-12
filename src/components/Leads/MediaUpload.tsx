/**
 * ===============================================================================
 * MEDIA UPLOAD COMPONENT - FILE UPLOAD AND MANAGEMENT
 * ===============================================================================
 * 
 * This component provides file upload functionality for lead verification media,
 * supporting multiple file types including images, videos, audio, and PDF documents.
 * It integrates with Firebase Storage for secure file storage and management.
 * 
 * FEATURES:
 * 
 * 1. MULTI-FILE UPLOAD SUPPORT
 *    - Support for images, videos, audio, and PDF files
 *    - Multiple file selection and batch upload capabilities
 *    - File type detection and appropriate categorization
 * 
 * 2. FIREBASE STORAGE INTEGRATION
 *    - Secure file upload to Firebase Storage with organized folder structure
 *    - Automatic file type categorization in storage paths
 *    - Download URL generation for file access
 * 
 * 3. UPLOAD MANAGEMENT
 *    - File removal before upload completion
 *    - Upload progress tracking and status indicators
 *    - Error handling and user feedback via toast notifications
 * 
 * 4. LEAD INTEGRATION
 *    - Automatic lead document updates with uploaded media references
 *    - Verification media tracking for lead verification workflows
 *    - File metadata including type, name, and URL storage
 * 
 * USAGE:
 * This component is used in lead verification workflows to handle the upload
 * of verification documents, screenshots, and other supporting media files.
 * ===============================================================================
 */

import { useState, useRef } from 'react';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db } from '../../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Upload, X, CheckCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { uploadVerificationFileToAzure } from '../../utils/azureUpload';

interface MediaUploadProps {
  leadId: string;
  onUploadComplete: (files: Array<{ url: string; type: 'image' | 'video' | 'audio' | 'pdf'; name: string }>) => void;
  onUploadingChange?: (uploading: boolean) => void;
  onUploadProgress?: (progress: number) => void; // 0-100 overall progress
}

export function MediaUpload({ leadId, onUploadComplete, onUploadingChange, onUploadProgress }: MediaUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const storage = getStorage();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (files.length === 0) {
      toast.error('Please select at least one file to upload');
      return;
    }

    setUploading(true);
    onUploadingChange?.(true);
    onUploadProgress?.(0);

    try {
      const totalBytes = files.reduce((sum, f) => sum + f.size, 0) || 1;
      let uploadedBytes = 0;
      const mediaFiles: Array<{ url: string; type: 'image' | 'video' | 'audio' | 'pdf'; name: string; azureUrl?: string | null }> = [];

      for (const file of files) {
        const isPdf = file.type === 'application/pdf';
        const fileType = (isPdf ? 'pdf' : file.type.split('/')[0]) as 'image' | 'video' | 'audio' | 'pdf';
        const folder = isPdf ? 'pdf' : fileType;
        const storageRef = ref(storage, `leads/${leadId}/${folder}/${file.name}`);

        const uploadTask = uploadBytesResumable(storageRef, file);

        const url = await new Promise<string>((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            (snapshot) => {
              const currentBytes = uploadedBytes + snapshot.bytesTransferred;
              const progress = Math.min(100, Math.round((currentBytes / totalBytes) * 100));
              onUploadProgress?.(progress);
            },
            (error) => reject(error),
            async () => {
              uploadedBytes += file.size;
              onUploadProgress?.(Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)));
              const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadUrl);
            }
          );
        });

        const azureResult = await uploadVerificationFileToAzure(leadId, file).catch((error) => {
          console.error('Azure upload failed for file:', file.name, error);
          return null;
        });

        mediaFiles.push({
          url,
          type: fileType,
          name: file.name,
          azureUrl: azureResult?.url || undefined,
        });
      }

      if (mediaFiles.some((file) => !file.url)) {
        throw new Error('One or more uploads failed');
      }

      // Update lead document with media files
      await updateDoc(doc(db, 'leads', leadId), {
        verificationMedia: mediaFiles,
      });

      toast.success('Files uploaded successfully');
      setFiles([]);
      onUploadComplete(mediaFiles);
    } catch (error) {
      console.error('Error uploading files:', error);
      toast.error('Failed to upload files');
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">Upload Verification Media</h3>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
        >
          <Upload className="h-4 w-4 mr-2" />
          Add Files
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/*,video/*,audio/*,application/pdf"
          multiple
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-gray-500">
            Selected files ({files.length}):
          </div>
          <div className="space-y-2">
            {files.map((file, index) => (
              <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                <div className="flex items-center">
                  <span className="text-sm text-gray-900">{file.name}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                </div>
                <button
                  onClick={() => removeFile(index)}
                  className="text-red-500 hover:text-red-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={uploadFiles}
            disabled={uploading}
            className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
          >
            {uploading ? (
              'Uploading...'
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Upload
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
} 