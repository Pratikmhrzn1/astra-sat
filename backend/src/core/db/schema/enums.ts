import { pgEnum } from 'drizzle-orm/pg-core';

// `trial` and `student` are both learners; they differ only in the per-account
// `expiry_date` and `daily_test_limit`, never in what they can reach.
export const roleChoices = pgEnum('role', ['trial', 'student', 'teacher', 'admin']);

export const accountStatusChoices = pgEnum('account_status', ['pending', 'active', 'rejected', 'deactivated']);

export const subjectChoices = pgEnum('subject', ['english', 'math']);

export const assessmentTypeChoices = pgEnum('exam_type', ['individual', 'mock_english', 'mock_math']);

export const assessmentStatusChoices = pgEnum('exam_status', ['in_progress', 'completed', 'abandoned']);

export const mockStatusChoices = pgEnum('mock_status', ['in_progress', 'completed']);

export const answerChoices = pgEnum('answer_choice', ['a', 'b', 'c', 'd']);

export const questionTypeChoices = pgEnum('question_type', ['multiple_choice', 'student_produced_response']);

export const subSkillChoices = pgEnum('sub_skill', ['grammar', 'inference', 'command_of_evidence', 'vocab_in_context', 'transitions']);

export const subSkillSourceChoices = pgEnum('sub_skill_source', ['ai_suggested', 'human_confirmed']);

export const itemDifficultyChoices = pgEnum('question_difficulty', ['easy', 'medium', 'hard']);

export const feedbackKindChoices = pgEnum('feedback_type', ['reasoning_checkpoint', 'grammar_diagnosis', 'trap_explainer', 'command_of_evidence', 'transitions_coach', 'vocab_drill']);

export const contentKindChoices = pgEnum('content_type', ['vocab_quiz', 'skill_passage']);

export const qualityFlagChoices = pgEnum('quality_flag', ['pending', 'approved', 'rejected']);

export const narrativeStatusChoices = pgEnum('narrative_status', ['pending', 'complete', 'failed']);

export const chatRoleChoices = pgEnum('chat_role', ['user', 'assistant']);

export const reportCategoryChoices = pgEnum('feedback_category', ['bug', 'suggestion', 'other']);

export const intakeQuestionTypeChoices = pgEnum('survey_question_type', ['single_choice', 'multi_choice', 'short_text', 'scale']);

export const fileKindChoices = pgEnum('file_type', ['audio', 'video', 'image', 'document', 'other', 'note']);
