"use client";

import { markdown } from "@opal/utils";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Formik, Form } from "formik";
import useSWR, { mutate } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { errorHandlingFetcher } from "@/lib/fetcher";
import { SettingsLayouts } from "@opal/layouts";
import { Section } from "@/layouts/general-layouts";
import SimpleCollapsible from "@/refresh-components/SimpleCollapsible";
import InputTextAreaField from "@/refresh-components/form/InputTextAreaField";
import { InputTypeIn } from "@opal/components";
import InputTextArea from "@/refresh-components/inputs/InputTextArea";
import InputSelect from "@/refresh-components/inputs/InputSelect";
import {
  SvgAddLines,
  SvgActions,
  SvgExpand,
  SvgFold,
  SvgExternalLink,
  SvgOrganization,
  SvgRefreshCw,
} from "@opal/icons";
import { ADMIN_ROUTES } from "@/lib/admin-routes";
import {
  Card as CardLayout,
  Content,
  ContentAction,
  InputHorizontal,
  InputVertical,
} from "@opal/layouts";
import { useSettings } from "@/lib/settings/hooks";
import useCCPairs from "@/hooks/useCCPairs";
import { getSourceMetadata } from "@/lib/sources";
import { QueryHistoryType, Settings, toSettings } from "@/lib/settings/types";
import { toast } from "@/hooks/useToast";
import { useAvailableTools } from "@/hooks/useAvailableTools";
import {
  SEARCH_TOOL_ID,
  IMAGE_GENERATION_TOOL_ID,
  WEB_SEARCH_TOOL_ID,
  PYTHON_TOOL_ID,
  OPEN_URL_TOOL_ID,
  CODING_AGENT_TOOL_ID,
} from "@/app/app/components/tools/constants";
import {
  EmptyMessageCard,
  Button,
  Divider,
  Text,
  Card,
  MessageCard,
  Tooltip,
} from "@opal/components";
import Modal from "@/refresh-components/Modal";
import { Switch } from "@opal/components";
import { useMcpServersForAgentEditor } from "@/lib/agents/hooks";
import useOpenApiTools from "@/hooks/useOpenApiTools";
import { getActionIcon } from "@/lib/tools/mcpUtils";
import { Disabled, Hoverable } from "@opal/core";
import useFilter from "@/hooks/useFilter";
import { MCPServer } from "@/lib/tools/interfaces";
import type { IconProps } from "@opal/types";
import { useTierAtLeast } from "@/hooks/useTierAtLeast";
import { useTranslation } from "@/providers/LanguageProvider";
import { Tier } from "@/lib/settings/types";

const route = ADMIN_ROUTES.CHAT_PREFERENCES;

interface DefaultAgentConfiguration {
  tool_ids: number[];
  system_prompt: string | null;
  default_system_prompt: string;
}

interface MCPServerCardTool {
  id: number;
  icon: React.FunctionComponent<IconProps>;
  name: string;
  description: string;
}

interface MCPServerCardProps {
  server: MCPServer;
  tools: MCPServerCardTool[];
  isToolEnabled: (toolDbId: number) => boolean;
  onToggleTool: (toolDbId: number, enabled: boolean) => void;
  onToggleTools: (toolDbIds: number[], enabled: boolean) => void;
}

function MCPServerCard({
  server,
  tools,
  isToolEnabled,
  onToggleTool,
  onToggleTools,
}: MCPServerCardProps) {
  const { t } = useTranslation();
  const [isFolded, setIsFolded] = useState(true);
  const {
    query,
    setQuery,
    filtered: filteredTools,
  } = useFilter(tools, (tool) => `${tool.name} ${tool.description}`);

  const allToolIds = tools.map((t) => t.id);
  const serverEnabled = tools.some((t) => isToolEnabled(t.id));
  const needsAuth = !server.is_authenticated;
  const authTooltip = needsAuth
    ? t("admin.chatPreferences.mcpAuthTooltip")
    : undefined;

  const expanded = !isFolded;
  const hasContent = tools.length > 0 && filteredTools.length > 0;

  return (
    <Card
      expandable
      expanded={expanded}
      border="solid"
      rounding="lg"
      padding="sm"
      expandedContent={
        hasContent ? (
          <Section gap={0.5} padding={0.5}>
            {filteredTools.map((tool) => (
              <Card key={tool.id} border="solid" rounding="md">
                <InputHorizontal
                  icon={tool.icon}
                  title={tool.name}
                  description={tool.description}
                  withLabel
                >
                  <Tooltip tooltip={authTooltip} side="top">
                    <Switch
                      checked={isToolEnabled(tool.id)}
                      onCheckedChange={(checked) =>
                        onToggleTool(tool.id, checked)
                      }
                      disabled={needsAuth}
                    />
                  </Tooltip>
                </InputHorizontal>
              </Card>
            ))}
          </Section>
        ) : undefined
      }
    >
      <CardLayout.Header
        bottomChildren={
          tools.length > 0 ? (
            <Section flexDirection="row" gap={0.5}>
              <InputTypeIn
                placeholder={t("admin.chatPreferences.mcpSearchPlaceholder")}
                variant="internal"
                searchIcon
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <Button
                rightIcon={isFolded ? SvgExpand : SvgFold}
                onClick={() => setIsFolded((prev) => !prev)}
                prominence="internal"
                size="lg"
              >
                {isFolded ? t("admin.chatPreferences.mcpExpand") : t("admin.chatPreferences.mcpFold")}
              </Button>
            </Section>
          ) : undefined
        }
      >
        <div className="p-2">
          <ContentAction
            icon={getActionIcon(server.server_url, server.name)}
            title={server.name}
            description={server.description}
            sizePreset="main-ui"
            variant="section"
            padding="fit"
            rightChildren={
              <Tooltip tooltip={authTooltip} side="top">
                <Switch
                  checked={serverEnabled}
                  onCheckedChange={(checked) =>
                    onToggleTools(allToolIds, checked)
                  }
                  disabled={needsAuth}
                />
              </Tooltip>
            }
          />
        </div>
      </CardLayout.Header>
    </Card>
  );
}

