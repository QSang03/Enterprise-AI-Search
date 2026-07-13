import { Tag, ValidSources } from "../types";
import {
  Filters,
  MinimalOnyxDocument,
  OnyxDocument,
  SourceMetadata,
} from "./interfaces";
import { DateRangePickerValue } from "@/components/dateRangeSelectors/AdminDateRangeSelector";
import { toast } from "@/hooks/useToast";
import { copyText } from "@opal/utils";

export const buildFilters = (
  sources: SourceMetadata[],
  documentSets: string[],
  timeRange: DateRangePickerValue | null,
  tags: Tag[]
): Filters => {
  const filters = {
    source_type:
      sources.length > 0 ? sources.map((source) => source.internalName) : null,
    document_set: documentSets.length > 0 ? documentSets : null,
    time_cutoff: timeRange?.from ? timeRange.from : null,
    tags: tags,
  };

  return filters;
};

export function convertSmbToUnc(smbUrl: string): string {
  let path = smbUrl.replace(/^smb:\/\/|^smb:/i, "");
  path = path.replace(/^\/+/, "");
  try {
    path = decodeURIComponent(path);
  } catch (e) {
    // ignore
  }
  path = path.replace(/\//g, "\\");
  return "\\\\" + path;
}

export function openLink(url: string) {
  if (url.startsWith("smb://") || url.startsWith("smb:")) {
    const uncPath = convertSmbToUnc(url);
    
    // Try to open directly using the custom protocol
    window.open(`onyx-open://open?path=${encodeURIComponent(uncPath)}`);

    copyText(uncPath)
      .then(() => {
        toast({
          message: "Copied Windows path (UNC) to clipboard!",
          description: uncPath,
          level: "success",
        });
      })
      .catch((err) => {
        console.error("Failed to copy path: ", err);
        toast({
          message: "Failed to copy path to clipboard.",
          level: "error",
        });
      });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

// If we have a link, open it in a new tab (including if it's a file)
// If above fails and we have a file, update the presenting document
export const openDocument = (
  document: OnyxDocument,
  updatePresentingDocument?: (document: MinimalOnyxDocument) => void
) => {
  if (document.link) {
    openLink(document.link);
  } else if (
    document.source_type === ValidSources.File ||
    document.source_type === ValidSources.UserFile
  ) {
    updatePresentingDocument?.(document);
  }
};
