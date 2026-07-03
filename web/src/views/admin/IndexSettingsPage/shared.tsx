"use client";

import { useState } from "react";
import { useField } from "formik";
import * as Yup from "yup";
import { markdown } from "@opal/utils";
import { Divider, Text } from "@opal/components";
import type { RichStr } from "@opal/types";
import { InputHorizontal, InputVertical } from "@opal/layouts";
import type { EmbeddingProvider } from "@/lib/indexing/interfaces";
import SwitchField from "@/refresh-components/form/SwitchField";
import InputTypeInField from "@/refresh-components/form/InputTypeInField";
import PasswordInputTypeInField from "@/refresh-components/form/PasswordInputTypeInField";
import { useTranslation } from "@/providers/LanguageProvider";

// ---------------------------------------------------------------------------
// Formik-aware field components
//
// Every field in this file expects to live inside a <Formik> context. The
// matching Yup schema field name is passed via `name`; `withLabel={name}`
// on the Opal `InputVertical` / `InputHorizontal` wires the `<label htmlFor>`
// AND the inline error-text rendered by `FormikInputError`.
// ---------------------------------------------------------------------------

interface ApiKeyFieldProps {
  provider: EmbeddingProvider;
}

export function ApiKeyField({ provider }: ApiKeyFieldProps) {
  const { t } = useTranslation();
  return (
    <InputVertical
      title={t("admin.embeddings.apiKeyLabel")}
      withLabel="apiKey"
      subDescription={markdown(
        t("admin.embeddings.apiKeyDesc", {
          url: provider.apiLink ?? "",
          name: provider.displayName,
        })
      )}
    >
      <PasswordInputTypeInField name="apiKey" />
    </InputVertical>
  );
}

interface ApiUrlFieldProps {
  title: string;
  placeholder: string;
  subDescription?: string;
}

export function ApiUrlField({
  title,
  placeholder,
  subDescription,
}: ApiUrlFieldProps) {
  return (
    <InputVertical
      title={title}
      subDescription={subDescription}
      withLabel="apiUrl"
    >
      <InputTypeInField name="apiUrl" placeholder={placeholder} />
    </InputVertical>
  );
}

export function GoogleCredentialsField() {
  const [, , helpers] = useField<string>("apiKey");
  const [fileName, setFileName] = useState("");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileName("");
    if (!file) {
      void helpers.setValue("");
      void helpers.setTouched(true);
      return;
    }
    setFileName(file.name);
    try {
      const content = JSON.parse(await file.text());
      void helpers.setValue(JSON.stringify(content));
    } catch {
      void helpers.setValue("");
    }
    void helpers.setTouched(true);
  };

  const { t } = useTranslation();
  return (
    <InputVertical title={t("admin.embeddings.uploadJsonCredentials")} withLabel="apiKey">
      <input
        id="apiKey"
        type="file"
        accept=".json"
        onChange={handleFileUpload}
      />
      {fileName && (
        <Text font="secondary-body" color="text-03">
          {fileName}
        </Text>
      )}
    </InputVertical>
  );
}

interface TextFieldProps {
  name: string;
  title: string | RichStr;
  subDescription?: string | RichStr;
  suffix?: string;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}

export function TextField({
  name,
  title,
  subDescription,
  suffix,
  placeholder,
  inputMode,
}: TextFieldProps) {
  return (
    <InputVertical
      title={title}
      subDescription={subDescription}
      suffix={suffix}
      withLabel={name}
    >
      <InputTypeInField
        name={name}
        placeholder={placeholder}
        inputMode={inputMode}
      />
    </InputVertical>
  );
}

// ---------------------------------------------------------------------------
// Model spec fields — shared between LiteLLMProviderModal and
// CustomSelfHostedModal. Both collect the same 5 fields; only the modelName
// subDescription differs.
// ---------------------------------------------------------------------------

export const modelSpecSchemaShape = {
  modelName: Yup.string().trim().required("Model name is required"),
  modelDim: Yup.number()
    .required("Model dimension is required")
    .test("positive-int", "Must be a positive integer", (value) => {
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed > 0 && parsed <= 10000;
    }),
  queryPrefix: Yup.string().defined().default(""),
  passagePrefix: Yup.string().defined().default(""),
  normalize: Yup.boolean().defined().default(false),
};

export function getModelSpecSchemaShape(t: any) {
  return {
    modelName: Yup.string().trim().required(t("admin.embeddings.validationModelNameRequired")),
    modelDim: Yup.number()
      .required(t("admin.embeddings.validationModelDimRequired"))
      .test("positive-int", t("admin.embeddings.validationModelDimPositive"), (value) => {
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed > 0 && parsed <= 10000;
      }),
    queryPrefix: Yup.string().defined().default(""),
    passagePrefix: Yup.string().defined().default(""),
    normalize: Yup.boolean().defined().default(false),
  };
}

interface ModelSpecFieldsProps {
  modelNameSubDescription?: string;
}

export function ModelSpecFields({
  modelNameSubDescription,
}: ModelSpecFieldsProps) {
  const { t } = useTranslation();
  const resolvedSubDesc = modelNameSubDescription || t("admin.embeddings.modelNameDefaultDesc");

  return (
    <>
      <TextField
        name="modelName"
        title={t("admin.embeddings.modelNameLabel")}
        placeholder="model-name"
        subDescription={resolvedSubDesc}
      />

      <Divider paddingParallel="fit" paddingPerpendicular="fit" />

      <TextField
        name="modelDim"
        title={t("admin.embeddings.modelDimLabel")}
        placeholder={t("admin.embeddings.modelDimPlaceholder")}
        inputMode="numeric"
        subDescription={t("admin.embeddings.modelDimDesc")}
      />

      <TextField
        name="queryPrefix"
        title={t("admin.embeddings.queryPrefixLabel")}
        suffix={t("admin.embeddings.optional")}
        placeholder={t("admin.embeddings.queryPrefixPlaceholder")}
        subDescription={t("admin.embeddings.queryPrefixDesc")}
      />

      <TextField
        name="passagePrefix"
        title={t("admin.embeddings.passagePrefixLabel")}
        suffix={t("admin.embeddings.optional")}
        placeholder={t("admin.embeddings.passagePrefixPlaceholder")}
        subDescription={t("admin.embeddings.passagePrefixDesc")}
      />

      <InputHorizontal
        title={t("admin.embeddings.normalizeEmbeddingsLabel")}
        description={t("admin.embeddings.normalizeEmbeddingsDesc")}
        withLabel="normalize"
      >
        <SwitchField name="normalize" />
      </InputHorizontal>
    </>
  );
}
