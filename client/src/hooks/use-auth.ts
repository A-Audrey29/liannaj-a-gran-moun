import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  birthDate: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  bio: string | null;
  desiredActivity: string | null;
  schoolName: string | null;
  referentTitle: string | null;
  referentFirstName: string | null;
  referentLastName: string | null;
  referentEmail: string | null;
  trustedPersonName: string | null;
  trustedPersonEmail: string | null;
  linkedSeniorId: string | null;
  profilePhoto: string | null;
}

export interface LinkedTeacher {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export function useAuth() {
  const { data, isLoading } = useQuery<{ user: AuthUser; linkedTeacher: LinkedTeacher | null } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn<{ user: AuthUser; linkedTeacher: LinkedTeacher | null } | null>({ on401: "returnNull" }),
  });

  return {
    user: data?.user ?? null,
    linkedTeacher: data?.linkedTeacher ?? null,
    isLoading,
    isAuthenticated: !!data?.user,
  };
}
