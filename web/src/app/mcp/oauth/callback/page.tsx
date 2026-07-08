"use client";

import OAuthCallbackPage from "@/components/oauth/OAuthCallbackPage";
import { useTranslation } from "@/providers/LanguageProvider";

export default function MCPOAuthCallbackPage() {
  const { t } = useTranslation();
  const mcpConfig = {
    processingMessage: t("processingEllipsis"),
    processingDetails: t("pleaseWaitCompleteMcpSetup"),
    successMessage: t("success"),
    successDetailsTemplate:
      "Your {serviceName} authorization completed successfully. You can now use this server's tools in chat.",
    errorMessage: "Something Went Wrong",
    backButtonText: t("backToChat"),
    redirectingMessage: "Redirecting back in 2 seconds...",
    autoRedirectDelay: 2000,
    defaultRedirectPath: "/app",
    callbackApiUrl: "/api/mcp/oauth/callback",
    errorMessageMap: {
      "server not found": "MCP server configuration not found",
      credentials: "Authentication credentials are invalid",
      oauth: "OAuth authorization failed",
      validation: "Could not validate connection to MCP server",
    },
  };

  return <OAuthCallbackPage config={mcpConfig} />;
}
