import SvgSimpleLoader from "@opal/icons/simple-loader";
import { getDatesList, useOnyxBotAnalytics } from "../lib";
import { DateRangePickerValue } from "@/components/dateRangeSelectors/AdminDateRangeSelector";
import { Text } from "@opal/components";
import Title from "@/components/ui/title";
import CardSection from "@/components/admin/CardSection";
import { AreaChartDisplay } from "@/components/ui/areaChart";
import { useTranslation } from "@/providers/LanguageProvider";

export function OnyxBotChart({
  timeRange,
}: {
  timeRange: DateRangePickerValue;
}) {
  const { t } = useTranslation();
  const {
    data: onyxBotAnalyticsData,
    isLoading: isOnyxBotAnalyticsLoading,
    error: onyxBotAnalyticsError,
  } = useOnyxBotAnalytics(timeRange);

  let chart;
  if (isOnyxBotAnalyticsLoading) {
    chart = (
      <div className="h-80 flex flex-col items-center justify-center">
        <SvgSimpleLoader className="h-6 w-6" />
      </div>
    );
  } else if (
    !onyxBotAnalyticsData ||
    onyxBotAnalyticsData[0] == undefined ||
    onyxBotAnalyticsError
  ) {
    chart = (
      <div className="h-80 text-red-600 text-bold flex flex-col">
        <p className="m-auto">{t("admin.failedToFetchFeedbackData")}</p>
      </div>
    );
  } else {
    const initialDate =
      timeRange.from || new Date(onyxBotAnalyticsData[0].date);
    const dateRange = getDatesList(initialDate);

    const dateToOnyxBotAnalytics = new Map(
      onyxBotAnalyticsData.map((onyxBotAnalyticsEntry) => [
        onyxBotAnalyticsEntry.date,
        onyxBotAnalyticsEntry,
      ])
    );

    chart = (
      <AreaChartDisplay
        className="mt-4"
        data={dateRange.map((dateStr) => {
          const onyxBotAnalyticsForDate = dateToOnyxBotAnalytics.get(dateStr);
          return {
            [t("admin.day")]: dateStr,
            [t("admin.totalQueries")]: onyxBotAnalyticsForDate?.total_queries || 0,
            [t("admin.automaticallyResolved")]:
              onyxBotAnalyticsForDate?.auto_resolved || 0,
          };
        })}
        categories={[t("admin.totalQueries"), t("admin.automaticallyResolved")]}
        index={t("admin.day")}
        colors={["indigo", "fuchsia"]}
        yAxisWidth={60}
      />
    );
  }

  return (
    <CardSection className="mt-8">
      <Title>{t("admin.slackChannel")}</Title>
      <Text as="p">{t("admin.totalQueriesVsAutoResolved")}</Text>
      {chart}
    </CardSection>
  );
}
