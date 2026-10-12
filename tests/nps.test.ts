/**
 * NPS ("Would you recommend Lyannaj to your circle?", 0-10 + reason).
 *
 * What matters here, in order:
 *  - eligibility is enforced by the SERVER (role, a meeting actually held,
 *    90-day cooldown), never trusted from the client;
 *  - a double submit cannot create two answers;
 *  - 0 is a valid score (a `rating === 0` style check would silently drop it);
 *  - only admins read the results.
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resetDatabase, createUser, loginAs, createRelation, anonymousAgent } from "./helpers";
import { prisma } from "../server/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A senior whose relation has one meeting in the given status. */
async function seniorWithMeeting(status = "COMPLETED") {
  const senior = await createUser("SENIOR");
  const junior = await createUser("JUNIOR");
  const relation = await createRelation(senior.id, junior.id);
  await prisma.intervention.create({
    data: { relationId: relation.id, scheduledDate: new Date("2026-06-15T14:00:00Z"), status: status as any },
  });
  return { senior, junior, relation };
}

async function answerAt(userId: string, role: "SENIOR" | "REFERENT_SENIOR", score: number, createdAt: Date, reason?: string) {
  return prisma.npsResponse.create({ data: { userId, role, score, reason, createdAt } });
}

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("POST /api/nps - input validation", () => {
  it("requires authentication", async () => {
    const anon = await anonymousAgent();
    expect((await anon.post("/api/nps").send({ score: 8 })).status).toBe(401);
    expect((await anon.get("/api/nps/eligibility")).status).toBe(401);
  });

  it.each([-1, 11, 1.5, "7", null])("rejects score %s with field errors", async (score) => {
    const { senior } = await seniorWithMeeting();
    const agent = await loginAs(senior);
    const res = await agent.post("/api/nps").send({ score });
    expect(res.status).toBe(400);
    expect(res.body.errors.score).toBeDefined();
    expect(await prisma.npsResponse.count()).toBe(0);
  });

  it("accepts a score of 0", async () => {
    const { senior } = await seniorWithMeeting();
    const agent = await loginAs(senior);
    const res = await agent.post("/api/nps").send({ score: 0 });
    expect(res.status).toBe(201);
    const row = await prisma.npsResponse.findFirstOrThrow();
    expect(row.score).toBe(0);
    expect(row.role).toBe("SENIOR");
    expect(row.userId).toBe(senior.id);
  });

  it("accepts reason: null, as a form serializer may send for an empty field", async () => {
    const { senior } = await seniorWithMeeting();
    const agent = await loginAs(senior);
    expect((await agent.post("/api/nps").send({ score: 4, reason: null })).status).toBe(201);
    expect((await prisma.npsResponse.findFirstOrThrow()).reason).toBeNull();
  });

  it("stores the trimmed reason, and null when absent or blank", async () => {
    const { senior } = await seniorWithMeeting();
    const agent = await loginAs(senior);
    await agent.post("/api/nps").send({ score: 9, reason: "  Très aimable  " });
    expect((await prisma.npsResponse.findFirstOrThrow()).reason).toBe("Très aimable");

    await prisma.npsResponse.deleteMany();
    await agent.post("/api/nps").send({ score: 9, reason: "   " });
    expect((await prisma.npsResponse.findFirstOrThrow()).reason).toBeNull();
  });
});

