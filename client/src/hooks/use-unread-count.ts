import { useQuery } from "@tanstack/react-query";

export function useUnreadMessageCount(enabled: boolean = true) {
  const { data } = useQuery<{ count: number }>({
    queryKey: ["/api/messages/unread-count"],
    enabled,
    refetchInterval: 60000,
  });
  return data?.count ?? 0;
}
