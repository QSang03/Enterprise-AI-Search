import {
  ConfluenceConfig,
  Connector,
  GithubConfig,
  GitlabConfig,
  JiraConfig,
  SlackConfig,
  ZulipConfig,
} from "@/lib/connectors/connectors";
import { getSourceMetadata } from "@/lib/sources";
import { useTranslation } from "@/providers/LanguageProvider";

import Link from "next/link";

interface ConnectorTitleProps {
  connector: Connector<any>;
  ccPairId: number;
  ccPairName: string;
  isPublic?: boolean;
  owner?: string;
  isLink?: boolean;
  showMetadata?: boolean;
  className?: string;
}

export const ConnectorTitle = ({
  connector,
  ccPairId,
  ccPairName,
  owner,
  isPublic = true,
  isLink = true,
  showMetadata = true,
  className = "",
}: ConnectorTitleProps) => {
  const { t } = useTranslation();
  const sourceMetadata = getSourceMetadata(connector.source);

  let additionalMetadata = new Map<string, string>();
  if (connector.source === "github") {
    const typedConnector = connector as Connector<GithubConfig>;
    additionalMetadata.set(
      t("connectorCCPair.repo"),
      typedConnector.connector_specific_config.repositories
        ? `${typedConnector.connector_specific_config.repo_owner}/${
            typedConnector.connector_specific_config.repositories.includes(",")
              ? t("connectorCCPair.multipleRepos")
              : typedConnector.connector_specific_config.repositories
          }`
        : `${typedConnector.connector_specific_config.repo_owner}/*`
    );
  } else if (connector.source === "gitlab") {
    const typedConnector = connector as Connector<GitlabConfig>;
    additionalMetadata.set(
      t("connectorCCPair.repo"),
      `${typedConnector.connector_specific_config.project_owner}/${typedConnector.connector_specific_config.project_name}`
    );
  } else if (connector.source === "confluence") {
    const typedConnector = connector as Connector<ConfluenceConfig>;
    const wikiUrl = typedConnector.connector_specific_config.is_cloud
      ? `${typedConnector.connector_specific_config.wiki_base}/wiki/spaces/${typedConnector.connector_specific_config.space}`
      : `${typedConnector.connector_specific_config.wiki_base}/spaces/${typedConnector.connector_specific_config.space}`;
    additionalMetadata.set(t("connectorCCPair.wikiUrl"), wikiUrl);
    if (typedConnector.connector_specific_config.page_id) {
      additionalMetadata.set(
        t("connectorCCPair.pageId"),
        typedConnector.connector_specific_config.page_id
      );
    }
  } else if (connector.source === "jira") {
    const typedConnector = connector as Connector<JiraConfig>;
    additionalMetadata.set(
      t("connectorCCPair.jiraProjectUrl"),
      typedConnector.connector_specific_config.jira_project_url
    );
  } else if (connector.source === "slack") {
    const typedConnector = connector as Connector<SlackConfig>;
    if (
      typedConnector.connector_specific_config?.channels &&
      typedConnector.connector_specific_config?.channels.length > 0
    ) {
      additionalMetadata.set(
        t("connectorCCPair.channels"),
        typedConnector.connector_specific_config.channels.join(", ")
      );
    }
    if (typedConnector.connector_specific_config.channel_regex_enabled) {
      additionalMetadata.set(t("connectorCCPair.channelRegexEnabled"), t("connectorCCPair.trueValue"));
    }
    if (
      typedConnector.connector_specific_config?.exclude_channels &&
      typedConnector.connector_specific_config.exclude_channels.length > 0
    ) {
      additionalMetadata.set(
        t("connectorCCPair.excludedChannels"),
        typedConnector.connector_specific_config.exclude_channels.join(", ")
      );
    }
    if (
      typedConnector.connector_specific_config.exclude_channel_regex_enabled
    ) {
      additionalMetadata.set(t("connectorCCPair.excludeChannelRegexEnabled"), t("connectorCCPair.trueValue"));
    }
    if (typedConnector.connector_specific_config.include_bot_messages) {
      additionalMetadata.set(t("connectorCCPair.includeBotMessages"), t("connectorCCPair.trueValue"));
    }
  } else if (connector.source === "zulip") {
    const typedConnector = connector as Connector<ZulipConfig>;
    additionalMetadata.set(
      t("connectorCCPair.realm"),
      typedConnector.connector_specific_config.realm_name
    );
  }

  const mainSectionClassName = `text-blue-500 dark:text-blue-100 flex w-fit ${className}`;
  const mainDisplay = (
    <>
      {sourceMetadata.icon({ size: 16 })}
      <div className="ml-1 my-auto text-xs font-medium truncate">
        {ccPairName || sourceMetadata.displayName}
      </div>
    </>
  );
  return (
    <div className="my-auto max-w-full">
      {isLink ? (
        <Link
          className={mainSectionClassName}
          href={`/admin/connector/${ccPairId}`}
        >
          {mainDisplay}
        </Link>
      ) : (
        <div className={mainSectionClassName}>{mainDisplay}</div>
      )}
      {showMetadata && additionalMetadata.size > 0 && (
        <div className="text-[10px] mt-0.5 text-gray-600 dark:text-gray-400">
          {Array.from(additionalMetadata.entries()).map(([key, value]) => {
            return (
              <div key={key} className="truncate">
                <i>{key}:</i> {value}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
