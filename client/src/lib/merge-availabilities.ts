/**
 * Ré-export du module partagé — la logique de fusion vit dans shared/ pour que
 * client et serveur ne puissent pas diverger (une UI qui propose un créneau que
 * le serveur refuse serait invisible en revue).
 */
export { mergeAvailabilities, overlaps, contains, isSlotCovered } from "@shared/availability";
export type { Interval, Interval as MergedSlot } from "@shared/availability";
