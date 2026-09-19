import { pgEnum } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['student', 'teacher', 'admin']);

export const subjectEnum = pgEnum('subject', ['english', 'math']);

export const examTypeEnum = pgEnum('exam_type', ['individual', 'mock_english', 'mock_math']);

export const examStatusEnum = pgEnum('exam_status', ['in_progress', 'completed', 'abandoned']);

export const mockStatusEnum = pgEnum('mock_status', ['in_progress', 'completed']);

export const answerEnum = pgEnum('answer_choice', ['a', 'b', 'c', 'd']);

export const questionTypeEnum = pgEnum('question_type', ['multiple_choice', 'student_produced_response']);

export const subSkillEnum = pgEnum('sub_skill', ['grammar', 'inference', 'command_of_evidence', 'vocab_in_context', 'transitions']);

export const subSkillSourceEnum = pgEnum('sub_skill_source', ['ai_suggested', 'human_confirmed']);

export const questionDifficultyEnum = pgEnum('question_difficulty', ['easy', 'medium', 'hard']);

export const feedbackTypeEnum = pgEnum('feedback_type', ['reasoning_checkpoint', 'grammar_diagnosis', 'trap_explainer', 'command_of_evidence', 'transitions_coach', 'vocab_drill']);

export const contentTypeEnum = pgEnum('content_type', ['vocab_quiz', 'skill_passage']);

export const qualityFlagEnum = pgEnum('quality_flag', ['pending', 'approved', 'rejected']);

export const narrativeStatusEnum = pgEnum('narrative_status', ['pending', 'complete', 'failed']);

export const chatRoleEnum = pgEnum('chat_role', ['user', 'assistant']);

export const feedbackCategoryEnum = pgEnum('feedback_category', ['bug', 'suggestion', 'other']);

export const surveyQuestionTypeEnum = pgEnum('survey_question_type', ['single_choice', 'multi_choice', 'short_text', 'scale']);

export const fileTypeEnum = pgEnum('file_type', ['audio', 'video', 'image', 'document', 'other', 'note']);
