"use client";

import React, { useRef, useState, useEffect, useMemo } from "react";
import { InputTypeIn } from "@opal/components";
import { ProjectFile } from "@/providers/ProjectsContext";
import Text from "@/refresh-components/texts/Text";
import type { IconProps } from "@opal/types";
import { getFileExtension, isImageExtension } from "@/lib/utils";
import { UserFileStatus } from "@/app/app/projects/projectsService";
import AttachmentButton from "@/refresh-components/buttons/AttachmentButton";
import Modal from "@/refresh-components/Modal";
import { useModal } from "@/refresh-components/contexts/ModalContext";
import TextSeparator from "@/refresh-components/TextSeparator";
import {
  SvgEye,
  SvgFiles,
  SvgFileText,
  SvgImage,
  SvgPlusCircle,
  SvgTrash,
  SvgXCircle,
  SvgSimpleLoader,
} from "@opal/icons";
import { Section } from "@/layouts/general-layouts";
import useFilter from "@/hooks/useFilter";
import { Button } from "@opal/components";
import ScrollIndicatorDiv from "@/refresh-components/ScrollIndicatorDiv";
import { timeAgo } from "@opal/time";
import { useUser } from "@/providers/UserProvider";
import { useLlmDefaults } from "@/lib/languageModels/hooks";
import { Callout } from "@/components/ui/callout";
import Link from "next/link";
import { ADMIN_ROUTES } from "@/lib/admin-routes";
import { useTranslation } from "@/providers/LanguageProvider";

function getIcon(
  file: ProjectFile,
  isProcessing: boolean
): React.FunctionComponent<IconProps> {
  if (isProcessing) return SvgSimpleLoader;
  const ext = getFileExtension(file.name).toLowerCase();
  if (isImageExtension(ext)) return SvgImage;
  return SvgFileText;
}

function getDescription(file: ProjectFile, t: (key: string) => string): string {
  const s = String(file.status || "");
  const typeLabel = getFileExtension(file.name);
  if (s === UserFileStatus.PROCESSING) return t("cards.processing");
  if (s === UserFileStatus.UPLOADING) return t("cards.uploading");
  if (s === UserFileStatus.DELETING) return t("cards.deleting");
  if (s === UserFileStatus.COMPLETED) return typeLabel;
  return file.status ?? typeLabel;
}

interface FileAttachmentProps {
  file: ProjectFile;
  isSelected: boolean;
  onClick?: () => void;
  onView?: () => void;
  onDelete?: () => void;
  t: (key: string) => string;
}

function FileAttachment({
  file,
  isSelected,
  onClick,
  onView,
  onDelete,
  t,
}: FileAttachmentProps) {
  const isProcessing =
    String(file.status) === UserFileStatus.PROCESSING ||
    String(file.status) === UserFileStatus.UPLOADING ||
    String(file.status) === UserFileStatus.DELETING;

  const Icon = getIcon(file, isProcessing);
  const description = getDescription(file, t);
  const rightText = file.last_accessed_at
    ? (timeAgo(file.last_accessed_at) ?? "")
    : "";

  return (
    <AttachmentButton
      onClick={onClick}
      icon={Icon}
      description={description}
      rightText={rightText}
      selected={isSelected}
      processing={isProcessing}
      onView={onView}
      actionIcon={SvgTrash}
      onAction={onDelete}
    >
      {file.name}
    </AttachmentButton>
  );
}

export interface UserFilesModalProps {
  // Modal content
  title: string;
  description: string;
  recentFiles: ProjectFile[];
  handleUploadChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selectedFileIds?: string[];

  // FileAttachment related
  onView?: (file: ProjectFile) => void;
  onDelete?: (file: ProjectFile) => void;
  onPickRecent?: (file: ProjectFile) => void;
  onUnpickRecent?: (file: ProjectFile) => void;
}

