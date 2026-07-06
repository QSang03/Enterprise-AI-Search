"use client";

import Modal from "@/refresh-components/Modal";
import { SvgBarChartSmall } from "@opal/icons";
import StageMetricsPanel from "./stage-metrics/StageMetricsPanel";
import { useTranslation } from "@/providers/LanguageProvider";

interface StageMetricsModalProps {
  indexAttemptId: number;
  onClose: () => void;
}

export default function StageMetricsModal({
  indexAttemptId,
  onClose,
}: StageMetricsModalProps) {
  const { t } = useTranslation();

  return (
    <Modal open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Modal.Content width="lg" height="lg">
        <Modal.Header
          icon={SvgBarChartSmall}
          title={t("stageMetrics.modalTitle")}
          description={t("stageMetrics.modalDesc")}
          onClose={onClose}
        />
        <Modal.Body>
          <StageMetricsPanel indexAttemptId={indexAttemptId} />
        </Modal.Body>
      </Modal.Content>
    </Modal>
  );
}
