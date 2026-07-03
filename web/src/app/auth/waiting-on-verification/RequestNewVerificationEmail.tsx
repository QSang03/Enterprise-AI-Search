"use client";

import { toast } from "@/hooks/useToast";
import { requestEmailVerification } from "../lib";
import { Spinner } from "@/components/Spinner";
import { useState, JSX } from "react";
import { useTranslation } from "@/providers/LanguageProvider";

export function RequestNewVerificationEmail({
  children,
  email,
}: {
  children: JSX.Element | string;
  email: string;
}) {
  const { t } = useTranslation();
  const [isRequestingVerification, setIsRequestingVerification] =
    useState(false);

  return (
    <button
      className="text-link"
      onClick={async () => {
        setIsRequestingVerification(true);
        const response = await requestEmailVerification(email);
        setIsRequestingVerification(false);

        if (response.ok) {
          toast.success(t("auth.verificationEmailSent"));
        } else {
          const errorDetail = (await response.json()).detail;
          toast.error(
            t("auth.sendVerificationEmailFailed", { error: errorDetail })
          );
        }
      }}
    >
      {isRequestingVerification && <Spinner />}
      {children}
    </button>
  );
}
