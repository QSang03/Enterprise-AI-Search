import { Button, Text } from "@opal/components";
import { PreviewVariant } from "@/sections/modals/PreviewModal/interfaces";
import { DownloadButton } from "@/sections/modals/PreviewModal/variants/shared";
import { useTranslation } from "@/providers/LanguageProvider";

export const unsupportedVariant: PreviewVariant = {
  matches: () => true,
  width: "xl",
  height: "full",
  needsTextContent: false,
  codeBackground: false,
  headerDescription: () => "",

  renderContent: (ctx) => {
    const { t } = useTranslation();
    return (
      <div className="flex flex-col items-center justify-center flex-1 w-full min-h-0 gap-4 p-6">
        <Text as="p" font="main-ui-body" color="text-03">
          {t("modals.unsupportedPreview")}
        </Text>
        <a href={ctx.fileUrl} download={ctx.fileName}>
          <Button>{t("modals.downloadFile")}</Button>
        </a>
      </div>
    );
  },

  renderFooterLeft: () => null,
  renderFooterRight: (ctx) => (
    <DownloadButton fileUrl={ctx.fileUrl} fileName={ctx.fileName} />
  ),
};
