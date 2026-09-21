import { useQuery } from '@tanstack/react-query';
import { getLibraryItems, type LibraryItem } from '@/features/library';
import { cn } from '@/shared/lib/utils';

/** Choose a question diagram from the images already uploaded to the Library. */
export function ImagePickerModal({ selectedUrl, onPick, onClose }: {
  selectedUrl: string | null;
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const { data: libraryImages, isLoading } = useQuery({
    queryKey: ['library-items'],
    queryFn: () => getLibraryItems().then((items) => items.filter((i) => i.fileType === 'image' && i.fileUrl)),
  });

  return (
    <div className="fixed inset-0 bg-ink/50 z-[200] flex items-center justify-center p-6" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-[680px] max-h-[80vh] flex flex-col shadow-[0_20px_60px_rgba(11,11,14,0.3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-[18px] border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-ink m-0">Choose an image from library</h3>
            <p className="text-[12.5px] text-muted mt-[3px] mb-0">Upload images in the Library first, then select them here.</p>
          </div>
          <button onClick={onClose} className="bg-transparent cursor-pointer text-xl text-muted p-1 leading-none">×</button>
        </div>
        <div className="scrollarea flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="text-center py-10 text-muted text-sm">Loading images…</div>
          ) : !libraryImages || libraryImages.length === 0 ? (
            <div className="text-center py-10 text-muted text-sm">
              No images in library yet. Upload images in the Library page first.
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
              {(libraryImages as LibraryItem[]).map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => onPick(img.fileUrl!)}
                  className={cn(
                    'rounded-[10px] overflow-hidden cursor-pointer bg-[#F8F7F4] p-0 flex flex-col',
                    selectedUrl === img.fileUrl ? 'border-[2.5px] border-ember' : 'border-[1.5px] border-border',
                  )}
                >
                  <img src={img.fileUrl!} alt={img.title} className="w-full h-[110px] object-cover block" />
                  <div className="px-2.5 py-[7px] text-[11.5px] font-semibold text-ink text-left truncate">{img.title}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
