"use client";

import { useState } from "react";
import ConfirmationModalLayout from "@/refresh-components/layouts/ConfirmationModalLayout";
import { Button } from "@opal/components";
import { Checkbox } from "@opal/components";
import Text from "@/refresh-components/texts/Text";
import { SvgAlertCircle } from "@opal/icons";
import { useTranslation } from "@/providers/LanguageProvider";

interface MoveCustomAgentChatModalProps {
  onCancel: () => void;
  onConfirm: (doNotShowAgain: boolean) => void;
}

export default function MoveCustomAgentChatModal({
  onCancel,
  onConfirm,
}: MoveCustomAgentChatModalProps) {
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);
  const { t } = useTranslation();

  return (
    <ConfirmationModalLayout
      icon={SvgAlertCircle}
      title={t("modals.moveCustomAgentChat")}
      onClose={onCancel}
      submit={
        <Button onClick={() => onConfirm(doNotShowAgain)}>{t("modals.confirmMove")}</Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Text as="p" text03>
          {t("modals.moveCustomAgentDesc")
            .split("{customAgent}")
            .reduce((prev, current, i) => {
              if (i === 0) return [current];
              const projectSplit = current.split("{project}");
              const res = [];
              res.push(<b key="ca">{t("modals.customAgent")}</b>);
              res.push(projectSplit[0]);
              if (projectSplit.length > 1) {
                res.push(<b key="proj">{t("modals.project")}</b>);
                res.push(projectSplit[1]);
              }
              return [...prev, ...res];
            }, [] as React.ReactNode[])}
        </Text>
        <div className="flex items-center gap-1">
          <Checkbox
            id="move-custom-agent-do-not-show"
            checked={doNotShowAgain}
            onCheckedChange={(checked) => setDoNotShowAgain(Boolean(checked))}
          />
          <label
            htmlFor="move-custom-agent-do-not-show"
            className="text-text-03 text-sm"
          >
            {t("modals.doNotShowAgain")}
          </label>
        </div>
      </div>
    </ConfirmationModalLayout>
  );
}
