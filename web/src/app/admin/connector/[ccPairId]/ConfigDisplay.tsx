"use client";

import { useState } from "react";

import { ValidSources } from "@/lib/types";
import { Section } from "@/layouts/general-layouts";
import Text from "@/refresh-components/texts/Text";
import { Button, Divider } from "@opal/components";
import { SvgChevronUp, SvgChevronDown, SvgEdit } from "@opal/icons";
import Truncated from "@/refresh-components/texts/Truncated";
import { useTranslation } from "@/providers/LanguageProvider";

function convertObjectToString(obj: any): string | any {
  if (typeof obj === "object" && obj !== null) {
    if (!Array.isArray(obj)) {
      return JSON.stringify(obj);
    } else {
      if (obj.length === 0) {
        return null;
      }
      return obj.map((item) => convertObjectToString(item)).join(", ");
    }
  }
  if (typeof obj === "boolean") {
    return obj.toString();
  }
  return obj;
}

export function buildConfigEntries(
  obj: any,
  sourceType: ValidSources
): { [key: string]: string } {
  if (sourceType === ValidSources.File) {
    return {};
  } else if (sourceType === ValidSources.GoogleSites) {
    return {
      base_url: obj.base_url,
    };
  }
  return obj;
}

interface ConfigItemProps {
  label: string;
  value: any;
  onEdit?: () => void;
}

function ConfigItem({ label, value, onEdit }: ConfigItemProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const isExpandable = Array.isArray(value) && value.length > 5;

  const renderValue = () => {
    if (Array.isArray(value)) {
      const displayedItems = isExpanded ? value : value.slice(0, 5);
      return (
        <Section
          flexDirection="row"
          gap={0.25}
          justifyContent="end"
          alignItems="center"
          height="fit"
        >
          <Text secondaryBody text03 className="wrap-break-word">
            {displayedItems
              .map((item) => convertObjectToString(item))
              .join(", ")}
          </Text>
        </Section>
      );
    } else if (typeof value === "object" && value !== null) {
      return (
        <Section gap={0.25} alignItems="end" height="fit">
          {Object.entries(value).map(([key, val]) => (
            <Text key={key} secondaryBody text03 className="wrap-break-word">
              <Text mainContentEmphasis text03>
                {key}:
              </Text>{" "}
              {convertObjectToString(val)}
            </Text>
          ))}
        </Section>
      );
    } else if (typeof value === "boolean") {
      return (
        <Text secondaryBody text03 className="text-right">
          {value ? t("connectorCCPair.trueText") : t("connectorCCPair.falseText")}
        </Text>
      );
    }
    return (
      <Truncated secondaryBody text03 className="text-right">
        {convertObjectToString(value) || "-"}
      </Truncated>
    );
  };

  return (
    <Section
      flexDirection="row"
      justifyContent="between"
      alignItems="center"
      gap={1}
    >
      <Section alignItems="start">
        <Text mainUiBody text04>
          {label}
        </Text>
      </Section>
      <Section
        flexDirection="row"
        justifyContent="end"
        alignItems="center"
        gap={0.5}
      >
        {renderValue()}

        {isExpandable && (
          <Button
            prominence="tertiary"
            size="md"
            icon={isExpanded ? SvgChevronUp : SvgChevronDown}
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded
              ? t("connectorCCPair.showLess")
              : t("connectorCCPair.showAll", { count: value.length })}
          </Button>
        )}
        {onEdit && (
          <Button
            prominence="tertiary"
            icon={SvgEdit}
            onClick={onEdit}
            tooltip={t("connectorCCPair.editTooltip")}
          />
        )}
      </Section>
    </Section>
  );
}

