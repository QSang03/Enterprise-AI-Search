"use client";

import { useMemo, useRef, useState } from "react";
import { Button, InputTypeIn, MessageCard, Text } from "@opal/components";
import { IllustrationContent } from "@opal/layouts";
import SvgNoResult from "@opal/illustrations/no-result";
import { SvgBlocks, SvgPlus, SvgSettings, SvgSimpleLoader } from "@opal/icons";
import { SettingsLayouts } from "@opal/layouts";
import TextSeparator from "@/refresh-components/TextSeparator";
import useOnMount from "@/hooks/useOnMount";
import useUserSkills from "@/hooks/useUserSkills";
import { useUser } from "@/providers/UserProvider";
import { useTranslation } from "@/providers/LanguageProvider";
import SkillCard, {
  type CustomSkillCardItem,
  type SkillCardItem,
} from "@/sections/cards/SkillCard";
import CreatePersonalSkillModal from "@/views/UserSkillsPage/CreatePersonalSkillModal";
import { ConfirmEntityModal } from "@/sections/modals/ConfirmEntityModal";
import {
  deleteUserSkill,
  patchUserSkill,
  replaceUserSkillBundle,
} from "@/lib/skills/api";
import { toast } from "@/hooks/useToast";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UserSkillsPage() {
  const { t } = useTranslation();
  const { data, error, isLoading, refresh } = useUserSkills();
  const { user, isAdmin } = useUser();
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomSkillCardItem | null>(
    null
  );
  const searchInputRef = useRef<HTMLInputElement>(null);
  const replaceBundleTarget = useRef<CustomSkillCardItem | null>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  // Non-null while a card mutation is in flight; gates all card actions so a
  // shared file picker can't be retargeted and toggles can't race.
  const [pendingId, setPendingId] = useState<string | null>(null);

  useOnMount(() => {
    searchInputRef.current?.focus();
  });

  function handleReplaceBundleClick(item: CustomSkillCardItem) {
    if (pendingId) return;
    replaceBundleTarget.current = item;
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

    setPendingId(target.id);
    try {
      await replaceUserSkillBundle(target.id, file);
      toast.success(t("admin.skills.replaceSuccess", { name: target.name }));
      refresh();
    } catch (err) {
      console.error("Failed to replace skill bundle", err);
      toast.error(
        err instanceof Error ? err.message : t("admin.skills.failedReplace")
      );
    } finally {
      setPendingId(null);
    }
  }

  async function handleToggleEnabled(
    item: CustomSkillCardItem,
    enabled: boolean
  ) {
    setPendingId(item.id);
    try {
      await patchUserSkill(item.id, enabled);
      toast.success(
        enabled
          ? t("admin.skills.enabledSuccess", { name: item.name })
          : t("admin.skills.disabledSuccess", { name: item.name })
      );
      refresh();
    } catch (err) {
      console.error("Failed to toggle skill", err);
      toast.error(err instanceof Error ? err.message : t("admin.skills.failedUpdate"));
    } finally {
      setPendingId(null);
    }
  }

  async function handleDeleteConfirmed() {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);

    setPendingId(target.id);
    try {
      await deleteUserSkill(target.id);
      toast.success(t("admin.skills.deleteSuccess", { name: target.name }));
      refresh();
    } catch (err) {
      console.error("Failed to delete skill", err);
      toast.error(err instanceof Error ? err.message : t("admin.skills.failedDelete"));
    } finally {
      setPendingId(null);
    }
  }

  const items = useMemo<SkillCardItem[]>(() => {
    if (!data) return [];
    const builtinItems: SkillCardItem[] = data.builtins.map((b) => ({
      id: `builtin:${b.slug}`,
      name: b.name,
      description: b.description,
      source: "builtin",
      is_available: b.is_available,
      unavailable_reason: b.unavailable_reason,
    }));
    const customItems: SkillCardItem[] = data.customs.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      source: "custom",
      author_email: c.author_email,
      is_personal:
        c.is_personal && user !== null && c.author_user_id === user.id,
      enabled: c.enabled,
    }));
    // Group order: built-in, then custom (org-wide), then personal; alphabetical within each group.
    const groupRank = (item: SkillCardItem): number => {
      switch (item.source) {
        case "builtin":
          return 0;
        case "custom":
          return item.is_personal ? 2 : 1;
      }
    };
    return [...builtinItems, ...customItems].sort(
      (a, b) =>
        groupRank(a) - groupRank(b) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );
  }, [data, user]);

  const visibleItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  return (
    <SettingsLayouts.Root data-testid="UserSkillsPage/container">
      <SettingsLayouts.Header
        icon={SvgBlocks}
        title={t("skills.title")}
        description={t("skills.description")}
        rightChildren={
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button
                href="/craft/v1/skills/manage"
                prominence="secondary"
                icon={SvgSettings}
              >
                {t("skills.manageSkills")}
              </Button>
            )}
            <Button icon={SvgPlus} onClick={() => setCreateOpen(true)}>
              {t("skills.createSkill")}
            </Button>
          </div>
        }
      >
        <InputTypeIn
          ref={searchInputRef}
          placeholder={t("skills.searchPlaceholder")}
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          searchIcon
        />
      </SettingsLayouts.Header>

      <SettingsLayouts.Body>
        {isLoading && <SvgSimpleLoader />}

        {error && !isLoading && (
          <MessageCard
            variant="error"
            title={t("skills.failedLoad")}
            description={t("skills.failedLoadDesc")}
          />
        )}

        {!isLoading && !error && (
          <>
            {visibleItems.length === 0 ? (
              <IllustrationContent
                illustration={SvgNoResult}
                title={
                  items.length === 0
                    ? t("skills.noSkills")
                    : t("skills.noMatching")
                }
                description={
                  items.length === 0
                    ? t("skills.noSkillsDesc")
                    : t("skills.tryDifferentSearch")
                }
              />
            ) : (
              <>
                <section className="flex flex-col gap-2">
                  <Text font="secondary-body" color="text-03">
                    {t("skills.browseSkills")}
                  </Text>
                  <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-2">
                    {visibleItems.map((item) => (
                      <SkillCard
                        key={item.id}
                        item={item}
                        busy={pendingId !== null}
                        onReplaceBundle={handleReplaceBundleClick}
                        onDelete={setDeleteTarget}
                        onToggleEnabled={handleToggleEnabled}
                      />
                    ))}
                  </div>
                </section>
                <TextSeparator
                  count={visibleItems.length}
                  text={visibleItems.length === 1 ? t("skills.skill") : t("skills.skills")}
                />
              </>
            )}

            {visibleItems.length > 0 && (
              <div className="pt-2">
                <Text as="p" font="secondary-body" color="text-03">
                  {t("skills.footerDesc")}
                </Text>
              </div>
            )}
          </>
        )}
      </SettingsLayouts.Body>

      {/* Inline file picker for the card-level "Replace bundle" action. */}
      <input
        ref={replaceFileRef}
        type="file"
        accept=".zip,application/zip"
        className="hidden"
        onChange={handleReplaceBundleFile}
      />

      <CreatePersonalSkillModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={refresh}
      />

      {deleteTarget && (
        <ConfirmEntityModal
          danger
          entityType="skill"
          entityName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onSubmit={handleDeleteConfirmed}
        />
      )}
    </SettingsLayouts.Root>
  );
}
