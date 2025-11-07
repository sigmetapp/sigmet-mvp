'use strict';

import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { getAuthedClient, createSupabaseForRequest } from '@/lib/dm/supabaseServer';
import { DM_ATTACHMENTS_BUCKET, generateAttachmentPath } from '@/lib/dm/attachmentUtils';

export const config = {
  api: {
    bodyParser: false,
  },
};

type Metadata = {
  uploadId: string;
  userId: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  bucket: string;
  targetPath: string;
  uploadedChunks: number[];
};

const RESUMABLE_ROOT = path.join(os.tmpdir(), 'dm-resumable');
const MAX_RESUMABLE_BYTES = 200 * 1024 * 1024; // 200MB
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const action =
    (typeof req.query.action === 'string' && req.query.action.toLowerCase()) ||
    (req.method === 'GET' ? 'status' : undefined);

  if (!action) {
    return res.status(400).json({ ok: false, error: 'Missing action parameter' });
  }

  try {
    const {
      user: { id: userId },
    } = await getAuthedClient(req);

    switch (action) {
      case 'init':
        return await handleInit(req, res, userId);
      case 'chunk':
        return await handleChunk(req, res, userId);
      case 'status':
        return await handleStatus(req, res, userId);
      case 'complete':
        return await handleComplete(req, res, userId);
      default:
        return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('attachments.resumable error:', error);
    const status = typeof error?.status === 'number' ? error.status : 500;
    return res.status(status).json({ ok: false, error: error?.message || 'Internal error' });
  }
}

async function handleInit(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const body = await readJsonBody(req);
  const { fileName, contentType, fileSize } = body ?? {};

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
  if (size > MAX_RESUMABLE_BYTES) {
    return res
      .status(413)
      .json({ ok: false, error: `File is too large. Max size is ${Math.floor(MAX_RESUMABLE_BYTES / (1024 * 1024))}MB.` });
  }

  const chunkSize = DEFAULT_CHUNK_SIZE;
  const totalChunks = Math.ceil(size / chunkSize);
  const uploadId = randomUUID();
  const targetPath = generateAttachmentPath(userId, contentType, fileName);

  const metadata: Metadata = {
    uploadId,
    userId,
    fileName,
    contentType,
    fileSize: size,
    chunkSize,
    totalChunks,
    bucket: DM_ATTACHMENTS_BUCKET,
    targetPath,
    uploadedChunks: [],
  };

  await ensureDirectory(path.join(RESUMABLE_ROOT, uploadId));
  await writeMetadata(metadata);

  return res.status(200).json({
    ok: true,
    uploadId,
    chunkSize,
    bucket: metadata.bucket,
    path: metadata.targetPath,
  });
}

async function handleChunk(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const uploadId = typeof req.query.uploadId === 'string' ? req.query.uploadId : null;
  const index = typeof req.query.index === 'string' ? Number.parseInt(req.query.index, 10) : NaN;

  if (!uploadId) {
    return res.status(400).json({ ok: false, error: 'uploadId is required' });
  }
  if (!Number.isInteger(index) || index < 0) {
    return res.status(400).json({ ok: false, error: 'Invalid chunk index' });
  }

  const metadata = await readMetadata(uploadId);
  if (!metadata) {
    return res.status(404).json({ ok: false, error: 'Upload session not found' });
  }
  if (metadata.userId !== userId) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  if (index >= metadata.totalChunks) {
    return res.status(400).json({ ok: false, error: 'Chunk index out of range' });
  }

  const buffer = await readBinaryBody(req);
  const expectedSize =
    index === metadata.totalChunks - 1
      ? metadata.fileSize - index * metadata.chunkSize
      : metadata.chunkSize;

  if (buffer.length === 0) {
    return res.status(400).json({ ok: false, error: 'Chunk payload empty' });
  }

  if (buffer.length > metadata.chunkSize || (index !== metadata.totalChunks - 1 && buffer.length !== expectedSize)) {
    // Allow last chunk to be smaller; others must match chunk size exactly
    if (!(index === metadata.totalChunks - 1 && buffer.length <= metadata.chunkSize)) {
      return res.status(400).json({ ok: false, error: 'Chunk size mismatch' });
    }
  }

  const chunkPath = path.join(RESUMABLE_ROOT, uploadId, `chunk-${index}`);
  await fs.writeFile(chunkPath, buffer);

  if (!metadata.uploadedChunks.includes(index)) {
    metadata.uploadedChunks.push(index);
    metadata.uploadedChunks.sort((a, b) => a - b);
    await writeMetadata(metadata);
  }

  return res.status(200).json({ ok: true, index });
}

