"use client";

import React, { useMemo } from "react";
import * as Yup from "yup";
import { FormikField } from "@/refresh-components/form/FormikField";
import { FormField } from "@/refresh-components/form/FormField";
import { InputTypeIn } from "@opal/components";
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
import {
  parseAzureTargetUri,
  isValidAzureTargetUri,
} from "@/lib/azureTargetUri";
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

// Azure form values - target URI and API key
interface AzureFormValues {
  target_uri: string;
  api_key: string;
}

const initialValues: AzureFormValues = {
  target_uri: "",
  api_key: "",
};

function AzureFormFields(props: ImageGenFormChildProps<AzureFormValues>) {
  const { t } = useTranslation();
  const {
    formikProps,
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
    <>
      {/* Target URI field */}
      <FormikField<string>
        name="target_uri"
        render={(field, helper, meta, state) => (
          <FormField name="target_uri" state={state} className="w-full">
            <FormField.Label>{t("admin.imageGen.targetUriLabel")}</FormField.Label>
            <FormField.Control>
              <InputTypeIn
                {...field}
                placeholder="https://your-resource.cognitiveservices.azure.com/openai/deployments/deployment-name/images/generations?api-version=2025-01-01-preview"
                variant={disabled ? "disabled" : undefined}
              />
            </FormField.Control>
            <FormField.Message
              messages={{
                idle: (() => {
                  const parts = t("admin.imageGen.targetUriDesc").split("{link}");
                  return (
                    <>
                      {parts[0]}
                      <a
                        href="https://oai.azure.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        Azure OpenAI
                      </a>
                      {parts[1]}
                    </>
                  );
                })(),
                error: meta.error,
              }}
            />
          </FormField>
        )}
      />

      {/* API Key field */}
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
                  disabled={disabled || !formikProps.values.target_uri?.trim()}
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
                  disabled={disabled || !formikProps.values.target_uri?.trim()}
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
                          href="https://oai.azure.com"
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
    </>
  );
}

function getInitialValuesFromCredentials(
  credentials: ImageGenerationCredentials,
  imageProvider: ImageProvider
): Partial<AzureFormValues> {
  // Reconstruct target_uri from credentials
  let targetUri = "";
  if (credentials.api_base && credentials.api_version) {
    const deployment = credentials.deployment_name || imageProvider.model_name;
    targetUri = `${credentials.api_base}/openai/deployments/${deployment}/images/generations?api-version=${credentials.api_version}`;
  }

  return {
    api_key: credentials.api_key || "",
    target_uri: targetUri,
  };
}

function transformValues(
  values: AzureFormValues,
  imageProvider: ImageProvider
): ImageGenSubmitPayload {
  // Parse target_uri to extract api_base, api_version, deployment_name
  let apiBase: string | undefined;
  let apiVersion: string | undefined;
  let deploymentName: string | undefined;
  let modelName = imageProvider.model_name;

  if (values.target_uri) {
    try {
      const parsed = parseAzureTargetUri(values.target_uri);
      apiBase = parsed.url.origin;
      apiVersion = parsed.apiVersion;
      deploymentName = parsed.deploymentName || undefined;
      // For Azure, use deployment name as model name
      modelName = deploymentName || imageProvider.model_name;
    } catch (error) {
      console.error("Failed to parse target_uri:", error);
    }
  }

  return {
    modelName,
    imageProviderId: imageProvider.image_provider_id,
    provider: "azure",
    apiKey: values.api_key,
    apiBase,
    apiVersion,
    deploymentName,
  };
}

export function AzureImageGenForm(props: ImageGenFormBaseProps) {
  const { t } = useTranslation();
  const { imageProvider, existingConfig } = props;

  const providerTitle = getProviderTitle(imageProvider, t);
  const providerDesc = getProviderDesc(imageProvider, t);

  const validationSchema = useMemo(() => Yup.object().shape({
    target_uri: Yup.string()
      .required(t("admin.imageGen.targetUriRequired"))
      .test(
        "valid-target-uri",
        t("admin.imageGen.targetUriInvalid"),
        (value) => (value ? isValidAzureTargetUri(value) : false)
      ),
    api_key: Yup.string().required(t("admin.imageGen.apiKeyRequired")),
  }), [t]);

  return (
    <ImageGenFormWrapper<AzureFormValues>
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
      {(childProps) => <AzureFormFields {...childProps} />}
    </ImageGenFormWrapper>
  );
}
