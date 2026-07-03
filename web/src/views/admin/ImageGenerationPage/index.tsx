"use client";

import { SettingsLayouts } from "@opal/layouts";
import ImageGenerationContent from "@/views/admin/ImageGenerationPage/ImageGenerationContent";
import { useTranslation } from "@/providers/LanguageProvider";
import { ADMIN_ROUTES } from "@/lib/admin-routes";

const route = ADMIN_ROUTES.IMAGE_GENERATION;

export default function ImageGenerationPage() {
  const { t } = useTranslation();
  return (
    <SettingsLayouts.Root>
      <SettingsLayouts.Header
        icon={route.icon}
        title={route.title}
        description={t("admin.imageGen.headerDesc")}
        divider
      />
      <SettingsLayouts.Body>
        <ImageGenerationContent />
      </SettingsLayouts.Body>
    </SettingsLayouts.Root>
  );
}
