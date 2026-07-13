import { timeAgo } from "@opal/time";
import { MetadataBadge } from "../MetadataBadge";
import { useTranslation } from "@/providers/LanguageProvider";

export function DocumentUpdatedAtBadge({
  updatedAt,
  modal,
}: {
  updatedAt: string;
  modal?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <MetadataBadge
      flexNone={modal}
      value={
        modal
          ? timeAgo(updatedAt)
          : t("documentDisplay.updatedTimeAgo", { time: timeAgo(updatedAt) })
      }
    />
  );
}
