"use client";

import { StandardAnswerCreationForm } from "@/app/premium/admin/standard-answer/StandardAnswerCreationForm";
import { ErrorCallout } from "@/components/ErrorCallout";
import { SettingsLayouts } from "@opal/layouts";
import { ADMIN_ROUTES } from "@/lib/admin-routes";
import { StandardAnswer, StandardAnswerCategory } from "@/lib/types";
import { useTranslation } from "@/providers/LanguageProvider";
import { useEffect, useState } from "react";

const route = ADMIN_ROUTES.STANDARD_ANSWERS;

function Main({ id }: { id: string }) {
  const { t } = useTranslation();
  const [standardAnswer, setStandardAnswer] = useState<StandardAnswer | null>(null);
  const [standardAnswerCategories, setStandardAnswerCategories] = useState<StandardAnswerCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const tasks = [
          fetch("/api/manage/admin/standard-answer"),
          fetch("/api/manage/admin/standard-answer/category"),
        ];
        const [standardAnswersResponse, standardAnswerCategoriesResponse] =
          await Promise.all(tasks);

        if (!standardAnswersResponse || !standardAnswersResponse.ok) {
          const errorMsg = standardAnswersResponse 
            ? `${t("failedToFetchStandardAnswers")} - ${await standardAnswersResponse.text()}`
            : t("failedToFetchStandardAnswers");
          setError(errorMsg);
          return;
        }

        const allStandardAnswers =
          (await standardAnswersResponse.json()) as StandardAnswer[];
        const foundAnswer = allStandardAnswers.find(
          (answer) => answer.id.toString() === id
        );

        if (!foundAnswer) {
          setError(t("didNotFindStandardAnswer", { id }));
          return;
        }

        setStandardAnswer(foundAnswer);

        if (!standardAnswerCategoriesResponse || !standardAnswerCategoriesResponse.ok) {
          const errorMsg = standardAnswerCategoriesResponse
            ? `${t("failedToFetchStandardAnswerCategories")} - ${await standardAnswerCategoriesResponse.text()}`
            : t("failedToFetchStandardAnswerCategories");
          setError(errorMsg);
          return;
        }

        const categories =
          (await standardAnswerCategoriesResponse.json()) as StandardAnswerCategory[];
        setStandardAnswerCategories(categories);
      } catch (err) {
        setError(t("failedToFetchData"));
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [id, t]);

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

  if (!standardAnswer || !standardAnswerCategories) {
    return null;
  }

  return (
    <StandardAnswerCreationForm
      standardAnswerCategories={standardAnswerCategories}
      existingStandardAnswer={standardAnswer}
    />
  );
}

export default function Page(props: { params: Promise<{ id: string }> }) {
  const { t } = useTranslation();
  const [params, setParams] = useState<{ id: string } | null>(null);

  useEffect(() => {
    props.params.then(setParams);
  }, [props.params]);

  if (!params) {
    return null;
  }

  return (
    <SettingsLayouts.Root>
      <SettingsLayouts.Header
        icon={route.icon}
        title={t("editStandardAnswer")}
        backButton
        divider
      />
      <SettingsLayouts.Body>
        <Main id={params.id} />
      </SettingsLayouts.Body>
    </SettingsLayouts.Root>
  );
}
