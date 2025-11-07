import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthedClient, createSupabaseForRequest } from '@/lib/dm/supabaseServer';
import { normalizeStoragePointer, isHttpUrl } from '@/lib/dm/storagePath';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { path, bucket, expiresIn } = req.query;

    if (!path || typeof path !== 'string' || path.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'path is required' });
    }

    const expires = Number(expiresIn ?? 300);
    if (!Number.isFinite(expires) || expires <= 0) {
      return res.status(400).json({ ok: false, error: 'expiresIn must be a positive number' });
    }

    // Ensure user is authenticated
    await getAuthedClient(req);

    if (isHttpUrl(path)) {
      return res.status(200).json({ ok: true, url: path, bucket: null, path });
    }

    const rawBucket = typeof bucket === 'string' && bucket.trim().length > 0 ? bucket.trim() : undefined;
    const serviceClient = createSupabaseForRequest(req, true);

    const { bucketCandidates, objectPath } = normalizeStoragePointer(path, rawBucket);
    const attempted = new Set<string>();

    for (const candidate of bucketCandidates) {
      if (!candidate || attempted.has(candidate)) continue;
      attempted.add(candidate);

      const { data, error } = await serviceClient.storage
        .from(candidate)
        .createSignedUrl(objectPath, expires);

      if (!error && data?.signedUrl) {
        return res.status(200).json({
          ok: true,
          url: data.signedUrl,
          bucket: candidate,
          path: objectPath,
          expiresIn: data.expiresIn ?? expires,
        });
      }

      if (error) {
        const message = error.message?.toLowerCase() ?? '';
        const notFound =
          message.includes('not found') ||
          (error as any).statusCode === 404 ||
          (error as any).status === 404;
        if (!notFound) {
          console.error('[attachments.url] Error creating signed URL:', error);
          return res.status(error.status ?? 500).json({ ok: false, error: error.message });
        }
      }
    }

    return res.status(404).json({ ok: false, error: 'Unable to create signed URL' });
  } catch (error: any) {
    console.error('[attachments.url] Unexpected error:', error);
    const status = typeof error?.status === 'number' ? error.status : 500;
    return res.status(status).json({ ok: false, error: error?.message || 'Internal error' });
  }
}
