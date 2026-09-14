import { useCallback, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { createPassage, type Passage } from '@/api/teacher';
import { getApiError } from '@/api/http';
import { Button, Input, iconButtonClass, surfaceClass } from '@/components/common';
import { RichTextArea, UnderlineBtn } from '@/components/teacher/RichTextArea';
import { cn } from '@/lib/utils';

/** Add a reading passage, and list the ones this set already has. */
export function PassagesTab({ setId, passages, onDelete }: { setId: string; passages: Passage[]; onDelete: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [passageTitle, setPassageTitle] = useState('');
  const [passageText, setPassageText] = useState('');
  const [passageError, setPassageError] = useState('');
  const passageDivRef = useRef<HTMLDivElement | null>(null);

  const handlePassageUnderline = useCallback(() => {
    const el = passageDivRef.current;
    if (!el) return;
    document.execCommand('underline', false);
    setPassageText(el.innerHTML);
  }, []);

  const createPassageMutation = useMutation({
    mutationFn: () => {
      const pText = passageDivRef.current?.innerHTML ?? passageText;
      return createPassage(setId, { title: passageTitle.trim(), passageText: pText, orderIndex: passages.length });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teacher', 'passages', setId] });
      setPassageTitle(''); setPassageText(''); setPassageError('');
    },
    onError: (err) => setPassageError(getApiError(err)),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className={cn(surfaceClass, 'overflow-hidden')}>
        <div className="px-6 py-4 border-b border-border-soft">
          <h3 className="text-[15px] font-semibold text-ink m-0">Add Passage</h3>
          <p className="text-[12.5px] text-muted mt-[3px] mb-0">A passage can be shared by multiple questions in this set.</p>
        </div>
        <div className="px-6 py-5 flex flex-col gap-3.5">
          <Input label="Passage title (optional)" value={passageTitle} onChange={(e) => setPassageTitle(e.target.value)} placeholder="e.g. The following passage is adapted from a 2022 scientific article…" />
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <UnderlineBtn onApply={handlePassageUnderline} />
              <span className="text-[11px] text-muted">Select text in the passage, then click</span>
            </div>
            <RichTextArea label="Passage text" value={passageText} onChange={(html) => setPassageText(html)} placeholder="Paste or type the reading passage here…" rows={8} ref={passageDivRef} />
          </div>
          {passageError && <p className="text-danger text-[13px]">{passageError}</p>}
          <Button onClick={() => { setPassageError(''); createPassageMutation.mutate(); }} loading={createPassageMutation.isPending} disabled={!passageText.trim()} className="self-start">
            <Plus size={15} className="mr-1.5" />Save Passage
          </Button>
        </div>
      </div>

      {passages.length > 0 && (
        <div className={cn(surfaceClass, 'overflow-hidden')}>
          <div className="px-[22px] py-3.5 border-b border-border-soft">
            <h3 className="text-sm font-semibold text-ink m-0">Saved Passages ({passages.length})</h3>
          </div>
          {passages.map((p) => (
            <div key={p.id} className="px-[22px] py-4 border-b border-sunken last:border-b-0 flex gap-3.5">
              <FileText size={16} className="text-gold shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                {p.title && <p className="text-[13px] font-semibold text-ink mt-0 mb-1">{p.title}</p>}
                <p className="text-[13px] text-ink/60 m-0 leading-normal line-clamp-3">{p.passageText}</p>
              </div>
              <button onClick={() => onDelete(p.id)} className={iconButtonClass('danger', 'p-1.5 shrink-0')}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
