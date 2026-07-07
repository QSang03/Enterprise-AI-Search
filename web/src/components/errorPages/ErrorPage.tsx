"use client";

import ErrorPageLayout from "@/components/errorPages/ErrorPageLayout";
import Text from "@/refresh-components/texts/Text";
import { DOCS_BASE_URL } from "@/lib/constants";
import { SvgAlertCircle } from "@opal/icons";
import { useTranslation } from "@/providers/LanguageProvider";

export default function Error() {
  const { t } = useTranslation();

  return (
    <ErrorPageLayout>
      <div className="flex flex-row items-center gap-2">
        <Text as="p" headingH2>
          {t("configError.title")}
        </Text>
        <SvgAlertCircle className="w-6 h-6 stroke-text-04" />
      </div>

      <Text as="p" text03>
        {t("configError.description1")}
      </Text>

      <Text as="p" text03>
        {t("configError.description2Prefix")}{" "}
        <a
          className="text-action-link-05"
          href={`${DOCS_BASE_URL}?utm_source=app&utm_medium=error_page&utm_campaign=config_error`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("configError.documentation")}
        </a>{" "}
        {t("configError.description2Suffix")}
      </Text>

      <Text as="p" text03>
        {t("configError.description3Prefix")}{" "}
        <a
          className="text-action-link-05"
          href="https://discord.gg/4NA5SbzrWb"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("configError.discordCommunity")}
        </a>{" "}
        {t("configError.description3Suffix")}
      </Text>
    </ErrorPageLayout>
  );
}
