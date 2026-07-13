import { SettingsLayouts } from "@opal/layouts";
import { CUSTOM_ANALYTICS_ENABLED } from "@/lib/constants";
import { Callout } from "@/components/ui/callout";
import { ADMIN_ROUTES } from "@/lib/admin-routes";
import { Text } from "@opal/components";
import { Spacer } from "@opal/components";
import CustomAnalyticsUpdateForm from "./CustomAnalyticsUpdateForm";
import { useTranslation } from "@/providers/LanguageProvider";

const route = ADMIN_ROUTES.CUSTOM_ANALYTICS;

function Main() {
  const { t } = useTranslation();
  if (!CUSTOM_ANALYTICS_ENABLED) {
    return (
      <div>
        <div className="mt-4">
          <Callout type="danger" title={t("admin.customAnalyticsNotEnabled")}>
            {t("admin.customAnalyticsSetupInstructions")}
          </Callout>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Text as="p">
        {t("admin.customAnalyticsDescription")}
      </Text>
      <Spacer rem={2} />

      <CustomAnalyticsUpdateForm />
    </div>
  );
}

export default function Page() {
  return (
    <SettingsLayouts.Root>
      <SettingsLayouts.Header icon={route.icon} title={route.title} divider />
      <SettingsLayouts.Body>
        <Main />
      </SettingsLayouts.Body>
    </SettingsLayouts.Root>
  );
}
