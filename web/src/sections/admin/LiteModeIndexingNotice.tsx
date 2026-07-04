import { IllustrationContent } from "@opal/layouts";
import { Section } from "@/layouts/general-layouts";
import SvgUnPlugged from "@opal/illustrations/un-plugged";
import { markdown } from "@opal/utils";
import { DOCS_BASE_URL } from "@/lib/constants";
import { useTranslation } from "@/providers/LanguageProvider";

const DEPLOYMENT_DOCS_URL = `${DOCS_BASE_URL}/deployment/getting_started/quickstart`;

/**
 * Replaces connector/indexing admin pages in Lite mode (no vector DB), where
 * indexing can't run — points users at a Standard-mode deployment instead.
 */
export default function LiteModeIndexingNotice() {
  const { t } = useTranslation();

  return (
    <Section padding={2}>
      <IllustrationContent
        illustration={SvgUnPlugged}
        title={t("admin.liteModeTitle")}
        description={markdown(
          t("admin.liteModeDesc", { docsUrl: DEPLOYMENT_DOCS_URL })
        )}
      />
    </Section>
  );
}
