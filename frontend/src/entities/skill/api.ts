import { apiTransport } from '@/shared/api/http';

/**
 * The SAT domain/skill tree, served to every signed-in role.
 *
 * Read from the server rather than hardcoded in the client. The five-value
 * `SUB_SKILL_OPTIONS` list this replaced covered only Reading and Writing, so
 * Math questions could not be tagged at all — and two other pages kept their own
 * parallel copies of the domain names that had to be edited in step.
 */

export interface CompetencyNode {
  code: string;
  label: string;
  subject: 'english' | 'math';
  /** Published questions tagged with this exact code. Only with `withCounts`. */
  questionCount?: number;
  /** Published questions on this node or anything beneath it. Only with `withCounts`. */
  totalQuestionCount?: number;
  skills: CompetencyNode[];
}

export async function fetchCompetencys(withCounts = false): Promise<CompetencyNode[]> {
  const { data } = await apiTransport.get<CompetencyNode[]>('/skills', {
    params: withCounts ? { withCounts: 'true' } : undefined,
  });
  return data;
}

/** Query key for the tree. Counts change as content is authored, so they key separately. */
export const competencyQueryKey = (withCounts = false) => ['skills', { withCounts }] as const;

/** Flattens the tree to `code -> label`, for rendering a tag someone already saved. */
export function skillCaptions(tree: CompetencyNode[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const domain of tree) {
    labels.set(domain.code, domain.label);
    for (const skill of domain.skills) labels.set(skill.code, skill.label);
  }
  return labels;
}

/**
 * A code the taxonomy no longer contains still has to render as something. Falls
 * back to de-snake-casing the code rather than showing a blank.
 */
export function skillCaption(tree: CompetencyNode[], code: string | null | undefined): string {
  if (!code) return 'Untagged';
  return skillCaptions(tree).get(code) ?? code.replace(/_/g, ' ');
}
