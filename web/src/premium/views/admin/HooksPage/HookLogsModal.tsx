"use client";

import { Button, Text } from "@opal/components";
import { SvgDownload, SvgTextLines, SvgSimpleLoader } from "@opal/icons";
import Modal from "@/refresh-components/Modal";
import { CopyButton } from "@opal/components";
import { Hoverable } from "@opal/core";
import { useHookExecutionLogs } from "@/premium/hooks/useHookExecutionLogs";
import { formatDateTimeLog } from "@/lib/dateUtils";
import { downloadFile } from "@/lib/download";
import { Section } from "@/layouts/general-layouts";
import type {
  HookExecutionRecord,
  HookPointMeta,
  HookResponse,
} from "@/premium/views/admin/HooksPage/interfaces";
import { useModalClose } from "@/refresh-components/contexts/ModalContext";
import { useTranslation } from "@/providers/LanguageProvider";

interface HookLogsModalProps {
  hook: HookResponse;
  spec: HookPointMeta | undefined;
}

// Section header: "Past Hour ————" or "Older ————"
//
// TODO(@raunakab): replace this with a proper, opalified `Separator` component (when it lands).
function SectionHeader({ label }: { label: string }) {
  return (
    <Section
      flexDirection="row"
      alignItems="center"
      height="fit"
      className="py-1"
    >
      <Text font="secondary-body" color="text-03">
        {label}
      </Text>
      <div className="flex-1 ml-2 border-t border-border-02" />
    </Section>
  );
}

function LogRow({ log, group }: { log: HookExecutionRecord; group: string }) {
  return (
    <Hoverable.Root group={group}>
      <Section
        flexDirection="row"
        justifyContent="start"
        alignItems="start"
        gap={0.5}
        height="fit"
        className="py-2"
      >
        {/* 1. Timestamp */}
        <span className="shrink-0 text-code-code">
          <Text font="secondary-mono-label" color="inherit" nowrap>
            {formatDateTimeLog(log.created_at)}
          </Text>
        </span>
        {/* 2. Error message */}
        <span className="flex-1 min-w-0 break-all whitespace-pre-wrap text-code-code">
          <Text font="secondary-mono" color="inherit">
            {log.error_message ?? "Lỗi không xác định"}
          </Text>
        </span>
        {/* 3. Copy button */}
        <Section width="fit" height="fit" alignItems="center">
          <Hoverable.Item group={group} variant="appear-on-hover">
            <CopyButton size="xs" getCopyText={() => log.error_message ?? ""} />
          </Hoverable.Item>
        </Section>
      </Section>
    </Hoverable.Root>
  );
}

export default function HookLogsModal({ hook, spec }: HookLogsModalProps) {
  const onClose = useModalClose();
  const { t } = useTranslation();

  const { recentErrors, olderErrors, isLoading, error } = useHookExecutionLogs(
    hook.id,
    10
  );

  const totalLines = recentErrors.length + olderErrors.length;
  const allLogs = [...recentErrors, ...olderErrors];

  function getLogsText() {
    return allLogs
      .map(
        (log) =>
          `${formatDateTimeLog(log.created_at)} ${
            log.error_message ?? t("admin.hooks.unknownError")
          }`
      )
      .join("\n");
  }

  function handleDownload() {
    downloadFile(`${hook.name}-errors.txt`, { content: getLogsText() });
  }

  return (
    <Modal open onOpenChange={onClose}>
      <Modal.Content width="md" height="fit">
        <Modal.Header
          icon={(props) => <SvgTextLines {...props} />}
          title={t("admin.hooks.errorHistoryTitle")}
          description={`Hook: ${hook.name} • Hook Point: ${
            spec?.display_name ?? hook.hook_point
          }`}
          onClose={onClose}
        />
        <Modal.Body>
          {isLoading ? (
            <Section justifyContent="center" height="fit" className="py-6">
              <SvgSimpleLoader />
            </Section>
          ) : error ? (
            <Text font="main-ui-body" color="text-03">
              {t("admin.hooks.errorHistoryLoadFailed")}
            </Text>
          ) : totalLines === 0 ? (
            <Text font="main-ui-body" color="text-03">
              {t("admin.hooks.errorHistoryNoErrors30d")}
            </Text>
          ) : (
            <>
              {recentErrors.length > 0 && (
                <>
                  <SectionHeader label={t("admin.hooks.pastHour")} />
                  {recentErrors.map((log, idx) => (
                    <LogRow
                      key={log.created_at + String(idx)}
                      log={log}
                      group={log.created_at + String(idx)}
                    />
                  ))}
                </>
              )}
              {olderErrors.length > 0 && (
                <>
                  <SectionHeader label={t("admin.hooks.older")} />
                  {olderErrors.map((log, idx) => (
                    <LogRow
                      key={log.created_at + String(idx)}
                      log={log}
                      group={log.created_at + String(idx)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </Modal.Body>
        <Section
          flexDirection="row"
          justifyContent="between"
          alignItems="center"
          padding={0.5}
          className="bg-background-tint-01"
        >
          <Text font="main-ui-body" color="text-03">
            {t("admin.hooks.linesCount", { count: totalLines })}
          </Text>
          <Section
            flexDirection="row"
            alignItems="center"
            width="fit"
            gap={0.25}
            padding={0.25}
            className="rounded-xl bg-background-tint-00"
          >
            <CopyButton size="sm" tooltip={t("admin.hooks.copy")} getCopyText={getLogsText} />
            <Button
              prominence="tertiary"
              size="sm"
              icon={SvgDownload}
              tooltip={t("admin.hooks.download")}
              onClick={handleDownload}
            />
          </Section>
        </Section>
      </Modal.Content>
    </Modal>
  );
}
