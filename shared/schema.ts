import { z } from "zod";

export type Role = "ADMIN" | "SENIOR" | "JUNIOR";
export type UserStatus = "PENDING_VALIDATION" | "ACTIVE" | "SUSPENDED" | "BANNED";
export type RelationStatus = "PENDING" | "PENDING_FIRST_MEETING" | "ACTIVE" | "PAUSED" | "CLOSED";
export type InterventionStatus = "PENDING" | "CONFIRMED" | "DONE" | "COMPLETED_PENDING_FEEDBACK" | "COMPLETED" | "CANCELLED";
export type NotificationType = "RELATION_REQUEST" | "INTERVENTION_PROPOSED" | "INTERVENTION_CONFIRMED" | "FEEDBACK_REQUIRED" | "ACCOUNT_VALIDATED" | "GENERAL";

export interface User {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
  status: UserStatus;
  birthDate: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  bio: string | null;
  desiredActivity: string | null;
  schoolName: string | null;
  referentTitle: string | null;
  referentFirstName: string | null;
  referentLastName: string | null;
  referentEmail: string | null;
  trustedPersonName: string | null;
  trustedPersonEmail: string | null;
  validatorEmail: string | null;
  validationToken: string | null;
  validationExpiry: Date | null;
  subscriptionActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id: string;
  name: string;
  createdAt: Date;
}

export interface UserCategory {
  id: string;
  userId: string;
  categoryId: string;
}

export interface Relation {
  id: string;
  seniorId: string;
  juniorId: string;
  status: RelationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface Intervention {
  id: string;
  relationId: string;
  scheduledDate: Date;
  durationMinutes: number;
  location: string | null;
  tasks: string[];
  status: InterventionStatus;
  seniorRating: number | null;
  seniorComment: string | null;
  juniorRating: number | null;
  juniorComment: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
}

export const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit faire au moins 6 caractères"),
});

const optionalString = z.preprocess(
  (val) => (val === "" ? undefined : val),
  z.string().optional()
);

const optionalEmail = z.preprocess(
  (val) => (val === "" ? undefined : val),
  z.string().email().optional()
);

export const insertUserSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit faire au moins 6 caractères"),
  firstName: z.string().min(1, "Prénom requis"),
  lastName: z.string().min(1, "Nom requis"),
  role: z.enum(["SENIOR", "JUNIOR"]),
  birthDate: optionalString,
  phone: optionalString,
  address: optionalString,
  city: optionalString,
  postalCode: optionalString,
  bio: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().max(500).optional()
  ),
  desiredActivity: optionalString,
  schoolName: optionalString,
  referentTitle: optionalString,
  referentFirstName: optionalString,
  referentLastName: optionalString,
  referentEmail: optionalEmail,
  trustedPersonName: optionalString,
  trustedPersonEmail: optionalEmail,
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
