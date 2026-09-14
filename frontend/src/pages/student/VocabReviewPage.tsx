import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDueVocab, reviewVocab, reviewTeacherVocab, type VocabDueItem } from '@/api/student';
import { cn } from '@/lib/utils';
import {
  quizLetterClass, quizOptionClass, quizOptionState, quizResultClass, quizResultLabelClass,
} from '@/components/student/quizOption';

const darkBtn = 'h-[42px] px-[22px] rounded-full bg-ink text-white text-sm font-semibold cursor-pointer';
const flipBtn = 'h-11 px-7 rounded-full border-2 border-teal-sat bg-white text-teal-sat text-sm font-bold cursor-pointer';
const deckCard = 'bg-white border border-border rounded-3xl shadow-panel';
const doneWrap = 'px-5 pt-10 pb-20 sm:px-12 sm:py-[60px] mx-auto text-center';
const doneTitle = 'font-display font-semibold text-[28px] sm:text-[34px] mt-0 mb-2.5';

export default function VocabReview() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['student', 'vocab', 'due'],
    queryFn: getDueVocab,
  });

  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [sessionResults, setSessionResults] = useState<{ word: string; correct: boolean }[]>([]);

  const reviewMutation = useMutation<void, Error, { item: VocabDueItem; isCorrect: boolean }>({
    mutationFn: async ({ item, isCorrect }) => {
      if (item.source === 'teacher') {
        await reviewTeacherVocab(item.vocabId, isCorrect);
      } else {
        await reviewVocab(item.vocabId, isCorrect);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['student', 'vocab', 'due'] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="font-display font-semibold text-[22px] text-muted">Loading your vocab queue…</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={cn(doneWrap, 'max-w-[580px]')}>
        <div className="text-5xl mb-4">🎉</div>
        <h2 className={doneTitle}>All caught up!</h2>
        <p className="text-subtle text-[15px] mt-0 mb-7">No words are due for review right now. Come back tomorrow.</p>
        <button onClick={() => navigate('/student/dashboard')} className={darkBtn}>Back to dashboard</button>
      </div>
    );
  }

  // Session complete
  if (idx >= items.length) {
    const correctCount = sessionResults.filter((r) => r.correct).length;
    return (
      <div className={cn(doneWrap, 'max-w-[560px]')}>
        <div className="text-5xl mb-4">{correctCount === sessionResults.length ? '🌟' : '📚'}</div>
        <h2 className={doneTitle}>Session complete</h2>
        <p className="text-subtle text-[15px] mt-0 mb-7">
          {correctCount} / {sessionResults.length} correct
        </p>
        <div className="flex flex-col gap-2 mb-8 text-left bg-white rounded-[14px] border border-border px-5 py-4">
          {sessionResults.map((r, i) => (
            <div key={i} className="flex items-center gap-2.5 text-sm">
              <span className={cn('font-bold text-base', r.correct ? 'text-green-sat' : 'text-danger')}>{r.correct ? '✓' : '✗'}</span>
              <span className="font-semibold">{r.word}</span>
            </div>
          ))}
        </div>
        <button onClick={() => navigate('/student/dashboard')} className={darkBtn}>Back to dashboard</button>
      </div>
    );
  }

  const item: VocabDueItem = items[idx];
  const vd = item.source === 'question' ? item.content : null;
  const optLetters = ['A', 'B', 'C', 'D'];
  const isPickCorrect = item.source === 'teacher' ? picked === 'knew' : picked === vd?.correctOption;

  const handleFlip = () => setFlipped(true);

  const handleSubmit = () => {
    if (!picked || submitted) return;
    setSubmitted(true);
    const correct = item.source === 'teacher' ? picked === 'knew' : picked === vd?.correctOption;
    reviewMutation.mutate({ item, isCorrect: correct });
    setSessionResults((prev) => [...prev, { word: item.word, correct }]);
  };

  const handleNext = () => {
    setIdx((i) => i + 1);
    setFlipped(false);
    setPicked(null);
    setSubmitted(false);
  };

  const nextBtn = (
    <button onClick={handleNext} className="h-[42px] px-[22px] rounded-full bg-accent-text text-white text-sm font-semibold cursor-pointer">
      {idx + 1 >= items.length ? 'Finish session' : 'Next word →'}
    </button>
  );

  return (
    <div className="px-4 pt-5 pb-20 sm:px-12 sm:pt-9 sm:pb-16 max-w-[680px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-[22px]">
        <div>
          <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-muted mb-1">Vocab Review</div>
          <h1 className="font-display font-semibold text-2xl sm:text-[32px] m-0">Daily flashcards</h1>
        </div>
        <div className="flex items-center gap-2.5 sm:gap-4">
          <span className="text-[13px] text-muted font-semibold">{idx + 1} / {items.length}</span>
          <button onClick={() => navigate('/student/dashboard')} className="h-9 px-3.5 rounded-full border border-field bg-white text-[13px] font-semibold cursor-pointer">Exit</button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-border-soft rounded-full mb-[22px]">
        <div className="h-1 bg-teal-sat rounded-full transition-[width] duration-300" style={{ width: `${(idx / items.length) * 100}%` }} />
      </div>

      {/* Card front */}
      <div className={cn(deckCard, 'px-5 py-[22px] sm:px-9 sm:py-8 mb-3.5')}>
        <div className="text-[10.5px] font-bold tracking-[0.1em] uppercase text-teal-sat mb-2.5">
          {item.source === 'teacher' ? 'Example sentence' : 'Word in context'}
        </div>
        <p className="font-serif text-[17px] sm:text-xl leading-[1.6] text-ink mt-0 mb-3.5 italic">
          "{item.passageExcerpt || (vd?.sentenceContext ?? '')}"
        </p>
        <div className="inline-block bg-[rgba(0,128,128,0.08)] border border-[rgba(0,128,128,0.2)] rounded-lg px-3 py-[5px] text-[15px] font-bold text-teal-sat">
          {item.word}
        </div>
      </div>

      {/* Teacher vocab card — self-assess with definition reveal */}
      {item.source === 'teacher' && (
        !flipped ? (
          <div className="text-center">
            <p className="text-[13.5px] text-subtle mb-4">Try to recall the definition of "{item.word}", then reveal.</p>
            <button onClick={handleFlip} className={flipBtn}>
              Reveal definition
            </button>
          </div>
        ) : (
          <div className={cn(deckCard, 'p-5 sm:px-8 sm:py-7')}>
            <div className="text-[10.5px] font-bold tracking-[0.1em] uppercase text-muted mb-2">Definition</div>
            <p className="text-base leading-[1.6] text-ink mt-0 mb-5">{item.definition}</p>
            {!submitted ? (
              <div className="flex gap-2.5">
                <button
                  onClick={() => { setPicked('knew'); }}
                  disabled={!!picked}
                  className={cn('flex-1 h-[42px] rounded-[10px] text-sm font-semibold', picked ? 'cursor-default' : 'cursor-pointer',
                    picked === 'knew' ? 'border-2 border-green-sat bg-green-sat/10 text-green-deep' : 'border border-field bg-white text-ink')}
                >
                  I knew it ✓
                </button>
                <button
                  onClick={() => { setPicked('forgot'); }}
                  disabled={!!picked}
                  className={cn('flex-1 h-[42px] rounded-[10px] text-sm font-semibold', picked ? 'cursor-default' : 'cursor-pointer',
                    picked === 'forgot' ? 'border-2 border-danger bg-danger/[.08] text-danger-dark' : 'border border-field bg-white text-ink')}
                >
                  I forgot it ✗
                </button>
              </div>
            ) : null}
            {picked && !submitted && (
              <button onClick={handleSubmit} className="mt-3.5 h-10 px-[22px] rounded-full bg-teal-sat text-white text-[13.5px] font-bold cursor-pointer">
                Confirm
              </button>
            )}
            {submitted && nextBtn}
          </div>
        )
      )}

      {/* Question-derived card — multiple choice quiz */}
      {item.source === 'question' && vd && (
        !flipped ? (
          <div className="text-center">
            <p className="text-[13.5px] text-subtle mb-4">Try to recall what "{item.word}" means in this sentence, then flip.</p>
            <button onClick={handleFlip} className={cn(flipBtn, 'tracking-[0.02em]')}>
              Flip — show question
            </button>
          </div>
        ) : (
          <div className={cn(deckCard, 'p-5 sm:px-8 sm:py-7')}>
            <p className="text-[15px] font-semibold text-ink mt-0 mb-3.5">{vd.followUpQuestion}</p>
            <div className="flex flex-col gap-2 mb-[18px]">
              {vd.options.map((opt, oi) => {
                const letter = optLetters[oi];
                const state = quizOptionState({ submitted, picked: picked === letter, correct: letter === vd.correctOption });
                return (
                  <button
                    key={letter}
                    onClick={() => { if (!submitted) setPicked(letter); }}
                    disabled={submitted}
                    className={quizOptionClass(state, submitted)}
                  >
                    <span className={quizLetterClass(state)}>{letter}</span>
                    {opt}
                  </button>
                );
              })}
            </div>
            {submitted ? (
              <>
                <div className={cn('px-3.5 py-3 rounded-[10px] mb-4', quizResultClass(isPickCorrect))}>
                  <div className={cn('text-xs font-bold mb-1', quizResultLabelClass(isPickCorrect))}>
                    {isPickCorrect ? '✓ Correct' : `✗ Incorrect — correct: ${vd.correctOption}`}
                  </div>
                  <p className="text-[13.5px] leading-[1.55] text-ink m-0">{vd.explanation}</p>
                </div>
                {nextBtn}
              </>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!picked}
                className={cn('h-10 px-5 rounded-full text-white text-[13.5px] font-bold', picked ? 'bg-teal-sat cursor-pointer' : 'bg-field cursor-default')}
              >
                Check answer
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}
