import { useQuery } from '@tanstack/react-query';
import { getMistakes, getMistakeSummary, type Mistake } from '@/features/mistakes/api';
import { getAnalytics, type DomainAccuracy } from '@/features/progress';
import { getSkills, skillsQueryKey, type SkillNode } from '@/entities/skill';
import {
  InlineLoader, PieChart, RadarChart, surfaceClass, type PieSlice, type RadarAxis,
} from '@/shared/ui';
import { cn, formatDate } from '@/shared/lib/utils';

/**
 * The diagnostic half of the mistake bank: not "what should I redo" — the list
 * next door answers that — but "what am I actually bad at, and what did I pick
 * instead?".
 *
 * Everything here is a different reading of data the app already had. The two
 * radars come from the analytics overview, the pie from the mistake summary,
 * and the recent list from the bank itself. No endpoint was added for this.
 *
 * All three work at **domain** level, and deliberately so: the taxonomy has
 * eight domains but only five leaf skills, all of them English. A skill-level
 * chart would be a chart of Reading & Writing with Math missing.
 */

/**
 * The full domain names do not fit around a four-spoke diamond — "Problem-
 * Solving and Data Analysis" is 32 characters and lands on the horizontal
 * spoke. Shortened for the radar only; the pie legend keeps the real names.
 */
const RADAR_LABELS: Record<string, string> = {
  information_and_ideas: 'Information & Ideas',
  craft_and_structure: 'Craft & Structure',
  expression_of_ideas: 'Expression of Ideas',
  standard_english_conventions: 'Conventions',
  algebra: 'Algebra',
  advanced_math: 'Advanced Math',
  problem_solving_data_analysis: 'Problem-Solving & Data',
  geometry_trigonometry: 'Geometry & Trig',
};

/**
 * Green for Reading & Writing, blue for Math — the subject identity used by the
 * trend chart and the progress panels — shading down within each section so a
 * slice's section is readable before its label is.
 */
const ENGLISH_SHADES = ['#1A6B3C', '#2E7D5A', '#4E9B77', '#84BFA2'];
const MATH_SHADES = ['#2563A8', '#3E7FC4', '#6BA0D8', '#9CC0E8'];
const UNTAGGED_SHADE = '#B5B1A9';

const SECTION_LABEL = { english: 'Reading & Writing', math: 'Math' } as const;

/** Stable per domain, so a domain keeps its colour however the slices reorder. */
function domainColors(tree: SkillNode[]): Map<string, string> {
  const colors = new Map<string, string>();
  for (const subject of ['english', 'math'] as const) {
    const shades = subject === 'english' ? ENGLISH_SHADES : MATH_SHADES;
    tree
      .filter((node) => node.subject === subject)
      .forEach((node, i) => colors.set(node.code, shades[i % shades.length]));
  }
  return colors;
}

function toAxes(domains: SkillNode[], accuracy: Map<string, DomainAccuracy>, minAttempts: number): RadarAxis[] {
  return domains.map((domain) => {
    const row = accuracy.get(domain.code);
    // Below the server's threshold a percentage swings too far on one question,
    // so it is reported as absent rather than as a number. The radar draws that
    // as a gap; plotting it at zero would read as "you are bad at this".
    const enough = row && row.attempted >= minAttempts;
    return {
      code: domain.code,
      label: RADAR_LABELS[domain.code] ?? domain.label,
      value: enough ? row.accuracy : null,
      caption: !row
        ? 'not attempted'
        : enough
          ? `${row.correct}/${row.attempted}`
          : `${row.attempted} q — too few`,
    };
  });
}

function RadarCard({
  title,
  axes,
  color,
  hasData,
}: {
  title: string;
  axes: RadarAxis[];
  color: string;
  hasData: boolean;
}) {
  return (
    <div className={cn(surfaceClass, 'px-5 py-[18px] sm:px-6 sm:py-5')}>
      <div className="flex items-center gap-2 mb-1">
        <span aria-hidden className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
        <h2 className="text-[15px] font-semibold text-ink m-0">{title}</h2>
      </div>
      <p className="text-[12.5px] text-muted mt-0 mb-2">Accuracy by domain — a fuller shape is better.</p>
      {hasData ? (
        <RadarChart axes={axes} color={color} />
      ) : (
        /*
          Deliberately does not say "take an exam and this fills in". A section
          can be empty for two reasons — nothing practised, or none of its
          questions tagged to a domain yet — and only one of those is something
          the student can act on. Promising the wrong one is worse than saying
          less.
        */
        <p className="text-[13px] text-muted py-10 text-center m-0 leading-[1.6]">
          No domain-level results here yet.
          <br />
          <span className="text-[12px]">Results appear once you've answered questions tagged to these domains.</span>
        </p>
      )}
    </div>
  );
}

