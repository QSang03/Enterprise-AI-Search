"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "@/providers/LanguageProvider";
import {
  createTableColumns,
  EmptyMessageCard,
  Pagination,
  Table,
  Text,
} from "@opal/components";
import { Section } from "@/layouts/general-layouts";
import { localizeAndPrettify } from "@opal/time";
import ExceptionTraceModal from "@/sections/modals/PreviewModal/ExceptionTraceModal";
import { PermissionSyncStatusBadge } from "./PermissionSyncStatusBadge";
import type { DocPermissionSyncAttemptSnapshot } from "./types";

/**
 * Renders one page of `DocPermissionSyncAttempt` rows for the
 * connector-detail "Document Permissions" tab.
 *
 * Pagination is **driven externally** — the parent owns the SWR /
 * `usePaginatedFetch` state and passes the current page slice in. This
 * mirrors `IndexAttemptsTable`'s API so `SyncAttemptsTabs` (PR C) can
 * wire all three tables uniformly.
 *
 * Empty state ("no attempts yet but the sync IS applicable") is
 * distinct from the not-applicable state, which is rendered higher up
 * by `SyncAttemptsTabs` and never reaches this component. We render a
 * neutral `MessageCard` here only when `attempts.length === 0` AND the
 * caller has decided this tab is applicable.
 */

const tc = createTableColumns<DocPermissionSyncAttemptSnapshot>();

// Weights are TanStack-relative; they sum to 100 here purely for
// readability. `Time Started` is bumped to 28 so `localizeAndPrettify`
// (e.g. "5/3/2026, 12:00:00 PM") stays on a single line at standard
// 800px-wide admin layouts; the difference is taken from `Status` and
// `Docs Synced`, which both render short content.
function buildColumns(
  onErrorClick: (errorMessage: string) => void,
  t: (key: string) => string
) {
  return [
    tc.column("time_started", {
      header: t("connectorCCPair.timeStartedHeader"),
      weight: 28,
      enableSorting: false,
      cell: (value) => (
        <Text as="span" font="main-ui-body" color="text-04">
          {value ? localizeAndPrettify(value) : "-"}
        </Text>
      ),
    }),
    tc.column("status", {
      header: t("connectorCCPair.tableHeaderStatus"),
      weight: 14,
      enableSorting: false,
      cell: (value, row) => (
        <PermissionSyncStatusBadge
          status={value}
          errorMsg={row.error_message}
        />
      ),
    }),
    tc.column("total_docs_synced", {
      header: t("connectorCCPair.docsSyncedHeader"),
      weight: 12,
      enableSorting: false,
      cell: (value) => (
        <Text as="span" font="main-ui-body" color="text-04">
          {String(value)}
        </Text>
      ),
    }),
    tc.column("docs_with_permission_errors", {
      header: t("connectorCCPair.permissionErrorsHeader"),
      weight: 18,
      enableSorting: false,
      cell: (value) => (
        <Text as="span" font="main-ui-body" color="text-04">
          {String(value)}
        </Text>
      ),
    }),
    tc.column("error_message", {
      header: t("connectorCCPair.errorMessageHeader"),
      weight: 28,
      enableSorting: false,
      cell: (value, row) => (
        <ErrorMessageCell
          errorMessage={value}
          modalContent={row.full_exception_trace ?? value}
          onErrorClick={onErrorClick}
        />
      ),
    }),
  ];
}

interface ErrorMessageCellProps {
  errorMessage: string | null;
  /**
   * Full content shown in `ExceptionTraceModal` on click — prefers the
   * traceback when present, otherwise falls back to the short
   * ``error_message``. Older attempts (pre-traceback-capture migration)
   * have ``full_exception_trace = null`` and gracefully degrade to the
   * single-line summary, matching `IndexAttemptsTable`'s behavior.
   */
  modalContent: string | null;
  onErrorClick: (errorMessage: string) => void;
}

/**
 * Renders the truncated error message as a clickable button when a
 * message is present, opening the `ExceptionTraceModal` on click.
 * Mirrors the row-level click affordance in `IndexAttemptsTable`,
 * scoped here to just the cell so the status-badge tooltip on the
 * left stays its own independent affordance.
 */
function ErrorMessageCell({
  errorMessage,
  modalContent,
  onErrorClick,
}: ErrorMessageCellProps) {
  const { t } = useTranslation();
  if (!errorMessage) {
    return (
      <Text as="span" font="secondary-body" color="text-03">
        -
      </Text>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onErrorClick(modalContent ?? errorMessage)}
      aria-label={t("connectorCCPair.viewFullError")}
      className="text-left w-full cursor-pointer hover:underline"
    >
      <Text as="span" font="secondary-body" color="text-03" maxLines={2}>
        {errorMessage}
      </Text>
    </button>
  );
}

export interface DocPermissionSyncAttemptsTableProps {
  attempts: DocPermissionSyncAttemptSnapshot[];
  /** 1-based page index, matching `IndexAttemptsTable`. */
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function DocPermissionSyncAttemptsTable({
  attempts,
  currentPage,
  totalPages,
  onPageChange,
}: DocPermissionSyncAttemptsTableProps) {
  const { t } = useTranslation();
  const [openErrorMessage, setOpenErrorMessage] = useState<string | null>(null);
  const handleErrorClick = useCallback(
    (errorMessage: string) => setOpenErrorMessage(errorMessage),
    []
  );
  const columns = useMemo(
    () => buildColumns(handleErrorClick, t),
    [handleErrorClick, t]
  );

  if (!attempts.length) {
    return (
      <EmptyMessageCard
        sizePreset="main-ui"
        title={t("connectorCCPair.noPermissionSyncAttemptsTitle")}
        description={t("connectorCCPair.noPermissionSyncAttemptsDesc")}
      />
    );
  }

  return (
    <>
      {openErrorMessage !== null && (
        <ExceptionTraceModal
          onOutsideClick={() => setOpenErrorMessage(null)}
          exceptionTrace={openErrorMessage}
          title={t("connectorCCPair.docPermSyncErrorTitle")}
        />
      )}

      <Section gap={0.75} alignItems="stretch" height="auto">
        <Table
          data={attempts}
          columns={columns}
          getRowId={(row) => String(row.id)}
        />
        {totalPages > 1 && (
          <Section
            flexDirection="row"
            justifyContent="center"
            height="auto"
            className="pt-1"
          >
            <Pagination
              variant="list"
              currentPage={currentPage}
              totalPages={totalPages}
              onChange={onPageChange}
            />
          </Section>
        )}
      </Section>
    </>
  );
}
