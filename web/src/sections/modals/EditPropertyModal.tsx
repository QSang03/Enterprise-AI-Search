import { Formik, Form } from "formik";
import Modal from "@/refresh-components/Modal";
import { Button } from "@opal/components";
import { InputVertical } from "@opal/layouts";
import InputTypeInField from "@/refresh-components/form/InputTypeInField";
import { SvgEdit } from "@opal/icons";
import { useTranslation } from "@/providers/LanguageProvider";

export interface EditPropertyModalProps {
  propertyTitle: string;
  propertyDetails?: string;
  propertyName: string;
  propertyValue: string;
  validationSchema: object;
  onClose: () => void;
  onSubmit: (propertyName: string, propertyValue: string) => Promise<void>;
}

export default function EditPropertyModal({
  propertyTitle,
  propertyDetails,
  propertyName,
  propertyValue,
  validationSchema,
  onClose,
  onSubmit,
}: EditPropertyModalProps) {
  const { t } = useTranslation();
  return (
    <Modal open onOpenChange={onClose}>
      <Modal.Content width="sm">
        <Modal.Header
          icon={SvgEdit}
          title={t("modals.editProperty", { property: propertyTitle })}
          onClose={onClose}
        />
        <Formik
          initialValues={{
            propertyName,
            propertyValue,
          }}
          validationSchema={validationSchema}
          onSubmit={async (values, { setSubmitting }) => {
            try {
              await onSubmit(values.propertyName, values.propertyValue);
              onClose();
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ isSubmitting, isValid, values }) => (
            <Form className="w-full">
              <Modal.Body>
                <InputVertical
                  title={propertyDetails ?? ""}
                  withLabel="propertyValue"
                >
                  <InputTypeInField
                    name="propertyValue"
                    placeholder={t("modals.propertyValuePlaceholder")}
                  />
                </InputVertical>
              </Modal.Body>
              <Modal.Footer>
                <Button
                  disabled={
                    isSubmitting ||
                    !isValid ||
                    values.propertyValue === propertyValue
                  }
                  type="submit"
                >
                  {isSubmitting ? t("modals.updating") : t("modals.updateProperty")}
                </Button>
              </Modal.Footer>
            </Form>
          )}
        </Formik>
      </Modal.Content>
    </Modal>
  );
}