export default function UserFilesModal({
  title,
  description,
  recentFiles,
  handleUploadChange,
  selectedFileIds,

  onView,
  onDelete,
  onPickRecent,
  onUnpickRecent,
}: UserFilesModalProps) {
  const { t } = useTranslation();
  const { isOpen, toggle } = useModal();
  const { isAdmin } = useUser();
  const { hasAnyLlm, isLoading: isLoadingLlm } = useLlmDefaults();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(selectedFileIds || [])
  );
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const triggerUploadPicker = () => fileInputRef.current?.click();

  useEffect(() => {
    if (selectedFileIds) setSelectedIds(new Set(selectedFileIds));
    else setSelectedIds(new Set());
  }, [selectedFileIds]);

  const selectedCount = selectedIds.size;

  function handleDeselectAll() {
    selectedIds.forEach((id) => {
      const file = recentFiles.find((f) => f.id === id);
      if (file) {
        onUnpickRecent?.(file);
      }
    });
    setSelectedIds(new Set());
  }

  const files = useMemo(
    () =>
      showOnlySelected
        ? recentFiles.filter((projectFile) => selectedIds.has(projectFile.id))
        : recentFiles,
    [showOnlySelected, recentFiles, selectedIds]
  );

  const { query, setQuery, filtered } = useFilter(files, (file) => file.name);

  return (
    <>
      {/* Hidden file input */}
      {handleUploadChange && (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleUploadChange}
          disabled={!hasAnyLlm}
        />
      )}

      <Modal open={isOpen} onOpenChange={toggle}>
        <Modal.Content
          width="sm"
          height="lg"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            searchInputRef.current?.focus();
          }}
          preventAccidentalClose={false}
        >
          <Modal.Header icon={SvgFiles} title={title} description={description}>
            {/* Search bar section */}
            <Section flexDirection="row" gap={0.5}>
              <InputTypeIn
                ref={searchInputRef}
                placeholder={t("modals.searchFilesPlaceholder")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                searchIcon
                autoComplete="off"
                tabIndex={0}
                onFocus={(e) => {
                  e.target.select();
                }}
              />
              {handleUploadChange && (
                <Button
                  icon={SvgPlusCircle}
                  prominence="internal"
                  onClick={triggerUploadPicker}
                  disabled={!hasAnyLlm}
                >
                  {t("modals.addFiles")}
                </Button>
              )}
            </Section>
          </Modal.Header>

          <Modal.Body
            padding={filtered.length === 0 ? 0.5 : 0}
            gap={0.5}
            alignItems="center"
          >
            {!isLoadingLlm && !hasAnyLlm && (
              <div className="w-full px-4 mb-2">
                <Callout type="warning" title={t("modals.aiModelNotConfigured")}>
                  {isAdmin ? (
                    <span>
                      {t("modals.noLlmConfiguredUploadAdmin")}{" "}
                      <Link
                        href={ADMIN_ROUTES.LLM_MODELS.path}
                        className="underline font-bold text-amber-800 dark:text-amber-200"
                        onClick={() => toggle(false)}
                      >
                        {t("modals.configureHere")}
                      </Link>
                    </span>
                  ) : (
                    <span>
                      {t("modals.noLlmConfiguredUploadContactAdmin")}
                    </span>
                  )}
                </Callout>
              </div>
            )}
            {/* File display section */}
            {filtered.length === 0 ? (
              <Text text03>{t("modals.noFilesFound")}</Text>
            ) : (
              <ScrollIndicatorDiv className="p-2 gap-2 max-h-[70vh]">
                {filtered.map((projectFle) => {
                  const isSelected = selectedIds.has(projectFle.id);
                  return (
                    <FileAttachment
                      key={projectFle.id}
                      file={projectFle}
                      isSelected={isSelected}
                      t={t}
                      onClick={
                        onPickRecent
                          ? () => {
                              if (isSelected) {
                                onUnpickRecent?.(projectFle);
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  next.delete(projectFle.id);
                                  return next;
                                });
                              } else {
                                onPickRecent(projectFle);
                                setSelectedIds((prev) => {
                                  const next = new Set(prev);
                                  next.add(projectFle.id);
                                  return next;
                                });
                              }
                            }
                          : undefined
                      }
                      onView={onView ? () => onView(projectFle) : undefined}
                      onDelete={
                        onDelete ? () => onDelete(projectFle) : undefined
                      }
                    />
                  );
                })}

                {/* File count divider - only show when not searching or filtering */}
                {!query.trim() && !showOnlySelected && (
                  <TextSeparator
                    count={recentFiles.length}
                    text={recentFiles.length === 1 ? t("modals.file") : t("modals.files")}
                  />
                )}
              </ScrollIndicatorDiv>
            )}
          </Modal.Body>

          <Modal.Footer>
            {/* Left side: file count and controls */}
            {onPickRecent && (
              <Section flexDirection="row" justifyContent="start" gap={0.5}>
                <Text as="p" text03>
                  {selectedCount} {selectedCount === 1 ? t("modals.file") : t("modals.files")}{" "}
                  {t("modals.selected")}
                </Text>
                <Button
                  icon={SvgEye}
                  prominence="tertiary"
                  size="sm"
                  onClick={() => setShowOnlySelected(!showOnlySelected)}
                  interaction={showOnlySelected ? "hover" : "rest"}
                />
                <Button
                  disabled={selectedCount === 0}
                  icon={SvgXCircle}
                  prominence="tertiary"
                  size="sm"
                  onClick={handleDeselectAll}
                />
              </Section>
            )}

            {/* Right side: Done button */}
            <Button prominence="secondary" onClick={() => toggle(false)}>
              {t("common.done")}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal>
    </>
  );
}
