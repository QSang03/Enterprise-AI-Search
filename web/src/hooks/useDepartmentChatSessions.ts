import useSWR from "swr";
import { ChatSession } from "@/app/app/interfaces";
import { errorHandlingFetcher } from "@/lib/fetcher";

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

  return {
    chatSessions: data?.sessions ?? [],
    isLoading,
    error,
    refresh: mutate,
  };
}
