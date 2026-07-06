"use client";

import { SvgBook } from "@opal/icons";
import { useTranslation } from "@/providers/LanguageProvider";

interface SystemInfoClientProps {
  webVersion: string | null;
  backendVersion: string | null;
}

export default function SystemInfoClient({
  webVersion,
  backendVersion,
}: SystemInfoClientProps) {
  const { t } = useTranslation();

  return (
    <div>
      <div className="border-solid border-background-600 border-b pb-2 mb-4 flex">
        <SvgBook size={32} />
        <h1 className="text-3xl font-bold pl-2">{t("systeminfo.title")}</h1>
      </div>

      <div>
        <div className="flex mb-2">
          <p className="my-auto mr-1">{t("systeminfo.backendVersion")} </p>
          <p className="text-base my-auto text-slate-400 italic">
            {backendVersion || "-"}
          </p>
        </div>
        <div className="flex mb-2">
          <p className="my-auto mr-1">{t("systeminfo.webVersion")} </p>
          <p className="text-base my-auto text-slate-400 italic">
            {webVersion || "-"}
          </p>
        </div>
      </div>
    </div>
  );
}
