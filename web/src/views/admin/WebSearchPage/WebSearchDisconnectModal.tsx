"use client";

import { useState } from "react";
import { Button, Text } from "@opal/components";
import { SvgUnplug } from "@opal/icons";
import { markdown } from "@opal/utils";
import { Section } from "@/layouts/general-layouts";
import ConfirmationModalLayout from "@/refresh-components/layouts/ConfirmationModalLayout";
import { useModalClose } from "@/refresh-components/contexts/ModalContext";
import { toast } from "@/hooks/useToast";
import { useWebSearchProviders } from "@/lib/webSearch/hooks";
import { useTranslation } from "@/providers/LanguageProvider";
import { disconnectProvider } from "@/lib/webSearch/svc";
import type { DisconnectTargetState } from "@/lib/webSearch/types";

interface WebSearchDisconnectModalProps {
  disconnectTarget: DisconnectTargetState;
}

export function WebSearchDisconnectModal({
  disconnectTarget,
}: WebSearchDisconnectModalProps) {
  const { t } = useTranslation();
  const onClose = useModalClose();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    searchProviders,
    contentProviders,
    mutateSearchProviders,
    mutateContentProviders,
  } = useWebSearchProviders();

  const isSearch = disconnectTarget.category === "search";
  const hasAnotherProvider = isSearch
    ? searchProviders.some(
        (p) => p.masked_api_key && p.id !== disconnectTarget.id
      )
    : contentProviders.some(
        (p) => p.masked_api_key && p.id !== disconnectTarget.id
      );

  const siblingCategory = isSearch ? "content" : "search";
  const exaSibling =
    disconnectTarget.providerType === "exa"
      ? isSearch
        ? contentProviders.find((p) => p.provider_type === "exa" && p.id > 0)
        : searchProviders.find((p) => p.provider_type === "exa" && p.id > 0)
      : undefined;

  async function handleDisconnect() {
    setIsSubmitting(true);
    try {
      await disconnectProvider(disconnectTarget.id, disconnectTarget.category);
      if (exaSibling) {
        await disconnectProvider(exaSibling.id, siblingCategory);
      }
      toast.success(t("admin.webSearch.disconnectedSuccess", { name: disconnectTarget.label }));
      onClose?.();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("admin.webSearch.unexpectedError");
      toast.error(message);
    } finally {
      await Promise.allSettled([
        mutateSearchProviders(),
        mutateContentProviders(),
      ]);
      setIsSubmitting(false);
    }
  }

  return (
    <ConfirmationModalLayout
      icon={SvgUnplug}
      title={t("admin.webSearch.disconnectTitle", { name: disconnectTarget.label })}
      description={t("admin.webSearch.disconnectDesc")}
      submit={
        <Button
          variant="danger"
          onClick={() => void handleDisconnect()}
          disabled={isSubmitting}
        >
          {t("admin.webSearch.disconnectBtn")}
        </Button>
      }
    >
      <Section alignItems="start" gap={0.5}>
        {isSearch ? (
          <>
            <Text color="text-03">
              {markdown(
                t("admin.webSearch.searchDisconnectExplain", { name: disconnectTarget.label })
              )}
            </Text>
            {!hasAnotherProvider && (
              <Text color="text-03">
                {t("admin.webSearch.connectAnotherEngine")}
              </Text>
            )}
          </>
        ) : (
          <>
            <Text color="text-03">
              {markdown(
                t("admin.webSearch.crawlerDisconnectExplain", { name: disconnectTarget.label })
              )}
            </Text>
            {!hasAnotherProvider && (
              <Text color="text-03">
                {t("admin.webSearch.fallbackCrawler")}
              </Text>
            )}
          </>
        )}
      </Section>
    </ConfirmationModalLayout>
  );
}
