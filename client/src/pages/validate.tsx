import { useRef, useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { UserAvatar } from "@/components/user-avatar";
import { useSearch, useLocation, Redirect } from "wouter";
import { RefreshCw, Heart, GraduationCap } from "lucide-react";
import { validatorAccountSchema } from "@shared/schema";
import { CONTACT_EMAIL, PLATFORM_NAME } from "@shared/branding";

// Page de confirmation de validation d'inscription.
// Le lien reçu par email pointe sur GET /api/validate qui redirige ici SANS
// consommer le token (protection contre le préchargement par les scanners
// antivirus / proxys de messagerie). La validation réelle n'a lieu que sur
// clic humain, via POST /api/validate.
//
// Inscription d'un senior : le validateur est sa personne de confiance
// (aidant). Il peut créer son espace aidant dans la même étape.
// Inscription d'un jeune : le validateur est son professeur. Il voit tout le
// profil, puis valide (l'élève rejoint son espace professeur, qu'il peut créer
// ici) ou refuse (« ce n'est pas mon élève »).
// Dans les deux cas, l'e-mail du compte créé est celui qui a reçu le lien,
// fixé par le serveur.

type ValidateInfo = {
  firstName: string;
  role: string;
  aidantEmail: string | null;
  canCreateAidant: boolean;
  student?: {
    firstName: string;
    lastName: string;
    birthDate: string | null;
    city: string | null;
    schoolName: string | null;
    bio: string | null;
    ateliers: string[];
    hasPhoto: boolean;
  };
  teacher?: { email: string | null; account: "teacher" | "none" | "other" };
};

const accountFormSchema = validatorAccountSchema
  .extend({ confirmPassword: z.string().min(1, "Confirmation requise") })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Les mots de passe ne correspondent pas",
    path: ["confirmPassword"],
  });

type AccountForm = z.infer<typeof accountFormSchema>;
type Account = Omit<AccountForm, "confirmPassword">;

/** Age in years: birthDate is an administrative date (no meeting time zone rule). */
function ageFrom(birthDate: string): number {
  const b = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
  return age;
}

