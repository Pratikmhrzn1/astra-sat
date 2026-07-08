import { apiClient } from './client';

export type FileType = 'audio' | 'video' | 'image' | 'document' | 'other';

export interface LibraryItem {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string;
  fileType: FileType;
  mimeType: string | null;
  fileName: string | null;
  hidden: boolean;
  uploadedBy: string | null;
  uploaderName: string | null;
  createdAt: string;
}

export async function getLibraryItems(): Promise<LibraryItem[]> {
  const { data } = await apiClient.get<LibraryItem[]>('/library');
  return data;
}

export async function createLibraryItem(payload: {
  title: string;
  description?: string;
  fileUrl: string;
  fileType: FileType;
  mimeType?: string;
  fileName?: string;
}): Promise<LibraryItem> {
  const { data } = await apiClient.post<LibraryItem>('/library', payload);
  return data;
}

export async function updateLibraryItem(
  id: string,
  payload: { title?: string; description?: string | null; hidden?: boolean }
): Promise<LibraryItem> {
  const { data } = await apiClient.patch<LibraryItem>(`/library/${id}`, payload);
  return data;
}

export async function deleteLibraryItem(id: string): Promise<void> {
  await apiClient.delete(`/library/${id}`);
}
