"use client";

import { useMemo } from "react";
import { SvgOrganization, SvgUsers, SvgX } from "@opal/icons";
import { Button, Card, MessageCard, Switch, Tabs } from "@opal/components";
import { ContentAction, InputHorizontal } from "@opal/layouts";
import Text from "@/refresh-components/texts/Text";
import InputComboBox from "@/refresh-components/inputs/InputComboBox/InputComboBox";
import { Section } from "@/layouts/general-layouts";
import useShareableGroups from "@/hooks/useShareableGroups";
import { useTranslation } from "@/providers/LanguageProvider";

const GROUPS_TAB = "Groups";
const YOUR_ORGANIZATION_TAB = "Your Organization";

interface SkillSharePickerProps {
  isPublic: boolean;
  onIsPublicChange: (isPublic: boolean) => void;
  groupIds: number[];
  onGroupIdsChange: (groupIds: number[]) => void;
}

/**
 * Sharing picker for custom skills. Mirrors the layout of `ShareAgentModal`
 * — two tabs ("Groups" and "Your Organization") with a combobox + selected
 * list on the first tab and an org-wide switch on the second.
 *
 * Skills don't support per-user grants or featured/labels, so this is the
 * trimmed-down sibling of `ShareAgentModal`.
 */
export default function SkillSharePicker({
  isPublic,
  onIsPublicChange,
  groupIds,
  onGroupIdsChange,
}: SkillSharePickerProps) {
  const { t } = useTranslation();
  const {
    data: groupsData,
    isLoading: groupsLoading,
    error: groupsError,
  } = useShareableGroups();
  const groups = groupsData ?? [];

  const comboBoxOptions = useMemo(
    () =>
      groups
        .filter((group) => !groupIds.includes(group.id))
        .map((group) => ({
          value: String(group.id),
          label: group.name,
        })),
    [groups, groupIds]
  );

  const selectedGroups = useMemo(
    () => groups.filter((group) => groupIds.includes(group.id)),
    [groups, groupIds]
  );

  function handleSelectGroup(selectedValue: string) {
    const groupId = parseInt(selectedValue, 10);
    if (Number.isNaN(groupId) || groupIds.includes(groupId)) return;
    onGroupIdsChange([...groupIds, groupId]);
  }

  function handleRemoveGroup(groupId: number) {
    onGroupIdsChange(groupIds.filter((id) => id !== groupId));
  }

  return (
    <Card padding="sm">
      <Tabs defaultValue={isPublic ? "Your Organization" : "Groups"}>
        <Tabs.List>
          <Tabs.Trigger icon={SvgUsers} value="Groups">
            {t("admin.skills.groupsTab")}
          </Tabs.Trigger>
          <Tabs.Trigger icon={SvgOrganization} value="Your Organization">
            {t("admin.skills.orgTab")}
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="Groups">
          <Section gap={0.5} alignItems="start">
            <div className="w-full">
              <InputComboBox
                placeholder={t("admin.skills.addGroupPlaceholder")}
                value=""
                onChange={() => {}}
                onValueChange={handleSelectGroup}
                options={comboBoxOptions}
                strict
              />
            </div>
            {selectedGroups.length > 0 && (
              <Section gap={0} alignItems="stretch">
                {selectedGroups.map((group) => (
                  <ContentAction
                    key={`group-${group.id}`}
                    sizePreset="main-ui"
                    variant="section"
                    icon={SvgUsers}
                    title={group.name}
                    padding="sm"
                    rightChildren={
                      <Button
                        prominence="tertiary"
                        size="sm"
                        icon={SvgX}
                        onClick={() => handleRemoveGroup(group.id)}
                      />
                    }
                  />
                ))}
              </Section>
            )}
            {!groupsLoading && !groupsError && groups.length === 0 && (
              <Text as="span" secondaryBody text03>
                {t("admin.skills.noGroupsWarn")}
              </Text>
            )}
          </Section>
          {isPublic && (
            <Section>
              <MessageCard
                icon={SvgOrganization}
                title={t("admin.skills.skillPublicTitle")}
                description={t("admin.skills.skillPublicDesc")}
              />
            </Section>
          )}
        </Tabs.Content>

        <Tabs.Content value="Your Organization">
          <Section gap={1} alignItems="stretch" padding={0.5}>
            <InputHorizontal
              title={t("admin.skills.publishSkill")}
              description={t("admin.skills.publishSkillDesc")}
              withLabel
            >
              <Switch checked={isPublic} onCheckedChange={onIsPublicChange} />
            </InputHorizontal>
          </Section>
        </Tabs.Content>
      </Tabs>
    </Card>
  );
}
