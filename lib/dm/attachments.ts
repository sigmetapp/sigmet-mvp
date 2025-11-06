import { supabase } from '@/lib/supabaseClient';
import { inferAttachmentType, type AttachmentType, DM_ATTACHMENTS_BUCKET } from '@/lib/dm/attachmentUtils';

export type DmAttachment = {
  type: AttachmentType;
  path: string; // Storage path within dm-attachments bucket
  size: number; // Bytes
  mime: string; // e.g., image/png
  width?: number;
  height?: number;
};

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

export async function uploadAttachment(file: File): Promise<DmAttachment> {
  const mime = file.type || 'application/octet-stream';
  const size = file.size;
  const type = inferAttachmentType(mime);

  // Request signed upload URL from server to avoid client-side RLS issues
  const signResponse = await fetch('/api/dms/attachments.sign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileName: file.name,
      contentType: mime,
      fileSize: size,
    }),
  });

  if (!signResponse.ok) {
    const errorBody = await signResponse.json().catch(() => ({}));
    throw new Error(errorBody.error || 'Failed to prepare attachment upload. Please try again.');
  }

  const { bucket, path, token } = (await signResponse.json()) as {
    bucket: string;
    path: string;
    token: string;
  };

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(path, token, file, {
      contentType: mime,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message || 'Failed to upload file. Please try again.');
  }

  const dims = await getImageDimensions(file);

  return {
    type,
    path,
    size,
    mime,
    ...(dims ? { width: dims.width, height: dims.height } : {}),
  };
}

export async function getSignedUrlForPath(path: string, expiresInSeconds = 60): Promise<string> {
  // Try dm-attachments bucket first
  let { data, error } = await supabase.storage
    .from(DM_ATTACHMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  
  // If bucket not found, try assets bucket
  if (error && (
    error.message?.toLowerCase().includes('not found') || 
    error.message?.toLowerCase().includes('bucket not found') ||
    (error as any).statusCode === '404' ||
    (error as any).statusCode === 404 ||
    error.message?.includes('The resource was not found')
  )) {
    const result = await supabase.storage
      .from('assets')
      .createSignedUrl(path, expiresInSeconds);
    if (!result.error && result.data?.signedUrl) {
      return result.data.signedUrl;
    }
  }
  
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Failed to create signed URL');
  }
  return data.signedUrl;
}

export async function getSignedUrlForAttachment(att: Pick<DmAttachment, 'path'>, expiresInSeconds = 60): Promise<string> {
  return getSignedUrlForPath(att.path, expiresInSeconds);
}
