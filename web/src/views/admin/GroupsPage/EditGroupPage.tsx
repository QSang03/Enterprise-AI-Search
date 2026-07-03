"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import useGroupMemberCandidates from "./useGroupMemberCandidates";
import { Table, Button, Divider } from "@opal/components";
import { IllustrationContent, InputHorizontal } from "@opal/layouts";
import {
  SvgUsers,
  SvgTrash,
  SvgMinusCircle,
  SvgPlusCircle,
  SvgSimpleLoader,
} from "@opal/icons";
import { markdown } from "@opal/utils";
import IconButton from "@/refresh-components/buttons/IconButton";
import Card from "@/refresh-components/cards/Card";
import SvgNoResult from "@opal/illustrations/no-result";
import { SettingsLayouts } from "@opal/layouts";
import { Section } from "@/layouts/general-layouts";
import { InputTypeIn } from "@opal/components";
import Text from "@/refresh-components/texts/Text";
import ConfirmationModalLayout from "@/refresh-components/layouts/ConfirmationModalLayout";
import { toast } from "@/hooks/useToast";
import { useTranslation } from "@/providers/LanguageProvider";
import { errorHandlingFetcher, skipRetryOnAuthError } from "@/lib/fetcher";
import type { UserGroup } from "@/lib/types";
import { useSettings } from "@/lib/settings/hooks";
import { Tier } from "@/lib/settings/types";
import { tierAtLeast } from "@/lib/tiers";
import type { MemberRow, TokenRateLimitDisplay } from "./interfaces";
import { buildBaseColumns, tc, PAGE_SIZE } from "./shared";
import {
  renameGroup,
  updateGroup,
  deleteGroup,
  updateAgentGroupSharing,
  updateDocSetGroupSharing,
  saveTokenLimits,
} from "./svc";
import { SWR_KEYS } from "@/lib/swr-keys";
import SharedGroupResources from "@/views/admin/GroupsPage/SharedGroupResources";
import TokenLimitSection from "./TokenLimitSection";
import type { TokenLimit } from "./TokenLimitSection";



// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface EditGroupPageProps {
  groupId: number;
}

