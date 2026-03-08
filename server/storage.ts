import { prisma } from "./prisma";
import type { User, Category, UserCategory, Relation, Intervention, Notification, Prisma } from "../generated/prisma/client.ts";

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
  getRelationsByUser(userId: string): Promise<Relation[]>;

  getIntervention(id: string): Promise<Intervention | null>;
  getInterventionsByRelation(relationId: string): Promise<Intervention[]>;

  getUnreadNotificationCount(userId: string): Promise<number>;
  getNotifications(userId: string): Promise<Notification[]>;
  createNotification(data: Prisma.NotificationCreateInput): Promise<Notification>;
  markNotificationRead(id: string): Promise<Notification>;
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

  async getRelationsByUser(userId: string): Promise<Relation[]> {
    return prisma.relation.findMany({
      where: {
        OR: [{ seniorId: userId }, { juniorId: userId }],
      },
      orderBy: { createdAt: "desc" },
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
}

export const storage = new DatabaseStorage();
