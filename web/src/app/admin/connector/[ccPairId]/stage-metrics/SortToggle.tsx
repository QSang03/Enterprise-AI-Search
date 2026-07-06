"use client";

import { Button, Text } from "@opal/components";
import { Section } from "@/layouts/general-layouts";
import { SortMode } from "./interfaces";
import { useTranslation } from "@/providers/LanguageProvider";

interface SortToggleProps {
  sortMode: SortMode;
  onChange: (mode: SortMode) => void;
}

export default function SortToggle({ sortMode, onChange }: SortToggleProps) {
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
      <Text font="secondary-body" color="text-03">
        {t("stageMetrics.sortLabel")}
      </Text>
      <Button
        prominence={sortMode === "pipeline" ? "secondary" : "tertiary"}
        size="sm"
        onClick={() => onChange("pipeline")}
      >
        {t("stageMetrics.pipelineOrder")}
      </Button>
      <Button
        prominence={sortMode === "time-taken" ? "secondary" : "tertiary"}
        size="sm"
        onClick={() => onChange("time-taken")}
      >
        {t("stageMetrics.timeTaken")}
      </Button>
    </Section>
  );
}
