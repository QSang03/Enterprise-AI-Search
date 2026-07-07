"use client";

import { Text } from "@opal/components";
import { markdown } from "@opal/utils";
import { useTranslation } from "@/providers/LanguageProvider";

interface ToggleWarningModalProps {
  open: boolean;
  recommendedModelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ToggleWarningModal({
  open,
  recommendedModelLabel,
  onConfirm,
  onCancel,
}: ToggleWarningModalProps) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-1400 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-xs"
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
      />

      <div className="relative z-10 w-full max-w-xl mx-4 bg-background-tint-01 rounded-16 shadow-lg border border-border-01">
        <div className="p-6 flex flex-col gap-6">
          <div className="flex items-center justify-center">
            <Text font="heading-h2" color="text-05">
              {t("craft.showAllModelsTitle")}
            </Text>
          </div>

          <div className="flex justify-center text-center">
            <Text font="main-ui-body" color="text-04">
              {markdown(
                t("craft.showAllModelsDesc", { model: recommendedModelLabel })
              )}
            </Text>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onConfirm();
              }}
              className="px-4 py-2 rounded-12 bg-background-neutral-01 border border-border-02 hover:opacity-90 transition-colors"
            >
              <Text font="main-ui-body" color="text-05">
                {t("craft.showAllModelsConfirm")}
              </Text>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              className="px-4 py-2 rounded-12 bg-black dark:bg-white hover:opacity-90 transition-colors"
            >
              <Text font="main-ui-action" color="text-inverted-05">
                {t("craft.keepRecommended")}
              </Text>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
