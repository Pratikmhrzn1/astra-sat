import { classes } from '@/shared/lib/utils';

/**
 * The form-field recipes.
 *
 * Pages build their own forms with react-hook-form's `register`, so they need
 * the look without the `<Input>` wrapper component. Error is carried by the
 * border colour and by the message under the field, never by colour alone.
 */

/** Tall auth-page field (login, register, password reset). */
export const fieldStyle = (hasError = false, className?: string): string => classes(
  'w-full h-[46px] px-[15px] border rounded-xl text-[15px] bg-white outline-none',
  hasError ? 'border-error-field' : 'border-field',
  className,
);

/** In-app field: settings, modals, teacher and admin forms. */
export const fieldInputStyle = (hasError = false, className?: string): string => classes(
  'w-full px-[13px] py-[11px] border rounded-xl text-[15px] leading-[1.45] bg-white outline-none',
  hasError ? 'border-error-field' : 'border-border',
  className,
);

export const fieldCaptionStyle = 'block text-[13px] font-semibold text-body mb-[7px]';

export const errorTextStyle = 'mt-1 text-xs text-error-field';

export const hintTextStyle = 'mt-1 text-xs text-muted';

/** Inline error block above a form's submit button. */
export const alertStyle = 'bg-danger/[.08] text-danger text-[13px] px-3.5 py-2.5 rounded-[10px]';

/** Two-to-four option segmented control (a radiogroup of buttons). */
export const segmentClusterClass = 'flex gap-0.5 p-0.5 rounded-[10px] bg-ink/[.06]';
export const segmentStyle = (selected: boolean): string => classes(
  'flex-1 h-8 rounded-lg text-[13px] text-ink cursor-pointer',
  selected
    ? 'bg-white font-semibold shadow-[0_1px_3px_rgba(11,11,14,0.12),0_0_0_0.5px_rgba(11,11,14,0.04)]'
    : 'bg-transparent font-medium',
);
