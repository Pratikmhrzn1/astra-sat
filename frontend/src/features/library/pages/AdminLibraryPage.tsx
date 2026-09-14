import { LibraryManager } from '@/features/library/components/LibraryManager';

export default function AdminLibrary() {
  return (
    <LibraryManager
      subtitle="Manage resources for students and teachers."
      emptyHint="Add your first library item using the button above."
      hideLabel="Hide from students and teachers"
      noteExample="Check out this Khan Academy video:"
      canEdit={() => true}
      showUploader
    />
  );
}
