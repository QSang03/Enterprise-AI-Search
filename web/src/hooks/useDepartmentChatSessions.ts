import useSWR from "swr";
import { useEffect, useMemo } from "react";
import { ChatSession } from "@/app/app/interfaces";
import { errorHandlingFetcher } from "@/lib/fetcher";
import { usePendingSessions, pendingSessionsStore } from "@/hooks/useChatSessions";

interface ChatSessionsResponse {
  sessions: ChatSession[];
  has_more: boolean;
}

export function useDepartmentChatSessions(departmentId: number | null) {
  const { data, error, mutate, isLoading } = useSWR<ChatSessionsResponse>(
    departmentId !== null
      ? `/api/chat/get-user-chat-sessions?department_id=${departmentId}&only_non_department_chats=false&page_size=50`
      : null,
    errorHandlingFetcher,
    {
      revalidateOnFocus: false,
      revalidateIfStale: false,
    }
  );

  const pendingSessions = usePendingSessions();

  // Merge SWR fetched sessions with optimistic pending sessions
  const chatSessions = useMemo(() => {
    const fetchedSessions = data?.sessions ?? [];
    if (departmentId === null) return fetchedSessions;

    const fetchedIds = new Set(fetchedSessions.map((s) => s.id));
    const remainingPending = pendingSessions.filter(
      (pending) => pending.department_id === departmentId && !fetchedIds.has(pending.id)
    );

    return [...remainingPending, ...fetchedSessions];
  }, [data, pendingSessions, departmentId]);

  // Clean up pending sessions once they appear in the fetched data from backend
  useEffect(() => {
    const fetchedSessions = data?.sessions;
    if (!fetchedSessions || departmentId === null) return;

    const fetchedIds = new Set(fetchedSessions.map((s) => s.id));
    pendingSessions.forEach((pending) => {
      if (pending.department_id === departmentId && fetchedIds.has(pending.id)) {
        pendingSessionsStore.remove(pending.id);
      }
    });
  }, [data, pendingSessions, departmentId]);

  return {
    chatSessions,
    isLoading,
    error,
    refresh: mutate,
  };
}
