import { ValidSources } from "@/lib/types";
import { getSourceDocLink } from "@/lib/sources";
import { useTranslation } from "@/providers/LanguageProvider";

export default function ConnectorDocsLink({
  sourceType,
  className,
}: {
  sourceType: ValidSources;
  className?: string;
}) {
  const { t } = useTranslation();
  const docsLink = getSourceDocLink(sourceType);

  if (!docsLink) {
    return null;
  }

  const paragraphClass = ["text-sm", className].filter(Boolean).join(" ");

  return (
    <p className={paragraphClass}>
      {t("connectorCCPair.checkOutDocsPrefix")}{" "}
      <a
        className="text-blue-600 hover:underline"
        target="_blank"
        rel="noopener"
        href={docsLink}
      >
        {t("connectorCCPair.checkOutDocsLink")}
      </a>{" "}
      {t("connectorCCPair.checkOutDocsSuffix")}
    </p>
  );
}
