import useSWR from "swr";

import { NEXT_PUBLIC_CLOUD_ENABLED } from "@/lib/constants";
import { errorHandlingFetcher } from "@/lib/fetcher";
import { SWR_KEYS } from "@/lib/swr-keys";
import { LicenseStatus } from "@/lib/types";

/**
 * Hook to fetch license status for self-hosted deployments.
 *
 * Skips the fetch on cloud deployments (uses tenant auth instead).
 */
export function useLicense() {
  const url = NEXT_PUBLIC_CLOUD_ENABLED ? null : SWR_KEYS.license;

  const { data, error, mutate, isLoading } = useSWR<LicenseStatus>(
    url,
    errorHandlingFetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      dedupingInterval: 30000,
      shouldRetryOnError: false,
      keepPreviousData: true,
    }
  );

  if (!url) {
    return {
      data: undefined,
      isLoading: false,
      error: undefined,
      refresh: () => Promise.resolve(undefined),
    };
  }

  return { data, isLoading, error, refresh: mutate };
}
