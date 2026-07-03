"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { Dialog } from "@headlessui/react";
import { Button } from "@opal/components";
import { toast } from "@/hooks/useToast";
import { useUser } from "@/providers/UserProvider";
import { useModalContext } from "@/components/context/ModalContext";
import {
  SvgArrowRight,
  SvgArrowUp,
  SvgCheckCircle,
  SvgOrganization,
  SvgPlus,
  SvgSimpleLoader,
} from "@opal/icons";
import { useTranslation } from "@/providers/LanguageProvider";
export interface TenantByDomainResponse {
  tenant_id: string;
  number_of_users: number;
  creator_email: string;
}

export default function NewTeamModal() {
  const { showNewTeamModal, setShowNewTeamModal } = useModalContext();
  const [existingTenant, setExistingTenant] =
    useState<TenantByDomainResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasRequestedInvite, setHasRequestedInvite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const { user } = useUser();
  const appDomain = user?.email.split("@")[1];
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const hasNewTeamParam = searchParams?.has("new_team");
    if (hasNewTeamParam) {
      setShowNewTeamModal(true);
      fetchTenantInfo();

      // Remove the new_team parameter from the URL without page reload
      const newParams = new URLSearchParams(searchParams?.toString() || "");
      newParams.delete("new_team");
      const newUrl =
        window.location.pathname +
        (newParams.toString() ? `?${newParams.toString()}` : "");
      window.history.replaceState({}, "", newUrl);
    }
  }, [searchParams, setShowNewTeamModal]);

  const fetchTenantInfo = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/tenants/existing-team-by-domain");
      if (!response.ok) {
        throw new Error(`Failed to fetch team info: ${response.status}`);
      }
      const responseJson = await response.json();
      if (!responseJson) {
        setShowNewTeamModal(false);
        setExistingTenant(null);
        return;
      }

      const data = responseJson as TenantByDomainResponse;
      setExistingTenant(data);
    } catch (error) {
      console.error("Failed to fetch tenant info:", error);
      setError(t("modals.couldNotRetrieveTeamInfo"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestInvite = async () => {
    if (!existingTenant) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/tenants/users/invite/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tenant_id: existingTenant.tenant_id }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.detail || errorData.message || "Failed to request invite"
        );
      }

      setHasRequestedInvite(true);
      toast.success(t("modals.inviteRequestSent"));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("modals.requestToJoinTeam");
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinueToNewOrg = () => {
    const newUrl = window.location.pathname;
    router.replace(newUrl as Route);
    setShowNewTeamModal(false);
  };

  // Update the close handler to use the context
  const handleClose = () => {
    setShowNewTeamModal(false);
  };

  // Only render if showNewTeamModal is true
  if (!showNewTeamModal || isLoading) return null;

  return (
    <Dialog
      open={showNewTeamModal}
      onClose={handleClose}
      className="relative z-1000"
    >
      {/* Modal backdrop */}
      <div className="fixed inset-0 bg-mask-03" aria-hidden="true" />

      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="mx-auto w-full max-w-md rounded-lg bg-background-neutral-00 p-6 shadow-xl border">
          <Dialog.Title className="text-xl font-semibold mb-4 flex items-center">
            {hasRequestedInvite ? (
              <>
                <SvgCheckCircle className="mr-2 h-5 w-5 stroke-text-05" />
                {t("modals.joinRequestSent")}
              </>
            ) : (
              <>
                <SvgOrganization className="mr-2 h-5 w-5 stroke-text-04" />
                {t("modals.foundExistingTeam", { domain: appDomain ?? "" })}
              </>
            )}
          </Dialog.Title>

          {isLoading ? (
            <div className="py-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-border-05 mx-auto mb-4"></div>
              <p>{t("modals.loadingTeamInfo")}</p>
            </div>
          ) : error ? (
            <div className="space-y-4">
              <p className="text-status-text-error-05">{error}</p>
              <div className="flex w-full pt-2">
                <Button
                  onClick={handleContinueToNewOrg}
                  width="full"
                  rightIcon={SvgArrowRight}
                >
                  {t("modals.continueWithNewTeam")}
                </Button>
              </div>
            </div>
          ) : hasRequestedInvite ? (
            <div className="space-y-4">
              <p className="text-text-04">
                {t("modals.joinRequestSentDesc", { domain: appDomain ?? "" })}
              </p>
              <div className="flex w-full pt-2">
                <Button
                  onClick={handleContinueToNewOrg}
                  width="full"
                  rightIcon={SvgArrowRight}
                >
                  {t("modals.tryOnyxWhileWaiting")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-text-03 text-sm mb-2">
                {t("modals.joinRequestApprovedBy", { domain: appDomain ?? "" })}
              </p>
              <div className="flex flex-col items-center justify-center gap-4 mt-4">
                <Button
                  disabled={isSubmitting}
                  onClick={handleRequestInvite}
                  width="full"
                  icon={isSubmitting ? SvgSimpleLoader : SvgArrowUp}
                >
                  {isSubmitting
                    ? t("modals.sendingRequest")
                    : t("modals.requestToJoinTeam")}
                </Button>
              </div>
              <Button
                onClick={handleContinueToNewOrg}
                width="full"
                icon={SvgPlus}
                prominence="secondary"
              >
                {t("modals.continueWithNewTeam")}
              </Button>
            </div>
          )}
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