function EditGroupPage({ groupId }: EditGroupPageProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const settings = useSettings();
  const isEnterpriseTier = tierAtLeast(settings.tier, Tier.ENTERPRISE);
  const tokenLimitsDisabledTooltip = markdown(
    t("admin.groups.tokenLimitsPlan")
  );

  // Fetch the group data — poll every 5s while syncing so the UI updates
  // automatically when the backend finishes processing the previous edit.
  const {
    data: groups,
    isLoading: groupLoading,
    error: groupError,
  } = useSWR<UserGroup[]>(SWR_KEYS.adminUserGroups, errorHandlingFetcher, {
    refreshInterval: (latestData) => {
      const g = latestData?.find((g) => g.id === groupId);
      return g && !g.is_up_to_date ? 5000 : 0;
    },
  });

  const group = useMemo(
    () => groups?.find((g) => g.id === groupId) ?? null,
    [groups, groupId]
  );

  const isSyncing = group != null && !group.is_up_to_date;

  // Fetch token rate limits for this group. Skip retry on tier-gated 402
  // (BUSINESS-tier tenants don't have access) so SWR doesn't churn the form
  // by repeatedly flipping its isLoading state.
  const { data: tokenRateLimits, isLoading: tokenLimitsLoading } = useSWR<
    TokenRateLimitDisplay[]
  >(
    SWR_KEYS.userGroupTokenRateLimit(groupId),
    errorHandlingFetcher,
    {
      onErrorRetry: skipRetryOnAuthError,
    }
  );

  // Form state
  const [groupName, setGroupName] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [selectedCcPairIds, setSelectedCcPairIds] = useState<number[]>([]);
  const [selectedDocSetIds, setSelectedDocSetIds] = useState<number[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<number[]>([]);
  const [tokenLimits, setTokenLimits] = useState<TokenLimit[]>([
    { tokenBudget: null, periodHours: null },
  ]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [isAddingMembers, setIsAddingMembers] = useState(false);
  const initialAgentIdsRef = useRef<number[]>([]);
  const initialDocSetIdsRef = useRef<number[]>([]);

  // Users + service accounts (curator-accessible — see hook docs).
  const {
    rows: allRows,
    isLoading: candidatesLoading,
    error: candidatesError,
  } = useGroupMemberCandidates();

  const isLoading = groupLoading || candidatesLoading || tokenLimitsLoading;
  const error = groupError ?? candidatesError;

  // Pre-populate form when group data loads
  useEffect(() => {
    if (group && !initialized) {
      setGroupName(group.name);
      setSelectedUserIds(group.users.map((u) => u.id));
      setSelectedCcPairIds(group.cc_pairs.map((cc) => cc.id));
      const docSetIds = group.document_sets.map((ds) => ds.id);
      setSelectedDocSetIds(docSetIds);
      initialDocSetIdsRef.current = docSetIds;
      const agentIds = group.personas.map((p) => p.id);
      setSelectedAgentIds(agentIds);
      initialAgentIdsRef.current = agentIds;
      setInitialized(true);
    }
  }, [group, initialized]);

  // Pre-populate token limits when fetched
  useEffect(() => {
    if (tokenRateLimits && tokenRateLimits.length > 0) {
      setTokenLimits(
        tokenRateLimits.map((trl) => ({
          tokenBudget: trl.token_budget,
          periodHours: trl.period_hours,
        }))
      );
    }
  }, [tokenRateLimits]);

  const memberRows = useMemo(() => {
    const selected = new Set(selectedUserIds);
    return allRows.filter((r) => selected.has(r.id ?? r.email));
  }, [allRows, selectedUserIds]);

  const currentRowSelection = useMemo(() => {
    const sel: Record<string, boolean> = {};
    for (const id of selectedUserIds) sel[id] = true;
    return sel;
  }, [selectedUserIds]);

  const handleRemoveMember = useCallback((userId: string) => {
    setSelectedUserIds((prev) => prev.filter((id) => id !== userId));
  }, []);

  const memberColumns = useMemo(
    () => [
      ...buildBaseColumns(t),
      tc.actions({
        showSorting: false,
        showColumnVisibility: false,
        cell: (row: MemberRow) => (
          <IconButton
            icon={SvgMinusCircle}
            tertiary
            onClick={(e) => {
              e.stopPropagation();
              handleRemoveMember(row.id ?? row.email);
            }}
          />
        ),
      }),
    ],
    [handleRemoveMember]
  );
  const addModeColumns = useMemo(
    () => [
      ...buildBaseColumns(t),
      tc.actions({ showSorting: false }),
    ],
    [t]
  );

  // IDs of members not visible in the add-mode table (e.g. inactive users).
  // We preserve these so they aren't silently removed when the table fires
  // onSelectionChange with only the visible rows.
  const hiddenMemberIds = useMemo(() => {
    const visibleIds = new Set(allRows.map((r) => r.id ?? r.email));
    return selectedUserIds.filter((id) => !visibleIds.has(id));
  }, [allRows, selectedUserIds]);

  // Guard onSelectionChange: ignore updates until the form is fully initialized.
  // Without this, TanStack fires onSelectionChange before all rows are loaded,
  // which overwrites selectedUserIds with a partial set.
  const handleSelectionChange = useCallback(
    (ids: string[]) => {
      if (!initialized) return;
      setSelectedUserIds([...ids, ...hiddenMemberIds]);
    },
    [initialized, hiddenMemberIds]
  );

  async function handleSave() {
    if (isSubmittingRef.current) return;

    const trimmed = groupName.trim();
    if (!trimmed) {
      toast.error(t("admin.groups.groupNameRequired"));
      return;
    }

    // Re-fetch group to check sync status before saving
    const freshGroups = await fetch(SWR_KEYS.adminUserGroups).then((r) =>
      r.json()
    );
    const freshGroup = freshGroups.find((g: UserGroup) => g.id === groupId);
    if (freshGroup && !freshGroup.is_up_to_date) {
      toast.error(t("admin.groups.syncingDesc"));
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      // Rename if name changed
      if (group && trimmed !== group.name) {
        await renameGroup(group.id, trimmed);
      }

      // Update members and cc_pairs
      await updateGroup(groupId, selectedUserIds, selectedCcPairIds);

      // Update agent sharing (add/remove this group from changed agents)
      await updateAgentGroupSharing(
        groupId,
        initialAgentIdsRef.current,
        selectedAgentIds
      );

      // Update document set sharing (add/remove this group from changed doc sets)
      await updateDocSetGroupSharing(
        groupId,
        initialDocSetIdsRef.current,
        selectedDocSetIds
      );

      // Save token rate limits (create/update/delete)
      await saveTokenLimits(groupId, tokenLimits, tokenRateLimits ?? []);

      // Update refs so subsequent saves diff correctly
      initialAgentIdsRef.current = selectedAgentIds;
      initialDocSetIdsRef.current = selectedDocSetIds;

      mutate(SWR_KEYS.adminUserGroups);
      mutate(SWR_KEYS.userGroupTokenRateLimit(groupId));
      toast.success(t("admin.groups.groupUpdatedSuccess", { name: trimmed }));
      router.push("/admin/groups");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("admin.groups.failedUpdateGroup"));
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteGroup(groupId);
      mutate(SWR_KEYS.adminUserGroups);
      toast.success(t("admin.groups.groupDeletedSuccess", { name: group?.name || "" }));
      router.push("/admin/groups");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("admin.groups.failedDeleteGroup"));
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  }

  // 404 state
  if (!isLoading && !error && !group) {
    return (
      <SettingsLayouts.Root>
        <SettingsLayouts.Header
          icon={SvgUsers}
          title={t("admin.groups.groupNotFoundTitle")}
          divider
        />
        <SettingsLayouts.Body>
          <IllustrationContent
            illustration={SvgNoResult}
            title={t("admin.groups.groupNotFoundTitle")}
            description={t("admin.groups.groupNotFoundDesc")}
          />
        </SettingsLayouts.Body>
      </SettingsLayouts.Root>
    );
  }

  const headerActions = (
    <Section flexDirection="row" gap={0.5} width="auto" height="auto">
      <Button
        prominence="secondary"
        onClick={() => router.push("/admin/groups")}
      >
        {t("admin.groups.cancel")}
      </Button>
      <Button
        onClick={handleSave}
        disabled={!groupName.trim() || isSubmitting || isSyncing}
        tooltip={
          isSyncing
            ? t("admin.groups.syncingTooltip")
            : undefined
        }
      >
        {isSubmitting ? t("admin.groups.saving") : isSyncing ? t("admin.groups.syncing") : t("admin.groups.saveChanges")}
      </Button>
    </Section>
  );

  return (
    <>
      <SettingsLayouts.Root>
        <SettingsLayouts.Header
          icon={SvgUsers}
          title={t("admin.groups.editGroupTitle")}
          divider
          rightChildren={headerActions}
        />

        <SettingsLayouts.Body>
          {isLoading && <SvgSimpleLoader />}

          {error && (
            <Text as="p" secondaryBody text03>
              {t("admin.groups.failedLoadGroup")}
            </Text>
          )}

          {!isLoading && !error && group && (
            <>
              {/* Group Name */}
              <Section
                gap={0.5}
                height="auto"
                alignItems="stretch"
                justifyContent="start"
              >
                <Text mainUiBody text04>
                  {t("admin.groups.groupNameLabel")}
                </Text>
                <InputTypeIn
                  placeholder={t("admin.groups.groupNamePlaceholder")}
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </Section>

              <Divider paddingParallel="fit" paddingPerpendicular="fit" />

              {/* Members table */}
              <Section
                gap={0.75}
                height="auto"
                alignItems="stretch"
                justifyContent="start"
              >
                <Section
                  flexDirection="row"
                  gap={0.5}
                  height="auto"
                  alignItems="center"
                  justifyContent="start"
                >
                  <InputTypeIn
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={
                      isAddingMembers
                        ? t("admin.groups.searchUsersPlaceholder")
                        : t("admin.groups.searchMembersPlaceholder")
                    }
                    searchIcon
                  />
                  {isAddingMembers ? (
                    <Button
                      prominence="secondary"
                      onClick={() => setIsAddingMembers(false)}
                    >
                      {t("admin.groups.done")}
                    </Button>
                  ) : (
                    <Button
                      prominence="tertiary"
                      icon={SvgPlusCircle}
                      onClick={() => setIsAddingMembers(true)}
                    >
                      {t("admin.groups.add")}
                    </Button>
                  )}
                </Section>

                {isAddingMembers ? (
                  <Table
                    key="add-members"
                    data={allRows as MemberRow[]}
                    columns={addModeColumns}
                    getRowId={(row) => row.id ?? row.email}
                    pageSize={PAGE_SIZE}
                    searchTerm={searchTerm}
                    selectionBehavior="multi-select"
                    initialRowSelection={currentRowSelection}
                    onSelectionChange={handleSelectionChange}
                    footer={{}}
                    emptyState={
                      <IllustrationContent
                        illustration={SvgNoResult}
                        title={t("admin.groups.noUsersFound")}
                        description={t("admin.groups.noUsersMatch")}
                      />
                    }
                  />
                ) : (
                  <Table
                    data={memberRows}
                    columns={memberColumns}
                    getRowId={(row) => row.id ?? row.email}
                    pageSize={PAGE_SIZE}
                    searchTerm={searchTerm}
                    footer={{}}
                    emptyState={
                      <IllustrationContent
                        illustration={SvgNoResult}
                        title={t("admin.groups.noMembers")}
                        description={t("admin.groups.addMembersDesc")}
                      />
                    }
                  />
                )}
              </Section>

              <SharedGroupResources
                selectedCcPairIds={selectedCcPairIds}
                onCcPairIdsChange={setSelectedCcPairIds}
                selectedDocSetIds={selectedDocSetIds}
                onDocSetIdsChange={setSelectedDocSetIds}
                selectedAgentIds={selectedAgentIds}
                onAgentIdsChange={setSelectedAgentIds}
              />

              <TokenLimitSection
                limits={tokenLimits}
                onLimitsChange={setTokenLimits}
                disabled={false}
              />

              {/* Delete This Group */}
              <Card>
                <InputHorizontal
                  title={t("admin.groups.deleteGroupTitle")}
                  description={t("admin.groups.deleteGroupDesc")}
                  center
                >
                  <Button
                    variant="danger"
                    prominence="secondary"
                    icon={SvgTrash}
                    onClick={() => setShowDeleteModal(true)}
                  >
                    {t("admin.groups.deleteGroupBtn")}
                  </Button>
                </InputHorizontal>
              </Card>
            </>
          )}
        </SettingsLayouts.Body>
      </SettingsLayouts.Root>

      {showDeleteModal && (
        <ConfirmationModalLayout
          icon={SvgTrash}
          title={t("admin.groups.deleteGroupTitle")}
          onClose={() => setShowDeleteModal(false)}
          submit={
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? t("admin.groups.deleting") : t("admin.groups.delete")}
            </Button>
          }
        >
          <Text as="p" text03>
            {t("admin.groups.deleteGroupConfirm", { name: group?.name || "" })}
          </Text>
        </ConfirmationModalLayout>
      )}
    </>
  );
}

export default EditGroupPage;
