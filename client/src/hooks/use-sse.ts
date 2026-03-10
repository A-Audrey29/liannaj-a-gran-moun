import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";

function invalidateThread(relationId?: string, includeUnread = true) {
  queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations"] });
  if (includeUnread) {
    queryClient.invalidateQueries({ queryKey: ["/api/messages/unread-count"] });
  }
  if (relationId) {
    queryClient.invalidateQueries({ queryKey: ["/api/messages/conversations", relationId] });
  }
}

export function useSSE(enabled: boolean = true) {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const connect = () => {
      const es = new EventSource("/api/messages/stream", { withCredentials: true });
      eventSourceRef.current = es;

      es.addEventListener("new_message", (event) => {
        try {
          const data = JSON.parse(event.data);
          invalidateThread(data.relationId);
        } catch {
          invalidateThread();
        }
      });

      es.addEventListener("message_sent", (event) => {
        try {
          const data = JSON.parse(event.data);
          invalidateThread(data.relationId, false);
        } catch {
          invalidateThread(undefined, false);
        }
      });

      es.addEventListener("messages_read", (event) => {
        try {
          const data = JSON.parse(event.data);
          invalidateThread(data.relationId);
        } catch {
          invalidateThread();
        }
      });

      es.addEventListener("message_deleted", (event) => {
        try {
          const data = JSON.parse(event.data);
          invalidateThread(data.relationId);
        } catch {
          invalidateThread();
        }
      });

      es.onerror = () => {
        es.close();
        setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [enabled]);
}
