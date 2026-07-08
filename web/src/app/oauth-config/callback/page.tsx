import OAuthCallbackPage from "@/components/oauth/OAuthCallbackPage";
import { useTranslation } from "@/providers/LanguageProvider";

export default function OAuthConfigCallbackPage() {
  const { t } = useTranslation();
  return (
    <OAuthCallbackPage
      config={{
        callbackApiUrl: "/api/oauth-config/callback",
        defaultRedirectPath: "/app",
        processingMessage: t("processingEllipsis"),
        processingDetails: t("pleaseWaitSecureStore"),
        successMessage: t("success"),
        successDetailsTemplate:
          "You have successfully authorized the tool to access your {serviceName} account.",
        errorMessage: "Authorization Failed",
        backButtonText: t("backToChat"),
        autoRedirectDelay: 2000,
      }}
    />
  );
}
