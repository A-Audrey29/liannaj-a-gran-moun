import { z } from "zod";

export type {
  User,
  Category,
  UserCategory,
  Relation,
  Intervention,
  AdminRecommendation,
  PaymentRecord,
  Report,
  Notification,
} from "../generated/prisma/client.ts";

export {
  Role,
  UserStatus,
  RelationStatus,
  InterventionStatus,
  NotificationType,
} from "../generated/prisma/client.ts";

export const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit faire au moins 6 caractères"),
});

export const insertUserSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit faire au moins 6 caractères"),
  firstName: z.string().min(1, "Prénom requis"),
  lastName: z.string().min(1, "Nom requis"),
  role: z.enum(["SENIOR", "JUNIOR"]),
  birthDate: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  bio: z.string().max(500).optional(),
  desiredActivity: z.string().optional(),
  schoolName: z.string().optional(),
  referentTitle: z.string().optional(),
  referentFirstName: z.string().optional(),
  referentLastName: z.string().optional(),
  referentEmail: z.string().email().optional(),
  trustedPersonName: z.string().optional(),
  trustedPersonEmail: z.string().email().optional(),
  validatorEmail: z.string().email("Email du validateur requis"),
  categoryIds: z.array(z.string()).optional(),
});

export const insertInterventionSchema = z.object({
  relationId: z.string().min(1),
  scheduledDate: z.string().min(1),
  durationMinutes: z.number().min(30).max(480).default(120),
  location: z.string().optional(),
  tasks: z.array(z.string()).default([]),
});

export const feedbackSchema = z.object({
  rating: z.number().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertIntervention = z.infer<typeof insertInterventionSchema>;
export type FeedbackInput = z.infer<typeof feedbackSchema>;
