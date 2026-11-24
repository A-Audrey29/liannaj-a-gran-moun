import { pool } from "../db";
import { closeSSEClients } from "./sse";

/**
 * Closes the open sessions of a user (sessions stored by connect-pg-simple as
 * { passport: { user: "<id>" } }).
 *
 * `exceptSid` keeps one session alive: the one of the person who just changed
 * their password, so they are not logged out of the device they are using.
 *
 * Open real-time streams (SSE) are closed too, for every device: they cannot be
 * told apart by session, and the kept device simply reconnects.
 */
export async function destroyUserSessions(userId: string, exceptSid?: string): Promise<void> {
  closeSSEClients(userId);
  if (exceptSid) {
    await pool.query(
      `DELETE FROM "session" WHERE sess->'passport'->>'user' = $1 AND sid <> $2`,
      [userId, exceptSid],
    );
    return;
  }
  await pool.query(`DELETE FROM "session" WHERE sess->'passport'->>'user' = $1`, [userId]);
}