describe("POST /api/nps - eligibility", () => {
  it("accepts a senior whose meeting awaits feedback", async () => {
    const { senior } = await seniorWithMeeting("COMPLETED_PENDING_FEEDBACK");
    const agent = await loginAs(senior);
    expect((await agent.post("/api/nps").send({ score: 7 })).status).toBe(201);
  });

  it("refuses a senior with no meeting at all", async () => {
    const senior = await createUser("SENIOR");
    const agent = await loginAs(senior);
    const res = await agent.post("/api/nps").send({ score: 7 });
    expect(res.status).toBe(403);
    expect(await prisma.npsResponse.count()).toBe(0);
  });

  it("refuses a senior whose meetings did not take place yet", async () => {
    for (const status of ["PROPOSED", "CONFIRMED", "CANCELLED"]) {
      await resetDatabase();
      const { senior } = await seniorWithMeeting(status);
      const agent = await loginAs(senior);
      const res = await agent.post("/api/nps").send({ score: 7 });
      expect(res.status, status).toBe(403);
    }
  });

  it.each(["JUNIOR", "TEACHER", "ADMIN"] as const)("refuses the %s role", async (role) => {
    await seniorWithMeeting();
    const user = await createUser(role);
    const agent = await loginAs(user);
    const res = await agent.post("/api/nps").send({ score: 7 });
    expect(res.status).toBe(403);
    expect(await prisma.npsResponse.count()).toBe(0);
  });

  it("lets a referent answer through the linked senior's meetings", async () => {
    const { senior } = await seniorWithMeeting();
    const referent = await createUser("REFERENT_SENIOR", { linkedSeniorId: senior.id });
    const agent = await loginAs(referent);
    expect((await agent.post("/api/nps").send({ score: 10 })).status).toBe(201);
    const row = await prisma.npsResponse.findFirstOrThrow();
    expect(row.role).toBe("REFERENT_SENIOR");
    expect(row.userId).toBe(referent.id);
  });

  it("refuses a referent with no linked senior, or whose senior had no meeting", async () => {
    const lonely = await createUser("REFERENT_SENIOR");
    expect((await (await loginAs(lonely)).post("/api/nps").send({ score: 5 })).status).toBe(403);

    const seniorWithoutMeeting = await createUser("SENIOR");
    const referent = await createUser("REFERENT_SENIOR", { linkedSeniorId: seniorWithoutMeeting.id });
    expect((await (await loginAs(referent)).post("/api/nps").send({ score: 5 })).status).toBe(403);
  });
});

