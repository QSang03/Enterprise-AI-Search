"use client";

import type { Route } from "next";
import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { SvgExternalLink, SvgUsers, SvgSimpleLoader } from "@opal/icons";
import { Button, MessageCard } from "@opal/components";
import { SettingsLayouts } from "@opal/layouts";
import { errorHandlingFetcher } from "@/lib/fetcher";
import type { UserGroup } from "@/lib/types";
import { SWR_KEYS } from "@/lib/swr-keys";
import GroupsList from "./GroupsList";
import AdminListHeader from "@/sections/admin/AdminListHeader";
import { IllustrationContent } from "@opal/layouts";
import SvgNoResult from "@opal/illustrations/no-result";
import { useTranslation } from "@/providers/LanguageProvider";

function GroupsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data: groups,
    error,
    isLoading,
  } = useSWR<UserGroup[]>(SWR_KEYS.adminUserGroups, errorHandlingFetcher);

  return (
    <SettingsLayouts.Root>
      <div data-testid="groups-page-heading">
        <SettingsLayouts.Header icon={SvgUsers} title={t("admin.groups.title")} divider>
          <MessageCard
            variant="info"
            title={t("admin.groups.permissionsWarningTitle")}
            description={t("admin.groups.permissionsWarningDesc")}
            rightChildren={
              <Button
                icon={SvgExternalLink}
                onClick={() =>
                  window.open(
                    "https://docs.onyx.app/admins/permissions/whats_changing",
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
              >
                {t("admin.groups.learnMore")}
              </Button>
            }
          />
        </SettingsLayouts.Header>
      </div>

      <SettingsLayouts.Body>
        <AdminListHeader
          hasItems={!isLoading && !error && (groups?.length ?? 0) > 0}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          placeholder={t("admin.groups.searchPlaceholder")}
          emptyStateText={t("admin.groups.emptyStateText")}
          onAction={() => router.push("/admin/groups/create" as Route)}
          actionLabel={t("admin.groups.newGroup")}
        />

        {isLoading && <SvgSimpleLoader />}

        {error && (
          <IllustrationContent
            illustration={SvgNoResult}
            title={t("admin.groups.failedLoad")}
            description={t("admin.groups.checkConsole")}
          />
        )}

        {!isLoading && !error && groups && (
          <GroupsList groups={groups} searchQuery={searchQuery} />
        )}
      </SettingsLayouts.Body>
    </SettingsLayouts.Root>
  );
}

export default GroupsPage;
