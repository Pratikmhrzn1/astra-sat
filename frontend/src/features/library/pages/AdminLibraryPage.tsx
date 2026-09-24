import { ResourceManager } from '@/features/library/components/LibraryManager';

export default function AdminResource() {
  return (
    <ResourceManager
      subtitle="Manage resources for students and teachers."
      emptyHint="Add your first library item using the button above."
      hideLabel="Hide from students and teachers"
      noteExample="Check out this Khan Academy video:"
      canEdit={() => true}
      showUploader
    />
  );
}
