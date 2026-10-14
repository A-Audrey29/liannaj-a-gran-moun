import { prisma } from "./prisma";
import { OVERDUE_STATUSES, isMeetingOverdue, overdueStartBefore } from "../shared/meeting-check";
import type { User, Category, UserCategory, Relation, Intervention, AdminRecommendation, Notification, PaymentRecord, Favorite, Conversation, Message, PushSubscription, Report, TeacherStudent, TeacherComment, Availability, CreditLedger, NpsResponse, Prisma } from "../generated/prisma/client.ts";
import { COMPLETED_STATUSES } from "../shared/schema";
import { NPS_COOLDOWN_DAYS, NPS_SEGMENTS, type NpsSegment } from "../shared/nps";

/**
 * Périmètre d'un historique de rencontres. Construit serveur à partir du rôle
 * de l'appelant — un identifiant venu de la query ne devient un scope qu'après
 * contrôle d'habilitation dans la route.
 */
export type MeetingHistoryScope =
  | { kind: "all" }
  | { kind: "user"; userId: string }
  | { kind: "senior"; seniorId: string }
  | { kind: "students"; studentIds: string[] };

export interface MeetingHistoryFilters {
  status?: Intervention["status"][];
  from?: Date;
  to?: Date;
}

/** The slice of the session user needed to decide NPS eligibility. */
export interface NpsRespondent {
  id: string;
  role: string;
  linkedSeniorId: string | null;
}

/**
 * Why someone cannot answer the NPS now. The route maps ROLE and NO_MEETING to
 * 403 and COOLDOWN to 409.
 */
export type NpsIneligibleReason = "ROLE" | "NO_MEETING" | "COOLDOWN";

type NpsDb = Prisma.TransactionClient | typeof prisma;

/**
 * Eligibility, decided server-side only: right role, at least one meeting
 * actually held for the senior (the referent's senior when a referent), and no
 * answer in the last NPS_COOLDOWN_DAYS days.
 */
