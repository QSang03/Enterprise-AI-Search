"use client";

import AuthFlowContainer from "@/components/auth/AuthFlowContainer";
import Text from "@/refresh-components/texts/Text";
import { Button } from "@opal/components";
import { NEXT_PUBLIC_CLOUD_ENABLED } from "@/lib/constants";
import { useTranslation } from "@/providers/LanguageProvider";

const ERROR_CODE_MESSAGES_KEYS: Record<string, string> = {
  access_denied: "auth.accessDenied",
  login_required: "auth.loginRequired",
  consent_required: "auth.consentRequired",
  interaction_required: "auth.interactionRequired",
  invalid_scope: "auth.invalidScope",
  server_error: "auth.serverError",
  temporarily_unavailable: "auth.temporarilyUnavailable",
};

function resolveMessage(raw: string | null, t: any): string | null {
  if (!raw) return null;
  const key = ERROR_CODE_MESSAGES_KEYS[raw];
  return key ? t(key) : raw;
}

interface AuthErrorContentProps {
  message: string | null;
}

function AuthErrorContent({ message: rawMessage }: AuthErrorContentProps) {
  const { t } = useTranslation();
  const message = resolveMessage(rawMessage, t);

  return (
    <AuthFlowContainer>
      <div className="flex flex-col items-center gap-4">
        <Text headingH2 text05>
          {t("auth.authErrorTitle")}
        </Text>
        <Text mainContentBody text03>
          {t("auth.authErrorDesc")}
        </Text>
        {/* TODO: Error card component */}
        <div className="w-full rounded-12 border border-status-error-05 bg-status-error-00 p-4">
          {message ? (
            <Text mainContentBody className="text-status-error-05">
              {message}
            </Text>
          ) : (
            <div className="flex flex-col gap-2 px-4">
              <Text mainContentEmphasis className="text-status-error-05">
                {t("auth.possibleIssuesTitle")}
              </Text>
              <Text as="li" mainContentBody className="text-status-error-05">
                {t("auth.issueCredentials")}
              </Text>
              <Text as="li" mainContentBody className="text-status-error-05">
                {t("auth.issueDisruption")}
              </Text>
              <Text as="li" mainContentBody className="text-status-error-05">
                {t("auth.issuePermissions")}
              </Text>
            </div>
          )}
        </div>

        <Button href="/auth/login" width="full">
          {t("auth.returnToLogin")}
        </Button>

        <Text mainContentBody text04>
          {NEXT_PUBLIC_CLOUD_ENABLED ? (
            <>
              {t("auth.cloudSupportDesc")}
              <a href="mailto:support@onyx.app" className="text-action-link-05">
                support@onyx.app
              </a>
            </>
          ) : (
            t("auth.selfHostedSupportDesc")
          )}
        </Text>
      </div>
    </AuthFlowContainer>
  );
}

export default AuthErrorContent;
