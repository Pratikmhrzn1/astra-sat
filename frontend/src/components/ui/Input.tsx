import React from 'react';
import { cn } from '../../lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-[13px] font-semibold text-ink/70">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          {...props}
          className={cn(
            'w-full h-[46px] px-[15px] border rounded-xl text-[15px] bg-white text-ink placeholder-ink/30 outline-none transition-colors focus:ring-2 focus:ring-ember/30',
            error ? 'border-red-400 focus:ring-red-300' : 'border-border focus:border-ember',
            className
          )}
        />
        {hint && !error && <p className="text-xs text-ink/40">{hint}</p>}
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-[13px] font-semibold text-ink/70">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          {...props}
          className={cn(
            'w-full px-[15px] py-3 border rounded-xl text-[15px] bg-white text-ink placeholder-ink/30 outline-none transition-colors focus:ring-2 focus:ring-ember/30 resize-vertical min-h-[80px]',
            error ? 'border-red-400' : 'border-border focus:border-ember',
            className
          )}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  children?: React.ReactNode;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className, id, children, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-[13px] font-semibold text-ink/70">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          {...props}
          className={cn(
            'w-full h-[46px] px-[15px] border rounded-xl text-[15px] bg-white text-ink outline-none transition-colors focus:ring-2 focus:ring-ember/30 cursor-pointer',
            error ? 'border-red-400' : 'border-border focus:border-ember',
            className
          )}
        >
          {children ?? options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';
