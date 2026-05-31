export interface GmailHistoryDelta {
  message_ids: string[];
  thread_ids: string[];
  error?: string;
}

export function shouldDispatchGmailMessage(delta: GmailHistoryDelta): boolean {
  return delta.message_ids.length > 0;
}
