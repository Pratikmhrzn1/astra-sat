import { apiClient } from '@/api/http';

export type FileType = 'audio' | 'video' | 'image' | 'document' | 'other' | 'note';

export interface LibraryItem {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string | null;
  fileType: FileType;
  fileName: string | null;
  noteContent: string | null;
  hidden: boolean;
  uploadedBy: string | null;
  uploaderName: string | null;
  createdAt: string;
}

export async function getLibraryItems(): Promise<LibraryItem[]> {
  const { data } = await apiClient.get<LibraryItem[]>('/library');
  return data;
}

export async function uploadFile(file: File): Promise<{ url: string; fileName: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post<{ url: string; fileName: string }>('/library/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function createLibraryItem(payload: {
  title: string;
  description?: string;
  fileType: FileType;
  fileUrl?: string;
  fileName?: string;
  noteContent?: string;
}): Promise<LibraryItem> {
  const { data } = await apiClient.post<LibraryItem>('/library', payload);
  return data;
}

export async function updateLibraryItem(
  id: string,
  payload: { title?: string; description?: string | null; noteContent?: string | null; hidden?: boolean }
): Promise<LibraryItem> {
  const { data } = await apiClient.patch<LibraryItem>(`/library/${id}`, payload);
  return data;
}

export async function deleteLibraryItem(id: string): Promise<void> {
  await apiClient.delete(`/library/${id}`);
}
