import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCheck } from "lucide-react";
import type { Notification } from "@shared/schema";

function timeAgo(date: string | Date) {
  const now = new Date();
  const d = new Date(date);
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "A l'instant";
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)}j`;
  return d.toLocaleDateString("fr-FR");
}

export default function Notifications() {
  const [, setLocation] = useLocation();

  const { data: notifications, isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/count"] });
    },
  });

  const unreadCount = (notifications || []).filter((n) => !n.isRead).length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8" data-testid="page-notifications">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-[#c0354a]" />
          <h1 className="text-2xl font-bold" data-testid="text-notifications-title">Notifications</h1>
          {unreadCount > 0 && (
            <Badge variant="secondary" data-testid="badge-unread-count">
              {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            data-testid="button-mark-all-read"
          >
            <CheckCheck className="w-4 h-4 mr-2" />
            Tout marquer comme lu
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-md" />
          ))}
        </div>
      ) : !notifications || notifications.length === 0 ? (
        <Card className="p-8 text-center">
          <Bell className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground" data-testid="text-no-notifications">Aucune notification pour le moment</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card
              key={n.id}
              className={`p-4 cursor-pointer transition-colors hover-elevate ${!n.isRead ? "border-[#c0354a]/30 bg-secondary/20" : ""}`}
              onClick={() => {
                if (!n.isRead) markReadMutation.mutate(n.id);
                if (n.link) setLocation(n.link);
              }}
              data-testid={`notification-item-${n.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold" data-testid={`text-notification-title-${n.id}`}>{n.title}</p>
                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-[#c0354a] shrink-0" data-testid={`indicator-unread-${n.id}`} />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1" data-testid={`text-notification-message-${n.id}`}>{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1.5" data-testid={`text-notification-time-${n.id}`}>{timeAgo(n.createdAt)}</p>
                </div>
                {!n.isRead && (
                  <Badge variant="outline" className="shrink-0 text-xs" data-testid={`badge-unread-${n.id}`}>
                    Nouveau
                  </Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
