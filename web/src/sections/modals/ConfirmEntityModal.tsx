import Modal from "@/refresh-components/layouts/ConfirmationModalLayout";
import { Button } from "@opal/components";
import Text from "@/refresh-components/texts/Text";
import { SvgAlertCircle } from "@opal/icons";
import type { IconProps } from "@opal/types";
import { useTranslation } from "@/providers/LanguageProvider";

export interface ConfirmEntityModalProps {
  danger?: boolean;

  onClose: () => void;
  onSubmit: () => void;

  icon?: React.FunctionComponent<IconProps>;

  entityType: string;
  entityName: string;

  additionalDetails?: string;

  action?: string;
  actionButtonText?: string;

  removeConfirmationText?: boolean;
}

export function ConfirmEntityModal({
  danger,

  onClose,
  onSubmit,

  icon: Icon,

  entityType,
  entityName,

  additionalDetails,

  action,
  actionButtonText,

  removeConfirmationText = false,
}: ConfirmEntityModalProps) {
  const { t } = useTranslation();
  const buttonText = actionButtonText
    ? actionButtonText
    : danger
      ? t("confirmEntityModal.delete")
      : t("confirmEntityModal.confirm");
  const actionText = action
    ? action
    : danger
      ? t("confirmEntityModal.delete").toLowerCase()
      : "modify";

  return (
    <Modal
      icon={Icon || SvgAlertCircle}
      title={`${buttonText} ${entityType}`}
      onClose={onClose}
      submit={
        <Button variant={danger ? "danger" : "default"} onClick={onSubmit}>
          {buttonText}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {!removeConfirmationText && (
          <Text as="p">
            {t("confirmEntityModal.areYouSure", {
              action: actionText,
              name: entityName,
            })}
          </Text>
        )}

        {additionalDetails && (
          <Text as="p" text03>
            {additionalDetails}
          </Text>
        )}
      </div>
    </Modal>
  );
}