type FileLimitFieldName =
  | "user_file_max_upload_size_mb"
  | "file_token_count_threshold_k";

interface NumericLimitFieldProps {
  name: FileLimitFieldName;
  initialValue: string;
  defaultValue: string;
  saveSettings: (updates: Partial<Settings>) => Promise<void>;
  maxValue?: number;
  allowZero?: boolean;
}

function NumericLimitField({
  name,
  initialValue: initialValueProp,
  defaultValue,
  saveSettings,
  maxValue,
  allowZero = false,
}: NumericLimitFieldProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValueProp);
  const savedValue = useRef(initialValueProp);
  const restoringRef = useRef(false);

  const parsed = parseInt(value, 10);
  const isOverMax =
    maxValue !== undefined && !isNaN(parsed) && parsed > maxValue;

  const handleRestore = () => {
    restoringRef.current = true;
    savedValue.current = defaultValue;
    setValue(defaultValue);
    void saveSettings({ [name]: parseInt(defaultValue, 10) });
  };

  const handleBlur = () => {
    // The restore button triggers a blur — skip since handleRestore already saved.
    if (restoringRef.current) {
      restoringRef.current = false;
      return;
    }

    const parsed = parseInt(value, 10);
    const isValid = !isNaN(parsed) && (allowZero ? parsed >= 0 : parsed > 0);

    // Revert invalid input (empty, NaN, negative).
    if (!isValid) {
      if (allowZero) {
        // Empty/invalid means "no limit" — persist 0 and clear the field.
        setValue("");
        void saveSettings({ [name]: 0 });
        savedValue.current = "";
      } else {
        setValue(savedValue.current);
      }
      return;
    }

    // Block save when the value exceeds the hard ceiling.
    if (maxValue !== undefined && parsed > maxValue) {
      return;
    }

    // For allowZero fields, 0 means "no limit" — clear the display
    // so the "No limit" placeholder is visible, but still persist 0.
    if (allowZero && parsed === 0) {
      setValue("");
      if (savedValue.current !== "") {
        void saveSettings({ [name]: 0 });
        savedValue.current = "";
      }
      return;
    }

    const normalizedDisplay = String(parsed);

    // Update the display to the canonical form (e.g. strip leading zeros).
    if (value !== normalizedDisplay) {
      setValue(normalizedDisplay);
    }

    // Persist only when the value actually changed.
    if (normalizedDisplay !== savedValue.current) {
      void saveSettings({ [name]: parsed });
      savedValue.current = normalizedDisplay;
    }
  };

  return (
    <Hoverable.Root group="numericLimit" width="full">
      <InputTypeIn
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={allowZero ? t("admin.chatPreferences.noLimit") : t("admin.chatPreferences.defaultLimit", { default: defaultValue })}
        variant={isOverMax ? "error" : undefined}
        rightChildren={
          (value || "") !== defaultValue ? (
            <Hoverable.Item group="numericLimit" variant="appear-on-hover">
              <Button
                icon={SvgRefreshCw}
                tooltip={t("admin.chatPreferences.restoreTooltip")}
                prominence="internal"
                onClick={handleRestore}
              />
            </Hoverable.Item>
          ) : undefined
        }
        onBlur={handleBlur}
      />
    </Hoverable.Root>
  );
}

interface FileSizeLimitFieldsProps {
  saveSettings: (updates: Partial<Settings>) => Promise<void>;
  initialUploadSizeMb: string;
  defaultUploadSizeMb: string;
  initialTokenThresholdK: string;
  defaultTokenThresholdK: string;
  maxAllowedUploadSizeMb?: number;
}

function FileSizeLimitFields({
  saveSettings,
  initialUploadSizeMb,
  defaultUploadSizeMb,
  initialTokenThresholdK,
  defaultTokenThresholdK,
  maxAllowedUploadSizeMb,
}: FileSizeLimitFieldsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-4 w-full items-start pt-2">
      <div className="flex-1">
        <InputVertical
          title={t("admin.chatPreferences.fileSizeLimit")}
          suffix={t("admin.chatPreferences.fileSizeLimitSuffix")}
          subDescription={
            maxAllowedUploadSizeMb
              ? t("admin.chatPreferences.fileSizeLimitMax", { max: maxAllowedUploadSizeMb })
              : undefined
          }
          withLabel
        >
          <NumericLimitField
            name="user_file_max_upload_size_mb"
            initialValue={initialUploadSizeMb}
            defaultValue={defaultUploadSizeMb}
            saveSettings={saveSettings}
            maxValue={maxAllowedUploadSizeMb}
          />
        </InputVertical>
      </div>
      <div className="flex-1">
        <InputVertical
          title={t("admin.chatPreferences.fileTokenLimit")}
          withLabel
          suffix={t("admin.chatPreferences.fileTokenLimitSuffix")}
        >
          <NumericLimitField
            name="file_token_count_threshold_k"
            initialValue={initialTokenThresholdK}
            defaultValue={defaultTokenThresholdK}
            saveSettings={saveSettings}
            allowZero
          />
        </InputVertical>
      </div>
    </div>
  );
}

