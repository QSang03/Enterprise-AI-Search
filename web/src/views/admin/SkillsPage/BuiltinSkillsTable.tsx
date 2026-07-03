"use client";

import { useMemo } from "react";
import { Table, Tag, createTableColumns } from "@opal/components";
import { Content } from "@opal/layouts";
import { SvgBlocks } from "@opal/icons";
import Text from "@/refresh-components/texts/Text";
import Truncated from "@/refresh-components/texts/Truncated";
import type { BuiltinSkill } from "@/views/admin/SkillsPage/interfaces";
import { useTranslation } from "@/providers/LanguageProvider";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface BuiltinSkillsTableProps {
  skills: BuiltinSkill[];
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

const tc = createTableColumns<BuiltinSkill>();

function buildColumns(t: any) {
  return [
    tc.qualifier({
      content: "icon",
      background: true,
      getContent: () => SvgBlocks,
    }),
    tc.column("name", {
      header: t("admin.skills.columnName"),
      weight: 22,
      cell: (value, row) => (
        <Content
          sizePreset="main-ui"
          variant="section"
          title={value}
          description={row.slug}
        />
      ),
    }),
    tc.column("description", {
      header: t("admin.skills.columnDescription"),
      weight: 50,
      cell: (value) => (
        <Truncated mainUiBody text03>
          {value}
        </Truncated>
      ),
    }),
    tc.column("is_available", {
      header: t("admin.skills.columnStatus"),
      weight: 28,
      cell: (isAvailable, row) =>
        isAvailable ? (
          <Tag title={t("admin.skills.statusAvailable")} color="green" />
        ) : (
          <div className="flex flex-col gap-0.5">
            <Tag title={t("admin.skills.statusUnavailable")} color="amber" />
            {row.unavailable_reason && (
              <Text as="span" secondaryBody text03>
                {row.unavailable_reason}
              </Text>
            )}
          </div>
        ),
    }),
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BuiltinSkillsTable({
  skills,
}: BuiltinSkillsTableProps) {
  const { t } = useTranslation();
  const columns = useMemo(() => buildColumns(t), [t]);

  return (
    <Table
      data={skills}
      columns={columns}
      getRowId={(row) => row.slug}
      pageSize={DEFAULT_PAGE_SIZE}
    />
  );
}
