"use client";

import { useCallback } from "react";
import { mutate } from "swr";
import { ContentAction } from "@opal/layouts";
import Card from "@/refresh-components/cards/Card";
import { Switch } from "@opal/components";
import { useSettings } from "@/lib/settings/hooks";
import { SWR_KEYS } from "@/lib/swr-keys";
import { toast } from "@/hooks/useToast";
import { Settings } from "@/lib/settings/types";
import { updateAdminSettings } from "@/lib/settings/svc";
import { useTranslation } from "@/providers/LanguageProvider";

export default function InviteOnlyCard() {
  const { t } = useTranslation();
  const settings = useSettings();

  const saveSettings = useCallback(
    async (updates: Partial<Settings>) => {
      const newSettings: Settings = { ...settings, ...updates };
      try {
        await mutate(
          SWR_KEYS.settings,
          async () => {
            await updateAdminSettings(newSettings);
            return newSettings;
          },
          {
            optimisticData: newSettings,
            revalidate: true,
            rollbackOnError: true,
          }
        );
        toast.success(t("admin.users.settingsUpdated"));
      } catch (err) {
        console.error("Failed to update invite_only_enabled", err);
        const message =
          err instanceof Error && err.message
            ? err.message
            : t("admin.users.failedUpdateSettings");
        toast.error(message);
      }
    },
    [settings]
  );

  return (
    <Card gap={0.5} padding={0.75}>
      <ContentAction
        title={t("admin.users.restrictSignUp")}
        description={t("admin.users.restrictSignUpDesc")}
        sizePreset="main-ui"
        variant="section"
        padding="fit"
        rightChildren={
          <Switch
            checked={settings.invite_only_enabled ?? false}
            onCheckedChange={(checked) =>
              void saveSettings({ invite_only_enabled: checked })
            }
          />
        }
      />
    </Card>
  );
}
