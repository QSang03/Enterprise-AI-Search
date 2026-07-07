"use client";

import MCPPageContent from "@/sections/actions/MCPPageContent";
import { SettingsLayouts } from "@opal/layouts";
import { ADMIN_ROUTES } from "@/lib/admin-routes";
import { useTranslation } from "@/providers/LanguageProvider";

const route = ADMIN_ROUTES.MCP_ACTIONS;

export default function Main() {
  const { t } = useTranslation();

  return (
    <SettingsLayouts.Root>
      <SettingsLayouts.Header
        icon={route.icon}
        title={route.title}
        description={t("actions.mcpPageDesc")}
        divider
      />
      <SettingsLayouts.Body>
        <MCPPageContent />
      </SettingsLayouts.Body>
    </SettingsLayouts.Root>
  );
}
