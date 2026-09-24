import type { AssetKind } from '@/features/library/api';

/** How each resource type is labelled and coloured, shared by every library view. */
export const ASSET_META: Record<AssetKind, { tone: string; label: string; icon: string }> = {
  audio:    { tone: 'text-gold',       label: 'Audio',    icon: '🎵' },
  video:    { tone: 'text-blue-sat',   label: 'Video',    icon: '🎬' },
  image:    { tone: 'text-green-sat',  label: 'Image',    icon: '🖼️' },
  document: { tone: 'text-accent-text', label: 'Document', icon: '📄' },
  other:    { tone: 'text-stone',      label: 'Other',    icon: '📎' },
  note:     { tone: 'text-[#7C3AED]',  label: 'Note',     icon: '📝' },
};

export type UploadableKind = Exclude<AssetKind, 'note'>;

export const ASSET_KINDS: UploadableKind[] = ['audio', 'video', 'image', 'document', 'other'];
export const RESOURCE_FILTERS = ['All', 'Audio', 'Video', 'Image', 'Document', 'Note', 'Other'];

const EXT_MAP: Record<string, UploadableKind> = {
  pdf: 'document', doc: 'document', docx: 'document', ppt: 'document', pptx: 'document',
  xls: 'document', xlsx: 'document', txt: 'document', csv: 'document', rtf: 'document',
  mp4: 'video', mov: 'video', avi: 'video', webm: 'video', mkv: 'video', flv: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', m4a: 'audio', aac: 'audio',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image',
};

export function inferAssetKind(filename: string): UploadableKind {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MAP[ext] ?? 'other';
}

export const libraryFieldClass = 'w-full h-10 px-3 border border-field rounded-[10px] text-sm bg-white outline-none';
export const resourceTextareaStyle = 'w-full px-3 border border-field rounded-[10px] text-sm bg-white outline-none resize-y';
export const libraryCaptionClass = 'block text-[12.5px] font-semibold mb-[5px] text-subtle';
export const resourceErrorStyle = 'bg-[#DC2626]/[.08] text-[#DC2626] px-3 py-[9px] rounded-lg text-[13px]';
