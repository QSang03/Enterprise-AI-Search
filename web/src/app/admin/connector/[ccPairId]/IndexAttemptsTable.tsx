"use client";

import { useState } from "react";
import {
  Table,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
  TableHeader,
} from "@/components/ui/table";
import { Button, Text } from "@opal/components";
import { Callout } from "@/components/ui/callout";
import { CCPairFullInfo } from "./types";
import { IndexAttemptSnapshot } from "@/lib/types";
import { IndexAttemptStatus } from "@/components/Status";
import { PageSelector } from "@/components/PageSelector";
import { localizeAndPrettify } from "@opal/time";
import { getDocsProcessedPerMinute } from "@/lib/indexAttempt";
import { SvgBarChartSmall, SvgClock, SvgInfo } from "@opal/icons";
import ExceptionTraceModal from "@/sections/modals/PreviewModal/ExceptionTraceModal";
import { Tooltip } from "@opal/components";
import { Section } from "@/layouts/general-layouts";
import StageMetricsModal from "./StageMetricsModal";
import { useTranslation } from "@/providers/LanguageProvider";

export interface IndexingAttemptsTableProps {
  ccPair: CCPairFullInfo;
  indexAttempts: IndexAttemptSnapshot[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function IndexAttemptsTable({
  indexAttempts,
  currentPage,
  totalPages,
  onPageChange,
}: IndexingAttemptsTableProps) {
  const { t } = useTranslation();
  const [indexAttemptTracePopupId, setIndexAttemptTracePopupId] = useState<
    number | null
  >(null);
  const [metricsAttemptId, setMetricsAttemptId] = useState<number | null>(null);

  if (!indexAttempts?.length) {
    return (
      <Callout
        className="mt-4"
        title={t("connectorCCPair.noIndexAttemptsTitle")}
        type="notice"
      >
        {t("connectorCCPair.noIndexAttemptsDesc")}
      </Callout>
    );
  }

  const indexAttemptToDisplayTraceFor = indexAttempts?.find(
    (indexAttempt) => indexAttempt.id === indexAttemptTracePopupId
  );

  return (
    <>
      {indexAttemptToDisplayTraceFor?.full_exception_trace && (
        <ExceptionTraceModal
          onOutsideClick={() => setIndexAttemptTracePopupId(null)}
          exceptionTrace={indexAttemptToDisplayTraceFor.full_exception_trace}
        />
      )}

      {metricsAttemptId !== null && (
        <StageMetricsModal
          indexAttemptId={metricsAttemptId}
          onClose={() => setMetricsAttemptId(null)}
        />
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("connectorCCPair.timeStartedHeader")}</TableHead>
            <TableHead>{t("connectorCCPair.tableHeaderStatus")}</TableHead>
            <TableHead className="whitespace-nowrap">{t("connectorCCPair.newDocsHeader")}</TableHead>
            <TableHead>
              <Tooltip
                tooltip={t("connectorCCPair.totalDocsTooltip")}
                side="top"
              >
                <span className="flex items-center">
                  {t("connectorCCPair.totalDocsHeader")}
                  <SvgInfo className="ml-1 w-4 h-4" />
                </span>
              </Tooltip>
            </TableHead>
            <TableHead>{t("connectorCCPair.errorMessageHeader")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {indexAttempts.map((indexAttempt) => {
            const docsPerMinute =
              getDocsProcessedPerMinute(indexAttempt)?.toFixed(2);
            const isReindexInProgress =
              indexAttempt.status === "in_progress" ||
              indexAttempt.status === "not_started";
            const reindexTooltip = isReindexInProgress
              ? t("connectorCCPair.reindexTooltipInProgress")
              : t("connectorCCPair.reindexTooltipDone");
            return (
              <TableRow
                key={indexAttempt.id}
                className={
                  indexAttempt.full_exception_trace
                    ? "hover:bg-accent-background cursor-pointer relative select-none"
                    : undefined
                }
              >
                <TableCell>
                  {indexAttempt.time_started
                    ? localizeAndPrettify(indexAttempt.time_started)
                    : "-"}
                </TableCell>
                <TableCell>
                  <Section
                    alignItems="start"
                    width="fit"
                    height="fit"
                    gap={0.25}
                  >
                    <IndexAttemptStatus
                      status={indexAttempt.status || "not_started"}
                    />
                    {docsPerMinute ? (
                      <Section
                        flexDirection="row"
                        justifyContent="start"
                        alignItems="center"
                        width="fit"
                        height="fit"
                        gap={0.25}
                        // Stack above the row-wide trace overlay button so
                        // the metrics button stays clickable on rows with
                        // a full exception trace.
                        className="relative z-content"
                      >
                        <Text font="secondary-body" color="text-03">
                          {t("connectorCCPair.docsPerMinText", { count: docsPerMinute })}
                        </Text>
                        <Button
                          icon={SvgBarChartSmall}
                          prominence="tertiary"
                          size="sm"
                          tooltip={t("connectorCCPair.viewStageMetrics")}
                          onClick={() => setMetricsAttemptId(indexAttempt.id)}
                        />
                      </Section>
                    ) : (
                      indexAttempt.status === "success" && (
                        <Text font="secondary-body" color="text-03">
                          {t("connectorCCPair.noAdditionalDocs")}
                        </Text>
                      )
                    )}
                  </Section>
                </TableCell>
                <TableCell>
                  <div className="flex">
                    <div className="text-right">
                      <div>{indexAttempt.new_docs_indexed}</div>
                      {indexAttempt.docs_removed_from_index > 0 && (
                        <div className="text-xs w-52 text-wrap flex italic overflow-hidden whitespace-normal px-1">
                          {t("connectorCCPair.removedDocsNote", {
                            count: indexAttempt.docs_removed_from_index,
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center">
                    {indexAttempt.total_docs_indexed}
                    {indexAttempt.from_beginning && (
                      <Tooltip side="top" tooltip={reindexTooltip}>
                        <span className="cursor-help flex items-center">
                          <SvgClock className="ml-2 h-3.5 w-3.5 stroke-current" />
                        </span>
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {indexAttempt.status === "success" && <Text as="p">-</Text>}

                  {indexAttempt.status === "failed" &&
                    indexAttempt.error_msg && (
                      <Text as="p">{indexAttempt.error_msg}</Text>
                    )}
                </TableCell>
                <td className="w-0 p-0">
                  {indexAttempt.full_exception_trace && (
                    <button
                      type="button"
                      aria-label={t("connectorCCPair.viewFullTrace")}
                      onClick={() =>
                        setIndexAttemptTracePopupId(indexAttempt.id)
                      }
                      className="absolute w-full h-full left-0 top-0"
                    />
                  )}
                </td>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {totalPages > 1 && (
        <div className="flex flex-1 justify-center pt-3">
          <PageSelector
            totalPages={totalPages}
            currentPage={currentPage}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </>
  );
}
