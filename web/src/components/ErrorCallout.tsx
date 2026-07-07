"use client";

import { Callout } from "@/components/ui/callout";
import { FiAlertTriangle } from "react-icons/fi";
import { useTranslation } from "@/providers/LanguageProvider";

export function ErrorCallout({
  errorTitle,
  errorMsg,
}: {
  errorTitle?: string;
  errorMsg?: string;
}) {
  const { t } = useTranslation();

  return (
    <div>
      <Callout
        className="mt-4"
        title={errorTitle || t("errorCallout.pageNotFound")}
        icon={<FiAlertTriangle className="text-red-500 h-5 w-5" />}
        type="danger"
      >
        {errorMsg}
      </Callout>
    </div>
  );
}
