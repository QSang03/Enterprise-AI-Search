"use client";

import React, { useMemo } from "react";
import * as Yup from "yup";
import { FormikField } from "@/refresh-components/form/FormikField";
import { FormField } from "@/refresh-components/form/FormField";
import InputComboBox from "@/refresh-components/inputs/InputComboBox";
import PasswordInputTypeIn from "@/refresh-components/inputs/PasswordInputTypeIn";
import { ImageGenFormWrapper } from "@/views/admin/ImageGenerationPage/forms/ImageGenFormWrapper";
import {
  ImageGenFormBaseProps,
  ImageGenFormChildProps,
  ImageGenSubmitPayload,
} from "@/views/admin/ImageGenerationPage/forms/types";
import { ImageGenerationCredentials } from "@/views/admin/ImageGenerationPage/svc";
import { ImageProvider } from "@/views/admin/ImageGenerationPage/constants";
import { useTranslation } from "@/providers/LanguageProvider";

const getProviderTitle = (p: ImageProvider, t: any) => {
  const key = `admin.imageGen.providerTitle_${p.image_provider_id.replaceAll("-", "_").replaceAll(".", "_")}`;
  const trans = t(key);
  return trans === key ? p.title : trans;
};

const getProviderDesc = (p: ImageProvider, t: any) => {
  const key = `admin.imageGen.providerDesc_${p.image_provider_id.replaceAll("-", "_").replaceAll(".", "_")}`;
  const trans = t(key);
  return trans === key ? p.description : trans;
};

// OpenAI form values - just API key
interface OpenAIFormValues {
  api_key: string;
}

const initialValues: OpenAIFormValues = {
  api_key: "",
};

function OpenAIFormFields(props: ImageGenFormChildProps<OpenAIFormValues>) {
  const { t } = useTranslation();
  const {
    apiStatus,
    showApiMessage,
    errorMessage,
    disabled,
    isLoadingCredentials,
    apiKeyOptions,
    resetApiState,
    imageProvider,
  } = props;

  return (
    <FormikField<string>
      name="api_key"
      render={(field, helper, meta, state) => (
        <FormField
          name="api_key"
          state={apiStatus === "error" ? "error" : state}
          className="w-full"
        >
          <FormField.Label>{t("admin.imageGen.apiKeyLabel")}</FormField.Label>
          <FormField.Control>
            {apiKeyOptions.length > 0 ? (
              <InputComboBox
                value={field.value}
                onChange={(e) => {
                  helper.setValue(e.target.value);
                  resetApiState();
                }}
                onValueChange={(value) => {
                  helper.setValue(value);
                  resetApiState();
                }}
                onBlur={field.onBlur}
                options={apiKeyOptions}
                placeholder={
                  isLoadingCredentials
                    ? t("admin.imageGen.loadingPlaceholder")
                    : t("admin.imageGen.enterNewApiKey")
                }
                disabled={disabled}
                isError={apiStatus === "error"}
              />
            ) : (
              <PasswordInputTypeIn
                {...field}
                onChange={(e) => {
                  field.onChange(e);
                  resetApiState();
                }}
                placeholder={
                  isLoadingCredentials ? t("admin.imageGen.loadingPlaceholder") : t("admin.imageGen.enterApiKeyPlaceholder")
                }
                disabled={disabled}
                error={apiStatus === "error"}
              />
            )}
          </FormField.Control>
          {showApiMessage ? (
            <FormField.APIMessage
              state={apiStatus}
              messages={{
                loading: t("admin.imageGen.testingApiKey", { name: getProviderTitle(imageProvider, t) }),
                success: t("admin.imageGen.apiKeyValid"),
                error: errorMessage || t("admin.imageGen.invalidApiKey"),
              }}
            />
          ) : (
            <FormField.Message
              messages={{
                idle: (() => {
                  const parts = t("admin.imageGen.apiKeyDesc").split("{link}");
                  return (
                    <>
                      {parts[0]}
                      <a
                        href="https://platform.openai.com/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        API key
                      </a>
                      {parts[1]}
                    </>
                  );
                })(),
                error: meta.error,
              }}
            />
          )}
        </FormField>
      )}
    />
  );
}

function getInitialValuesFromCredentials(
  credentials: ImageGenerationCredentials,
  _imageProvider: ImageProvider
): Partial<OpenAIFormValues> {
  return {
    api_key: credentials.api_key || "",
  };
}

function transformValues(
  values: OpenAIFormValues,
  imageProvider: ImageProvider
): ImageGenSubmitPayload {
  return {
    modelName: imageProvider.model_name,
    imageProviderId: imageProvider.image_provider_id,
    provider: "openai",
    apiKey: values.api_key,
  };
}

export function OpenAIImageGenForm(props: ImageGenFormBaseProps) {
  const { t } = useTranslation();
  const { imageProvider, existingConfig } = props;

  const providerTitle = getProviderTitle(imageProvider, t);
  const providerDesc = getProviderDesc(imageProvider, t);

  const validationSchema = useMemo(() => Yup.object().shape({
    api_key: Yup.string().required(t("admin.imageGen.apiKeyRequired")),
  }), [t]);

  return (
    <ImageGenFormWrapper<OpenAIFormValues>
      {...props}
      title={
        existingConfig
          ? t("admin.imageGen.editTitle", { name: providerTitle })
          : t("admin.imageGen.connectTitle", { name: providerTitle })
      }
      description={providerDesc}
      initialValues={initialValues}
      validationSchema={validationSchema}
      getInitialValuesFromCredentials={getInitialValuesFromCredentials}
      transformValues={(values) => transformValues(values, imageProvider)}
    >
      {(childProps) => <OpenAIFormFields {...childProps} />}
    </ImageGenFormWrapper>
  );
}
