import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDueVocab, reviewVocab, reviewTeacherVocab, type VocabDueItem } from '@/api/student';
import { useMobile } from '@/hooks/useMobile';

export default function VocabReview() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMobile = useMobile();

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 22, color: 'rgba(11,11,14,0.58)' }}>Loading your vocab queue…</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ padding: isMobile ? '40px 20px 80px' : '60px 48px', maxWidth: 580, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 28 : 34, margin: '0 0 10px' }}>All caught up!</h2>
        <p style={{ color: 'rgba(11,11,14,0.64)', fontSize: 15, margin: '0 0 28px' }}>No words are due for review right now. Come back tomorrow.</p>
        <button
          onClick={() => navigate('/student/dashboard')}
          style={{ height: 42, padding: '0 22px', borderRadius: 9999, border: 'none', background: '#0B0B0E', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >Back to dashboard</button>
      </div>
    );
  }

  // Session complete
  if (idx >= items.length) {
    const correctCount = sessionResults.filter((r) => r.correct).length;
    return (
      <div style={{ padding: isMobile ? '40px 20px 80px' : '60px 48px', maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{correctCount === sessionResults.length ? '🌟' : '📚'}</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 28 : 34, margin: '0 0 10px' }}>Session complete</h2>
        <p style={{ color: 'rgba(11,11,14,0.64)', fontSize: 15, margin: '0 0 28px' }}>
          {correctCount} / {sessionResults.length} correct
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32, textAlign: 'left', background: '#fff', borderRadius: 14, border: '1px solid #E7E4DE', padding: '16px 20px' }}>
          {sessionResults.map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <span style={{ color: r.correct ? '#2E7D5A' : '#C0392B', fontWeight: 700, fontSize: 16 }}>{r.correct ? '✓' : '✗'}</span>
              <span style={{ fontWeight: 600 }}>{r.word}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => navigate('/student/dashboard')}
          style={{ height: 42, padding: '0 22px', borderRadius: 9999, border: 'none', background: '#0B0B0E', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >Back to dashboard</button>
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
    <button onClick={handleNext} style={{ height: 42, padding: '0 22px', borderRadius: 9999, border: 'none', background: '#C4471F', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
      {idx + 1 >= items.length ? 'Finish session' : 'Next word →'}
    </button>
  );

  const cardPad = isMobile ? '22px 20px' : '32px 36px';

  return (
    <div style={{ padding: isMobile ? '20px 16px 80px' : '36px 48px 64px', maxWidth: 680, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)', marginBottom: 4 }}>Vocab Review</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 24 : 32, margin: 0 }}>Daily flashcards</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16 }}>
          <span style={{ fontSize: 13, color: 'rgba(11,11,14,0.58)', fontWeight: 600 }}>{idx + 1} / {items.length}</span>
          <button onClick={() => navigate('/student/dashboard')} style={{ height: 36, padding: '0 14px', borderRadius: 9999, border: '1px solid #C8C4BC', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Exit</button>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: '#EEEBE5', borderRadius: 9999, marginBottom: 22 }}>
        <div style={{ height: 4, width: `${(idx / items.length) * 100}%`, background: '#0D7377', borderRadius: 9999, transition: 'width 0.3s' }} />
      </div>

      {/* Card front */}
      <div style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 18, padding: cardPad, boxShadow: '0 2px 12px rgba(11,11,14,0.06)', marginBottom: 14 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#0D7377', marginBottom: 10 }}>
          {item.source === 'teacher' ? 'Example sentence' : 'Word in context'}
        </div>
        <p style={{ fontFamily: 'var(--font-reading)', fontSize: isMobile ? 17 : 20, lineHeight: 1.6, color: '#0B0B0E', margin: '0 0 14px', fontStyle: 'italic' }}>
          "{item.passageExcerpt || (vd?.sentenceContext ?? '')}"
        </p>
        <div style={{ display: 'inline-block', background: 'rgba(0,128,128,0.08)', border: '1px solid rgba(0,128,128,0.2)', borderRadius: 8, padding: '5px 12px', fontSize: 15, fontWeight: 700, color: '#0D7377' }}>
          {item.word}
        </div>
      </div>

      {/* Teacher vocab card — self-assess with definition reveal */}
      {item.source === 'teacher' && (
        !flipped ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.64)', marginBottom: 16 }}>Try to recall the definition of "{item.word}", then reveal.</p>
            <button onClick={handleFlip} style={{ height: 44, padding: '0 28px', borderRadius: 9999, border: '2px solid #0D7377', background: '#fff', color: '#0D7377', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Reveal definition
            </button>
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 18, padding: isMobile ? '20px 20px' : '28px 32px', boxShadow: '0 2px 12px rgba(11,11,14,0.06)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)', marginBottom: 8 }}>Definition</div>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: '#0B0B0E', margin: '0 0 20px' }}>{item.definition}</p>
            {!submitted ? (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setPicked('knew'); }} disabled={!!picked} style={{ flex: 1, height: 42, borderRadius: 10, border: picked === 'knew' ? '2px solid #2E7D5A' : '1px solid #C8C4BC', background: picked === 'knew' ? 'rgba(46,125,90,0.1)' : '#fff', color: picked === 'knew' ? '#1A5C38' : '#0B0B0E', fontSize: 14, fontWeight: 600, cursor: picked ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                  I knew it ✓
                </button>
                <button onClick={() => { setPicked('forgot'); }} disabled={!!picked} style={{ flex: 1, height: 42, borderRadius: 10, border: picked === 'forgot' ? '2px solid #C0392B' : '1px solid #C8C4BC', background: picked === 'forgot' ? 'rgba(192,57,43,0.08)' : '#fff', color: picked === 'forgot' ? '#8B1A10' : '#0B0B0E', fontSize: 14, fontWeight: 600, cursor: picked ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                  I forgot it ✗
                </button>
              </div>
            ) : null}
            {picked && !submitted && (
              <button onClick={handleSubmit} style={{ marginTop: 14, height: 40, padding: '0 22px', borderRadius: 9999, border: 'none', background: '#0D7377', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
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
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.64)', marginBottom: 16 }}>Try to recall what "{item.word}" means in this sentence, then flip.</p>
            <button onClick={handleFlip} style={{ height: 44, padding: '0 28px', borderRadius: 9999, border: '2px solid #0D7377', background: '#fff', color: '#0D7377', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.02em' }}>
              Flip — show question
            </button>
          </div>
        ) : (
          <div style={{ background: '#fff', border: '1px solid #E7E4DE', borderRadius: 18, padding: isMobile ? '20px 20px' : '28px 32px', boxShadow: '0 2px 12px rgba(11,11,14,0.06)' }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#0B0B0E', margin: '0 0 14px' }}>{vd.followUpQuestion}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
              {vd.options.map((opt, oi) => {
                const letter = optLetters[oi];
                const isPicked = picked === letter;
                const isCorrectOpt = letter === vd.correctOption;
                let bg = '#fff', border = '1px solid #C8C4BC', color = '#0B0B0E';
                if (submitted) {
                  if (isCorrectOpt) { bg = 'rgba(46,125,90,0.1)'; border = '1.5px solid #2E7D5A'; color = '#1A5C38'; }
                  else if (isPicked) { bg = 'rgba(192,57,43,0.08)'; border = '1.5px solid #C0392B'; color = '#8B1A10'; }
                } else if (isPicked) { bg = 'rgba(0,128,128,0.07)'; border = '1.5px solid #0D7377'; }
                return (
                  <button key={letter} onClick={() => { if (!submitted) setPicked(letter); }} disabled={submitted}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, border, background: bg, color, fontSize: 14, textAlign: 'left', cursor: submitted ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>
                    <span style={{ width: 24, height: 24, borderRadius: 9999, border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{letter}</span>
                    {opt}
                  </button>
                );
              })}
            </div>
            {submitted ? (
              <>
                <div style={{ padding: '12px 14px', borderRadius: 10, background: isPickCorrect ? 'rgba(46,125,90,0.08)' : 'rgba(192,57,43,0.07)', marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isPickCorrect ? '#1A5C38' : '#8B1A10', marginBottom: 4 }}>
                    {isPickCorrect ? '✓ Correct' : `✗ Incorrect — correct: ${vd.correctOption}`}
                  </div>
                  <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#0B0B0E', margin: 0 }}>{vd.explanation}</p>
                </div>
                {nextBtn}
              </>
            ) : (
              <button onClick={handleSubmit} disabled={!picked} style={{ height: 40, padding: '0 20px', borderRadius: 9999, border: 'none', background: picked ? '#0D7377' : '#C8C4BC', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: picked ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                Check answer
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}