// Retention presets offered directly in the dropdown. Any other (positive)
// value is surfaced via the "Custom…" option. The backend stores
// maximum_chat_retention_days as a free-form number, so these are purely UI.
const RETENTION_PRESETS: number[] = [7, 30, 60, 90, 365];
// FE-only guard: the backend imposes no upper bound, so cap absurd input.
const MAX_RETENTION_DAYS = 36500; // ~100 years
const CUSTOM_RETENTION_VALUE = "custom";
const FOREVER_RETENTION_VALUE = "forever";

// Pure predicate — lives at module scope so it can be referenced inside
// useEffect without an exhaustive-deps suppression.
const valueIsCustomRetention = (v: number | null): v is number =>
  v !== null && !RETENTION_PRESETS.includes(v);

// True only when the string is one or more digits within the allowed range.
// parseInt alone would silently accept "1.5" → 1 or "7abc" → 7, so guard with
// a digits-only check before persisting.
const isValidCustomRetention = (raw: string): boolean =>
  /^\d+$/.test(raw) &&
  parseInt(raw, 10) > 0 &&
  parseInt(raw, 10) <= MAX_RETENTION_DAYS;

interface RetentionFieldProps {
  value: number | null;
  disabled: boolean;
  onSave: (value: number | null) => void;
}

