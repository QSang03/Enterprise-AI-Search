"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AdminPageTitle } from "@/components/admin/Title";
import { getSourceMetadata, isValidSource } from "@/lib/sources";
import { ValidSources } from "@/lib/types";
import CardSection from "@/components/admin/CardSection";
import { handleOAuthAuthorizationResponse } from "@/lib/oauth_utils";
import { SvgKey } from "@opal/icons";
import { useTranslation } from "@/providers/LanguageProvider";

export default function OAuthCallbackPage() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();

  const [statusMessage, setStatusMessage] = useState(t("oauthCallback.processing"));
  const [statusDetails, setStatusDetails] = useState(
    t("oauthCallback.pleaseWait")
  );
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [pageTitle, setPageTitle] = useState(
    t("oauthCallback.defaultTitle")
  );

  // Extract query parameters
  const code = searchParams?.get("code");
  const state = searchParams?.get("state");

  const pathname = usePathname();
  const connector = pathname?.split("/")[3];

  useEffect(() => {
    const onFirstLoad = async () => {
      // Examples
      // connector (url segment)= "google-drive"
      // sourceType (for looking up metadata) = "google_drive"

      if (!code || !state) {
        setStatusMessage(t("oauthCallback.improperlyFormed"));
        setStatusDetails(
          !code
            ? t("oauthCallback.missingCode")
            : t("oauthCallback.missingState")
        );
        setIsError(true);
        return;
      }

      if (!connector) {
        setStatusMessage(
          t("oauthCallback.invalidSourceType").replace("{sourceType}", connector ?? "")
        );
        setStatusDetails(
          t("oauthCallback.notValidSourceType").replace("{sourceType}", connector ?? "")
        );
        setIsError(true);
        return;
      }

      const sourceType = connector.replaceAll("-", "_");
      if (!isValidSource(sourceType)) {
        setStatusMessage(
          t("oauthCallback.invalidSourceType").replace("{sourceType}", sourceType)
        );
        setStatusDetails(
          t("oauthCallback.notValidSourceType").replace("{sourceType}", sourceType)
        );
        setIsError(true);
        return;
      }

      const sourceMetadata = getSourceMetadata(sourceType as ValidSources);
      setPageTitle(
        t("oauthCallback.titleWith").replace("{displayName}", sourceMetadata.displayName)
      );

      setStatusMessage(t("oauthCallback.processing"));
      setStatusDetails(t("oauthCallback.pleaseWaitAuth"));
      setIsError(false); // Ensure no error state during loading

      try {
        const response = await handleOAuthAuthorizationResponse(
          connector,
          code,
          state
        );

        if (!response) {
          throw new Error("Empty response from OAuth server.");
        }

        setStatusMessage(t("oauthCallback.success"));

        // set the continuation link
        if (response.finalize_url) {
          setRedirectUrl(response.finalize_url);
          setStatusDetails(
            t("oauthCallback.successWithSteps").replace(
              "{displayName}",
              sourceMetadata.displayName
            )
          );
        } else {
          setRedirectUrl(response.redirect_on_success);
          setStatusDetails(
            t("oauthCallback.successNoSteps").replace(
              "{displayName}",
              sourceMetadata.displayName
            )
          );
        }
        setIsError(false);
      } catch (error) {
        console.error("OAuth error:", error);
        setStatusMessage(t("oauthCallback.oopsWentWrong"));
        setStatusDetails(t("oauthCallback.errorOccurred"));
        setIsError(true);
      }
    };

    onFirstLoad();
  }, [code, state, connector]);

  return (
    <div className="mx-auto h-screen flex flex-col">
      <AdminPageTitle title={pageTitle} icon={SvgKey} />

      <div className="flex-1 flex flex-col items-center justify-center">
        <CardSection className="max-w-md w-[500px] h-[250px] p-8">
          <h1 className="text-2xl font-bold mb-4">{statusMessage}</h1>
          <p className="text-text-500">{statusDetails}</p>
          {redirectUrl && !isError && (
            <div className="mt-4">
              <p className="text-sm">
                {t("oauthCallback.clickHereToContinue").split("{here}")[0]}
                <a href={redirectUrl} className="text-blue-500 underline">
                  {t("oauthCallback.here")}
                </a>
                {t("oauthCallback.clickHereToContinue").split("{here}")[1]}
              </p>
            </div>
          )}
        </CardSection>
      </div>
    </div>
  );
}
