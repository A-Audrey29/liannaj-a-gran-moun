/**
 * Environnement d'execution des tests.
 *
 * Ce fichier est charge par Vitest AVANT les modules de test, donc avant que
 * server/env.ts ne lise process.env. C'est le seul endroit ou l'on peut poser
 * DATABASE_URL et SESSION_SECRET pour la suite.
 *
 * NODE_ENV vaut "test" : cela desactive CSP/HSTS (comme en dev) et, surtout,
 * empeche le journal des requetes d'ecrire les corps de reponse — qui
 * contiennent des donnees personnelles.
 */
import { TEST_DATABASE_URL } from "./global-setup";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.SESSION_SECRET =
  "secret-de-test-uniquement-au-moins-32-caracteres-pour-passer-la-validation";
process.env.BASE_URL = "http://localhost:5000";

// Aucune cle Brevo ni VAPID : e-mails et notifications push sont desactives.
// sendEmail() se contente alors d'un console.warn, ce qui evite tout appel
// reseau sortant depuis la suite de tests.
delete process.env.BREVO_API_KEY;
delete process.env.BREVO_SENDER_EMAIL;
delete process.env.BREVO_SENDER_NAME;
delete process.env.VAPID_PUBLIC_KEY;
delete process.env.VAPID_PRIVATE_KEY;
delete process.env.VAPID_SUBJECT;
