"use client";

import { useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { errorHandlingFetcher } from "@/lib/fetcher";
import { SWR_KEYS } from "@/lib/swr-keys";
import { SettingsLayouts } from "@opal/layouts";
import { useTranslation } from "@/providers/LanguageProvider";
import { toast } from "@/hooks/useToast";
import { Button, MessageCard, Text } from "@opal/components";
import { Content, IllustrationContent } from "@opal/layouts";
import SvgNoResult from "@opal/illustrations/no-result";
import {
  SvgDownload,
  SvgKey,
  SvgMoreHorizontal,
  SvgRefreshCw,
  SvgTrash,
  SvgUserEdit,
  SvgUserKey,
  SvgUsers,
  SvgSimpleLoader,
} from "@opal/icons";
import { USER_ROLE_LABELS, UserRole } from "@/lib/types";
import { ADMIN_ROUTES } from "@/lib/admin-routes";
import InputSelect from "@/refresh-components/inputs/InputSelect";
import AdminListHeader from "@/sections/admin/AdminListHeader";
import Modal, { BasicModalFooter } from "@/refresh-components/Modal";
import { Code } from "@opal/components";
import { Popover, PopoverMenu } from "@opal/components";
import LineItem from "@/refresh-components/buttons/LineItem";
import ConfirmationModalLayout from "@/refresh-components/layouts/ConfirmationModalLayout";
import { markdown } from "@opal/utils";


import {
  deleteApiKey,
  regenerateApiKey,
  updateApiKey,
} from "@/views/admin/ServiceAccountsPage/svc";
import type { APIKey } from "@/views/admin/ServiceAccountsPage/interfaces";
import {
  DISCORD_SERVICE_API_KEY_NAME,
  SERVICE_ACCOUNT_ROLE_OPTIONS,
} from "@/views/admin/ServiceAccountsPage/interfaces";
import ApiKeyFormModal from "@/views/admin/ServiceAccountsPage/ApiKeyFormModal";
import EditServiceAccountModal from "@/views/admin/ServiceAccountsPage/EditServiceAccountModal";
import { Table } from "@opal/components";
import { createTableColumns } from "@opal/components/table/columns";
import { Section } from "@/layouts/general-layouts";

const API_KEY_SWR_KEY = SWR_KEYS.adminApiKeys;
const route = ADMIN_ROUTES.API_KEYS;

const tc = createTableColumns<APIKey>();

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ServiceAccountsPage() {
  const { t } = useTranslation();
  const {
    data: apiKeys,
    isLoading,
    error,
  } = useSWR<APIKey[]>(API_KEY_SWR_KEY, errorHandlingFetcher);


  const isTrialing = false;


  const [fullApiKey, setFullApiKey] = useState<string | null>(null);
  const [showCreateUpdateForm, setShowCreateUpdateForm] = useState(false);
  const [selectedApiKey, setSelectedApiKey] = useState<APIKey | undefined>();
  const [search, setSearch] = useState("");
  const [regenerateTarget, setRegenerateTarget] = useState<APIKey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<APIKey | null>(null);
  const [groupsRolesTarget, setGroupsRolesTarget] = useState<APIKey | null>(
    null
  );

  const visibleApiKeys = (apiKeys ?? []).filter(
    (key) => key.api_key_name !== DISCORD_SERVICE_API_KEY_NAME
  );

  const filteredApiKeys = visibleApiKeys.filter(
    (key) =>
      !search ||
      (key.api_key_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      key.api_key_display.toLowerCase().includes(search.toLowerCase())
  );

  const handleRoleChange = async (apiKey: APIKey, newRole: UserRole) => {
    try {
      const response = await updateApiKey(apiKey.api_key_id, {
        name: apiKey.api_key_name ?? undefined,
        role: newRole,
      });
      if (!response.ok) {
        const errorMsg = await response.text();
        toast.error(`${t("admin.serviceAccounts.toastFailedUpdateRole")} ${errorMsg}`);
        return;
      }
      mutate(API_KEY_SWR_KEY);
      toast.success(t("admin.serviceAccounts.toastRoleUpdated"));
    } catch {
      toast.error(t("admin.serviceAccounts.toastFailedUpdateRole"));
    }
  };

  const handleRegenerate = async (apiKey: APIKey) => {
    try {
      const response = await regenerateApiKey(apiKey);
      if (!response.ok) {
        const errorMsg = await response.text();
        toast.error(`${t("admin.serviceAccounts.toastFailedRegenerate")} ${errorMsg}`);
        return;
      }
      const newKey = (await response.json()) as APIKey;
      setFullApiKey(newKey.api_key);
      mutate(API_KEY_SWR_KEY);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t("admin.serviceAccounts.toastFailedRegenerate")
      );
    }
  };

  const handleDelete = async (apiKey: APIKey) => {
    try {
      const response = await deleteApiKey(apiKey.api_key_id);
      if (!response.ok) {
        const errorMsg = await response.text();
        toast.error(`${t("admin.serviceAccounts.toastFailedDelete")} ${errorMsg}`);
        return;
      }
      mutate(API_KEY_SWR_KEY);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("admin.serviceAccounts.toastFailedDelete"));
    }
  };

  const columns = useMemo(
    () => [
      tc.qualifier({
        content: "icon",
        getContent: () => SvgUserKey,
      }),
      tc.column("api_key_name", {
        header: t("admin.serviceAccounts.columnName"),
        weight: 25,
        cell: (value) => (
          <Content
            title={value || t("admin.serviceAccounts.unnamed")}
            sizePreset="main-ui"
            variant="body"
          />
        ),
      }),
      tc.column("api_key_display", {
        header: t("admin.serviceAccounts.columnApiKey"),
        weight: 30,
        cell: (value) => (
          <Text font="secondary-mono" color="text-03">
            {value}
          </Text>
        ),
      }),
      tc.displayColumn({
        id: "account_type",
        header: t("admin.serviceAccounts.columnAccountType"),
        width: { weight: 25, minWidth: 160 },
        cell: (row) => (
          <InputSelect
            value={row.api_key_role}
            onValueChange={(value) => handleRoleChange(row, value as UserRole)}
          >
            <InputSelect.Trigger />
            <InputSelect.Content>
              {SERVICE_ACCOUNT_ROLE_OPTIONS.map((opt) => (
                <InputSelect.Item
                  key={opt.role}
                  value={opt.role.toString()}
                  icon={opt.icon}
                  description={opt.role === UserRole.ADMIN ? t("admin.serviceAccounts.roleAdminDesc") : opt.role === UserRole.BASIC ? t("admin.serviceAccounts.roleBasicDesc") : t("admin.serviceAccounts.roleLimitedDesc")}
                >
                  {USER_ROLE_LABELS[opt.role]}
                </InputSelect.Item>
              ))}
            </InputSelect.Content>
          </InputSelect>
        ),
      }),
      tc.actions({
        cell: (row) => (
          <div className="flex flex-row gap-1">
            <Button
              icon={SvgRefreshCw}
              prominence="tertiary"
              tooltip={t("admin.serviceAccounts.regenerateTitle")}
              onClick={() => setRegenerateTarget(row)}
            />
            <Popover>
              <Popover.Trigger asChild>
                <Button
                  icon={SvgMoreHorizontal}
                  prominence="tertiary"
                  tooltip={t("common.more")}
                />
              </Popover.Trigger>
              <Popover.Content side="bottom" align="end" width="md">
                <PopoverMenu>
                  <LineItem
                    icon={SvgUsers}
                    onClick={() => setGroupsRolesTarget(row)}
                  >
                    {t("admin.users.groupsAndRoles")}
                  </LineItem>
                  <LineItem
                    icon={SvgUserEdit}
                    onClick={() => {
                      setSelectedApiKey(row);
                      setShowCreateUpdateForm(true);
                    }}
                  >
                    {t("admin.users.editUserTitle")}
                  </LineItem>
                  <LineItem
                    icon={SvgTrash}
                    danger
                    onClick={() => setDeleteTarget(row)}
                  >
                    {t("admin.users.deleteUser")}
                  </LineItem>
                </PopoverMenu>
              </Popover.Content>
            </Popover>
          </div>
        ),
      }),
    ],
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (error) {
    return (
      <SettingsLayouts.Root>
        <SettingsLayouts.Header
          title={t("admin.serviceAccounts.title")}
          icon={route.icon}
          description={t("admin.serviceAccounts.headerDesc")}
          divider
        />
        <SettingsLayouts.Body>
          <IllustrationContent
            illustration={SvgNoResult}
            title={t("admin.serviceAccounts.failedLoad")}
            description={t("admin.serviceAccounts.checkConsole")}
          />
        </SettingsLayouts.Body>
      </SettingsLayouts.Root>
    );
  }

  if (isLoading) {
    return (
      <SettingsLayouts.Root>
        <SettingsLayouts.Header
          title={t("admin.serviceAccounts.title")}
          icon={route.icon}
          description={t("admin.serviceAccounts.headerDesc")}
          divider
        />
        <SettingsLayouts.Body>
          <SvgSimpleLoader />
        </SettingsLayouts.Body>
      </SettingsLayouts.Root>
    );
  }

  const hasKeys = visibleApiKeys.length > 0;

  return (
    <SettingsLayouts.Root>
      <SettingsLayouts.Header
        title={t("admin.serviceAccounts.title")}
        icon={route.icon}
        description={t("admin.serviceAccounts.headerDesc")}
        divider
      />

      <SettingsLayouts.Body>
        {isTrialing && (
          <MessageCard
            variant="warning"
            title={t("admin.serviceAccounts.upgradeTitle")}
            description={t("admin.serviceAccounts.upgradeDesc")}
          />
        )}

        <div className="flex flex-col">
          <AdminListHeader
            hasItems={hasKeys}
            searchQuery={search}
            onSearchQueryChange={setSearch}
            placeholder={t("admin.serviceAccounts.searchPlaceholder")}
            emptyStateText={t("admin.serviceAccounts.emptyStateText")}
            onAction={() => {
              setSelectedApiKey(undefined);
              setShowCreateUpdateForm(true);
            }}
            actionLabel={t("admin.serviceAccounts.newServiceAccount")}
          />

          {hasKeys && (
            <Table
              data={filteredApiKeys}
              getRowId={(row) => String(row.api_key_id)}
              columns={columns}
              searchTerm={search}
            />
          )}
        </div>
      </SettingsLayouts.Body>

      <Modal open={!!fullApiKey}>
        <Modal.Content width="sm" height="sm">
          <Modal.Header
            title={t("admin.serviceAccounts.apiKeyTitle")}
            icon={SvgKey}
            onClose={() => setFullApiKey(null)}
            description={t("admin.serviceAccounts.apiKeyModalDesc")}
          />
          <Modal.Body>
            <Code showCopyButton={false}>{fullApiKey ?? ""}</Code>
          </Modal.Body>
          <Modal.Footer>
            <BasicModalFooter
              left={
                <Button
                  prominence="secondary"
                  icon={SvgDownload}
                  onClick={() => {
                    if (!fullApiKey) return;
                    const blob = new Blob([fullApiKey], {
                      type: "text/plain",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "onyx-api-key.txt";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  {t("admin.serviceAccounts.download")}
                </Button>
              }
              submit={
                // TODO(@raunakab): Create an opalified copy-button and replace it here
                <Button
                  onClick={() => {
                    if (fullApiKey) {
                      navigator.clipboard.writeText(fullApiKey);
                      toast.success(t("admin.serviceAccounts.apiKeyCopied"));
                    }
                  }}
                >
                  {t("admin.serviceAccounts.copyApiKey")}
                </Button>
              }
            />
          </Modal.Footer>
        </Modal.Content>
      </Modal>

      {showCreateUpdateForm && (
        <ApiKeyFormModal
          onCreateApiKey={(apiKey) => {
            setFullApiKey(apiKey.api_key);
          }}
          onClose={() => {
            setShowCreateUpdateForm(false);
            setSelectedApiKey(undefined);
            mutate(API_KEY_SWR_KEY);
          }}
          apiKey={selectedApiKey}
        />
      )}

      {groupsRolesTarget && (
        <EditServiceAccountModal
          apiKey={groupsRolesTarget}
          onClose={() => setGroupsRolesTarget(null)}
          onMutate={() => mutate(API_KEY_SWR_KEY)}
        />
      )}

      {regenerateTarget && (
        <ConfirmationModalLayout
          icon={SvgRefreshCw}
          title={t("admin.serviceAccounts.regenerateTitle")}
          onClose={() => setRegenerateTarget(null)}
          submit={
            <Button
              variant="danger"
              onClick={async () => {
                const target = regenerateTarget;
                setRegenerateTarget(null);
                await handleRegenerate(target);
              }}
            >
              {t("admin.serviceAccounts.regenerateBtn")}
            </Button>
          }
        >
          <Text as="p" color="text-03">
            {markdown(
              t("admin.serviceAccounts.regenerateConfirmDesc", { 
                name: regenerateTarget.api_key_name || t("admin.serviceAccounts.unnamed"),
                display: regenerateTarget.api_key_display
              })
            )}
          </Text>
        </ConfirmationModalLayout>
      )}

      {deleteTarget && (
        <ConfirmationModalLayout
          icon={SvgTrash}
          title={t("admin.users.deleteUser")}
          onClose={() => setDeleteTarget(null)}
          submit={
            <Button
              variant="danger"
              onClick={async () => {
                await handleDelete(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              {t("admin.serviceAccounts.deleteBtn")}
            </Button>
          }
        >
          <Section alignItems="start" gap={0.5}>
            <Text as="p" color="text-03">
              {markdown(
                t("admin.serviceAccounts.deleteConfirmDesc", { 
                  name: deleteTarget.api_key_name || t("admin.serviceAccounts.unnamed"),
                  display: deleteTarget.api_key_display
                })
              )}
            </Text>
            <Text as="p" color="text-03">
              {t("admin.serviceAccounts.cannotBeUndone")}
            </Text>
          </Section>
        </ConfirmationModalLayout>
      )}
    </SettingsLayouts.Root>
  );
}
