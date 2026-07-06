"use client";

import { Button, Divider } from "@opal/components";
import { useState } from "react";
import { toast } from "@/hooks/useToast";
import { triggerIndexing } from "@/app/admin/connector/[ccPairId]/lib";
import Modal from "@/refresh-components/Modal";
import Text from "@/refresh-components/texts/Text";
import { SvgRefreshCw } from "@opal/icons";
import { useTranslation } from "@/providers/LanguageProvider";
// Hook to handle re-indexing functionality
export function useReIndexModal(
  connectorId: number | null,
  credentialId: number | null,
  ccPairId: number | null
) {
  const { t } = useTranslation();
  const [reIndexPopupVisible, setReIndexPopupVisible] = useState(false);

  const showReIndexModal = () => {
    if (connectorId == null || credentialId == null || ccPairId == null) {
      return;
    }
    setReIndexPopupVisible(true);
  };

  const hideReIndexModal = () => {
    setReIndexPopupVisible(false);
  };

  const triggerReIndex = async (fromBeginning: boolean) => {
    if (connectorId == null || credentialId == null || ccPairId == null) {
      return;
    }

    try {
      const result = await triggerIndexing(
        fromBeginning,
        connectorId,
        credentialId,
        ccPairId
      );

      // Show appropriate notification based on result
      if (result.success) {
        toast.success(
          t("connectorCCPair.toastReIndexStarted", {
            type: fromBeginning
              ? t("connectorCCPair.typeComplete")
              : t("connectorCCPair.typeUpdate"),
          })
        );
      } else {
        toast.error(
          t("connectorCCPair.toastReIndexStartedFailed", {
            error: result.message || t("connectorCCPair.unknownError"),
          })
        );
      }
    } catch (error) {
      console.error("Failed to trigger indexing:", error);
      toast.error(t("connectorCCPair.toastReIndexUnexpectedError"));
    }
  };

  const FinalReIndexModal =
    reIndexPopupVisible &&
    connectorId != null &&
    credentialId != null &&
    ccPairId != null ? (
      <ReIndexModal hide={hideReIndexModal} onRunIndex={triggerReIndex} />
    ) : null;

  return {
    showReIndexModal,
    ReIndexModal: FinalReIndexModal,
  };
}

export interface ReIndexModalProps {
  hide: () => void;
  onRunIndex: (fromBeginning: boolean) => Promise<void>;
}

export default function ReIndexModal({ hide, onRunIndex }: ReIndexModalProps) {
  const { t } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleRunIndex = async (fromBeginning: boolean) => {
    if (isProcessing) return;

    setIsProcessing(true);
    try {
      // First show immediate feedback with a toast
      toast.info(
        t("connectorCCPair.toastReIndexStartingFeedback", {
          type: fromBeginning
            ? t("connectorCCPair.typeComplete")
            : t("connectorCCPair.typeUpdate"),
        })
      );

      // Then close the modal
      hide();

      // Then run the indexing operation
      await onRunIndex(fromBeginning);
    } catch (error) {
      console.error("Error starting indexing:", error);
      // Show error in toast if needed
      toast.error(t("connectorCCPair.toastReIndexProcessFailed"));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Modal open onOpenChange={hide}>
      <Modal.Content width="sm" height="sm">
        <Modal.Header icon={SvgRefreshCw} title={t("connectorCCPair.reIndexModalTitle")} onClose={hide} />
        <Modal.Body>
          <Text as="p">
            {t("connectorCCPair.reIndexModalUpdateDesc")}
          </Text>
          <Button disabled={isProcessing} onClick={() => handleRunIndex(false)}>
            {t("connectorCCPair.reIndexModalRunUpdateBtn")}
          </Button>

          <Divider />

          <Text as="p">
            {t("connectorCCPair.reIndexModalCompleteDesc")}
          </Text>
          <Text as="p">
            {t("connectorCCPair.reIndexModalNote")}
          </Text>

          <Button disabled={isProcessing} onClick={() => handleRunIndex(true)}>
            {t("connectorCCPair.reIndexModalRunCompleteBtn")}
          </Button>
        </Modal.Body>
      </Modal.Content>
    </Modal>
  );
}
