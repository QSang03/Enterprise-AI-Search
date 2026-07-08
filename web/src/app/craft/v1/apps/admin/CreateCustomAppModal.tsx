"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "@/refresh-components/Modal";
import {
  Button,
  InputTypeIn,
  MessageCard,
  Text,
  Tooltip,
} from "@opal/components";
import { SvgUploadCloud } from "@opal/icons";
import { ListFieldInput } from "@/refresh-components/inputs/ListFieldInput";
import InputKeyValue, {
  KeyValue,
} from "@/refresh-components/inputs/InputKeyValue";
import { ExternalAppAdminResponse } from "@/app/craft/v1/apps/registry";
import {
  createCustomExternalApp,
  replaceCustomAppBundle,
  updateExternalApp,
} from "@/app/craft/services/externalAppsService";
import { useTranslation } from "@/providers/LanguageProvider";

interface CreateCustomAppModalProps {
  open: boolean;
  onClose: () => void;
  /** Invoked after a successful create/edit so callers can refresh their list. */
  onSaved: () => void;
  /** Null → create a new custom app; non-null → edit that app's config. */
  existingApp: ExternalAppAdminResponse | null;
}

/** Collapse a key-value list into a record, dropping rows with an empty key. */
function toRecord(items: KeyValue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of items) {
    const trimmedKey = key.trim();
    if (trimmedKey) out[trimmedKey] = value;
  }
  return out;
}

/** Expand a record into editable rows, seeding one empty row when empty. */
function toKeyValues(record: Record<string, string>): KeyValue[] {
  const entries = Object.entries(record).map(([key, value]) => ({
    key,
    value,
  }));
  return entries.length > 0 ? entries : [{ key: "", value: "" }];
}

