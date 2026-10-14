import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { insertUserBaseSchema, type InsertUser, type Category } from "@shared/schema";
import { PLATFORM_NAME } from "@shared/branding";
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
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { User, GraduationCap, Heart, Loader2, Upload, Camera, X, ImagePlus } from "lucide-react";
import { useState, useRef, useCallback } from "react";

const registerSchema = insertUserBaseSchema.extend({
  confirmPassword: z.string().min(6, "Confirmation requise"),
  validatorEmail: z.string().optional().default(""),
}).refine(
  (data) => data.password === data.confirmPassword,
  { message: "Les mots de passe ne correspondent pas", path: ["confirmPassword"] }
);

type RegisterForm = z.infer<typeof registerSchema>;

export default function Register() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [trustedCivilite, setTrustedCivilite] = useState<"M." | "Mme" | "">("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  // "Aidant" is not an account type of this form: an aidant's space is opened
  // from the validation link of the senior's registration (validate.tsx). The
  // tab explains that, then lets the aidant fill the form for their relative.
  const [aidantView, setAidantView] = useState(
    () => new URLSearchParams(window.location.search).get("profil") === "aidant"
  );
  const [forProche, setForProche] = useState(false);

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

  const handlePhotoSelect = useCallback((file: File) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Format non supporté", description: "Utilisez JPG, PNG ou WebP.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Fichier trop volumineux", description: "La taille maximale est de 5 Mo.", variant: "destructive" });
      return;
    }
    setPhoto(file);
    const reader = new FileReader();
    reader.onload = (e) => setPhotoPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, [toast]);

  const removePhoto = useCallback(() => {
    setPhoto(null);
    setPhotoPreview(null);
  }, []);

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterForm) => {
      const { confirmPassword, ...payload } = data;
      // validatorEmail est requis (string) côté backend ; trustedPersonEmail /
      // referentEmail sont optionnels (string | undefined). Fallback "" pour
      // rester typé string — un champ vide sera rejeté par la validation Zod
      // serveur avec un message explicite.
      if (payload.role === "SENIOR") {
        payload.validatorEmail = payload.trustedPersonEmail ?? "";
      } else {
        payload.validatorEmail = payload.referentEmail ?? "";
      }
      const formData = new FormData();
      formData.append("data", JSON.stringify(payload));
      if (photo) {
        formData.append("photo", photo);
      }
      const res = await fetch("/api/auth/register", { method: "POST", body: formData });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || `${res.status}`);
      }
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
            Inscription {PLATFORM_NAME}
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
                        <div className="grid grid-cols-3 gap-3">
                          <Button
                            type="button"
                            variant={!aidantView && field.value === "SENIOR" ? "default" : "outline"}
                            className="flex items-center gap-2"
                            onClick={() => { setAidantView(false); field.onChange("SENIOR"); }}
                            data-testid="button-role-senior"
                          >
                            <User className="w-4 h-4" />
                            Senior
                          </Button>
                          <Button
                            type="button"
                            variant={!aidantView && field.value === "JUNIOR" ? "default" : "outline"}
                            className="flex items-center gap-2"
                            onClick={() => { setAidantView(false); setForProche(false); field.onChange("JUNIOR"); }}
                            data-testid="button-role-junior"
                          >
                            <GraduationCap className="w-4 h-4" />
                            Jeune
                          </Button>
                          <Button
                            type="button"
                            variant={aidantView ? "default" : "outline"}
                            className="flex items-center gap-2"
                            onClick={() => setAidantView(true)}
                            data-testid="button-role-aidant"
                          >
                            <Heart className="w-4 h-4" />
                            Aidant
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {aidantView && (
                <div className="rounded-2xl border-2 border-[#c9a4e8] bg-[#f3eaff] p-5 space-y-4 text-base" data-testid="panel-aidant">
                  <h3 className="text-xl font-bold">Vous accompagnez un proche senior ?</h3>
                  <p>Votre espace aidant vous permet de suivre ses rencontres, de demander un atelier pour lui ou elle, de payer ses forfaits et d'écrire à l'équipe.</p>
                  <p className="font-semibold">Comment l'ouvrir, en 3 étapes :</p>
                  <ol className="list-decimal pl-5 space-y-2">
                    <li>
                      <strong>Inscrivez votre proche</strong> avec le bouton ci-dessous (vous pouvez remplir le formulaire avec lui ou
                      elle). Il lui faut sa propre adresse e-mail, différente de la vôtre.
                    </li>
                    <li>
                      Dans la partie <strong>« Personne de confiance (aidant) »</strong>, mettez <strong>votre</strong> nom et{" "}
                      <strong>votre</strong> adresse e-mail.
                    </li>
                    <li>
                      Vous recevez un e-mail. En validant l'inscription de votre proche, vous <strong>créez votre espace aidant</strong>{" "}
                      et choisissez votre mot de passe.
                    </li>
                  </ol>
                  <Button
                    type="button"
                    className="w-full h-12 text-base"
                    onClick={() => {
                      form.setValue("role", "SENIOR");
                      setForProche(true);
                      setAidantView(false);
                      // The reminder sits at the top of the form: bring it into view.
                      window.scrollTo({ top: 0 });
                    }}
                    data-testid="button-aidant-inscrire-proche"
                  >
                    Inscrire mon proche
                  </Button>
                </div>
              )}

              <div className={aidantView ? "hidden" : "space-y-8"}>
              {forProche && role === "SENIOR" && (
                <p className="rounded-xl border-2 border-[#c9a4e8] bg-[#f3eaff] p-4 text-base" data-testid="text-for-proche">
                  Vous inscrivez votre proche : remplissez <strong>ses</strong> informations (nom, e-mail, mot de passe). Mettez{" "}
                  <strong>votre</strong> nom et <strong>votre</strong> e-mail dans « Personne de confiance (aidant) », en bas du
                  formulaire.
                </p>
              )}

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
                          <Input placeholder="ex: 97139" {...field} data-testid="input-postalCode" />
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
              </div>

              <div className="space-y-4">
                <h3 className="text-base font-semibold" data-testid="text-section-photo">
                  Photo de profil
                </h3>
                <PhotoUploadField
                  photoPreview={photoPreview}
                  onSelect={handlePhotoSelect}
                  onRemove={removePhoto}
                />
              </div>

              <div className="space-y-4">
                <h3 className="text-base font-semibold" data-testid="text-section-categories">
                  Je peux animer les ateliers suivant :
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
                        <div className="grid grid-cols-1 gap-3">
                          {(categoriesQuery.data ?? []).map((cat) => (
                            <div key={cat.id} className="flex items-start gap-2">
                              <Checkbox
                                className="mt-0.5"
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

              {role === "SENIOR" && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold" data-testid="text-section-senior">
                    Personne de confiance (aidant)
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="trustedPersonName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nom</FormLabel>
                          <div className="flex items-center gap-3 mt-1">
                            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                              <Checkbox
                                checked={trustedCivilite === "M."}
                                onCheckedChange={() => setTrustedCivilite("M.")}
                                data-testid="checkbox-trusted-mr"
                              />
                              M.
                            </label>
                            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                              <Checkbox
                                checked={trustedCivilite === "Mme"}
                                onCheckedChange={() => setTrustedCivilite("Mme")}
                                data-testid="checkbox-trusted-mme"
                              />
                              M<sup className="ml-[-1px]">me</sup>
                            </label>
                          </div>
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
                        <FormItem className="flex flex-col justify-end">
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="email@exemple.fr" {...field} data-testid="input-trustedPersonEmail" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground" data-testid="text-senior-validation-info">
                    Un lien sera envoyé à cette personne pour valider votre inscription. Elle pourra aussi créer son espace
                    aidant pour vous accompagner sur {PLATFORM_NAME}.
                  </p>
                </div>
              )}

              {role === "JUNIOR" && (
                <div className="space-y-4">
                  <h3 className="text-base font-semibold" data-testid="text-section-junior">
                    Référent scolaire
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
                    name="referentLastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nom du référent</FormLabel>
                        <FormField
                          control={form.control}
                          name="referentTitle"
                          render={({ field: titleField }) => (
                            <div className="flex items-center gap-3 mt-1">
                              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                                <Checkbox
                                  checked={titleField.value === "M."}
                                  onCheckedChange={() => titleField.onChange("M.")}
                                  data-testid="checkbox-referent-mr"
                                />
                                M.
                              </label>
                              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                                <Checkbox
                                  checked={titleField.value === "Mme"}
                                  onCheckedChange={() => titleField.onChange("Mme")}
                                  data-testid="checkbox-referent-mme"
                                />
                                M<sup className="ml-[-1px]">me</sup>
                              </label>
                            </div>
                          )}
                        />
                        <FormControl>
                          <Input placeholder="Nom" {...field} data-testid="input-referentLastName" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                  <p className="text-sm text-muted-foreground" data-testid="text-junior-validation-info">
                    Un lien sera envoyé à votre référent scolaire pour valider votre inscription.
                  </p>
                </div>
              )}

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
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

function PhotoUploadField({
  photoPreview,
  onSelect,
  onRemove,
}: {
  photoPreview: string | null;
  onSelect: (file: File) => void;
  onRemove: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onSelect(file);
    },
    [onSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  if (photoPreview) {
    return (
      <div className="relative w-32 h-32 mx-auto">
        <img
          src={photoPreview}
          alt="Aperçu"
          className="w-32 h-32 rounded-full object-cover border-2 border-border"
          data-testid="img-photo-preview"
        />
        <button
          type="button"
          onClick={onRemove}
          className="absolute -top-1 -right-1 bg-destructive text-white rounded-full p-1"
          data-testid="button-remove-photo"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
        isDragging ? "border-[#dc4256] bg-red-50" : "border-border"
      }`}
      data-testid="dropzone-photo"
    >
      <ImagePlus className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
      <p className="text-sm text-muted-foreground mb-3">
        Glissez-déposez une photo ici
      </p>
      <div className="flex gap-2 justify-center flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="rounded-full text-sm"
          data-testid="button-browse-photo"
        >
          <Upload className="w-4 h-4 mr-1" />
          Parcourir
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => cameraInputRef.current?.click()}
          className="rounded-full text-sm"
          data-testid="button-camera-photo"
        >
          <Camera className="w-4 h-4 mr-1" />
          Prendre une photo
        </Button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
        }}
        data-testid="input-file-photo"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
        }}
        data-testid="input-camera-photo"
      />
      <p className="text-xs text-muted-foreground mt-2">
        JPG, PNG ou WebP — 5 Mo max
      </p>
    </div>
  );
}