async function handleStatus(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const uploadId = typeof req.query.uploadId === 'string' ? req.query.uploadId : null;

  if (!uploadId) {
    return res.status(400).json({ ok: false, error: 'uploadId is required' });
  }

  const metadata = await readMetadata(uploadId);
  if (!metadata) {
    return res.status(404).json({ ok: false, error: 'Upload session not found' });
  }
  if (metadata.userId !== userId) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }

  return res.status(200).json({
    ok: true,
    uploadedChunks: metadata.uploadedChunks,
    totalChunks: metadata.totalChunks,
  });
}

async function handleComplete(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const body = await readJsonBody(req);
  const uploadId = typeof body?.uploadId === 'string' ? body.uploadId : null;

  if (!uploadId) {
    return res.status(400).json({ ok: false, error: 'uploadId is required' });
  }

  const metadata = await readMetadata(uploadId);
  if (!metadata) {
    return res.status(404).json({ ok: false, error: 'Upload session not found' });
  }
  if (metadata.userId !== userId) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }
  if (metadata.uploadedChunks.length !== metadata.totalChunks) {
    return res.status(400).json({ ok: false, error: 'Upload incomplete' });
  }

  const dir = path.join(RESUMABLE_ROOT, uploadId);
  const sortedChunks = metadata.uploadedChunks.slice().sort((a, b) => a - b);

  const buffers: Buffer[] = [];
  for (const index of sortedChunks) {
    const chunkPath = path.join(dir, `chunk-${index}`);
    const buffer = await fs.readFile(chunkPath);
    buffers.push(buffer);
  }
  const combined = Buffer.concat(buffers);

  if (combined.length !== metadata.fileSize) {
    return res.status(400).json({ ok: false, error: 'Combined file size mismatch' });
  }

  const serviceClient = createSupabaseForRequest(req, true);
  if (!serviceClient) {
    return res.status(500).json({ ok: false, error: 'Supabase client unavailable' });
  }

  const { error: uploadError } = await serviceClient.storage.from(metadata.bucket).upload(metadata.targetPath, combined, {
    cacheControl: '3600',
    contentType: metadata.contentType,
    upsert: false,
  });

  if (uploadError) {
    return res.status(400).json({ ok: false, error: uploadError.message || 'Failed to store file' });
  }

  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});

  return res.status(200).json({
    ok: true,
    bucket: metadata.bucket,
    path: metadata.targetPath,
    size: metadata.fileSize,
    contentType: metadata.contentType,
  });
}

async function ensureDirectory(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function readMetadata(uploadId: string): Promise<Metadata | null> {
  try {
    const metaPath = path.join(RESUMABLE_ROOT, uploadId, 'meta.json');
    const raw = await fs.readFile(metaPath, 'utf8');
    return JSON.parse(raw) as Metadata;
  } catch {
    return null;
  }
}

async function writeMetadata(metadata: Metadata) {
  const metaPath = path.join(RESUMABLE_ROOT, metadata.uploadId, 'meta.json');
  await fs.writeFile(metaPath, JSON.stringify(metadata), 'utf8');
}

async function readJsonBody<T = any>(req: NextApiRequest): Promise<T | undefined> {
  const buffer = await readBinaryBody(req);
  if (!buffer.length) return undefined;
  try {
    return JSON.parse(buffer.toString('utf8')) as T;
  } catch {
    return undefined;
  }
}

function readBinaryBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    req.on('data', (chunk) => {
      chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', (err) => {
      reject(err);
    });
  });
}
