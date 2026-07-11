"use client";

import OAuthCallbackPage from "@/components/oauth/OAuthCallbackPage";
import { useTranslation } from "@/providers/LanguageProvider";

export default function MCPOAuthCallbackPage() {
  const { t } = useTranslation();
  const mcpConfig = {
    processingMessage: t("processingEllipsis"),
    processingDetails: t("pleaseWaitCompleteMcpSetup"),
    successMessage: t("success"),
    successDetailsTemplate: t("oauthCallback.successDetailsMcp"),
    errorMessage: t("oauthCallback.errorMessage"),
    backButtonText: t("backToChat"),
    redirectingMessage: t("oauthCallback.redirectingBack", { seconds: 2 }),
    autoRedirectDelay: 2000,
    defaultRedirectPath: "/app",
    callbackApiUrl: "/api/mcp/oauth/callback",
    errorMessageMap: {
      "server not found": t("oauthCallback.errorServerNotFound"),
      credentials: t("oauthCallback.errorCredentials"),
      oauth: t("oauthCallback.errorOauth"),
      validation: t("oauthCallback.errorValidationMcp"),
    },
  };

  return <OAuthCallbackPage config={mcpConfig} />;
}
