import { Badge } from "@/components/ui/badge";
import { Feedback } from "@/lib/types";
import { useTranslation } from "@/providers/LanguageProvider";

export function FeedbackBadge({
  feedback,
}: {
  feedback?: Feedback | "mixed" | null;
}) {
  const { t } = useTranslation();
  let feedbackBadge;
  switch (feedback) {
    case "like":
      feedbackBadge = (
        <Badge variant="success" className="text-sm">
          {t("queryHistory.feedbackLike")}
        </Badge>
      );
      break;
    case "dislike":
      feedbackBadge = (
        <Badge variant="destructive" className="text-sm">
          {t("queryHistory.feedbackDislike")}
        </Badge>
      );
      break;
    case "mixed":
      feedbackBadge = (
        <Badge variant="purple" className="text-sm">
          {t("queryHistory.feedbackMixed")}
        </Badge>
      );
      break;
    default:
      feedbackBadge = (
        <Badge variant="outline" className="text-sm">
          N/A
        </Badge>
      );
      break;
  }
  return feedbackBadge;
}
