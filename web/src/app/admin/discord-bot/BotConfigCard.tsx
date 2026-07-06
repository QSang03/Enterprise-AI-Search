"use client";

import { useState } from "react";
import { Section } from "@/layouts/general-layouts";
import Text from "@/refresh-components/texts/Text";
import Card from "@/refresh-components/cards/Card";
import { Button } from "@opal/components";
import { Badge } from "@/components/ui/badge";
import PasswordInputTypeIn from "@/refresh-components/inputs/PasswordInputTypeIn";
import SvgSimpleLoader from "@opal/icons/simple-loader";
import { Tooltip } from "@opal/components";
import {
  useDiscordBotConfig,
  useDiscordGuilds,
} from "@/app/admin/discord-bot/hooks";
import { createBotConfig, deleteBotConfig } from "@/app/admin/discord-bot/lib";
import { toast } from "@/hooks/useToast";
import { ConfirmEntityModal } from "@/sections/modals/ConfirmEntityModal";
import { getFormattedDateTime } from "@/lib/dateUtils";
import { useTranslation } from "@/providers/LanguageProvider";

export function BotConfigCard() {
  const { t } = useTranslation();
  const {
    data: botConfig,
    isLoading,
    isManaged,
    refreshBotConfig,
  } = useDiscordBotConfig();
  const { data: guilds } = useDiscordGuilds();

  const [botToken, setBotToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Don't render anything if managed externally (Cloud or env var)
  if (isManaged) {
    return null;
  }

  // Show loading while fetching initial state
  if (isLoading) {
    return (
      <Card>
        <Section
          flexDirection="row"
          justifyContent="between"
          alignItems="center"
        >
          <Text mainContentEmphasis text05>
            {t("discordBots.botTokenLabel")}
          </Text>
        </Section>
        <div className="flex justify-center">
          <SvgSimpleLoader className="h-6 w-6" />
        </div>
      </Card>
    );
  }

  const isConfigured = botConfig?.configured ?? false;
  const hasServerConfigs = (guilds?.length ?? 0) > 0;

  const handleSaveToken = async () => {
    if (!botToken.trim()) {
      toast.error(t("discordBots.toastEnterToken"));
      return;
    }

    setIsSubmitting(true);
    try {
      await createBotConfig(botToken.trim());
      setBotToken("");
      refreshBotConfig();
      toast.success(t("discordBots.toastTokenSaved"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("discordBots.toastTokenSaveFailed")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteToken = async () => {
    setIsSubmitting(true);
    try {
      await deleteBotConfig();
      refreshBotConfig();
      toast.success(t("discordBots.toastTokenDeleted"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("discordBots.toastTokenDeleteFailed")
      );
    } finally {
      setIsSubmitting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <>
      {showDeleteConfirm && (
        <ConfirmEntityModal
          danger
          entityType={t("discordBots.deleteConfirmTitle")}
          entityName={t("discordBots.botTokenLabel")}
          onClose={() => setShowDeleteConfirm(false)}
          onSubmit={handleDeleteToken}
          additionalDetails={t("discordBots.deleteConfirmDesc")}
        />
      )}
      <Card>
        <Section flexDirection="row" justifyContent="between">
          <Section flexDirection="row" gap={0.5} width="fit">
            <Text mainContentEmphasis text05>
              {t("discordBots.botTokenLabel")}
            </Text>
            {isConfigured ? (
              <Badge variant="success">{t("discordBots.configured")}</Badge>
            ) : (
              <Badge variant="secondary">{t("discordBots.notConfigured")}</Badge>
            )}
          </Section>
          {isConfigured && (
            <Tooltip
              tooltip={
                hasServerConfigs ? t("discordBots.deleteConfigsFirst") : undefined
              }
            >
              <Button
                disabled={isSubmitting || hasServerConfigs}
                variant="danger"
                onClick={() => setShowDeleteConfirm(true)}
              >
                {t("discordBots.deleteTokenBtn")}
              </Button>
            </Tooltip>
          )}
        </Section>

        {isConfigured ? (
          <Section flexDirection="column" alignItems="start" gap={0.5}>
            <Text text03 secondaryBody>
              {t("discordBots.botTokenConfiguredMsg")}
              {botConfig?.created_at && (
                <>
                  {" "}
                  {t("discordBots.botTokenAddedDate", { date: getFormattedDateTime(new Date(botConfig.created_at)) || "" })}
                </>
              )}
            </Text>
            <Text text03 secondaryBody>
              {t("discordBots.botTokenChangeHint")}
            </Text>
          </Section>
        ) : (
          <Section flexDirection="column" alignItems="start" gap={0.75}>
            <Text text03 secondaryBody>
              {t("discordBots.botTokenInstruction")}
            </Text>
            <Section flexDirection="row" alignItems="end" gap={0.5}>
              <PasswordInputTypeIn
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder={t("discordBots.placeholderEnterToken")}
                disabled={isSubmitting}
              />
              <Button
                disabled={isSubmitting || !botToken.trim()}
                onClick={handleSaveToken}
              >
                {isSubmitting ? t("discordBots.saving") : t("discordBots.saveTokenBtn")}
              </Button>
            </Section>
          </Section>
        )}
      </Card>
    </>
  );
}
