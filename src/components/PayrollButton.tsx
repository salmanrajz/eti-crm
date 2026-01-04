/**
 * ===============================================================================
 * PAYROLL BUTTON COMPONENT - PAYROLL SYSTEM ACCESS BUTTON
 * ===============================================================================
 * 
 * This component provides a styled button for accessing the payroll system,
 * with role-based visibility and smooth integration with the PayrollSystem modal.
 * 
 * FEATURES:
 * 
 * 1. ROLE-BASED VISIBILITY
 *    - Only visible for admin and manager roles
 *    - Hidden from agent view for appropriate access control
 * 
 * 2. MODERN UI DESIGN
 *    - Gradient styling with hover effects
 *    - Smooth animations and transitions
 *    - Professional appearance with proper spacing
 * 
 * 3. MODAL INTEGRATION
 *    - Seamless integration with PayrollSystem component
 *    - Proper state management for modal opening/closing
 *    - User context passing for role-specific functionality
 * 
 * USAGE:
 * This component is used in dashboard interfaces to provide
 * access to payroll system functionality for authorized users.
 * ===============================================================================
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { DollarSign } from 'lucide-react';
import { User } from '../types';
import PayrollSystem from './PayrollSystem';

interface PayrollButtonProps {
  role: 'admin' | 'manager' | 'agent';
  user: User;
}

export default function PayrollButton({ role, user }: PayrollButtonProps) {
  const [isPayrollOpen, setIsPayrollOpen] = useState(false);

  // Only show payroll button for admin and manager roles
  if (role === 'agent') {
    return null;
  }

  return (
    <>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsPayrollOpen(true)}
        className="group relative inline-flex items-center gap-1.5 sm:gap-3 px-2 py-1 sm:px-6 sm:py-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-2xl font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-300 border-0 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <div className="relative flex items-center gap-1.5 sm:gap-3">
            <div className="p-0.5 sm:p-1.5 bg-white/20 rounded sm:rounded-lg backdrop-blur-sm">
              <DollarSign className="h-2.5 w-2.5 sm:h-5 sm:w-5" />
            </div>
          <span className="text-xs sm:text-sm font-semibold">Payroll System</span>
          </div>
      </motion.button>
<PayrollSystem
        open={isPayrollOpen}
        onClose={() => setIsPayrollOpen(false)}
        role={role}
        user={user}
      />
    </>
  );
} 