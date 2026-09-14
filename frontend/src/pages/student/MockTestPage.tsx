import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { startMockTest } from '@/api/student';
import { getApiError } from '@/api/http';
import { surfaceClass, pageClass } from '@/components/common';
import { ExamBlurb, ExamKicker, ExamTitle, MetaStats, RulesCard } from '@/components/student/ExamIntro';
import { cn } from '@/lib/utils';
import { getSkills, skillsQueryKey } from '@/api/skills';

/**
 * The two sections of the test. The domain list under each is filled in from
 * `/skills` rather than restated here — it used to be a second hardcoded copy of
 * the same names ExamCatalogue carried, and the two drifted independently.
 */
const SECTIONS = [
  { subject: 'english' as const, dot: 'bg-green-sat', name: 'Reading & Writing', desc: 'Craft, structure, and the conventions of standard English.' },
  { subject: 'math' as const, dot: 'bg-blue-sat', name: 'Math', desc: 'Equations, functions, problem-solving, and real-world math.' },
];

const RULES = [
  'A countdown timer runs for the entire test.',
  'Reading & Writing comes first, then a short break, then Math.',
  'Flag any question and return to it from the navigator.',
  'Cross out answer choices you\'ve ruled out.',
  'An on-screen calculator is available for the Math section.',
  'You\'ll get a full scored report the moment you submit.',
];

export default function MockTest() {
  const navigate = useNavigate();
  const { data: skillTree = [] } = useQuery({
    queryKey: skillsQueryKey(),
    queryFn: () => getSkills(),
    staleTime: 60 * 60 * 1000,
  });

  // "Grammar · Inference · …" straight from the taxonomy, so this page cannot
  // drift from what questions are actually tagged with.
  const sections = SECTIONS.map((section) => ({
    ...section,
    detail: skillTree
      .filter((domain) => domain.subject === section.subject)
      .map((domain) => domain.label)
      .join(' · '),
  }));

  const startMutation = useMutation({
    mutationFn: startMockTest,
    onError: () => {}, // shown inline on the page, not as a toast
    onSuccess: (data) => navigate(`/student/exams/${data.englishExam.id}`, {
      state: {
        mockTestId: data.mockTest.id,
        mockSection: 'english_m1',
        mathM1ExamId: data.mathExam.id,
        timerEnabled: true,
        examTitle: 'Module 1 · Reading & Writing',
      },
    }),
  });

  return (
    <div className={cn(pageClass, 'sm:pt-10')}>
      <ExamKicker>Full length · scored out of 1600</ExamKicker>
      <ExamTitle className="mt-2">Mock SAT</ExamTitle>
      <ExamBlurb className="mt-3 mb-6">
        A complete, timed simulation of the Digital SAT. Reading & Writing comes first, then a short break, then Math. Your scaled section scores combine into a total out of 1600.
      </ExamBlurb>

      {/* 4 modules: Reading & Writing 2 × 32 min, Math 2 × 35 min — the limits the server enforces. */}
      <MetaStats stats={[['2', 'Sections'], ['2h 14m', 'Total time'], ['1600', 'Score scale']]} />

      <div className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr] gap-3.5 sm:gap-5 mb-5 sm:mb-7">
        <div>
          <h3 className="text-[15px] mt-0 mb-3">What's inside</h3>
          <div className="flex flex-col gap-2.5">
            {sections.map((m) => (
              <div key={m.subject} className={cn(surfaceClass, 'px-4 py-3.5 sm:px-5 sm:py-[18px]')}>
                <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                  <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', m.dot)} />
                  <span className="text-sm sm:text-[15.5px] font-semibold">{m.name}</span>
                  <span className="hidden sm:inline ml-auto text-[12.5px] text-muted font-mono">{m.detail}</span>
                </div>
                <div className="text-[13.5px] text-subtle leading-[1.55]">{m.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <RulesCard rules={RULES} />
      </div>

      {startMutation.isError && (
        <p className="text-danger text-[13px] mb-4">{getApiError(startMutation.error)}</p>
      )}

      <button
        onClick={() => startMutation.mutate()}
        disabled={startMutation.isPending}
        className={cn(
          'h-12 sm:h-[52px] px-8 w-full sm:w-auto text-white rounded-full text-[15px] sm:text-[15.5px] font-semibold shadow-[0_4px_14px_rgba(226,86,43,0.3)] transition-[background-color,transform] duration-150',
          startMutation.isPending ? 'bg-accent-disabled cursor-default' : 'bg-accent-text cursor-pointer hover:bg-ember-dark hover:-translate-y-px',
        )}
      >
        {startMutation.isPending ? 'Starting…' : 'Begin Mock SAT →'}
      </button>
    </div>
  );
}
