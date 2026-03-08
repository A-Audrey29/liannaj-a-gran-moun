import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { insertUserBaseSchema, type InsertUser, type Category } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { User, GraduationCap, Loader2 } from "lucide-react";

const registerSchema = insertUserBaseSchema.extend({
  confirmPassword: z.string().min(6, "Confirmation requise"),
}).refine(
  (data) => data.password === data.confirmPassword,
  { message: "Les mots de passe ne correspondent pas", path: ["confirmPassword"] }
).refine(
  (data) => data.email.toLowerCase().trim() !== data.validatorEmail.toLowerCase().trim(),
  { message: "Le validateur ne peut pas être vous-même", path: ["validatorEmail"] }
);

type RegisterForm = z.infer<typeof registerSchema>;

export default function Register() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      firstName: "",
      lastName: "",
      role: "SENIOR",
      birthDate: "",
      phone: "",
      address: "",
      city: "",
      postalCode: "",
      bio: "",
      desiredActivity: "",
      schoolName: "",
      referentTitle: "",
      referentFirstName: "",
      referentLastName: "",
      referentEmail: "",
      trustedPersonName: "",
      trustedPersonEmail: "",
      validatorEmail: "",
      categoryIds: [],
    },
  });

  const role = form.watch("role");

  const categoriesQuery = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterForm) => {
      const { confirmPassword, ...payload } = data;
      await apiRequest("POST", "/api/auth/register", payload);
    },
    onSuccess: () => {
      navigate("/registration-pending");
    },
    onError: (error: Error) => {
      const msg = error.message.includes("409")
        ? "Cette adresse email est déjà utilisée"
        : error.message.includes("400")
        ? "Veuillez vérifier les champs du formulaire"
        : "Une erreur est survenue lors de l'inscription";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    },
  });

  function onSubmit(data: RegisterForm) {
    registerMutation.mutate(data);
  }

  return (
    <div className="min-h-screen bg-background flex items-start justify-center py-8 px-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl" data-testid="text-register-title">
            Inscription FEVES
          </CardTitle>
          <CardDescription data-testid="text-register-description">
            Créez votre compte pour rejoindre la communauté
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">

              <div className="space-y-3">
                <h3 className="text-base font-semibold" data-testid="text-section-role">
                  Je suis...
                </h3>
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <div className="grid grid-cols-2 gap-3">
                          <Button
                            type="button"
                            variant={field.value === "SENIOR" ? "default" : "outline"}
                            className="flex items-center gap-2"
                            onClick={() => field.onChange("SENIOR")}
                            data-testid="button-role-senior"
                          >
                            <User className="w-4 h-4" />
                            Senior
                          </Button>
                          <Button
                            type="button"
                            variant={field.value === "JUNIOR" ? "default" : "outline"}
                            className="flex items-center gap-2"
                            onClick={() => field.onChange("JUNIOR")}
                            data-testid="button-role-junior"
                          >
                            <GraduationCap className="w-4 h-4" />
                            Junior
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <h3 className="text-base font-semibold" data-testid="text-section-identity">
                  Identité
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prénom</FormLabel>
                        <FormControl>
                          <Input placeholder="Prénom" {...field} data-testid="input-firstName" />
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
                        <FormLabel>Nom</FormLabel>
                        <FormControl>
                          <Input placeholder="Nom" {...field} data-testid="input-lastName" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="votre@email.fr" {...field} data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mot de passe</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Min. 6 caractères" {...field} data-testid="input-password" />
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
                        <FormLabel>Confirmer</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Confirmer" {...field} data-testid="input-confirmPassword" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="birthDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date de naissance</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-birthDate" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Téléphone</FormLabel>
                        <FormControl>
                          <Input type="tel" placeholder="06 12 34 56 78" {...field} data-testid="input-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-base font-semibold" data-testid="text-section-address">
                  Adresse
                </h3>
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Adresse</FormLabel>
                      <FormControl>
                        <Input placeholder="Rue, numéro..." {...field} data-testid="input-address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ville</FormLabel>
                        <FormControl>
                          <Input placeholder="Ville" {...field} data-testid="input-city" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="postalCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Code postal</FormLabel>
                        <FormControl>
                          <Input placeholder="75000" {...field} data-testid="input-postalCode" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-base font-semibold" data-testid="text-section-profile">
                  Profil
                </h3>
                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bio</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Parlez-nous de vous (max 500 caractères)"
                          className="resize-none"
                          {...field}
                          data-testid="input-bio"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="desiredActivity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Activité souhaitée</FormLabel>
                      <FormControl>
                        <Input placeholder="Quelle activité vous intéresse ?" {...field} data-testid="input-desiredActivity" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {role === "JUNIOR" && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold" data-testid="text-section-junior">
                    Informations Junior
                  </h3>
                  <FormField
                    control={form.control}
                    name="schoolName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Établissement scolaire</FormLabel>
                        <FormControl>
                          <Input placeholder="Nom de l'école" {...field} data-testid="input-schoolName" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="referentTitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Titre du référent</FormLabel>
                        <FormControl>
                          <Input placeholder="Professeur, CPE..." {...field} data-testid="input-referentTitle" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="referentFirstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Prénom du référent</FormLabel>
                          <FormControl>
                            <Input placeholder="Prénom" {...field} data-testid="input-referentFirstName" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="referentLastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nom du référent</FormLabel>
                          <FormControl>
                            <Input placeholder="Nom" {...field} data-testid="input-referentLastName" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="referentEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email du référent</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="referent@ecole.fr" {...field} data-testid="input-referentEmail" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {role === "SENIOR" && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold" data-testid="text-section-senior">
                    Personne de confiance
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="trustedPersonName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nom</FormLabel>
                          <FormControl>
                            <Input placeholder="Nom complet" {...field} data-testid="input-trustedPersonName" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="trustedPersonEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="email@exemple.fr" {...field} data-testid="input-trustedPersonEmail" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <h3 className="text-base font-semibold" data-testid="text-section-validator">
                  Validateur
                </h3>
                <FormField
                  control={form.control}
                  name="validatorEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email du validateur</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="validateur@email.fr" {...field} data-testid="input-validatorEmail" />
                      </FormControl>
                      <FormDescription>
                        Email de votre aidant/professeur qui validera votre inscription
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <h3 className="text-base font-semibold" data-testid="text-section-categories">
                  Catégories d'intérêt
                </h3>
                {categoriesQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Chargement...
                  </div>
                ) : (
                  <FormField
                    control={form.control}
                    name="categoryIds"
                    render={({ field }) => (
                      <FormItem>
                        <div className="grid grid-cols-2 gap-3">
                          {(categoriesQuery.data ?? []).map((cat) => (
                            <div key={cat.id} className="flex items-center gap-2">
                              <Checkbox
                                checked={field.value?.includes(cat.id) ?? false}
                                onCheckedChange={(checked) => {
                                  const current = field.value ?? [];
                                  if (checked) {
                                    field.onChange([...current, cat.id]);
                                  } else {
                                    field.onChange(current.filter((id) => id !== cat.id));
                                  }
                                }}
                                data-testid={`checkbox-category-${cat.id}`}
                              />
                              <label className="text-sm" data-testid={`text-category-${cat.id}`}>
                                {cat.name}
                              </label>
                            </div>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={registerMutation.isPending}
                data-testid="button-submit-register"
              >
                {registerMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Inscription en cours...
                  </>
                ) : (
                  "S'inscrire"
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground" data-testid="text-login-link">
                Déjà un compte ?{" "}
                <a
                  href="/login"
                  className="text-primary underline"
                  data-testid="link-login"
                >
                  Se connecter
                </a>
              </p>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
