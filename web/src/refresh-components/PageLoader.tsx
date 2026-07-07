"use client";

import React from "react";
import { Text } from "@opal/components";
import { OnyxLoader } from "@/refresh-components/OnyxLoader";
import { useTranslation } from "@/providers/LanguageProvider";

interface PageLoaderProps {
  /** Label shown beneath the mark. Defaults to common.loading. */
  text?: string;
}

/**
 * Full-page loading state: the animated Onyx mark with a loading label,
 * centered within the available space. Use this for page/route-level loading
 * (e.g. while a page's data is being fetched). For an inline or section-level
 * loader without a label, use `OnyxLoader` directly.
 */
export function PageLoader({ text }: PageLoaderProps) {
  const { t } = useTranslation();
  const label = text ?? t("common.loading");

  return (
    <div className="flex h-full min-h-[60vh] w-full flex-col items-center justify-center gap-3 p-5">
      <OnyxLoader />
      <Text font="main-ui-muted" color="text-03">
        {label}
      </Text>
    </div>
  );
}

export default PageLoader;
