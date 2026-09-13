import React from 'react';

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
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 10px', fontSize: 12, fontWeight: 700,
        border: '1px solid #E7E4DE', borderRadius: 6,
        background: '#F2F0EC', color: '#0B0B0E', cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      <span style={{ textDecoration: 'underline' }}>U</span>
      <span style={{ fontSize: 10, fontWeight: 400, color: 'rgba(11,11,14,0.58)' }}>Underline</span>
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
  const borderColor = error ? '#ef4444' : '#C8C4BC';

  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-[13px] font-semibold text-ink/70">{label}</label>}
      <div style={{ position: 'relative' }}>
        {!value && placeholder && (
          <div style={{ position: 'absolute', top: 12, left: 15, right: 15, color: 'rgba(11,11,14,0.58)', fontSize: 15, pointerEvents: 'none', userSelect: 'none', lineHeight: 1.6 }}>
            {placeholder}
          </div>
        )}
        <div
          ref={innerRef}
          contentEditable
          suppressContentEditableWarning
          onFocus={(e) => {
            editing.current = true;
            e.currentTarget.style.borderColor = '#E2562B';
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(226,86,43,0.18)';
            onFocus?.();
          }}
          onBlur={(e) => {
            editing.current = false;
            e.currentTarget.style.borderColor = borderColor;
            e.currentTarget.style.boxShadow = 'none';
          }}
          onInput={() => {
            if (innerRef.current) onChange(innerRef.current.innerHTML);
          }}
          style={{
            minHeight: minH,
            padding: '12px 15px',
            border: `1px solid ${borderColor}`,
            borderRadius: '0.75rem',
            fontSize: 15,
            background: '#fff',
            color: '#0B0B0E',
            outline: 'none',
            lineHeight: 1.6,
            overflowY: 'auto',
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
});
RichTextArea.displayName = 'RichTextArea';
