"use client";

import { useState, useMemo, useEffect } from "react";
import useSWR from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { useCreateModal } from "@/refresh-components/contexts/ModalContext";
import { toast } from "@/hooks/useToast";
import { Section } from "@/layouts/general-layouts";
import { errorHandlingFetcher } from "@/lib/fetcher";
import {
  LLMProviderResponse,
  LLMProviderView,
} from "@/lib/languageModels/types";
import {
  IMAGE_PROVIDER_GROUPS,
  ImageProvider,
} from "@/views/admin/ImageGenerationPage/constants";
import {
  ImageGenerationConfigView,
  setDefaultImageGenerationConfig,
  unsetDefaultImageGenerationConfig,
  deleteImageGenerationConfig,
} from "@/views/admin/ImageGenerationPage/svc";
import ConfirmationModalLayout from "@/refresh-components/layouts/ConfirmationModalLayout";
import InputSelect from "@/refresh-components/inputs/InputSelect";
import { Button, MessageCard, Text } from "@opal/components";
import { Content } from "@opal/layouts";
import { SvgSlash, SvgUnplug } from "@opal/icons";
import { markdown } from "@opal/utils";
import { getImageGenForm } from "@/views/admin/ImageGenerationPage/forms";
import ProviderCard from "@/sections/admin/ProviderCard";
import { getModelIcon } from "@/lib/languageModels";
import { useTranslation } from "@/providers/LanguageProvider";

const NO_DEFAULT_VALUE = "__none__";

