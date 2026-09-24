import React from 'react';
import { classes } from '@/shared/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Field = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-[13px] font-medium tracking-[-0.003em] text-ink/70">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          {...props}
          className={classes(
            'w-full h-11 px-3.5 border rounded-xl text-[15px] bg-white text-ink placeholder-ink/30 outline-none transition-[border-color,box-shadow] duration-150 focus:ring-4 focus:ring-ember/15',
            error ? 'border-red-400 focus:ring-red-300' : 'border-border focus:border-ember',
            className
          )}
        />
        {hint && !error && <p className="text-xs text-ink/60">{hint}</p>}
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);
Field.displayName = 'Input';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const TextField = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-[13px] font-medium tracking-[-0.003em] text-ink/70">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          {...props}
          className={classes(
            'w-full px-3.5 py-3 border rounded-xl text-[15px] bg-white text-ink placeholder-ink/30 outline-none transition-[border-color,box-shadow] duration-150 focus:ring-4 focus:ring-ember/15 resize-vertical min-h-[80px]',
            error ? 'border-red-400' : 'border-border focus:border-ember',
            className
          )}
        />
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);
TextField.displayName = 'Textarea';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  children?: React.ReactNode;
}

export const Chooser = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className, id, children, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-[13px] font-medium tracking-[-0.003em] text-ink/70">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={inputId}
          {...props}
          className={classes(
            'w-full h-11 px-3.5 border rounded-xl text-[15px] bg-white text-ink outline-none transition-[border-color,box-shadow] duration-150 focus:ring-4 focus:ring-ember/15 cursor-pointer',
            error ? 'border-red-400' : 'border-border focus:border-ember',
            className
          )}
        >
          {children ?? options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }
);
Chooser.displayName = 'Select';
