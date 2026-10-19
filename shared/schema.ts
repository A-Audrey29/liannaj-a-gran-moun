import { z } from "zod";
import { NPS_MIN_SCORE, NPS_MAX_SCORE } from "./nps";

export type Role = "ADMIN" | "SENIOR" | "JUNIOR" | "REFERENT_SENIOR" | "TEACHER";
export type UserStatus = "PENDING_VALIDATION" | "ACTIVE" | "SUSPENDED" | "BANNED";
export type RelationStatus = "PENDING" | "PENDING_FIRST_MEETING" | "ACTIVE" | "PAUSED" | "CLOSED";
export type InterventionStatus = "PROPOSED" | "CONFIRMED" | "CANCELLED" | "DONE" | "COMPLETED_PENDING_FEEDBACK" | "COMPLETED";
export type NotificationType = "RELATION_REQUEST" | "INTERVENTION_PROPOSED" | "INTERVENTION_CONFIRMED" | "FEEDBACK_REMINDER" | "MEETING_CHECK" | "NEW_MESSAGE" | "SYSTEM";
export type AvailabilityKind = "AVAILABLE" | "UNAVAILABLE";

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
  /** Free first meeting of the relation: no credit reserved nor debited. */
  isFree: boolean;
  createdAt: Date;
}

export interface Availability {
  id: string;
  userId: string;
  startAt: Date;
  endAt: Date;
  kind: AvailabilityKind;
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

export interface TeacherStudent {
  id: string;
  teacherId: string;
  studentId: string;
  createdAt: Date;
}

export interface TeacherComment {
  id: string;
  teacherId: string;
  studentId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export const createTeacherCommentSchema = z.object({
  content: z.string().min(1, "Contenu requis").max(2000, "Commentaire trop long"),
});

export const updateTeacherCommentSchema = z.object({
  content: z.string().min(1, "Contenu requis").max(2000, "Commentaire trop long"),
});

export const updateStudentBioSchema = z.object({
  bio: z.preprocess((v) => (v === "" ? undefined : v), z.string().max(500).optional()),
  desiredActivity: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
});

export const createTeacherSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit faire au moins 6 caractères"),
  firstName: z.string().min(1, "Prénom requis"),
  lastName: z.string().min(1, "Nom requis"),
  phone: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
});

export type CreateTeacherCommentInput = z.infer<typeof createTeacherCommentSchema>;
export type UpdateStudentBioInput = z.infer<typeof updateStudentBioSchema>;
export type CreateTeacherInput = z.infer<typeof createTeacherSchema>;

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

/**
 * Datetime ISO complet, heure obligatoire.
 *
 * Une date seule ("2026-08-17") était jusqu'ici acceptée et interprétée à
 * minuit — inexploitable dès lors qu'on contraint la proposition aux plages
 * horaires déclarées par le jeune.
 *
 * Le fuseau est obligatoire (Z ou ±hh:mm). Une heure sans fuseau
 * ("2026-08-17T14:00") était lue dans le fuseau du serveur : UTC sur Render,
 * Paris en dev. Une rencontre saisie à 14h par l'admin s'affichait alors à
 * 10h en Guadeloupe. Les formulaires envoient un instant UTC calculé depuis
 * l'heure de Guadeloupe (créneaux du jeune, gpDateTimeToUtc).
 */
const isoDateTime = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/,
    "Date et heure requises avec fuseau (format ISO, ex. 2026-08-17T18:00:00.000Z)",
  )
  .refine((v) => !Number.isNaN(new Date(v).getTime()), "Date invalide");

export const insertInterventionSchema = z.object({
  relationId: z.string().min(1),
  scheduledDate: isoDateTime,
  durationMinutes: z.number().min(30).max(480).default(120),
  location: z.string().optional(),
  tasks: z.array(z.string()).default([]),
});

