"use client";

import { useRef, useState } from "react";
import { Button, MessageCard } from "@opal/components";
import { IllustrationContent } from "@opal/layouts";
import SvgNoResult from "@opal/illustrations/no-result";
import { SvgArrowLeft, SvgBlocks, SvgPlus, SvgSimpleLoader } from "@opal/icons";
import { SettingsLayouts } from "@opal/layouts";
import { Section } from "@/layouts/general-layouts";
import Text from "@/refresh-components/texts/Text";
import { toast } from "@/hooks/useToast";
import useAdminSkills from "@/hooks/useAdminSkills";
import { useTranslation } from "@/providers/LanguageProvider";
import BuiltinSkillsTable from "@/views/admin/SkillsPage/BuiltinSkillsTable";
import CustomSkillsTable from "@/views/admin/SkillsPage/CustomSkillsTable";
import UploadSkillModal from "@/views/admin/SkillsPage/UploadSkillModal";
import ShareSkillModal from "@/views/admin/SkillsPage/ShareSkillModal";
import {
  deleteCustomSkill,
  patchCustomSkill,
  replaceCustomSkillBundle,
} from "@/lib/skills/api";
import type { CustomSkill } from "@/views/admin/SkillsPage/interfaces";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface SkillsPageProps {
  onBack?: () => void;
}

export default function SkillsPage({ onBack }: SkillsPageProps = {}) {
  const { t } = useTranslation();
  const { data, error, isLoading, refresh } = useAdminSkills();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [shareTarget, setShareTarget] = useState<CustomSkill | null>(null);
  const replaceBundleTarget = useRef<CustomSkill | null>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);

  async function handleToggleEnabled(skill: CustomSkill) {
    try {
      await patchCustomSkill(skill.id, { enabled: !skill.enabled });
      toast.success(
        t(skill.enabled ? "admin.skills.disabledSuccess" : "admin.skills.enabledSuccess", { name: skill.name })
      );
      refresh();
    } catch (err) {
      console.error("Failed to update skill enabled state", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to update skill"
      );
    }
  }

  async function handleDelete(skill: CustomSkill) {
    try {
      await deleteCustomSkill(skill.id);
      toast.success(t("admin.skills.deleteSuccess", { name: skill.name }));
      refresh();
    } catch (err) {
      console.error("Failed to delete skill", err);
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  function handleReplaceBundleClick(skill: CustomSkill) {
    replaceBundleTarget.current = skill;
    replaceFileRef.current?.click();
  }

  async function handleReplaceBundleFile(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const target = replaceBundleTarget.current;
    const file = event.target.files?.[0];
    event.target.value = "";
    replaceBundleTarget.current = null;
    if (!target || !file) return;

    try {
      await replaceCustomSkillBundle(target.id, file);
      toast.success(t("admin.skills.replaceSuccess", { name: target.name }));
      refresh();
    } catch (err) {
      console.error("Failed to replace skill bundle", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to replace bundle"
      );
    }
  }

  return (
    <SettingsLayouts.Root>
      <SettingsLayouts.Header
        icon={SvgBlocks}
        title={t("admin.skills.title")}
        description={t("admin.skills.description")}
        rightChildren={
          onBack ? (
            <div className="flex items-center gap-2">
              <Button
                prominence="secondary"
                icon={SvgArrowLeft}
                onClick={onBack}
              >
                {t("admin.skills.back")}
              </Button>
            </div>
          ) : undefined
        }
      />
      <SettingsLayouts.Body>
        {isLoading && <SvgSimpleLoader />}

        {error && !isLoading && (
          <MessageCard
            variant="error"
            title={t("admin.skills.failedLoad")}
            description={t("admin.skills.failedLoadDesc")}
          />
        )}

        {!isLoading && !error && data && (
          <Section gap={2} alignItems="stretch">
            {/* Built-ins */}
            <Section gap={0.5} alignItems="stretch">
              <Text as="p" headingH3 text05>
                {t("admin.skills.builtinTitle")}
              </Text>
              {data.builtins.length === 0 ? (
                <IllustrationContent
                  illustration={SvgNoResult}
                  title={t("admin.skills.noBuiltin")}
                  description={t("admin.skills.builtinDesc")}
                />
              ) : (
                <BuiltinSkillsTable skills={data.builtins} />
              )}
            </Section>

            {/* Customs */}
            <Section gap={0.5} alignItems="stretch">
              <div className="flex items-center justify-between gap-2">
                <Text as="p" headingH3 text05>
                  {t("admin.skills.customTitle")}
                </Text>
                <Button icon={SvgPlus} onClick={() => setUploadOpen(true)}>
                  {t("admin.skills.uploadSkill")}
                </Button>
              </div>
              <CustomSkillsTable
                skills={data.customs}
                onShareSkill={setShareTarget}
                onReplaceBundle={handleReplaceBundleClick}
                onToggleEnabled={handleToggleEnabled}
                onDeleteSkill={handleDelete}
              />
            </Section>
          </Section>
        )}
      </SettingsLayouts.Body>

      {/* Inline file picker for the row-level "Replace bundle" action so we
          don't have to open the Inspect modal first. */}
      <input
        ref={replaceFileRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={handleReplaceBundleFile}
      />

      <UploadSkillModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={refresh}
      />

      <ShareSkillModal
        skill={shareTarget}
        open={shareTarget !== null}
        onClose={() => setShareTarget(null)}
        onSaved={refresh}
      />
    </SettingsLayouts.Root>
  );
}
