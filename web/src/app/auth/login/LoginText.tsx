"use client";

import React from "react";
import { useSettings } from "@/lib/settings/hooks";
import Text from "@/refresh-components/texts/Text";
import { useTranslation } from "@/providers/LanguageProvider";

export default function LoginText() {
  const { t } = useTranslation();
  const { appName } = useSettings();
  return (
    <div className="w-full flex flex-col ">
      <Text as="p" headingH2 text05>
        {t("auth.loginWelcome", { appName })}
      </Text>
      <Text as="p" text03 mainUiMuted>
        {t("auth.loginSub")}
      </Text>
    </div>
  );
}
