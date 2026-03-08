import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/login");
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de se déconnecter",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex items-center justify-center h-full p-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle data-testid="text-welcome">
            Bienvenue, {user?.firstName} {user?.lastName}
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLogout}
            data-testid="button-logout"
          >
            <LogOut />
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground" data-testid="text-role">
            Vous êtes connecté en tant que <span className="font-medium">{user?.role}</span>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
