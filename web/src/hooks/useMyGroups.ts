import useSWR from "swr";
import { errorHandlingFetcher } from "@/lib/fetcher";
import { UserGroup } from "@/lib/types";

export default function useMyGroups() {
  const { data, error, isLoading } = useSWR<UserGroup[]>(
    "/api/manage/admin/user-group/mine",
    errorHandlingFetcher
  );

  return {
    data,
    isLoading,
    error,
  };
}
