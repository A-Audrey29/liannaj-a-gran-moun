import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Send, CheckCheck, MessageSquare } from "lucide-react";
import type { AuthUser } from "@/hooks/use-auth";

type Partner = {
  id: string;
  firstName: string;
  lastName: string;
  profilePhoto: string | null;
  role: string;
};

type ConversationItem = {
  id: string;
  relationId: string;
  partner: Partner;
  lastMessage: { content: string; createdAt: string; senderId: string } | null;
  unreadCount: number;
  updatedAt: string;
};

type MessageItem = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  isRead: boolean;
  isDeleted: boolean;
  createdAt: string;
  sender: { id: string; firstName: string; lastName: string; profilePhoto: string | null };
};

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (days === 1) return "Hier";
  if (days < 7) return d.toLocaleDateString("fr-FR", { weekday: "short" });
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function Avatar({ photo, name, size = "md" }: { photo: string | null; name: string; size?: "md" | "lg" }) {
  const sizeClass = size === "lg" ? "w-12 h-12 text-lg" : "w-10 h-10 text-sm";
  if (photo) {
    return <img src={photo} alt={name} className={`${sizeClass} rounded-full object-cover`} />;
  }
  const initials = name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  return (
    <div className={`${sizeClass} rounded-full bg-[#e8d7fe] text-[#8b5cf6] flex items-center justify-center font-bold shrink-0`}>
      {initials}
    </div>
  );
}

function ConversationList({ conversations, isLoading, onSelect, userId }: {
  conversations: ConversationItem[];
  isLoading: boolean;
  onSelect: (conv: ConversationItem) => void;
  userId: string;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-5 w-32 mb-2" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center" data-testid="messages-empty">
        <MessageSquare className="w-16 h-16 text-muted-foreground/30 mb-4" />
        <p className="text-lg font-medium text-muted-foreground mb-2">Aucun message</p>
        <p className="text-sm text-muted-foreground/70 max-w-xs">
          Vos conversations apparaîtront ici une fois que vous aurez une relation active.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y" data-testid="conversations-list">
      {conversations.map((conv) => {
        const name = `${conv.partner.firstName} ${conv.partner.lastName}`;
        const lastMsg = conv.lastMessage;
        const isMine = lastMsg?.senderId === userId;
        return (
          <button
            key={conv.id}
            onClick={() => onSelect(conv)}
            className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors text-left"
            data-testid={`conversation-${conv.id}`}
          >
            <Avatar photo={conv.partner.profilePhoto} name={name} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className={`text-base font-semibold truncate ${conv.unreadCount > 0 ? "text-foreground" : "text-foreground/80"}`}>
                  {name}
                </span>
                {lastMsg && (
                  <span className="text-xs text-muted-foreground ml-2 shrink-0">{formatTime(lastMsg.createdAt)}</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <p className={`text-sm truncate ${conv.unreadCount > 0 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                  {lastMsg ? (isMine ? `Vous: ${lastMsg.content}` : lastMsg.content) : "Démarrer la conversation"}
                </p>
                {conv.unreadCount > 0 && (
                  <Badge className="ml-2 bg-[#dc4256] text-white text-[10px] px-1.5 py-0 shrink-0" data-testid={`unread-badge-${conv.id}`}>
                    {conv.unreadCount}
                  </Badge>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ChatView({ conversation, userId, onBack }: {
  conversation: ConversationItem;
  userId: string;
  onBack: () => void;
}) {
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<{ messages: MessageItem[]; conversationId: string }>({
    queryKey: ["/api/messages/conversations", conversation.relationId],
  });

  const messages = data?.messages ? [...data.messages].reverse() : [];

  const markRead = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/messages/conversations/${conversation.relationId}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    },
  });

  const sendMsg = useMutation({
    mutationFn: (content: string) => apiRequest("POST", `/api/messages/conversations/${conversation.relationId}`, { content }),
    onSuccess: () => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations", conversation.relationId] });
      queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
    },
  });

  useEffect(() => {
    if (conversation.unreadCount > 0) {
      markRead.mutate();
    }
  }, [conversation.relationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed || sendMsg.isPending) return;
    sendMsg.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const partnerName = `${conversation.partner.firstName} ${conversation.partner.lastName}`;

  return (
    <div className="flex flex-col h-[600px] md:h-[700px]" data-testid="chat-view">
      <div className="flex items-center gap-3 p-4 border-b bg-white">
        <button onClick={onBack} className="md:hidden" data-testid="button-back-chat">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Avatar photo={conversation.partner.profilePhoto} name={partnerName} />
        <div>
          <p className="font-semibold text-base" data-testid="text-partner-name">{partnerName}</p>
          <p className="text-xs text-muted-foreground">
            {conversation.partner.role === "SENIOR" ? "Senior" : "Jeune"}
          </p>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
                <Skeleton className="h-10 w-48 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-center">
            <p className="text-base">Envoyez un message pour démarrer la conversation !</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderId === userId;
            return (
              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] px-4 py-2.5 rounded-2xl ${
                    isMine
                      ? "bg-[#dc4256] text-white rounded-br-md"
                      : "bg-white text-foreground border rounded-bl-md shadow-sm"
                  }`}
                  data-testid={`message-${msg.id}`}
                >
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                  <div className={`flex items-center gap-1 mt-1 ${isMine ? "justify-end" : "justify-start"}`}>
                    <span className={`text-[11px] ${isMine ? "text-white/70" : "text-muted-foreground"}`}>
                      {formatTime(msg.createdAt)}
                    </span>
                    {isMine && msg.isRead && (
                      <CheckCheck className="w-3.5 h-3.5 text-white/70" />
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t bg-white">
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Écrire un message..."
            className="flex-1 text-base rounded-full px-4"
            maxLength={2000}
            data-testid="input-message"
          />
          <Button
            onClick={handleSend}
            disabled={!message.trim() || sendMsg.isPending}
            size="icon"
            className="rounded-full bg-[#dc4256] hover:bg-[#c73848] shrink-0"
            data-testid="button-send-message"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function MessagesTab({ user }: { user: AuthUser | null }) {
  const [selectedConv, setSelectedConv] = useState<ConversationItem | null>(null);

  const { data: conversations = [], isLoading } = useQuery<ConversationItem[]>({
    queryKey: ["/api/messages/conversations"],
  });

  if (!user) return null;

  if (selectedConv) {
    return (
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <ChatView
          conversation={selectedConv}
          userId={user.id}
          onBack={() => setSelectedConv(null)}
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" data-testid="messages-tab">
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold" data-testid="text-messages-title">Messages</h2>
      </div>
      <ConversationList
        conversations={conversations}
        isLoading={isLoading}
        onSelect={setSelectedConv}
        userId={user.id}
      />
    </div>
  );
}
