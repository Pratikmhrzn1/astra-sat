import { useQuery } from '@tanstack/react-query';
import { Users, MessageSquare, BookOpen } from 'lucide-react';
import { getStudents, getSentFeedback, getQuestionSets } from '@/api/teacher';
import { useAuthStore } from '@/store/auth';
import { InlineLoader, pageClass, surfaceClass, tableRowClass } from '@/components/common';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

export default function TeacherDashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const { data: students = [], isLoading } = useQuery({ queryKey: ['teacher', 'students'], queryFn: getStudents });
  const { data: sentFeedback = [] } = useQuery({ queryKey: ['teacher', 'feedback'], queryFn: getSentFeedback });
  const { data: sets = [] } = useQuery({ queryKey: ['teacher', 'question-sets'], queryFn: getQuestionSets });

  if (isLoading) return <InlineLoader />;

  const statCards = [
    { label: 'Assigned Students', value: students.length, icon: Users, tile: 'bg-green-sat/[.08] text-green-sat' },
    { label: 'Feedback Sent', value: sentFeedback.length, icon: MessageSquare, tile: 'bg-ember/[.08] text-accent-text' },
    { label: 'Question Sets', value: sets.length, icon: BookOpen, tile: 'bg-blue-sat/[.08] text-blue-sat' },
  ];

  return (
    <div className={pageClass}>
      <div className="mb-7">
        <div className="text-[13px] text-muted mb-1">Teacher Portal</div>
        <h1 className="font-display font-semibold text-[32px] sm:text-[44px] m-0 tracking-[-0.02em] text-ink">Welcome, {user?.name}</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-7">
        {statCards.map(({ label, value, icon: Icon, tile }) => (
          <div key={label} className={cn(surfaceClass, 'px-[22px] py-5 flex items-center gap-4')}>
            <div className={cn('w-[42px] h-[42px] rounded-xl flex items-center justify-center shrink-0', tile)}>
              <Icon size={20} />
            </div>
            <div>
              <div className="font-display font-semibold text-[38px] leading-none text-ink">{value}</div>
              <div className="text-xs font-semibold text-muted mt-1">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={cn(surfaceClass, 'overflow-hidden')}>
        <div className="px-[22px] py-4 border-b border-border-soft flex items-center justify-between">
          <h2 className="text-base font-semibold text-ink m-0">My Students</h2>
          {students.length > 0 && (
            <button onClick={() => navigate('/teacher/students')} className="text-[13px] font-semibold text-accent-text bg-transparent cursor-pointer">View all →</button>
          )}
        </div>
        {students.length === 0 ? (
          <div className="px-[22px] py-12 text-center text-muted text-sm">No students assigned yet.</div>
        ) : (
          <div>
            {students.slice(0, 5).map((s) => (
              <div key={s.id} onClick={() => navigate(`/teacher/students/${s.id}`)} className={cn(tableRowClass, 'flex items-center gap-3.5 px-[22px] py-3.5')}>
                <div className="w-[34px] h-[34px] rounded-full bg-sunken text-ink flex items-center justify-center text-sm font-bold shrink-0">{s.name.charAt(0).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14.5px] font-semibold text-ink">{s.name}</div>
                  <div className="text-xs text-muted">{s.email}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