// Chat-retention control: a preset dropdown plus a "Custom…" option that
// reveals a numeric "days" input. Drop-in replacement for the bare
// <InputSelect>; the persisted shape (number | null) is unchanged, so any
// existing value — preset or not — round-trips correctly.
function RetentionField({ value, disabled, onSave }: RetentionFieldProps) {
  const { t } = useTranslation();
  const [showCustom, setShowCustom] = useState(valueIsCustomRetention(value));
  const [customDays, setCustomDays] = useState(
    valueIsCustomRetention(value) ? String(value) : ""
  );

  // Re-sync when the stored value changes externally (e.g. another admin),
  // but only when our local state matches the last value we persisted.
  const lastSavedRef = useRef(value);
  useEffect(() => {
    if (value === lastSavedRef.current) return;
    lastSavedRef.current = value;
    setShowCustom(valueIsCustomRetention(value));
    setCustomDays(valueIsCustomRetention(value) ? String(value) : "");
  }, [value]);

  const selectValue = showCustom
    ? CUSTOM_RETENTION_VALUE
    : value === null
      ? FOREVER_RETENTION_VALUE
      : String(value);

  const persist = (next: number | null) => {
    lastSavedRef.current = next;
    onSave(next);
  };

  const handleSelectChange = (next: string) => {
    if (next === CUSTOM_RETENTION_VALUE) {
      // Reveal the input; don't persist until a valid number is entered.
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    setCustomDays("");
    persist(next === FOREVER_RETENTION_VALUE ? null : parseInt(next, 10));
  };

  const handleCustomBlur = () => {
    // Empty/invalid input reverts to the last persisted selection.
    if (!isValidCustomRetention(customDays)) {
      setShowCustom(valueIsCustomRetention(value));
      setCustomDays(valueIsCustomRetention(value) ? String(value) : "");
      return;
    }

    const parsed = parseInt(customDays, 10);
    const normalized = String(parsed);
    if (normalized !== customDays) setCustomDays(normalized);
    if (parsed !== value) persist(parsed);
  };

  const customInvalid =
    customDays !== "" && !isValidCustomRetention(customDays);

  return (
    <div className="flex flex-col gap-2 w-full">
      <InputSelect
        value={selectValue}
        onValueChange={handleSelectChange}
        disabled={disabled}
      >
        <InputSelect.Trigger />
        <InputSelect.Content>
          <InputSelect.Item value={FOREVER_RETENTION_VALUE}>
            {t("admin.chatPreferences.forever")}
          </InputSelect.Item>
          {RETENTION_PRESETS.map((d) => (
            <InputSelect.Item key={d} value={String(d)}>
              {d} {t("admin.chatPreferences.days")}
            </InputSelect.Item>
          ))}
          <InputSelect.Item value={CUSTOM_RETENTION_VALUE}>
            {t("admin.chatPreferences.custom")}
          </InputSelect.Item>
        </InputSelect.Content>
      </InputSelect>

      {showCustom && (
        <div className="flex flex-col gap-1 w-full">
          <InputTypeIn
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder={t("admin.chatPreferences.customDaysPlaceholder")}
            value={customDays}
            onChange={(e) => setCustomDays(e.target.value)}
            onBlur={handleCustomBlur}
            variant={
              disabled ? "disabled" : customInvalid ? "error" : undefined
            }
            rightChildren={
              <Text font="secondary-body" color="text-03">
                {t("admin.chatPreferences.days")}
              </Text>
            }
          />
          {customInvalid && (
            <Text font="secondary-body" color="text-03">
              {t("admin.chatPreferences.customDaysError", { max: MAX_RETENTION_DAYS })}
            </Text>
          )}
        </div>
      )}
    </div>
  );
}

export default function ChatPreferencesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const settings = useSettings();
  const s = settings;
  // Search Mode toggle is Business+; Chat Retention is Enterprise-only.
  const businessTier = useTierAtLeast(Tier.BUSINESS);
  const enterpriseTier = useTierAtLeast(Tier.ENTERPRISE);

  // Local state for text fields (save-on-blur)
  const [companyName, setCompanyName] = useState(s.company_name ?? "");
  const [companyDescription, setCompanyDescription] = useState(
    s.company_description ?? ""
  );
  const savedCompanyName = useRef(companyName);
  const savedCompanyDescription = useRef(companyDescription);

  // Re-sync local state when settings change externally (e.g. another admin),
  // but only when there's no in-progress edit (local matches last-saved value).
  useEffect(() => {
    const incoming = s.company_name ?? "";
    if (companyName === savedCompanyName.current && incoming !== companyName) {
      setCompanyName(incoming);
      savedCompanyName.current = incoming;
    }
  }, [s.company_name]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const incoming = s.company_description ?? "";
    if (
      companyDescription === savedCompanyDescription.current &&
      incoming !== companyDescription
    ) {
      setCompanyDescription(incoming);
      savedCompanyDescription.current = incoming;
    }
  }, [s.company_description]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tools availability
  const { tools: availableTools } = useAvailableTools();
  const { vectorDbEnabled } = settings;

  const searchTool = availableTools.find(
    (t) => t.in_code_tool_id === SEARCH_TOOL_ID
  );
  const imageGenTool = availableTools.find(
    (t) => t.in_code_tool_id === IMAGE_GENERATION_TOOL_ID
  );
  const webSearchTool = availableTools.find(
    (t) => t.in_code_tool_id === WEB_SEARCH_TOOL_ID
  );
  const openURLTool = availableTools.find(
    (t) => t.in_code_tool_id === OPEN_URL_TOOL_ID
  );
  const codeInterpreterTool = availableTools.find(
    (t) => t.in_code_tool_id === PYTHON_TOOL_ID
  );
  const codingAgentTool = availableTools.find(
    (t) => t.in_code_tool_id === CODING_AGENT_TOOL_ID
  );

  // Connectors
  const { ccPairs } = useCCPairs();
  const uniqueSources = Array.from(new Set(ccPairs.map((p) => p.source)));

  // MCP servers and OpenAPI tools
  const { mcpData } = useMcpServersForAgentEditor();
  const { openApiTools: openApiToolsRaw } = useOpenApiTools();
  const mcpServers = mcpData?.mcp_servers ?? [];
  const openApiTools = openApiToolsRaw ?? [];

  const mcpServersWithTools = mcpServers.map((server) => ({
    server,
    tools: availableTools
      .filter((tool) => tool.mcp_server_id === server.id)
      .map((tool) => ({
        id: tool.id,
        icon: getActionIcon(server.server_url, server.name),
        name: tool.display_name || tool.name,
        description: tool.description,
      })),
  }));

  // Default agent configuration (system prompt)
  const { data: defaultAgentConfig, mutate: mutateDefaultAgent } =
    useSWR<DefaultAgentConfiguration>(
      SWR_KEYS.defaultAssistantConfig,
      errorHandlingFetcher
    );

  const enabledToolIds = defaultAgentConfig?.tool_ids ?? [];

  const isToolEnabled = useCallback(
    (toolDbId: number) => enabledToolIds.includes(toolDbId),
    [enabledToolIds]
  );

  const saveToolIds = useCallback(
    async (newToolIds: number[]) => {
      // Optimistic update so subsequent toggles read fresh state
      const optimisticData = defaultAgentConfig
        ? { ...defaultAgentConfig, tool_ids: newToolIds }
        : undefined;
      try {
        await mutateDefaultAgent(
          async () => {
            const response = await fetch("/api/admin/default-assistant", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tool_ids: newToolIds }),
            });
            if (!response.ok) {
              const errorMsg = (await response.json()).detail;
              throw new Error(errorMsg);
            }
            return optimisticData;
          },
          { optimisticData, revalidate: true }
        );
        toast.success(t("admin.chatPreferences.toolsUpdated"));
      } catch {
        toast.error(t("admin.chatPreferences.failedUpdateTools"));
      }
    },
    [defaultAgentConfig, mutateDefaultAgent]
  );

  const toggleTool = useCallback(
    (toolDbId: number, enabled: boolean) => {
      const newToolIds = enabled
        ? [...enabledToolIds, toolDbId]
        : enabledToolIds.filter((id) => id !== toolDbId);
      void saveToolIds(newToolIds);
    },
    [enabledToolIds, saveToolIds]
  );

  const toggleTools = useCallback(
    (toolDbIds: number[], enabled: boolean) => {
      const idsSet = new Set(toolDbIds);
      const withoutIds = enabledToolIds.filter((id) => !idsSet.has(id));
      const newToolIds = enabled ? [...withoutIds, ...toolDbIds] : withoutIds;
      void saveToolIds(newToolIds);
    },
    [enabledToolIds, saveToolIds]
  );

  // System prompt modal state
  const [systemPromptModalOpen, setSystemPromptModalOpen] = useState(false);

  const saveSettings = useCallback(
    async (updates: Partial<Settings>) => {
      const currentSettings = settings;
      if (!currentSettings) return;

      const newSettings: Settings = {
        ...toSettings(currentSettings),
        ...updates,
      };

      try {
        const response = await fetch("/api/admin/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newSettings),
        });

        if (!response.ok) {
          const errorMsg = (await response.json()).detail;
          throw new Error(errorMsg);
        }

        router.refresh();
        await mutate(SWR_KEYS.settings);
        toast.success(t("admin.chatPreferences.settingsUpdated"));
      } catch (error) {
        toast.error(t("admin.chatPreferences.failedUpdateSettings"));
      }
    },
    [settings, router]
  );

  return (
    <>
      <SettingsLayouts.Root>
        <SettingsLayouts.Header
          icon={route.icon}
          title={route.title}
          description={t("admin.chatPreferences.headerDescription")}
          divider
        />

        <SettingsLayouts.Body>
          {/* Features */}
          <Card border="solid" rounding="lg">
            <Section alignItems="stretch">
              <Disabled
                disabled={!businessTier || uniqueSources.length === 0}
                allowClick={businessTier}
                tooltip={
                  !businessTier
                    ? t("admin.chatPreferences.searchModePlan")
                    : t("admin.chatPreferences.searchModeConnectors")
                }
              >
                <InputHorizontal
                  title={t("admin.chatPreferences.searchMode")}
                  tag={
                    !businessTier
                      ? {
                          title: "Business Plan",
                          color: "amber",
                          icon: SvgOrganization,
                        }
                      : { title: "beta", color: "blue" }
                  }
                  description={t("admin.chatPreferences.searchModeDesc")}
                  disabled={!businessTier || uniqueSources.length === 0}
                  withLabel
                >
                  <Switch
                    checked={
                      businessTier ? (s.search_ui_enabled ?? true) : false
                    }
                    onCheckedChange={(checked) => {
                      void saveSettings({ search_ui_enabled: checked });
                    }}
                    disabled={!businessTier || uniqueSources.length === 0}
                  />
                </InputHorizontal>
              </Disabled>
              <InputHorizontal
                title={t("admin.chatPreferences.multiModel")}
                tag={{ title: "beta", color: "blue" }}
                description={t("admin.chatPreferences.multiModelDesc")}
                withLabel
              >
                <Switch
                  checked={s.multi_model_chat_enabled ?? true}
                  onCheckedChange={(checked) => {
                    void saveSettings({ multi_model_chat_enabled: checked });
                  }}
                />
              </InputHorizontal>
              <InputHorizontal
                title={t("admin.chatPreferences.deepResearch")}
                description={t("admin.chatPreferences.deepResearchDesc")}
                withLabel
              >
                <Switch
                  checked={s.deep_research_enabled ?? true}
                  onCheckedChange={(checked) => {
                    void saveSettings({ deep_research_enabled: checked });
                  }}
                />
              </InputHorizontal>
              <InputHorizontal
                title={t("admin.chatPreferences.autoScroll")}
                description={t("admin.chatPreferences.autoScrollDesc")}
                withLabel
              >
                <Switch
                  checked={s.auto_scroll ?? false}
                  onCheckedChange={(checked) => {
                    void saveSettings({ auto_scroll: checked });
                  }}
                />
              </InputHorizontal>
              <InputHorizontal
                title={t("admin.chatPreferences.temperature")}
                description={t("admin.chatPreferences.temperatureDesc")}
                withLabel
              >
                <Switch
                  checked={s.temperature_override_enabled ?? false}
                  onCheckedChange={(checked) => {
                    void saveSettings({
                      temperature_override_enabled: checked,
                    });
                  }}
                />
              </InputHorizontal>
            </Section>
          </Card>

          <Divider paddingParallel="fit" paddingPerpendicular="fit" />

          {/* Team Context */}
          <Section gap={1}>
            <InputVertical
              title={t("admin.chatPreferences.teamName")}
              subDescription={t("admin.chatPreferences.teamNameDesc")}
              withLabel
            >
              <InputTypeIn
                placeholder={t("admin.chatPreferences.teamNamePlaceholder")}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                onBlur={() => {
                  if (companyName !== savedCompanyName.current) {
                    void saveSettings({
                      company_name: companyName || null,
                    });
                    savedCompanyName.current = companyName;
                  }
                }}
              />
            </InputVertical>

            <InputVertical
              title={t("admin.chatPreferences.teamContext")}
              subDescription={t("admin.chatPreferences.teamContextDesc")}
              withLabel
            >
              <InputTextArea
                placeholder={t("admin.chatPreferences.teamContextPlaceholder")}
                rows={4}
                maxRows={10}
                autoResize
                value={companyDescription}
                onChange={(e) => setCompanyDescription(e.target.value)}
                onBlur={() => {
                  if (companyDescription !== savedCompanyDescription.current) {
                    void saveSettings({
                      company_description: companyDescription || null,
                    });
                    savedCompanyDescription.current = companyDescription;
                  }
                }}
              />
            </InputVertical>
          </Section>

          <InputHorizontal
            title={t("admin.chatPreferences.systemPrompt")}
            description={t("admin.chatPreferences.systemPromptDesc")}
          >
            <Button
              prominence="tertiary"
              icon={SvgAddLines}
              onClick={() => setSystemPromptModalOpen(true)}
            >
              {t("admin.chatPreferences.modifyPrompt")}
            </Button>
          </InputHorizontal>

          <Divider paddingParallel="fit" paddingPerpendicular="fit" />

          <Disabled disabled={s.disable_default_assistant ?? false}>
            <div>
              <Section gap={1.5}>
                {/* Connectors */}
                <Section gap={0.75}>
                  <Content
                    title={t("admin.chatPreferences.connectors")}
                    sizePreset="main-content"
                    variant="section"
                  />

                  <Section
                    flexDirection="row"
                    justifyContent="between"
                    alignItems="center"
                    gap={0.25}
                  >
                    {uniqueSources.length === 0 ? (
                      <EmptyMessageCard
                        sizePreset="main-ui"
                        title={t("admin.chatPreferences.noConnectors")}
                      />
                    ) : (
                      <>
                        <Section
                          flexDirection="row"
                          justifyContent="start"
                          alignItems="center"
                          gap={0.25}
                        >
                          {uniqueSources.slice(0, 3).map((source) => {
                            const meta = getSourceMetadata(source);
                            return (
                              <div key={source} className="w-40">
                                <Card padding="sm" border="solid">
                                  <Content
                                    icon={meta.icon}
                                    title={meta.displayName}
                                    sizePreset="main-ui"
                                  />
                                </Card>
                              </div>
                            );
                          })}
                        </Section>

                        <Button
                          href="/admin/indexing/status"
                          prominence="tertiary"
                          rightIcon={SvgExternalLink}
                        >
                          {t("admin.chatPreferences.manageAll")}
                        </Button>
                      </>
                    )}
                  </Section>
                </Section>

                {/* Actions & Tools */}
                <SimpleCollapsible>
                  <SimpleCollapsible.Header
                    title={t("admin.chatPreferences.actionsTools")}
                    description={t("admin.chatPreferences.actionsToolsDesc")}
                  />
                  <SimpleCollapsible.Content>
                    <Section gap={0.5} alignItems="stretch">
                      {vectorDbEnabled && searchTool && (
                        <Card border="solid" rounding="lg">
                          <InputHorizontal
                            title={t("admin.chatPreferences.internalSearch")}
                            description={t("admin.chatPreferences.internalSearchDesc")}
                            withLabel
                          >
                            <Switch
                              checked={isToolEnabled(searchTool.id)}
                              onCheckedChange={(checked) =>
                                void toggleTool(searchTool.id, checked)
                              }
                            />
                          </InputHorizontal>
                        </Card>
                      )}

                      <Disabled
                        disabled={!imageGenTool}
                        tooltip={t("admin.chatPreferences.imageGenDisabledTooltip")}
                      >
                        <Card border="solid" rounding="lg">
                          <InputHorizontal
                            title={t("admin.chatPreferences.imageGen")}
                            description={t("admin.chatPreferences.imageGenDesc")}
                            disabled={!imageGenTool}
                            withLabel
                          >
                            <Switch
                              checked={
                                imageGenTool
                                  ? isToolEnabled(imageGenTool.id)
                                  : false
                              }
                              onCheckedChange={(checked) =>
                                imageGenTool &&
                                void toggleTool(imageGenTool.id, checked)
                              }
                              disabled={!imageGenTool}
                            />
                          </InputHorizontal>
                        </Card>
                      </Disabled>

                      <Disabled disabled={!webSearchTool}>
                        <Card border="solid" rounding="lg">
                          <InputHorizontal
                            title={t("admin.chatPreferences.webSearch")}
                            description={t("admin.chatPreferences.webSearchDesc")}
                            disabled={!webSearchTool}
                            withLabel
                          >
                            <Switch
                              checked={
                                webSearchTool
                                  ? isToolEnabled(webSearchTool.id)
                                  : false
                              }
                              onCheckedChange={(checked) =>
                                webSearchTool &&
                                void toggleTool(webSearchTool.id, checked)
                              }
                              disabled={!webSearchTool}
                            />
                          </InputHorizontal>
                        </Card>
                      </Disabled>

                      <Disabled disabled={!openURLTool}>
                        <Card border="solid" rounding="lg">
                          <InputHorizontal
                            title={t("admin.chatPreferences.openUrl")}
                            description={t("admin.chatPreferences.openUrlDesc")}
                            disabled={!openURLTool}
                            withLabel
                          >
                            <Switch
                              checked={
                                openURLTool
                                  ? isToolEnabled(openURLTool.id)
                                  : false
                              }
                              onCheckedChange={(checked) =>
                                openURLTool &&
                                void toggleTool(openURLTool.id, checked)
                              }
                              disabled={!openURLTool}
                            />
                          </InputHorizontal>
                        </Card>
                      </Disabled>

                      <Disabled disabled={!codeInterpreterTool}>
                        <Card border="solid" rounding="lg">
                          <InputHorizontal
                            title={t("admin.chatPreferences.codeInterpreter")}
                            description={t("admin.chatPreferences.codeInterpreterDesc")}
                            disabled={!codeInterpreterTool}
                            withLabel
                          >
                            <Switch
                              checked={
                                codeInterpreterTool
                                  ? isToolEnabled(codeInterpreterTool.id)
                                  : false
                              }
                              onCheckedChange={(checked) =>
                                codeInterpreterTool &&
                                void toggleTool(codeInterpreterTool.id, checked)
                              }
                              disabled={!codeInterpreterTool}
                            />
                          </InputHorizontal>
                        </Card>
                      </Disabled>

                      <Disabled disabled={!codingAgentTool}>
                        <Card border="solid" rounding="lg">
                          <InputHorizontal
                            title={t("admin.chatPreferences.codingAgent")}
                            description={t("admin.chatPreferences.codingAgentDesc")}
                            disabled={!codingAgentTool}
                            withLabel
                          >
                            <Switch
                              checked={
                                codingAgentTool
                                  ? isToolEnabled(codingAgentTool.id)
                                  : false
                              }
                              onCheckedChange={(checked) =>
                                codingAgentTool &&
                                void toggleTool(codingAgentTool.id, checked)
                              }
                              disabled={!codingAgentTool}
                            />
                          </InputHorizontal>
                        </Card>
                      </Disabled>
                    </Section>

                    {/* Separator between built-in tools and MCP/OpenAPI tools */}
                    {(mcpServersWithTools.length > 0 ||
                      openApiTools.length > 0) && (
                      <Divider
                        paddingPerpendicular="sm"
                        paddingParallel="fit"
                      />
                    )}

                    {/* MCP Servers & OpenAPI Tools */}
                    <Section gap={0.5}>
                      {mcpServersWithTools.map(({ server, tools }) => (
                        <MCPServerCard
                          key={server.id}
                          server={server}
                          tools={tools}
                          isToolEnabled={isToolEnabled}
                          onToggleTool={toggleTool}
                          onToggleTools={toggleTools}
                        />
                      ))}
                      {openApiTools.map((tool) => (
                        <Card key={tool.id} border="solid" rounding="lg">
                          <InputHorizontal
                            icon={SvgActions}
                            title={tool.display_name || tool.name}
                            description={tool.description}
                            withLabel
                          >
                            <Switch
                              checked={isToolEnabled(tool.id)}
                              onCheckedChange={(checked) =>
                                toggleTool(tool.id, checked)
                              }
                            />
                          </InputHorizontal>
                        </Card>
                      ))}
                    </Section>
                  </SimpleCollapsible.Content>
                </SimpleCollapsible>
              </Section>
            </div>
          </Disabled>

          <Divider paddingParallel="fit" paddingPerpendicular="fit" />

          {/* Advanced Options */}
          <SimpleCollapsible defaultOpen={false}>
            <SimpleCollapsible.Header title={t("admin.chatPreferences.advancedOptions")} />
            <SimpleCollapsible.Content>
              <Section gap={1}>
                <Card border="solid" rounding="lg">
                  <Section alignItems="stretch">
                    <Disabled
                      disabled={!enterpriseTier}
                      tooltip={t("admin.chatPreferences.keepChatHistoryPlan")}
                    >
                      <InputHorizontal
                        title={t("admin.chatPreferences.keepChatHistory")}
                        description={t("admin.chatPreferences.keepChatHistoryDesc")}
                        tag={
                          !enterpriseTier
                            ? {
                                title: "Enterprise Plan",
                                color: "amber",
                                icon: SvgOrganization,
                              }
                            : undefined
                        }
                        disabled={!enterpriseTier}
                        withLabel
                      >
                        <RetentionField
                          value={s.maximum_chat_retention_days ?? null}
                          disabled={!enterpriseTier}
                          onSave={(maximum_chat_retention_days) =>
                            void saveSettings({ maximum_chat_retention_days })
                          }
                        />
                      </InputHorizontal>
                    </Disabled>

                    <InputHorizontal
                      title={t("admin.chatPreferences.queryHistoryVisibility")}
                      description={t("admin.chatPreferences.queryHistoryVisibilityDesc")}
                      withLabel
                    >
                      <InputSelect
                        value={s.query_history_type ?? QueryHistoryType.NORMAL}
                        onValueChange={(value) => {
                          void saveSettings({
                            query_history_type: value as QueryHistoryType,
                          });
                        }}
                      >
                        <InputSelect.Trigger />
                        <InputSelect.Content>
                          <InputSelect.Item
                            value={QueryHistoryType.NORMAL}
                            description={t("admin.chatPreferences.showWithUserInfoDesc")}
                          >
                            {t("admin.chatPreferences.showWithUserInfo")}
                          </InputSelect.Item>
                          <InputSelect.Item
                            value={QueryHistoryType.ANONYMIZED}
                            description={t("admin.chatPreferences.anonymizedDesc")}
                          >
                            {t("admin.chatPreferences.anonymized")}
                          </InputSelect.Item>
                          <InputSelect.Item
                            value={QueryHistoryType.DISABLED}
                            description={t("admin.chatPreferences.hiddenDesc")}
                          >
                            {t("admin.chatPreferences.hidden")}
                          </InputSelect.Item>
                        </InputSelect.Content>
                      </InputSelect>
                    </InputHorizontal>
                  </Section>
                </Card>

                <Card border="solid" rounding="lg">
                  <InputVertical
                    title={t("admin.chatPreferences.fileAttachmentLimit")}
                    description={t("admin.chatPreferences.fileAttachmentLimitDesc")}
                    withLabel
                  >
                    <FileSizeLimitFields
                      saveSettings={saveSettings}
                      initialUploadSizeMb={
                        (s.user_file_max_upload_size_mb ?? 0) <= 0
                          ? (s.default_user_file_max_upload_size_mb?.toString() ??
                            "100")
                          : s.user_file_max_upload_size_mb!.toString()
                      }
                      defaultUploadSizeMb={
                        s.default_user_file_max_upload_size_mb?.toString() ??
                        "100"
                      }
                      initialTokenThresholdK={
                        s.file_token_count_threshold_k == null
                          ? (s.default_file_token_count_threshold_k?.toString() ??
                            "200")
                          : s.file_token_count_threshold_k === 0
                            ? ""
                            : s.file_token_count_threshold_k.toString()
                      }
                      defaultTokenThresholdK={
                        s.default_file_token_count_threshold_k?.toString() ??
                        "200"
                      }
                      maxAllowedUploadSizeMb={s.max_allowed_upload_size_mb}
                    />
                  </InputVertical>
                </Card>

                <Card border="solid" rounding="lg">
                  <Section>
                    <InputHorizontal
                      title={t("admin.chatPreferences.allowAnonymous")}
                      description={t("admin.chatPreferences.allowAnonymousDesc")}
                      withLabel
                    >
                      <Switch
                        checked={s.anonymous_user_enabled ?? false}
                        onCheckedChange={(checked) => {
                          void saveSettings({
                            anonymous_user_enabled: checked,
                          });
                        }}
                      />
                    </InputHorizontal>

                    <InputHorizontal
                      title={t("admin.chatPreferences.alwaysStartAgent")}
                      description={t("admin.chatPreferences.alwaysStartAgentDesc")}
                      withLabel
                    >
                      <Switch
                        id="disable_default_assistant"
                        checked={s.disable_default_assistant ?? false}
                        onCheckedChange={(checked) => {
                          void saveSettings({
                            disable_default_assistant: checked,
                          });
                        }}
                      />
                    </InputHorizontal>
                  </Section>
                </Card>
              </Section>
            </SimpleCollapsible.Content>
          </SimpleCollapsible>
        </SettingsLayouts.Body>
      </SettingsLayouts.Root>

      <Modal
        open={systemPromptModalOpen}
        onOpenChange={setSystemPromptModalOpen}
      >
        <Modal.Content width="xl" height="fit">
          <Formik
            initialValues={{
              system_prompt:
                defaultAgentConfig?.system_prompt ??
                defaultAgentConfig?.default_system_prompt ??
                "",
            }}
            onSubmit={async ({ system_prompt }) => {
              try {
                const response = await fetch("/api/admin/default-assistant", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ system_prompt }),
                });
                if (!response.ok) {
                  const errorMsg = (await response.json()).detail;
                  throw new Error(errorMsg);
                }
                await mutateDefaultAgent();
                setSystemPromptModalOpen(false);
                toast.success(t("admin.chatPreferences.systemPromptUpdated"));
              } catch {
                toast.error(t("admin.chatPreferences.failedUpdateSystemPrompt"));
              }
            }}
          >
            {({ dirty, isSubmitting, submitForm, setFieldValue }) => {
              const defaultPrompt =
                defaultAgentConfig?.default_system_prompt ?? "";

              const handleRestore = () => {
                void setFieldValue("system_prompt", defaultPrompt);
              };

              return (
                <Form>
                  <Modal.Header
                    icon={SvgAddLines}
                    title={t("admin.chatPreferences.modifyPromptTitle")}
                    description={t("admin.chatPreferences.modifyPromptDesc")}
                    onClose={() => setSystemPromptModalOpen(false)}
                  />
                  <Modal.Body>
                    <Section gap={0.25} alignItems="start">
                      <Hoverable.Root group="systemPromptRestore" width="full">
                        <InputTextAreaField
                          name="system_prompt"
                          placeholder={t("admin.chatPreferences.enterSystemPromptPlaceholder")}
                          rows={8}
                          maxRows={20}
                          autoResize
                          rightSection={
                            <Hoverable.Item
                              group="systemPromptRestore"
                              variant="appear-on-hover"
                            >
                              <Button
                                icon={SvgRefreshCw}
                                tooltip={t("admin.chatPreferences.restoreTooltip")}
                                prominence="internal"
                                onClick={handleRestore}
                              />
                            </Hoverable.Item>
                          }
                        />
                      </Hoverable.Root>
                      <Text font="secondary-body" color="text-03">
                        {markdown(
                          "You can use the following placeholders in your prompt:\n`{{CURRENT_DATETIME}}` - Current date and day of the week in a human-readable format.\n`{{CITATION_GUIDANCE}}` - Instructions for providing citations when facts are retrieved from search tools.\nOnly included when search tools are used.\n`{{REMINDER_TAG_DESCRIPTION}}` - Instructions for how to interpret system reminders in user messages."
                        )}
                      </Text>
                    </Section>
                    <MessageCard
                      title={t("admin.chatPreferences.modifyCautionTitle")}
                      description={t("admin.chatPreferences.modifyCautionDesc")}
                      padding="xs"
                    />
                  </Modal.Body>
                  <Modal.Footer>
                    <Button
                      prominence="secondary"
                      onClick={() => setSystemPromptModalOpen(false)}
                    >
                      {t("admin.chatPreferences.cancel")}
                    </Button>
                    <Button
                      prominence="primary"
                      onClick={submitForm}
                      disabled={!dirty || isSubmitting}
                    >
                      {t("admin.chatPreferences.save")}
                    </Button>
                  </Modal.Footer>
                </Form>
              );
            }}
          </Formik>
        </Modal.Content>
      </Modal>
    </>
  );
}
