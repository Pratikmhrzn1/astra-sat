import { useAuthStore } from '@/features/auth';
import { LibraryManager } from '@/features/library/components/LibraryManager';

export default function TeacherLibrary() {
  const { user } = useAuthStore();
  return (
    <LibraryManager
      subtitle="Guides, lessons and resources for your students."
      emptyHint="Add your first resource using the button above."
      hideLabel="Hide from students"
      noteExample="Check out this Khan Academy video on linear equations:"
      // A teacher edits only what they uploaded; admin items are read-only here.
      canEdit={(item) => item.uploadedBy === user?.id}
    />
  );
}
