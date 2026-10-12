import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NPS_MIN_SCORE, NPS_MAX_SCORE, type NpsEligibilityResponse } from "@shared/nps";
import { PLATFORM_NAME } from "@shared/branding";

const SNOOZE_DAYS = 14;
const SCORES = Array.from({ length: NPS_MAX_SCORE - NPS_MIN_SCORE + 1 }, (_, i) => NPS_MIN_SCORE + i);

// "Plus tard" is remembered on this device only (no User column for an MVP).
// Keyed by user so two people sharing a tablet do not snooze each other.
const snoozeKey = (userId: string) => `lyannaj_nps_snooze_until_${userId}`;

function isSnoozed(userId: string): boolean {
  try {
    return Number(localStorage.getItem(snoozeKey(userId))) > Date.now();
  } catch {
    return false;
  }
}

function snooze(userId: string) {
  try {
    localStorage.setItem(snoozeKey(userId), String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
  } catch {
    // Private mode: the card simply reappears next visit.
  }
}

/**
 * NPS survey card for seniors and referents. Renders nothing unless the server
 * says this person may answer now (role, a meeting held, 90-day cooldown).
 */
export function NpsPrompt({ className }: { className?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  // Keyed by user: the query cache is never cleared on logout/login (and
  // staleTime is Infinity), so an unscoped key would leak the previous
  // person's eligibility on a shared tablet.
  const eligibilityKey = ["/api/nps/eligibility", user?.id];
  const { data } = useQuery<NpsEligibilityResponse>({
    queryKey: eligibilityKey,
    queryFn: async () => (await apiRequest("GET", "/api/nps/eligibility")).json(),
    enabled: !!user,
  });
  const [open, setOpen] = useState(false);
  // Read from localStorage on each render so it always follows the current
  // user; the counter only forces a re-render after "Plus tard".
  const [, setSnoozeTick] = useState(0);
  const snoozed = user ? isSnoozed(user.id) : false;
  // null, not 0: 0 is a valid answer and must not look like "nothing chosen".
  const [score, setScore] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/nps", { score, reason: reason.trim() || undefined });
    },
    onSuccess: () => {
      // Hide the card right away; the refetch below confirms with the server.
      queryClient.setQueryData<NpsEligibilityResponse>(eligibilityKey, { eligible: false });
      setOpen(false);
      setScore(null);
      setReason("");
      toast({ title: "Merci pour votre avis !" });
    },
    onError: () => toast({ title: "Impossible d'enregistrer votre avis", variant: "destructive" }),
    // Success or not, the server is the source of truth for "can still answer".
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nps/eligibility"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/nps"] });
    },
  });

  if (!user || !data?.eligible || snoozed) return null;

  return (
    <>
      <Card className={`border-[#e8d7fe] bg-[#f3eaff] ${className ?? ""}`} data-testid="card-nps-prompt">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <Heart className="w-6 h-6 text-[#8b5cf6] shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold">Votre avis nous aide à progresser</p>
            <p className="text-sm text-muted-foreground">Deux petites questions, moins de deux minutes.</p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setOpen(true)}
              className="rounded-full bg-[#dc4256] hover:bg-[#c73848] text-white"
              data-testid="button-nps-open"
            >
              Donner mon avis
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                snooze(user.id);
                setSnoozeTick((n) => n + 1);
              }}
              data-testid="button-nps-later"
            >
              Plus tard
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Votre avis sur {PLATFORM_NAME}</DialogTitle>
            <DialogDescription>
              Seule l'équipe {PLATFORM_NAME} voit votre nom. Les résultats transmis au financeur sont anonymes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div>
              <Label className="mb-3 block text-base leading-snug">
                Sur une échelle de {NPS_MIN_SCORE} à {NPS_MAX_SCORE}, quelle est la probabilité que vous recommandiez {PLATFORM_NAME} à votre entourage ?
              </Label>
              <ToggleGroup
                type="single"
                variant="outline"
                value={score === null ? "" : String(score)}
                // Clicking the selected value sends "": keep the current answer.
                onValueChange={(value) => value && setScore(Number(value))}
                className="grid grid-cols-6 sm:grid-cols-11 gap-2"
                aria-label="Note de recommandation"
              >
                {SCORES.map((value) => (
                  <ToggleGroupItem
                    key={value}
                    value={String(value)}
                    aria-label={`${value} sur ${NPS_MAX_SCORE}`}
                    className="h-12 w-full text-base font-semibold data-[state=on]:bg-[#dc4256] data-[state=on]:text-white"
                    data-testid={`button-nps-score-${value}`}
                  >
                    {value}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>{NPS_MIN_SCORE} : pas du tout probable</span>
                <span>{NPS_MAX_SCORE} : très probable</span>
              </div>
            </div>
            <div>
              <Label className="mb-2 block text-base">
                Pouvez-vous nous expliquer pourquoi vous avez attribué cette note ? (facultatif)
              </Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                rows={4}
                data-testid="input-nps-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => submit.mutate()}
              disabled={submit.isPending || score === null}
              className="bg-[#dc4256] hover:bg-[#c73848] text-white"
              data-testid="button-nps-submit"
            >
              {submit.isPending ? "Envoi..." : "Envoyer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
