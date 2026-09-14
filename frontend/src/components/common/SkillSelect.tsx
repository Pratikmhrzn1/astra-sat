import { useQuery } from '@tanstack/react-query';
import { getSkills, skillsQueryKey, type SkillNode } from '@/api/skills';

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
  style,
}: {
  subject: 'english' | 'math';
  value: string | null;
  onChange: (skillCode: string | null) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
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
      style={{
        width: '100%', height: 40, padding: '0 12px', border: '1px solid #E7E4DE',
        borderRadius: 10, background: '#fff', color: '#0B0B0E', fontSize: 14,
        fontFamily: 'inherit', outline: 'none', ...style,
      }}
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
