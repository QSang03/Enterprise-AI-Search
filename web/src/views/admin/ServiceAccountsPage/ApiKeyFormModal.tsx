"use client";

import { Form, Formik } from "formik";
import { useTranslation } from "@/providers/LanguageProvider";
import { toast } from "@/hooks/useToast";
import {
  createApiKey,
  updateApiKey,
} from "@/views/admin/ServiceAccountsPage/svc";
import type { APIKey } from "@/views/admin/ServiceAccountsPage/interfaces";
import Modal from "@/refresh-components/Modal";
import { Button } from "@opal/components";
import { InputTypeIn } from "@opal/components";
import InputSelect from "@/refresh-components/inputs/InputSelect";
import { FormikField } from "@/refresh-components/form/FormikField";
import { InputVertical } from "@opal/layouts";
import { USER_ROLE_LABELS, UserRole } from "@/lib/types";
import { SvgKey, SvgLock, SvgUser, SvgUserManage } from "@opal/icons";

interface ApiKeyFormModalProps {
  onClose: () => void;
  onCreateApiKey: (apiKey: APIKey) => void;
  apiKey?: APIKey;
}

export default function ApiKeyFormModal({
  onClose,
  onCreateApiKey,
  apiKey,
}: ApiKeyFormModalProps) {
  const { t } = useTranslation();
  const isUpdate = apiKey !== undefined;

  return (
    <Modal open onOpenChange={onClose}>
      <Modal.Content width="sm" height="lg">
        <Modal.Header
          icon={SvgKey}
          title={isUpdate ? t("admin.serviceAccounts.updateTitle") : t("admin.serviceAccounts.createTitle")}
          description={
            isUpdate
              ? undefined
              : t("admin.serviceAccounts.createDesc")
          }
          onClose={onClose}
        />
        <Formik
          initialValues={{
            name: apiKey?.api_key_name || "",
            role: apiKey?.api_key_role || UserRole.BASIC.toString(),
          }}
          onSubmit={async (values, formikHelpers) => {
            formikHelpers.setSubmitting(true);

            const payload = {
              ...values,
              role: values.role as UserRole,
            };

            try {
              let response;
              if (isUpdate) {
                response = await updateApiKey(apiKey.api_key_id, payload);
              } else {
                response = await createApiKey(payload);
              }
              if (response.ok) {
                toast.success(
                  isUpdate
                    ? t("admin.serviceAccounts.toastUpdateSuccess")
                    : t("admin.serviceAccounts.toastCreateSuccess")
                );
                if (!isUpdate) {
                  onCreateApiKey(await response.json());
                }
                onClose();
              } else {
                const responseJson = await response.json();
                const errorMsg = responseJson.detail || responseJson.message;
                toast.error(
                  isUpdate
                    ? t("admin.serviceAccounts.toastUpdateError", { error: errorMsg })
                    : t("admin.serviceAccounts.toastCreateError", { error: errorMsg })
                );
              }
            } catch (e) {
              toast.error(
                e instanceof Error ? e.message : t("admin.serviceAccounts.toastUnexpectedError")
              );
            } finally {
              formikHelpers.setSubmitting(false);
            }
          }}
        >
          {({ isSubmitting, values }) => (
            <Form className="w-full overflow-visible">
              <Modal.Body>
                <InputVertical withLabel="name" title={t("admin.serviceAccounts.nameLabel")}>
                  <FormikField<string>
                    name="name"
                    render={(field, helper) => (
                      <InputTypeIn {...field} placeholder={t("admin.serviceAccounts.namePlaceholder")} />
                    )}
                  />
                </InputVertical>

                <InputVertical withLabel="role" title={t("admin.serviceAccounts.permissionsLabel")}>
                  <FormikField<string>
                    name="role"
                    render={(field, helper) => (
                      <InputSelect
                        value={field.value}
                        onValueChange={(value) => helper.setValue(value)}
                      >
                        <InputSelect.Trigger placeholder={t("admin.serviceAccounts.permissionsPlaceholder")} />
                        <InputSelect.Content>
                          <InputSelect.Item
                            value={UserRole.ADMIN.toString()}
                            icon={SvgUserManage}
                            description={t("admin.serviceAccounts.roleAdminDesc")}
                          >
                            {USER_ROLE_LABELS[UserRole.ADMIN]}
                          </InputSelect.Item>
                          <InputSelect.Item
                            value={UserRole.BASIC.toString()}
                            icon={SvgUser}
                            description={t("admin.serviceAccounts.roleBasicDesc")}
                          >
                            {USER_ROLE_LABELS[UserRole.BASIC]}
                          </InputSelect.Item>
                          <InputSelect.Item
                            value={UserRole.LIMITED.toString()}
                            icon={SvgLock}
                            description={t("admin.serviceAccounts.roleLimitedDesc")}
                          >
                            {USER_ROLE_LABELS[UserRole.LIMITED]}
                          </InputSelect.Item>
                        </InputSelect.Content>
                      </InputSelect>
                    )}
                  />
                </InputVertical>
              </Modal.Body>

              <Modal.Footer>
                <Button prominence="secondary" type="button" onClick={onClose}>
                  {t("admin.serviceAccounts.cancel")}
                </Button>
                <Button
                  disabled={isSubmitting || !values.name.trim()}
                  type="submit"
                >
                  {isUpdate ? t("admin.serviceAccounts.updateBtn") : t("admin.serviceAccounts.createBtn")}
                </Button>
              </Modal.Footer>
            </Form>
          )}
        </Formik>
      </Modal.Content>
    </Modal>
  );
}
