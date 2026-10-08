/** A message ready for the event backbone: the envelope serialized, with its routing. */
export interface OutgoingMessage {
  topic: string;
  key: string;
  value: string;
  headers: Record<string, string>;
}

/**
 * Publishes messages, resolving only once the broker has acknowledged every one of them and
 * rejecting otherwise, so a caller never marks undelivered messages as published.
 */
export interface EventPublisher {
  publish(messages: readonly OutgoingMessage[]): Promise<void>;
}
