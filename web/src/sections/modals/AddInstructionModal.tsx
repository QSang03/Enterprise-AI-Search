"use client";

import { Formik, Form } from "formik";
import * as Yup from "yup";
import { Button } from "@opal/components";
import { useProjectsContext } from "@/providers/ProjectsContext";
import { useModal } from "@/refresh-components/contexts/ModalContext";
import { SvgAddLines } from "@opal/icons";
import Modal from "@/refresh-components/Modal";
import InputTextAreaField from "@/refresh-components/form/InputTextAreaField";
import { useTranslation } from "@/providers/LanguageProvider";

const validationSchema = Yup.object({
  instructions: Yup.string(),
});

export default function AddInstructionModal() {
  const modal = useModal();
  const { currentProjectDetails, upsertInstructions } = useProjectsContext();
  const { t } = useTranslation();

  return (
    <Modal open={modal.isOpen} onOpenChange={modal.toggle}>
      <Modal.Content width="sm">
        <Modal.Header
          icon={SvgAddLines}
          title={t("modals.setProjectInstructions")}
          description={t("modals.setProjectInstructionsDesc")}
          onClose={() => modal.toggle(false)}
        />
        <Formik
          initialValues={{
            instructions: currentProjectDetails?.project?.instructions ?? "",
          }}
          validationSchema={validationSchema}
          onSubmit={async (values, { setSubmitting }) => {
            try {
              await upsertInstructions(values.instructions.trim());
              modal.toggle(false);
            } catch (e) {
              console.error("Failed to save instructions", e);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {({ isSubmitting, dirty, isValid }) => (
            <Form>
              <Modal.Body>
                <InputTextAreaField
                  name="instructions"
                  placeholder={t("modals.instructionsPlaceholder")}
                />
              </Modal.Body>
              <Modal.Footer>
                <Button
                  prominence="secondary"
                  type="button"
                  onClick={() => modal.toggle(false)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !dirty || !isValid}
                >
                  {t("common.save")}
                </Button>
              </Modal.Footer>
            </Form>
          )}
        </Formik>
      </Modal.Content>
    </Modal>
  );
}
