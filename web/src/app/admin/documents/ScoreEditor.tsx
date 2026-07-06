import { toast } from "@/hooks/useToast";
import { updateBoost } from "./lib";
import { EditableValue } from "@/components/EditableValue";
import { useTranslation } from "@/providers/LanguageProvider";

export const ScoreSection = ({
  documentId,
  initialScore,
  refresh,
  consistentWidth = true,
}: {
  documentId: string;
  initialScore: number;
  refresh: () => void;
  consistentWidth?: boolean;
}) => {
  const { t } = useTranslation();

  const onSubmit = async (value: string) => {
    const numericScore = Number(value);
    if (isNaN(numericScore)) {
      toast.error(t("adminScoreEditor.toastScoreMustBeNumber"));
      return false;
    }

    const errorMsg = await updateBoost(documentId, numericScore);
    if (errorMsg) {
      toast.error(errorMsg);
      return false;
    } else {
      toast.success(t("adminScoreEditor.toastUpdatedScoreSuccess"));
      refresh();
    }

    return true;
  };

  return (
    <EditableValue
      initialValue={initialScore.toString()}
      onSubmit={onSubmit}
      consistentWidth={consistentWidth}
    />
  );
};
