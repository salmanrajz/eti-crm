import { LucideIcon } from 'lucide-react';

interface FormSectionProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function FormSection({ icon: Icon, title, description, children }: FormSectionProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-2 sm:p-4 md:p-6 border-b border-gray-100">
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
      </div>
      <div className="p-2 sm:p-4 md:p-6">
        <div className="grid grid-cols-1 gap-2 sm:gap-4 md:gap-6 lg:grid-cols-2">
        {children}
        </div>
      </div>
    </div>
  );
}