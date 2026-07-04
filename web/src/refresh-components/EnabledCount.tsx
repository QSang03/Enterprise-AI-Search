"use client";

import { memo } from "react";
import Text from "@/refresh-components/texts/Text";
import { useTranslation } from "@/providers/LanguageProvider";

interface EnabledCountProps {
  name?: string;
  enabledCount: number;
  totalCount: number;
}

const EnabledCount = memo(
  ({ name, enabledCount, totalCount }: EnabledCountProps) => {
    const { t } = useTranslation();

    const getResourceName = (rawName: string | undefined, plural: boolean) => {
      if (!rawName) return "";
      const key = rawName.toLowerCase().replace(/\s+/g, "");
      if (key === "tool") return t(plural ? "common.toolPlural" : "common.tool");
      if (key === "action") return t(plural ? "common.actionPlural" : "common.action");
      if (key === "document") return t(plural ? "common.documentPlural" : "common.document");
      if (key === "documentset") return t(plural ? "common.documentSetPlural" : "common.documentSet");
      return rawName;
    };

    const isPlural = totalCount !== 1;
    const translatedName = getResourceName(name, isPlural);
    const template = t("common.enabledCount", {
      enabled: "ENABLED_PLACEHOLDER",
      total: String(totalCount),
      name: translatedName,
    });
    const parts = template.split("ENABLED_PLACEHOLDER");

    return (
      <Text text03 mainUiBody>
        {parts[0]}
        <Text mainUiBody className="text-action-link-05 inline">
          {enabledCount}
        </Text>
        {parts[1]}
      </Text>
    );
  }
);
EnabledCount.displayName = "EnabledCount";

export default EnabledCount;
