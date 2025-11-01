import { supabase } from '@/lib/supabaseClient';

export const DM_ATTACHMENTS_BUCKET = 'posts'; // Using posts bucket as it exists

export type DmAttachment = {
  type: 'image' | 'video' | 'audio' | 'file';
  path: string; // Storage path within dm-attachments bucket
  size: number; // Bytes
  mime: string; // e.g., image/png
  width?: number;
  height?: number;
};

function inferAttachmentType(mime: string): DmAttachment['type'] {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}

async function getImageDimensions(file: File): Promise<{ width: number; height: number } | undefined> {
  if (!file.type.startsWith('image/')) return undefined;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const dims = { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
      URL.revokeObjectURL(url);
      resolve(dims);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
    img.src = url;
  });
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getExtensionFromName(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx) : '';
}

export async function uploadAttachment(file: File): Promise<DmAttachment> {
  const mime = file.type || 'application/octet-stream';
  const size = file.size;
  const type = inferAttachmentType(mime);

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id || 'anon';

  // path: dm-attachments/userId/YYYY/MM/<uuid><ext>
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const ext = getExtensionFromName(sanitizeFilename(file.name)) || (mime && `.${mime.split('/')[1]}`) || '';
  const uuid = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `${now.getTime()}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `dm-attachments/${userId}/${yyyy}/${mm}/${uuid}${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(DM_ATTACHMENTS_BUCKET)
    .upload(path, file, { contentType: mime, upsert: false });

  if (uploadErr) {
    throw new Error(uploadErr.message || 'Failed to upload');
  }

  const dims = await getImageDimensions(file);

  const attachment: DmAttachment = {
    type,
    path,
    size,
    mime,
    ...(dims ? { width: dims.width, height: dims.height } : {}),
  };

  return attachment;
}

export async function getSignedUrlForPath(path: string, expiresInSeconds = 60): Promise<string> {
  const { data, error } = await supabase.storage
    .from(DM_ATTACHMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Failed to create signed URL');
  return data.signedUrl;
}

export async function getSignedUrlForAttachment(att: Pick<DmAttachment, 'path'>, expiresInSeconds = 60): Promise<string> {
  return getSignedUrlForPath(att.path, expiresInSeconds);
}
