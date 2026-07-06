import React from "react";
import NumberInput from "./ConnectorInput/NumberInput";
import { TextFormField } from "@/components/Field";
import { Button } from "@opal/components";
import { SvgTrash } from "@opal/icons";
import { useTranslation } from "@/providers/LanguageProvider";

interface AdvancedFormPageProps {
  defaultPruneFreqHours?: number;
}

export default function AdvancedFormPage({
  defaultPruneFreqHours = 600,
}: AdvancedFormPageProps) {
  const { t } = useTranslation();

  return (
    <div className="py-4 flex flex-col gap-y-6 rounded-lg max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4 text-text-800">
        {t("addConnector.advancedConfigTitle")}
      </h2>

      <NumberInput
        description={t("addConnector.pruneFreqDesc", {
          default: defaultPruneFreqHours,
          days: Math.round(defaultPruneFreqHours / 24),
        })}
        label={t("addConnector.pruneFreqLabel")}
        name="pruneFreq"
      />

      <NumberInput
        description={t("addConnector.refreshFreqDesc")}
        label={t("addConnector.refreshFreqLabel")}
        name="refreshFreq"
      />

      <TextFormField
        type="date"
        subtext={t("addConnector.indexingStartSubtext")}
        optional
        label={t("addConnector.indexingStartLabel")}
        name="indexingStart"
      />
      <div className="mt-4 flex w-full mx-auto max-w-2xl justify-start">
        <Button variant="danger" icon={SvgTrash} type="submit">
          {t("addConnector.resetBtn")}
        </Button>
      </div>
    </div>
  );
}
