import { prisma } from "./prisma";
import type { User, Category, UserCategory, Relation, Intervention, AdminRecommendation, Notification, PaymentRecord, Favorite, Conversation, Message, PushSubscription, Report, TeacherStudent, TeacherComment, Internship, Prisma } from "../generated/prisma/client.ts";

export interface IStorage {
  getUser(id: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserByValidationToken(token: string): Promise<User | null>;
  createUser(data: Prisma.UserCreateInput): Promise<User>;
  updateUser(id: string, data: Prisma.UserUpdateInput): Promise<User>;

  getCategories(): Promise<Category[]>;
  createCategory(data: Prisma.CategoryCreateInput): Promise<Category>;

  getUserCategories(userId: string): Promise<(UserCategory & { category: Category })[]>;
  createUserCategory(userId: string, categoryId: string): Promise<UserCategory>;
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
  createIntervention(data: { relationId: string; scheduledDate: Date; durationMinutes: number; location?: string; tasks?: string[] }): Promise<Intervention>;
  updateIntervention(id: string, data: Prisma.InterventionUpdateInput): Promise<Intervention>;
  getPendingFeedbackInterventions(userId: string): Promise<(Intervention & { relation: Relation })[]>;
  getPendingFeedbackForReminder(): Promise<(Intervention & { relation: Relation & { senior: User; junior: User } })[]>;
  updateInterventionFeedbackReminderSent(id: string): Promise<Intervention>;

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
  createPayment(data: { userId: string; amount: number; label: string; date?: Date }): Promise<PaymentRecord>;
  getPayments(): Promise<(PaymentRecord & { user: User })[]>;
  getAllInterventions(): Promise<(Intervention & { relation: Relation & { senior: User; junior: User } })[]>;

  addFavorite(seniorId: string, juniorId: string): Promise<Favorite>;
  removeFavorite(seniorId: string, juniorId: string): Promise<void>;
  getFavoriteJuniorIds(seniorId: string): Promise<string[]>;

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

  getStudentInternships(studentId: string): Promise<Internship[]>;
  createInternship(data: { studentId: string; companyName: string; companyAddress?: string; supervisorName?: string; supervisorEmail?: string; startDate: Date; endDate?: Date; description?: string; status?: string; teacherNotes?: string }): Promise<Internship>;
  updateInternship(id: string, data: Prisma.InternshipUpdateInput): Promise<Internship>;
  deleteInternship(id: string): Promise<void>;
  getAllInternships(): Promise<(Internship & { student: User })[]>;

  getAllTeachers(): Promise<User[]>;
}

class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async getUserByValidationToken(token: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { validationToken: token } });
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

  async createIntervention(data: { relationId: string; scheduledDate: Date; durationMinutes: number; location?: string; tasks?: string[] }): Promise<Intervention> {
    return prisma.intervention.create({
      data: {
        relationId: data.relationId,
        scheduledDate: data.scheduledDate,
        durationMinutes: data.durationMinutes,
        location: data.location || null,
        tasks: data.tasks || [],
        status: "PROPOSED",
      },
    });
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
    await prisma.user.delete({ where: { id } });
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

  async createPayment(data: { userId: string; amount: number; label: string; date?: Date }): Promise<PaymentRecord> {
    const [payment] = await prisma.$transaction([
      prisma.paymentRecord.create({
        data: {
          userId: data.userId,
          amount: data.amount,
          label: data.label,
          date: data.date || new Date(),
        },
      }),
      prisma.user.update({
        where: { id: data.userId },
        data: { subscriptionActive: true },
      }),
    ]);
    return payment;
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

  async getStudentInternships(studentId: string): Promise<Internship[]> {
    return prisma.internship.findMany({
      where: { studentId },
      orderBy: { startDate: "desc" },
    });
  }

  async createInternship(data: { studentId: string; companyName: string; companyAddress?: string; supervisorName?: string; supervisorEmail?: string; startDate: Date; endDate?: Date; description?: string; status?: string; teacherNotes?: string }): Promise<Internship> {
    return prisma.internship.create({
      data: {
        studentId: data.studentId,
        companyName: data.companyName,
        companyAddress: data.companyAddress || null,
        supervisorName: data.supervisorName || null,
        supervisorEmail: data.supervisorEmail || null,
        startDate: data.startDate,
        endDate: data.endDate || null,
        description: data.description || null,
        status: (data.status as any) || "UPCOMING",
        teacherNotes: data.teacherNotes || null,
      },
    });
  }

  async updateInternship(id: string, data: Prisma.InternshipUpdateInput): Promise<Internship> {
    return prisma.internship.update({ where: { id }, data });
  }

  async deleteInternship(id: string): Promise<void> {
    await prisma.internship.delete({ where: { id } });
  }

  async getAllInternships(): Promise<(Internship & { student: User })[]> {
    return prisma.internship.findMany({
      include: { student: true },
      orderBy: { startDate: "desc" },
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
