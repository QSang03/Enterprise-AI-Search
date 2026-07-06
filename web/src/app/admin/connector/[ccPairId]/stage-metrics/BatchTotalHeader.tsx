"use client";

import { Text } from "@opal/components";
import { IndexAttemptStageMetric } from "@/lib/types";
import { formatDurationMs } from "@opal/time";
import { useTranslation } from "@/providers/LanguageProvider";

interface BatchTotalHeaderProps {
  batchTotal: IndexAttemptStageMetric | null;
}

export default function BatchTotalHeader({
  batchTotal,
}: BatchTotalHeaderProps) {
  const { t } = useTranslation();

  if (!batchTotal || batchTotal.event_count === 0) {
    return (
      <Text font="main-ui-action" color="text-04">
        {t("stageMetrics.noCompletedBatches")}
      </Text>
    );
  }

  const avg = batchTotal.avg_duration_ms;
  const std = batchTotal.std_dev_duration_ms;
  const avgLabel =
    avg !== null
      ? std !== null
        ? `${formatDurationMs(avg)} ± ${formatDurationMs(std)}`
        : formatDurationMs(avg)
      : "—";

  return (
    <Text font="main-ui-action" color="text-05">
      {t("stageMetrics.averageBatchText", {
        avgLabel,
        count: batchTotal.event_count,
        batchLabel:
          batchTotal.event_count === 1
            ? t("stageMetrics.batchSingle")
            : t("stageMetrics.batchPlural"),
      })}
    </Text>
  );
}
