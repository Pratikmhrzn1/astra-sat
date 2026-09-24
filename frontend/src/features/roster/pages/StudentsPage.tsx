import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { fetchLearners } from '@/features/roster/api';
import { IconBlank, InlineSpinner, ScreenMasthead, screenStyle, surfaceStyle, tableHeadStyle, tableRowStyle } from '@/shared/ui';
import { classes, renderDate } from '@/shared/lib/utils';

export default function Learners() {
  const navigate = useNavigate();
  const { data: students = [], isLoading } = useQuery({ queryKey: ['teacher', 'students'], queryFn: fetchLearners });

  if (isLoading) return <InlineSpinner />;

  return (
    <div className={screenStyle}>
      <ScreenMasthead
        title="My Students"
        subtitle={`${students.length} student${students.length !== 1 ? 's' : ''} assigned`}
        className="mb-6"
      />

      {students.length === 0 ? (
        <IconBlank icon={Users}>
          <p>No students assigned to you yet.</p>
          <p className="text-[13px]">Contact your admin to assign students to your account.</p>
        </IconBlank>
      ) : (
        <div className={classes(surfaceStyle, 'overflow-hidden')}>
          <div className="grid grid-cols-[2fr_1fr_60px] gap-3 px-[22px] py-3 border-b border-border-soft">
            {['Student', 'Joined', ''].map((c, i) => (
              <span key={i} className={tableHeadStyle}>{c}</span>
            ))}
          </div>
          {students.map((s) => (
            <div
              key={s.id}
              onClick={() => navigate(`/teacher/students/${s.id}`)}
              className={classes(tableRowStyle, 'grid grid-cols-[2fr_1fr_60px] gap-3 px-[22px] py-3.5 items-center')}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-[34px] h-[34px] rounded-full bg-green-sat/10 text-green-sat flex items-center justify-center text-sm font-bold shrink-0">{s.name.charAt(0).toUpperCase()}</div>
                <div className="min-w-0">
                  <div className="text-[14.5px] font-semibold text-ink truncate">{s.name}</div>
                  <div className="text-xs text-muted truncate">{s.email}</div>
                </div>
              </div>
              <div className="text-[13.5px] text-subtle">{renderDate(s.createdAt)}</div>
              <div className="text-right text-muted text-lg">›</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
