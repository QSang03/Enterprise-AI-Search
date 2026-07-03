"use client";

import { useState } from "react";
import { Button, Popover, PopoverMenu } from "@opal/components";
import {
  SvgEye,
  SvgEyeOff,
  SvgMoreHorizontal,
  SvgShare,
  SvgTrash,
  SvgUploadCloud,
} from "@opal/icons";
import LineItem from "@/refresh-components/buttons/LineItem";
import type { CustomSkill } from "@/views/admin/SkillsPage/interfaces";
import { useTranslation } from "@/providers/LanguageProvider";
import { cn } from "@opal/utils";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CustomSkillRowActionsProps {
  skill: CustomSkill;
  onShare: () => void;
  onReplaceBundle: () => void;
  onToggleEnabled: () => void;
  onDelete: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CustomSkillRowActions({
  skill,
  onShare,
  onReplaceBundle,
  onToggleEnabled,
  onDelete,
}: CustomSkillRowActionsProps) {
  const { t } = useTranslation();
  const [popoverOpen, setPopoverOpen] = useState(false);

  return (
    <div className="flex items-center gap-0.5">
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <div
          className={cn(
            !popoverOpen &&
              "opacity-0 group-hover/row:opacity-100 transition-opacity"
          )}
        >
          <Popover.Trigger asChild>
            <Button prominence="tertiary" icon={SvgMoreHorizontal} />
          </Popover.Trigger>
        </div>
        <Popover.Content align="end" width="sm">
          <PopoverMenu>
            {[
              <LineItem
                key="share"
                icon={SvgShare}
                onClick={() => {
                  setPopoverOpen(false);
                  onShare();
                }}
              >
                {t("admin.skills.editVisibility")}
              </LineItem>,
              <LineItem
                key="replace"
                icon={SvgUploadCloud}
                onClick={() => {
                  setPopoverOpen(false);
                  onReplaceBundle();
                }}
              >
                {t("admin.skills.replaceBundle")}
              </LineItem>,
              <LineItem
                key="enabled"
                icon={skill.enabled ? SvgEyeOff : SvgEye}
                onClick={() => {
                  setPopoverOpen(false);
                  onToggleEnabled();
                }}
              >
                {skill.enabled ? t("admin.skills.disable") : t("admin.skills.reEnable")}
              </LineItem>,
              <LineItem
                key="delete"
                icon={SvgTrash}
                danger
                onClick={() => {
                  setPopoverOpen(false);
                  onDelete();
                }}
              >
                {t("admin.skills.delete")}
              </LineItem>,
            ]}
          </PopoverMenu>
        </Popover.Content>
      </Popover>
    </div>
  );
}
