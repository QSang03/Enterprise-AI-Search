import type { UserGroup } from "@/lib/types";

/** Whether this group is a system default group (Admin, Basic). */
export function isBuiltInGroup(group: UserGroup): boolean {
  return group.is_default;
}

/** Human-readable description for built-in groups. */


/**
 * Build the description line(s) shown beneath the group name.
 *
 * Built-in groups use a fixed label.
 * Custom groups list resource counts ("3 connectors · 2 document sets · 2 agents")
 * or fall back to "No private connectors / document sets / agents".
 */
export function buildGroupDescription(group: UserGroup, t: any): string {
  const BUILT_IN_DESCRIPTIONS: Record<string, string> = {
    Basic: t("admin.groups.basicDesc"),
    Admin: t("admin.groups.adminDesc"),
  };
  if (isBuiltInGroup(group)) {
    return BUILT_IN_DESCRIPTIONS[group.name] ?? "";
  }

  const parts: string[] = [];
  if (group.cc_pairs.length > 0) {
    const count = group.cc_pairs.length;
    parts.push(`${count} ${count === 1 ? t("admin.groups.connector") : t("admin.groups.connectors")}`);
  }
  if (group.document_sets.length > 0) {
    const count = group.document_sets.length;
    parts.push(`${count} ${count === 1 ? t("admin.groups.docSet") : t("admin.groups.docSets")}`);
  }
  if (group.personas.length > 0) {
    const count = group.personas.length;
    parts.push(`${count} ${count === 1 ? t("admin.groups.agent") : t("admin.groups.agents")}`);
  }

  return parts.length > 0
    ? parts.join(" · ")
    : t("admin.groups.noResourcesDesc");
}

/** Format the member count badge, e.g. "306 Members" or "1 Member". */
export function formatMemberCount(count: number, t: any): string {
  return `${count} ${count === 1 ? t("admin.groups.member") : t("admin.groups.members")}`;
}
