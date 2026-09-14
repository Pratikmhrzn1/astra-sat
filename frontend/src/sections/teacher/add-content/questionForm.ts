export type EditorTab = 'questions' | 'passages';
export type QuestionType = 'multiple_choice' | 'student_produced_response';

export interface MCForm {
  questionType: 'multiple_choice';
  passageId: string;
  skillCode: string;
  difficulty: '' | 'easy' | 'medium' | 'hard';
  questionText: string;
  optionA: string; optionB: string; optionC: string; optionD: string;
  correctAnswer: 'a' | 'b' | 'c' | 'd';
  explanation: string;
  imageUrl: string | null;
}

export interface SPRForm {
  questionType: 'student_produced_response';
  passageId: string;
  skillCode: string;
  difficulty: '' | 'easy' | 'medium' | 'hard';
  questionText: string;
  correctAnswerText: string;
  explanation: string;
  imageUrl: string | null;
}

export type QuestionForm = MCForm | SPRForm;

export const emptyMC: MCForm = { questionType: 'multiple_choice', passageId: '', skillCode: '', difficulty: '', questionText: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: 'a', explanation: '', imageUrl: null };
export const emptySPR: SPRForm = { questionType: 'student_produced_response', passageId: '', skillCode: '', difficulty: '', questionText: '', correctAnswerText: '', explanation: '', imageUrl: null };

/** A module holds at most this many questions, as on the real test. */
export const moduleLimit = (subject: 'english' | 'math') => (subject === 'english' ? 27 : 22);

export const fieldLabelClass = 'block text-[13px] font-semibold text-subtle mb-1.5';
export const hintClass = 'text-[11.5px] text-muted mt-[5px] mb-0';

/** Tag-sized pill on the sunken ground; `active` fills it with ink. */
export const softPillClass = 'rounded-full text-[13.5px] font-semibold cursor-pointer transition-all duration-150';
