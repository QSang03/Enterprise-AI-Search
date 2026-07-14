import { useSettings } from "@/lib/settings/hooks";
import { useTranslation } from "@/providers/LanguageProvider";

export function useCustomFooterContent(): string {
  const settings = useSettings();
  const { t } = useTranslation();
  return (
    settings.enterprise?.custom_lower_disclaimer_content ||
    `[Onyx ${settings.version ?? "dev"}](https://www.onyx.app/) - ${t("common.appSlogan")}`
  );
}
