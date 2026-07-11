import { getXDaysAgo, getXYearsAgo } from "@/lib/dateUtils";

export const timeRangeValues = [
  { labelKey: "search.last2Years", value: getXYearsAgo(2) },
  { labelKey: "search.lastYear", value: getXYearsAgo(1) },
  { labelKey: "search.last30Days", value: getXDaysAgo(30) },
  { labelKey: "search.last7Days", value: getXDaysAgo(7) },
  { labelKey: "search.today", value: getXDaysAgo(1) },
];
