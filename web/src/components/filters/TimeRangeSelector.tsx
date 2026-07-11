import { DefaultDropdownElement } from "../Dropdown";
import { useTranslation } from "@/providers/LanguageProvider";

export function TimeRangeSelector({
  value,
  onValueChange,
  className,
  timeRangeValues,
}: {
  value: any;
  onValueChange: any;
  className: any;

  timeRangeValues: { labelKey: string; value: Date }[];
}) {
  const { t } = useTranslation();
  return (
    <div className={className}>
      {timeRangeValues.map((timeRangeValue) => {
        const translatedLabel = t(timeRangeValue.labelKey);
        return (
          <DefaultDropdownElement
            key={timeRangeValue.labelKey}
            name={translatedLabel}
            onSelect={() =>
              onValueChange({
                to: new Date(),
                from: timeRangeValue.value,
                selectValue: translatedLabel,
                selectValueKey: timeRangeValue.labelKey,
              })
            }
            isSelected={value?.selectValueKey === timeRangeValue.labelKey}
          />
        );
      })}
    </div>
  );
}
