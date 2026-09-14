import React from 'react';
import { reviewVocab } from '@/api/student';
import type {
  ConfirmFeedbacks,
  ReasoningClassification,
  CommandOfEvidenceContent,
  TransitionsCoachContent,
  VocabDrillContent,
} from '@/api/student';

/**
 * Renders the AI feedback cards for one confirmed answer.
 *
 * The backend decides which of the six feedback types apply to a question and
 * returns null for any that failed, so this renders whatever arrived and skips
 * the rest — a missing card is never an error state here.
 */

export const CLASSIFICATION_META: Record<
  ReasoningClassification,
  { label: string; color: string; bg: string; border: string }
> = {
  correct_logic_correct_answer: { label: 'Strong reasoning',              color: '#1A6B3C', bg: 'rgba(46,125,90,0.07)',  border: 'rgba(46,125,90,0.25)' },
  correct_logic_wrong_answer:   { label: 'Sound logic — likely a misread', color: '#B8893E', bg: 'rgba(184,137,62,0.07)', border: 'rgba(184,137,62,0.3)' },
  wrong_logic_correct_answer:   { label: 'Right answer — review your reasoning', color: '#B8893E', bg: 'rgba(184,137,62,0.07)', border: 'rgba(184,137,62,0.3)' },
  wrong_logic_wrong_answer:     { label: 'Comprehension gap identified',   color: '#C0392B', bg: 'rgba(192,57,43,0.07)', border: 'rgba(192,57,43,0.2)' },
};

