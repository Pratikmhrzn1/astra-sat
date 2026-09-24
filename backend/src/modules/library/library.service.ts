import fs from 'fs';
import path from 'path';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { settings } from '../../core/config/env';
import { database } from '../../core/db';
import { libraryItems, users } from '../../core/db/schema';
import { notPermitted, missing } from '../../core/errors';
import { toPublicFileUrl } from '../../core/lib/url';

/**
 * Shared library of teaching material: uploaded files and written notes.
 *
 * Visibility and edit rights differ. Any signed-in user reads the library, but
 * hidden items are admin-only; teachers may edit and delete what they uploaded,
 * admins anything.
 */

export const addItemRules = z.union([
  z.object({
    title: z.string().min(1).max(200).trim(),
    description: z.string().max(2000).trim().optional(),
    fileType: z.enum(['note']),
    noteContent: z.string().min(1).max(50000),
    fileName: z.string().max(300).optional(),
  }),
  z.object({
    title: z.string().min(1).max(200).trim(),
    description: z.string().max(2000).trim().optional(),
    fileType: z.enum(['audio', 'video', 'image', 'document', 'other']),
    fileUrl: z.string().url(),
    fileName: z.string().max(300).optional(),
  }),
]);
export type CreateItemPayload = z.infer<typeof addItemRules>;

export const editItemRules = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(2000).trim().nullable().optional(),
  noteContent: z.string().max(50000).nullable().optional(),
  hidden: z.boolean().optional(),
});
export type UpdateItemPayload = z.infer<typeof editItemRules>;

const itemColumns = {
  id: libraryItems.id,
  title: libraryItems.title,
  description: libraryItems.description,
  fileUrl: libraryItems.fileUrl,
  fileType: libraryItems.fileType,
  fileName: libraryItems.fileName,
  noteContent: libraryItems.noteContent,
  hidden: libraryItems.hidden,
  uploadedBy: libraryItems.uploadedBy,
  uploaderName: users.name,
  createdAt: libraryItems.createdAt,
} as const;

export async function collectItems(role: string) {
  const query = database
    .select(itemColumns)
    .from(libraryItems)
    .leftJoin(users, eq(libraryItems.uploadedBy, users.id));

  // Hiding is a soft delete for everyone but admins, who need to see it to undo it.
  const rows =
    role === 'admin'
      ? await query.orderBy(desc(libraryItems.createdAt))
      : await query.where(eq(libraryItems.hidden, false)).orderBy(desc(libraryItems.createdAt));

  return rows.map((row) => ({ ...row, fileUrl: toPublicFileUrl(row.fileUrl) }));
}

export async function addItem(uploadedBy: string, input: CreateItemPayload) {
  const [row] = await database.insert(libraryItems).values({ ...input, uploadedBy }).returning();
  return row;
}

/** Admins may edit anything; teachers only what they uploaded. */
async function findEditableItem(itemId: string, user: { id: string; role: string }) {
  const [item] = await database.select().from(libraryItems).where(eq(libraryItems.id, itemId)).limit(1);
  if (!item) throw missing('Item not found');
  if (user.role === 'teacher' && item.uploadedBy !== user.id) {
    throw notPermitted('You can only edit your own items');
  }
  return item;
}

export async function editItem(
  itemId: string,
  user: { id: string; role: string },
  input: UpdateItemPayload,
) {
  await findEditableItem(itemId, user);
  const [updated] = await database
    .update(libraryItems)
    .set(input)
    .where(eq(libraryItems.id, itemId))
    .returning();
  return updated;
}

export async function removeItem(itemId: string, user: { id: string; role: string }): Promise<void> {
  const item = await findEditableItem(itemId, user);
  if (user.role === 'teacher' && item.uploadedBy !== user.id) {
    throw notPermitted('You can only delete your own items');
  }

  removeUploadedFile(item.fileUrl);
  await database.delete(libraryItems).where(eq(libraryItems.id, itemId));
}

/**
 * Best-effort removal of the backing file so deleting an item does not leak
 * disk space. Only paths under /uploads are touched, and only by basename, so a
 * crafted URL cannot make this delete something outside the upload directory.
 * A missing or externally hosted file is not an error.
 */
function removeUploadedFile(fileUrl: string | null): void {
  if (!fileUrl) return;

  let pathname: string;
  try {
    pathname = new URL(fileUrl).pathname;
  } catch {
    // Stored as a relative path rather than an absolute URL.
    pathname = fileUrl;
  }
  if (!pathname.startsWith('/uploads/')) return;

  try {
    fs.unlinkSync(path.join(settings.uploads.dir, path.basename(pathname)));
  } catch {
    // Already gone, or never written to this host.
  }
}