export default function CreateCustomAppModal({
  open,
  onClose,
  onSaved,
  existingApp,
}: CreateCustomAppModalProps) {
  const { t } = useTranslation();
  const isEdit = existingApp !== null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [upstreamPatterns, setUpstreamPatterns] = useState<string[]>([]);
  const [headers, setHeaders] = useState<KeyValue[]>([{ key: "", value: "" }]);
  const [orgCredentials, setOrgCredentials] = useState<KeyValue[]>([
    { key: "", value: "" },
  ]);
  const [file, setFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-seed every time the modal opens: from the existing app when editing,
  // blank when creating. Prevents a prior attempt from leaking in.
  useEffect(() => {
    if (!open) return;
    setName(existingApp?.name ?? "");
    setDescription(existingApp?.description ?? "");
    setUpstreamPatterns(existingApp?.upstream_url_patterns ?? []);
    setHeaders(
      existingApp
        ? toKeyValues(existingApp.auth_template)
        : [{ key: "", value: "" }]
    );
    setOrgCredentials(
      existingApp
        ? toKeyValues(existingApp.organization_credentials)
        : [{ key: "", value: "" }]
    );
    setFile(null);
    setError(null);
  }, [open, existingApp]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }

  // Headers and org credentials are optional; name + at least one upstream
  // pattern are required. A bundle is required only on create (optional on edit).
  const disabledCreateReason = (() => {
    if (isSaving) return "Save is already in progress.";
    if (name.trim().length === 0) {
      return "Enter a name before creating this custom app.";
    }
    if (upstreamPatterns.length === 0) {
      return "Add at least one upstream URL pattern. Type a pattern and press Enter.";
    }
    if (!isEdit && file === null) {
      return "Upload a bundle .zip file before creating this custom app.";
    }
    return null;
  })();
  const createButton = (
    <Button onClick={save} disabled={disabledCreateReason !== null}>
      {isSaving
        ? isEdit
          ? "Saving…"
          : "Creating…"
        : isEdit
          ? "Save"
          : "Create"}
    </Button>
  );

  async function save() {
    setIsSaving(true);
    setError(null);
    // Edit is two calls (bundle + fields); track the bundle step to message
    // partial success accurately.
    let bundleSaved = false;
    try {
      if (existingApp) {
        // Bundle first (the failure-prone step): a failure here leaves fields
        // unsent. Clear the file so a retry doesn't re-upload it.
        if (file) {
          await replaceCustomAppBundle(existingApp.id, file);
          setFile(null);
          bundleSaved = true;
        }
        // enabled is toggled separately on the card.
        await updateExternalApp(existingApp.id, {
          name: name.trim(),
          description: description.trim(),
          upstream_url_patterns: upstreamPatterns,
          auth_template: toRecord(headers),
          organization_credentials: toRecord(orgCredentials),
        });
      } else {
        // Create: bundle is required (enforced by `canSave`).
        await createCustomExternalApp({
          name: name.trim(),
          description: description.trim(),
          upstream_url_patterns: upstreamPatterns,
          auth_template: toRecord(headers),
          organization_credentials: toRecord(orgCredentials),
          enabled: true,
          bundle: file!,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      // A step may have committed; refresh the list to reflect what persisted.
      onSaved();
      const detail = e instanceof Error ? e.message : String(e);
      setError(
        bundleSaved
          ? `The new bundle was saved, but updating the other fields failed — retry to finish: ${detail}`
          : detail
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()}>
      <Modal.Content width="lg" height="lg">
        <Modal.Header
          title={existingApp ? `Edit ${existingApp.name}` : "Create custom app"}
          description={
            isEdit
              ? "Update this custom app's configuration, and optionally upload a new bundle to replace its files."
              : "Define a custom external app: upload its skill bundle and configure how the egress proxy authenticates outbound requests."
          }
        />
        <Modal.Body>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Text font="main-ui-action">{t("name")}</Text>
              <InputTypeIn
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("customAppNamePlaceholder")}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Text font="main-ui-action">{t("description")}</Text>
              <InputTypeIn
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("descriptionPlaceholder")}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Text font="main-ui-action">{t("upstreamUrlPatterns")}</Text>
              <Text font="secondary-body" color="text-03">
                {t("upstreamUrlPatternsDesc")}
              </Text>
              <ListFieldInput
                values={upstreamPatterns}
                onChange={setUpstreamPatterns}
                placeholder={t("apiUrlPlaceholder")}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Text font="main-ui-action">{t("headerCredentialPattern")}</Text>
              <Text font="secondary-body" color="text-03">
                {t("headerCredentialPatternDesc")}
              </Text>
              <InputKeyValue
                keyTitle={t("header")}
                valueTitle={t("value")}
                keyPlaceholder={t("authorizationPlaceholder")}
                valuePlaceholder={t("bearerPlaceholder")}
                items={headers}
                onChange={setHeaders}
                mode="line"
                addButtonLabel={t("addHeader")}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Text font="main-ui-action">{t("orgCredentialPattern")}</Text>
              <Text font="secondary-body" color="text-03">
                {t("orgCredentialPatternDesc")}
              </Text>
              <InputKeyValue
                keyTitle={t("credentialKey")}
                valueTitle={t("value")}
                keyPlaceholder={t("apiKeyPlaceholder")}
                valuePlaceholder={t("skPlaceholder")}
                items={orgCredentials}
                onChange={setOrgCredentials}
                mode="line"
                addButtonLabel={t("addCredential")}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Text font="main-ui-action">
                {isEdit ? t("replaceBundle") : t("bundle")}
              </Text>
              <Text font="secondary-body" color="text-03">
                {isEdit ? t("replaceBundleDesc") : t("bundleDesc")}
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
                  {file
                    ? "Change file"
                    : isEdit
                      ? "Choose new zip"
                      : "Choose zip"}
                </Button>
                <Text font="main-ui-body" color="text-03">
                  {file
                    ? file.name
                    : isEdit
                      ? "Keeping current bundle"
                      : "No file selected"}
                </Text>
              </div>
            </div>

            {error && (
              <MessageCard
                variant="error"
                title={t("couldntSave")}
                description={error}
              />
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <div className="flex justify-end gap-2 w-full">
            <Button
              prominence="secondary"
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            {disabledCreateReason ? (
              <Tooltip tooltip={disabledCreateReason}>
                <span className="inline-flex">{createButton}</span>
              </Tooltip>
            ) : (
              createButton
            )}
          </div>
        </Modal.Footer>
      </Modal.Content>
    </Modal>
  );
}
