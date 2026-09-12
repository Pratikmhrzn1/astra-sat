import { apiClient } from '@/shared/api/client';

export interface QuestionSet {
  id: string;
  title: string;
  subject: 'english' | 'math';
  description: string;
  questionCount: number;
  createdAt: string;
}

export interface Question {
  id: string;
  questionType: 'multiple_choice' | 'student_produced_response';
  questionText: string;
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  imageUrl: string | null;
  passageId: string | null;
  passageText: string | null;
  passageTitle: string | null;
  orderIndex: number;
}

export interface QuestionWithAnswer extends Question {
  correctAnswer: 'a' | 'b' | 'c' | 'd' | null;
  correctAnswerText: string | null;
  explanation: string | null;
  selectedAnswer: string | null;
  selectedAnswerText: string | null;
  isCorrect: boolean | null;
}

export interface Exam {
  id: string;
  studentId: string;
  /** Null for an exam assembled across sets rather than from one. */
  setId: string | null;
  /** Display name for a set-less exam, e.g. "Topic: Algebra". */
  label: string | null;
  type: 'individual' | 'mock_english' | 'mock_math';
  status: 'in_progress' | 'completed' | 'abandoned';
  score: number | null;
  /**
   * Section score on the 200-800 scale, written by the server at submit time.
   *
   * Null in three cases, all of which mean "do not show a scaled number":
   * the exam predates scaled scoring, it is too short to scale, or it is one
   * module of a mock — half a section, scored on the mock's own row instead.
   */
  scaledScore: number | null;
  totalQuestions: number;
  timeSpentSeconds: number | null;
  startedAt: string;
  completedAt: string | null;
}

export interface ExamWithSet extends Exam {
  /** Null for an exam that belongs to no set; `label` names those instead. */
  setTitle: string | null;
  /**
   * Never null: for a set-less exam the server derives it from the exam's own
   * questions, because every consumer here filters or labels on it.
   */
  subject: 'english' | 'math';
}

export interface MockTest {
  id: string;
  studentId: string;
  englishExamId: string | null;
  mathExamId: string | null;
  englishM2ExamId: string | null;
  mathM2ExamId: string | null;
  status: 'in_progress' | 'completed';
  /**
   * Composite scores, written when the final module is submitted. Each section
   * is Module 1 + Module 2 scaled against the adaptive path the student earned;
   * `totalScore` is their sum on the 400-1600 scale. Null until the mock is
   * finished, or if a section was too short to scale.
   */
  rwScore: number | null;
  mathScore: number | null;
  totalScore: number | null;
  startedAt: string;
  completedAt: string | null;
}

/** One module of a mock, as reported alongside an exam's results. */
export interface MockModule {
  examId: string;
  subject: 'english' | 'math';
  module: 1 | 2;
  status: 'in_progress' | 'completed' | 'abandoned';
  score: number | null;
  totalQuestions: number;
  setDifficulty: string | null;
}

/**
 * The mock an exam belongs to. Present on a results response whenever the exam
 * is one of a mock's four modules, so the client never has to work out
 * membership from the exam type — live exams share those types.
 */
export interface MockContext {
  id: string;
  status: 'in_progress' | 'completed';
  rwScore: number | null;
  mathScore: number | null;
  totalScore: number | null;
  completedAt: string | null;
  modules: MockModule[];
}

