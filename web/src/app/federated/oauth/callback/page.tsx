"use client";

import OAuthCallbackPage from "@/components/oauth/OAuthCallbackPage";
import { getSourceDisplayName } from "@/lib/sources";
import { useTranslation } from "@/providers/LanguageProvider";

export default function FederatedOAuthCallbackPage() {
  const { t } = useTranslation();
  const federatedConfig = {
    processingMessage: t("processingEllipsis"),
    processingDetails: t("pleaseWaitCompleteSetup"),
    successMessage: t("success"),
    successDetailsTemplate:
      "Your {serviceName} authorization completed successfully. You can now use this connector for search.",
    errorMessage: "Something Went Wrong",
    backButtonText: t("backToChat"),
    redirectingMessage: "Redirecting to chat in 2 seconds...",
    autoRedirectDelay: 2000,
    defaultRedirectPath: "/app",
    callbackApiUrl: "/api/federated/callback",
    errorMessageMap: {
      "validation errors":
        "Configuration error - please check your connector settings",
      client_secret: "Authentication credentials are missing or invalid",
      oauth: "OAuth authorization failed",
    },
  };

  return <OAuthCallbackPage config={federatedConfig} />;
}
