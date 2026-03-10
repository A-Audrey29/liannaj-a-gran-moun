import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ArrowLeft, Search, Trash2, MessageSquare, AlertTriangle } from "lucide-react";

type ConvUser = { id: string; firstName: string; lastName: string; email: string; profilePhoto: string | null };
type AdminConversation = {
  id: string;
  relationId: string;
  relation: { senior: ConvUser; junior: ConvUser };
  messages: Array<{ content: string; createdAt: string; senderId: string }>;
  _count: { messages: number };
  updatedAt: string;
};

type AdminMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  isRead: boolean;
  isDeleted: boolean;
  deletedByAdmin: boolean;
  createdAt: string;
  sender: { id: string; firstName: string; lastName: string; profilePhoto: string | null };
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatShort(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function ConversationsList({ onSelect }: { onSelect: (conv: AdminConversation) => void }) {
  const [search, setSearch] = useState("");
  const { data: conversations = [], isLoading } = useQuery<AdminConversation[]>({
    queryKey: ["/api/admin/messages/conversations"],
    refetchInterval: 15000,
  });

  const filtered = search.trim()
    ? conversations.filter((c) => {
        const s = search.toLowerCase();
        const senior = c.relation.senior;
        const junior = c.relation.junior;
        return (
          `${senior.firstName} ${senior.lastName}`.toLowerCase().includes(s) ||
          `${junior.firstName} ${junior.lastName}`.toLowerCase().includes(s) ||
          senior.email.toLowerCase().includes(s) ||
          junior.email.toLowerCase().includes(s)
        );
      })
    : conversations;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un utilisateur..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-admin-search-conversations"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-muted-foreground">
          <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">{search ? "Aucune conversation trouvée" : "Aucune conversation"}</p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="admin-conversations-list">
          {filtered.map((conv) => {
            const senior = conv.relation.senior;
            const junior = conv.relation.junior;
            const lastMsg = conv.messages[0];
            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv)}
                className="w-full flex items-start gap-3 p-4 rounded-xl border bg-white hover:bg-muted/50 transition-colors text-left"
                data-testid={`admin-conv-${conv.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{senior.firstName} {senior.lastName}</span>
                    <Badge className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0">Senior</Badge>
                    <span className="text-muted-foreground text-xs">↔</span>
                    <span className="font-semibold text-sm">{junior.firstName} {junior.lastName}</span>
                    <Badge className="bg-teal-100 text-teal-800 text-[10px] px-1.5 py-0">Jeune</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground truncate">
                      {lastMsg ? lastMsg.content.substring(0, 80) : "Aucun message"}
                    </p>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Badge variant="outline" className="text-[10px]">{conv._count.messages} msg</Badge>
                      {lastMsg && <span className="text-[10px] text-muted-foreground">{formatShort(lastMsg.createdAt)}</span>}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConversationDetail({ conversation, onBack }: { conversation: AdminConversation; onBack: () => void }) {
  const { data, isLoading } = useQuery<{ conversation: any; messages: AdminMessage[] }>({
    queryKey: ["/api/admin/messages/conversations", conversation.id],
    refetchInterval: 10000,
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId: string) => apiRequest("DELETE", `/api/admin/messages/${messageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/messages/conversations", conversation.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/messages/conversations"] });
    },
  });

  const messages = data?.messages ? [...data.messages].reverse() : [];
  const senior = conversation.relation.senior;
  const junior = conversation.relation.junior;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-admin-back">
          <ArrowLeft className="w-4 h-4 mr-1" /> Retour
        </Button>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{senior.firstName} {senior.lastName}</span>
          <span className="text-muted-foreground text-xs">↔</span>
          <span className="font-semibold text-sm">{junior.firstName} {junior.lastName}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>Aucun message dans cette conversation</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[600px] overflow-y-auto" data-testid="admin-messages-list">
          {messages.map((msg) => {
            const isSenior = msg.senderId === senior.id;
            const senderLabel = isSenior ? "Senior" : "Jeune";
            const senderColor = isSenior ? "text-blue-700" : "text-teal-700";

            return (
              <div
                key={msg.id}
                className={`p-3 rounded-xl border ${msg.isDeleted ? "bg-red-50/50 border-red-200" : "bg-white"}`}
                data-testid={`admin-message-${msg.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-sm font-semibold ${senderColor}`}>
                        {msg.sender.firstName} {msg.sender.lastName}
                      </span>
                      <Badge className={`text-[10px] px-1.5 py-0 ${isSenior ? "bg-blue-100 text-blue-800" : "bg-teal-100 text-teal-800"}`}>
                        {senderLabel}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">{formatDate(msg.createdAt)}</span>
                      <Badge className={`text-[10px] px-1.5 py-0 ${msg.isRead ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                        {msg.isRead ? "Lu" : "Non lu"}
                      </Badge>
                    </div>
                    {msg.isDeleted ? (
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        <p className="text-sm text-red-400 line-through italic">{msg.content}</p>
                        <Badge className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0">Supprimé par admin</Badge>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                    )}
                  </div>
                  {!msg.isDeleted && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 shrink-0" data-testid={`button-delete-msg-${msg.id}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer ce message ?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Le message sera masqué pour les utilisateurs mais restera visible dans l'historique admin. Cette action est irréversible.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(msg.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Supprimer
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function MessagerieAdminTab() {
  const [selected, setSelected] = useState<AdminConversation | null>(null);

  if (selected) {
    return <ConversationDetail conversation={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div data-testid="admin-messagerie-tab">
      <h2 className="text-xl font-bold mb-4">Messagerie</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Historique complet des conversations entre seniors et jeunes. Vous pouvez lire et modérer les messages.
      </p>
      <ConversationsList onSelect={setSelected} />
    </div>
  );
}
