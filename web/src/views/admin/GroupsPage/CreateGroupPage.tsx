"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Table, Button, Divider } from "@opal/components";
import { IllustrationContent } from "@opal/layouts";
import { SvgUsers, SvgSimpleLoader } from "@opal/icons";
import SvgNoResult from "@opal/illustrations/no-result";
import { SettingsLayouts } from "@opal/layouts";
import { Section } from "@/layouts/general-layouts";
import { InputTypeIn } from "@opal/components";
import Text from "@/refresh-components/texts/Text";
import { toast } from "@/hooks/useToast";
import { useTranslation } from "@/providers/LanguageProvider";
import useGroupMemberCandidates from "./useGroupMemberCandidates";
import {
  createGroup,
  updateAgentGroupSharing,
  updateDocSetGroupSharing,
  saveTokenLimits,
} from "./svc";
import { buildBaseColumns, PAGE_SIZE, tc } from "./shared";
import SharedGroupResources from "@/views/admin/GroupsPage/SharedGroupResources";
import TokenLimitSection from "./TokenLimitSection";
import type { TokenLimit } from "./TokenLimitSection";

function CreateGroupPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [groupName, setGroupName] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCcPairIds, setSelectedCcPairIds] = useState<number[]>([]);
  const [selectedDocSetIds, setSelectedDocSetIds] = useState<number[]>([]);
  const [selectedAgentIds, setSelectedAgentIds] = useState<number[]>([]);
  const [tokenLimits, setTokenLimits] = useState<TokenLimit[]>([
    { tokenBudget: null, periodHours: null },
  ]);

  const { t: tHook } = useTranslation();
  const { rows: allRows, isLoading, error } = useGroupMemberCandidates();
  const memberTableColumns = useMemo(() => [
    ...buildBaseColumns(tHook),
    tc.actions({ showSorting: false }),
  ], [tHook]);

  async function handleCreate() {
    const trimmed = groupName.trim();
    if (!trimmed) {
      toast.error(t("admin.groups.groupNameRequired"));
      return;
    }

    setIsSubmitting(true);
    try {
      const groupId = await createGroup(
        trimmed,
        selectedUserIds,
        selectedCcPairIds
      );
      await updateAgentGroupSharing(groupId, [], selectedAgentIds);
      await updateDocSetGroupSharing(groupId, [], selectedDocSetIds);
      await saveTokenLimits(groupId, tokenLimits, []);
      toast.success(t("admin.groups.groupCreatedSuccess", { name: trimmed }));
      router.push("/admin/groups");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("admin.groups.failedCreateGroup"));
    } finally {
      setIsSubmitting(false);
    }
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
        onClick={handleCreate}
        disabled={!groupName.trim() || isSubmitting}
      >
        {t("admin.groups.create")}
      </Button>
    </Section>
  );

  return (
    <SettingsLayouts.Root>
      <SettingsLayouts.Header
        icon={SvgUsers}
        title={t("admin.groups.createGroupTitle")}
        divider
        rightChildren={headerActions}
      />

      <SettingsLayouts.Body>
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
        {isLoading && <SvgSimpleLoader />}

        {error ? (
          <Text as="p" secondaryBody text03>
            {t("admin.groups.failedLoadUsers")}
          </Text>
        ) : null}

        {!isLoading && !error && (
          <Section
            gap={0.75}
            height="auto"
            alignItems="stretch"
            justifyContent="start"
          >
            <InputTypeIn
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t("admin.groups.searchUsersPlaceholder")}
              searchIcon
            />
            <Table
              data={allRows}
              columns={memberTableColumns}
              getRowId={(row) => row.id ?? row.email}
              pageSize={PAGE_SIZE}
              searchTerm={searchTerm}
              selectionBehavior="multi-select"
              onSelectionChange={setSelectedUserIds}
              footer={{}}
              emptyState={
                <IllustrationContent
                  illustration={SvgNoResult}
                  title={t("admin.groups.noUsersFound")}
                  description={t("admin.groups.noUsersMatch")}
                />
              }
            />
          </Section>
        )}
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
        />
      </SettingsLayouts.Body>
    </SettingsLayouts.Root>
  );
}

export default CreateGroupPage;
