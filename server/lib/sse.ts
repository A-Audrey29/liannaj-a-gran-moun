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

export function isUserConnected(userId: string): boolean {
  const userClients = clients.get(userId);
  return !!userClients && userClients.length > 0;
}
