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
        className="group relative inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-2xl font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-300 border-0 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          <div className="relative flex items-center gap-3">
            <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-sm">
              <DollarSign className="h-5 w-5" />
            </div>
          <span className="text-sm font-semibold">Payroll System</span>
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