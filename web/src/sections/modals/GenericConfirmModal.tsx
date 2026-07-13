import Modal from "@/refresh-components/Modal";
import { Button } from "@opal/components";
import Text from "@/refresh-components/texts/Text";
import { SvgCheck } from "@opal/icons";
import { useTranslation } from "@/providers/LanguageProvider";

export interface GenericConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  onClose: () => void;
  onConfirm: () => void;
}

export default function GenericConfirmModal({
  title,
  message,
  confirmText,
  onClose,
  onConfirm,
}: GenericConfirmModalProps) {
  const { t } = useTranslation();
  const resolvedConfirmText = confirmText ?? t("genericConfirmModal.confirm");
  return (
    <Modal open onOpenChange={onClose}>
      <Modal.Content width="sm" height="sm">
        <Modal.Header icon={SvgCheck} title={title} onClose={onClose} />
        <Modal.Body>
          <Text as="p">{message}</Text>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={onConfirm}>{resolvedConfirmText}</Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal>
  );
}
