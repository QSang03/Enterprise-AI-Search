"use client";

import { useState } from "react";
import Link from "next/link";
import ErrorPageLayout from "@/components/errorPages/ErrorPageLayout";
import { Button } from "@opal/components";
import InlineExternalLink from "@/refresh-components/InlineExternalLink";
import { logout } from "@/lib/user";
import { NEXT_PUBLIC_CLOUD_ENABLED } from "@/lib/constants";
import { useLicense } from "@/hooks/useLicense";
import { useSettings } from "@/lib/settings/hooks";
import { ApplicationStatus } from "@/lib/settings/types";
import Text from "@/refresh-components/texts/Text";
import { SvgLock } from "@opal/icons";
import { useTranslation } from "@/providers/LanguageProvider";

const linkClassName = "text-action-link-05 hover:text-action-link-06 underline";

interface ResubscriptionSessionResponse {
  sessionId: string | null;
  url: string | null;
  requires_payment_method_update: boolean;
}

const fetchResubscriptionSession =
  async (): Promise<ResubscriptionSessionResponse> => {
    const response = await fetch("/api/tenants/create-subscription-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      throw new Error("Failed to create resubscription session");
    }
    return response.json();
  };

export default function AccessRestricted() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: license } = useLicense();
  const settings = useSettings();

  const isSeatLimitExceeded =
    settings.application_status === ApplicationStatus.SEAT_LIMIT_EXCEEDED;
  const hadPreviousLicense = license?.has_license === true;
  const showRenewalMessage = NEXT_PUBLIC_CLOUD_ENABLED || hadPreviousLicense;

  function getSeatLimitMessage() {
    const { used_seats, seat_count } = settings;
    const counts =
      used_seats != null && seat_count != null
        ? ` (${used_seats} users / ${seat_count} seats)`
        : "";
    return t("accessRestricted.seatLimitExceeded", { counts });
  }

  const initialModalMessage = isSeatLimitExceeded
    ? getSeatLimitMessage()
    : showRenewalMessage
      ? NEXT_PUBLIC_CLOUD_ENABLED
        ? t("accessRestricted.subscriptionLapsed")
        : t("accessRestricted.licenseLapsed")
      : t("accessRestricted.enterpriseLicenseRequired");

  const handleResubscribe = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // `url` covers both the new-checkout and past_due payment-update responses.
      const { url } = await fetchResubscriptionSession();
      if (!url) {
        throw new Error(t("accessRestricted.noRedirectUrlReturned"));
      }
      window.location.href = url;
    } catch (error) {
      console.error("Error creating resubscription session:", error);
      setError(t("accessRestricted.openResubscriptionFailed"));
      setIsLoading(false);
    }
  };

  return (
    <ErrorPageLayout>
      <div className="flex items-center gap-2">
        <Text headingH2>{t("accessRestricted.title")}</Text>
        <SvgLock className="stroke-status-error-05 w-6 h-6" />
      </div>

      <Text text03>{initialModalMessage}</Text>

      {isSeatLimitExceeded ? (
        <>
          <Text text03>
            {t("accessRestricted.adminUsersPrefix")} {" "}
            <Link className={linkClassName} href="/admin/users">
              {t("accessRestricted.userManagement")}
            </Link>{" "}
            {t("accessRestricted.adminUsersSuffix")}
          </Text>

          <div className="flex flex-row gap-2">
            <Button
              onClick={async () => {
                await logout();
                window.location.reload();
              }}
            >
              {t("common.logout")}
            </Button>
          </div>
        </>
      ) : NEXT_PUBLIC_CLOUD_ENABLED ? (
        <>
          <Text text03>
            {t("accessRestricted.cloudPaymentInfo")}
          </Text>

          <Text text03>
            {t("accessRestricted.cloudAdminInfo")}
          </Text>

          <div className="flex flex-row gap-2">
            <Button disabled={isLoading} onClick={handleResubscribe}>
              {isLoading ? t("common.loading") : t("accessRestricted.resubscribe")}
            </Button>
            <Button
              prominence="secondary"
              onClick={async () => {
                await logout();
                window.location.reload();
              }}
            >
              {t("common.logout")}
            </Button>
          </div>

          {error && <Text className="text-status-error-05">{error}</Text>}
        </>
      ) : (
        <>
          <Text text03>
            {hadPreviousLicense
              ? t("accessRestricted.renewLicense")
              : t("accessRestricted.obtainEnterpriseLicense")}
          </Text>

          <Text text03>
            {t("accessRestricted.adminApplyLicense")}
          </Text>

          <div className="flex flex-row gap-2">
            <Button
              onClick={async () => {
                await logout();
                window.location.reload();
              }}
            >
              {t("common.logout")}
            </Button>
          </div>
        </>
      )}

      <Text text03>
        {t("accessRestricted.needHelpPrefix")} {" "}
        <InlineExternalLink
          className={linkClassName}
          href="https://discord.gg/4NA5SbzrWb"
        >
          {t("accessRestricted.discordCommunity")}
        </InlineExternalLink>{" "}
        {t("accessRestricted.needHelpSuffix")}
      </Text>
    </ErrorPageLayout>
  );
}
