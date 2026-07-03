"use client";

import { useState, useMemo } from "react";
import { useSWRConfig } from "swr";
import { toast } from "@/hooks/useToast";
import { useAdminLLMProviders } from "@/lib/languageModels/hooks";
import { PageLoader } from "@/refresh-components/PageLoader";
import { Content, ContentAction, InputHorizontal } from "@opal/layouts";
import {
  Button,
  Divider,
  MessageCard,
  SelectCard,
  Text,
  Card,
} from "@opal/components";
import { Hoverable, Disabled } from "@opal/core";
import { SvgArrowExchange, SvgSettings, SvgTrash } from "@opal/icons";
import { SettingsLayouts } from "@opal/layouts";
import { ADMIN_ROUTES } from "@/lib/admin-routes";
import * as GeneralLayouts from "@/layouts/general-layouts";
import { getProvider } from "@/lib/languageModels";
import { refreshLlmProviderCaches } from "@/lib/languageModels/cache";
import {
  deleteLlmProvider,
  setDefaultLlmModel,
} from "@/lib/languageModels/svc";
import ModelSelector from "@/sections/model-selector/ModelSelector";
import { useTranslation } from "@/providers/LanguageProvider";
import ConfirmationModalLayout from "@/refresh-components/layouts/ConfirmationModalLayout";
import { useCreateModal } from "@/refresh-components/contexts/ModalContext";
import { LLMProviderName, LLMProviderView } from "@/lib/languageModels/types";
import { Section } from "@/layouts/general-layouts";
import { markdown } from "@opal/utils";
import { usePHFeatureFlag, PHFeatureFlag } from "@/lib/analytics/hooks";

const route = ADMIN_ROUTES.LLM_MODELS;

function providerDisplayName(provider: LLMProviderView): string {
  return provider.name || getProvider(provider.provider, provider).productName;
}

// ============================================================================
// Provider form mapping (keyed by provider name from the API)
// ============================================================================

// Static list of well-known providers rendered in the "Add Provider" grid.
// Must match the backend's WELL_KNOWN_PROVIDER_NAMES (minus any that lack a
// dedicated modal). Order here controls display order.
const PROVIDER_DISPLAY_ORDER: string[] = [
  LLMProviderName.OPENAI,
  LLMProviderName.ANTHROPIC,
  LLMProviderName.VERTEX_AI,
  LLMProviderName.BEDROCK,
  LLMProviderName.AZURE,
  LLMProviderName.LITELLM_PROXY,
  LLMProviderName.OLLAMA_CHAT,
  LLMProviderName.OPENROUTER,
  LLMProviderName.LM_STUDIO,
  LLMProviderName.BIFROST,
  LLMProviderName.OPENAI_COMPATIBLE,
  LLMProviderName.NEBIUS_TOKENFACTORY,
];

// ============================================================================
// ExistingProviderCard — card for configured (existing) providers
// ============================================================================

interface ExistingProviderCardProps {
  provider: LLMProviderView;
  isDefault: boolean;
  isLastProvider: boolean;
}

