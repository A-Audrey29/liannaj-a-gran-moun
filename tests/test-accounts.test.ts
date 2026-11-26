/**
 * Comptes de démonstration de la page d'accueil.
 *
 * La liste est publique : elle ne doit apparaître qu'avec une clé Mollie de
 * test, et ne jamais contenir de compte admin.
 */
import { describe, it, expect, afterEach } from "vitest";
import { anonymousAgent } from "./helpers";
import { env } from "../server/env";
import { TEST_ACCOUNTS } from "../shared/test-accounts";

const cleOrigine = env.MOLLIE_API_KEY;
afterEach(() => {
  env.MOLLIE_API_KEY = cleOrigine;
});

describe("GET /api/test-accounts", () => {
  it("renvoie les comptes avec une clé Mollie de test", async () => {
    env.MOLLIE_API_KEY = "test_abc123";
    const res = await (await anonymousAgent()).get("/api/test-accounts");
    expect(res.status).toBe(200);
    expect(res.body.accounts).toHaveLength(TEST_ACCOUNTS.length);
    expect(res.body.password).toBeTruthy();
  });

  it("renvoie une liste vide avec une clé live_ (production)", async () => {
    env.MOLLIE_API_KEY = "live_abc123";
    const res = await (await anonymousAgent()).get("/api/test-accounts");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ password: null, accounts: [] });
  });

  it("renvoie une liste vide sans clé Mollie", async () => {
    env.MOLLIE_API_KEY = undefined;
    const res = await (await anonymousAgent()).get("/api/test-accounts");
    expect(res.body.accounts).toEqual([]);
  });

  it("ne liste jamais de compte admin", () => {
    expect(TEST_ACCOUNTS.some((a) => (a.role as string) === "ADMIN" || /admin/i.test(a.email))).toBe(false);
  });
});
