"use client";

import { Text } from "@opal/components";
import { useTranslation } from "@/providers/LanguageProvider";

interface OnboardingInfoPagesProps {
  step: "page1" | "page2";
}

export default function OnboardingInfoPages({
  step,
}: OnboardingInfoPagesProps) {
  const { t } = useTranslation();

  if (step === "page1") {
    return (
      <div className="flex-1 flex flex-col gap-6 items-center justify-center text-center">
        <Text font="heading-h2" color="text-05">
          {t("craft.onboardingPage1Title")}
        </Text>
        <img
          src="/craft_demo_image_1.png"
          alt={t("craft.onboardingPage1Alt")}
          className="max-w-full h-auto rounded-12"
        />
        <div className="flex flex-col items-center">
          <Text font="main-content-body" color="text-04">
            {t("craft.onboardingPage1Desc1")}
          </Text>
          <Text font="main-content-body" color="text-04">
            {t("craft.onboardingPage1Desc2")}
          </Text>
        </div>
      </div>
    );
  }

  // Page 2
  return (
    <div className="flex-1 flex flex-col gap-6 items-center justify-center">
      <Text font="heading-h2" color="text-05">
        {t("craft.onboardingPage2Title")}
      </Text>
      <img
        src="/craft_demo_image_2.png"
        alt={t("craft.onboardingPage1Alt")}
        className="max-w-full h-auto rounded-12"
      />
    </div>
  );
}
