import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../../lib/firebase';
import { toast } from 'react-hot-toast';
import { Eye, EyeOff, Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface PasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

export function PasswordResetModal({ isOpen, onClose, user }: PasswordResetModalProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'new' | 'success'>('new');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const validatePassword = (password: string) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    return {
      minLength: password.length >= minLength,
      hasUpperCase,
      hasLowerCase,
      hasNumbers,
      hasSpecialChar,
      isValid: password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (step === 'new') {
      // Validate new password
      if (!newPassword.trim()) {
        setErrors({ newPassword: 'New password is required' });
        return;
      }

      if (!confirmPassword.trim()) {
        setErrors({ confirmPassword: 'Please confirm the new password' });
        return;
      }

      if (newPassword !== confirmPassword) {
        setErrors({ confirmPassword: 'Passwords do not match' });
        return;
      }

      const passwordValidation = validatePassword(newPassword);
      if (!passwordValidation.isValid) {
        setErrors({ newPassword: 'Password does not meet requirements' });
        return;
      }

      try {
        setIsLoading(true);

        // Check if functions is available
        if (!functions) {
          throw new Error('Firebase functions not available');
        }

        // Call Cloud Function to reset password
        const resetPassword = httpsCallable(functions, 'resetUserPassword');
        
        const result = await resetPassword({
          userId: user!.id,
          newPassword: newPassword
        });

        if (result.data.success) {
          // Update user document with reset information
          const userRef = doc(db, 'users', user!.id);
          await updateDoc(userRef, {
            passwordResetBy: auth.currentUser?.uid,
            passwordResetAt: new Date(),
            updatedAt: new Date()
          });

          setStep('success');
          toast.success('Password has been successfully reset!');
        } else {
          throw new Error(result.data.error || 'Password reset failed');
        }
      } catch (error: any) {
        console.error('Password reset failed:', error);
        
        // More specific error handling
        if (error.code === 'functions/unavailable') {
          toast.error('Firebase functions are not available. Please check your connection.');
        } else if (error.code === 'functions/not-found') {
          toast.error('Password reset function not found. Please contact support.');
        } else {
          toast.error(error.message || 'Failed to reset password. Please try again.');
        }
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleClose = () => {
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setErrors({});
    setStep('new');
    setIsLoading(false);
    onClose();
  };

  const passwordValidation = validatePassword(newPassword);

  if (!isOpen || !user) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 p-4"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-2 sm:mx-4 relative z-[101] max-h-[calc(100vh-2rem)] overflow-y-auto"
        >
          {/* Header */}
          <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-r from-red-500 to-pink-600 rounded-lg sm:rounded-xl flex items-center justify-center">
                  <Lock className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900">Reset Password</h3>
                  <p className="text-xs sm:text-sm text-gray-500">for {user.name}</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="text-gray-400 hover:text-gray-600 p-1.5 sm:p-2 rounded-lg hover:bg-gray-100"
              >
                <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-4 py-4 sm:px-6 sm:py-6">
            {step === 'new' && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4 sm:space-y-6"
              >
                <div className="text-center">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-r from-red-100 to-pink-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                    <Lock className="h-6 w-6 sm:h-8 sm:w-8 text-red-600" />
                  </div>
                  <h4 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">Reset Password</h4>
                </div>

                <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className={`w-full px-3 py-2.5 sm:px-4 sm:py-3 border rounded-lg sm:rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 text-sm sm:text-base ${
                          errors.newPassword ? 'border-red-300' : 'border-gray-300'
                        }`}
                        placeholder="Enter new password"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                    {errors.newPassword && (
                      <p className="mt-2 text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.newPassword}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5 sm:mb-2">
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`w-full px-3 py-2.5 sm:px-4 sm:py-3 border rounded-lg sm:rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 text-sm sm:text-base ${
                          errors.confirmPassword ? 'border-red-300' : 'border-gray-300'
                        }`}
                        placeholder="Confirm new password"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <p className="mt-2 text-sm text-red-600 flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1" />
                        {errors.confirmPassword}
                      </p>
                    )}
                  </div>

                  {/* Password Requirements */}
                  <div className="bg-gray-50 rounded-lg sm:rounded-xl p-3 sm:p-4">
                    <h5 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 sm:mb-3">Password Requirements:</h5>
                    <div className="space-y-1.5 sm:space-y-2">
                      <div className="flex items-center space-x-2">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                          passwordValidation.minLength ? 'bg-green-500' : 'bg-gray-300'
                        }`}>
                          {passwordValidation.minLength && <CheckCircle className="h-3 w-3 text-white" />}
                        </div>
                        <span className={`text-sm ${passwordValidation.minLength ? 'text-green-600' : 'text-gray-600'}`}>
                          At least 8 characters
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                          passwordValidation.hasUpperCase ? 'bg-green-500' : 'bg-gray-300'
                        }`}>
                          {passwordValidation.hasUpperCase && <CheckCircle className="h-3 w-3 text-white" />}
                        </div>
                        <span className={`text-sm ${passwordValidation.hasUpperCase ? 'text-green-600' : 'text-gray-600'}`}>
                          One uppercase letter
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                          passwordValidation.hasLowerCase ? 'bg-green-500' : 'bg-gray-300'
                        }`}>
                          {passwordValidation.hasLowerCase && <CheckCircle className="h-3 w-3 text-white" />}
                        </div>
                        <span className={`text-sm ${passwordValidation.hasLowerCase ? 'text-green-600' : 'text-gray-600'}`}>
                          One lowercase letter
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                          passwordValidation.hasNumbers ? 'bg-green-500' : 'bg-gray-300'
                        }`}>
                          {passwordValidation.hasNumbers && <CheckCircle className="h-3 w-3 text-white" />}
                        </div>
                        <span className={`text-sm ${passwordValidation.hasNumbers ? 'text-green-600' : 'text-gray-600'}`}>
                          One number
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                          passwordValidation.hasSpecialChar ? 'bg-green-500' : 'bg-gray-300'
                        }`}>
                          {passwordValidation.hasSpecialChar && <CheckCircle className="h-3 w-3 text-white" />}
                        </div>
                        <span className={`text-sm ${passwordValidation.hasSpecialChar ? 'text-green-600' : 'text-gray-600'}`}>
                          One special character
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex space-x-2 sm:space-x-3 pt-3 sm:pt-4">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="flex-1 px-3 py-2.5 sm:px-4 sm:py-3 border border-gray-300 text-gray-700 rounded-lg sm:rounded-xl hover:bg-gray-50 transition-colors text-sm sm:text-base"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading || !passwordValidation.isValid || newPassword !== confirmPassword}
                      className="flex-1 px-3 py-2.5 sm:px-4 sm:py-3 bg-gradient-to-r from-red-600 to-pink-600 text-white rounded-lg sm:rounded-xl hover:from-red-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm sm:text-base"
                    >
                      {isLoading ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>
                      ) : (
                        'Reset Password'
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {step === 'success' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-6 sm:py-8"
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-r from-green-100 to-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
                  <CheckCircle className="h-8 w-8 sm:h-10 sm:w-10 text-green-600" />
                </div>
                <h4 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 sm:mb-3">Password Reset Complete!</h4>
                <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                  The password for {user.name} has been successfully reset.
                </p>
                <button
                  onClick={handleClose}
                  className="w-full px-3 py-2.5 sm:px-4 sm:py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg sm:rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 text-sm sm:text-base"
                >
                  Close
                </button>
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
