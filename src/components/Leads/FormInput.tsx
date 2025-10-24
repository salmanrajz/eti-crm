import { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon: LucideIcon;
  error?: string;
  hint?: string;
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