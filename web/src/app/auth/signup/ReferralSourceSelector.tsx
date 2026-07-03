"use client";

import { useState } from "react";
import InputSelect from "@/refresh-components/inputs/InputSelect";
import { Label } from "@/components/Field";
import { useTranslation } from "@/providers/LanguageProvider";

interface ReferralSourceSelectorProps {
  defaultValue?: string;
}

export default function ReferralSourceSelector({
  defaultValue,
}: ReferralSourceSelectorProps) {
  const { t } = useTranslation();
  const [referralSource, setReferralSource] = useState(defaultValue);

  const referralOptions = [
    { value: "search", label: t("auth.referralSearch") },
    { value: "friend", label: t("auth.referralFriend") },
    { value: "linkedin", label: t("auth.referralLinkedin") },
    { value: "twitter", label: t("auth.referralTwitter") },
    { value: "hackernews", label: t("auth.referralHackernews") },
    { value: "reddit", label: t("auth.referralReddit") },
    { value: "youtube", label: t("auth.referralYoutube") },
    { value: "podcast", label: t("auth.referralPodcast") },
    { value: "blog", label: t("auth.referralBlog") },
    { value: "ads", label: t("auth.referralAds") },
    { value: "other", label: t("auth.referralOther") },
  ];

  const handleChange = (value: string) => {
    setReferralSource(value);
    const cookies = require("js-cookie");
    cookies.set("referral_source", value, {
      expires: 365,
      path: "/",
      sameSite: "strict",
    });
  };

  return (
    <div className="w-full gap-y-2 flex flex-col">
      <Label className="text-text-950" small={false}>
        {t("auth.referralLabel")}
      </Label>
      <InputSelect value={referralSource} onValueChange={handleChange}>
        <InputSelect.Trigger placeholder={t("auth.referralPlaceholder")} />

        <InputSelect.Content>
          {referralOptions.map((option) => (
            <InputSelect.Item key={option.value} value={option.value}>
              {option.label}
            </InputSelect.Item>
          ))}
        </InputSelect.Content>
      </InputSelect>
    </div>
  );
}
