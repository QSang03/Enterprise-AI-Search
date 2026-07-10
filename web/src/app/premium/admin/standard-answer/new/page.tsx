"use client";

import { StandardAnswerCreationForm } from "@/app/premium/admin/standard-answer/StandardAnswerCreationForm";
import { fetchSS } from "@/lib/utilsSS";
import { ErrorCallout } from "@/components/ErrorCallout";
import { SettingsLayouts } from "@opal/layouts";
import { ADMIN_ROUTES } from "@/lib/admin-routes";
import { StandardAnswerCategory } from "@/lib/types";
import { useTranslation } from "@/providers/LanguageProvider";
import { useEffect, useState } from "react";

const route = ADMIN_ROUTES.STANDARD_ANSWERS;

function Page() {
  const { t } = useTranslation();
  const [standardAnswerCategories, setStandardAnswerCategories] = useState<StandardAnswerCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchCategories() {
      try {
        const response = await fetchSS("/manage/admin/standard-answer/category");
        if (!response.ok) {
          setError(`${t("failedToFetchStandardAnswerCategories")} - ${await response.text()}`);
        } else {
          const data = (await response.json()) as StandardAnswerCategory[];
          setStandardAnswerCategories(data);
        }
      } catch (err) {
        setError(t("failedToFetchStandardAnswerCategories"));
      } finally {
        setIsLoading(false);
      }
    }

    fetchCategories();
  }, [t]);

  if (isLoading) {
    return null;
  }

  if (error) {
    return (
      <ErrorCallout
        errorTitle={t("somethingWentWrong")}
        errorMsg={error}
      />
    );
  }

  return (
    <SettingsLayouts.Root>
      <SettingsLayouts.Header
        icon={route.icon}
        title={t("newStandardAnswer")}
        backButton
        divider
      />
      <SettingsLayouts.Body>
        <StandardAnswerCreationForm
          standardAnswerCategories={standardAnswerCategories || []}
        />
      </SettingsLayouts.Body>
    </SettingsLayouts.Root>
  );
}

export default Page;
