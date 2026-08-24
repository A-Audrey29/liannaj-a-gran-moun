/**
 * Source unique des noms affichés.
 *
 * Deux entités distinctes, à ne pas confondre :
 *   - Lyannaj : la plateforme (le logiciel). C'est elle qui s'adresse à
 *     l'utilisateur — interface, objets d'e-mail, notifications.
 *   - FEVES : l'association qui porte la plateforme. Elle apparaît en
 *     attribution (pied de page des e-mails, mentions légales), pas comme
 *     émetteur des messages.
 *
 * Toujours importer depuis ce fichier plutôt que d'écrire le nom en dur : le
 * premier renommage a laissé "FEVES" dans une trentaine d'e-mails parce que la
 * chaîne était dupliquée partout.
 */

/** Nom de la plateforme. À utiliser par défaut dans tout texte utilisateur. */
export const PLATFORM_NAME = "Lyannaj";

/** Devise créole de la plateforme. */
export const PLATFORM_TAGLINE = "lyannaj a gran moun";

/** Nom de la plateforme avec sa devise. En-têtes, page d'accueil. */
export const PLATFORM_FULL_NAME = `${PLATFORM_NAME} - ${PLATFORM_TAGLINE}`;

/** Association porteuse du projet. Attribution uniquement. */
export const ORGANIZATION_NAME = "FEVES";

/** Ligne d'attribution, pour les pieds de page d'e-mail. */
export const PLATFORM_ATTRIBUTION = `${PLATFORM_NAME} est une plateforme de l'association ${ORGANIZATION_NAME}.`;
