"use client";

import Logo from "@/refresh-components/Logo";
import { useSettings } from "@/lib/settings/hooks";
import { useTranslation } from "@/providers/LanguageProvider";

export default function OnyxInitializingLoader() {
  const { appName } = useSettings();
  const { t } = useTranslation();

  return (
    <div className="mx-auto my-auto animate-pulse">
      <Logo folded size={96} className="mx-auto mb-3" />
      <p className="text-lg text-text font-semibold">
        {t("common.initializing", { appName })}
      </p>
    </div>
  );
}
