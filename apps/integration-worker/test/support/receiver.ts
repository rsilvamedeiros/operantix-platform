import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface Received {
  path: string;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface Receiver {
  url(path: string): string;
  received: Received[];
  /** The status each path answers with; 200 when unset. */
  statuses: Map<string, number>;
  /** Holds the response to the next request received, on any path, for this many milliseconds. */
  holdNext(ms: number): void;
  close(): Promise<void>;
}

/** A local webhook receiver that records every request. */
export async function startReceiver(): Promise<Receiver> {
  const received: Received[] = [];
  const statuses = new Map<string, number>();
  let held = 0;
  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      const path = req.url ?? '/';
      received.push({ path, headers: req.headers, body });
      res.statusCode = statuses.get(path) ?? 200;
      const delay = held;
      held = 0;
      setTimeout(() => res.end(), delay);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  return {
    url: (path) => `${base}${path}`,
    received,
    statuses,
    holdNext: (ms) => {
      held = ms;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