export function AiFeedbackPanel({
  feedbacks,
  vocabTrackingId,
  questionId,
  vocabPick,
  vocabSubmitted,
  setVocabPick,
  setVocabSubmitted,
}: {
  feedbacks: ConfirmFeedbacks;
  vocabTrackingId: string | null;
  questionId: string;
  vocabPick: Record<string, string>;
  vocabSubmitted: Record<string, boolean>;
  setVocabPick: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setVocabSubmitted: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
      {feedbacks.reasoning_checkpoint && (() => {
        const rc = feedbacks.reasoning_checkpoint!;
        const meta = CLASSIFICATION_META[rc.classification as ReasoningClassification] ?? CLASSIFICATION_META.correct_logic_correct_answer;
        return (
          <div style={{ padding: '16px 18px', borderRadius: 12, background: meta.bg, border: `1px solid ${meta.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: meta.color, marginBottom: 8 }}>{meta.label}</div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: '#0B0B0E', margin: 0 }}>{rc.explanation}</p>
          </div>
        );
      })()}

      {feedbacks.grammar_diagnosis && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: '#F0ECE4', border: '1px solid rgba(184,137,62,0.25)' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8A6020', marginBottom: 5 }}>
            Grammar rule: {feedbacks.grammar_diagnosis.grammarRule}
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#0B0B0E', margin: 0 }}>{feedbacks.grammar_diagnosis.grammarFix}</p>
        </div>
      )}

      {feedbacks.trap_explainer && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(11,11,14,0.03)', border: '1px solid #E7E4DE' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)', marginBottom: 5 }}>
            Trap: {feedbacks.trap_explainer.trap}
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#0B0B0E', margin: 0 }}>{feedbacks.trap_explainer.explanation}</p>
        </div>
      )}

      {feedbacks.command_of_evidence && (() => {
        const coe = feedbacks.command_of_evidence as CommandOfEvidenceContent;
        return (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.2)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1D4ED8', marginBottom: 8 }}>Supporting evidence</div>
            <blockquote style={{ fontFamily: 'var(--font-reading)', fontSize: 15, lineHeight: 1.6, color: '#0B0B0E', margin: '0 0 10px', paddingLeft: 12, borderLeft: '2px solid rgba(37,99,235,0.35)', fontStyle: 'italic' }}>
              "{coe.supportingLine}"
            </blockquote>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#0B0B0E', margin: '0 0 4px' }}>{coe.whyCorrect}</p>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'rgba(11,11,14,0.6)', margin: 0 }}>{coe.whyStudentWrong}</p>
          </div>
        );
      })()}

      {feedbacks.transitions_coach && (() => {
        const tc = feedbacks.transitions_coach as TransitionsCoachContent;
        return (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.2)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6D28D9', marginBottom: 8 }}>Transition logic</div>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#0B0B0E', margin: '0 0 6px' }}>{tc.logicalRelationship}</p>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#0B0B0E', margin: '0 0 4px' }}>{tc.whyCorrect}</p>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'rgba(11,11,14,0.6)', margin: 0 }}>{tc.whyStudentWrong}</p>
          </div>
        );
      })()}

      {feedbacks.vocab_drill && (() => {
        const vd = feedbacks.vocab_drill as VocabDrillContent;
        const optLetters = ['A', 'B', 'C', 'D'];
        const picked = vocabPick[questionId];
        const isSubmitted = !!vocabSubmitted[questionId];
        const isPickCorrect = picked === vd.correctOption;

        const handleVocabSubmit = () => {
          if (!picked || isSubmitted) return;
          setVocabSubmitted((s) => ({ ...s, [questionId]: true }));
          if (vocabTrackingId) reviewVocab(vocabTrackingId, picked === vd.correctOption).catch(console.error);
        };

        return (
          <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(0,128,128,0.04)', border: '2px solid rgba(0,128,128,0.18)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0D7377', marginBottom: 6 }}>
              Vocab drill — "{vd.word}"
            </div>
            <p style={{ fontSize: 13, lineHeight: 1.55, color: 'rgba(11,11,14,0.6)', margin: '0 0 10px', fontStyle: 'italic' }}>"{vd.sentenceContext}"</p>
            <p style={{ fontSize: 13.5, fontWeight: 600, color: '#0B0B0E', margin: '0 0 10px' }}>{vd.followUpQuestion}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {vd.options.map((opt, oi) => {
                const letter = optLetters[oi];
                const isPicked = picked === letter;
                const isCorrectOpt = letter === vd.correctOption;
                let bg = '#fff', border = '1px solid #C8C4BC', color = '#0B0B0E';
                if (isSubmitted) {
                  if (isCorrectOpt) { bg = 'rgba(46,125,90,0.1)'; border = '1.5px solid #2E7D5A'; color = '#1A5C38'; }
                  else if (isPicked) { bg = 'rgba(192,57,43,0.08)'; border = '1.5px solid #C0392B'; color = '#8B1A10'; }
                } else if (isPicked) { bg = 'rgba(0,128,128,0.07)'; border = '1.5px solid #0D7377'; }
                return (
                  <button key={letter} onClick={() => { if (!isSubmitted) setVocabPick((p) => ({ ...p, [questionId]: letter })); }} disabled={isSubmitted}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', borderRadius: 9, border, background: bg, color, fontSize: 13, textAlign: 'left', cursor: isSubmitted ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>
                    <span style={{ width: 22, height: 22, borderRadius: 9999, border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{letter}</span>
                    {opt}
                  </button>
                );
              })}
            </div>
            {isSubmitted ? (
              <div style={{ padding: '10px 12px', borderRadius: 8, background: isPickCorrect ? 'rgba(46,125,90,0.08)' : 'rgba(192,57,43,0.07)', marginTop: 4 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: isPickCorrect ? '#1A5C38' : '#8B1A10', marginBottom: 4 }}>
                  {isPickCorrect ? '✓ Correct' : '✗ Incorrect — correct answer: ' + vd.correctOption}
                </div>
                <p style={{ fontSize: 13, lineHeight: 1.5, color: '#0B0B0E', margin: 0 }}>{vd.explanation}</p>
              </div>
            ) : (
              <button onClick={handleVocabSubmit} disabled={!picked}
                style={{ height: 36, padding: '0 18px', borderRadius: 9999, border: 'none', background: picked ? '#0D7377' : '#C8C4BC', color: '#fff', fontSize: 13, fontWeight: 700, cursor: picked ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                Check answer
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
}
