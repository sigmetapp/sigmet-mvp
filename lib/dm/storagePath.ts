import { DM_ATTACHMENTS_BUCKET } from '@/lib/dm/attachmentUtils';

export function isHttpUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

export function stripQuery(value: string): string {
  const [withoutQuery] = value.split('?');
  return withoutQuery;
}

export type StoragePointer = {
  objectPath: string;
  bucketCandidates: string[];
};

export function normalizeStoragePointer(rawPath: string, bucketHint?: string | null): StoragePointer {
  let cleaned = stripQuery(rawPath.trim());
  if (cleaned.startsWith('storage://')) {
    cleaned = cleaned.slice('storage://'.length);
  }
  cleaned = cleaned.replace(/^\/+/, '');

  let bucket = bucketHint?.trim() || null;

  const doubleColonIndex = cleaned.indexOf('::');
  if (!bucket && doubleColonIndex > 0) {
    bucket = cleaned.slice(0, doubleColonIndex);
    cleaned = cleaned.slice(doubleColonIndex + 2);
  }

  const slashIndex = cleaned.indexOf('/');
  if (!bucket && slashIndex > 0) {
    const prefix = cleaned.slice(0, slashIndex);
    if (prefix === DM_ATTACHMENTS_BUCKET || prefix === 'assets') {
      bucket = prefix;
      cleaned = cleaned.slice(slashIndex + 1);
    }
  }

  const bucketCandidates: string[] = [];
  if (bucket) {
    bucketCandidates.push(bucket);
  }
  if (!bucketCandidates.includes(DM_ATTACHMENTS_BUCKET)) {
    bucketCandidates.push(DM_ATTACHMENTS_BUCKET);
  }
  if (!bucketCandidates.includes('assets')) {
    bucketCandidates.push('assets');
  }

  return {
    bucketCandidates,
    objectPath: cleaned,
  };
}
