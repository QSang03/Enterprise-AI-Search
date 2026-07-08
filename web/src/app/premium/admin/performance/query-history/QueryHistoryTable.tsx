import {
  Table,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
  TableHeader,
} from "@/components/ui/table";
import Text from "@/refresh-components/texts/Text";
import InputSelect from "@/refresh-components/inputs/InputSelect";
import SvgSimpleLoader from "@opal/icons/simple-loader";
import { ChatSessionMinimal } from "@/app/premium/admin/performance/usage/types";
import { Section } from "@/layouts/general-layouts";
import { timestampToReadableDate } from "@/lib/dateUtils";
import { Dispatch, SetStateAction, useCallback, useState } from "react";
import { Feedback, TaskStatus } from "@/lib/types";
import {
  DateRange,
  AdminDateRangeSelector,
} from "@/components/dateRangeSelectors/AdminDateRangeSelector";
import { PageSelector } from "@/components/PageSelector";
import Link from "next/link";
import type { Route } from "next";
import { FeedbackBadge } from "@/app/premium/admin/performance/query-history/FeedbackBadge";
import KickoffCSVExport from "@/app/premium/admin/performance/query-history/KickoffCSVExport";
import CardSection from "@/components/admin/CardSection";
import usePaginatedFetch from "@/hooks/usePaginatedFetch";
import { ErrorCallout } from "@/components/ErrorCallout";
import { errorHandlingFetcher } from "@/lib/fetcher";
import useSWR from "swr";
import { useTranslation } from "@/providers/LanguageProvider";
import { TaskQueueState } from "@/app/premium/admin/performance/query-history/types";
import { withRequestId } from "@/app/premium/admin/performance/query-history/utils";
import {
  DOWNLOAD_QUERY_HISTORY_URL,
  LIST_QUERY_HISTORY_URL,
  NUM_IN_PAGE,
  ITEMS_PER_PAGE,
  PAGES_PER_BATCH,
  PREVIOUS_CSV_TASK_BUTTON_NAME,
} from "@/app/premium/admin/performance/query-history/constants";
import { humanReadableFormatWithTime } from "@opal/time";
import Modal from "@/refresh-components/Modal";
import { Button, Divider } from "@opal/components";
import { Badge } from "@/components/ui/badge";
import {
  SvgDownloadCloud,
  SvgFileText,
  SvgMinus,
  SvgMinusCircle,
  SvgThumbsDown,
  SvgThumbsUp,
} from "@opal/icons";
function QueryHistoryTableRow({
  chatSessionMinimal,
}: {
  chatSessionMinimal: ChatSessionMinimal;
}) {
  return (
    <TableRow
      key={chatSessionMinimal.id}
      className="hover:bg-accent-background cursor-pointer relative select-none"
    >
      <TableCell className="max-w-xs">
        <Text className="whitespace-normal line-clamp-5">
          {chatSessionMinimal.first_user_message ||
            chatSessionMinimal.name ||
            "-"}
        </Text>
      </TableCell>
      <TableCell>
        <Text className="whitespace-normal line-clamp-5">
          {chatSessionMinimal.first_ai_message || "-"}
        </Text>
      </TableCell>
      <TableCell>
        <FeedbackBadge feedback={chatSessionMinimal.feedback_type} />
      </TableCell>
      <TableCell>{chatSessionMinimal.user_email || "-"}</TableCell>
      <TableCell>{chatSessionMinimal.assistant_name || "Unknown"}</TableCell>
      <TableCell>
        {timestampToReadableDate(chatSessionMinimal.time_created)}
      </TableCell>
      {/* Wrapping in <td> to avoid console warnings */}
      <td className="w-0 p-0">
        <Link
          href={
            `/premium/admin/performance/query-history/${chatSessionMinimal.id}` as Route
          }
          className="absolute w-full h-full left-0 top-0"
        ></Link>
      </td>
    </TableRow>
  );
}

