import { useFormContext } from "@/components/context/FormContext";
import { Button } from "@opal/components";
import { SvgArrowLeft, SvgArrowRight, SvgPlusCircle } from "@opal/icons";
import { useTranslation } from "@/providers/LanguageProvider";

const NavigationRow = ({
  noAdvanced,
  noCredentials,
  activatedCredential,
  onSubmit,
  isValid,
}: {
  isValid: boolean;
  onSubmit: () => void;
  noAdvanced: boolean;
  noCredentials: boolean;
  activatedCredential: boolean;
}) => {
  const { t } = useTranslation();
  const { formStep, prevFormStep, nextFormStep } = useFormContext();

  return (
    <div className="mt-4 w-full grid grid-cols-3">
      <div>
        {((formStep > 0 && !noCredentials) ||
          (formStep > 1 && !noAdvanced)) && (
          <Button
            prominence="secondary"
            onClick={prevFormStep}
            icon={SvgArrowLeft}
          >
            {t("addConnector.previousBtn")}
          </Button>
        )}
      </div>
      <div className="flex justify-center">
        {(formStep > 0 || noCredentials) && (
          <Button
            disabled={!isValid}
            rightIcon={SvgPlusCircle}
            onClick={onSubmit}
          >
            {t("addConnector.createConnectorBtn")}
          </Button>
        )}
      </div>
      <div className="flex justify-end">
        {formStep === 0 && (
          <Button
            disabled={!activatedCredential}
            variant="action"
            rightIcon={SvgArrowRight}
            onClick={() => nextFormStep()}
          >
            {t("addConnector.continueBtn")}
          </Button>
        )}
        {!noAdvanced && formStep === 1 && (
          <Button
            disabled={!isValid}
            prominence="secondary"
            rightIcon={SvgArrowRight}
            onClick={() => nextFormStep()}
          >
            {t("addConnector.advancedNavBtn")}
          </Button>
        )}
      </div>
    </div>
  );
};
export default NavigationRow;
