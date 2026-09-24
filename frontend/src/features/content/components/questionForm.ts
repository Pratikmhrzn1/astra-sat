export type ComposerTab = 'questions' | 'passages';
export type ItemType = 'multiple_choice' | 'student_produced_response';

export interface MCSheet {
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

export interface SPRSheet {
  questionType: 'student_produced_response';
  passageId: string;
  skillCode: string;
  difficulty: '' | 'easy' | 'medium' | 'hard';
  questionText: string;
  correctAnswerText: string;
  explanation: string;
  imageUrl: string | null;
}

export type ItemSheet = MCSheet | SPRSheet;

export const blankChoiceItem: MCSheet = { questionType: 'multiple_choice', passageId: '', skillCode: '', difficulty: '', questionText: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: 'a', explanation: '', imageUrl: null };
export const blankGridItem: SPRSheet = { questionType: 'student_produced_response', passageId: '', skillCode: '', difficulty: '', questionText: '', correctAnswerText: '', explanation: '', imageUrl: null };

/** A module holds at most this many questions, as on the real test. */
export const slotLimit = (subject: 'english' | 'math') => (subject === 'english' ? 27 : 22);

export const fieldCaptionClass = 'block text-[13px] font-semibold text-subtle mb-1.5';
export const hintStyle = 'text-[11.5px] text-muted mt-[5px] mb-0';

/** Tag-sized pill on the sunken ground; `active` fills it with ink. */
export const softPillStyle = 'rounded-full text-[13.5px] font-semibold cursor-pointer transition-all duration-150';
