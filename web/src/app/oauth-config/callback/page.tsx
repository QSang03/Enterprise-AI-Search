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
        successDetailsTemplate: t("oauthCallback.successDetailsTool"),
        errorMessage: t("oauthCallback.errorMessageFailed"),
        backButtonText: t("backToChat"),
        autoRedirectDelay: 2000,
      }}
    />
  );
}
