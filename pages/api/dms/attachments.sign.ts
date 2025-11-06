import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient, createSupabaseForRequest } from '@/lib/dm/supabaseServer';
import { DM_ATTACHMENTS_BUCKET, generateAttachmentPath } from '@/lib/dm/attachmentUtils';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB limit

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { fileName, contentType, fileSize } = req.body ?? {};

    if (!fileName || typeof fileName !== 'string') {
      return res.status(400).json({ ok: false, error: 'fileName is required' });
    }
    if (!contentType || typeof contentType !== 'string') {
      return res.status(400).json({ ok: false, error: 'contentType is required' });
    }
    const size = Number(fileSize);
    if (!Number.isFinite(size) || size <= 0) {
      return res.status(400).json({ ok: false, error: 'fileSize must be a positive number' });
    }
    if (size > MAX_FILE_SIZE_BYTES) {
      return res.status(413).json({ ok: false, error: 'File is too large. Max size is 50MB.' });
    }

    const { user } = await getAuthedClient(req);
    const serviceClient = createSupabaseForRequest(req, true);

    const uploadPath = generateAttachmentPath(user.id, contentType, fileName);

    const signed = await tryCreateSignedUpload(serviceClient, DM_ATTACHMENTS_BUCKET, uploadPath);
    if (signed.ok) {
      return res.status(200).json({
        ok: true,
        bucket: DM_ATTACHMENTS_BUCKET,
        path: uploadPath,
        token: signed.token,
        expiresIn: signed.expiresIn,
      });
    }

    const fallbackBucket = 'assets';
    const fallbackSigned = await tryCreateSignedUpload(serviceClient, fallbackBucket, uploadPath);
    if (fallbackSigned.ok) {
      return res.status(200).json({
        ok: true,
        bucket: fallbackBucket,
        path: uploadPath,
        token: fallbackSigned.token,
        expiresIn: fallbackSigned.expiresIn,
      });
    }

    return res.status(400).json({ ok: false, error: signed.error || fallbackSigned.error || 'Failed to prepare upload' });
  } catch (error: any) {
    console.error('attachments.sign error:', error);
    const status = typeof error?.status === 'number' ? error.status : 500;
    return res.status(status).json({ ok: false, error: error?.message || 'Internal error' });
  }
}

async function tryCreateSignedUpload(
  client: ReturnType<typeof createSupabaseForRequest>,
  bucket: string,
  path: string
): Promise<{ ok: true; token: string; expiresIn: number } | { ok: false; error: string }> {
  if (!client) {
    return { ok: false, error: 'Supabase client not available' };
  }

  const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(path, 120);
  if (error || !data?.token) {
    return { ok: false, error: error?.message || 'Could not create signed upload URL' };
  }

  return { ok: true, token: data.token, expiresIn: data.expiresIn ?? 120 };
}
