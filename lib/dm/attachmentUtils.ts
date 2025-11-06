export const DM_ATTACHMENTS_BUCKET = 'dm-attachments';

export type AttachmentType = 'image' | 'video' | 'audio' | 'file';

export function inferAttachmentType(mime: string): AttachmentType {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function getExtensionFromName(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx) : '';
}

export function generateAttachmentPath(userId: string, mime: string, originalName: string): string {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const sanitized = sanitizeFilename(originalName);
  const ext = getExtensionFromName(sanitized) || (mime ? `.${mime.split('/')[1]}` : '');
  const uuid = createUuid();
  return `dms/${userId}/${yyyy}/${mm}/${uuid}${ext}`;
}

function createUuid(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
