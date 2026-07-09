"use client";

import { SEARCH_PARAM_NAMES } from "@/app/app/services/searchParams";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useCallback } from "react";

interface UseAppRouterProps {
  chatSessionId?: string;
  agentId?: number;
  projectId?: number;
  departmentId?: number;
}

export function useAppRouter() {
  const router = useRouter();
  return useCallback(
    ({ chatSessionId, agentId, projectId, departmentId }: UseAppRouterProps = {}) => {
      const finalParams = [];

      if (chatSessionId)
        finalParams.push(`${SEARCH_PARAM_NAMES.CHAT_ID}=${chatSessionId}`);
      else if (agentId)
        finalParams.push(`${SEARCH_PARAM_NAMES.PERSONA_ID}=${agentId}`);
      else if (projectId)
        finalParams.push(`${SEARCH_PARAM_NAMES.PROJECT_ID}=${projectId}`);
      else if (departmentId !== undefined)
        finalParams.push(`departmentId=${departmentId}`);

      const finalString = finalParams.join("&");
      const finalUrl = `/app?${finalString}`;

      router.push(finalUrl as Route);
    },
    [router]
  );
}

export function useAppParams() {
  const searchParams = useSearchParams();
  return useCallback((name: string) => searchParams.get(name), [searchParams]);
}
