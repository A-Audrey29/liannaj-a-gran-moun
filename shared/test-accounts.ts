/**
 * Demo accounts shown on the landing page while the platform runs in test mode
 * (Mollie key starting with "test_"). See GET /api/test-accounts.
 *
 * These are the accounts created by prisma/seed.ts. The ADMIN account is never
 * listed here: this list is public by design.
 */
export const TEST_ACCOUNT_PASSWORD = "password";

export type TestAccountRole = "SENIOR" | "JUNIOR" | "REFERENT_SENIOR" | "TEACHER";

export interface TestAccount {
  email: string;
  firstName: string;
  role: TestAccountRole;
}

export const TEST_ACCOUNTS: TestAccount[] = [
  { email: "senior@test.fr", firstName: "Jean", role: "SENIOR" },
  { email: "senior2@test.fr", firstName: "Madeleine", role: "SENIOR" },
  { email: "senior3@test.fr", firstName: "Georges", role: "SENIOR" },
  { email: "senior4@test.fr", firstName: "Simone", role: "SENIOR" },
  { email: "senior5@test.fr", firstName: "René", role: "SENIOR" },
  { email: "junior@test.fr", firstName: "Marie", role: "JUNIOR" },
  { email: "junior2@test.fr", firstName: "Lucas", role: "JUNIOR" },
  { email: "junior3@test.fr", firstName: "Emma", role: "JUNIOR" },
  { email: "junior4@test.fr", firstName: "Théo", role: "JUNIOR" },
  { email: "junior5@test.fr", firstName: "Léa", role: "JUNIOR" },
  { email: "junior6@test.fr", firstName: "Nathan", role: "JUNIOR" },
  { email: "referent@test.fr", firstName: "Monique", role: "REFERENT_SENIOR" },
  { email: "professeur@test.fr", firstName: "Sophie", role: "TEACHER" },
];

export const TEST_ROLE_LABELS: Record<TestAccountRole, string> = {
  SENIOR: "Sénior",
  JUNIOR: "Jeune",
  REFERENT_SENIOR: "Aidant",
  TEACHER: "Professeur",
};
