"use client";

import React, { useMemo } from "react";
import * as Yup from "yup";
import { FormikField } from "@/refresh-components/form/FormikField";
import { FormField } from "@/refresh-components/form/FormField";
import { InputTypeIn } from "@opal/components";
import InputFile from "@/refresh-components/inputs/InputFile";
import InlineExternalLink from "@/refresh-components/InlineExternalLink";
import { ImageGenFormWrapper } from "@/views/admin/ImageGenerationPage/forms/ImageGenFormWrapper";
import {
  ImageGenFormBaseProps,
  ImageGenFormChildProps,
  ImageGenSubmitPayload,
} from "@/views/admin/ImageGenerationPage/forms/types";
import { ImageProvider } from "@/views/admin/ImageGenerationPage/constants";
import { ImageGenerationCredentials } from "@/views/admin/ImageGenerationPage/svc";
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

const VERTEXAI_PROVIDER_NAME = "vertex_ai";
const VERTEXAI_DEFAULT_LOCATION = "global";

// Vertex form values
interface VertexImageGenFormValues {
  custom_config: {
    vertex_credentials: string;
    vertex_location: string;
  };
}

const initialValues: VertexImageGenFormValues = {
  custom_config: {
    vertex_credentials: "",
    vertex_location: VERTEXAI_DEFAULT_LOCATION,
  },
};

function getInitialValuesFromCredentials(
  credentials: ImageGenerationCredentials,
  _imageProvider: ImageProvider
): Partial<VertexImageGenFormValues> {
  return {
    custom_config: {
      vertex_credentials: credentials.custom_config?.vertex_credentials || "",
      vertex_location:
        credentials.custom_config?.vertex_location || VERTEXAI_DEFAULT_LOCATION,
    },
  };
}

function transformValues(
  values: VertexImageGenFormValues,
  imageProvider: ImageProvider
): ImageGenSubmitPayload {
  return {
    modelName: imageProvider.model_name,
    imageProviderId: imageProvider.image_provider_id,
    provider: VERTEXAI_PROVIDER_NAME,
    customConfig: {
      vertex_credentials: values.custom_config.vertex_credentials,
      vertex_location: values.custom_config.vertex_location,
    },
  };
}

function VertexFormFields(
  props: ImageGenFormChildProps<VertexImageGenFormValues>
) {
  const { t } = useTranslation();
  const { apiStatus, showApiMessage, errorMessage, disabled, imageProvider } =
    props;

  return (
    <>
      {/* Credentials File field */}
      <FormikField<string>
        name="custom_config.vertex_credentials"
        render={(field, helper, meta, state) => (
          <FormField
            name="custom_config.vertex_credentials"
            state={apiStatus === "error" ? "error" : state}
            className="w-full"
          >
            <FormField.Label>{t("admin.imageGen.credentialsFileLabel")}</FormField.Label>
            <FormField.Control>
              <InputFile
                setValue={(value) => helper.setValue(value)}
                error={apiStatus === "error"}
                onBlur={field.onBlur}
                disabled={disabled}
                accept="application/json"
                placeholder={t("admin.imageGen.uploadCredentialsPlaceholder")}
              />
            </FormField.Control>
            {showApiMessage ? (
              <FormField.APIMessage
                state={apiStatus}
                messages={{
                  loading: t("admin.imageGen.testingCredentials", { name: getProviderTitle(imageProvider, t) }),
                  success: t("admin.imageGen.credentialsValid"),
                  error: errorMessage || t("admin.imageGen.invalidCredentials"),
                }}
              />
            ) : (
              <FormField.Message
                messages={{
                  idle: (() => {
                    const parts = t("admin.imageGen.vertexCredentialsDesc").split("{link}");
                    return (
                      <>
                        {parts[0]}
                        <InlineExternalLink href="https://console.cloud.google.com/projectselector2/iam-admin/serviceaccounts?supportedpurview=project">
                          {t("admin.imageGen.serviceAccountCredentials")}
                        </InlineExternalLink>
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

      {/* Location field */}
      <FormikField<string>
        name="custom_config.vertex_location"
        render={(field, helper, meta, state) => (
          <FormField
            name="custom_config.vertex_location"
            state={state}
            className="w-full"
          >
            <FormField.Label>{t("admin.imageGen.locationLabel")}</FormField.Label>
            <FormField.Control>
              <InputTypeIn
                value={field.value}
                onChange={(e) => helper.setValue(e.target.value)}
                onBlur={field.onBlur}
                placeholder="global"
                variant={disabled ? "disabled" : undefined}
              />
            </FormField.Control>
            <FormField.Message
              messages={{
                idle: (() => {
                  const parts = t("admin.imageGen.vertexLocationDesc").split("{link}");
                  return (
                    <>
                      {parts[0]}
                      <InlineExternalLink href="https://cloud.google.com/vertex-ai/generative-ai/docs/learn/locations">
                        {t("admin.imageGen.googleCloudDocs")}
                      </InlineExternalLink>
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
    </>
  );
}

export function VertexImageGenForm(props: ImageGenFormBaseProps) {
  const { t } = useTranslation();
  const { imageProvider, existingConfig } = props;

  const providerTitle = getProviderTitle(imageProvider, t);
  const providerDesc = getProviderDesc(imageProvider, t);

  const validationSchema = useMemo(() => Yup.object().shape({
    custom_config: Yup.object().shape({
      vertex_credentials: Yup.string().required(t("admin.imageGen.credentialsFileRequired")),
      vertex_location: Yup.string().required(t("admin.imageGen.locationRequired")),
    }),
  }), [t]);

  return (
    <ImageGenFormWrapper<VertexImageGenFormValues>
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
      {(childProps) => <VertexFormFields {...childProps} />}
    </ImageGenFormWrapper>
  );
}
