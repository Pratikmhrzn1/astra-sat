import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Rich-text editing for question and passage content.
 *
 * Questions need underlining — SAT items routinely underline the phrase under
 * test — so these fields are contenteditable and store HTML rather than plain
 * text. The value syncs into the DOM only while the field is not being typed
 * in, because writing innerHTML under the caret would move it to the start on
 * every keystroke.
 */

export function UnderlineBtn({ onApply }: { onApply: () => void }) {
  return (
    <button
      type="button"
      title="Underline selected text"
      onMouseDown={(e) => { e.preventDefault(); onApply(); }}
      className="inline-flex items-center gap-[5px] px-2.5 py-[3px] text-xs font-bold border border-border rounded-md bg-sunken text-ink cursor-pointer"
    >
      <span className="underline">U</span>
      <span className="text-[10px] font-normal text-muted">Underline</span>
    </button>
  );
}

// Rich text field (contenteditable) — supports underline formatting

export const RichTextArea = React.forwardRef<HTMLDivElement, {
  label?: string;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  rows?: number;
  onFocus?: () => void;
  error?: string;
}>(({ label, value, onChange, placeholder, rows = 3, onFocus, error }, ref) => {
  const innerRef = React.useRef<HTMLDivElement>(null);
  React.useImperativeHandle(ref, () => innerRef.current!);
  const editing = React.useRef(false);

  // Sync external value → innerHTML only when not actively typing
  React.useEffect(() => {
    const el = innerRef.current;
    if (!el || editing.current) return;
    if (el.innerHTML !== value) el.innerHTML = value;
  }, [value]);

  const minH = rows * 28;

  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[13px] font-semibold text-body">{label}</label>}
      <div className="relative">
        {!value && placeholder && (
          <div className="absolute top-3 left-[15px] right-[15px] text-muted text-[15px] pointer-events-none select-none leading-[1.6]">
            {placeholder}
          </div>
        )}
        <div
          ref={innerRef}
          contentEditable
          suppressContentEditableWarning
          onFocus={() => {
            editing.current = true;
            onFocus?.();
          }}
          onBlur={() => {
            editing.current = false;
          }}
          onInput={() => {
            if (innerRef.current) onChange(innerRef.current.innerHTML);
          }}
          className={cn(
            'px-[15px] py-3 border rounded-xl text-[15px] bg-white text-ink outline-none leading-[1.6] overflow-y-auto break-words whitespace-pre-wrap',
            'transition-[border-color,box-shadow] duration-150 focus:border-ember focus:shadow-[0_0_0_3px_rgba(226,86,43,0.18)]',
            error ? 'border-error-field' : 'border-field',
          )}
          // Height follows the `rows` prop.
          style={{ minHeight: minH }}
        />
      </div>
      {error && <p className="text-xs text-error-field">{error}</p>}
    </div>
  );
});
RichTextArea.displayName = 'RichTextArea';
