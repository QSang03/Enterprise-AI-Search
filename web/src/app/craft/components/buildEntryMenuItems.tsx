import { Text } from "@opal/components";
import {
  SvgFileText,
  SvgFolder,
  SvgPaperclip,
  SvgPlug,
  SvgSparkle,
} from "@opal/icons";
import { getAppTypeLogo } from "@/app/craft/v1/apps/registry";
import type { PickerEntry, PickerSections } from "@/lib/skills/picker";
import type { PlusMenuItem } from "@/sections/input/PlusMenuButton";

interface LibraryFile {
  id: string;
  name: string;
}

type TranslateFn = (
  key: string,
  replacements?: Record<string, string | number>
) => string;

interface EntryMenuHandlers {
  onAttachFiles: () => void;
  onSelectEntry: (entry: PickerEntry) => void;
  onBrowseSkills: () => void;
  onBrowseApps: () => void;
  libraryFiles?: LibraryFile[];
  onManageLibrary?: () => void;
}

/** Maps picker sections onto the generic PlusMenuButton model. */
export function buildEntryMenuItems(
  sections: PickerSections,
  {
    onAttachFiles,
    onSelectEntry,
    onBrowseSkills,
    onBrowseApps,
    libraryFiles = [],
    onManageLibrary,
  }: EntryMenuHandlers,
  t: TranslateFn
): Array<PlusMenuItem | null> {
  const items: Array<PlusMenuItem | null> = [
    {
      key: "files",
      icon: SvgPaperclip,
      label: t("craft.addFilesOrPhotos"),
      onSelect: onAttachFiles,
    },
    null,
    {
      key: "skills",
      icon: SvgSparkle,
      label: t("craft.skills"),
      flyoutItems:
        sections.skills.length > 0
          ? sections.skills.map((skill) => ({
              key: skill.slug,
              icon: SvgSparkle,
              label: skill.name,
              description: skill.description,
              onSelect: () => onSelectEntry(skill),
            }))
          : [
              {
                key: "skills-empty",
                icon: SvgSparkle,
                label: t("craft.browseSkills"),
                onSelect: onBrowseSkills,
              },
            ],
    },
    {
      key: "apps",
      icon: SvgPlug,
      label: t("craft.apps"),
      flyoutItems:
        sections.apps.length > 0
          ? sections.apps.map((app) => ({
              key: app.slug,
              icon: getAppTypeLogo(app.appType),
              label: app.name,
              rightContent: app.authenticated ? undefined : (
                <Text font="secondary-body" color="text-03">
                  {t("craft.connect")}
                </Text>
              ),
              onSelect: () => onSelectEntry(app),
            }))
          : [
              {
                key: "apps-empty",
                icon: SvgPlug,
                label: t("craft.connectAnApp"),
                onSelect: onBrowseApps,
              },
            ],
    },
  ];

  if (onManageLibrary) {
    items.push({
      key: "library",
      icon: SvgFolder,
      label: t("craft.library"),
      flyoutItems: [
        ...libraryFiles.map((file) => ({
          key: file.id,
          icon: SvgFileText,
          label: file.name,
          onSelect: onManageLibrary,
        })),
        {
          key: "manage",
          icon: SvgFolder,
          label: t("craft.manageLibrary"),
          onSelect: onManageLibrary,
        },
      ],
    });
  }

  return items;
}
