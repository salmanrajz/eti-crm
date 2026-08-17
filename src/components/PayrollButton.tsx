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
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-sky-200/55 bg-sky-50/35 px-3 text-xs font-semibold text-sky-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_8px_20px_rgba(15,23,42,0.06)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-300/70 hover:bg-sky-50/55 hover:shadow-md"
        >
          <div className="flex items-center gap-1.5">
            <div className="rounded-full bg-sky-500 p-1 text-white shadow-sm">
              <DollarSign className="h-3.5 w-3.5" />
            </div>
          <span>Payroll System</span>
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