export function AdvancedConfigDisplay({
  pruneFreq,
  refreshFreq,
  indexingStart,
  onRefreshEdit,
  onPruningEdit,
}: {
  pruneFreq: number | null;
  refreshFreq: number | null;
  indexingStart: Date | null;
  onRefreshEdit: () => void;
  onPruningEdit: () => void;
}) {
  const { t, language } = useTranslation();

  const formatRefreshFrequency = (seconds: number | null): string => {
    if (seconds === null) return "-";
    const totalMinutes = seconds / 60;

    // If it's 60 minutes or more and evenly divisible by 60, show in hours
    if (totalMinutes >= 60 && totalMinutes % 60 === 0) {
      const hours = totalMinutes / 60;
      return t("connectorCCPair.hoursText", {
        count: hours,
        unit: hours === 1 ? t("connectorCCPair.hourSingle") : t("connectorCCPair.hourPlural"),
      });
    }

    // Otherwise show in minutes
    const minutes = Math.round(totalMinutes);
    return t("connectorCCPair.minutesText", {
      count: minutes,
      unit: minutes === 1 ? t("connectorCCPair.minuteSingle") : t("connectorCCPair.minutePlural"),
    });
  };

  const formatPruneFrequency = (seconds: number | null): string => {
    if (seconds === null) return "-";
    const totalHours = seconds / 3600;

    // If less than 1 hour, show in minutes
    if (totalHours < 1) {
      const minutes = Math.round(seconds / 60);
      return t("connectorCCPair.minutesText", {
        count: minutes,
        unit: minutes === 1 ? t("connectorCCPair.minuteSingle") : t("connectorCCPair.minutePlural"),
      });
    }

    const hours = Math.round(totalHours);

    // If it's 24 hours or more and evenly divisible by 24, show in days
    if (hours >= 24 && hours % 24 === 0) {
      const days = hours / 24;
      return t("connectorCCPair.daysText", {
        count: days,
        unit: days === 1 ? t("connectorCCPair.daySingle") : t("connectorCCPair.dayPlural"),
      });
    }

    // Otherwise show in hours
    return t("connectorCCPair.hoursText", {
      count: hours,
      unit: hours === 1 ? t("connectorCCPair.hourSingle") : t("connectorCCPair.hourPlural"),
    });
  };

  const formatDate = (date: Date | null): string => {
    if (date === null) return "-";
    return date.toLocaleString(language === "vi" ? "vi-VN" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  };

  const items = [
    pruneFreq !== null && {
      label: t("connectorCCPair.pruningFrequencyTitle"),
      value: formatPruneFrequency(pruneFreq),
      onEdit: onPruningEdit,
    },
    refreshFreq && {
      label: t("connectorCCPair.refreshFrequencyTitle"),
      value: formatRefreshFrequency(refreshFreq),
      onEdit: onRefreshEdit,
    },
    indexingStart && {
      label: t("connectorCCPair.indexingStart"),
      value: formatDate(indexingStart),
    },
  ].filter(Boolean) as ConfigItemProps[];

  return (
    <Section gap={0} height="fit">
      {items.map((item, index) => (
        <div key={item.label} className="w-full">
          <div className="py-4">
            <ConfigItem
              label={item.label}
              value={item.value}
              onEdit={item.onEdit}
            />
          </div>
          {index < items.length - 1 && (
            <Divider paddingParallel="fit" paddingPerpendicular="fit" />
          )}
        </div>
      ))}
    </Section>
  );
}

export function ConfigDisplay({
  configEntries,
  onEdit,
}: {
  configEntries: { [key: string]: string };
  onEdit?: (key: string) => void;
}) {
  const entries = Object.entries(configEntries);

  return (
    <Section gap={0} height="fit">
      {entries.map(([key, value], index) => (
        <div key={key} className="w-full">
          <div className="py-4">
            <ConfigItem
              label={key}
              value={value}
              onEdit={onEdit ? () => onEdit(key) : undefined}
            />
          </div>
          {index < entries.length - 1 && (
            <Divider paddingParallel="fit" paddingPerpendicular="fit" />
          )}
        </div>
      ))}
    </Section>
  );
}
