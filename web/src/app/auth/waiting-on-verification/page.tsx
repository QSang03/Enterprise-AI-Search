"use client";

import { redirect } from "next/navigation";
import { RequestNewVerificationEmail } from "./RequestNewVerificationEmail";
import Logo from "@/refresh-components/Logo";
import { Text } from "@opal/components";
import { markdown } from "@opal/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAuthTypeMetadata } from "@/hooks/useAuthTypeMetadata";
import { useTranslation } from "@/providers/LanguageProvider";
import { Spinner } from "@/components/Spinner";

export default function Page() {
  const { t } = useTranslation();
  const { user: currentUser, userError } = useCurrentUser();
  const isUserLoading = currentUser === undefined && userError === undefined;
  const { authTypeMetadata, isLoading: isAuthLoading } = useAuthTypeMetadata();

  if (isUserLoading || isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!currentUser) {
    return redirect("/auth/login");
  }

  if (!authTypeMetadata?.requiresVerification || currentUser.is_verified) {
    return redirect("/app");
  }

  return (
    <main>
      <div className="min-h-screen flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 gap-4">
        <Logo folded size={64} className="mx-auto w-fit" />
        <div className="flex flex-col gap-2">
          <Text as="span">
            {markdown(
              t("auth.notVerifiedDesc", { email: currentUser.email })
            )}
          </Text>
          <div className="flex flex-row items-center gap-1">
            <Text as="span">{t("auth.notVerifiedInstruction")}</Text>
            <RequestNewVerificationEmail email={currentUser.email}>
              <Text as="span">{t("auth.notVerifiedClickHere")}</Text>
            </RequestNewVerificationEmail>
            <Text as="span">{t("auth.notVerifiedRequestNew")}</Text>
          </div>
        </div>
      </div>
    </main>
  );
}
