import { toast } from "@/hooks/useToast";
import { createConnector, runConnector } from "@/lib/connector";
import { linkCredential } from "@/lib/credential";
import { GoogleSitesConfig } from "@/lib/connectors/connectors";
import { ValidSources } from "@/lib/types";

export const submitGoogleSite = async (
  selectedFiles: File[],
  base_url: any,
  refreshFreq: number,
  pruneFreq: number,
  indexingStart: Date,
  access_type: string,
  groups: number[],
  t: (key: string, replacements?: Record<string, string | number>) => string,
  name?: string
) => {
  const uploadCreateAndTriggerConnector = async () => {
    const formData = new FormData();

    selectedFiles.forEach((file) => {
      formData.append("files", file);
    });

    const response = await fetch(
      "/api/manage/admin/connector/file/upload?unzip=false",
      {
        method: "POST",
        body: formData,
      }
    );
    const responseJson = await response.json();
    if (!response.ok) {
      toast.error(t("addConnector.toastUnableUpload", { error: responseJson.detail }));
      return false;
    }

    const filePaths = responseJson.file_paths as string[];
    if (!filePaths || filePaths.length === 0) {
      toast.error(t("addConnector.toastNoFilePathReturned"));
      return false;
    }

    const filePath = filePaths[0];
    if (filePath === undefined) {
      toast.error(t("addConnector.toastFilePathUndefined"));
      return false;
    }

    const [connectorErrorMsg, connector] =
      await createConnector<GoogleSitesConfig>({
        name: name ? name : `GoogleSitesConnector-${base_url}`,
        source: ValidSources.GoogleSites,
        input_type: "load_state",
        connector_specific_config: {
          base_url: base_url,
          zip_path: filePath,
        },
        access_type: access_type,
        refresh_freq: refreshFreq,
        prune_freq: pruneFreq,
        indexing_start: indexingStart,
      });
    if (connectorErrorMsg || !connector) {
      toast.error(t("addConnector.toastUnableCreateConnector", { error: connectorErrorMsg || "" }));
      return false;
    }

    const credentialResponse = await linkCredential(
      connector.id,
      0,
      base_url,
      undefined,
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
    toast.success(t("addConnector.toastGoogleSiteCreated"));
    return true;
  };

  try {
    const response = await uploadCreateAndTriggerConnector();
    return response;
  } catch (e) {
    return false;
  }
};
