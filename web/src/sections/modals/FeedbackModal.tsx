"use client";

import { FeedbackType } from "@/app/app/interfaces";
import { Button } from "@opal/components";
import useFeedbackController from "@/hooks/useFeedbackController";
import { useModal } from "@/refresh-components/contexts/ModalContext";
import { SvgThumbsDown, SvgThumbsUp } from "@opal/icons";
import Modal from "@/refresh-components/Modal";
import { Formik } from "formik";
import * as Yup from "yup";
import { InputVertical } from "@opal/layouts";
import InputTextAreaField from "@/refresh-components/form/InputTextAreaField";
import { useTranslation } from "@/providers/LanguageProvider";

export interface FeedbackModalProps {
  feedbackType: FeedbackType;
  messageId: number;
}

interface FeedbackFormValues {
  additional_feedback: string;
}

export default function FeedbackModal({
  feedbackType,
  messageId,
}: FeedbackModalProps) {
  const modal = useModal();
  const { handleFeedbackChange } = useFeedbackController();
  const { t } = useTranslation();

  const initialValues: FeedbackFormValues = {
    additional_feedback: "",
  };

  const validationSchema = Yup.object({
    additional_feedback:
      feedbackType === "dislike"
        ? Yup.string().trim().required(t("modals.feedbackRequired"))
        : Yup.string().trim(),
  });

  async function handleSubmit(values: FeedbackFormValues) {
    const feedbackText = values.additional_feedback;

    const success = await handleFeedbackChange(
      messageId,
      feedbackType,
      feedbackText,
      undefined
    );

    // Only close modal if submission was successful
    if (success) {
      modal.toggle(false);
    }
  }

  return (
    <>
      <Modal open={modal.isOpen} onOpenChange={modal.toggle}>
        <Modal.Content width="sm">
          <Modal.Header
            icon={feedbackType === "like" ? SvgThumbsUp : SvgThumbsDown}
            title={t("modals.feedbackTitle")}
            onClose={() => modal.toggle(false)}
          />
          <Formik
            initialValues={initialValues}
            validationSchema={validationSchema}
            onSubmit={handleSubmit}
          >
            {({
              isSubmitting,
              handleSubmit: formikHandleSubmit,
              dirty,
              isValid,
            }) => (
              <>
                <Modal.Body>
                  <InputVertical
                    withLabel="additional_feedback"
                    title={t("modals.feedbackDetailsTitle")}
                    suffix={feedbackType === "like" ? t("modals.optional") : undefined}
                  >
                    <InputTextAreaField
                      name="additional_feedback"
                      placeholder={t("modals.whatDidYouLikeDislike", {
                        type: feedbackType === "like" ? t("common.like") : t("common.dislike")
                      })}
                    />
                  </InputVertical>
                </Modal.Body>

                <Modal.Footer>
                  <Button
                    prominence="secondary"
                    onClick={() => modal.toggle(false)}
                    type="button"
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    disabled={
                      isSubmitting ||
                      (feedbackType === "dislike" && (!dirty || !isValid))
                    }
                    onClick={() => formikHandleSubmit()}
                  >
                    {isSubmitting ? t("modals.submitting") : t("common.submit")}
                  </Button>
                </Modal.Footer>
              </>
            )}
          </Formik>
        </Modal.Content>
      </Modal>
    </>
  );
}
