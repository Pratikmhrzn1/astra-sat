import { useState } from 'react';
import { MistakeBankList } from '@/features/mistakes/components/MistakeBankList';
import { MistakeDna } from '@/features/mistakes/components/MistakeDna';
import { PageHeader, pageClass, segmentClass, segmentGroupClass } from '@/shared/ui';
import { cn } from '@/shared/lib/utils';

/**
 * The mistake bank, under two readings of the same data.
 *
 * "Bank" is the worklist — every question missed, grouped by domain, with the
 * button that turns a slice of it into a real exam. "DNA" is the diagnosis —
 * accuracy per domain, where the open mistakes sit, and what was picked instead
 * of the right answer.
 *
 * Both tabs stay mounted-on-demand rather than sharing state: each owns its own
 * queries, and the query cache is what keeps switching between them cheap.
 */

const TABS = [
  { key: 'bank', label: 'Bank' },
  { key: 'dna', label: 'DNA' },
] as const;

type Tab = (typeof TABS)[number]['key'];

export default function Mistakes() {
  const [tab, setTab] = useState<Tab>('bank');

  return (
    <div className={pageClass}>
      <PageHeader
        title="Mistake Bank"
        subtitle="Every question you've missed, worst first. Answer one correctly and it clears itself."
      />

      <div role="tablist" aria-label="Mistake bank view" className={cn(segmentGroupClass, 'max-w-[240px] mb-[18px]')}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            id={`mistakes-tab-${key}`}
            role="tab"
            aria-selected={tab === key}
            aria-controls={`mistakes-panel-${key}`}
            onClick={() => setTab(key)}
            className={segmentClass(tab === key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div id={`mistakes-panel-${tab}`} role="tabpanel" aria-labelledby={`mistakes-tab-${tab}`}>
        {tab === 'bank' ? <MistakeBankList /> : <MistakeDna />}
      </div>
    </div>
  );
}
