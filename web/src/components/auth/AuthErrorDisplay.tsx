"use client";

import { useEffect } from "react";
import { toast } from "@/hooks/useToast";
import { useTranslation } from "@/providers/LanguageProvider";

const ERROR_MESSAGE_KEYS: Record<string, string> = {
  Anonymous: "auth.anonymousAccessDisabled",
};

export default function AuthErrorDisplay({
  searchParams,
}: {
  searchParams: any;
}) {
  const { t } = useTranslation();
  const error = searchParams?.error;

  useEffect(() => {
    if (error) {
      const key = ERROR_MESSAGE_KEYS[error as string];
      toast.error(key ? t(key) : t("auth.genericError"));
    }
  }, [error, t]);

  return null;
}