function ExistingProviderCard({
  provider,
  isDefault,
  isLastProvider,
}: ExistingProviderCardProps) {
  const { t } = useTranslation();
  const { mutate } = useSWRConfig();
  const [isOpen, setIsOpen] = useState(false);
  const deleteModal = useCreateModal();

  const handleDelete = async () => {
    try {
      await deleteLlmProvider(provider.id, isLastProvider);
      await refreshLlmProviderCaches(mutate);
      deleteModal.toggle(false);
      toast.success(t("admin.llms.providerDeleted"));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      toast.error(t("admin.llms.failedDeleteProvider", { message }));
    }
  };

  const { icon, companyName, Modal } = getProvider(provider.provider, provider);

  return (
    <>
      {isOpen && (
        <Modal existingLlmProvider={provider} onOpenChange={setIsOpen} />
      )}

      {deleteModal.isOpen && (
        <ConfirmationModalLayout
          icon={SvgTrash}
          title={markdown(t("admin.llms.deleteProviderTitle", { name: providerDisplayName(provider) }))}
          onClose={() => deleteModal.toggle(false)}
          submit={
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={isDefault && !isLastProvider}
            >
              {t("admin.llms.delete")}
            </Button>
          }
        >
          <Section alignItems="start" gap={0.5}>
            {isDefault && !isLastProvider ? (
              <Text font="main-ui-body" color="text-03">
                {t("admin.llms.cannotDeleteDefault")}
              </Text>
            ) : (
              <>
                <Text font="main-ui-body" color="text-03">
                  {markdown(
                    t("admin.llms.deleteProviderWarning", { name: providerDisplayName(provider) })
                  )}
                </Text>
                {isLastProvider && (
                  <Text font="main-ui-body" color="text-03">
                    {t("admin.llms.connectAnotherProvider")}
                  </Text>
                )}
              </>
            )}
          </Section>
        </ConfirmationModalLayout>
      )}

      <Hoverable.Root
        group="ExistingProviderCard"
        interaction={deleteModal.isOpen ? "hover" : "rest"}
      >
        <SelectCard
          state="filled"
          padding="sm"
          rounding="lg"
          onClick={() => setIsOpen(true)}
        >
          <ContentAction
            icon={icon}
            title={providerDisplayName(provider)}
            description={companyName}
            sizePreset="main-ui"
            variant="section"
            padding="lg"
            tag={isDefault ? { title: t("admin.llms.default"), color: "blue" } : undefined}
            rightChildren={
              <div className="flex flex-row">
                <Hoverable.Item
                  group="ExistingProviderCard"
                  variant="appear-on-hover"
                >
                  <Button
                    icon={SvgTrash}
                    prominence="tertiary"
                    aria-label={t("admin.llms.deleteAria", { name: providerDisplayName(provider) })}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteModal.toggle(true);
                    }}
                  />
                </Hoverable.Item>
                <Button
                  icon={SvgSettings}
                  prominence="tertiary"
                  aria-label={t("admin.llms.editAria", { name: providerDisplayName(provider) })}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(true);
                  }}
                />
              </div>
            }
          />
        </SelectCard>
      </Hoverable.Root>
    </>
  );
}

// ============================================================================
// NewProviderCard — card for the "Add Provider" list
// ============================================================================

interface NewProviderCardProps {
  providerName: string;
  isFirstProvider: boolean;
}

function NewProviderCard({
  providerName,
  isFirstProvider,
}: NewProviderCardProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const { icon, productName, companyName, Modal } = getProvider(providerName);

  return (
    <SelectCard
      state="empty"
      padding="sm"
      rounding="lg"
      onClick={() => setIsOpen(true)}
    >
      <ContentAction
        icon={icon}
        title={productName}
        description={companyName}
        sizePreset="main-ui"
        variant="section"
        padding="lg"
        rightChildren={
          <Button
            rightIcon={SvgArrowExchange}
            prominence="tertiary"
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(true);
            }}
          >
            {t("admin.llms.connect")}
          </Button>
        }
      />
      {isOpen && (
        <Modal shouldMarkAsDefault={isFirstProvider} onOpenChange={setIsOpen} />
      )}
    </SelectCard>
  );
}

// ============================================================================
// NewCustomProviderCard — card for adding a custom LLM provider
// ============================================================================

interface NewCustomProviderCardProps {
  isFirstProvider: boolean;
}

function NewCustomProviderCard({
  isFirstProvider,
}: NewCustomProviderCardProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const { icon, productName, companyName, Modal } = getProvider("custom");

  return (
    <>
      {isOpen && (
        <Modal shouldMarkAsDefault={isFirstProvider} onOpenChange={setIsOpen} />
      )}

      <SelectCard
        state="empty"
        padding="sm"
        rounding="lg"
        onClick={() => setIsOpen(true)}
      >
        <ContentAction
          icon={icon}
          title={productName}
          description={companyName}
          sizePreset="main-ui"
          variant="section"
          padding="lg"
          rightChildren={
            <Button
              rightIcon={SvgArrowExchange}
              prominence="tertiary"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(true);
              }}
            >
              Set Up
            </Button>
          }
        />
      </SelectCard>
    </>
  );
}

// ============================================================================
// LanguageModelsPage — main page component
// ============================================================================