/** One recent miss: what was asked, what was picked, what was right. */
function RecentMistake({ mistake, color }: { mistake: Mistake; color: string }) {
  const optionText = (key: 'a' | 'b' | 'c' | 'd' | null) =>
    key ? (mistake[`option${key.toUpperCase()}` as 'optionA'] ?? '') : '';

  const isChoice = mistake.questionType === 'multiple_choice';
  const chosen = isChoice
    ? mistake.selectedAnswer && `${mistake.selectedAnswer.toUpperCase()}) ${optionText(mistake.selectedAnswer)}`
    : mistake.selectedAnswerText;
  const correct = isChoice
    ? mistake.correctAnswer && `${mistake.correctAnswer.toUpperCase()}) ${optionText(mistake.correctAnswer)}`
    : mistake.correctAnswerText;

  return (
    <div className="rounded-xl bg-[#FBFAF8] border border-border-soft px-4 py-3.5">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        {mistake.domainCode && (
          <span
            className="px-2.5 py-[3px] rounded-full text-[11px] font-bold tracking-[0.04em] uppercase text-white"
            style={{ background: color }}
          >
            {mistake.skillLabel ?? SECTION_LABEL[mistake.subject]}
          </span>
        )}
        <span className="px-2.5 py-[3px] rounded-full text-[11px] font-bold tracking-[0.04em] uppercase bg-ink/[.06] text-stone">
          {SECTION_LABEL[mistake.subject]}
        </span>
        {mistake.missCount > 1 && (
          <span className="text-[11px] font-bold text-danger">missed ×{mistake.missCount}</span>
        )}
        <span className="text-[11.5px] text-muted ml-auto">{formatDate(mistake.lastMissedAt)}</span>
      </div>

      <p className="text-[13.5px] text-ink leading-[1.55] mt-0 mb-2.5 line-clamp-2">{mistake.questionText}</p>

      {/*
        The struck line is only drawn when there is genuinely a wrong answer to
        strike. A blank counts as a miss, and "you skipped this" is a different
        thing to say than crossing out an answer nobody gave.
      */}
      {chosen ? (
        <p className="text-[13.5px] text-danger line-through decoration-danger/60 m-0">
          You {isChoice ? 'chose' : 'wrote'}: {chosen}
        </p>
      ) : (
        <p className="text-[13.5px] text-muted italic m-0">You skipped this one.</p>
      )}
      {correct && (
        <p className="text-[13.5px] text-green-dark font-semibold mt-0.5 mb-0">→ Correct: {correct}</p>
      )}
    </div>
  );
}

export function MistakeDna() {
  const { data: overview, isLoading: analyticsLoading } = useQuery({
    queryKey: ['student', 'analytics'],
    queryFn: getAnalytics,
  });
  const { data: summary = [], isLoading: summaryLoading } = useQuery({
    queryKey: ['student', 'mistakes', 'summary'],
    queryFn: getMistakeSummary,
  });
  const { data: openMistakes = [], isLoading: mistakesLoading } = useQuery({
    queryKey: ['student', 'mistakes', { status: 'open' }],
    queryFn: () => getMistakes({ status: 'open' }),
  });
  const { data: skillTree = [] } = useQuery({
    queryKey: skillsQueryKey(),
    queryFn: () => getSkills(),
    staleTime: 60 * 60 * 1000,
  });

  if (analyticsLoading || summaryLoading || mistakesLoading) return <InlineLoader />;

  const colors = domainColors(skillTree);
  const accuracy = new Map((overview?.domains ?? []).map((row) => [row.domainCode, row]));
  const minAttempts = overview?.minAttempts ?? 5;

  const englishDomains = skillTree.filter((node) => node.subject === 'english');
  const mathDomains = skillTree.filter((node) => node.subject === 'math');
  const attempted = (domains: SkillNode[]) => domains.some((d) => accuracy.has(d.code));

  // Biggest slice first, but each domain keeps its own colour.
  const slices: PieSlice[] = [...summary]
    .sort((a, b) => b.openCount - a.openCount)
    .map((row) => ({
      code: row.domainCode ?? 'untagged',
      label: row.domainCode
        ? (skillTree.find((n) => n.code === row.domainCode)?.label ?? row.domainCode)
        : 'Untagged',
      value: row.openCount,
      color: row.domainCode ? (colors.get(row.domainCode) ?? UNTAGGED_SHADE) : UNTAGGED_SHADE,
    }));

  // The bank is ordered worst-first; "recent" wants the other axis.
  const recent = [...openMistakes]
    .sort((a, b) => b.lastMissedAt.localeCompare(a.lastMissedAt))
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <RadarCard
          title="Reading & Writing"
          axes={toAxes(englishDomains, accuracy, minAttempts)}
          color="#1A6B3C"
          hasData={attempted(englishDomains)}
        />
        <RadarCard
          title="Math"
          axes={toAxes(mathDomains, accuracy, minAttempts)}
          color="#2563A8"
          hasData={attempted(mathDomains)}
        />
      </div>

      <div className={cn(surfaceClass, 'px-5 py-[18px] sm:px-6 sm:py-5')}>
        <h2 className="text-[15px] font-semibold text-ink mt-0 mb-1">Mistakes by domain</h2>
        <p className="text-[12.5px] text-muted mt-0 mb-4">Where your open mistakes are sitting right now.</p>
        {slices.length > 0 ? (
          <PieChart slices={slices} />
        ) : (
          <p className="text-[13px] text-muted py-6 text-center m-0">
            No open mistakes. Nothing to chart — nice.
          </p>
        )}
      </div>

      <div className={cn(surfaceClass, 'px-5 py-[18px] sm:px-6 sm:py-5')}>
        <h2 className="text-[15px] font-semibold text-ink mt-0 mb-1">Recent mistakes</h2>
        <p className="text-[12.5px] text-muted mt-0 mb-4">The last eight you missed, and what you picked instead.</p>
        {recent.length > 0 ? (
          <div className="flex flex-col gap-2.5">
            {recent.map((mistake) => (
              <RecentMistake
                key={mistake.questionId}
                mistake={mistake}
                color={(mistake.domainCode && colors.get(mistake.domainCode)) || UNTAGGED_SHADE}
              />
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted py-6 text-center m-0">
            Questions you miss land here automatically.
          </p>
        )}
      </div>
    </div>
  );
}
