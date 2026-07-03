"use client";

import { useState } from "react";
import { SvgExternalLink, SvgUser, SvgUserPlus } from "@opal/icons";
import { Button, MessageCard } from "@opal/components";
import { SettingsLayouts } from "@opal/layouts";
import { useScimToken } from "@/hooks/useScimToken";
import { useTierAtLeast } from "@/hooks/useTierAtLeast";
import { Tier } from "@/lib/settings/types";
import useUserCounts from "@/hooks/useUserCounts";
import { UserStatus } from "@/lib/types";
import { useTranslation } from "@/providers/LanguageProvider";
import type { StatusFilter } from "./interfaces";

import UsersSummary from "./UsersSummary";
import UsersTable from "./UsersTable";
import InviteUsersModal from "./InviteUsersModal";

// ---------------------------------------------------------------------------
// Users page content
// ---------------------------------------------------------------------------

function UsersContent() {
  const enterpriseTier = useTierAtLeast(Tier.ENTERPRISE);

  const { data: scimToken } = useScimToken();
  const showScim = enterpriseTier && !!scimToken;

  const { activeCount, invitedCount, pendingCount, roleCounts, statusCounts } =
    useUserCounts();

  const [selectedStatuses, setSelectedStatuses] = useState<StatusFilter>([]);

  const toggleStatus = (target: UserStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(target)
        ? prev.filter((s) => s !== target)
        : [...prev, target]
    );
  };

  return (
    <>
      <UsersSummary
        activeUsers={activeCount}
        pendingInvites={invitedCount}
        requests={pendingCount}
        showScim={showScim}
        onFilterActive={() => toggleStatus(UserStatus.ACTIVE)}
        onFilterInvites={() => toggleStatus(UserStatus.INVITED)}
        onFilterRequests={() => toggleStatus(UserStatus.REQUESTED)}
      />

      <UsersTable
        selectedStatuses={selectedStatuses}
        onStatusesChange={setSelectedStatuses}
        roleCounts={roleCounts}
        statusCounts={statusCounts}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UsersPage() {
  const { t } = useTranslation();
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <SettingsLayouts.Root width="lg">
      <SettingsLayouts.Header
        title={t("admin.users.title")}
        icon={SvgUser}
        rightChildren={
          <Button icon={SvgUserPlus} onClick={() => setInviteOpen(true)}>
            {t("admin.users.inviteUsers")}
          </Button>
        }
      >
        <MessageCard
          variant="info"
          title={t("admin.users.permissionsWarningTitle")}
          description={t("admin.users.permissionsWarningDesc")}
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
              {t("admin.users.learnMore")}
            </Button>
          }
        />
      </SettingsLayouts.Header>
      <SettingsLayouts.Body>
        <UsersContent />
      </SettingsLayouts.Body>

      <InviteUsersModal open={inviteOpen} onOpenChange={setInviteOpen} />
    </SettingsLayouts.Root>
  );
}
