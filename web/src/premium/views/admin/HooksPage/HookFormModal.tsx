"use client";

import { useState, useMemo } from "react";
import { Formik, Form, useFormikContext } from "formik";
import * as Yup from "yup";
import { Button, LinkButton, Text } from "@opal/components";
import {
  SvgCheckCircle,
  SvgShareWebhook,
  SvgLoader,
  SvgRevert,
} from "@opal/icons";
import Modal, { BasicModalFooter } from "@/refresh-components/Modal";
import InputTypeInField from "@/refresh-components/form/InputTypeInField";
import InputSelect from "@/refresh-components/inputs/InputSelect";
import PasswordInputTypeInField from "@/refresh-components/form/PasswordInputTypeInField";
import { Section } from "@/layouts/general-layouts";
import { Content, ContentAction, InputVertical } from "@opal/layouts";
import { toast } from "@/hooks/useToast";
import { useTranslation } from "@/providers/LanguageProvider";
import {
  createHook,
  updateHook,
  HookAuthError,
  HookTimeoutError,
  HookConnectError,
} from "@/premium/views/admin/HooksPage/svc";
import type {
  HookFailStrategy,
  HookFormState,
  HookPointMeta,
  HookResponse,
  HookUpdateRequest,
} from "@/premium/views/admin/HooksPage/interfaces";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HookFormModalProps {
  onOpenChange: (open: boolean) => void;
  /** When provided, the modal is in edit mode for this hook. */
  hook?: HookResponse;
  /** When provided (create mode), the hook point is pre-selected and locked. */
  spec?: HookPointMeta;
  onSuccess: (hook: HookResponse) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_TIMEOUT_SECONDS = 600;

function buildInitialValues(
  hook: HookResponse | undefined,
  spec: HookPointMeta | undefined
): HookFormState {
  if (hook) {
    return {
      name: hook.name,
      endpoint_url: hook.endpoint_url ?? "",
      api_key: "",
      fail_strategy: hook.fail_strategy,
      timeout_seconds: String(hook.timeout_seconds),
    };
  }
  return {
    name: "",
    endpoint_url: "",
    api_key: "",
    fail_strategy: spec?.default_fail_strategy ?? "hard",
    timeout_seconds: spec ? String(spec.default_timeout_seconds) : "30",
  };
}

// Timeout field (needs access to spec for revert button)
// ---------------------------------------------------------------------------

interface TimeoutFieldProps {
  spec: HookPointMeta | undefined;
}

function TimeoutField({ spec }: TimeoutFieldProps) {
  const { values, setFieldValue, isSubmitting } =
    useFormikContext<HookFormState>();
  const { t } = useTranslation();

  return (
    <InputVertical
      withLabel="timeout_seconds"
      title={t("admin.hooks.timeout")}
      suffix={t("admin.hooks.seconds")}
      subDescription={t("admin.hooks.timeoutDesc", { max: MAX_TIMEOUT_SECONDS })}
    >
      <div className="[&_input]:!font-main-ui-mono [&_input::placeholder]:!font-main-ui-mono [&_input]:[appearance:textfield]! [&_input::-webkit-outer-spin-button]:appearance-none! [&_input::-webkit-inner-spin-button]:appearance-none! w-full">
        <InputTypeInField
          name="timeout_seconds"
          type="number"
          placeholder={spec ? String(spec.default_timeout_seconds) : undefined}
          variant={isSubmitting ? "disabled" : undefined}
          rightChildren={
            spec?.default_timeout_seconds !== undefined &&
            values.timeout_seconds !== String(spec.default_timeout_seconds) ? (
              <Button
                prominence="tertiary"
                size="xs"
                icon={SvgRevert}
                tooltip={t("admin.hooks.revertDefault")}
                onClick={() =>
                  setFieldValue(
                    "timeout_seconds",
                    String(spec.default_timeout_seconds)
                  )
                }
                disabled={isSubmitting}
              />
            ) : undefined
          }
        />
      </div>
    </InputVertical>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HookFormModal({
  onOpenChange,
  hook,
  spec,
  onSuccess,
}: HookFormModalProps) {
  const { t } = useTranslation();
  const isEdit = !!hook;
  const [isConnected, setIsConnected] = useState(false);
  const [apiKeyCleared, setApiKeyCleared] = useState(false);

  const initialValues = buildInitialValues(hook, spec);

  const validationSchema = useMemo(() => {
    return Yup.object().shape({
      name: Yup.string().trim().required(t("admin.hooks.nameRequired")),
      endpoint_url: Yup.string().trim().required(t("admin.hooks.endpointRequired")),
      api_key: isEdit
        ? Yup.string()
        : Yup.string().trim().required(t("admin.hooks.apiKeyRequired")),
      timeout_seconds: Yup.string()
        .required(t("admin.hooks.timeoutRequired"))
        .test(
          "valid-timeout",
          t("admin.hooks.timeoutRange", { max: MAX_TIMEOUT_SECONDS }),
          (val) => {
            const num = parseFloat(val ?? "");
            return !isNaN(num) && num > 0 && num <= MAX_TIMEOUT_SECONDS;
          }
        ),
    });
  }, [isEdit, t]);

  function handleClose() {
    onOpenChange(false);
  }

  const hookPointDisplayName =
    spec?.display_name ?? spec?.hook_point ?? hook?.hook_point ?? "";
  const hookPointDescription = spec?.description;
  const docsUrl = spec?.docs_url;

  return (
    <Modal open onOpenChange={(open) => !open && handleClose()}>
      <Modal.Content width="md" height="fit">
        <Formik
          initialValues={initialValues}
          validationSchema={validationSchema}
          validateOnMount
          onSubmit={async (values, helpers) => {
            try {
              let result: HookResponse;
              if (isEdit && hook) {
                const req: HookUpdateRequest = {};
                if (values.name !== hook.name) req.name = values.name;
                if (values.endpoint_url !== (hook.endpoint_url ?? ""))
                  req.endpoint_url = values.endpoint_url;
                if (values.fail_strategy !== hook.fail_strategy)
                  req.fail_strategy = values.fail_strategy;
                const timeoutNum = parseFloat(values.timeout_seconds);
                if (timeoutNum !== hook.timeout_seconds)
                  req.timeout_seconds = timeoutNum;
                if (values.api_key.trim().length > 0) {
                  req.api_key = values.api_key;
                } else if (apiKeyCleared) {
                  req.api_key = null;
                }
                if (Object.keys(req).length === 0) {
                  handleClose();
                  return;
                }
                result = await updateHook(hook.id, req);
              } else {
                if (!spec) {
                  toast.error(t("admin.hooks.noHookPointSpecified"));
                  return;
                }
                result = await createHook({
                  name: values.name,
                  hook_point: spec.hook_point,
                  endpoint_url: values.endpoint_url,
                  ...(values.api_key ? { api_key: values.api_key } : {}),
                  fail_strategy: values.fail_strategy,
                  timeout_seconds: parseFloat(values.timeout_seconds),
                });
              }
              toast.success(isEdit ? t("admin.hooks.updateSuccess") : t("admin.hooks.createSuccessHook"));
              onSuccess(result);
              if (!isEdit) {
                setIsConnected(true);
                await new Promise((resolve) => setTimeout(resolve, 500));
              }
              handleClose();
            } catch (err) {
              if (err instanceof HookAuthError) {
                helpers.setFieldError("api_key", t("admin.hooks.invalidApiKey"));
              } else if (err instanceof HookTimeoutError) {
                helpers.setFieldError(
                  "timeout_seconds",
                  t("admin.hooks.timeoutError")
                );
              } else if (err instanceof HookConnectError) {
                helpers.setFieldError(
                  "endpoint_url",
                  err.message || t("admin.hooks.connectError")
                );
              } else {
                toast.error(
                  err instanceof Error ? err.message : t("admin.hooks.unknownError")
                );
              }
            } finally {
              helpers.setSubmitting(false);
            }
          }}
        >
          {({ values, setFieldValue, isSubmitting, isValid, dirty }) => {
            const failStrategyDescription =
              values.fail_strategy === "soft"
                ? t("admin.hooks.softStrategyDesc")
                : spec?.fail_hard_description;

            return (
              <Form className="w-full overflow-visible">
                <Modal.Header
                  icon={SvgShareWebhook}
                  title={
                    isEdit ? t("admin.hooks.editHookTitle") : t("admin.hooks.createHookTitle")
                  }
                  description={
                    isEdit
                      ? undefined
                      : t("admin.hooks.createHookDesc")
                  }
                  onClose={handleClose}
                />

                <Modal.Body>
                  {/* Hook point section header */}
                  <ContentAction
                    sizePreset="main-ui"
                    variant="section"
                    padding="fit"
                    title={hookPointDisplayName}
                    description={hookPointDescription}
                    rightChildren={
                      <div className="flex flex-col items-end gap-1">
                        <Content
                          sizePreset="secondary"
                          variant="body"
                          icon={SvgShareWebhook}
                          title="Hook Point"
                          color="muted"
                          width="fit"
                        />
                        {docsUrl && (
                          <LinkButton href={docsUrl} target="_blank">
                            {t("admin.hooks.docsLink")}
                          </LinkButton>
                        )}
                      </div>
                    }
                  />

                  <InputVertical withLabel="name" title={t("admin.hooks.displayName")}>
                    <div className="[&_input::placeholder]:!font-main-ui-muted w-full">
                      <InputTypeInField
                        name="name"
                        placeholder={t("admin.hooks.displayNamePlaceholder")}
                        variant={isSubmitting ? "disabled" : undefined}
                      />
                    </div>
                  </InputVertical>

                  <InputVertical
                    withLabel="fail_strategy"
                    title={t("admin.hooks.failStrategy")}
                    subDescription={failStrategyDescription}
                  >
                    <InputSelect
                      value={values.fail_strategy}
                      onValueChange={(v) =>
                        setFieldValue("fail_strategy", v as HookFailStrategy)
                      }
                      disabled={isSubmitting}
                    >
                      <InputSelect.Trigger placeholder={t("admin.hooks.selectStrategy")} />
                      <InputSelect.Content>
                        <InputSelect.Item value="soft">
                          {t("admin.hooks.softDefault")}
                          {spec?.default_fail_strategy === "soft" && (
                            <>
                              {" "}
                              <Text color="text-03">{t("admin.hooks.defaultLabel")}</Text>
                            </>
                          )}
                        </InputSelect.Item>
                        <InputSelect.Item value="hard">
                          {t("admin.hooks.hardDefault")}
                          {spec?.default_fail_strategy === "hard" && (
                            <>
                              {" "}
                              <Text color="text-03">{t("admin.hooks.defaultLabel")}</Text>
                            </>
                          )}
                        </InputSelect.Item>
                      </InputSelect.Content>
                    </InputSelect>
                  </InputVertical>

                  <TimeoutField spec={spec} />

                  <InputVertical
                    withLabel="endpoint_url"
                    title={t("admin.hooks.endpointUrl")}
                    subDescription={t("admin.hooks.endpointUrlDesc")}
                  >
                    <div className="[&_input::placeholder]:!font-main-ui-muted w-full">
                      <InputTypeInField
                        name="endpoint_url"
                        placeholder="https://your-api-endpoint.com"
                        variant={isSubmitting ? "disabled" : undefined}
                      />
                    </div>
                  </InputVertical>

                  <InputVertical
                    withLabel="api_key"
                    title={t("admin.hooks.apiKey")}
                    subDescription={t("admin.hooks.apiKeyDesc")}
                  >
                    <PasswordInputTypeInField
                      name="api_key"
                      placeholder={
                        isEdit
                          ? (hook?.api_key_masked ??
                            t("admin.hooks.apiKeyPlaceholderEdit"))
                          : undefined
                      }
                      disabled={isSubmitting}
                      onChange={(e) => {
                        if (isEdit && hook?.api_key_masked) {
                          setApiKeyCleared(e.target.value === "");
                        }
                      }}
                    />
                  </InputVertical>

                  {!isEdit && (isSubmitting || isConnected) && (
                    <Section
                      flexDirection="row"
                      alignItems="center"
                      justifyContent="start"
                      height="fit"
                      gap={1}
                      className="px-0.5"
                    >
                      <div className="p-0.5 shrink-0">
                        {isConnected ? (
                          <SvgCheckCircle
                            size={16}
                            className="text-status-success-05"
                          />
                        ) : (
                          <SvgLoader
                            size={16}
                            className="animate-spin text-text-03"
                          />
                        )}
                      </div>
                      <Text font="secondary-body" color="text-03">
                        {isConnected
                          ? t("admin.hooks.connectionValid")
                          : t("admin.hooks.verifyingConnection")}
                      </Text>
                    </Section>
                  )}
                </Modal.Body>

                <Modal.Footer>
                  <BasicModalFooter
                    cancel={
                      <Button
                        disabled={isSubmitting}
                        prominence="secondary"
                        onClick={handleClose}
                      >
                        {t("admin.hooks.cancel")}
                      </Button>
                    }
                    submit={
                      <Button
                        disabled={
                          isSubmitting ||
                          !isValid ||
                          (!dirty && !apiKeyCleared && isEdit)
                        }
                        type="submit"
                        icon={
                          isSubmitting && !isEdit
                            ? () => (
                                <SvgLoader size={16} className="animate-spin" />
                              )
                            : undefined
                        }
                      >
                        {isEdit ? t("admin.hooks.saveChanges") : t("admin.hooks.connect")}
                      </Button>
                    }
                  />
                </Modal.Footer>
              </Form>
            );
          }}
        </Formik>
      </Modal.Content>
    </Modal>
  );
}
