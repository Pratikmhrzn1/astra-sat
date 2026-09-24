import { apiTransport } from '@/shared/api/http';

export type AssetKind = 'audio' | 'video' | 'image' | 'document' | 'other' | 'note';

export interface ResourceItem {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string | null;
  fileType: AssetKind;
  fileName: string | null;
  noteContent: string | null;
  hidden: boolean;
  uploadedBy: string | null;
  uploaderName: string | null;
  createdAt: string;
}

export async function fetchResourceItems(): Promise<ResourceItem[]> {
  const { data } = await apiTransport.get<ResourceItem[]>('/library');
  return data;
}

export async function uploadAsset(file: File): Promise<{ url: string; fileName: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiTransport.post<{ url: string; fileName: string }>('/library/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function addResourceItem(payload: {
  title: string;
  description?: string;
  fileType: AssetKind;
  fileUrl?: string;
  fileName?: string;
  noteContent?: string;
}): Promise<ResourceItem> {
  const { data } = await apiTransport.post<ResourceItem>('/library', payload);
  return data;
}

export async function editResourceItem(
  id: string,
  payload: { title?: string; description?: string | null; noteContent?: string | null; hidden?: boolean }
): Promise<ResourceItem> {
  const { data } = await apiTransport.patch<ResourceItem>(`/library/${id}`, payload);
  return data;
}

export async function removeResourceItem(id: string): Promise<void> {
  await apiTransport.delete(`/library/${id}`);
}
