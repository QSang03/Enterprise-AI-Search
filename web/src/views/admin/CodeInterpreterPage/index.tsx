"use client";

import { useState } from "react";
import { SettingsLayouts } from "@opal/layouts";
import {
  SvgArrowExchange,
  SvgCheckCircle,
  SvgRefreshCw,
  SvgTerminal,
  SvgUnplug,
  SvgXOctagon,
  SvgSimpleLoader,
} from "@opal/icons";
import { ADMIN_ROUTES } from "@/lib/admin-routes";
import { Section } from "@/layouts/general-layouts";
import { Button, SelectCard } from "@opal/components";
import { Card, Content, ContentAction } from "@opal/layouts";
import { Disabled, Hoverable } from "@opal/core";
import Text from "@/refresh-components/texts/Text";
import ConfirmationModalLayout from "@/refresh-components/layouts/ConfirmationModalLayout";
import useCodeInterpreter from "@/hooks/useCodeInterpreter";
import { updateCodeInterpreter } from "@/views/admin/CodeInterpreterPage/svc";
import { toast } from "@/hooks/useToast";
import { cn } from "@opal/utils";
import { useTranslation } from "@/providers/LanguageProvider";

const route = ADMIN_ROUTES.CODE_INTERPRETER;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CheckingStatus() {
  const { t } = useTranslation();
  return (
    <Section
      flexDirection="row"
      justifyContent="end"
      alignItems="center"
      gap={0.25}
      padding={0.5}
    >
      <Text mainUiAction text03>
        {t("admin.codeInterpreter.checking")}
      </Text>
      <SvgSimpleLoader />
    </Section>
  );
}

interface ConnectionStatusProps {
  healthy: boolean;
  isLoading: boolean;
}

function ConnectionStatus({ healthy, isLoading }: ConnectionStatusProps) {
  const { t } = useTranslation();
  if (isLoading) {
    return <CheckingStatus />;
  }

  const label = healthy ? t("admin.codeInterpreter.connected") : t("admin.codeInterpreter.connectionLost");
  const Icon = healthy ? SvgCheckCircle : SvgXOctagon;
  const iconColor = healthy
    ? "text-status-success-05!"
    : "text-status-error-05!";

  return (
    <div className="p-2">
      <Content
        title={label}
        icon={(props) => (
          <Icon {...props} className={cn(props.className, iconColor)} />
        )}
        sizePreset="main-ui"
        variant="body"
        orientation="reverse"
        color="muted"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CodeInterpreterPage() {
  const { t } = useTranslation();
  const { isHealthy, isEnabled, isLoading, refetch } = useCodeInterpreter();
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  async function handleToggle(enabled: boolean) {
    const action = enabled ? "reconnect" : "disconnect";
    setIsReconnecting(enabled);
    try {
      const response = await updateCodeInterpreter({ enabled });
      if (!response.ok) {
        toast.error(enabled ? t("admin.codeInterpreter.failedReconnect") : t("admin.codeInterpreter.failedDisconnect"));
        return;
      }
      setShowDisconnectModal(false);
      refetch();
    } finally {
      setIsReconnecting(false);
    }
  }

  return (
    <SettingsLayouts.Root>
      <SettingsLayouts.Header
        icon={route.icon}
        title={t("admin.codeInterpreter.title")}
        description={t("admin.codeInterpreter.headerDesc")}
        divider
      />

      <SettingsLayouts.Body>
        {isEnabled || isLoading ? (
          <Hoverable.Root
            group="code-interpreter/Card"
            interaction={showDisconnectModal ? "hover" : "rest"}
          >
            <SelectCard state="filled" padding="sm" rounding="lg">
              <Card.Header>
                <ContentAction
                  sizePreset="main-ui"
                  variant="section"
                  icon={SvgTerminal}
                  title={t("admin.codeInterpreter.title")}
                  description={t("admin.codeInterpreter.runtimeDesc")}
                  padding="lg"
                  rightChildren={
                    <Section alignItems="end" gap={0}>
                      <ConnectionStatus
                        healthy={isHealthy}
                        isLoading={isLoading}
                      />
                      <div className="px-1 pb-1">
                        <Section
                          flexDirection="row"
                          justifyContent="end"
                          gap={0.25}
                        >
                          <Disabled disabled={isLoading}>
                            <Hoverable.Item group="code-interpreter/Card">
                              <Button
                                prominence="tertiary"
                                size="md"
                                icon={SvgUnplug}
                                onClick={() => setShowDisconnectModal(true)}
                                tooltip={t("admin.codeInterpreter.disconnect")}
                              />
                            </Hoverable.Item>
                          </Disabled>
                          <Button
                            disabled={isLoading}
                            prominence="tertiary"
                            size="md"
                            icon={SvgRefreshCw}
                            onClick={refetch}
                            tooltip={t("admin.codeInterpreter.refresh")}
                          />
                        </Section>
                      </div>
                    </Section>
                  }
                />
              </Card.Header>
            </SelectCard>
          </Hoverable.Root>
        ) : (
          <SelectCard
            state="empty"
            padding="sm"
            rounding="lg"
            onClick={() => handleToggle(true)}
          >
            <ContentAction
              sizePreset="main-ui"
              variant="section"
              icon={SvgTerminal}
              title={t("admin.codeInterpreter.disconnectedTitle")}
              description={t("admin.codeInterpreter.runtimeDesc")}
              padding="lg"
              rightChildren={
                isReconnecting ? (
                  <CheckingStatus />
                ) : (
                  <Button
                    prominence="tertiary"
                    rightIcon={SvgArrowExchange}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggle(true);
                    }}
                  >
                    {t("admin.codeInterpreter.reconnect")}
                  </Button>
                )
              }
            />
          </SelectCard>
        )}
      </SettingsLayouts.Body>

      {showDisconnectModal && (
        <ConfirmationModalLayout
          icon={SvgUnplug}
          title={t("admin.codeInterpreter.disconnectConfirmTitle")}
          onClose={() => setShowDisconnectModal(false)}
          submit={
            <Button variant="danger" onClick={() => handleToggle(false)}>
              {t("admin.codeInterpreter.disconnect")}
            </Button>
          }
        >
          <Text as="p" text03>
            {t("admin.codeInterpreter.disconnectConfirmDesc")}
          </Text>
        </ConfirmationModalLayout>
      )}
    </SettingsLayouts.Root>
  );
}
