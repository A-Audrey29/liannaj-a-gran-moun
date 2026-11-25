import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest, apiErrorMessage } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CREDIT_ADJUSTMENT_MAX } from "@shared/schema";
import type { AdminCreditLedgerEntry } from "@shared/credits";

const TYPE_LABELS: Record<AdminCreditLedgerEntry["type"], string> = {
  PURCHASE: "Achat",
  CONSUMPTION: "Atelier",
  ADJUSTMENT: "Ajustement",
};

/**
 * Admin adds or removes credits by hand (refund done in Mollie, gesture,
 * correction), and sees the full history with who did what and why.
 * Every rule is enforced by the server too (POST /api/admin/credits/adjustments);
 * this form only explains them before sending.
 */
export default function CreditAdjustmentPanel({ seniorId, seniorName }: { seniorId: string; seniorName: string }) {
  const { toast } = useToast();
  const [direction, setDirection] = useState<"add" | "remove">("remove");
  const [count, setCount] = useState("1");
  const [afterRefund, setAfterRefund] = useState(false);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);

  const ledgerKey = ["/api/admin/credits/ledger", seniorId];
  const { data: ledger = [] } = useQuery<AdminCreditLedgerEntry[]>({
    queryKey: ledgerKey,
    queryFn: () =>
      apiRequest("GET", `/api/admin/credits/ledger?seniorId=${encodeURIComponent(seniorId)}`).then((res) => res.json()),
  });

  const n = Number(count);
  const countValid = Number.isInteger(n) && n >= 1 && n <= CREDIT_ADJUSTMENT_MAX;
  const refund = direction === "remove" && afterRefund;
  const noteValid = note.trim().length >= 10;
  const referenceValid = !refund || reference.trim().length >= 3;
  const canSubmit = countValid && noteValid && referenceValid;
  const summary = `${direction === "add" ? "Ajouter" : "Retirer"} ${n} crédit${n > 1 ? "s" : ""} à ${seniorName}`;

  const mutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/admin/credits/adjustments", {
        seniorId,
        amount: direction === "add" ? n : -n,
        afterRefund: refund,
        externalReference: reference.trim() || undefined,
        adminNote: note.trim(),
      }),
    onSuccess: () => {
      toast({ title: "Crédits ajustés", description: summary });
      setCount("1");
      setAfterRefund(false);
      setReference("");
      setNote("");
      setConfirming(false);
      queryClient.invalidateQueries({ queryKey: ledgerKey });
      queryClient.invalidateQueries({ queryKey: ["/api/credits/balance"] });
    },
    onError: (err) => {
      setConfirming(false);
      toast({ title: "Ajustement refusé", description: apiErrorMessage(err, "Erreur"), variant: "destructive" });
    },
  });

  return (
    <section className="mt-6 border-t pt-4 space-y-4" data-testid="section-credit-adjustment">
      <h3 className="font-semibold">Ajuster les crédits</h3>

      <div className="flex gap-2" role="group" aria-label="Sens de l'ajustement">
        <Button
          type="button"
          variant={direction === "remove" ? "default" : "outline"}
          aria-pressed={direction === "remove"}
          onClick={() => { setDirection("remove"); setConfirming(false); }}
          data-testid="btn-adjust-remove"
        >
          Retirer
        </Button>
        <Button
          type="button"
          variant={direction === "add" ? "default" : "outline"}
          aria-pressed={direction === "add"}
          onClick={() => { setDirection("add"); setConfirming(false); }}
          data-testid="btn-adjust-add"
        >
          Ajouter
        </Button>
      </div>

      <div className="space-y-1">
        <Label htmlFor="adjust-count">Nombre de crédits (1 à {CREDIT_ADJUSTMENT_MAX})</Label>
        <Input
          id="adjust-count"
          type="number"
          inputMode="numeric"
          min={1}
          max={CREDIT_ADJUSTMENT_MAX}
          step={1}
          value={count}
          onChange={(e) => { setCount(e.target.value); setConfirming(false); }}
          data-testid="input-adjust-count"
        />
      </div>

      {direction === "remove" && (
        <div className="flex items-center gap-3 min-h-11">
          <Checkbox
            id="adjust-refund"
            checked={afterRefund}
            onCheckedChange={(v) => { setAfterRefund(v === true); setConfirming(false); }}
            data-testid="checkbox-adjust-refund"
          />
          <Label htmlFor="adjust-refund">Suite à un remboursement (Mollie ou virement)</Label>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="adjust-reference">
          Référence de la transaction {refund ? "(obligatoire)" : "(facultatif)"}
        </Label>
        <Input
          id="adjust-reference"
          value={reference}
          maxLength={100}
          placeholder="re_… (remboursement Mollie) ou référence du virement Qonto"
          onChange={(e) => { setReference(e.target.value); setConfirming(false); }}
          aria-describedby="adjust-reference-help"
          data-testid="input-adjust-reference"
        />
        <p id="adjust-reference-help" className="text-xs text-muted-foreground">
          Dans Mollie : Paiements → le paiement → Remboursements. Une référence de remboursement ne sert qu'une fois.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="adjust-note">Raison (obligatoire, visible des admins seulement)</Label>
        <Textarea
          id="adjust-note"
          value={note}
          maxLength={500}
          placeholder="Ex. : remboursement demandé par la famille le 12/12"
          onChange={(e) => { setNote(e.target.value); setConfirming(false); }}
          data-testid="input-adjust-note"
        />
      </div>

      {confirming ? (
        <div className="rounded-lg border bg-muted/40 p-3 space-y-3" role="alert">
          <p className="text-sm font-medium">Confirmer : {summary} ?</p>
          <div className="flex gap-2">
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="btn-adjust-confirm">
              Confirmer
            </Button>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={mutation.isPending}>
              Annuler
            </Button>
          </div>
        </div>
      ) : (
        <Button className="w-full" disabled={!canSubmit} onClick={() => setConfirming(true)} data-testid="btn-adjust-submit">
          {canSubmit ? summary : "Remplissez les champs obligatoires"}
        </Button>
      )}

      <div>
        <h4 className="text-sm font-semibold mb-2">Historique des crédits</h4>
        {ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun mouvement.</p>
        ) : (
          <ul className="space-y-2" data-testid="list-credit-ledger">
            {ledger.map((e) => (
              <li key={e.id} className="text-sm border rounded-lg p-2">
                <div className="flex justify-between gap-2">
                  <span>
                    {TYPE_LABELS[e.type]} — {e.reason}
                  </span>
                  <span className={`font-semibold ${e.amount < 0 ? "text-destructive" : "text-green-700"}`}>
                    {e.amount > 0 ? "+" : ""}{e.amount}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(e.createdAt).toLocaleDateString("fr-FR")}
                  {e.triggeredByName && ` · par ${e.triggeredByName}`}
                  {e.externalReference && ` · réf. ${e.externalReference}`}
                </div>
                {e.adminNote && <p className="text-xs mt-1 italic">« {e.adminNote} »</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
