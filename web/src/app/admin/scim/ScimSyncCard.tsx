import { SvgCheckCircle, SvgClock, SvgKey, SvgRefreshCw } from "@opal/icons";
import { ContentAction } from "@opal/layouts";
import { Section } from "@/layouts/general-layouts";
import Card from "@/refresh-components/cards/Card";
import { Button, Divider } from "@opal/components";
import Text from "@/refresh-components/texts/Text";
import { timeAgo } from "@opal/time";
import { useTranslation } from "@/providers/LanguageProvider";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ScimSyncCardProps {
  hasToken: boolean;
  isConnected: boolean;
  lastUsedAt: string | null;
  idpDomain: string | null;
  isSubmitting: boolean;
  onGenerate: () => void;
  onRegenerate: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScimSyncCard({
  hasToken,
  isConnected,
  lastUsedAt,
  idpDomain,
  isSubmitting,
  onGenerate,
  onRegenerate,
}: ScimSyncCardProps) {
  const { t } = useTranslation();

  return (
    <Card gap={0.75}>
      <ContentAction
        title={t("scim.title")}
        description={t("scim.description")}
        sizePreset="main-ui"
        variant="section"
        padding="fit"
        rightChildren={
          hasToken ? (
            <Button
              variant="danger"
              prominence="secondary"
              onClick={onRegenerate}
              icon={SvgRefreshCw}
            >
              {t("scim.regenerateToken")}
            </Button>
          ) : (
            <Button
              disabled={isSubmitting}
              rightIcon={SvgKey}
              onClick={onGenerate}
            >
              {t("scim.generateScimToken")}
            </Button>
          )
        }
      />

      {hasToken && (
        <>
          <Divider paddingParallel="fit" paddingPerpendicular="fit" />

          <Section
            flexDirection="row"
            justifyContent="between"
            alignItems="end"
            gap={1}
          >
            <Section alignItems="start" gap={0} width="fit">
              {isConnected ? (
                <SvgCheckCircle size={15} className="text-status-success-05" />
              ) : (
                <SvgClock size={15} className="text-theme-amber-05" />
              )}
              <Text as="p" mainUiBody text04>
                {isConnected ? t("scim.connected") : t("scim.waitingConnection")}
              </Text>
            </Section>

            <Section alignItems="end" gap={0} width="fit">
              {isConnected ? (
                <>
                  {idpDomain && (
                    <Text as="p" secondaryAction text03>
                      {idpDomain}
                    </Text>
                  )}
                  <Text as="p" secondaryBody text03>
                    {timeAgo(lastUsedAt)}
                  </Text>
                </>
              ) : (
                <Text
                  as="p"
                  secondaryBody
                  text03
                  className="max-w-[240px] text-right"
                >
                  {t("scim.provideKeyDesc")}
                </Text>
              )}
            </Section>
          </Section>
        </>
      )}
    </Card>
  );
}
