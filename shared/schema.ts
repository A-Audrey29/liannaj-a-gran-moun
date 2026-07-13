import { z } from "zod";

export type Role = "ADMIN" | "SENIOR" | "JUNIOR" | "REFERENT_SENIOR";
export type UserStatus = "PENDING_VALIDATION" | "ACTIVE" | "SUSPENDED" | "BANNED";
export type RelationStatus = "PENDING" | "PENDING_FIRST_MEETING" | "ACTIVE" | "PAUSED" | "CLOSED";
export type InterventionStatus = "PROPOSED" | "CONFIRMED" | "CANCELLED" | "DONE" | "COMPLETED_PENDING_FEEDBACK" | "COMPLETED";
export type NotificationType = "RELATION_REQUEST" | "INTERVENTION_PROPOSED" | "INTERVENTION_CONFIRMED" | "FEEDBACK_REMINDER" | "NEW_MESSAGE" | "SYSTEM";

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
  linkedSeniorId: string | null;
  validatorEmail: string | null;
  validationToken: string | null;
  validationExpiry: Date | null;
  profilePhoto: string | null;
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
  feedbackReminderSentAt: Date | null;
  createdAt: Date;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: Date;
}

export interface Favorite {
  id: string;
  seniorId: string;
  juniorId: string;
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

const FREEMAIL_DOMAINS = [
  "gmail.com", "yahoo.fr", "yahoo.com", "hotmail.com", "hotmail.fr",
  "outlook.com", "outlook.fr", "orange.fr", "wanadoo.fr", "free.fr",
  "sfr.fr", "laposte.net", "live.com", "live.fr", "icloud.com",
  "protonmail.com", "gmx.com", "gmx.fr", "aol.com", "mail.com",
];

const isDev = typeof process !== "undefined"
  ? process.env.NODE_ENV !== "production"
  : true;

export const insertUserBaseSchema = z.object({
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

export const insertUserSchema = insertUserBaseSchema.refine(
  (data) => data.email.toLowerCase().trim() !== data.validatorEmail.toLowerCase().trim(),
  { message: "Le validateur ne peut pas être vous-même", path: ["validatorEmail"] }
).refine(
  (data) => {
    if (data.role !== "JUNIOR" || isDev) return true;
    const domain = data.validatorEmail.split("@")[1]?.toLowerCase();
    return !FREEMAIL_DOMAINS.includes(domain);
  },
  { message: "Le validateur Junior doit utiliser un email professionnel ou institutionnel", path: ["validatorEmail"] }
);

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

export const createRelationSchema = z.object({
  juniorId: z.string().min(1, "ID du Junior requis"),
});

export const updateProfileSchema = z.object({
  firstName: z.string().min(1, "Prénom requis").optional(),
  lastName: z.string().min(1, "Nom requis").optional(),
  phone: optionalString,
  address: optionalString,
  city: optionalString,
  postalCode: optionalString,
  bio: z.preprocess(
    (val) => (val === "" ? undefined : val),
    z.string().max(500).optional()
  ),
  desiredActivity: optionalString,
  trustedPersonName: optionalString,
  trustedPersonEmail: optionalEmail,
  schoolName: optionalString,
  referentTitle: optionalString,
  referentFirstName: optionalString,
  referentLastName: optionalString,
});

export interface PaymentRecord {
  id: string;
  userId: string;
  amount: number;
  label: string;
  date: Date;
  createdAt: Date;
}

export const createPaymentSchema = z.object({
  userId: z.string().min(1, "Utilisateur requis"),
  amount: z.number().positive("Montant doit être positif"),
  label: z.string().min(1, "Libellé requis"),
  date: z.string().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(6, "Mot de passe actuel requis"),
  newPassword: z.string().min(6, "Le nouveau mot de passe doit faire au moins 6 caractères"),
});

export const createAdminSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit faire au moins 6 caractères"),
  firstName: z.string().min(1, "Prénom requis"),
  lastName: z.string().min(1, "Nom requis"),
});

export const createReferentSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit faire au moins 6 caractères"),
  firstName: z.string().min(1, "Prénom requis"),
  lastName: z.string().min(1, "Nom requis"),
  linkedSeniorId: z.string().min(1, "Sénior lié requis"),
  phone: z.preprocess((val) => (val === "" ? undefined : val), z.string().optional()),
});

export const referentInterventionSchema = z.object({
  relationId: z.string().min(1, "Relation requise"),
  scheduledDate: z.string().min(1, "Date requise"),
  durationMinutes: z.number().min(30).max(480).default(120),
  location: z.string().optional(),
  tasks: z.array(z.string()).default([]),
});

export const referentContactSchema = z.object({
  subject: z.string().min(1, "Sujet requis").max(200),
  message: z.string().min(10, "Message trop court").max(2000),
});

export type CreateReferentInput = z.infer<typeof createReferentSchema>;
export type ReferentInterventionInput = z.infer<typeof referentInterventionSchema>;
export type ReferentContactInput = z.infer<typeof referentContactSchema>;

export type ReportReason = "PERSON" | "QUESTION" | "OTHER";
export type ReportStatus = "OPEN" | "HANDLED";

export interface Report {
  id: string;
  reporterId: string;
  targetId: string | null;
  relationId: string | null;
  reason: ReportReason;
  message: string;
  status: ReportStatus;
  createdAt: Date;
}

export const insertReportSchema = z.object({
  reason: z.enum(["PERSON", "QUESTION", "OTHER"]),
  relationId: z.string().optional(),
  message: z.string().max(2000).optional(),
});

export type InsertReport = z.infer<typeof insertReportSchema>;

export type LoginInput = z.infer<typeof loginSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertIntervention = z.infer<typeof insertInterventionSchema>;
export type FeedbackInput = z.infer<typeof feedbackSchema>;
export type CreateRelationInput = z.infer<typeof createRelationSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateAdminInput = z.infer<typeof createAdminSchema>;
