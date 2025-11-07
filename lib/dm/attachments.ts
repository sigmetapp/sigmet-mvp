import { supabase } from '@/lib/supabaseClient';
import { inferAttachmentType, type AttachmentType } from '@/lib/dm/attachmentUtils';
import { isHttpUrl, normalizeStoragePointer } from '@/lib/dm/storagePath';

export type DmAttachment = {
  type: AttachmentType;
  path?: string | null; // Storage path within bucket
  size?: number | null; // Bytes
  mime?: string | null; // e.g., image/png
  width?: number | null;
  height?: number | null;
  originalName?: string | null;
  version?: number | null;
  bucket?: string | null;
  publicUrl?: string | null;
  signedUrl?: string | null;
  url?: string | null;
  storagePath?: string | null;
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

const RESUMABLE_UPLOAD_THRESHOLD = 25 * 1024 * 1024; // 25MB

type UploadOptions = {
  onProgress?: (progress: { uploadedBytes: number; totalBytes: number }) => void;
};

export async function uploadAttachment(file: File, options: UploadOptions = {}): Promise<DmAttachment> {
  if (file.size > RESUMABLE_UPLOAD_THRESHOLD) {
    return uploadAttachmentResumable(file, options);
  }
  return uploadAttachmentDirect(file, options);
}

async function uploadAttachmentDirect(file: File, options: UploadOptions): Promise<DmAttachment> {
  const mime = file.type || 'application/octet-stream';
  const size = file.size;
  const type = inferAttachmentType(mime);

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
  options.onProgress?.({ uploadedBytes: size, totalBytes: size });

  return {
    type,
    path,
    size,
    mime,
    originalName: file.name,
    bucket,
    ...(dims ? { width: dims.width, height: dims.height } : {}),
  };
}

async function uploadAttachmentResumable(file: File, options: UploadOptions): Promise<DmAttachment> {
  const mime = file.type || 'application/octet-stream';
  const totalSize = file.size;
  const type = inferAttachmentType(mime);

  const initResponse = await fetch('/api/dms/attachments.resumable?action=init', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileName: file.name,
      contentType: mime,
      fileSize: totalSize,
    }),
  });

  if (!initResponse.ok) {
    const errorBody = await initResponse.json().catch(() => ({}));
    throw new Error(errorBody.error || 'Failed to initialise resumable upload.');
  }

  const initResult = (await initResponse.json()) as {
    uploadId: string;
    chunkSize: number;
    bucket: string;
    path: string;
  };

  const { uploadId, chunkSize, path } = initResult;
  const totalChunks = Math.ceil(totalSize / chunkSize);

  let uploadedBytes = 0;

  const statusResponse = await fetch(`/api/dms/attachments.resumable?uploadId=${uploadId}`, {
    headers: { 'Content-Type': 'application/json' },
  });

  const statusResult = statusResponse.ok
    ? await statusResponse.json()
    : { uploadedChunks: [] as number[] };

  const uploadedChunks = new Set<number>(statusResult.uploadedChunks ?? []);

  for (let index = 0; index < totalChunks; index += 1) {
    const start = index * chunkSize;
    const end = Math.min(totalSize, start + chunkSize);
    const chunkBlob = file.slice(start, end);

    if (uploadedChunks.has(index)) {
      uploadedBytes += chunkBlob.size;
      options.onProgress?.({ uploadedBytes, totalBytes: totalSize });
      continue;
    }

    const chunkResponse = await fetch(
      `/api/dms/attachments.resumable?action=chunk&uploadId=${uploadId}&index=${index}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        body: chunkBlob,
      }
    );

    if (!chunkResponse.ok) {
      const errBody = await chunkResponse.json().catch(() => ({}));
      throw new Error(errBody.error || `Failed to upload chunk ${index + 1}`);
    }

    uploadedBytes += chunkBlob.size;
    options.onProgress?.({ uploadedBytes, totalBytes: totalSize });
  }

  const completeResponse = await fetch('/api/dms/attachments.resumable?action=complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ uploadId }),
  });

  if (!completeResponse.ok) {
    const errorBody = await completeResponse.json().catch(() => ({}));
    throw new Error(errorBody.error || 'Failed to finalise resumable upload.');
  }

  const dims = await getImageDimensions(file);

  return {
    type,
    path,
    size: totalSize,
    mime,
    originalName: file.name,
    bucket: initResult.bucket,
    ...(dims ? { width: dims.width, height: dims.height } : {}),
  };
}

export async function getSignedUrlForPath(path: string, expiresInSeconds = 60, bucketHint?: string | null): Promise<string> {
  if (isHttpUrl(path)) {
    return path;
  }

  const { bucketCandidates, objectPath } = normalizeStoragePointer(path, bucketHint);
  const attempted = new Set<string>();

  for (const bucket of bucketCandidates) {
    if (!bucket || attempted.has(bucket)) continue;
    attempted.add(bucket);

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(objectPath, expiresInSeconds);

    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }

    if (error) {
      const message = error.message?.toLowerCase() ?? '';
      const notFound =
        message.includes('not found') ||
        (error as any).statusCode === '404' ||
        (error as any).statusCode === 404 ||
        message.includes('bucket not found');
      if (!notFound) {
        throw new Error(error.message || `Failed to create signed URL for ${bucket}/${objectPath}`);
      }
    }
  }

  throw new Error(`Failed to create signed URL for ${objectPath}`);
}

export async function getSignedUrlForAttachment(
  att: Pick<DmAttachment, 'path' | 'bucket' | 'storagePath'>,
  expiresInSeconds = 60
): Promise<string> {
  const targetPath = att.path ?? att.storagePath;
  if (!targetPath) {
    throw new Error('Attachment path is missing');
  }
  return getSignedUrlForPath(targetPath, expiresInSeconds, att.bucket ?? null);
}

export async function resolveAttachmentUrl(
  attachment: Partial<DmAttachment> | null | undefined,
  expiresInSeconds = 60
): Promise<string | null> {
  if (!attachment) {
    return null;
  }

  const directUrl =
    attachment.signedUrl ||
    attachment.url ||
    attachment.publicUrl;
  if (directUrl) {
    return directUrl;
  }

  const path = attachment.path ?? attachment.storagePath;
  if (!path) {
    return null;
  }

  const bucketHint =
    attachment.bucket ??
    (attachment as any)?.storageBucket ??
    (attachment as any)?.storage_bucket ??
    null;

  const candidatePaths = Array.from(
    new Set(
      [
        path,
        (attachment as any)?.storage_path,
        (attachment as any)?.storagePath,
        (attachment as any)?.path,
      ]
        .map((candidate) => (typeof candidate === 'string' ? candidate.trim() : ''))
        .filter((candidate) => candidate.length > 0)
    )
  );

  for (const candidate of candidatePaths) {
    try {
      const signed = await getSignedUrlForPath(candidate, expiresInSeconds, bucketHint);
      if (signed) {
        return signed;
      }
    } catch (error) {
      // Continue to next strategy
      console.warn('Primary signed URL resolution failed, falling back to API route:', error);
    }
  }

  for (const candidate of candidatePaths) {
    try {
      const params = new URLSearchParams({
        path: candidate,
        expiresIn: String(expiresInSeconds),
      });
      if (bucketHint) {
        params.set('bucket', bucketHint);
      }

      const response = await fetch(`/api/dms/attachments.url?${params.toString()}`);
      if (response.ok) {
        const payload = await response.json().catch(() => null);
        if (payload?.url) {
          return payload.url as string;
        }
      } else {
        console.warn('Attachments URL API responded with error status:', response.status);
      }
    } catch (error) {
      console.error('Failed to resolve attachment URL via API route:', error);
    }
  }

  return null;
}
