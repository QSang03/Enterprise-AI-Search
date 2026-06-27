import { SERVER_SIDE_ONLY__PAID_ENTERPRISE_FEATURES_ENABLED } from "@/lib/constants";
import { fetchStandardSettingsSS } from "@/lib/settings/svcSS";
import PremiumFeatureRedirect from "@/app/premium/PremiumFeatureRedirect";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // First check build-time constant (fast path)
  if (!SERVER_SIDE_ONLY__PAID_ENTERPRISE_FEATURES_ENABLED) {
    return <PremiumFeatureRedirect />;
  }

  // Then check runtime license status (for license enforcement mode)
  // This allows gating premium features when user doesn't have a valid license
  try {
    const settings = await fetchStandardSettingsSS();
    if (settings) {
      if (settings.ee_features_enabled === false) {
        // When the app is in GATED_ACCESS (expired or missing license), defer
        // to the root layout's GatedContentWrapper which handles path-based
        // exemptions (e.g. allowing /admin/billing for license management).
        if (settings.application_status === "gated_access") {
          return children;
        }

        return <PremiumFeatureRedirect />;
      }
    }
  } catch (error) {
    // If settings fetch fails, allow access (fail open for better UX)
    console.error("Failed to fetch settings for premium check:", error);
  }

  return children;
}
