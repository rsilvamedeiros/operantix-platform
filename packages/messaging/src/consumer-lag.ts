/** The end of one partition's log, as the broker reports it. Offsets are decimal strings. */
export interface PartitionEnd {
  partition: number;
  high: string;
  low: string;
}

/** What a group has committed for one partition. `-1` (or no entry) means nothing committed. */
export interface CommittedOffset {
  partition: number;
  offset: string;
}

/**
 * Messages a group has not yet committed on one topic: for each partition, the end of the log
 * minus the committed offset. A partition the group never committed counts every retained
 * message, and a committed offset older than the log start (already deleted) counts from the
 * start. Offsets are 64-bit, so the arithmetic uses BigInt.
 */
export function computeLag(ends: PartitionEnd[], committed: CommittedOffset[]): number {
  const byPartition = new Map(committed.map((entry) => [entry.partition, BigInt(entry.offset)]));
  let lag = 0n;
  for (const { partition, high, low } of ends) {
    const start = BigInt(low);
    const stored = byPartition.get(partition);
    const from = stored === undefined || stored < start ? start : stored;
    const behind = BigInt(high) - from;
    if (behind > 0n) lag += behind;
  }
  return Number(lag);
}
