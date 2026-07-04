"use client";

import { useState } from "react";
import { buildImgUrl } from "./utils";
import { FullImageModal } from "./FullImageModal";
import { useTranslation } from "@/providers/LanguageProvider";

export function InputBarPreviewImage({ fileId }: { fileId: string }) {
  const { t } = useTranslation();
  const [fullImageShowing, setFullImageShowing] = useState(false);

  return (
    <>
      <FullImageModal
        fileId={fileId}
        open={fullImageShowing}
        onOpenChange={(open) => setFullImageShowing(open)}
      />
      <div
        className={`
          bg-transparent
          border-none
          flex
          items-center
          bg-accent-background-hovered
          border
          border-border
          rounded-md
          box-border
          h-6
      `}
      >
        <img
          alt={t("chat.preview")}
          onClick={() => setFullImageShowing(true)}
          className="h-6 w-6 object-cover rounded-lg bg-background cursor-pointer"
          src={buildImgUrl(fileId)}
        />
      </div>
    </>
  );
}
