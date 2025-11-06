export type MessageKind = 'text' | 'media' | 'file';

type AttachmentLike = { type?: string | null | undefined } & Record<string, unknown>;

export function inferMessageKind(attachments: unknown[]): MessageKind {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return 'text';
  }

  let hasMedia = false;
  let hasFile = false;

  for (const attachment of attachments as AttachmentLike[]) {
    const type = typeof attachment?.type === 'string' ? attachment.type : null;
    if (type === 'image' || type === 'video' || type === 'audio') {
      hasMedia = true;
    } else {
      hasFile = true;
    }

    if (hasMedia && hasFile) {
      break;
    }
  }

  if (hasMedia && !hasFile) {
    return 'media';
  }

  if (!hasMedia && hasFile) {
    return 'file';
  }

  return 'media';
}
