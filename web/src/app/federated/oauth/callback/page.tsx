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
    successDetailsTemplate: t("oauthCallback.successDetailsSearch"),
    errorMessage: t("oauthCallback.errorMessage"),
    backButtonText: t("backToChat"),
    redirectingMessage: t("oauthCallback.redirectingToChat", { seconds: 2 }),
    autoRedirectDelay: 2000,
    defaultRedirectPath: "/app",
    callbackApiUrl: "/api/federated/callback",
    errorMessageMap: {
      "validation errors": t("oauthCallback.errorValidation"),
      client_secret: t("oauthCallback.errorClientSecret"),
      oauth: t("oauthCallback.errorOauth"),
    },
  };

  return <OAuthCallbackPage config={federatedConfig} />;
}
