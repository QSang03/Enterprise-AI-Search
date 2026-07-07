"use client";

import { Text } from "@opal/components";
import { SvgAlertTriangle } from "@opal/icons";
import { UsageLimits } from "@/app/craft/types/streamingTypes";
import { useTranslation } from "@/providers/LanguageProvider";

interface UpgradePlanModalProps {
  open: boolean;
  onClose: () => void;
  limits: UsageLimits | null;
}

/**
 * Modal shown when users hit their message limit.
 * Shows different messaging for free (total limit) vs paid (weekly limit) users.
 */
export default function UpgradePlanModal({
  open,
  onClose,
  limits,
}: UpgradePlanModalProps) {
  const { t } = useTranslation();

  if (!open) return null;

  const isPaidUser = limits?.limitType === "weekly";
  const limit = String(limits?.limit ?? (isPaidUser ? 25 : 5));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-xs"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-xl mx-4 bg-background-tint-01 rounded-16 shadow-lg border border-border-01">
        <div className="p-6 flex flex-col gap-6 min-h-[300px]">
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            <SvgAlertTriangle className="w-16 h-16 text-status-warning-02" />

            <div className="flex flex-col items-center gap-2 text-center max-w-sm">
              <Text font="heading-h2" color="text-05">
                {t("craft.messageLimitTitle")}
              </Text>
              <Text font="main-ui-body" color="text-03">
                {isPaidUser
                  ? t("craft.messageLimitPaidDesc", { limit })
                  : t("craft.messageLimitFreeDesc", { limit })}
              </Text>
            </div>
          </div>

          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-4 py-2 rounded-12 border border-border-01 bg-background-tint-00 text-text-04 hover:bg-background-tint-02 transition-colors"
            >
              <Text font="main-ui-action" color="text-05">
                {t("craft.messageLimitGotIt")}
              </Text>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
