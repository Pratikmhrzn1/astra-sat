import { useQuery } from '@tanstack/react-query';
import { cn } from '@/shared/lib/utils';
import { getSkills, skillsQueryKey, type SkillNode } from '@/entities/skill/api';

/**
 * Domain → skill picker, fed by the server's taxonomy.
 *
 * Rendered as `<optgroup>`s so a domain and the skills beneath it stay visually
 * distinct, and so a question can be tagged at *either* level: domain-only is a
 * legitimate choice, and is all the classifier ever assigns for Math.
 *
 * Filtered by subject, because a Math question tagged "Transitions" would be
 * accepted by the API — the codes are global — and be quietly wrong.
 */
export function SkillSelect({
  subject,
  value,
  onChange,
  disabled,
  className,
}: {
  subject: 'english' | 'math';
  value: string | null;
  onChange: (skillCode: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { data: tree = [], isLoading } = useQuery({
    queryKey: skillsQueryKey(),
    queryFn: () => getSkills(),
    // Reference data: it changes only when the taxonomy itself does.
    staleTime: 60 * 60 * 1000,
  });

  const domains = tree.filter((domain) => domain.subject === subject);

  return (
    <select
      value={value ?? ''}
      disabled={disabled || isLoading}
      onChange={(e) => onChange(e.target.value || null)}
      className={cn('w-full h-10 px-3 border border-border rounded-[10px] bg-white text-ink text-sm outline-none', className)}
    >
      <option value="">{isLoading ? 'Loading topics…' : '— Untagged'}</option>
      {domains.map((domain) => (
        <SkillOptions key={domain.code} domain={domain} />
      ))}
    </select>
  );
}

/**
 * A domain, then its skills.
 *
 * The domain itself is the group's first option rather than only a heading —
 * `<optgroup label>` is not selectable, and tagging at domain level has to
 * remain possible.
 */
function SkillOptions({ domain }: { domain: SkillNode }) {
  return (
    <optgroup label={domain.label}>
      <option value={domain.code}>{domain.label} (whole domain)</option>
      {domain.skills.map((skill) => (
        <option key={skill.code} value={skill.code}>
          &nbsp;&nbsp;{skill.label}
        </option>
      ))}
    </optgroup>
  );
}
