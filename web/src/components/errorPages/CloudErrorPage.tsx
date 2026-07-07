"use client";

import Text from "@/refresh-components/texts/Text";
import ErrorPageLayout from "@/components/errorPages/ErrorPageLayout";
import { useTranslation } from "@/providers/LanguageProvider";

export default function CloudError() {
  const { t } = useTranslation();

  return (
    <ErrorPageLayout>
      <Text as="p" headingH2>
        {t("cloudError.title")}
      </Text>

      <Text as="p" text03>
        {t("cloudError.description1")}
      </Text>

      <Text as="p" text03>
        {t("cloudError.description2")}
      </Text>
    </ErrorPageLayout>
  );
}
