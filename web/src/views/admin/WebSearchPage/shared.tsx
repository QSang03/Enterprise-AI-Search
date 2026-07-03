"use client";

import { markdown } from "@opal/utils";
import type { RichStr } from "@opal/types";
import { InputVertical } from "@opal/layouts";
import { useTranslation } from "@/providers/LanguageProvider";
import InputTypeInField from "@/refresh-components/form/InputTypeInField";
import PasswordInputTypeInField from "@/refresh-components/form/PasswordInputTypeInField";

interface ApiKeyFieldProps {
  providerLabel: string;
  apiKeyUrl?: string;
}

export function ApiKeyField({ providerLabel, apiKeyUrl }: ApiKeyFieldProps) {
  const { t } = useTranslation();
  return (
    <InputVertical
      title={t("admin.webSearch.apiKeyLabel")}
      withLabel="api_key"
      subDescription={markdown(
        apiKeyUrl
          ? t("admin.webSearch.apiKeyDescWithUrl", { url: apiKeyUrl, name: providerLabel })
          : t("admin.webSearch.apiKeyDescWithoutUrl", { name: providerLabel })
      )}
    >
      <PasswordInputTypeInField name="api_key" placeholder={t("admin.webSearch.apiKeyLabel")} />
    </InputVertical>
  );
}

interface ConfigTextFieldProps {
  title: string;
  placeholder: string;
  subDescription?: string | RichStr;
}

export function ConfigTextField({
  title,
  placeholder,
  subDescription,
}: ConfigTextFieldProps) {
  return (
    <InputVertical
      title={title}
      withLabel="config"
      subDescription={subDescription}
    >
      <InputTypeInField name="config" placeholder={placeholder} />
    </InputVertical>
  );
}
