/**
 * ===============================================================================
 * FORM SELECT COMPONENT - REUSABLE DROPDOWN SELECT WITH ICON AND VALIDATION
 * ===============================================================================
 * 
 * This component provides a reusable select dropdown with consistent styling,
 * icon support, and error handling for form interfaces throughout the CRM.
 * It ensures consistent user experience and validation feedback.
 * 
 * FEATURES:
 * 
 * 1. CONSISTENT SELECT STYLING
 *    - Standardized dropdown styling with Tailwind CSS
 *    - Icon integration with proper positioning and sizing
 *    - Custom dropdown arrow with consistent appearance
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
 * dropdown select styling and behavior across all lead management forms.
 * ===============================================================================
 */

import { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';

/**
 * Option interface for select dropdown options
 */
interface Option {
  value: string;
  label: string;
}

/**
 * Props interface for the FormSelect component
 */
interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;        // Select field label
  icon: LucideIcon;     // Icon component to display
  options: Option[];    // Array of select options
  error?: string;       // Error message to display
  hint?: string;        // Hint text for additional guidance
}

export function FormSelect({ label, icon: Icon, options, error, hint, className, ...props }: FormSelectProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={props.id} className="block text-sm font-medium text-gray-700">
        {label} {props.required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Icon className="h-5 w-5 text-gray-400" />
        </div>
        <select
          className={clsx(
            'block w-full pl-10 pr-3 py-2 border rounded-lg shadow-sm focus:ring-2 focus:ring-offset-0 focus:outline-none transition-colors appearance-none bg-white',
            error 
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500' 
              : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500',
            props.disabled && 'bg-gray-100 cursor-not-allowed opacity-60',
            className
          )}
          {...props}
        >
          {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
      {error && (
        <p className="text-sm text-red-600 flex items-center space-x-1">
          <Icon className="h-4 w-4" />
          <span>{error}</span>
        </p>
      )}
      {hint && <p className="text-sm text-gray-500">{hint}</p>}
    </div>
  );
}