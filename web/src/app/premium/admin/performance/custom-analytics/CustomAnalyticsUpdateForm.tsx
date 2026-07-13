"use client";

import { Label, SubLabel } from "@/components/Field";
import { toast } from "@/hooks/useToast";
import { useCustomAnalyticsScript } from "@/lib/analytics/hooks";
import { useTranslation } from "@/providers/LanguageProvider";
import { Button, Text } from "@opal/components";
import { markdown } from "@opal/utils";
import { useState } from "react";
import InputTextArea from "@/refresh-components/inputs/InputTextArea";
import { Spacer } from "@opal/components";

export default function CustomAnalyticsUpdateForm() {
  const { t } = useTranslation();
  const customAnalyticsScript = useCustomAnalyticsScript();

  const [newCustomAnalyticsScript, setNewCustomAnalyticsScript] =
    useState<string>(customAnalyticsScript || "");
  const [secretKey, setSecretKey] = useState<string>("");

  return (
    <div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();

          const response = await fetch(
            "/api/admin/enterprise-settings/custom-analytics-script",
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                script: newCustomAnalyticsScript.trim(),
                secret_key: secretKey,
              }),
            }
          );
          if (response.ok) {
            toast.success(t("customAnalytics.toastUpdatedSuccess"));
          } else {
            const errorMsg = (await response.json()).detail;
            toast.error(
              t("customAnalytics.toastUpdatedFailed", { error: errorMsg })
            );
          }
          setSecretKey("");
        }}
      >
        <div className="mb-4">
          <Label>{t("connectorCCPair.scriptLabel")}</Label>
          <Text as="p">
            {t("connectorCCPair.scriptDesc")}
          </Text>
          <Spacer rem={0.75} />
          <Text as="p">
            {markdown(t("connectorCCPair.scriptNote"))}
          </Text>
          <Spacer rem={0.5} />
          <InputTextArea
            value={newCustomAnalyticsScript}
            onChange={(event) =>
              setNewCustomAnalyticsScript(event.target.value)
            }
          />
        </div>

        <Label>{t("connectorCCPair.secretKey")}</Label>
        <SubLabel>
          <>
            {t("connectorCCPair.secretKeyDesc")}
          </>
        </SubLabel>
        <input
          className={`
            border
            border-border
            rounded
            w-full
            py-2
            px-3
            mt-1`}
          type="password"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
        />
        <Spacer rem={1} />
        <Button type="submit">{t("common.update")}</Button>
      </form>
    </div>
  );
}
