import { DefaultDropdown } from "@/components/Dropdown";
import {
  AccessType,
  ValidAutoSyncSource,
  ConfigurableSources,
  validAutoSyncSources,
} from "@/lib/types";
import { useField } from "formik";
import { AutoSyncOptions } from "./AutoSyncOptions";
import { useTierAtLeast } from "@/hooks/useTierAtLeast";
import { Tier } from "@/lib/settings/types";
import { useEffect, useMemo } from "react";
import { Credential } from "@/lib/connectors/credentials";
import { credentialTemplates } from "@/lib/connectors/credentials";
import { useTranslation } from "@/providers/LanguageProvider";

function isValidAutoSyncSource(
  value: ConfigurableSources
): value is ValidAutoSyncSource {
  return validAutoSyncSources.includes(value as ValidAutoSyncSource);
}

export function AccessTypeForm({
  connector,
  currentCredential,
}: {
  connector: ConfigurableSources;
  currentCredential?: Credential<any> | null;
}) {
  const { t } = useTranslation();
  const [access_type, meta, access_type_helpers] =
    useField<AccessType>("access_type");

  // Private requires User Groups, Auto Sync requires permission-sync —
  // both are Business+ features.
  const businessTier = useTierAtLeast(Tier.BUSINESS);
  const showAutoSync = businessTier && isValidAutoSyncSource(connector);

  const selectedAuthMethod = currentCredential?.credential_json?.[
    "authentication_method"
  ] as string | undefined;

  // If the selected auth method is one that disables sync, return true
  const isSyncDisabledByAuth = useMemo(() => {
    const template = (credentialTemplates as any)[connector];
    const authMethods = template?.authMethods as
      | { value: string; disablePermSync?: boolean }[]
      | undefined; // auth methods are returned as an array of objects with a value and disablePermSync property
    if (!authMethods || !selectedAuthMethod) return false;
    const method = authMethods.find((m) => m.value === selectedAuthMethod);
    return method?.disablePermSync === true;
  }, [connector, selectedAuthMethod]);

  // Prefer Auto Sync when available, else Private (User Groups), else
  // Public. Mirrors the option-availability rules below.
  const defaultAccess: AccessType = showAutoSync
    ? "sync"
    : businessTier
      ? "private"
      : "public";

  useEffect(() => {
    if (!access_type.value) access_type_helpers.setValue(defaultAccess);
  }, [
    // Only run this effect once when the component mounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  // Build options in display order: Private, Public, Auto Sync.
  const options: {
    name: string;
    value: string;
    description: string;
    disabled: boolean;
    disabledReason: string;
  }[] = [];

  if (businessTier) {
    options.push({
      name: t("connectorCCPair.privateName"),
      value: "private",
      description: t("connectorCCPair.privateDesc"),
      disabled: false,
      disabledReason: "",
    });
  }

  options.push({
    name: t("connectorCCPair.publicName"),
    value: "public",
    description: t("connectorCCPair.publicDesc"),
    disabled: false,
    disabledReason: "",
  });

  if (showAutoSync) {
    options.push({
      name: t("connectorCCPair.syncName"),
      value: "sync",
      description: t("connectorCCPair.syncDesc"),
      disabled: isSyncDisabledByAuth,
      disabledReason: t("connectorCCPair.syncDisabledReason"),
    });
  }

  if (!businessTier) return null;

  return (
    <>
      <div>
        <label className="text-text-950 font-medium">{t("connectorCCPair.documentAccess")}</label>
        <p className="text-sm text-text-500">
          {t("connectorCCPair.documentAccessDesc")}
        </p>
      </div>
      <DefaultDropdown
        options={options}
        selected={access_type.value}
        onSelect={(selected) =>
          access_type_helpers.setValue(selected as AccessType)
        }
        includeDefault={false}
      />
      {access_type.value === "sync" && showAutoSync && (
        <AutoSyncOptions connectorType={connector as ValidAutoSyncSource} />
      )}
    </>
  );
}
