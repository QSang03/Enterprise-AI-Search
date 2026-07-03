"use client";

import { SvgOnyxOctagon, SvgPlus } from "@opal/icons";
import { Button } from "@opal/components";
import { SettingsLayouts } from "@opal/layouts";
import { useTranslation } from "@/providers/LanguageProvider";
import Link from "next/link";

import AgentsTable from "./AgentsPage/AgentsTable";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgentsPage() {
  const { t } = useTranslation();

  return (
    <SettingsLayouts.Root>
      <SettingsLayouts.Header
        title={t("admin.agents.title")}
        description={t("admin.agents.description")}
        icon={SvgOnyxOctagon}
        rightChildren={
          <Button href="/app/agents/create?admin=true" icon={SvgPlus}>
            {t("admin.agents.newAgent")}
          </Button>
        }
      />
      <SettingsLayouts.Body>
        <AgentsTable />
      </SettingsLayouts.Body>
    </SettingsLayouts.Root>
  );
}