export const feedbackSchema = z.object({
  rating: z.number().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

// Not feedbackSchema: its min(1) would reject a score of 0, which is valid for NPS.
export const npsSchema = z.object({
  score: z
    .number({ invalid_type_error: "La note doit être un nombre" })
    .int("La note doit être un entier")
    .min(NPS_MIN_SCORE, `La note minimale est ${NPS_MIN_SCORE}`)
    .max(NPS_MAX_SCORE, `La note maximale est ${NPS_MAX_SCORE}`),
  reason: z.string().trim().max(1000).nullish(),
});

export const createAvailabilitySchema = z
  .object({
    startAt: z.string().min(1),
    endAt: z.string().min(1),
    kind: z.enum(["AVAILABLE", "UNAVAILABLE"]).default("AVAILABLE"),
  })
  .refine((data) => new Date(data.endAt) > new Date(data.startAt), {
    message: "endAt doit être après startAt",
    path: ["endAt"],
  });

const timeHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format attendu HH:MM");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu YYYY-MM-DD");

export const createDateExceptionSchema = z
  .object({
    date: isoDate,
    kind: z.enum(["AVAILABLE", "UNAVAILABLE"]),
    startTime: timeHHMM.optional(),
    endTime: timeHHMM.optional(),
  })
  .refine(
    (data) => (data.startTime === undefined) === (data.endTime === undefined),
    { message: "startTime et endTime doivent être fournis ensemble ou omis tous les deux", path: ["endTime"] }
  )
  .refine((data) => !data.startTime || !data.endTime || data.endTime > data.startTime, {
    message: "L'heure de fin doit être après l'heure de début",
    path: ["endTime"],
  });

// HH:MM strings compare correctly as text.
export const recurringSlotSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: timeHHMM,
    endTime: timeHHMM,
  })
  .refine((slot) => slot.endTime > slot.startTime, {
    message: "L'heure de fin doit être après l'heure de début",
    path: ["endTime"],
  });

const MAX_RECURRING_RANGE_DAYS = 90;

export const createRecurringAvailabilitiesSchema = z
  .object({
    from: isoDate,
    to: isoDate,
    slots: z.array(recurringSlotSchema).min(1),
  })
  .refine((data) => data.to >= data.from, {
    message: "to doit être après from",
    path: ["to"],
  })
  .refine(
    (data) => {
      const days = (new Date(data.to).getTime() - new Date(data.from).getTime()) / 86_400_000;
      return days <= MAX_RECURRING_RANGE_DAYS;
    },
    { message: `Plage limitée à ${MAX_RECURRING_RANGE_DAYS} jours`, path: ["to"] }
  );

/** Planning habituel mémorisé sur le jeune (User.availabilityTemplate). */
export const availabilityTemplateSchema = z.array(recurringSlotSchema).min(1);
export type AvailabilityTemplate = z.infer<typeof availabilityTemplateSchema>;

export const EXTEND_AVAILABILITY_WEEK_OPTIONS = [2, 4, 8] as const;

export const extendAvailabilitiesSchema = z.object({
  weeks: z
    .number()
    .int()
    .refine((w) => (EXTEND_AVAILABILITY_WEEK_OPTIONS as readonly number[]).includes(w), "Durée invalide"),
});

export { MAX_RECURRING_RANGE_DAYS };

export const createRelationSchema = z.object({
  juniorId: z.string().min(1, "ID du Junior requis"),
});

export const updateUserCategoriesSchema = z.object({
  categoryIds: z.array(z.string().min(1)).max(100),
});

export type UpdateUserCategoriesInput = z.infer<typeof updateUserCategoriesSchema>;

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

export interface CreditLedgerEntry {
  id: string;
  seniorId: string;
  type: "PURCHASE" | "CONSUMPTION" | "ADJUSTMENT";
  amount: number;
  reason: string;
  createdAt: Date;
}

export const createPaymentSchema = z.object({
  userId: z.string().min(1, "Utilisateur requis"),
  amount: z.number().positive("Montant doit être positif"),
  label: z.string().min(1, "Libellé requis"),
  date: z.string().optional(),
  credits: z.number().int().positive().optional(),
});

export const checkoutSchema = z.object({
  offerId: z.string().min(1, "Offre requise"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(6, "Mot de passe actuel requis"),
  newPassword: z.string().min(6, "Le nouveau mot de passe doit faire au moins 6 caractères"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalide"),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Lien invalide").max(200, "Lien invalide"),
  password: z.string().min(6, "Le mot de passe doit faire au moins 6 caractères").max(200),
});

export const createAdminSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit faire au moins 6 caractères"),
  firstName: z.string().min(1, "Prénom requis"),
  lastName: z.string().min(1, "Nom requis"),
});

