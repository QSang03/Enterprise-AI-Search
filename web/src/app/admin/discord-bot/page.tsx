"use client";

import { useState } from "react";
import { PageLoader } from "@/refresh-components/PageLoader";
import { ErrorCallout } from "@/components/ErrorCallout";
import { toast } from "@/hooks/useToast";
import { useTranslation } from "@/providers/LanguageProvider";
import { Section } from "@/layouts/general-layouts";
import { SettingsLayouts } from "@opal/layouts";
import Text from "@/refresh-components/texts/Text";
import { Button } from "@opal/components";
import Modal from "@/refresh-components/Modal";
import { CopyButton } from "@opal/components";
import Card from "@/refresh-components/cards/Card";
import { SvgKey, SvgPlusCircle } from "@opal/icons";
import {
  useDiscordGuilds,
  useDiscordBotConfig,
} from "@/app/admin/discord-bot/hooks";
import { createGuildConfig } from "@/app/admin/discord-bot/lib";
import { DiscordGuildsTable } from "@/app/admin/discord-bot/DiscordGuildsTable";
import { BotConfigCard } from "@/app/admin/discord-bot/BotConfigCard";
import { ADMIN_ROUTES } from "@/lib/admin-routes";

const route = ADMIN_ROUTES.DISCORD_BOTS;

function DiscordBotContent() {
  const { t } = useTranslation();
  const { data: guilds, isLoading, error, refreshGuilds } = useDiscordGuilds();
  const { data: botConfig, isManaged } = useDiscordBotConfig();
  const [registrationKey, setRegistrationKey] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Bot is available if:
  // - Managed externally (Cloud/env) - assume it's configured
  // - Self-hosted and explicitly configured via UI
  const isBotAvailable = isManaged || botConfig?.configured === true;

  const handleCreateGuild = async () => {
    setIsCreating(true);
    try {
      const result = await createGuildConfig();
      setRegistrationKey(result.registration_key);
      refreshGuilds();
      toast.success(t("discordBots.toastServerCreated"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("discordBots.toastServerCreatedFailed", { error: t("discordBots.unknownError") })
      );
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return <PageLoader />;
  }

  if (error || !guilds) {
    return (
      <ErrorCallout
        errorTitle={t("discordBots.failedLoadServers")}
        errorMsg={error?.info?.detail || t("discordBots.unknownError")}
      />
    );
  }

  return (
    <>
      <BotConfigCard />

      <Modal open={!!registrationKey}>
        <Modal.Content width="sm">
          <Modal.Header
            title={t("discordBots.registrationKeyTitle")}
            icon={SvgKey}
            onClose={() => setRegistrationKey(null)}
            description={t("discordBots.registrationKeyDesc")}
          />
          <Modal.Body>
            <Text text04 mainUiBody>
              {t("discordBots.registrationKeyInstruction")}
            </Text>
            <Card variant="secondary">
              <Section
                flexDirection="row"
                justifyContent="between"
                alignItems="center"
              >
                <Text text03 secondaryMono>
                  !register {registrationKey}
                </Text>
                <CopyButton
                  getCopyText={() => `!register ${registrationKey}`}
                />
              </Section>
            </Card>
          </Modal.Body>
        </Modal.Content>
      </Modal>

      <Card variant={!isBotAvailable ? "disabled" : "primary"}>
        <Section
          flexDirection="row"
          justifyContent="between"
          alignItems="center"
        >
          <Text mainContentEmphasis text05>
            {t("discordBots.serverConfigurations")}
          </Text>
          <Button
            icon={SvgPlusCircle}
            prominence="secondary"
            onClick={handleCreateGuild}
            disabled={isCreating || !isBotAvailable}
          >
            {isCreating ? t("discordBots.creating") : t("discordBots.addServer")}
          </Button>
        </Section>
        <DiscordGuildsTable guilds={guilds} onRefresh={refreshGuilds} />
      </Card>
    </>
  );
}

export default function Page() {
  const { t } = useTranslation();
  return (
    <SettingsLayouts.Root>
      <SettingsLayouts.Header
        icon={route.icon}
        title={route.title}
        description={t("discordBots.pageDescription")}
      />
      <SettingsLayouts.Body>
        <DiscordBotContent />
      </SettingsLayouts.Body>
    </SettingsLayouts.Root>
  );
}