async function findNpsIneligibility(db: NpsDb, user: NpsRespondent): Promise<NpsIneligibleReason | null> {
  if (!NPS_SEGMENTS.includes(user.role as NpsSegment)) return "ROLE";

  const seniorId = user.role === "SENIOR" ? user.id : user.linkedSeniorId;
  if (!seniorId) return "NO_MEETING";

  const heldMeeting = await db.intervention.findFirst({
    where: { status: { in: COMPLETED_STATUSES }, relation: { seniorId } },
    select: { id: true },
  });
  if (!heldMeeting) return "NO_MEETING";

  const cutoff = new Date(Date.now() - NPS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
  const recentAnswer = await db.npsResponse.findFirst({
    where: { userId: user.id, createdAt: { gt: cutoff } },
    select: { id: true },
  });
  return recentAnswer ? "COOLDOWN" : null;
}

/** Longest meeting that can still be the free first meeting of a relation. */
export const FREE_FIRST_MEETING_MAX_MINUTES = 30;

/** Planned and not yet held: these meetings reserve a credit. */
const RESERVING_STATUSES = ["PROPOSED", "CONFIRMED"] as const;

type CreditsDb = Prisma.TransactionClient | typeof prisma;

/**
 * Is a meeting about to be created the single free meeting of its relation?
 * The relation still waits for its first meeting, the meeting lasts 30
 * minutes or less, and no non-cancelled meeting exists on the relation yet.
 * Decided once at creation and stored in Intervention.isFree: recomputing it
 * at completion depended on the order meetings were closed in.
 */
async function isFreeMeeting(db: CreditsDb, meeting: { relationId: string; durationMinutes: number }): Promise<boolean> {
  if (meeting.durationMinutes > FREE_FIRST_MEETING_MAX_MINUTES) return false;
  const relation = await db.relation.findUnique({ where: { id: meeting.relationId }, select: { status: true } });
  if (relation?.status !== "PENDING_FIRST_MEETING") return false;
  const existing = await db.intervention.findFirst({
    where: { relationId: meeting.relationId, status: { not: "CANCELLED" } },
    select: { id: true },
  });
  return !existing;
}

/**
 * Ledger balance, and credits still available: balance minus the paid
 * meetings already planned (PROPOSED/CONFIRMED, not free). The debit itself
 * still happens at completion; this only stops booking more than one has.
 */
async function computeCredits(db: CreditsDb, seniorId: string): Promise<{ balance: number; available: number }> {
  const [ledger, reserved] = await Promise.all([
    db.creditLedger.aggregate({ where: { seniorId }, _sum: { amount: true } }),
    db.intervention.count({
      where: { status: { in: [...RESERVING_STATUSES] }, isFree: false, relation: { seniorId } },
    }),
  ]);
  const balance = ledger._sum.amount ?? 0;
  return { balance, available: balance - reserved };
}

export interface IStorage {
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  getReferentsBySeniorId(seniorId: string): Promise<User[]>;
  getUserByValidationToken(token: string): Promise<User | null>;
  /**
   * Activates a senior and creates their aidant (REFERENT_SENIOR) account in
   * one transaction. Returns null if the token was consumed in the meantime
   * (double click), in which case nothing is written.
   */
  activateSeniorWithAidant(
    seniorId: string,
    token: string,
    aidant: { email: string; password: string; firstName: string; lastName: string }
  ): Promise<User | null>;
  createUser(data: Prisma.UserCreateInput): Promise<User>;
  updateUser(id: string, data: Prisma.UserUpdateInput): Promise<User>;

  getCategories(): Promise<Category[]>;
  createCategory(data: Prisma.CategoryCreateInput): Promise<Category>;

  getUserCategories(userId: string): Promise<(UserCategory & { category: Category })[]>;
  createUserCategory(userId: string, categoryId: string): Promise<UserCategory>;
  /**
   * Replaces the user's ateliers in one transaction. Returns false (and
   * changes nothing) if any id is not an existing category.
   */
  replaceUserCategories(userId: string, categoryIds: string[]): Promise<boolean>;
  deleteUserCategories(userId: string): Promise<void>;

  getRelation(id: string): Promise<Relation | null>;
  getRelationsByUser(userId: string): Promise<(Relation & { senior: User; junior: User; interventions: Intervention[] })[]>;
  getRelationWithUsers(id: string): Promise<(Relation & { senior: User; junior: User; interventions: Intervention[] }) | null>;
  getRelationBySeniorAndJunior(seniorId: string, juniorId: string): Promise<Relation | null>;
  createRelation(seniorId: string, juniorId: string): Promise<Relation>;
  updateRelationStatus(id: string, status: string): Promise<Relation>;

  getIntervention(id: string): Promise<Intervention | null>;
  getInterventionsByRelation(relationId: string): Promise<Intervention[]>;
  getInterventionWithRelation(id: string): Promise<(Intervention & { relation: Relation }) | null>;
  /**
   * Crée l'intervention en verrouillant le jeune (pg_advisory_xact_lock) et en
   * refaisant vérifier le conflit dans la même transaction juste avant
   * l'insert, pour empêcher deux requêtes concurrentes de réserver le même
   * créneau.
   */
  createInterventionSafe(
    juniorId: string,
    data: { relationId: string; scheduledDate: Date; durationMinutes: number; location?: string; tasks?: string[] },
    checkConflict: (tx: Prisma.TransactionClient) => Promise<boolean>,
    seniorId: string
  ): Promise<{ intervention: Intervention } | { conflict: true } | { locked: true } | { noCredits: true }>;
  updateIntervention(id: string, data: Prisma.InterventionUpdateInput): Promise<Intervention>;
  /**
   * CONFIRMED -> COMPLETED_PENDING_FEEDBACK and the credit debit, atomically.
   * Returns null if the meeting was no longer CONFIRMED (double click, two
   * admins): nothing is debited twice.
   */
  completeIntervention(interventionId: string, seniorId: string, triggeredById: string): Promise<{ intervention: Intervention; free: boolean } | null>;
  getCredits(seniorId: string): Promise<{ balance: number; available: number }>;
  /**
   * PROPOSED/CONFIRMED -> CANCELLED, conditionally: returns null if the
   * meeting was closed meanwhile (e.g. marked done by another admin), so a
   * debited meeting can never end up CANCELLED.
   */
  cancelIntervention(id: string): Promise<Intervention | null>;
  /** PROPOSED -> CONFIRMED, conditionally: null if cancelled meanwhile. */
  confirmIntervention(id: string): Promise<Intervention | null>;
  getPendingFeedbackInterventions(userId: string): Promise<(Intervention & { relation: Relation })[]>;
  getPendingFeedbackForReminder(): Promise<(Intervention & { relation: Relation & { senior: User; junior: User } })[]>;
  updateInterventionFeedbackReminderSent(id: string): Promise<Intervention>;
  getOverdueInterventionsForReminder(now?: Date): Promise<(Intervention & { relation: Relation & { senior: User; junior: User } })[]>;
  /**
   * One transaction: a notification per admin AND the meetings marked as
   * reminded. A failure part-way can no longer notify some admins without
   * marking, which re-notified them on every pass.
   */
  recordMeetingCheckReminder(
    adminIds: string[],
    notification: { title: string; message: string; link: string },
    interventionIds: string[]
  ): Promise<void>;
  /**
   * Historique des rencontres, périmètre décidé par l'appelant (jamais par un
   * paramètre client). Alimente /api/meetings/history pour tous les rôles.
   */
  getMeetingHistory(
    scope: MeetingHistoryScope,
    filters?: MeetingHistoryFilters
  ): Promise<(Intervention & { relation: Relation & { senior: User; junior: User } })[]>;

  getAvailabilitiesByUser(userId: string): Promise<Availability[]>;
  getAvailabilitiesInRange(userId: string, from: Date, to: Date): Promise<Availability[]>;
  createAvailability(data: { userId: string; startAt: Date; endAt: Date; kind: "AVAILABLE" | "UNAVAILABLE" }): Promise<Availability>;
  createManyAvailabilities(data: { userId: string; startAt: Date; endAt: Date; kind: "AVAILABLE" | "UNAVAILABLE" }[]): Promise<number>;
  softDeleteAvailabilities(ids: string[]): Promise<number>;
  getAvailability(id: string): Promise<Availability | null>;
  /** PROPOSED + CONFIRMED — pour détecter les conflits de créneau. */
  getActiveInterventionsForUser(
    userId: string,
    from?: Date,
    to?: Date,
    client?: Prisma.TransactionClient
  ): Promise<Intervention[]>;
  deleteAndCreateAvailabilities(
    deleteIds: string[],
    createData: { userId: string; startAt: Date; endAt: Date; kind: "AVAILABLE" | "UNAVAILABLE" }[]
  ): Promise<{ deleted: number; created: number }>;

  createAdminRecommendation(seniorId: string, juniorId: string, note?: string): Promise<AdminRecommendation>;
  getAdminRecommendations(seniorId: string): Promise<(AdminRecommendation & { junior: User })[]>;
  deleteAdminRecommendation(id: string): Promise<void>;
  getMatchingSuggestions(userId: string): Promise<{ user: User; commonCategories: string[]; isRecommended: boolean }[]>;

  getUnreadNotificationCount(userId: string): Promise<number>;
  getNotifications(userId: string): Promise<Notification[]>;
  createNotification(data: Prisma.NotificationCreateInput): Promise<Notification>;
  markNotificationRead(id: string): Promise<Notification>;
  markAllNotificationsRead(userId: string): Promise<void>;
  getAllNotifications(): Promise<(Notification & { user: User })[]>;

  getAllUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<void>;
  getAllRelations(): Promise<(Relation & { senior: User; junior: User })[]>;
  getAllRelationsByStatus(status: string): Promise<(Relation & { senior: User; junior: User })[]>;
  createPayment(data: { userId: string; amount: number; label: string; date?: Date; credits?: number; creditSeniorId?: string | null; triggeredById: string; stripeSessionId?: string | null }): Promise<PaymentRecord>;
  getPayments(): Promise<(PaymentRecord & { user: User })[]>;
  getPaymentByStripeSessionId(stripeSessionId: string): Promise<PaymentRecord | null>;
  getCreditBalance(seniorId: string): Promise<number>;
  getCreditLedger(seniorId: string): Promise<CreditLedger[]>;
  getAllInterventions(): Promise<(Intervention & { relation: Relation & { senior: User; junior: User } })[]>;

  addFavorite(seniorId: string, juniorId: string): Promise<Favorite>;
  removeFavorite(seniorId: string, juniorId: string): Promise<void>;
  getFavoriteJuniorIds(seniorId: string): Promise<string[]>;

  /**
   * Remplace la photo de profil d'un utilisateur, octets et clé logique en une
   * seule transaction. Sans cela, un échec entre les deux écritures laisserait
   * User.profilePhoto pointer sur une photo inexistante.
   */
  replaceProfilePhoto(
    userId: string,
    photo: { filename: string; data: Buffer; mimeType: string }
  ): Promise<User>;
  /** Supprime la photo et remet User.profilePhoto à null. */
  deleteProfilePhoto(userId: string): Promise<User>;
  /** Octets d'une photo, par son nom de fichier logique. */
  getProfilePhotoByFilename(
    filename: string
  ): Promise<{ data: Buffer; mimeType: string } | null>;

  getOrCreateConversation(relationId: string): Promise<Conversation>;
  getConversationsForUser(userId: string): Promise<any[]>;
  getMessages(conversationId: string, limit: number, cursor?: string): Promise<Message[]>;
  createMessage(conversationId: string, senderId: string, content: string): Promise<Message>;
  markMessagesAsRead(conversationId: string, userId: string): Promise<number>;
  deleteMessage(messageId: string): Promise<Message>;
  getAllConversations(): Promise<any[]>;
  getUnreadMessageCountForUser(userId: string): Promise<number>;

  createPushSubscription(userId: string, endpoint: string, p256dh: string, auth: string): Promise<PushSubscription>;
  getPushSubscriptions(userId: string): Promise<PushSubscription[]>;
  deletePushSubscription(endpoint: string): Promise<void>;

  createReport(data: { reporterId: string; targetId?: string; relationId?: string; reason: string; message: string }): Promise<Report>;
  getReports(): Promise<(Report & { reporter: User; target: User | null })[]>;
  getOpenReportCount(): Promise<number>;
  updateReportStatus(id: string, status: string, handledNote: string): Promise<Report>;

  getNpsIneligibility(user: NpsRespondent): Promise<NpsIneligibleReason | null>;
  /**
   * Re-checks eligibility inside the transaction, under a per-user advisory
   * lock: two concurrent submits cannot both pass the cooldown check.
   */
  createNpsResponse(
    user: NpsRespondent,
    data: { score: number; reason?: string | null }
  ): Promise<{ response: NpsResponse } | { ineligible: NpsIneligibleReason }>;
  getNpsResponses(filters?: { from?: Date; to?: Date }): Promise<(NpsResponse & { user: Pick<User, "firstName" | "lastName"> | null })[]>;

  getAdmins(): Promise<User[]>;
  getRelationsBySeniorId(seniorId: string): Promise<(Relation & { senior: User; junior: User; interventions: Intervention[] })[]>;
  getSeniorsByStatus(status: string): Promise<User[]>;

  // Teacher
  getTeacherStudents(teacherId: string): Promise<(TeacherStudent & { student: User })[]>;
  addTeacherStudent(teacherId: string, studentId: string): Promise<TeacherStudent>;
  removeTeacherStudent(teacherId: string, studentId: string): Promise<void>;
  isTeacherOfStudent(teacherId: string, studentId: string): Promise<boolean>;

  getTeacherComments(studentId: string): Promise<(TeacherComment & { teacher: User })[]>;
  createTeacherComment(teacherId: string, studentId: string, content: string): Promise<TeacherComment>;
  updateTeacherComment(id: string, teacherId: string, content: string): Promise<TeacherComment>;
  deleteTeacherComment(id: string, teacherId: string): Promise<void>;
  getAllTeacherComments(): Promise<(TeacherComment & { teacher: User; student: User })[]>;

  getAllTeachers(): Promise<User[]>;
}

class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async getReferentsBySeniorId(seniorId: string): Promise<User[]> {
    return prisma.user.findMany({ where: { linkedSeniorId: seniorId } });
  }

  async getUserByValidationToken(token: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { validationToken: token } });
  }

  async activateSeniorWithAidant(
    seniorId: string,
    token: string,
    aidant: { email: string; password: string; firstName: string; lastName: string }
  ): Promise<User | null> {
    return prisma.$transaction(async (tx) => {
      // Conditional on the token: a concurrent validation that already
      // consumed it makes this a no-op instead of a second aidant account.
      const activated = await tx.user.updateMany({
        where: { id: seniorId, validationToken: token, status: "PENDING_VALIDATION" },
        data: { status: "ACTIVE", validationToken: null, validationExpiry: null },
      });
      if (activated.count === 0) return null;
      return tx.user.create({
        data: {
          ...aidant,
          role: "REFERENT_SENIOR",
          status: "ACTIVE",
          linkedSenior: { connect: { id: seniorId } },
        },
      });
    });
  }

  async createUser(data: Prisma.UserCreateInput): Promise<User> {
    return prisma.user.create({ data });
  }

  async updateUser(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return prisma.user.update({ where: { id }, data });
  }

  async getCategories(): Promise<Category[]> {
    return prisma.category.findMany({ orderBy: { name: "asc" } });
  }

  async createCategory(data: Prisma.CategoryCreateInput): Promise<Category> {
    return prisma.category.create({ data });
  }

  async getUserCategories(userId: string): Promise<(UserCategory & { category: Category })[]> {
    return prisma.userCategory.findMany({
      where: { userId },
      include: { category: true },
    });
  }

  async createUserCategory(userId: string, categoryId: string): Promise<UserCategory> {
    return prisma.userCategory.create({
      data: { userId, categoryId },
    });
  }

  async replaceUserCategories(userId: string, categoryIds: string[]): Promise<boolean> {
    const ids = [...new Set(categoryIds)];
    return prisma.$transaction(async (tx) => {
      const known = await tx.category.count({ where: { id: { in: ids } } });
      if (known !== ids.length) return false;
      await tx.userCategory.deleteMany({ where: { userId } });
      await tx.userCategory.createMany({ data: ids.map((categoryId) => ({ userId, categoryId })) });
      return true;
    });
  }

  async deleteUserCategories(userId: string): Promise<void> {
    await prisma.userCategory.deleteMany({ where: { userId } });
  }

  async getRelation(id: string): Promise<Relation | null> {
    return prisma.relation.findUnique({ where: { id } });
  }

  async getRelationsByUser(userId: string): Promise<(Relation & { senior: User; junior: User; interventions: Intervention[] })[]> {
    return prisma.relation.findMany({
      where: {
        OR: [{ seniorId: userId }, { juniorId: userId }],
      },
      include: { senior: true, junior: true, interventions: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async getRelationWithUsers(id: string): Promise<(Relation & { senior: User; junior: User; interventions: Intervention[] }) | null> {
    return prisma.relation.findUnique({
      where: { id },
      include: {
        senior: true,
        junior: true,
        interventions: { orderBy: { scheduledDate: "desc" } },
      },
    });
  }

  async getRelationBySeniorAndJunior(seniorId: string, juniorId: string): Promise<Relation | null> {
    return prisma.relation.findUnique({
      where: { seniorId_juniorId: { seniorId, juniorId } },
    });
  }

  async createRelation(seniorId: string, juniorId: string): Promise<Relation> {
    return prisma.relation.create({
      data: { seniorId, juniorId, status: "PENDING" },
    });
  }

  async updateRelationStatus(id: string, status: string): Promise<Relation> {
    return prisma.relation.update({
      where: { id },
      data: { status: status as any },
    });
  }

  async getIntervention(id: string): Promise<Intervention | null> {
    return prisma.intervention.findUnique({ where: { id } });
  }

  async getInterventionsByRelation(relationId: string): Promise<Intervention[]> {
    return prisma.intervention.findMany({
      where: { relationId },
      orderBy: { scheduledDate: "desc" },
    });
  }

  async getInterventionWithRelation(id: string): Promise<(Intervention & { relation: Relation }) | null> {
    return prisma.intervention.findUnique({
      where: { id },
      include: { relation: true },
    });
  }

  async createInterventionSafe(
    juniorId: string,
    data: { relationId: string; scheduledDate: Date; durationMinutes: number; location?: string; tasks?: string[] },
    checkConflict: (tx: Prisma.TransactionClient) => Promise<boolean>,
    seniorId: string
  ): Promise<{ intervention: Intervention } | { conflict: true } | { locked: true } | { noCredits: true }> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await prisma.$transaction(async (tx) => {
        // Verrou par jeune : empêche toute autre transaction concurrente de
        // réserver un créneau pour le même jeune en même temps. Non-bloquant
        // (try) pour ne pas mettre en file d'attente les requêtes suivantes :
        // si le verrou est déjà pris, on échoue vite et on retente.
        const rows = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(hashtext(${juniorId})) AS locked
        `;
        if (!rows[0]?.locked) {
          return { locked: true as const };
        }

        if (await checkConflict(tx)) {
          return { conflict: true as const };
        }

        // Per-senior lock (blocking, held a few ms): two bookings for the same
        // senior on different juniors cannot both use the last credit.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`credits:${seniorId}`}))`;
        const free = await isFreeMeeting(tx, { relationId: data.relationId, durationMinutes: data.durationMinutes });
        if (!free && (await computeCredits(tx, seniorId)).available < 1) {
          return { noCredits: true as const };
        }

        const intervention = await tx.intervention.create({
          data: {
            relationId: data.relationId,
            scheduledDate: data.scheduledDate,
            durationMinutes: data.durationMinutes,
            location: data.location || null,
            tasks: data.tasks || [],
            status: "PROPOSED",
            isFree: free,
          },
        });
        return { intervention };
      });

      if (!("locked" in result) || attempt === maxAttempts) {
        return result;
      }
      // Backoff court avant nouvelle tentative si le verrou était pris.
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
    return { locked: true };
  }

  async updateIntervention(id: string, data: Prisma.InterventionUpdateInput): Promise<Intervention> {
    return prisma.intervention.update({ where: { id }, data });
  }

  async getPendingFeedbackInterventions(userId: string): Promise<(Intervention & { relation: Relation })[]> {
    return prisma.intervention.findMany({
      where: {
        status: "COMPLETED_PENDING_FEEDBACK",
        relation: {
          OR: [{ seniorId: userId }, { juniorId: userId }],
        },
      },
      include: { relation: true },
      orderBy: { scheduledDate: "desc" },
    });
  }

  async getPendingFeedbackForReminder(): Promise<(Intervention & { relation: Relation & { senior: User; junior: User } })[]> {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    return prisma.intervention.findMany({
      where: {
        status: "COMPLETED_PENDING_FEEDBACK",
        feedbackReminderSentAt: null,
        scheduledDate: { lte: threeDaysAgo },
      },
      include: { relation: { include: { senior: true, junior: true } } },
    });
  }

  async updateInterventionFeedbackReminderSent(id: string): Promise<Intervention> {
    return prisma.intervention.update({
      where: { id },
      data: { feedbackReminderSentAt: new Date() },
    });
  }

  async getOverdueInterventionsForReminder(now: Date = new Date()): Promise<(Intervention & { relation: Relation & { senior: User; junior: User } })[]> {
    // Prisma cannot filter on scheduledDate + durationMinutes: the SQL bound
    // narrows the set, isMeetingOverdue applies the exact rule.
    const candidates = await prisma.intervention.findMany({
      where: {
        status: { in: [...OVERDUE_STATUSES] },
        meetingCheckReminderSentAt: null,
        scheduledDate: { lte: overdueStartBefore(now) },
      },
      include: { relation: { include: { senior: true, junior: true } } },
    });
    return candidates.filter((intervention) => isMeetingOverdue(intervention, now));
  }

  async recordMeetingCheckReminder(
    adminIds: string[],
    notification: { title: string; message: string; link: string },
    interventionIds: string[]
  ): Promise<void> {
    await prisma.$transaction([
      prisma.notification.createMany({
        data: adminIds.map((userId) => ({ userId, type: "MEETING_CHECK" as const, ...notification })),
      }),
      prisma.intervention.updateMany({
        where: { id: { in: interventionIds } },
        data: { meetingCheckReminderSentAt: new Date() },
      }),
    ]);
  }

  async getAvailabilitiesByUser(userId: string): Promise<Availability[]> {
    return prisma.availability.findMany({
      where: { userId, deletedAt: null },
      orderBy: { startAt: "asc" },
    });
  }

  async getAvailabilitiesInRange(userId: string, from: Date, to: Date): Promise<Availability[]> {
    return prisma.availability.findMany({
      where: {
        userId,
        deletedAt: null,
        startAt: { lt: to },
        endAt: { gt: from },
      },
      orderBy: { startAt: "asc" },
    });
  }

  async createAvailability(data: { userId: string; startAt: Date; endAt: Date; kind: "AVAILABLE" | "UNAVAILABLE" }): Promise<Availability> {
    return prisma.availability.create({ data });
  }

  async createManyAvailabilities(data: { userId: string; startAt: Date; endAt: Date; kind: "AVAILABLE" | "UNAVAILABLE" }[]): Promise<number> {
    const result = await prisma.availability.createMany({ data });
    return result.count;
  }

  async softDeleteAvailabilities(ids: string[]): Promise<number> {
    const result = await prisma.availability.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: new Date() },
    });
    return result.count;
  }

  async getAvailability(id: string): Promise<Availability | null> {
    return prisma.availability.findUnique({ where: { id } });
  }

  async getActiveInterventionsForUser(
    userId: string,
    from?: Date,
    to?: Date,
    client: Prisma.TransactionClient | typeof prisma = prisma
  ): Promise<Intervention[]> {
    return client.intervention.findMany({
      where: {
        status: { in: ["PROPOSED", "CONFIRMED"] },
        relation: { juniorId: userId },
        ...(from || to
          ? { scheduledDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
    });
  }

  async deleteAndCreateAvailabilities(
    deleteIds: string[],
    createData: { userId: string; startAt: Date; endAt: Date; kind: "AVAILABLE" | "UNAVAILABLE" }[]
  ): Promise<{ deleted: number; created: number }> {
    return prisma.$transaction(async (tx) => {
      const deleted = deleteIds.length > 0
        ? (await tx.availability.updateMany({ where: { id: { in: deleteIds } }, data: { deletedAt: new Date() } })).count
        : 0;
      const created = createData.length > 0
        ? (await tx.availability.createMany({ data: createData })).count
        : 0;
      return { deleted, created };
    });
  }

  async createAdminRecommendation(seniorId: string, juniorId: string, note?: string): Promise<AdminRecommendation> {
    return prisma.adminRecommendation.create({
      data: { seniorId, juniorId, note: note || null },
    });
  }

  async getAdminRecommendations(seniorId: string): Promise<(AdminRecommendation & { junior: User })[]> {
    return prisma.adminRecommendation.findMany({
      where: { seniorId },
      include: { junior: true },
    });
  }

  async deleteAdminRecommendation(id: string): Promise<void> {
    await prisma.adminRecommendation.delete({ where: { id } });
  }

  async getMatchingSuggestions(userId: string): Promise<{ user: User; commonCategories: string[]; isRecommended: boolean }[]> {
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { categories: { include: { category: true } } },
    });
    if (!currentUser) return [];

    const targetRole = currentUser.role === "SENIOR" ? "JUNIOR" : "SENIOR";
    const userCategoryIds = currentUser.categories.map((uc) => uc.categoryId);

    const existingRelations = await prisma.relation.findMany({
      where: {
        OR: [{ seniorId: userId }, { juniorId: userId }],
      },
      select: { seniorId: true, juniorId: true },
    });
    const excludedUserIds = new Set(
      existingRelations.map((r) => (r.seniorId === userId ? r.juniorId : r.seniorId))
    );

    const recommendations = currentUser.role === "SENIOR"
      ? await prisma.adminRecommendation.findMany({ where: { seniorId: userId }, select: { juniorId: true } })
      : await prisma.adminRecommendation.findMany({ where: { juniorId: userId }, select: { seniorId: true } });
    const recommendedIds = new Set(
      recommendations.map((r) => "juniorId" in r ? r.juniorId : r.seniorId)
    );

    const candidates = await prisma.user.findMany({
      where: {
        role: targetRole as any,
        status: "ACTIVE",
        id: { notIn: [...excludedUserIds, userId] },
        ...(currentUser.city ? { city: currentUser.city } : {}),
      },
      include: { categories: { include: { category: true } } },
    });

    const results = candidates.map((candidate) => {
      const candidateCategoryIds = candidate.categories.map((uc) => uc.categoryId);
      const common = userCategoryIds.filter((id) => candidateCategoryIds.includes(id));
      const commonNames = candidate.categories
        .filter((uc) => common.includes(uc.categoryId))
        .map((uc) => uc.category.name);
      const isRecommended = recommendedIds.has(candidate.id);

      return {
        user: candidate,
        commonCategories: commonNames,
        isRecommended,
        score: common.length + (isRecommended ? 100 : 0),
      };
    });

    results.sort((a, b) => b.score - a.score);

    return results.slice(0, 20).map(({ user, commonCategories, isRecommended }) => ({
      user,
      commonCategories,
      isRecommended,
    }));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async createNotification(data: Prisma.NotificationCreateInput): Promise<Notification> {
    return prisma.notification.create({ data });
  }

  async markNotificationRead(id: string): Promise<Notification> {
    return prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async getAllNotifications(): Promise<(Notification & { user: User })[]> {
    return prisma.notification.findMany({
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async getAllUsers(): Promise<User[]> {
    return prisma.user.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  }

  async deleteUser(id: string): Promise<void> {
    await prisma.$transaction([
      // NPS answers survive as anonymous scores (FK is SET NULL). The free-text
      // reason may identify the person, so it goes with the account.
      prisma.npsResponse.updateMany({ where: { userId: id }, data: { reason: null } }),
      prisma.user.delete({ where: { id } }),
    ]);
  }

  async getAllRelations(): Promise<(Relation & { senior: User; junior: User })[]> {
    return prisma.relation.findMany({
      include: { senior: true, junior: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async getAllRelationsByStatus(status: string): Promise<(Relation & { senior: User; junior: User })[]> {
    return prisma.relation.findMany({
      where: { status: status as any },
      include: { senior: true, junior: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async createPayment(data: { userId: string; amount: number; label: string; date?: Date; credits?: number; creditSeniorId?: string | null; triggeredById: string; stripeSessionId?: string | null }): Promise<PaymentRecord> {
    return prisma.$transaction(async (tx) => {
      const payment = await tx.paymentRecord.create({
        data: {
          userId: data.userId,
          amount: data.amount,
          label: data.label,
          date: data.date || new Date(),
          stripeSessionId: data.stripeSessionId ?? null,
        },
      });
      // No subscription in Lyannaj (credits only): User.subscriptionActive is
      // no longer written nor shown; the column stays until a later migration
      // (docs/decisions.md, 2026-10-13).
      if (data.credits && data.creditSeniorId) {
        await tx.creditLedger.create({
          data: {
            seniorId: data.creditSeniorId,
            type: "PURCHASE",
            amount: data.credits,
            reason: `Achat de ${data.credits} atelier${data.credits > 1 ? "s" : ""} (${data.label})`,
            triggeredById: data.triggeredById,
            paymentRecordId: payment.id,
          },
        });
      }
      return payment;
    });
  }

  async getPaymentByStripeSessionId(stripeSessionId: string): Promise<PaymentRecord | null> {
    return prisma.paymentRecord.findUnique({ where: { stripeSessionId } });
  }

  async getCreditBalance(seniorId: string): Promise<number> {
    return (await computeCredits(prisma, seniorId)).balance;
  }

  async getCreditLedger(seniorId: string): Promise<CreditLedger[]> {
    return prisma.creditLedger.findMany({
      where: { seniorId },
      orderBy: { createdAt: "desc" },
    });
  }

  async completeIntervention(
    interventionId: string,
    seniorId: string,
    triggeredById: string
  ): Promise<{ intervention: Intervention; free: boolean } | null> {
    return prisma.$transaction(async (tx) => {
      // Conditional update: only one of two concurrent calls moves the status,
      // the other sees count 0 and debits nothing.
      const { count } = await tx.intervention.updateMany({
        where: { id: interventionId, status: "CONFIRMED" },
        data: { status: "COMPLETED_PENDING_FEEDBACK" },
      });
      if (count === 0) return null;

      const updated = await tx.intervention.findUniqueOrThrow({ where: { id: interventionId } });
      const free = updated.isFree;
      if (!free) {
        await tx.creditLedger.create({
          data: {
            seniorId,
            type: "CONSUMPTION",
            amount: -1,
            reason: "Atelier réalisé",
            triggeredById,
            interventionId,
          },
        });
      }
      return { intervention: updated, free };
    });
  }

  async getCredits(seniorId: string): Promise<{ balance: number; available: number }> {
    return computeCredits(prisma, seniorId);
  }

  async cancelIntervention(id: string): Promise<Intervention | null> {
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.intervention.updateMany({
        where: { id, status: { in: [...RESERVING_STATUSES] } },
        data: { status: "CANCELLED" },
      });
      if (count === 0) return null;
      const cancelled = await tx.intervention.findUniqueOrThrow({ where: { id } });

      // The free meeting was cancelled: the relation keeps its free meeting,
      // which passes to the oldest short meeting still planned (if any).
      if (cancelled.isFree) {
        const relation = await tx.relation.findUnique({ where: { id: cancelled.relationId }, select: { status: true } });
        if (relation?.status === "PENDING_FIRST_MEETING") {
          const next = await tx.intervention.findFirst({
            where: {
              relationId: cancelled.relationId,
              status: { in: [...RESERVING_STATUSES] },
              durationMinutes: { lte: FREE_FIRST_MEETING_MAX_MINUTES },
            },
            orderBy: { createdAt: "asc" },
          });
          if (next) await tx.intervention.update({ where: { id: next.id }, data: { isFree: true } });
        }
      }
      return cancelled;
    });
  }

  async confirmIntervention(id: string): Promise<Intervention | null> {
    const { count } = await prisma.intervention.updateMany({
      where: { id, status: "PROPOSED" },
      data: { status: "CONFIRMED" },
    });
    return count === 0 ? null : prisma.intervention.findUnique({ where: { id } });
  }

  async getPayments(): Promise<(PaymentRecord & { user: User })[]> {
    return prisma.paymentRecord.findMany({
      include: { user: true },
      orderBy: { date: "desc" },
    });
  }

  async getAllInterventions(): Promise<(Intervention & { relation: Relation & { senior: User; junior: User } })[]> {
    return prisma.intervention.findMany({
      include: { relation: { include: { senior: true, junior: true } } },
      orderBy: { scheduledDate: "desc" },
    });
  }

  async getMeetingHistory(
    scope: MeetingHistoryScope,
    filters?: MeetingHistoryFilters
  ): Promise<(Intervention & { relation: Relation & { senior: User; junior: User } })[]> {
    const relationWhere: Prisma.RelationWhereInput | undefined =
      scope.kind === "all"
        ? undefined
        : scope.kind === "user"
          ? { OR: [{ seniorId: scope.userId }, { juniorId: scope.userId }] }
          : scope.kind === "senior"
            ? { seniorId: scope.seniorId }
            : { juniorId: { in: scope.studentIds } };

    const where: Prisma.InterventionWhereInput = {};
    if (relationWhere) where.relation = relationWhere;
    if (filters?.status?.length) where.status = { in: filters.status };
    if (filters?.from || filters?.to) {
      where.scheduledDate = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }

    return prisma.intervention.findMany({
      where,
      include: { relation: { include: { senior: true, junior: true } } },
      orderBy: { scheduledDate: "desc" },
    });
  }

  async addFavorite(seniorId: string, juniorId: string): Promise<Favorite> {
    return prisma.favorite.upsert({
      where: { seniorId_juniorId: { seniorId, juniorId } },
      update: {},
      create: { seniorId, juniorId },
    });
  }

  async removeFavorite(seniorId: string, juniorId: string): Promise<void> {
    await prisma.favorite.deleteMany({
      where: { seniorId, juniorId },
    });
  }

  async getFavoriteJuniorIds(seniorId: string): Promise<string[]> {
    const favs = await prisma.favorite.findMany({
      where: { seniorId },
      select: { juniorId: true },
    });
    return favs.map((f) => f.juniorId);
  }

  async replaceProfilePhoto(
    userId: string,
    photo: { filename: string; data: Buffer; mimeType: string }
  ): Promise<User> {
    // Les deux écritures dans la même transaction : User.profilePhoto ne doit
    // jamais désigner une photo absente de ProfilePhoto, ni l'inverse.
    return prisma.$transaction(async (tx) => {
      await tx.profilePhoto.upsert({
        where: { userId },
        create: {
          userId,
          filename: photo.filename,
          data: photo.data,
          mimeType: photo.mimeType,
          byteSize: photo.data.byteLength,
        },
        update: {
          filename: photo.filename,
          data: photo.data,
          mimeType: photo.mimeType,
          byteSize: photo.data.byteLength,
        },
      });

      return tx.user.update({
        where: { id: userId },
        data: { profilePhoto: `/uploads/${photo.filename}` },
      });
    });
  }

  async deleteProfilePhoto(userId: string): Promise<User> {
    return prisma.$transaction(async (tx) => {
      await tx.profilePhoto.deleteMany({ where: { userId } });
      return tx.user.update({
        where: { id: userId },
        data: { profilePhoto: null },
      });
    });
  }

  async getProfilePhotoByFilename(
    filename: string
  ): Promise<{ data: Buffer; mimeType: string } | null> {
    const photo = await prisma.profilePhoto.findUnique({
      where: { filename },
      select: { data: true, mimeType: true },
    });
    if (!photo) return null;
    return { data: Buffer.from(photo.data), mimeType: photo.mimeType };
  }

  async getOrCreateConversation(relationId: string): Promise<Conversation> {
    const existing = await prisma.conversation.findUnique({ where: { relationId } });
    if (existing) return existing;
    try {
      return await prisma.conversation.create({ data: { relationId } });
    } catch (err: any) {
      if (err.code === "P2002") {
        const found = await prisma.conversation.findUnique({ where: { relationId } });
        if (found) return found;
      }
      throw err;
    }
  }

  async getConversationsForUser(userId: string): Promise<any[]> {
    const relations = await prisma.relation.findMany({
      where: {
        OR: [{ seniorId: userId }, { juniorId: userId }],
        status: "ACTIVE",
      },
      select: { id: true },
    });
    const relationIds = relations.map((r) => r.id);
    if (relationIds.length === 0) return [];

    const existingConvs = await prisma.conversation.findMany({
      where: { relationId: { in: relationIds } },
      select: { relationId: true },
    });
    const existingRelationIds = new Set(existingConvs.map((c) => c.relationId));
    const missingRelationIds = relationIds.filter((id) => !existingRelationIds.has(id));
    if (missingRelationIds.length > 0) {
      await Promise.all(missingRelationIds.map((rid) => this.getOrCreateConversation(rid)));
    }

    const conversations = await prisma.conversation.findMany({
      where: { relationId: { in: relationIds } },
      include: {
        relation: {
          include: {
            senior: { select: { id: true, firstName: true, lastName: true, profilePhoto: true, role: true } },
            junior: { select: { id: true, firstName: true, lastName: true, profilePhoto: true, role: true } },
          },
        },
        messages: {
          where: { isDeleted: false },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const result = await Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await prisma.message.count({
          where: {
            conversationId: conv.id,
            senderId: { not: userId },
            isRead: false,
            isDeleted: false,
          },
        });
        const partner = conv.relation.seniorId === userId ? conv.relation.junior : conv.relation.senior;
        return {
          id: conv.id,
          relationId: conv.relationId,
          partner,
          lastMessage: conv.messages[0] || null,
          unreadCount,
          updatedAt: conv.updatedAt,
        };
      })
    );

    return result;
  }

  async getMessages(conversationId: string, limit: number, cursor?: string): Promise<Message[]> {
    return prisma.message.findMany({
      where: {
        conversationId,
        isDeleted: false,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
      },
    });
  }

  async createMessage(conversationId: string, senderId: string, content: string): Promise<Message> {
    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: { conversationId, senderId, content },
        include: {
          sender: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
        },
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);
    return message;
  }

  async markMessagesAsRead(conversationId: string, userId: string): Promise<number> {
    const result = await prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isRead: false,
        isDeleted: false,
      },
      data: { isRead: true },
    });
    return result.count;
  }

  async deleteMessage(messageId: string): Promise<Message> {
    return prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true, deletedByAdmin: true },
    });
  }

  async getAllConversations(): Promise<any[]> {
    return prisma.conversation.findMany({
      include: {
        relation: {
          include: {
            senior: { select: { id: true, firstName: true, lastName: true, email: true, profilePhoto: true } },
            junior: { select: { id: true, firstName: true, lastName: true, email: true, profilePhoto: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  async getUnreadMessageCountForUser(userId: string): Promise<number> {
    const relations = await prisma.relation.findMany({
      where: {
        OR: [{ seniorId: userId }, { juniorId: userId }],
        status: "ACTIVE",
      },
      include: { conversation: { select: { id: true } } },
    });
    const conversationIds = relations
      .map((r) => r.conversation?.id)
      .filter(Boolean) as string[];
    if (conversationIds.length === 0) return 0;

    return prisma.message.count({
      where: {
        conversationId: { in: conversationIds },
        senderId: { not: userId },
        isRead: false,
        isDeleted: false,
      },
    });
  }

  async createPushSubscription(userId: string, endpoint: string, p256dh: string, auth: string): Promise<PushSubscription> {
    return prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId, p256dh, auth },
      create: { userId, endpoint, p256dh, auth },
    });
  }

  async getPushSubscriptions(userId: string): Promise<PushSubscription[]> {
    return prisma.pushSubscription.findMany({ where: { userId } });
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }

  async createReport(data: { reporterId: string; targetId?: string; relationId?: string; reason: string; message: string }): Promise<Report> {
    return prisma.report.create({ data });
  }

  async getReports(): Promise<(Report & { reporter: User; target: User | null })[]> {
    return prisma.report.findMany({
      include: { reporter: true, target: true },
      orderBy: { createdAt: "desc" },
    }) as any;
  }

  async getOpenReportCount(): Promise<number> {
    return prisma.report.count({ where: { status: "OPEN" } });
  }

  async updateReportStatus(id: string, status: string, handledNote: string): Promise<Report> {
    return prisma.report.update({
      where: { id },
      data: { status, handledNote, handledAt: new Date() },
    });
  }

  async getNpsIneligibility(user: NpsRespondent): Promise<NpsIneligibleReason | null> {
    return findNpsIneligibility(prisma, user);
  }

  async createNpsResponse(
    user: NpsRespondent,
    data: { score: number; reason?: string | null }
  ): Promise<{ response: NpsResponse } | { ineligible: NpsIneligibleReason }> {
    return prisma.$transaction(async (tx) => {
      // Blocking lock (not "try"): the second request waits for the first to
      // commit, then sees the cooldown and gets a clean 409 instead of an error.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`nps:${user.id}`}))`;

      const ineligible = await findNpsIneligibility(tx, user);
      if (ineligible) return { ineligible };

      const response = await tx.npsResponse.create({
        data: {
          userId: user.id,
          role: user.role as NpsSegment,
          score: data.score,
          reason: data.reason || null,
        },
      });
      return { response };
    });
  }

  async getNpsResponses(filters: { from?: Date; to?: Date } = {}): Promise<(NpsResponse & { user: Pick<User, "firstName" | "lastName"> | null })[]> {
    return prisma.npsResponse.findMany({
      where: {
        createdAt: {
          ...(filters.from && { gte: filters.from }),
          ...(filters.to && { lte: filters.to }),
        },
      },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async getAdmins(): Promise<User[]> {
    return prisma.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" } });
  }

  async getRelationsBySeniorId(seniorId: string): Promise<(Relation & { senior: User; junior: User; interventions: Intervention[] })[]> {
    return prisma.relation.findMany({
      where: { seniorId },
      include: { senior: true, junior: true, interventions: { orderBy: { scheduledDate: "desc" } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async getSeniorsByStatus(status: string): Promise<User[]> {
    return prisma.user.findMany({
      where: { role: "SENIOR", status: status as any },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
  }

  // ==================== TEACHER ====================

  async getTeacherStudents(teacherId: string): Promise<(TeacherStudent & { student: User })[]> {
    return prisma.teacherStudent.findMany({
      where: { teacherId },
      include: { student: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async addTeacherStudent(teacherId: string, studentId: string): Promise<TeacherStudent> {
    return prisma.teacherStudent.create({ data: { teacherId, studentId } });
  }

  async removeTeacherStudent(teacherId: string, studentId: string): Promise<void> {
    await prisma.teacherStudent.deleteMany({ where: { teacherId, studentId } });
  }

  async isTeacherOfStudent(teacherId: string, studentId: string): Promise<boolean> {
    const link = await prisma.teacherStudent.findUnique({
      where: { teacherId_studentId: { teacherId, studentId } },
    });
    return link !== null;
  }

  async getTeacherComments(studentId: string): Promise<(TeacherComment & { teacher: User })[]> {
    return prisma.teacherComment.findMany({
      where: { studentId },
      include: { teacher: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async createTeacherComment(teacherId: string, studentId: string, content: string): Promise<TeacherComment> {
    return prisma.teacherComment.create({ data: { teacherId, studentId, content } });
  }

  async updateTeacherComment(id: string, teacherId: string, content: string): Promise<TeacherComment> {
    return prisma.teacherComment.update({ where: { id, teacherId }, data: { content } });
  }

  async deleteTeacherComment(id: string, teacherId: string): Promise<void> {
    await prisma.teacherComment.delete({ where: { id, teacherId } });
  }

  async getAllTeacherComments(): Promise<(TeacherComment & { teacher: User; student: User })[]> {
    return prisma.teacherComment.findMany({
      include: { teacher: true, student: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async getAllTeachers(): Promise<User[]> {
    return prisma.user.findMany({
      where: { role: "TEACHER" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
  }
}

export const storage = new DatabaseStorage();
