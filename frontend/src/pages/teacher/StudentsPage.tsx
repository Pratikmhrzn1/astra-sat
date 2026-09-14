import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { getStudents } from '@/api/teacher';
import { IconEmpty, InlineLoader, PageHeader, pageClass, surfaceClass, tableHeadClass, tableRowClass } from '@/components/common';
import { cn, formatDate } from '@/lib/utils';

export default function Students() {
  const navigate = useNavigate();
  const { data: students = [], isLoading } = useQuery({ queryKey: ['teacher', 'students'], queryFn: getStudents });

  if (isLoading) return <InlineLoader />;

  return (
    <div className={pageClass}>
      <PageHeader
        title="My Students"
        subtitle={`${students.length} student${students.length !== 1 ? 's' : ''} assigned`}
        className="mb-6"
      />

      {students.length === 0 ? (
        <IconEmpty icon={Users}>
          <p>No students assigned to you yet.</p>
          <p className="text-[13px]">Contact your admin to assign students to your account.</p>
        </IconEmpty>
      ) : (
        <div className={cn(surfaceClass, 'overflow-hidden')}>
          <div className="grid grid-cols-[2fr_1fr_60px] gap-3 px-[22px] py-3 border-b border-border-soft">
            {['Student', 'Joined', ''].map((c, i) => (
              <span key={i} className={tableHeadClass}>{c}</span>
            ))}
          </div>
          {students.map((s) => (
            <div
              key={s.id}
              onClick={() => navigate(`/teacher/students/${s.id}`)}
              className={cn(tableRowClass, 'grid grid-cols-[2fr_1fr_60px] gap-3 px-[22px] py-3.5 items-center')}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-[34px] h-[34px] rounded-full bg-green-sat/10 text-green-sat flex items-center justify-center text-sm font-bold shrink-0">{s.name.charAt(0).toUpperCase()}</div>
                <div className="min-w-0">
                  <div className="text-[14.5px] font-semibold text-ink truncate">{s.name}</div>
                  <div className="text-xs text-muted truncate">{s.email}</div>
                </div>
              </div>
              <div className="text-[13.5px] text-subtle">{formatDate(s.createdAt)}</div>
              <div className="text-right text-muted text-lg">›</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
