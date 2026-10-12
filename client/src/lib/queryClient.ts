import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/** JSON body of an apiRequest error ("402: {...}"), or null. */
function apiErrorBody(err: unknown): { message?: string; code?: string } | null {
  if (!(err instanceof Error)) return null;
  const sep = err.message.indexOf(": ");
  if (sep === -1) return null;
  try {
    return JSON.parse(err.message.slice(sep + 2));
  } catch {
    return null;
  }
}

/** The server's user-facing message for a failed apiRequest, else `fallback`. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  return apiErrorBody(err)?.message || fallback;
}

/** Machine-readable error code sent by the server (e.g. INSUFFICIENT_CREDITS). */
export function apiErrorCode(err: unknown): string | undefined {
  return apiErrorBody(err)?.code;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