export default function LanguageModelsPage() {
  const { t } = useTranslation();
  const { mutate } = useSWRConfig();
  const { llmProviders: existingLlmProviders, defaultText } =
    useAdminLLMProviders();
  const isConfigurationDisabled = usePHFeatureFlag(
    PHFeatureFlag.LANGUAGE_MODEL_CONFIGURATION_DISABLED
  );

  // Resolve the current default to a model_configuration_id for ModelSelector
  const defaultModelConfigId = useMemo(() => {
    if (!defaultText || !existingLlmProviders) return null;
    const provider = existingLlmProviders.find(
      (p) => p.id === defaultText.provider_id
    );
    return (
      provider?.model_configurations.find(
        (m) => m.name === defaultText.model_name
      )?.id ?? null
    );
  }, [defaultText, existingLlmProviders]);

  if (!existingLlmProviders) {
    return <PageLoader />;
  }

  const hasProviders = existingLlmProviders.length > 0;
  const isFirstProvider = !hasProviders;

  // Pre-sort providers so the default appears first
  const sortedProviders = [...existingLlmProviders].sort((a, b) => {
    const aIsDefault = defaultText?.provider_id === a.id;
    const bIsDefault = defaultText?.provider_id === b.id;
    if (aIsDefault && !bIsDefault) return -1;
    if (!aIsDefault && bIsDefault) return 1;
    return 0;
  });

  // Pre-filter to providers that have at least one visible model
  const providersWithVisibleModels = existingLlmProviders
    .map((provider) => ({
      provider,
      visibleModels: provider.model_configurations.filter((m) => m.is_visible),
    }))
    .filter(({ visibleModels }) => visibleModels.length > 0);

  // Default model logic — use the global default from the API response
  const currentDefaultValue = defaultText
    ? `${defaultText.provider_id}:${defaultText.model_name}`
    : undefined;

  async function handleDefaultModelChange(compositeValue: string) {
    const separatorIndex = compositeValue.indexOf(":");
    const providerId = Number(compositeValue.slice(0, separatorIndex));
    const modelName = compositeValue.slice(separatorIndex + 1);

    try {
      await setDefaultLlmModel(providerId, modelName);
      await refreshLlmProviderCaches(mutate);
      toast.success(t("admin.llms.defaultModelUpdated"));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      toast.error(t("admin.llms.failedSetDefaultModel", { message }));
    }
  }

  return (
    <SettingsLayouts.Root>
      <SettingsLayouts.Header icon={route.icon} title={route.title} divider />

      <SettingsLayouts.Body>
        {hasProviders ? (
          <Card border="solid" rounding="lg">
            <InputHorizontal
              title={t("admin.llms.defaultModel")}
              description={t("admin.llms.defaultModelDesc")}
              center
              withLabel
            >
              <ModelSelector
                value={defaultModelConfigId}
                onChange={(opt) => {
                  const provider = existingLlmProviders?.find(
                    (p) =>
                      p.provider === opt.provider &&
                      (p.name === opt.name || (!p.name && !opt.name))
                  );
                  if (provider) {
                    void handleDefaultModelChange(
                      `${provider.id}:${opt.modelName}`
                    );
                  }
                }}
                side="bottom"
              />
            </InputHorizontal>
          </Card>
        ) : (
          <MessageCard
            variant="info"
            title={t("admin.llms.setUpInfo")}
          />
        )}

        {/* ── Available Providers (only when providers exist) ── */}
        {hasProviders && (
          <>
            <GeneralLayouts.Section
              gap={0.75}
              height="fit"
              alignItems="stretch"
              justifyContent="start"
            >
              <Content
                title={t("admin.llms.availableProviders")}
                sizePreset="main-content"
                variant="section"
              />

              <div className="flex flex-col gap-2">
                {sortedProviders.map((provider) => (
                  <ExistingProviderCard
                    key={provider.id}
                    provider={provider}
                    isDefault={defaultText?.provider_id === provider.id}
                    isLastProvider={sortedProviders.length === 1}
                  />
                ))}
              </div>
            </GeneralLayouts.Section>

            <Divider paddingParallel="fit" paddingPerpendicular="fit" />
          </>
        )}

        {/* ── LLM configuration disablement notice ── */}
        {isConfigurationDisabled && (
          <MessageCard
            title={t("admin.llms.disabledTitle")}
            description={t("admin.llms.disabledDesc")}
            headerPadding="xs"
          />
        )}

        {/* ── Add Provider (always visible) ── */}
        <Disabled disabled={isConfigurationDisabled}>
          <GeneralLayouts.Section
            gap={0.75}
            height="fit"
            alignItems="stretch"
            justifyContent="start"
          >
            <Content
              title={t("admin.llms.addProvider")}
              description={t("admin.llms.addProviderDesc")}
              sizePreset="main-content"
              variant="section"
            />

            <div className="grid grid-cols-2 gap-2">
              {PROVIDER_DISPLAY_ORDER.map((name) => (
                <NewProviderCard
                  key={name}
                  providerName={name}
                  isFirstProvider={isFirstProvider}
                />
              ))}
              <NewCustomProviderCard isFirstProvider={isFirstProvider} />
            </div>
          </GeneralLayouts.Section>
        </Disabled>
      </SettingsLayouts.Body>
    </SettingsLayouts.Root>
  );
}
