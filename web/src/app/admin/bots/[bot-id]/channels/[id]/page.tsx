"use client";

import { use } from "react";
import { SlackChannelConfigCreationForm } from "@/app/admin/bots/[bot-id]/channels/SlackChannelConfigCreationForm";
import { ErrorCallout } from "@/components/ErrorCallout";
import { SvgSimpleLoader } from "@opal/icons";
import { SettingsLayouts } from "@opal/layouts";
import { SvgSlack } from "@opal/logos";
import { useSlackChannelConfigs } from "@/app/admin/bots/[bot-id]/hooks";
import { useDocumentSets } from "@/app/admin/documents/sets/hooks";
import { useAgents } from "@/lib/agents/hooks";
import { useStandardAnswerCategories } from "@/app/premium/admin/standard-answer/hooks";
import { useTierAtLeast } from "@/hooks/useTierAtLeast";
import { Tier } from "@/lib/settings/types";
import type { StandardAnswerCategoryResponse } from "@/components/standardAnswers/getStandardAnswerCategoriesIfEE";
import { useTranslation } from "@/providers/LanguageProvider";

function EditSlackChannelConfigContent({ id }: { id: string }) {
  const { t } = useTranslation();
  const enterpriseTier = useTierAtLeast(Tier.ENTERPRISE);

  const {
    data: slackChannelConfigs,
    isLoading: isChannelsLoading,
    error: channelsError,
  } = useSlackChannelConfigs();

  const {
    data: documentSets,
    isLoading: isDocSetsLoading,
    error: docSetsError,
  } = useDocumentSets();

  const {
    agents,
    isLoading: isAgentsLoading,
    error: agentsError,
  } = useAgents();

  const {
    data: standardAnswerCategories,
    isLoading: isStdAnswerLoading,
    error: stdAnswerError,
  } = useStandardAnswerCategories();

  const isLoading =
    isChannelsLoading ||
    isDocSetsLoading ||
    isAgentsLoading ||
    (enterpriseTier && isStdAnswerLoading);

  const slackChannelConfig = slackChannelConfigs?.find(
    (config) => config.id === Number(id)
  );

  const title = slackChannelConfig?.is_default
    ? t("slackBots.editDefaultConfig")
    : t("slackBots.configureSlackChannel");

  return (
    <SettingsLayouts.Root>
      <SettingsLayouts.Header
        icon={SvgSlack}
        title={title}
        divider
        backButton
      />
      <SettingsLayouts.Body>
        {isLoading ? (
          <SvgSimpleLoader />
        ) : channelsError || !slackChannelConfigs ? (
          <ErrorCallout
            errorTitle={t("slackBots.errorSomethingWrong")}
            errorMsg={t("slackBots.failedFetchSlackChannels", {
              error: channelsError?.message ?? t("slackBots.unknownError"),
            })}
          />
        ) : !slackChannelConfig ? (
          <ErrorCallout
            errorTitle={t("slackBots.errorSomethingWrong")}
            errorMsg={t("slackBots.configNotFound", { id })}
          />
        ) : docSetsError || !documentSets ? (
          <ErrorCallout
            errorTitle={t("slackBots.errorSomethingWrong")}
            errorMsg={t("slackBots.failedFetchDocSets", {
              error: docSetsError?.message ?? t("slackBots.unknownError"),
            })}
          />
        ) : agentsError ? (
          <ErrorCallout
            errorTitle={t("slackBots.errorSomethingWrong")}
            errorMsg={t("slackBots.failedFetchAgents", {
              error: agentsError?.message ?? t("slackBots.unknownError"),
            })}
          />
        ) : (
          <SlackChannelConfigCreationForm
            slack_bot_id={slackChannelConfig.slack_bot_id}
            documentSets={documentSets}
            personas={agents}
            standardAnswerCategoryResponse={
              enterpriseTier
                ? {
                    paidEnterpriseFeaturesEnabled: true,
                    categories: standardAnswerCategories ?? [],
                    ...(stdAnswerError
                      ? { error: { message: String(stdAnswerError) } }
                      : {}),
                  }
                : { paidEnterpriseFeaturesEnabled: false }
            }
            existingSlackChannelConfig={slackChannelConfig}
          />
        )}
      </SettingsLayouts.Body>
    </SettingsLayouts.Root>
  );
}

export default function Page(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);

  return <EditSlackChannelConfigContent id={params.id} />;
}
