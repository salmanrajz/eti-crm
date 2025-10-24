import { useState, useEffect, useCallback } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { toast } from 'react-hot-toast';
import { LogIn, Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, Shield, MapPin, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateDeviceFingerprint } from '../utils/deviceFingerprint';
import { trustDevice as trustDeviceService } from '../services/trustedDeviceService';
import { forceLocationPermissionRequest, isGeolocationSupported, getLocationPermissionStatus } from '../utils/geolocationService';

interface FormErrors {
  email?: string;
  password?: string;
  general?: string;
}

interface FormTouched {
  email: boolean;
  password: boolean;
}

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [allowLocation, setAllowLocation] = useState(false);
  const [locationRequested, setLocationRequested] = useState(false);
  const [requestingLocation, setRequestingLocation] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);

  // Check if location permission was previously denied
  const checkLocationPermissionStatus = async () => {
    try {
      const status = await getLocationPermissionStatus();
      return status;
    } catch (error) {
      return null;
    }
  };

  // Force location permission when trust device is checked
  const handleTrustDeviceChange = async (checked: boolean) => {
    if (checked) {
      // Don't set trustDevice to true yet - wait for location permission
      setTrustDevice(false); // Keep checkbox unchecked initially
      
      if (!isGeolocationSupported()) {
        // Location services not supported, show popup immediately
        setShowLocationModal(true);
        return;
      }
      
      // Check if permission was previously denied
      const permissionStatus = await checkLocationPermissionStatus();
      if (permissionStatus === 'denied') {
        // Permission was previously denied, show popup immediately
        setShowLocationModal(true);
        return;
      }
      
      // Clear any previous state and force fresh permission request
      setAllowLocation(false);
      setLocationRequested(false);
      setRequestingLocation(true);
      
      try {
        // Small delay to ensure UI is ready before requesting permission
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Force fresh location permission request (will always show native popup)
        await forceLocationPermissionRequest();
        setAllowLocation(true);
        setTrustDevice(true); // Only set to true if location permission granted
        setLocationRequested(true);
        // Location permission granted silently
      } catch (error) {
        console.warn('Location permission denied:', error);
        setAllowLocation(false);
        setTrustDevice(false); // Keep checkbox unchecked
        setLocationRequested(false);
        
        // Show popup modal when location permission is denied
        setShowLocationModal(true);
      } finally {
        setRequestingLocation(false);
      }
    } else {
      setTrustDevice(false);
      setAllowLocation(false);
      setLocationRequested(false);
      setRequestingLocation(false);
    }
  };
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<FormTouched>({ email: false, password: false });
  const [isFormValid, setIsFormValid] = useState(false);

  // Real-time validation
  const validateEmail = useCallback((email: string): string | undefined => {
    if (!email) return 'Email is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return 'Please enter a valid email address';
    return undefined;
  }, []);

  const validatePassword = useCallback((password: string): string | undefined => {
    if (!password) return 'Password is required';
    if (password.length < 6) return 'Password must be at least 6 characters';
    return undefined;
  }, []);

  // Update validation on input change
  useEffect(() => {
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    
    setErrors({
      email: touched.email ? emailError : undefined,
      password: touched.password ? passwordError : undefined
    });

    setIsFormValid(!emailError && !passwordError && email && password);
  }, [email, password, touched, validateEmail, validatePassword]);


  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (!touched.email) {
      setTouched(prev => ({ ...prev, email: true }));
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (!touched.password) {
      setTouched(prev => ({ ...prev, password: true }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Mark all fields as touched
    setTouched({ email: true, password: true });
    
    // Validate form
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    
    if (emailError || passwordError) {
      setErrors({ email: emailError, password: passwordError });
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Mark this as a fresh login so AuthProvider knows to allow it
      sessionStorage.setItem('freshLogin', 'true');
      
      
      // Handle trusted device (only if location permission was granted)
      if (trustDevice && user && allowLocation) {
        try {
          const deviceFingerprint = generateDeviceFingerprint();
          await trustDeviceService(user.uid, deviceFingerprint, undefined, true);
          // Device marked as trusted silently
        } catch (trustError) {
          console.error('Error trusting device:', trustError);
          // Show modal when Firebase operation fails
          setShowLocationModal(true);
        }
      } else if (trustDevice && user && !allowLocation) {
        // This shouldn't happen due to our UI logic, but just in case
        return;
      }
      
      toast.success('Welcome back!');
    } catch (error) {
      console.error('Auth error:', error);
      const errorCode = (error as { code?: string })?.code;
      
      let errorMessage = 'Login failed. Please try again.';
      
      switch (errorCode) {
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          errorMessage = 'Invalid email or password. Please check your credentials and try again.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email format.';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many failed attempts. Please try again later.';
          break;
        case 'auth/user-disabled':
          errorMessage = 'This account has been disabled. Please contact support.';
          break;
      }
      
      setErrors({ general: errorMessage });
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      {/* Background Pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-40 left-40 w-80 h-80 bg-pink-400 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md relative"
      >
        {/* Main Card */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-8 pb-6 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", duration: 0.6, delay: 0.1 }}
              className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl shadow-lg mb-6"
            >
              <LogIn className="w-8 h-8 text-white" />
            </motion.div>
            
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2"
            >
              Welcome back
            </motion.h1>
            
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="text-gray-600 text-sm sm:text-base"
            >
              Sign in to your account to continue
            </motion.p>
          </div>

          {/* Form */}
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            onSubmit={handleSubmit}
            className="px-8 pb-8 space-y-6"
            noValidate
          >
            {/* General Error */}
            <AnimatePresence>
              {errors.general && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl"
                >
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700">{errors.general}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email Field */}
            <div className="space-y-2">
              <label 
                htmlFor="email" 
                className="block text-sm font-medium text-gray-700"
              >
                Email address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className={`w-5 h-5 transition-colors duration-200 ${
                    errors.email ? 'text-red-400' : 
                    email && !errors.email ? 'text-green-400' : 'text-gray-400'
                  }`} />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={handleEmailChange}
                  onBlur={() => setTouched(prev => ({ ...prev, email: true }))}
                  className={`block w-full pl-10 pr-10 py-3 border rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 transition-all duration-200 ${
                    errors.email 
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' 
                      : email && !errors.email
                        ? 'border-green-300 focus:border-green-500 focus:ring-green-500/20'
                        : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500/20'
                  }`}
                  placeholder="Enter your email"
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  aria-invalid={!!errors.email}
                />
                {email && !errors.email && (
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  </div>
                )}
              </div>
              <AnimatePresence>
                {errors.email && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    id="email-error"
                    className="text-sm text-red-600 flex items-center gap-1"
                    role="alert"
                  >
                    <AlertCircle className="w-4 h-4" />
                    {errors.email}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label 
                htmlFor="password" 
                className="block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className={`w-5 h-5 transition-colors duration-200 ${
                    errors.password ? 'text-red-400' : 
                    password && !errors.password ? 'text-green-400' : 'text-gray-400'
                  }`} />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={handlePasswordChange}
                  onBlur={() => setTouched(prev => ({ ...prev, password: true }))}
                  className={`block w-full pl-10 pr-10 py-3 border rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 transition-all duration-200 ${
                    errors.password 
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20' 
                      : password && !errors.password
                        ? 'border-green-300 focus:border-green-500 focus:ring-green-500/20'
                        : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500/20'
                  }`}
                  placeholder="Enter your password"
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  aria-invalid={!!errors.password}
                />
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center hover:bg-gray-50 rounded-r-xl transition-colors duration-200"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                  ) : (
                    <Eye className="w-5 h-5 text-gray-400 hover:text-gray-600" />
                  )}
                </button>
              </div>
              <AnimatePresence>
                {errors.password && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    id="password-error"
                    className="text-sm text-red-600 flex items-center gap-1"
                    role="alert"
                  >
                    <AlertCircle className="w-4 h-4" />
                    {errors.password}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Trust Device */}
            <div className="space-y-3">
              <div className="flex items-start cursor-pointer group">
                <input
                  type="checkbox"
                  checked={trustDevice}
                  onChange={(e) => handleTrustDeviceChange(e.target.checked)}
                  className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2 transition-all duration-200 mt-0.5"
                />
                <div className="ml-2">
                  <div className="flex items-center gap-1">
                    <Shield className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-800 transition-colors duration-200">
                      Trust this device
                    </span>
                  </div>
                </div>
              </div>
              
              {requestingLocation && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="ml-6 mt-2"
                >
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                    <span className="text-sm text-gray-600">
                      Requesting location permission...
                    </span>
                  </div>
                </motion.div>
              )}

            </div>

            {/* Submit Button */}
            <motion.button
              whileHover={{ scale: isFormValid && !loading ? 1.02 : 1 }}
              whileTap={{ scale: isFormValid && !loading ? 0.98 : 1 }}
              type="submit"
              disabled={!isFormValid || loading}
              className={`w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                isFormValid && !loading
                  ? 'text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:ring-blue-500 shadow-blue-500/25'
                  : 'text-gray-400 bg-gray-100 cursor-not-allowed'
              }`}
            >
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center"
                  >
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Signing in...
                  </motion.div>
                ) : (
                  <motion.div
                    key="sign-in"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center"
                  >
                    Sign in
                    <LogIn className="w-4 h-4 ml-2" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>

            {/* Footer */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="text-center pt-4 border-t border-gray-100"
            >
              <p className="text-sm text-gray-600">
                Need an account?{' '}
                <button
                  type="button"
                  className="text-blue-600 hover:text-blue-800 font-medium transition-colors duration-200 focus:outline-none focus:underline"
                  onClick={() => toast.info('Please contact an administrator to create a new account')}
                >
                  Contact administrator
                </button>
              </p>
            </motion.div>
          </motion.form>
        </div>

        {/* Security Notice */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          className="mt-6 text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-xl">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-sm text-green-700 font-medium">Secure connection</span>
          </div>
        </motion.div>
      </motion.div>

      {/* Location Permission Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
          >
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <MapPin className="h-6 w-6 text-red-600" />
              </div>
              
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Device Trust Failed
              </h3>
              
              <p className="text-sm text-gray-600 mb-6">
                Unable to trust this device. This could be due to location permission issues or system limitations. You can still login without trusting the device.
              </p>
              
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-yellow-800 mb-1">
                      Possible solutions:
                    </p>
                    <ol className="text-xs text-yellow-700 space-y-1">
                      <li>1. Check if location permission is allowed in browser settings</li>
                      <li>2. Try refreshing the page and logging in again</li>
                    </ol>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowLocationModal(false);
                    setTrustDevice(false);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Skip Trust Device
                </button>
                <button
                  onClick={() => {
                    setShowLocationModal(false);
                    // Try location permission again
                    handleTrustDeviceChange(true);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  Try Again
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}