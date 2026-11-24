import type { Response } from "express";

type SSEClient = {
  res: Response;
  userId: string;
};

const clients: Map<string, SSEClient[]> = new Map();

export function addSSEClient(userId: string, res: Response) {
  if (!clients.has(userId)) {
    clients.set(userId, []);
  }
  clients.get(userId)!.push({ res, userId });

  res.on("close", () => {
    const userClients = clients.get(userId);
    if (userClients) {
      const idx = userClients.findIndex((c) => c.res === res);
      if (idx !== -1) userClients.splice(idx, 1);
      if (userClients.length === 0) clients.delete(userId);
    }
  });
}

export function sendSSEEvent(userId: string, event: string, data: any) {
  const userClients = clients.get(userId);
  if (!userClients || userClients.length === 0) return false;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of userClients) {
    try {
      client.res.write(payload);
    } catch {
    }
  }
  return true;
}

/**
 * Ends every open stream of a user. Used when their sessions are destroyed
 * (suspension, deletion, password change): an open stream is never
 * re-authenticated, so it would keep receiving events. The client reconnects
 * after 5 s; that new request only succeeds if its session is still valid.
 */
export function closeSSEClients(userId: string) {
  const userClients = clients.get(userId);
  if (!userClients) return;
  clients.delete(userId);
  for (const client of userClients) {
    try {
      client.res.end();
    } catch {
    }
  }
}

export function isUserConnected(userId: string): boolean {
  const userClients = clients.get(userId);
  return !!userClients && userClients.length > 0;
}
