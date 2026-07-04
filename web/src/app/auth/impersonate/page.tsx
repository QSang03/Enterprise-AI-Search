"use client";

import { useMemo } from "react";
import AuthFlowContainer from "@/components/auth/AuthFlowContainer";
import { useUser } from "@/providers/UserProvider";
import { redirect, useRouter } from "next/navigation";
import type { Route } from "next";
import { Formik, Form, FormikHelpers } from "formik";
import * as Yup from "yup";
import { toast } from "@/hooks/useToast";
import { TextFormField } from "@/components/Field";
import { Button } from "@opal/components";
import Text from "@/refresh-components/texts/Text";
import { useTranslation } from "@/providers/LanguageProvider";

export default function ImpersonatePage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, isCloudSuperuser } = useUser();

  const ImpersonateSchema = useMemo(() => Yup.object().shape({
    email: Yup.string().email(t("auth.invalidEmail")).required(t("auth.required")),
    apiKey: Yup.string().required(t("auth.required")),
  }), [t]);

  if (!user) {
    redirect("/auth/login");
  }

  if (!isCloudSuperuser) {
    redirect("/app" as Route);
  }

  const handleImpersonate = async (
    values: { email: string; apiKey: string },
    helpers: FormikHelpers<{ email: string; apiKey: string }>
  ) => {
    try {
      const response = await fetch("/api/tenants/impersonate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${values.apiKey}`,
        },
        body: JSON.stringify({ email: values.email }),
        credentials: "same-origin",
      });

      if (!response.ok) {
        const errorData = await response.json();
        toast.error(errorData.detail || t("auth.failedImpersonate"));
        helpers.setSubmitting(false);
      } else {
        helpers.setSubmitting(false);
        router.push("/app" as Route);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("auth.failedImpersonate")
      );
      helpers.setSubmitting(false);
    }
  };

  return (
    <AuthFlowContainer>
      <div className="flex flex-col w-full justify-center">
        <div className="w-full flex flex-col items-center justify-center">
          <Text as="p" headingH3 className="mb-6 text-center">
            {t("auth.impersonateUser")}
          </Text>
        </div>

        <Formik
          initialValues={{ email: "", apiKey: "" }}
          validationSchema={ImpersonateSchema}
          onSubmit={(values, helpers) => handleImpersonate(values, helpers)}
        >
          {({ isSubmitting }) => (
            <Form className="flex flex-col gap-4">
              <TextFormField
                name="email"
                type="email"
                label={t("auth.email")}
                placeholder="email@yourcompany.com"
              />

              <TextFormField
                name="apiKey"
                type="password"
                label={t("auth.apiKey")}
                placeholder={t("auth.enterApiKey")}
              />

              <Button disabled={isSubmitting} type="submit" width="full">
                {t("auth.impersonateUser")}
              </Button>
            </Form>
          )}
        </Formik>

        <Text
          as="p"
          mainUiMuted
          text03
          className="mt-4 text-center px-4"
        >
          {t("auth.impersonateNote")}
        </Text>
      </div>
    </AuthFlowContainer>
  );
}
