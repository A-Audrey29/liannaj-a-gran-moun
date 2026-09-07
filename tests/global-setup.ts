/**
 * Preparation de la base de test, executee une fois avant toute la suite.
 *
 * Garde-fou central : ces tests effacent des tables. Ils ne doivent jamais
 * pouvoir toucher la base de developpement ou de production. On impose donc
 * une base LOCALE dont le nom finit par "_test", et on refuse de demarrer
 * sinon — meme regle d'esprit que assertSafeToWipe() dans prisma/seed.ts.
 */
import { execSync } from "child_process";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  `postgresql://${process.env.USER}@localhost:5432/lyannaj_test`;

function assertBaseDeTestSure(url: string) {
  const host = url.match(/@([^/:]+)/)?.[1] ?? "";
  const dbName = url.split("/").pop()?.split("?")[0] ?? "";
  const estLocale = /^(localhost|127\.0\.0\.1|::1)$/.test(host);

  if (!estLocale) {
    throw new Error(
      `[TESTS] Base non locale (${host}) — refus. Les tests effacent des donnees.\n` +
        `Definir TEST_DATABASE_URL sur une base locale se terminant par "_test".`
    );
  }
  if (!dbName.endsWith("_test")) {
    throw new Error(
      `[TESTS] La base "${dbName}" ne finit pas par "_test" — refus.\n` +
        `Protection contre l'execution des tests sur une base de travail.`
    );
  }
}

export default async function setup() {
  assertBaseDeTestSure(TEST_DATABASE_URL);

  // Le schema est applique via les migrations versionnees, et non via
  // `db push` : les tests valident ainsi que les migrations reconstruisent
  // reellement une base complete depuis zero.
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
