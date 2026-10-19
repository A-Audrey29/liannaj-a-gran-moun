import { apiRequest, queryClient } from "@/lib/queryClient";

/**
 * Déconnexion complète : session serveur, cache des requêtes et onglets
 * mémorisés.
 *
 * Senior et aidant partagent souvent la même tablette. Sans ce ménage, le
 * compte suivant héritait de l'onglet du précédent (page vide si son rôle ne
 * l'a pas) et pouvait voir ses données en cache le temps du rechargement.
 */
export async function logout(navigate: (path: string) => void) {
  await apiRequest("POST", "/api/auth/logout");
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith("feves_")) sessionStorage.removeItem(key);
  }
  navigate("/login");
  queryClient.clear();
}
