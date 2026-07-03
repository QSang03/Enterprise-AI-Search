"use client";

import { useMemo, useState } from "react";
import { Table, createTableColumns } from "@opal/components";
import { Content } from "@opal/layouts";
import { Button } from "@opal/components";
import { SvgDownload, SvgSimpleLoader } from "@opal/icons";
import SvgNoResult from "@opal/illustrations/no-result";
import { IllustrationContent } from "@opal/layouts";
import { UserRole, UserStatus, USER_STATUS_LABELS } from "@/lib/types";
import { timeAgo } from "@opal/time";
import Text from "@/refresh-components/texts/Text";
import { InputTypeIn } from "@opal/components";
import { toast } from "@/hooks/useToast";
import useAdminUsers from "@/hooks/useAdminUsers";
import useGroups from "@/hooks/useGroups";
import { downloadUsersCsv } from "./svc";
import UserFilters from "./UserFilters";
import GroupsCell from "./GroupsCell";
import UserRowActions from "./UserRowActions";
import UserRoleCell from "./UserRoleCell";
import type {
  UserRow,
  GroupOption,
  StatusFilter,
  StatusCountMap,
} from "./interfaces";
import UserAvatar from "@/refresh-components/avatars/UserAvatar";
import type { User } from "@/lib/types";
import { useTranslation } from "@/providers/LanguageProvider";

// ---------------------------------------------------------------------------
// Column renderers
// ---------------------------------------------------------------------------

function renderNameColumn(email: string, row: UserRow) {
  return (
    <Content
      sizePreset="main-ui"
      variant="section"
      title={row.personal_name ?? email}
      description={row.personal_name ? email : undefined}
    />
  );
}

function renderStatusColumn(value: UserStatus, row: UserRow, t: any) {
  const statusLabelMap: Record<UserStatus, string> = {
    [UserStatus.ACTIVE]: t("admin.users.statusActive"),
    [UserStatus.INACTIVE]: t("admin.users.statusInactive"),
    [UserStatus.INVITED]: t("admin.users.statusInvited"),
    [UserStatus.REQUESTED]: t("admin.users.statusRequested"),
  };
  return (
    <div className="flex flex-col">
      <Text as="span" mainUiBody text03>
        {statusLabelMap[value] ?? value}
      </Text>
      {row.is_scim_synced && (
        <Text as="span" secondaryBody text03>
          {t("admin.users.scimSynced")}
        </Text>
      )}
    </div>
  );
}

function renderLastUpdatedColumn(value: string | null) {
  return (
    <Text as="span" secondaryBody text03>
      {value ? (timeAgo(value) ?? "\u2014") : "\u2014"}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

const tc = createTableColumns<UserRow>();

function buildColumns(onMutate: () => void, t: any) {
  return [
    tc.qualifier({
      content: "icon",
      iconSize: "lg",
      getContent: (row) => {
        const user = {
          email: row.email,
          personalization: row.personal_name
            ? { name: row.personal_name }
            : undefined,
        } as User;
        return (props) => <UserAvatar user={user} size={props.size} />;
      },
    }),
    tc.column("email", {
      header: t("admin.users.columnName"),
      weight: 22,
      cell: renderNameColumn,
    }),
    tc.column("groups", {
      header: t("admin.users.columnGroups"),
      weight: 24,
      enableSorting: false,
      cell: (value, row) => (
        <GroupsCell groups={value} user={row} onMutate={onMutate} />
      ),
    }),
    tc.column("role", {
      header: t("admin.users.columnAccountType"),
      weight: 16,
      cell: (_value, row) => <UserRoleCell user={row} onMutate={onMutate} />,
    }),
    tc.column("status", {
      header: t("admin.users.columnStatus"),
      weight: 14,
      cell: (value, row) => renderStatusColumn(value, row, t),
    }),
    tc.column("updated_at", {
      header: t("admin.users.columnLastUpdated"),
      weight: 14,
      cell: renderLastUpdatedColumn,
    }),
    tc.actions({
      cell: (row) => <UserRowActions user={row} onMutate={onMutate} />,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PAGE_SIZE = 8;

interface UsersTableProps {
  selectedStatuses: StatusFilter;
  onStatusesChange: (statuses: StatusFilter) => void;
  roleCounts: Record<string, number>;
  statusCounts: StatusCountMap;
}

export default function UsersTable({
  selectedStatuses,
  onStatusesChange,
  roleCounts,
  statusCounts,
}: UsersTableProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<UserRole[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);

  const { data: allGroups } = useGroups();

  const groupOptions: GroupOption[] = useMemo(
    () =>
      (allGroups ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        memberCount: g.users.length,
      })),
    [allGroups]
  );

  const { users, isLoading, error, refresh } = useAdminUsers();

  const columns = useMemo(() => buildColumns(refresh, t), [refresh, t]);

  // Client-side filtering
  const filteredUsers = useMemo(() => {
    let result = users;

    if (selectedRoles.length > 0) {
      result = result.filter(
        (u) => u.role !== null && selectedRoles.includes(u.role)
      );
    }

    if (selectedStatuses.length > 0) {
      result = result.filter((u) => selectedStatuses.includes(u.status));
    }

    if (selectedGroups.length > 0) {
      result = result.filter((u) =>
        u.groups.some((g) => selectedGroups.includes(g.id))
      );
    }

    return result;
  }, [users, selectedRoles, selectedStatuses, selectedGroups]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <SvgSimpleLoader className="h-6 w-6" />
      </div>
    );
  }

  if (error) {
    return (
      <Text as="p" secondaryBody text03>
        {t("admin.users.failedLoadUsers")}
      </Text>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <InputTypeIn
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder={t("admin.users.searchUsersPlaceholder")}
        searchIcon
      />
      <UserFilters
        selectedRoles={selectedRoles}
        onRolesChange={setSelectedRoles}
        selectedGroups={selectedGroups}
        onGroupsChange={setSelectedGroups}
        groups={groupOptions}
        selectedStatuses={selectedStatuses}
        onStatusesChange={onStatusesChange}
        roleCounts={roleCounts}
        statusCounts={statusCounts}
      />
      <Table
        data={filteredUsers}
        columns={columns}
        getRowId={(row) => row.id ?? row.email}
        pageSize={PAGE_SIZE}
        searchTerm={searchTerm}
        emptyState={
          <IllustrationContent
            illustration={SvgNoResult}
            title={t("admin.users.noUsersFound")}
            description={t("admin.users.noUsersMatch")}
          />
        }
        footer={{
          leftExtra: (
            <Button
              icon={SvgDownload}
              prominence="tertiary"
              size="sm"
              tooltip={t("admin.users.downloadCsvTooltip")}
              aria-label={t("admin.users.downloadCsvAria")}
              onClick={() => {
                downloadUsersCsv().catch((err) => {
                  toast.error(
                    err instanceof Error
                      ? err.message
                      : t("admin.users.failedDownloadCsv")
                  );
                });
              }}
            />
          ),
        }}
      />
    </div>
  );
}
