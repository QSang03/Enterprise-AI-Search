"use client";

import { Button, Text } from "@opal/components";
import { SvgInfoSmall } from "@opal/icons";
import { Section } from "@/layouts/general-layouts";
import { IndexAttemptStage } from "@/lib/types";
import { cn } from "@opal/utils";
import { colorClassForStage } from "./utils";
import { useTranslation } from "@/providers/LanguageProvider";

interface StageLabelCellProps {
  stage: IndexAttemptStage;
}

export default function StageLabelCell({ stage }: StageLabelCellProps) {
  const { t } = useTranslation();

  return (
    <Section
      flexDirection="row"
      justifyContent="start"
      alignItems="center"
      width="fit"
      height="fit"
      gap={0.5}
    >
      {/* Inline color swatch: a color-only marker doesn't fit any
          layout primitive, and Tailwind handles the styling fully. */}
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-2 w-2 rounded-full",
          colorClassForStage(stage)
        )}
      />
      <Text font="secondary-body" color="text-05" nowrap>
        {t(`stageMetrics.labels.${stage}`)}
      </Text>
      <Button
        icon={SvgInfoSmall}
        prominence="tertiary"
        size="sm"
        tooltip={t(`stageMetrics.descriptions.${stage}`)}
      />
    </Section>
  );
}
