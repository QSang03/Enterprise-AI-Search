"use client";

import { SettingsLayouts } from "@opal/layouts";
import OpenApiPageContent from "@/sections/actions/OpenApiPageContent";
import { ADMIN_ROUTES } from "@/lib/admin-routes";
import { useTranslation } from "@/providers/LanguageProvider";

const route = ADMIN_ROUTES.OPENAPI_ACTIONS;

export default function Main() {
  const { t } = useTranslation();

  return (
    <SettingsLayouts.Root>
      <SettingsLayouts.Header
        icon={route.icon}
        title={route.title}
        description={t("actions.openApiPageDesc")}
        divider
      />
      <SettingsLayouts.Body>
        <OpenApiPageContent />
      </SettingsLayouts.Body>
    </SettingsLayouts.Root>
  );
}