export default function ImageGenerationContent() {
  const { t } = useTranslation();

  const getGroupName = (name: string) => {
    if (name === "OpenAI") return t("admin.imageGen.providerGroupOpenAI");
    if (name === "Azure OpenAI") return t("admin.imageGen.providerGroupAzure");
    if (name === "Google Cloud Vertex AI") return t("admin.imageGen.providerGroupVertex");
    return name;
  };

  const getProviderTitle = (p: ImageProvider) => {
    const key = `admin.imageGen.providerTitle_${p.image_provider_id.replaceAll("-", "_").replaceAll(".", "_")}`;
    const trans = t(key);
    return trans === key ? p.title : trans;
  };

  const getProviderDesc = (p: ImageProvider) => {
    const key = `admin.imageGen.providerDesc_${p.image_provider_id.replaceAll("-", "_").replaceAll(".", "_")}`;
    const trans = t(key);
    return trans === key ? p.description : trans;
  };

  const {
    data: llmProviderResponse,
    error: llmError,
    mutate: refetchProviders,
  } = useSWR<LLMProviderResponse<LLMProviderView>>(
    SWR_KEYS.llmProvidersWithImageGen,
    errorHandlingFetcher
  );
  const llmProviders = llmProviderResponse?.providers ?? [];

  const {
    data: configs = [],
    error: configError,
    mutate: refetchConfigs,
  } = useSWR<ImageGenerationConfigView[]>(
    SWR_KEYS.imageGenConfig,
    errorHandlingFetcher
  );

  const modal = useCreateModal();
  const [activeProvider, setActiveProvider] = useState<ImageProvider | null>(
    null
  );
  const [editConfig, setEditConfig] =
    useState<ImageGenerationConfigView | null>(null);
  const [disconnectProvider, setDisconnectProvider] =
    useState<ImageProvider | null>(null);
  const [replacementProviderId, setReplacementProviderId] = useState<
    string | null
  >(null);

  const connectedProviderIds = useMemo(() => {
    return new Set(configs.map((c) => c.image_provider_id));
  }, [configs]);

  const defaultConfig = useMemo(() => {
    return configs.find((c) => c.is_default);
  }, [configs]);

  const getStatus = (
    provider: ImageProvider
  ): "disconnected" | "connected" | "selected" => {
    if (defaultConfig?.image_provider_id === provider.image_provider_id)
      return "selected";
    if (connectedProviderIds.has(provider.image_provider_id))
      return "connected";
    return "disconnected";
  };

  const handleConnect = (provider: ImageProvider) => {
    setEditConfig(null);
    setActiveProvider(provider);
    modal.toggle(true);
  };

  const handleSelect = async (provider: ImageProvider) => {
    const config = configs.find(
      (c) => c.image_provider_id === provider.image_provider_id
    );
    if (config) {
      try {
        await setDefaultImageGenerationConfig(config.image_provider_id);
        toast.success(t("admin.imageGen.setDefaultSuccess", { name: getProviderTitle(provider) }));
        refetchConfigs();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("admin.imageGen.failedSetDefault")
        );
      }
    }
  };

  const handleDeselect = async (provider: ImageProvider) => {
    const config = configs.find(
      (c) => c.image_provider_id === provider.image_provider_id
    );
    if (config) {
      try {
        await unsetDefaultImageGenerationConfig(config.image_provider_id);
        toast.success(t("admin.imageGen.deselectedSuccess", { name: getProviderTitle(provider) }));
        refetchConfigs();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t("admin.imageGen.failedDeselect")
        );
      }
    }
  };

  const handleEdit = (provider: ImageProvider) => {
    const config = configs.find(
      (c) => c.image_provider_id === provider.image_provider_id
    );
    setEditConfig(config || null);
    setActiveProvider(provider);
    modal.toggle(true);
  };

  const handleDisconnect = async () => {
    if (!disconnectProvider) return;
    try {
      // If a replacement was selected (not "No Default"), activate it first
      if (replacementProviderId && replacementProviderId !== NO_DEFAULT_VALUE) {
        await setDefaultImageGenerationConfig(replacementProviderId);
      }

      await deleteImageGenerationConfig(disconnectProvider.image_provider_id);
      toast.success(t("admin.imageGen.disconnectedSuccess", { name: getProviderTitle(disconnectProvider) }));
      refetchConfigs();
      refetchProviders();
    } catch (error) {
      console.error("Failed to disconnect image generation provider:", error);
      toast.error(
        error instanceof Error ? error.message : t("admin.imageGen.failedDisconnect")
      );
    } finally {
      setDisconnectProvider(null);
      setReplacementProviderId(null);
    }
  };

  const handleModalSuccess = () => {
    toast.success(t("admin.imageGen.configuredSuccess"));
    setEditConfig(null);
    refetchConfigs();
    refetchProviders();
  };

  if (llmError || configError) {
    return (
      <div className="text-error">
        {t("admin.imageGen.failedLoad")}
      </div>
    );
  }

  // Compute replacement options when disconnecting an active provider
  const isDisconnectingDefault =
    disconnectProvider &&
    defaultConfig?.image_provider_id === disconnectProvider.image_provider_id;

  // Group connected replacement models by provider (excluding the model being disconnected)
  const replacementGroups = useMemo(() => {
    if (!disconnectProvider) return [];
    return IMAGE_PROVIDER_GROUPS.map((group) => ({
      ...group,
      providers: group.providers.filter(
        (p) =>
          p.image_provider_id !== disconnectProvider.image_provider_id &&
          connectedProviderIds.has(p.image_provider_id)
      ),
    })).filter((g) => g.providers.length > 0);
  }, [disconnectProvider, connectedProviderIds]);

  const needsReplacement = !!isDisconnectingDefault;
  const hasReplacements = replacementGroups.length > 0;

  // Auto-select first replacement when modal opens
  useEffect(() => {
    if (needsReplacement && !replacementProviderId && hasReplacements) {
      const firstGroup = replacementGroups[0];
      const firstModel = firstGroup?.providers[0];
      if (firstModel) setReplacementProviderId(firstModel.image_provider_id);
    }
  }, [disconnectProvider]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="flex flex-col gap-4">
        <Content
          title={t("admin.imageGen.modelSectionTitle")}
          description={t("admin.imageGen.modelSectionDesc")}
          sizePreset="main-content"
          variant="section"
        />

        {connectedProviderIds.size === 0 && (
          <MessageCard
            variant="info"
            title={t("admin.imageGen.connectInfo")}
          />
        )}

        {/* Provider Groups */}
        {IMAGE_PROVIDER_GROUPS.map((group) => (
          <div key={group.name} className="flex flex-col gap-2">
            <Content title={getGroupName(group.name)} sizePreset="secondary" variant="body" />
            {group.providers.map((provider) => {
              const status = getStatus(provider);
              const isDisconnected = status === "disconnected";
              const isConnected = status === "connected";
              const isSelected = status === "selected";

              return (
                <ProviderCard
                  key={provider.image_provider_id}
                  icon={getModelIcon(provider.provider_name)}
                  title={getProviderTitle(provider)}
                  description={getProviderDesc(provider)}
                  status={status}
                  aria-label={`image-gen-provider-${provider.image_provider_id}`}
                  onConnect={() => handleConnect(provider)}
                  onSelect={() => handleSelect(provider)}
                  onDeselect={() => handleDeselect(provider)}
                  onEdit={() => handleEdit(provider)}
                  onDisconnect={() => setDisconnectProvider(provider)}
                  disconnectModalOpen={
                    disconnectProvider?.image_provider_id ===
                    provider.image_provider_id
                  }
                />
              );
            })}
          </div>
        ))}
      </div>

      {disconnectProvider && (
        <ConfirmationModalLayout
          icon={SvgUnplug}
          title={markdown(t("admin.imageGen.disconnectTitle", { name: getProviderTitle(disconnectProvider) }))}
          description={t("admin.imageGen.disconnectDesc")}
          onClose={() => {
            setDisconnectProvider(null);
            setReplacementProviderId(null);
          }}
          submit={
            <Button
              variant="danger"
              onClick={() => void handleDisconnect()}
              disabled={
                needsReplacement && hasReplacements && !replacementProviderId
              }
            >
              {t("admin.imageGen.disconnectBtn")}
            </Button>
          }
        >
          {needsReplacement ? (
            hasReplacements ? (
              <Section alignItems="start">
                <Text as="p" color="text-03">
                  {markdown(
                    t("admin.imageGen.isDefaultModelDesc", { name: getProviderTitle(disconnectProvider) })
                  )}
                </Text>
                <Section alignItems="start" gap={0.25}>
                  <Text as="p" color="text-04">
                    {t("admin.imageGen.setNewDefault")}
                  </Text>
                  <InputSelect
                    value={replacementProviderId ?? undefined}
                    onValueChange={(v) => setReplacementProviderId(v)}
                  >
                    <InputSelect.Trigger placeholder={t("admin.imageGen.selectReplacementPlaceholder")} />
                    <InputSelect.Content>
                      {replacementGroups.map((group) => (
                        <InputSelect.Group key={group.name}>
                          <InputSelect.Label>{getGroupName(group.name)}</InputSelect.Label>
                          {group.providers.map((p) => (
                            <InputSelect.Item
                              key={p.image_provider_id}
                              value={p.image_provider_id}
                              icon={getModelIcon(p.provider_name)}
                            >
                              {getProviderTitle(p)}
                            </InputSelect.Item>
                          ))}
                        </InputSelect.Group>
                      ))}
                      <InputSelect.Separator />
                      <InputSelect.Item
                        value={NO_DEFAULT_VALUE}
                        icon={SvgSlash}
                      >
                        <span>
                          <b>{t("admin.imageGen.noDefault")}</b>
                          <span className="text-text-03">
                            {t("admin.imageGen.disableImageGenSuffix")}
                          </span>
                        </span>
                      </InputSelect.Item>
                    </InputSelect.Content>
                  </InputSelect>
                </Section>
              </Section>
            ) : (
              <>
                <Text as="p" color="text-03">
                  {markdown(
                    t("admin.imageGen.isDefaultModelDesc", { name: getProviderTitle(disconnectProvider) })
                  )}
                </Text>
                <Text as="p" color="text-03">
                  {t("admin.imageGen.connectAnotherProvider")}
                </Text>
              </>
            )
          ) : (
            <>
              <Text as="p" color="text-03">
                {markdown(
                  t("admin.imageGen.noLongerUsedDesc", { name: getProviderTitle(disconnectProvider) })
                )}
              </Text>
              <Text as="p" color="text-03">
                {t("admin.imageGen.sessionHistoryPreserved")}
              </Text>
            </>
          )}
        </ConfirmationModalLayout>
      )}

      {activeProvider && (
        <modal.Provider>
          {getImageGenForm({
            modal: modal,
            imageProvider: activeProvider,
            existingProviders: llmProviders,
            existingConfig: editConfig || undefined,
            onSuccess: handleModalSuccess,
          })}
        </modal.Provider>
      )}
    </>
  );
}
