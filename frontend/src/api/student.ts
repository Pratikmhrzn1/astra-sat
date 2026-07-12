import { apiClient } from './client';

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
  setId: string;
  type: 'individual' | 'mock_english' | 'mock_math';
  status: 'in_progress' | 'completed' | 'abandoned';
  score: number | null;
  totalQuestions: number;
  timeSpentSeconds: number | null;
  startedAt: string;
  completedAt: string | null;
}

export interface ExamWithSet extends Exam {
  setTitle: string;
  subject: 'english' | 'math';
}

export interface MockTest {
  id: string;
  studentId: string;
  englishExamId: string | null;
  mathExamId: string | null;
  status: 'in_progress' | 'completed';
  startedAt: string;
  completedAt: string | null;
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
  mathExamId: string | null;
  englishExamId: string | null;
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

export interface VocabDueItem {
  vocabId: string;
  word: string;
  passageExcerpt: string;
  nextReviewAt: string;
  easeFactor: string;
  reviewCount: number;
  generatedContentId: string;
  content: VocabDrillContent;
}

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
