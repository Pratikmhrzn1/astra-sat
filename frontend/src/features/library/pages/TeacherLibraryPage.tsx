import { useSessionVault } from '@/features/auth';
import { ResourceManager } from '@/features/library/components/LibraryManager';

export default function TeacherResource() {
  const { user } = useSessionVault();
  return (
    <ResourceManager
      subtitle="Guides, lessons and resources for your students."
      emptyHint="Add your first resource using the button above."
      hideLabel="Hide from students"
      noteExample="Check out this Khan Academy video on linear equations:"
      // A teacher edits only what they uploaded; admin items are read-only here.
      canEdit={(item) => item.uploadedBy === user?.id}
    />
  );
}