function SelectFeedbackType({
  value,
  onValueChange,
}: {
  value: Feedback | "all";
  onValueChange: (value: Feedback | "all") => void;
}) {
  const { t } = useTranslation();
  return (
    <Section alignItems="start" gap={0.25}>
      <Text as="p" className="font-medium">
        {t("feedbackType")}
      </Text>
      <InputSelect
        value={value}
        onValueChange={onValueChange as (value: string) => void}
      >
        <InputSelect.Trigger />

        <InputSelect.Content>
          <InputSelect.Item value="all" icon={SvgMinusCircle}>
            {t("any")}
          </InputSelect.Item>
          <InputSelect.Item value="like" icon={SvgThumbsUp}>
            {t("like")}
          </InputSelect.Item>
          <InputSelect.Item value="dislike" icon={SvgThumbsDown}>
            {t("dislike")}
          </InputSelect.Item>
          <InputSelect.Item value="mixed" icon={SvgMinus}>
            {t("mixed")}
          </InputSelect.Item>
        </InputSelect.Content>
      </InputSelect>
    </Section>
  );
}

function ExportBadge({ status }: { status: TaskStatus }) {
  const { t } = useTranslation();
  if (status === "SUCCESS") return <Badge variant="success">{t("successBadge")}</Badge>;
  else if (status === "FAILURE")
    return <Badge variant="destructive">{t("failureBadge")}</Badge>;
  else if (status === "PENDING" || status === "STARTED")
    return <Badge variant="in_progress">{t("pendingBadge")}</Badge>;
  else return <></>;
}

