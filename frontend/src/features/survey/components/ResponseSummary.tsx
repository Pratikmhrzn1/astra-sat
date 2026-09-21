import { useEffect, useState } from 'react';
import {
  SCALE_MAX, SCALE_MIN,
  type AdminSurveyQuestion, type SurveyAnswer, type SurveyRespondent,
} from '@/features/survey/api';
import { TYPE_LABELS } from '@/features/survey/components/QuestionEditor';
import { surfaceClass } from '@/shared/ui';
import { cn } from '@/shared/lib/utils';

/**
 * What the survey actually said, per question, rather than per student.
 *
 * The per-respondent list answers "what did this person say"; with more than a
 * handful of students that is the wrong question to have to ask first. This is
 * the reading an admin wants from a survey — the distribution — and it is
 * derived on the client from the two lists already loaded, so it costs no
 * endpoint and cannot drift from what the other tab shows.
 */

/** One answer rendered as text, for lists and CSV-ish reading. */
export function answerText(answer: SurveyAnswer, type?: string): string {
  if (Array.isArray(answer)) return answer.join(', ');
  // A bare "3" is unreadable without its ceiling.
  if (type === 'scale') return `${answer} / ${SCALE_MAX}`;
  return String(answer);
}

interface Tally {
  label: string;
  count: number;
  /** An answer whose option the admin has since renamed or removed. */
  retired: boolean;
}

interface QuestionStats {
  question: AdminSurveyQuestion;
  answered: number;
  tallies: Tally[];
  /** Scale only. */
  average: number | null;
  /** Short text only, newest first. */
  texts: { userId: string; name: string; value: string }[];
}

function summarise(questions: AdminSurveyQuestion[], respondents: SurveyRespondent[]): QuestionStats[] {
  return questions.map((question) => {
    const counts = new Map<string, number>();
    const texts: QuestionStats['texts'] = [];
    let answered = 0;
    let scaleTotal = 0;

    for (const person of respondents) {
      const entry = person.answers.find((a) => a.questionId === question.id);
      if (!entry) continue;
      answered += 1;

      if (question.type === 'short_text') {
        texts.push({ userId: person.userId, name: person.userName ?? 'Unknown', value: String(entry.answer) });
      } else if (question.type === 'scale') {
        const value = Number(entry.answer);
        scaleTotal += value;
        counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
      } else {
        for (const choice of Array.isArray(entry.answer) ? entry.answer : [String(entry.answer)]) {
          counts.set(choice, (counts.get(choice) ?? 0) + 1);
        }
      }
    }

    // Declared order, not count order: the bars are read against the question,
    // and an option nobody picked is a finding worth seeing in its place.
    const declared =
      question.type === 'scale'
        ? Array.from({ length: SCALE_MAX - SCALE_MIN + 1 }, (_, i) => String(SCALE_MIN + i))
        : question.options;

    const tallies: Tally[] = declared.map((label) => ({ label, count: counts.get(label) ?? 0, retired: false }));
    // Answers whose option has since been renamed or deleted still happened.
    for (const [label, count] of counts) {
      if (!declared.includes(label)) tallies.push({ label, count, retired: true });
    }

    return {
      question,
      answered,
      tallies,
      average: question.type === 'scale' && answered > 0 ? scaleTotal / answered : null,
      texts,
    };
  });
}

function Bar({ tally, total, leading, grown }: { tally: Tally; total: number; leading: boolean; grown: boolean }) {
  const percent = total > 0 ? Math.round((tally.count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className={cn('text-[13.5px] text-ink', tally.retired && 'italic text-muted')}>
          {tally.label}
          {tally.retired && <span className="ml-1.5 text-[11.5px] not-italic">(removed option)</span>}
        </span>
        <span className="text-[12.5px] text-muted tnum shrink-0">
          {tally.count} · {percent}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-ink/[.06] overflow-hidden">
        {/* Width is the only property that moves, and it moves once on arrival. */}
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-move ease-spring',
            leading && tally.count > 0 ? 'bg-accent-text' : 'bg-ink/25',
          )}
          style={{ width: grown ? `${percent}%` : '0%' }}
        />
      </div>
    </div>
  );
}

export function ResponseSummary({
  questions,
  respondents,
}: {
  questions: AdminSurveyQuestion[];
  respondents: SurveyRespondent[];
}) {
  // The bars grow from nothing on the first paint after mount. One flag for the
  // whole view, so switching to this tab reads as the numbers landing rather
  // than as a chart that was already there.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const stats = summarise(questions, respondents);

  return (
    <div className="flex flex-col gap-2.5">
      {stats.map(({ question, answered, tallies, average, texts }) => {
        const leadCount = Math.max(0, ...tallies.map((t) => t.count));
        return (
          <div key={question.id} className={cn(surfaceClass, 'px-5 py-4')}>
            <div className="text-[14.5px] font-semibold text-ink mb-1.5">{question.prompt}</div>
            <div className="flex items-center gap-2 flex-wrap mb-4 text-xs text-muted">
              <span className="px-2.5 py-[3px] rounded-full bg-ink/[.06] text-stone text-[11.5px] font-bold tracking-[0.04em] uppercase">
                {TYPE_LABELS[question.type]}
              </span>
              {!question.isActive && (
                <span className="px-2.5 py-[3px] rounded-full bg-[#8C8880]/10 text-[#6B7280] text-[11.5px] font-bold tracking-[0.04em] uppercase">
                  Inactive
                </span>
              )}
              <span className="tnum">
                {answered} response{answered === 1 ? '' : 's'}
              </span>
              {average !== null && (
                <span className="text-body font-semibold tnum">
                  Average {average.toFixed(1)} / {SCALE_MAX}
                </span>
              )}
            </div>

            {answered === 0 ? (
              <p className="text-[13px] text-muted m-0">No one has answered this yet.</p>
            ) : question.type === 'short_text' ? (
              <div className="flex flex-col gap-2">
                {texts.map((text) => (
                  <div key={text.userId} className="border-l-2 border-border pl-3">
                    <div className="text-[14px] text-ink whitespace-pre-wrap">{text.value}</div>
                    <div className="text-[12px] text-muted mt-0.5">{text.name}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {tallies.map((tally) => (
                  <Bar
                    key={tally.label}
                    tally={tally}
                    total={answered}
                    leading={tally.count === leadCount}
                    grown={grown}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
