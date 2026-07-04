import { SvgTrash } from "@opal/icons";
import { Button } from "@opal/components";
import { useTranslation } from "@/providers/LanguageProvider";

export interface DeleteButtonProps {
  onClick?: (event: React.MouseEvent<HTMLElement>) => void | Promise<void>;
  disabled?: boolean;
}

export function DeleteButton({ onClick, disabled }: DeleteButtonProps) {
  const { t } = useTranslation();
  return (
    <Button
      disabled={disabled}
      onClick={onClick}
      icon={SvgTrash}
      tooltip={t("common.delete")}
      prominence="tertiary"
      size="sm"
    />
  );
}