function PreviousQueryHistoryExportsModal({
  setShowModal,
}: {
  setShowModal: Dispatch<SetStateAction<boolean>>;
}) {
  const { t } = useTranslation();
  const { data: queryHistoryTasks } = useSWR<TaskQueueState[]>(
    LIST_QUERY_HISTORY_URL,
    errorHandlingFetcher,
    {
      refreshInterval: 3000,
    }
  );

  const tasks = (queryHistoryTasks ?? []).map((queryHistory) => ({
    taskId: queryHistory.task_id,
    start: new Date(queryHistory.start),
    end: new Date(queryHistory.end),
    status: queryHistory.status,
    startTime: queryHistory.start_time,
  }));

  // sort based off of "most-recently-exported" CSV file.
  tasks.sort((task_a, task_b) => {
    if (task_a.startTime < task_b.startTime) return 1;
    else if (task_a.startTime > task_b.startTime) return -1;
    else return 0;
  });

  const [taskPage, setTaskPage] = useState(1);
  const totalTaskPages = Math.ceil(tasks.length / NUM_IN_PAGE);
  const paginatedTasks = tasks.slice(
    NUM_IN_PAGE * (taskPage - 1),
    NUM_IN_PAGE * taskPage
  );

  return (
    <Modal open onOpenChange={() => setShowModal(false)}>
      <Modal.Content width="full" height="full">
        <Modal.Header
          icon={SvgFileText}
          title={t("previousQueryHistoryExports")}
          onClose={() => setShowModal(false)}
        />
        <Modal.Body>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("generatedAt")}</TableHead>
                <TableHead>{t("startRange")}</TableHead>
                <TableHead>{t("endRange")}</TableHead>
                <TableHead>{t("statusHeader")}</TableHead>
                <TableHead>{t("downloadHeader")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedTasks.map((task, index) => (
                <TableRow key={index}>
                  <TableCell>
                    {humanReadableFormatWithTime(task.startTime)}
                  </TableCell>
                  <TableCell>{task.start.toDateString()}</TableCell>
                  <TableCell>{task.end.toDateString()}</TableCell>
                  <TableCell>
                    <ExportBadge status={task.status} />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="default"
                      prominence="tertiary"
                      icon={SvgDownloadCloud}
                      size="sm"
                      disabled={task.status !== "SUCCESS"}
                      tooltip={
                        task.status !== "SUCCESS"
                          ? "Export is not yet ready"
                          : undefined
                      }
                      href={
                        task.status === "SUCCESS"
                          ? withRequestId(
                              DOWNLOAD_QUERY_HISTORY_URL,
                              task.taskId
                            )
                          : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Section>
            <PageSelector
              currentPage={taskPage}
              totalPages={totalTaskPages}
              onPageChange={setTaskPage}
            />
          </Section>
        </Modal.Body>
      </Modal.Content>
    </Modal>
  );
}

export function QueryHistoryTable() {
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState<DateRange>(undefined);
  const [filters, setFilters] = useState<{
    feedback_type?: Feedback | "all";
    start_time?: string;
    end_time?: string;
  }>({});

  const [showModal, setShowModal] = useState(false);

  const {
    currentPageData: chatSessionData,
    isLoading,
    error,
    currentPage,
    totalPages,
    goToPage,
  } = usePaginatedFetch<ChatSessionMinimal>({
    itemsPerPage: ITEMS_PER_PAGE,
    pagesPerBatch: PAGES_PER_BATCH,
    endpoint: "/api/admin/chat-session-history",
    filter: filters,
  });

  const onTimeRangeChange = useCallback((value: DateRange) => {
    setDateRange(value);

    if (value?.from && value?.to) {
      setFilters((prev) => ({
        ...prev,
        start_time: value.from.toISOString(),
        end_time: value.to.toISOString(),
      }));
    } else {
      setFilters((prev) => {
        const newFilters = { ...prev };
        delete newFilters.start_time;
        delete newFilters.end_time;
        return newFilters;
      });
    }
  }, []);

  if (error) {
    return (
      <ErrorCallout
        errorTitle="Error fetching query history"
        errorMsg={error?.message}
      />
    );
  }

  return (
    <>
      <CardSection className="mt-8">
        <div className="flex">
          <div className="gap-y-3 flex flex-col">
            <SelectFeedbackType
              value={filters.feedback_type || "all"}
              onValueChange={(value) => {
                setFilters((prev) => {
                  const newFilters = { ...prev };
                  if (value === "all") {
                    delete newFilters.feedback_type;
                  } else {
                    newFilters.feedback_type = value;
                  }
                  return newFilters;
                });
              }}
            />

            <AdminDateRangeSelector
              value={dateRange}
              onValueChange={onTimeRangeChange}
            />
          </div>
          <div className="flex flex-row w-full items-center gap-x-2">
            <KickoffCSVExport dateRange={dateRange} />
            <Button prominence="secondary" onClick={() => setShowModal(true)}>
              {PREVIOUS_CSV_TASK_BUTTON_NAME}
            </Button>
          </div>
        </div>
        <Divider />
        <Section>
          <Table className="mt-5">
            <TableHeader>
              <TableRow>
                <TableHead>{t("firstUserMessage")}</TableHead>
                <TableHead>{t("firstAIResponse")}</TableHead>
                <TableHead>{t("feedback")}</TableHead>
                <TableHead>{t("userHeader")}</TableHead>
                <TableHead>{t("personaHeader")}</TableHead>
                <TableHead>{t("dateHeader")}</TableHead>
              </TableRow>
            </TableHeader>
            {isLoading ? (
              <TableBody>
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    <div className="flex justify-center">
                      <SvgSimpleLoader className="h-6 w-6" />
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            ) : (
              <TableBody>
                {chatSessionData?.map((chatSessionMinimal) => (
                  <QueryHistoryTableRow
                    key={chatSessionMinimal.id}
                    chatSessionMinimal={chatSessionMinimal}
                  />
                ))}
              </TableBody>
            )}
          </Table>

          {chatSessionData && (
            <Section>
              <PageSelector
                totalPages={totalPages}
                currentPage={currentPage}
                onPageChange={goToPage}
              />
            </Section>
          )}
        </Section>
      </CardSection>

      {showModal && (
        <PreviousQueryHistoryExportsModal setShowModal={setShowModal} />
      )}
    </>
  );
}
