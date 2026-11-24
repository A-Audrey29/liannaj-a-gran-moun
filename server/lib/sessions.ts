import { pool } from "../db";

/**
 * Closes the open sessions of a user (sessions stored by connect-pg-simple as
 * { passport: { user: "<id>" } }).
 *
 * `exceptSid` keeps one session alive: the one of the person who just changed
 * their password, so they are not logged out of the device they are using.
 */
export async function destroyUserSessions(userId: string, exceptSid?: string): Promise<void> {
  if (exceptSid) {
    await pool.query(
      `DELETE FROM "session" WHERE sess->'passport'->>'user' = $1 AND sid <> $2`,
      [userId, exceptSid],
    );
    return;
  }
  await pool.query(`DELETE FROM "session" WHERE sess->'passport'->>'user' = $1`, [userId]);
}
