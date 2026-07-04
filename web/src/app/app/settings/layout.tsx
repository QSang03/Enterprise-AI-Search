"use client";

import { usePathname } from "next/navigation";
import { SettingsLayouts } from "@opal/layouts";
import { SidebarTab } from "@opal/components";
import { SvgSliders } from "@opal/icons";
import { useUser } from "@/providers/UserProvider";
import { useAuthType } from "@/lib/hooks";
import { Section } from "@/layouts/general-layouts";
import { useTranslation } from "@/providers/LanguageProvider";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { user } = useUser();
  const authType = useAuthType();

  const showPasswordSection = Boolean(user?.password_configured);
  const showTokensSection = authType !== null;
  const showAccountsAccessTab = showPasswordSection || showTokensSection;

  return (
    <SettingsLayouts.Root width="lg">
      <SettingsLayouts.Header icon={SvgSliders} title={t("settings.settingsTitle")} divider />

      <SettingsLayouts.Body>
        <Section
          flexDirection="row"
          justifyContent="start"
          alignItems="start"
          gap={1.5}
        >
          {/* Left: Tab Navigation */}
          <div
            data-testid="settings-left-tab-navigation"
            className="flex flex-col px-2 min-w-50"
          >
            <SidebarTab
              href="/app/settings/general"
              selected={pathname === "/app/settings/general"}
            >
              {t("settings.general")}
            </SidebarTab>
            <SidebarTab
              href="/app/settings/chat-preferences"
              selected={pathname === "/app/settings/chat-preferences"}
            >
              {t("settings.chatPreferences")}
            </SidebarTab>
            {showAccountsAccessTab && (
              <SidebarTab
                href="/app/settings/accounts-access"
                selected={pathname === "/app/settings/accounts-access"}
              >
                {t("settings.accountsAccess")}
              </SidebarTab>
            )}
            <SidebarTab
              href="/app/settings/connectors"
              selected={pathname === "/app/settings/connectors"}
            >
              {t("settings.connectors")}
            </SidebarTab>
          </div>

          {/* Right: Tab Content */}
          {children}
        </Section>
      </SettingsLayouts.Body>
    </SettingsLayouts.Root>
  );
}