export default function Validate() {
  const searchString = useSearch();
  const [, navigate] = useLocation();
  const token = new URLSearchParams(searchString).get("token") || "";
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // handleSubmit validates asynchronously before confirm() runs: a fast double
  // click could send two POSTs, the second answering "lien invalide".
  const inFlight = useRef(false);

  const infoQuery = useQuery<ValidateInfo, Error & { reason?: string; status?: number }>({
    queryKey: ["/api/validate/info", token],
    enabled: !!token,
    retry: false,
    queryFn: async () => {
      const res = await fetch(`/api/validate/info?token=${encodeURIComponent(token)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(body.message || "Lien invalide"), { reason: body.reason, status: res.status });
      return body;
    },
  });

  const form = useForm<AccountForm>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: { firstName: "", lastName: "", password: "", confirmPassword: "" },
  });

  async function post(url: string, body: object, onOk: (body: any) => void) {
    if (!token) {
      navigate("/validation-error?reason=invalid");
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const resBody = await res.json().catch(() => ({}));
      if (res.ok) {
        onOk(resBody);
        return;
      }
      // Errors about the account form stay on the page: the registration
      // itself is still waiting and can be validated.
      if (["aidant_exists", "aidant_invalid", "teacher_exists"].includes(resBody.reason)) {
        setError(resBody.message || "Impossible de créer l'espace.");
        return;
      }
      navigate(`/validation-error?reason=${resBody.reason || "invalid"}`);
    } catch {
      navigate("/validation-error?reason=invalid");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  function confirm(account?: { kind: "aidant" | "teacher"; data: Account }) {
    const body = account ? { token, [account.kind]: account.data } : { token };
    return post("/api/validate", body, (res) => {
      if (res.aidantCreated) navigate("/validation-success?aidant=1");
      else if (res.teacherCreated) navigate("/validation-success?teacher=created");
      else if (res.linked) navigate("/validation-success?teacher=linked");
      else navigate("/validation-success");
    });
  }

  function refuse() {
    return post("/api/validate/refuse", { token }, () => navigate("/validation-success?refused=1"));
  }

  if (!token) return <Redirect to="/validation-error?reason=invalid" />;

  if (infoQuery.isError) {
    const status = infoQuery.error?.status;
    // Only a dead link goes to the error page; a server or network hiccup
    // must not tell the user their valid link is invalid.
    if (status === 404 || status === 410) {
      return <Redirect to={`/validation-error?reason=${status === 410 ? "expired" : "invalid"}`} />;
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-[70dvh] p-4 gap-4 text-center text-lg">
        <p data-testid="text-validate-retry">Un problème temporaire empêche d'afficher cette page.</p>
        <Button onClick={() => infoQuery.refetch()} className="h-12 px-6 text-lg" data-testid="button-validate-retry">
          Réessayer
        </Button>
      </div>
    );
  }

  if (infoQuery.isLoading || !infoQuery.data) {
    return (
      <div className="flex items-center justify-center min-h-[70dvh] p-4">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const info = infoQuery.data;
  const errorBlock = error && (
    <p className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800" role="alert" data-testid="text-validate-error">
      {error}
    </p>
  );

  // Junior: validated by their teacher, who sees the whole profile first.
  if (info.role === "JUNIOR" && info.student) {
    const s = info.student;
    const teacher = info.teacher ?? { email: null, account: "other" as const };
    return (
      <div className="flex justify-center p-4 py-10">
        <div className="w-full max-w-xl space-y-6 text-lg">
          <div className="text-center">
            <h1 className="text-2xl md:text-3xl font-bold mb-2" data-testid="text-validate-title">
              Valider l'inscription de {s.firstName} {s.lastName}
            </h1>
            <p className="text-gray-700" data-testid="text-validate-message">
              {s.firstName} vous a désigné(e) comme professeur sur {PLATFORM_NAME}. Vérifiez son profil avant de décider.
            </p>
          </div>

          <Card data-testid="card-validate-student">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-4">
                <UserAvatar
                  photo={s.hasPhoto ? `/api/validate/photo?token=${encodeURIComponent(token)}` : null}
                  firstName={s.firstName}
                  lastName={s.lastName}
                  className="w-20 h-20"
                  decorative
                />
                <div className="min-w-0">
                  <p className="font-semibold" data-testid="text-student-name">{s.firstName} {s.lastName}</p>
                  <p className="text-base text-gray-700">
                    {[s.birthDate ? `${ageFrom(s.birthDate)} ans` : null, s.city, s.schoolName].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
              <div>
                <h2 className="text-base font-semibold mb-1">Biographie</h2>
                <p className="text-base text-gray-800 whitespace-pre-line" data-testid="text-student-bio">
                  {s.bio?.trim() ? s.bio : "Pas encore de biographie."}
                </p>
              </div>
              <div>
                <h2 className="text-base font-semibold mb-1">Ateliers proposés</h2>
                {s.ateliers.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5" data-testid="list-student-ateliers">
                    {s.ateliers.map((a) => (
                      <Badge key={a} variant="outline" className="text-sm">{a}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-base text-gray-700">Aucun atelier choisi.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {errorBlock}

          {teacher.account === "teacher" && (
            <div className="space-y-2">
              <Button
                onClick={() => confirm()}
                disabled={pending}
                className="w-full h-14 text-lg bg-primary hover:bg-primary/90 text-white whitespace-normal"
                data-testid="button-confirm-validation"
              >
                {pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                Valider : {s.firstName} rejoint mes élèves
              </Button>
              <p className="text-base text-gray-700 text-center">
                {s.firstName} apparaîtra dans votre espace professeur ({teacher.email}).
              </p>
            </div>
          )}

          {teacher.account === "none" && (
            <>
              <Card className="border-2 border-primary/50" data-testid="card-validate-teacher">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <GraduationCap className="h-6 w-6 text-primary" />
                    Valider et créer mon espace professeur
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="list-disc pl-5 text-gray-800 space-y-1">
                    <li>Retrouver {s.firstName} et vos autres élèves</li>
                    <li>Lire et corriger leur biographie</li>
                    <li>Suivre leurs rencontres et les avis</li>
                  </ul>
                  <p className="text-gray-800">
                    Vous vous connecterez avec l'adresse <strong data-testid="text-teacher-email">{teacher.email}</strong>.
                  </p>
                  <AccountFields
                    form={form}
                    testPrefix="teacher"
                    pending={pending}
                    submitLabel="Valider et créer mon espace professeur"
                    onSubmit={(data) => confirm({ kind: "teacher", data })}
                  />
                </CardContent>
              </Card>
              <div className="text-center space-y-2">
                <p className="text-gray-700">Vous ne souhaitez pas d'espace professeur ?</p>
                <Button
                  variant="outline"
                  onClick={() => confirm()}
                  disabled={pending}
                  className="w-full h-auto min-h-12 py-3 px-6 text-lg whitespace-normal"
                  data-testid="button-confirm-validation"
                >
                  Valider seulement l'inscription de {s.firstName}
                </Button>
              </div>
            </>
          )}

          {teacher.account === "other" && (
            <>
              <p className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-gray-800" data-testid="text-teacher-other">
                Votre adresse est déjà utilisée par un compte qui n'est pas un espace professeur. Validez l'inscription
                ci-dessous ; l'équipe rattachera {s.firstName} à son professeur. Contact : {CONTACT_EMAIL}.
              </p>
              <Button
                onClick={() => confirm()}
                disabled={pending}
                className="w-full h-14 text-lg bg-primary hover:bg-primary/90 text-white whitespace-normal"
                data-testid="button-confirm-validation"
              >
                Valider l'inscription de {s.firstName}
              </Button>
            </>
          )}

          <div className="text-center pt-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  disabled={pending}
                  className="h-auto min-h-12 py-3 px-6 text-lg text-red-700 hover:text-red-800 whitespace-normal"
                  data-testid="button-refuse-validation"
                >
                  Ce n'est pas mon élève : refuser
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Refuser l'inscription de {s.firstName} ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Son compte ne sera pas ouvert. {s.firstName} sera prévenu(e) par e-mail, et l'équipe {PLATFORM_NAME}
                    pourra corriger en cas d'erreur.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Retour</AlertDialogCancel>
                  <AlertDialogAction onClick={() => refuse()} data-testid="button-refuse-validation-confirm">
                    Refuser l'inscription
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    );
  }

  // Senior: validated by their trusted person (aidant).
  return (
    <div className="flex justify-center p-4 py-10">
      <div className="w-full max-w-xl space-y-6 text-lg">
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-bold mb-2" data-testid="text-validate-title">
            Valider l'inscription de {info.firstName}
          </h1>
          <p className="text-gray-700" data-testid="text-validate-message">
            {info.firstName} vous a désigné(e) comme personne de confiance, son aidant, sur {PLATFORM_NAME}.
          </p>
        </div>

        {errorBlock}

        {info.canCreateAidant ? (
          <Card className="border-2 border-primary/50" data-testid="card-validate-aidant">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Heart className="h-6 w-6 text-primary" />
                Valider et créer mon espace aidant
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="list-disc pl-5 text-gray-800 space-y-1">
                <li>Suivre les rencontres de {info.firstName}</li>
                <li>Demander un atelier pour {info.firstName}</li>
                <li>Payer ses forfaits</li>
                <li>Écrire à l'équipe</li>
              </ul>
              <p className="text-gray-800">
                Vous vous connecterez avec l'adresse <strong data-testid="text-aidant-email">{info.aidantEmail}</strong>.
              </p>
              <AccountFields
                form={form}
                testPrefix="aidant"
                pending={pending}
                submitLabel="Valider et créer mon espace aidant"
                onSubmit={(data) => confirm({ kind: "aidant", data })}
              />
            </CardContent>
          </Card>
        ) : (
          <p className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-gray-800" data-testid="text-aidant-exists">
            Un compte existe déjà avec votre adresse {info.aidantEmail}. Validez l'inscription ci-dessous. Pour relier ce
            compte à {info.firstName}, écrivez à l'équipe : {CONTACT_EMAIL}.
          </p>
        )}

        <div className="text-center space-y-2">
          {info.canCreateAidant && <p className="text-gray-700">Vous ne souhaitez pas d'espace aidant ?</p>}
          <Button
            variant="outline"
            onClick={() => confirm()}
            disabled={pending}
            className="w-full h-auto min-h-12 py-3 px-6 text-lg whitespace-normal"
            data-testid="button-confirm-validation"
          >
            Valider seulement l'inscription de {info.firstName}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Name + password of the account opened from the link (aidant or teacher). */
function AccountFields({
  form,
  testPrefix,
  pending,
  submitLabel,
  onSubmit,
}: {
  form: UseFormReturn<AccountForm>;
  testPrefix: "aidant" | "teacher";
  pending: boolean;
  submitLabel: string;
  onSubmit: (data: Account) => void;
}) {
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(({ confirmPassword: _c, ...data }) => onSubmit(data))} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Votre prénom</FormLabel>
                <FormControl>
                  <Input className="h-12 text-lg" autoComplete="given-name" {...field} data-testid={`input-${testPrefix}-firstName`} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Votre nom</FormLabel>
                <FormControl>
                  <Input className="h-12 text-lg" autoComplete="family-name" {...field} data-testid={`input-${testPrefix}-lastName`} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Choisissez un mot de passe (6 caractères minimum)</FormLabel>
              <FormControl>
                <Input type="password" className="h-12 text-lg" autoComplete="new-password" {...field} data-testid={`input-${testPrefix}-password`} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirmez le mot de passe</FormLabel>
              <FormControl>
                <Input type="password" className="h-12 text-lg" autoComplete="new-password" {...field} data-testid={`input-${testPrefix}-confirmPassword`} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          disabled={pending}
          className="w-full h-14 text-lg bg-primary hover:bg-primary/90 text-white whitespace-normal"
          data-testid={`button-confirm-validation-${testPrefix}`}
        >
          {pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
      </form>
    </Form>
  );
}
