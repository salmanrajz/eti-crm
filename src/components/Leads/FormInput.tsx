/**
 * ===============================================================================
 * FORM INPUT COMPONENT - REUSABLE INPUT FIELD WITH ICON AND VALIDATION
 * ===============================================================================
 * 
 * This component provides a reusable input field with consistent styling,
 * icon support, and error handling for form interfaces throughout the CRM.
 * It ensures consistent user experience and validation feedback.
 * 
 * FEATURES:
 * 
 * 1. CONSISTENT STYLING AND LAYOUT
 *    - Standardized input field styling with Tailwind CSS
 *    - Icon integration with proper positioning and sizing
 *    - Responsive design for mobile and desktop interfaces
 * 
 * 2. VALIDATION AND ERROR HANDLING
 *    - Error state styling with visual feedback
 *    - Error message display with icon integration
 *    - Hint text support for additional guidance
 * 
 * 3. ACCESSIBILITY AND UX
 *    - Proper label association and semantic HTML
 *    - Required field indicators with visual markers
 *    - Focus states and transition animations
 * 
 * USAGE:
 * This component is used throughout form interfaces to provide consistent
 * input field styling and behavior across all lead management forms.
 * ===============================================================================
 */

import { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';

/**
 * Props interface for the FormInput component
 */
interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;        // Input field label
  icon: LucideIcon;     // Icon component to display
  error?: string;       // Error message to display
  hint?: string;        // Hint text for additional guidance
}

export function FormInput({ label, icon: Icon, error, hint, className, ...props }: FormInputProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={props.id} className="block text-sm font-medium text-gray-700">
        {label} {props.required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
        </div>
        <input
          className={clsx(
            'block w-full pl-10 pr-3 py-2.5 sm:py-2 border rounded-lg shadow-sm focus:ring-2 focus:ring-offset-0 focus:outline-none transition-colors text-sm sm:text-base',
            error 
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
              : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500',
            props.disabled && 'bg-gray-100 cursor-not-allowed opacity-60',
            className
          )}
          {...props}
        />
      </div>
      {error && (
        <p className="text-xs sm:text-sm text-red-600 flex items-center space-x-1">
          <Icon className="h-3 w-3 sm:h-4 sm:w-4" />
          <span>{error}</span>
        </p>
      )}
      {hint && <p className="text-xs sm:text-sm text-gray-500">{hint}</p>}
    </div>
  );
}