"use client";

import { useMemo, useState } from "react";
import { Table, createTableColumns } from "@opal/components";
import { Content, IllustrationContent } from "@opal/layouts";
import SvgNoResult from "@opal/illustrations/no-result";
import Text from "@/refresh-components/texts/Text";
import { PageLoader } from "@/refresh-components/PageLoader";
import { InputTypeIn } from "@opal/components";
import type { MinimalUserSnapshot } from "@/lib/types";
import AgentAvatar from "@/refresh-components/avatars/AgentAvatar";
import type { MinimalAgent, Agent } from "@/lib/agents/types";
import { useAdminAgents } from "@/lib/agents/hooks";
import { toast } from "@/hooks/useToast";
import AgentRowActions from "@/views/admin/AgentsPage/AgentRowActions";
import { updateAgentDisplayPriorities } from "@/lib/agents/svc";
import { SvgUser } from "@opal/icons";
import { useTranslation } from "@/providers/LanguageProvider";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { Section } from "@/layouts/general-layouts";
import { useAgentsFilters } from "@/sections/agents/AgentsFilters";

// ---------------------------------------------------------------------------
// Column renderers
// ---------------------------------------------------------------------------

function renderCreatedByColumn(_value: MinimalUserSnapshot | null, row: Agent, t: any) {
  return (
    <Content
      sizePreset="main-ui"
      variant="section"
      icon={SvgUser}
      title={row.builtin_persona ? t("admin.agents.system") : (row.owner?.email ?? "—")}
    />
  );
}

function getAccessTitle(row: Agent, t: any): string {
  if (row.is_public) return t("admin.agents.public");
  // Group ownership counts as shared even with an empty share list
  if (row.groups.length > 0 || row.users.length > 0 || row.owner_group) {
    return t("admin.agents.shared");
  }
  return t("admin.agents.private");
}

function renderAccessColumn(_isPublic: boolean, row: Agent, t: any) {
  return (
    <Content
      sizePreset="main-ui"
      variant="section"
      title={getAccessTitle(row, t)}
      description={
        !row.is_listed ? t("admin.agents.unlisted") : row.is_featured ? t("admin.agents.featured") : undefined
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

const tc = createTableColumns<Agent>();

function buildColumns(onMutate: () => void, t: any) {
  return [
    tc.qualifier({
      content: "icon",
      background: true,
      getContent: (row) => (props) => (
        <AgentAvatar agent={row as unknown as MinimalAgent} size={props.size} />
      ),
    }),
    tc.column("name", {
      header: t("admin.agents.columnName"),
      weight: 25,
      cell: (value) => (
        <Text as="span" mainUiBody text05>
          {value}
        </Text>
      ),
    }),
    tc.column("description", {
      header: t("admin.agents.columnDescription"),
      weight: 35,
      cell: (value) => (
        <Text as="span" mainUiBody text03>
          {value || "—"}
        </Text>
      ),
    }),
    tc.column("owner", {
      header: t("admin.agents.columnCreatedBy"),
      weight: 20,
      cell: (val, row) => renderCreatedByColumn(val, row, t),
    }),
    tc.column("is_public", {
      header: t("admin.agents.columnAccess"),
      weight: 12,
      cell: (val, row) => renderAccessColumn(val, row, t),
    }),
    tc.actions({
      cell: (row) => <AgentRowActions agent={row} onMutate={onMutate} />,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AgentsTable() {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");

  const { agents, isLoading, refresh } = useAdminAgents();

  const columns = useMemo(() => buildColumns(refresh, t), [refresh, t]);

  const nonBuiltinAgents = useMemo(
    () => agents.filter((p) => !p.builtin_persona),
    [agents]
  );

  const { filtered: filteredAgents, filterBar } =
    useAgentsFilters(nonBuiltinAgents);

  async function handleReorder(
    _orderedIds: string[],
    changedOrders: Record<string, number>
  ) {
    try {
      await updateAgentDisplayPriorities(changedOrders);
      refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("admin.agents.failedUpdateOrder")
      );
      refresh();
    }
  }

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <div className="flex flex-col">
      <Section gap={0.5}>
        <InputTypeIn
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t("admin.agents.searchPlaceholder")}
          searchIcon
        />
        <Section gap={0.25} flexDirection="row" justifyContent="start">
          {filterBar}
        </Section>
      </Section>
      <Table
        data={filteredAgents}
        columns={columns}
        getRowId={(row) => String(row.id)}
        pageSize={DEFAULT_PAGE_SIZE}
        searchTerm={searchTerm}
        draggable={{
          onReorder: handleReorder,
        }}
        emptyState={
          <IllustrationContent
            illustration={SvgNoResult}
            title={t("admin.agents.noAgentsFound")}
            description={t("admin.agents.noAgentsMatch")}
          />
        }
        footer={{}}
      />
    </div>
  );
}
