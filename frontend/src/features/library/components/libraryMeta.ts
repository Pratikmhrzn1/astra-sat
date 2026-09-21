import type { FileType } from '@/features/library/api';

/** How each resource type is labelled and coloured, shared by every library view. */
export const TYPE_META: Record<FileType, { tone: string; label: string; icon: string }> = {
  audio:    { tone: 'text-gold',       label: 'Audio',    icon: '🎵' },
  video:    { tone: 'text-blue-sat',   label: 'Video',    icon: '🎬' },
  image:    { tone: 'text-green-sat',  label: 'Image',    icon: '🖼️' },
  document: { tone: 'text-accent-text', label: 'Document', icon: '📄' },
  other:    { tone: 'text-stone',      label: 'Other',    icon: '📎' },
  note:     { tone: 'text-[#7C3AED]',  label: 'Note',     icon: '📝' },
};

export type UploadableType = Exclude<FileType, 'note'>;

export const FILE_TYPES: UploadableType[] = ['audio', 'video', 'image', 'document', 'other'];
export const LIBRARY_FILTERS = ['All', 'Audio', 'Video', 'Image', 'Document', 'Note', 'Other'];

const EXT_MAP: Record<string, UploadableType> = {
  pdf: 'document', doc: 'document', docx: 'document', ppt: 'document', pptx: 'document',
  xls: 'document', xlsx: 'document', txt: 'document', csv: 'document', rtf: 'document',
  mp4: 'video', mov: 'video', avi: 'video', webm: 'video', mkv: 'video', flv: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', m4a: 'audio', aac: 'audio',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image',
};

export function inferFileType(filename: string): UploadableType {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MAP[ext] ?? 'other';
}

export const libraryInputClass = 'w-full h-10 px-3 border border-field rounded-[10px] text-sm bg-white outline-none';
export const libraryTextareaClass = 'w-full px-3 border border-field rounded-[10px] text-sm bg-white outline-none resize-y';
export const libraryLabelClass = 'block text-[12.5px] font-semibold mb-[5px] text-subtle';
export const libraryErrorClass = 'bg-[#DC2626]/[.08] text-[#DC2626] px-3 py-[9px] rounded-lg text-[13px]';
