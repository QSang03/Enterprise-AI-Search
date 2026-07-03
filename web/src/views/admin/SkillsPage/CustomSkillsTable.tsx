"use client";

import { useMemo, useState } from "react";
import { Table, createTableColumns } from "@opal/components";
import { Content, IllustrationContent } from "@opal/layouts";
import { SvgBlocks, SvgUser } from "@opal/icons";
import SvgNoResult from "@opal/illustrations/no-result";
import Text from "@/refresh-components/texts/Text";
import Truncated from "@/refresh-components/texts/Truncated";
import { InputTypeIn } from "@opal/components";
import type { CustomSkill } from "@/views/admin/SkillsPage/interfaces";
import { useTranslation } from "@/providers/LanguageProvider";
import { summarizeVisibility } from "@/views/admin/SkillsPage/helpers";
import { Section } from "@/layouts/general-layouts";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import CustomSkillRowActions from "@/views/admin/SkillsPage/CustomSkillRowActions";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CustomSkillsTableProps {
  skills: CustomSkill[];
  onShareSkill: (skill: CustomSkill) => void;
  onReplaceBundle: (skill: CustomSkill) => void;
  onToggleEnabled: (skill: CustomSkill) => void;
  onDeleteSkill: (skill: CustomSkill) => void;
}

// ---------------------------------------------------------------------------
// Column renderers
// ---------------------------------------------------------------------------

function renderCreatedByColumn(value: string | null) {
  return (
    <Content
      sizePreset="main-ui"
      variant="section"
      icon={SvgUser}
      title={value ?? "—"}
    />
  );
}

function renderAccessColumn(_value: boolean, row: CustomSkill, t: any) {
  const summary = summarizeVisibility(row);
  let translatedLabel = summary.label;
  if (summary.label === "Personal") translatedLabel = t("admin.skills.accessPersonal");
  else if (summary.label === "Private") translatedLabel = t("admin.skills.accessPrivate");
  else if (summary.label === "Groups") translatedLabel = t("admin.skills.accessGroups");
  else if (summary.label === "Org-wide") translatedLabel = t("admin.skills.accessOrgWide");

  let translatedDesc = summary.description;
  if (summary.label === "Groups" && row.granted_group_ids.length > 0) {
    const n = row.granted_group_ids.length;
    translatedDesc = n === 1 ? t("admin.skills.groupCountSingle") : t("admin.skills.groupCountMulti", { count: n });
  }
  return (
    <Content
      sizePreset="main-ui"
      variant="section"
      title={translatedLabel}
      description={!row.enabled ? t("admin.skills.statusDisabled") : translatedDesc}
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CustomSkillsTable({
  skills,
  onShareSkill,
  onReplaceBundle,
  onToggleEnabled,
  onDeleteSkill,
}: CustomSkillsTableProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");

  const sortedSkills = useMemo(() => {
    // Group order: org-wide, then group-granted, then personal;
    // alphabetical by name within each group.
    const groupRank = (skill: CustomSkill): number => {
      if (skill.is_public) return 0;
      if (skill.is_personal) return 2;
      return 1;
    };
    return [...skills].sort(
      (a, b) =>
        groupRank(a) - groupRank(b) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
  }, [skills]);

  const columns = useMemo(() => {
    const tc = createTableColumns<CustomSkill>();

    return [
      tc.qualifier({
        content: "icon",
        background: true,
        getContent: () => SvgBlocks,
      }),
      tc.column("name", {
        header: t("admin.skills.columnName"),
        weight: 25,
        cell: (value) => (
          <Text as="span" mainUiBody text05>
            {value}
          </Text>
        ),
      }),
      tc.column("description", {
        header: t("admin.skills.columnDescription"),
        weight: 35,
        cell: (value) => (
          <Truncated mainUiBody text03>
            {value || "—"}
          </Truncated>
        ),
      }),
      tc.column("author_email", {
        header: t("admin.skills.columnCreatedBy"),
        weight: 20,
        cell: renderCreatedByColumn,
      }),
      tc.column("is_public", {
        header: t("admin.skills.columnAccess"),
        weight: 12,
        cell: (val, row) => renderAccessColumn(val, row, t),
      }),
      tc.actions({
        cell: (row) => (
          <CustomSkillRowActions
            skill={row}
            onShare={() => onShareSkill(row)}
            onReplaceBundle={() => onReplaceBundle(row)}
            onToggleEnabled={() => onToggleEnabled(row)}
            onDelete={() => onDeleteSkill(row)}
          />
        ),
      }),
    ];
  }, [onShareSkill, onReplaceBundle, onToggleEnabled, onDeleteSkill]);

  return (
    <Section gap={0.75} alignItems="stretch">
      <InputTypeIn
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder={t("skills.searchPlaceholder")}
        searchIcon
      />
      <Table
        data={sortedSkills}
        columns={columns}
        getRowId={(row) => row.id}
        pageSize={DEFAULT_PAGE_SIZE}
        searchTerm={searchTerm}
        emptyState={
          <IllustrationContent
            illustration={SvgNoResult}
            title={t("admin.skills.noSkillsFound")}
            description={t("admin.skills.uploadToGetStarted")}
          />
        }
        footer={{}}
      />
    </Section>
  );
}