/**
 * POST /api/validate. `aidant` is optional: the trusted person who validates a
 * senior's registration may open their own aidant (REFERENT_SENIOR) space in
 * the same step. Their e-mail is the one the validation link was sent to, so
 * it is never taken from the request.
 */
export const validateRegistrationSchema = z.object({
  token: z.string().min(1, "Token manquant"),
  aidant: z
    .object({
      firstName: z.string().trim().min(1, "Prénom requis").max(100),
      lastName: z.string().trim().min(1, "Nom requis").max(100),
      password: z.string().min(6, "Le mot de passe doit faire au moins 6 caractères"),
    })
    .optional(),
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
  scheduledDate: isoDateTime,
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

/**
 * Historique des rencontres, partagé par toutes les interfaces.
 *
 * Le périmètre (quelles rencontres) ET la visibilité des feedbacks sont décidés
 * serveur à partir du rôle de l'appelant. Un feedback à `null` peut donc
 * signifier « non renseigné » ou « pas le droit de le lire » : le client ne fait
 * pas la différence, et c'est voulu — la réponse JSON ne transporte jamais un
 * commentaire que le viewer n'a pas le droit de voir.
 */
export interface MeetingHistoryEntry {
  id: string;
  relationId: string;
  scheduledDate: string; // ISO
  durationMinutes: number;
  location: string | null;
  tasks: string[]; // = services / ateliers
  status: InterventionStatus;
  seniorId: string;
  juniorId: string;
  seniorName: string;
  juniorName: string;
  seniorRating: number | null;
  seniorComment: string | null;
  juniorRating: number | null;
  juniorComment: string | null;
}

/**
 * Agrégats calculés sur les seules rencontres effectivement réalisées
 * (COMPLETED et COMPLETED_PENDING_FEEDBACK) : une rencontre annulée ou encore
 * au stade de proposition ne représente aucune heure passée.
 *
 * ⚠️ `byService` : une rencontre porte plusieurs ateliers, et sa durée est
 * comptée entière pour chacun. La somme des `minutes` de byService peut donc
 * dépasser `totalMinutes` — ce sont des heures par service, pas une partition.
 */
export interface MeetingHistorySummary {
  totalMeetings: number;
  totalMinutes: number;
  byService: { service: string; count: number; minutes: number }[];
}

export interface MeetingHistoryResponse {
  entries: MeetingHistoryEntry[]; // triées par scheduledDate DESC
  summary: MeetingHistorySummary;
}

export const INTERVENTION_STATUSES = [
  "PROPOSED",
  "CONFIRMED",
  "CANCELLED",
  "DONE",
  "COMPLETED_PENDING_FEEDBACK",
  "COMPLETED",
] as const;

/** Statuts comptabilisés dans le récap heures/services. */
export const COMPLETED_STATUSES: InterventionStatus[] = ["COMPLETED", "COMPLETED_PENDING_FEEDBACK"];

export const meetingHistoryQuerySchema = z.object({
  userId: z.string().min(1).optional(),
  status: z
    .union([z.enum(INTERVENTION_STATUSES), z.array(z.enum(INTERVENTION_STATUSES))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export type MeetingHistoryQuery = z.infer<typeof meetingHistoryQuerySchema>;

/** Admins pass ?seniorId= to read a given senior's credits; others ignore it. */
export const creditsQuerySchema = z.object({
  seniorId: z.string().min(1).max(64).optional(),
});

/** Stripe Checkout session id, appended by Stripe to the success URL. */
export const checkoutStatusQuerySchema = z.object({
  sessionId: z.string().regex(/^cs_[A-Za-z0-9_]+$/, "Identifiant de session invalide").max(255),
});

export const npsQuerySchema = z
  .object({
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  // ISO dates compare correctly as strings. Without this, an inverted range
  // returns an empty report that reads as "no data".
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: "La date de début doit précéder la date de fin",
    path: ["to"],
  });

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
export type NpsInput = z.infer<typeof npsSchema>;
export type CreateAvailabilityInput = z.infer<typeof createAvailabilitySchema>;
export type CreateDateExceptionInput = z.infer<typeof createDateExceptionSchema>;
export type CreateRecurringAvailabilitiesInput = z.infer<typeof createRecurringAvailabilitiesSchema>;
export type CreateRelationInput = z.infer<typeof createRelationSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type CreateAdminInput = z.infer<typeof createAdminSchema>;
