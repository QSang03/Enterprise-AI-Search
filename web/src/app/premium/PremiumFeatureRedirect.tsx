"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/useToast";

import { useTranslation } from "@/providers/LanguageProvider";

export default function PremiumFeatureRedirect() {
  const { t } = useTranslation();
  const router = useRouter();

  useEffect(() => {
    toast.error(
      t("premium.licenseRequired")
    );
    router.replace("/app");
  }, [router, t]);

  return null;
}
