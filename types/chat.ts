export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export interface Message {
  /**
   * Identifier of the message. May be a temporary client identifier such as `temp-<nanoid>`.
   */
  id: string;
  dialogId: string;
  senderId: string;
  receiverId: string;
  text: string;
  createdAt: string;
  status?: MessageStatus;
  replyToMessageId?: string | number;
  replyToMessage?: {
    id: string;
    senderId: string;
    text: string;
    createdAt: string;
  };
}