/** The goal a student is working towards. Null until they set one. */
export interface StudentProfile {
  id: string;
  studentId: string;
  targetScore: number | null;
  testDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackItem {
  id: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
  examId: string | null;
  teacherName: string;
  teacherEmail: string;
}

export async function getQuestionSets(): Promise<QuestionSet[]> {
  const { data } = await apiClient.get<QuestionSet[]>('/student/question-sets');
  return data;
}

export async function startExam(setId: string): Promise<{ exam: Exam; questions: Question[] }> {
  const { data } = await apiClient.post('/student/exams', { setId, type: 'individual' });
  return data;
}

export async function getExam(examId: string): Promise<{
  exam: Exam;
  questions: Question[];
  answers: { questionId: string; selectedAnswer: string | null; selectedAnswerText: string | null }[];
  /** The mock this exam belongs to, if any. */
  mockTestId: string | null;
  /** Where the Math section starts, so the player can chain English -> Math. */
  mathExamId: string | null;
}> {
  const { data } = await apiClient.get(`/student/exams/${examId}`);
  return data;
}

export async function saveAnswers(
  examId: string,
  answers: { questionId: string; selectedAnswer?: string | null; selectedAnswerText?: string | null }[],
  timeSpentSeconds?: number
): Promise<void> {
  await apiClient.put(`/student/exams/${examId}/answers`, { answers, timeSpentSeconds });
}

export async function submitExam(
  examId: string,
  timeSpentSeconds?: number
): Promise<{ score: number; total: number; percentage: number }> {
  const { data } = await apiClient.post(`/student/exams/${examId}/submit`, { timeSpentSeconds });
  return data;
}

export async function getExams(): Promise<ExamWithSet[]> {
  const { data } = await apiClient.get<ExamWithSet[]>('/student/exams');
  return data;
}

export async function getExamResults(examId: string): Promise<{
  exam: Exam;
  set: { title: string; subject: string } | null;
  results: QuestionWithAnswer[];
  /** Non-null when this exam is one module of a mock; carries the mock's scores. */
  mock: MockContext | null;
}> {
  const { data } = await apiClient.get(`/student/exams/${examId}/results`);
  return data;
}

export async function startMockTest(): Promise<{
  mockTest: MockTest;
  englishExam: Exam;
  mathExam: Exam;
  englishQuestions: Question[];
  mathQuestions: Question[];
}> {
  const { data } = await apiClient.post('/student/mock-tests');
  return data;
}

export async function getMockTests(): Promise<MockTest[]> {
  const { data } = await apiClient.get<MockTest[]>('/student/mock-tests');
  return data;
}

export async function getMockTest(mockTestId: string): Promise<{
  mockTest: MockTest;
  englishExam: Exam | null;
  mathExam: Exam | null;
}> {
  const { data } = await apiClient.get(`/student/mock-tests/${mockTestId}`);
  return data;
}

export async function nextModule(mockTestId: string, submittedExamId: string): Promise<{
  m2ExamId: string;
  m2Questions: Question[];
  m2Difficulty: 'hard' | 'low';
  percentage: number;
}> {
  const { data } = await apiClient.post(`/student/mock-tests/${mockTestId}/next-module`, { submittedExamId });
  return data;
}

export async function getFeedback(): Promise<FeedbackItem[]> {
  const { data } = await apiClient.get<FeedbackItem[]>('/student/feedback');
  return data;
}

export async function markFeedbackRead(feedbackId: string): Promise<void> {
  await apiClient.put(`/student/feedback/${feedbackId}/read`);
}

export type ReasoningClassification =
  | 'correct_logic_correct_answer'
  | 'correct_logic_wrong_answer'
  | 'wrong_logic_correct_answer'
  | 'wrong_logic_wrong_answer';

export interface ReasoningCheckpointContent {
  classification: ReasoningClassification;
  explanation: string;
}

export interface GrammarDiagnosisContent {
  grammarRule: string;
  grammarFix: string;
}

export interface TrapExplainerContent {
  trap: string;
  explanation: string;
}

export interface CommandOfEvidenceContent {
  supportingLine: string;
  whyCorrect: string;
  whyStudentWrong: string;
}

export interface TransitionsCoachContent {
  logicalRelationship: string;
  whyCorrect: string;
  whyStudentWrong: string;
}

export interface VocabDrillContent {
  word: string;
  sentenceContext: string;
  followUpQuestion: string;
  options: string[]; // exactly 4
  correctOption: string; // "A" | "B" | "C" | "D"
  explanation: string;
}

export interface ConfirmFeedbacks {
  reasoning_checkpoint?: ReasoningCheckpointContent | null;
  grammar_diagnosis?: GrammarDiagnosisContent | null;
  trap_explainer?: TrapExplainerContent | null;
  command_of_evidence?: CommandOfEvidenceContent | null;
  transitions_coach?: TransitionsCoachContent | null;
  vocab_drill?: VocabDrillContent | null;
}

export interface VocabDueItemQuestion {
  source: 'question';
  vocabId: string;
  word: string;
  passageExcerpt: string;
  nextReviewAt: string;
  easeFactor: string;
  reviewCount: number;
  generatedContentId: string;
  content: VocabDrillContent;
}

export interface VocabDueItemTeacher {
  source: 'teacher';
  vocabId: string;
  word: string;
  definition: string;
  passageExcerpt: string;
  nextReviewAt: string | null;
  easeFactor: string;
  reviewCount: number;
}

export type VocabDueItem = VocabDueItemQuestion | VocabDueItemTeacher;

export async function confirmAnswer(
  examId: string,
  questionId: string,
  payload: {
    selectedAnswer?: string | null;
    selectedAnswerText?: string | null;
    confidence: 'sure' | 'eliminated' | 'guessed';
    reasoning?: string;
  },
): Promise<{ isCorrect: boolean; feedbacks: ConfirmFeedbacks; vocabTrackingId: string | null }> {
  const { data } = await apiClient.post(
    `/student/exams/${examId}/questions/${questionId}/confirm`,
    payload,
  );
  return data;
}

export interface NarrativeSubSkill {
  subSkill: string;
  wrong: number;
  total: number;
  flag: boolean;
}

export interface NarrativeContent {
  scoreRange: string | null;
  primaryGap: string;
  narrative: string;
  subSkillBreakdown: NarrativeSubSkill[];
}

export interface MockNarrative {
  id: string;
  examId: string;
  content: NarrativeContent | null;
  modelUsed: string;
  latencyMs: number | null;
  costUsd: string | null;
  status: 'pending' | 'complete' | 'failed';
  createdAt: string;
}

export async function getMockNarrative(examId: string): Promise<MockNarrative> {
  const { data } = await apiClient.get<MockNarrative>(`/student/exams/${examId}/narrative`);
  return data;
}

export async function retryNarrative(examId: string): Promise<void> {
  await apiClient.post(`/student/exams/${examId}/narrative/retry`);
}

export async function reviewTeacherVocab(wordId: string, isCorrect: boolean): Promise<void> {
  await apiClient.post(`/student/vocab/teacher/${wordId}/review`, { isCorrect });
}

export interface WeakAreaPassage {
  subSkill: string;
  setId: string;
  generatedContentId: string;
}

export async function getAvailableSkillPassages(): Promise<WeakAreaPassage[]> {
  const { data } = await apiClient.get<WeakAreaPassage[]>('/student/skill-passages/available');
  return data;
}

export async function getDueVocab(): Promise<VocabDueItem[]> {
  const { data } = await apiClient.get<VocabDueItem[]>('/student/vocab/due');
  return data;
}

export async function reviewVocab(
  vocabId: string,
  isCorrect: boolean,
): Promise<{ ok: boolean; nextReviewAt: string; intervalDays: number }> {
  const { data } = await apiClient.post(`/student/vocab/${vocabId}/review`, { isCorrect });
  return data;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export async function sendChatMessage(params: {
  sessionId?: string;
  userMessage: string;
  examId?: string;
  questionId?: string;
}): Promise<{ sessionId: string; assistantMessage: string }> {
  const { data } = await apiClient.post('/student/chat', params);
  return data;
}

export async function getChatMessages(sessionId: string): Promise<ChatMessage[]> {
  const { data } = await apiClient.get<ChatMessage[]>(`/student/chat/${sessionId}/messages`);
  return data;
}

// ── Profile ──────────────────────────────────────────────────────────────────

/** Null when the student has not set a goal — callers must prompt, not guess. */
export async function getProfile(): Promise<StudentProfile | null> {
  const { data } = await apiClient.get<StudentProfile | null>('/student/profile');
  return data;
}

export async function updateProfile(payload: {
  targetScore?: number | null;
  testDate?: string | null;
}): Promise<StudentProfile> {
  const { data } = await apiClient.put<StudentProfile>('/student/profile', payload);
  return data;
}

// ── Mistake bank ─────────────────────────────────────────────────────────────

/**
 * One question the student has got wrong, with everything needed to learn from
 * it. The correct answer and explanation are included because these come from
 * exams they have already completed and reviewed.
 */
export interface Mistake {
  questionId: string;
  questionType: 'multiple_choice' | 'student_produced_response';
  questionText: string;
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  correctAnswer: 'a' | 'b' | 'c' | 'd' | null;
  correctAnswerText: string | null;
  explanation: string | null;
  skillCode: string | null;
  skillLabel: string | null;
  /** The domain the skill sits under, or the code itself when it is a domain. */
  domainCode: string | null;
  subject: 'english' | 'math';
  difficulty: 'easy' | 'medium' | 'hard' | null;
  missCount: number;
  firstMissedAt: string;
  lastMissedAt: string;
  /** Set when a later correct answer cleared it. Null while it is still open. */
  resolvedAt: string | null;
}

export interface MistakeSummaryRow {
  domainCode: string | null;
  subject: 'english' | 'math';
  openCount: number;
}

export async function getMistakes(filters: {
  subject?: 'english' | 'math';
  skillCode?: string;
  status?: 'open' | 'resolved';
} = {}): Promise<Mistake[]> {
  const { data } = await apiClient.get<Mistake[]>('/student/mistakes', { params: filters });
  return data;
}

export async function getMistakeSummary(): Promise<MistakeSummaryRow[]> {
  const { data } = await apiClient.get<MistakeSummaryRow[]>('/student/mistakes/summary');
  return data;
}

/** Builds a review exam from open mistakes. Resolution happens on submit. */
export async function startMistakePractice(payload: {
  subject?: 'english' | 'math';
  skillCode?: string;
  limit?: number;
}): Promise<{ exam: Exam; questionCount: number }> {
  const { data } = await apiClient.post('/student/mistakes/practice', payload);
  return data;
}

// ── Topic practice ───────────────────────────────────────────────────────────

/** An exam drawn across every published set for one domain or skill. */
export async function startTopicExam(payload: {
  subject: 'english' | 'math';
  skillCode: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  count?: number;
}): Promise<{ exam: Exam; questionCount: number; skill: { code: string; label: string } }> {
  const { data } = await apiClient.post('/student/exams/topic', payload);
  return data;
}
