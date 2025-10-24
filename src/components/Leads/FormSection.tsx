/**
 * ===============================================================================
 * FORM SECTION COMPONENT - FORMATTED FORM SECTION CONTAINER
 * ===============================================================================
 * 
 * This component provides a consistent container for organizing form sections
 * with headers, icons, and content areas. It ensures uniform styling and
 * layout across all form interfaces in the CRM system.
 * 
 * FEATURES:
 * 
 * 1. CONSISTENT SECTION LAYOUT
 *    - Standardized section header with icon and title
 *    - Optional description text for section guidance
 *    - Grid-based content layout for organized form fields
 * 
 * 2. FLEXIBLE CONTENT AREA
 *    - Support for any React children content
 *    - Responsive grid layout (single column on mobile, two columns on larger screens)
 *    - Optional right-side element for additional controls
 * 
 * 3. VISUAL DESIGN
 *    - Clean card-style design with subtle borders and shadows
 *    - Icon integration with consistent color scheme
 *    - Responsive padding and spacing adjustments
 * 
 * USAGE:
 * This component is used throughout form interfaces to organize related fields
 * into logical sections with consistent visual hierarchy and spacing.
 * ===============================================================================
 */

import { LucideIcon } from 'lucide-react';

/**
 * Props interface for the FormSection component
 */
interface FormSectionProps {
  icon: LucideIcon;              // Icon component to display in header
  title: string;                 // Section title text
  description?: string;          // Optional description text
  children: React.ReactNode;     // Section content
  rightElement?: React.ReactNode; // Optional right-side element (e.g., toggle buttons)
}

export function FormSection({ icon: Icon, title, description, children, rightElement }: FormSectionProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-2 sm:p-4 md:p-6 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="p-2 rounded-lg bg-indigo-50">
              <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900">{title}</h2>
              {description && (
                <p className="mt-1 text-xs sm:text-sm text-gray-500">{description}</p>
              )}
            </div>
          </div>
          {rightElement && (
            <div className="flex-shrink-0">
              {rightElement}
            </div>
          )}
        </div>
      </div>
      <div className="p-2 sm:p-4 md:p-6">
        <div className="grid grid-cols-1 gap-2 sm:gap-4 md:gap-6 lg:grid-cols-2">
        {children}
        </div>
      </div>
    </div>
  );
}