describe("POST /api/nps - 90-day cooldown", () => {
  it("refuses a second answer right after the first", async () => {
    const { senior } = await seniorWithMeeting();
    const agent = await loginAs(senior);
    expect((await agent.post("/api/nps").send({ score: 9 })).status).toBe(201);
    expect((await agent.post("/api/nps").send({ score: 3 })).status).toBe(409);
    expect(await prisma.npsResponse.count()).toBe(1);
  });

  it("still refuses at 89 days and accepts at 91 days", async () => {
    const { senior } = await seniorWithMeeting();
    const agent = await loginAs(senior);

    await answerAt(senior.id, "SENIOR", 8, new Date(Date.now() - 89 * DAY_MS));
    expect((await agent.post("/api/nps").send({ score: 9 })).status).toBe(409);

    await prisma.npsResponse.deleteMany();
    await answerAt(senior.id, "SENIOR", 8, new Date(Date.now() - 91 * DAY_MS));
    expect((await agent.post("/api/nps").send({ score: 9 })).status).toBe(201);
  });

  it("counts the cooldown per person, not per senior", async () => {
    const { senior } = await seniorWithMeeting();
    const referent = await createUser("REFERENT_SENIOR", { linkedSeniorId: senior.id });
    await answerAt(senior.id, "SENIOR", 8, new Date());
    const agent = await loginAs(referent);
    expect((await agent.post("/api/nps").send({ score: 6 })).status).toBe(201);
  });

  it("creates a single answer when two submits race", async () => {
    // Invariant check. Timing alone rarely interleaves the two requests, so the
    // lock test below is what actually proves the protection.
    const { senior } = await seniorWithMeeting();
    const agent = await loginAs(senior);
    const results = await Promise.all([
      agent.post("/api/nps").send({ score: 9 }),
      agent.post("/api/nps").send({ score: 9 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.npsResponse.count()).toBe(1);
  });

  it("waits on the per-user advisory lock before checking the cooldown", async () => {
    const { senior } = await seniorWithMeeting();
    const agent = await loginAs(senior);

    // Another transaction holds the user's NPS lock, as an in-flight submit would.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`nps:${senior.id}`}))`;
        await gate;
      },
      { timeout: 15_000 }
    );
    await new Promise((resolve) => setTimeout(resolve, 300));

    let settled = false;
    const request = agent
      .post("/api/nps")
      .send({ score: 9 })
      .then((res) => {
        settled = true;
        return res;
      });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(settled).toBe(false);
    expect(await prisma.npsResponse.count()).toBe(0);

    release();
    await holder;
    expect((await request).status).toBe(201);
  });
});

describe("GET /api/nps/eligibility", () => {
  it("is true before answering, false after", async () => {
    const { senior } = await seniorWithMeeting();
    const agent = await loginAs(senior);
    expect((await agent.get("/api/nps/eligibility")).body).toEqual({ eligible: true });
    await agent.post("/api/nps").send({ score: 9 });
    expect((await agent.get("/api/nps/eligibility")).body).toEqual({ eligible: false });
  });

  it("is false for a role that is never surveyed", async () => {
    await seniorWithMeeting();
    const junior = await createUser("JUNIOR");
    const agent = await loginAs(junior);
    expect((await agent.get("/api/nps/eligibility")).body).toEqual({ eligible: false });
  });
});

describe("GET /api/admin/nps", () => {
  it("computes the NPS globally and per segment, with names for the admin", async () => {
    const { senior: s1 } = await seniorWithMeeting();
    const { senior: s2 } = await seniorWithMeeting();
    const referent = await createUser("REFERENT_SENIOR", { linkedSeniorId: s1.id });
    const now = new Date();
    await answerAt(s1.id, "SENIOR", 10, now, "Super");
    await answerAt(s2.id, "SENIOR", 8, now);
    await answerAt(referent.id, "REFERENT_SENIOR", 2, now, "Décevant");

    const admin = await createUser("ADMIN");
    const res = await (await loginAs(admin)).get("/api/admin/nps");

    expect(res.status).toBe(200);
    // 1 promoter, 1 passive, 1 detractor -> (1 - 1) / 3 = 0
    expect(res.body.summary).toEqual({ total: 3, promoters: 1, passives: 1, detractors: 1, nps: 0 });
    expect(res.body.bySegment.SENIOR).toMatchObject({ total: 2, nps: 50 });
    expect(res.body.bySegment.REFERENT_SENIOR).toMatchObject({ total: 1, nps: -100 });
    expect(res.body.responses).toHaveLength(3);
    const detractor = res.body.responses.find((r: any) => r.score === 2);
    expect(detractor).toMatchObject({
      segment: "REFERENT_SENIOR",
      category: "DETRACTOR",
      reason: "Décevant",
      firstName: referent.firstName,
    });
  });

  it("returns a null NPS and an empty list when nobody answered", async () => {
    const admin = await createUser("ADMIN");
    const res = await (await loginAs(admin)).get("/api/admin/nps");
    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ total: 0, nps: null });
    expect(res.body.responses).toEqual([]);
  });

  it("filters by Guadeloupe day, end of day included", async () => {
    const { senior } = await seniorWithMeeting();
    // 2026-07-01T02:00Z is 2026-06-30 22:00 in Guadeloupe (UTC-4).
    await answerAt(senior.id, "SENIOR", 9, new Date("2026-07-01T02:00:00Z"));
    const admin = await createUser("ADMIN");
    const agent = await loginAs(admin);

    const onJune30 = await agent.get("/api/admin/nps?from=2026-06-30&to=2026-06-30");
    expect(onJune30.body.summary.total).toBe(1);

    const onJuly1 = await agent.get("/api/admin/nps?from=2026-07-01&to=2026-07-01");
    expect(onJuly1.body.summary.total).toBe(0);
  });

  it("rejects a malformed date", async () => {
    const admin = await createUser("ADMIN");
    const res = await (await loginAs(admin)).get("/api/admin/nps?from=yesterday");
    expect(res.status).toBe(400);
  });

  it("rejects an inverted range instead of returning an empty report", async () => {
    const admin = await createUser("ADMIN");
    const res = await (await loginAs(admin)).get("/api/admin/nps?from=2026-07-01&to=2026-06-01");
    expect(res.status).toBe(400);
    expect(res.body.errors.to).toBeDefined();
  });
});

describe("NpsResponse table guards", () => {
  it.each([-1, 11])("rejects score %s at database level", async (score) => {
    const senior = await createUser("SENIOR");
    await expect(
      prisma.npsResponse.create({ data: { userId: senior.id, role: "SENIOR", score } })
    ).rejects.toThrow();
  });

  it("rejects a role that is never surveyed at database level", async () => {
    const admin = await createUser("ADMIN");
    await expect(
      prisma.npsResponse.create({ data: { userId: admin.id, role: "ADMIN", score: 5 } })
    ).rejects.toThrow();
  });
});
