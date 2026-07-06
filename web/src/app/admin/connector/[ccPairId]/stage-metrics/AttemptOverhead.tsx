"use client";

import { useMemo, useState } from "react";
import { Button, Text } from "@opal/components";
import { Section } from "@/layouts/general-layouts";
import { IndexAttemptStageMetric } from "@/lib/types";
import { formatDurationMs } from "@opal/time";
import { PIPELINE_ORDER } from "./constants";
import { useTranslation } from "@/providers/LanguageProvider";

interface AttemptOverheadProps {
  attemptStages: IndexAttemptStageMetric[];
}

// Per-attempt setup stages — one event each, no std dev, no chart. Rendered
// as a small disclosure beneath the main view to avoid overwhelming the
// admin while still surfacing one-off setup regressions.
export default function AttemptOverhead({
  attemptStages,
}: AttemptOverheadProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const sorted = useMemo(() => {
    const copy = [...attemptStages];
    copy.sort(
      (a, b) => (PIPELINE_ORDER[a.stage] ?? 0) - (PIPELINE_ORDER[b.stage] ?? 0)
    );
    return copy;
  }, [attemptStages]);

  return (
    <Section alignItems="start" height="fit" width="full" gap={0.25}>
      <Button
        prominence="tertiary"
        size="sm"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? t("stageMetrics.hideAttemptOverhead") : t("stageMetrics.showAttemptOverhead")}
      </Button>
      {open && <AttemptOverheadList stages={sorted} />}
    </Section>
  );
}

interface AttemptOverheadListProps {
  stages: IndexAttemptStageMetric[];
}

function AttemptOverheadList({ stages }: AttemptOverheadListProps) {
  return (
    <Section alignItems="stretch" height="fit" width="full" gap={0.125}>
      {stages.map((stage) => (
        <AttemptOverheadRow key={stage.stage} stage={stage} />
      ))}
    </Section>
  );
}

interface AttemptOverheadRowProps {
  stage: IndexAttemptStageMetric;
}

function AttemptOverheadRow({ stage }: AttemptOverheadRowProps) {
  const { t } = useTranslation();

  return (
    <Section
      flexDirection="row"
      justifyContent="between"
      alignItems="center"
      width="full"
      height="fit"
      gap={1}
    >
      <Text font="secondary-body" color="text-04">
        {t(`stageMetrics.labels.${stage.stage}`)}
      </Text>
      <Text font="secondary-body" color="text-03">
        {formatDurationMs(stage.total_duration_ms)}
      </Text>
    </Section>
  );
}
