"use client";

import { useRef, useState } from "react";
import { Button, Text } from "@opal/components";
import { SvgUploadCloud } from "@opal/icons";
import Modal from "@/refresh-components/Modal";
import { Section } from "@/layouts/general-layouts";
import { createUserSkill } from "@/lib/skills/api";
import { toast } from "@/hooks/useToast";
import { useTranslation } from "@/providers/LanguageProvider";

interface CreatePersonalSkillModalProps {
  open: boolean;
  onClose: () => void;
  /** Invoked after a successful upload so callers can refresh their list. */
  onCreated: () => void;
}

export default function CreatePersonalSkillModal({
  open,
  onClose,
  onCreated,
}: CreatePersonalSkillModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  function reset() {
    setFile(null);
    setErrorMessage(null);
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setErrorMessage(null);
  }

  async function handleSubmit() {
    if (!file) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const created = await createUserSkill(file);
      toast.success(t("skills.createSuccess", { name: created.name }));
      reset();
      onCreated();
      onClose();
    } catch (err) {
      console.error("Failed to create personal skill", err);
      // Surface the server detail (duplicate slug, reserved slug, cap reached)
      // inline so the user can act on it.
      setErrorMessage(
        err instanceof Error ? err.message : t("skills.failedCreate")
      );
    } finally {
      setSubmitting(false);
    }
  }

  const submitDisabled = submitting || !file;

  return (
    <Modal open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <Modal.Content width="md">
        <Modal.Header
          icon={SvgUploadCloud}
          title={t("skills.createSkillTitle")}
          description={t("skills.createSkillDesc")}
          onClose={handleClose}
        />
        <Modal.Body>
          <Section gap={0.5} alignItems="stretch">
            <Section gap={0.25} alignItems="stretch">
              <Text font="main-ui-action" color="text-05">
                {t("skills.zipPackageLabel")}
              </Text>
              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,application/zip"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  icon={SvgUploadCloud}
                  prominence="secondary"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {file ? t("skills.changeFile") : t("skills.selectZipFile")}
                </Button>
                <Text font="main-ui-body" color="text-03">
                  {file ? file.name : t("skills.noFileSelected")}
                </Text>
              </div>
            </Section>

            {errorMessage && (
              <Text as="p" font="secondary-body" color="status-error-05">
                {errorMessage}
              </Text>
            )}
          </Section>
        </Modal.Body>
        <Modal.Footer>
          <Button prominence="secondary" onClick={handleClose}>
            {t("skills.cancel")}
          </Button>
          <Button
            disabled={submitDisabled}
            onClick={handleSubmit}
            icon={SvgUploadCloud}
          >
            {submitting ? t("skills.creating") : t("skills.createBtn")}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal>
  );
}
