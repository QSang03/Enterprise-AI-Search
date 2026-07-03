"use client";

import { useRef, useState } from "react";
import { Button, Text } from "@opal/components";
import { SvgUploadCloud } from "@opal/icons";
import Modal from "@/refresh-components/Modal";
import { Section } from "@/layouts/general-layouts";
import { createUserSkill } from "@/lib/skills/api";
import { toast } from "@/hooks/useToast";

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
      toast.success(`Đã tạo "${created.name}"`);
      reset();
      onCreated();
      onClose();
    } catch (err) {
      console.error("Failed to create personal skill", err);
      // Surface the server detail (duplicate slug, reserved slug, cap reached)
      // inline so the user can act on it.
      setErrorMessage(
        err instanceof Error ? err.message : "Không thể tạo kỹ năng"
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
          title="Tạo kỹ năng"
          description="Tải lên gói zip. Tên tệp zip sẽ trở thành slug, và phần frontmatter của tệp SKILL.md sẽ cung cấp tên + mô tả. Các kỹ năng cá nhân chỉ hiển thị với riêng bạn."
          onClose={handleClose}
        />
        <Modal.Body>
          <Section gap={0.5} alignItems="stretch">
            <Section gap={0.25} alignItems="stretch">
              <Text font="main-ui-action" color="text-05">
                Gói kỹ năng (.zip)
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
                  {file ? "Thay đổi tệp" : "Chọn tệp zip"}
                </Button>
                <Text font="main-ui-body" color="text-03">
                  {file ? file.name : "Chưa chọn tệp"}
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
            Hủy
          </Button>
          <Button
            disabled={submitDisabled}
            onClick={handleSubmit}
            icon={SvgUploadCloud}
          >
            {submitting ? "Đang tạo…" : "Tạo"}
          </Button>
        </Modal.Footer>
      </Modal.Content>
    </Modal>
  );
}
