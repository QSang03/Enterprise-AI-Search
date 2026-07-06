import { toast } from "@/hooks/useToast";
import { createConnector, runConnector } from "@/lib/connector";
import { createCredential, linkCredential } from "@/lib/credential";
import { FileConfig } from "@/lib/connectors/connectors";
import { AccessType, ValidSources } from "@/lib/types";

export const submitFiles = async (
  selectedFiles: File[],
  name: string,
  access_type: string,
  groups: number[] | undefined,
  t: (key: string, replacements?: Record<string, string | number>) => string
) => {
  const formData = new FormData();

  selectedFiles.forEach((file) => {
    formData.append("files", file);
  });

  const response = await fetch("/api/manage/admin/connector/file/upload", {
    method: "POST",
    body: formData,
  });
  const responseJson = await response.json();
  if (!response.ok) {
    toast.error(t("addConnector.toastUnableUpload", { error: responseJson.detail }));
    return;
  }

  const filePaths = responseJson.file_paths as string[];
  const fileNames = responseJson.file_names as string[];
  const zipMetadataFileId = responseJson.zip_metadata_file_id as string | null;

  const [connectorErrorMsg, connector] = await createConnector<FileConfig>({
    name: "FileConnector-" + Date.now(),
    source: ValidSources.File,
    input_type: "load_state",
    connector_specific_config: {
      file_locations: filePaths,
      file_names: fileNames,
      zip_metadata_file_id: zipMetadataFileId,
    },
    refresh_freq: null,
    prune_freq: null,
    indexing_start: null,
    access_type: access_type,
    groups: groups,
  });
  if (connectorErrorMsg || !connector) {
    toast.error(t("addConnector.toastUnableCreateConnector", { error: connectorErrorMsg || "" }));
    return;
  }

  // Since there is no "real" credential associated with a file connector
  // we create a dummy one here so that we can associate the CC Pair with a
  // user. This is needed since the user for a CC Pair is found via the credential
  // associated with it.
  const createCredentialResponse = await createCredential({
    credential_json: {},
    admin_public: true,
    source: ValidSources.File,
    curator_public: true,
    groups: groups,
    name,
  });
  if (!createCredentialResponse.ok) {
    const errorMsg = await createCredentialResponse.text();
    toast.error(t("addConnector.toastErrorCreatingCredential", { error: errorMsg }));
    return false;
  }
  const credentialId = (await createCredentialResponse.json()).id;

  const credentialResponse = await linkCredential(
    connector.id,
    credentialId,
    name,
    access_type as AccessType,
    groups
  );
  if (!credentialResponse.ok) {
    const credentialResponseJson = await credentialResponse.json();
    toast.error(
      t("addConnector.toastUnableLink", { error: credentialResponseJson.detail })
    );
    return false;
  }

  const runConnectorErrorMsg = await runConnector(connector.id, [0]);
  if (runConnectorErrorMsg) {
    toast.error(t("addConnector.toastUnableRun", { error: runConnectorErrorMsg }));
    return false;
  }

  toast.success(t("addConnector.toastFilesUploaded"));
  return true;
};
