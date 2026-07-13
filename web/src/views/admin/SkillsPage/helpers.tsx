import type {
  CustomSkill,
  SkillVisibility,
} from "@/views/admin/SkillsPage/interfaces";
import { translateOutsideReact } from "@/providers/LanguageProvider";

export interface VisibilitySummary {
  label: string;
  description?: string;
}

/**
 * Derive the UI visibility tri-state from the API's
 * (is_public, granted_group_ids) tuple.
 */
export function visibilityFromSkill(skill: CustomSkill): SkillVisibility {
  if (skill.is_public) return "org_wide";
  if (skill.granted_group_ids.length > 0) return "groups";
  return "private";
}

export function summarizeVisibility(skill: CustomSkill): VisibilitySummary {
  const t = translateOutsideReact;
  if (skill.is_personal) {
    return {
      label: t("skillsHelpers.personal"),
      description: skill.author_email ?? undefined,
    };
  }
  const visibility = visibilityFromSkill(skill);
  switch (visibility) {
    case "private":
      return { label: t("skillsHelpers.private") };
    case "groups": {
      const n = skill.granted_group_ids.length;
      return {
        label: t("skillsHelpers.groups"),
        description: t(
          n === 1 ? "skillsHelpers.groupCount_one" : "skillsHelpers.groupCount_other",
          { n }
        ),
      };
    }
    case "org_wide":
      return { label: t("skillsHelpers.orgWide") };
  }
}

export function formatRelativeTime(isoTimestamp: string | null): string {
  const t = translateOutsideReact;
  if (!isoTimestamp) return "—";
  const then = new Date(isoTimestamp).getTime();
  if (Number.isNaN(then)) return "—";
  const now = Date.now();
  const diffMs = now - then;
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return t("skillsHelpers.justNow");
  if (diffMin < 60) return t("skillsHelpers.minutesAgo", { n: diffMin });
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return t("skillsHelpers.hoursAgo", { n: diffHr });
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return t("skillsHelpers.daysAgo", { n: diffDay });
  const diffMo = Math.round(diffDay / 30);
  if (diffMo < 12) return t("skillsHelpers.monthsAgo", { n: diffMo });
  return t("skillsHelpers.yearsAgo", { n: Math.round(diffMo / 12) });
}
