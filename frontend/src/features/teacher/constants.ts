import type { SubSkill } from '@/features/teacher/api/teacher.api';

/**
 * The sub-skill taxonomy, with the labels teachers see.
 *
 * Tagging matters beyond reporting: a question's sub-skill decides which AI
 * feedback types fire for it and which weaknesses trigger extra practice.
 */
export const SUB_SKILL_OPTIONS: { value: SubSkill; label: string }[] = [
  { value: 'grammar', label: 'Grammar' },
  { value: 'inference', label: 'Inference / Main Idea' },
  { value: 'command_of_evidence', label: 'Command of Evidence' },
  { value: 'vocab_in_context', label: 'Vocabulary in Context' },
  { value: 'transitions', label: 'Transitions / Rhetoric' },
];
