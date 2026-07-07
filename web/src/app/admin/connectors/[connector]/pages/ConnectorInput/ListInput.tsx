import React from "react";
import { TextArrayField } from "@/components/Field";
import { useFormikContext } from "formik";
import { useTranslation } from "@/providers/LanguageProvider";

interface ListInputProps {
  name: string;
  label: string | ((credential: any) => string);
  description: string | ((credential: any) => string);
}

const ListInput: React.FC<ListInputProps> = ({ name, label, description }) => {
  const { t } = useTranslation();
  const { values } = useFormikContext<any>();
  const resolvedLabel = typeof label === "function" ? label(null) : label;
  
  return (
    <TextArrayField
      name={name}
      label={resolvedLabel}
      values={values}
      subtext={
        typeof description === "function" ? description(null) : description
      }
      placeholder={t("connectorInput.enterPlaceholder").replace("{label}", resolvedLabel)}
    />
  );
};

export default ListInput;
