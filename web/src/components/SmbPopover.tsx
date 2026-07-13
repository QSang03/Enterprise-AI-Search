import React from "react";
import { Popover } from "@opal/components";
import { FileText, FolderOpen, Copy, Question } from "@phosphor-icons/react";
import { convertSmbToUnc, syncCopy } from "@/lib/search/utils";
import { toast } from "@/hooks/useToast";

interface SmbPopoverProps {
  url: string;
  children: React.ReactNode;
  isInline?: boolean;
}

export function SmbPopover({ url, children, isInline = false }: SmbPopoverProps) {
  const uncPath = convertSmbToUnc(url);
  const TriggerWrapper = isInline ? "span" : "div";

  return (
    <Popover>
      <Popover.Trigger asChild>
        <TriggerWrapper className={isInline ? "inline-block cursor-pointer" : "w-full cursor-pointer"}>
          {children}
        </TriggerWrapper>
      </Popover.Trigger>
      <Popover.Content {...({ align: "start" } as any)}>
        <div className="p-3 flex flex-col gap-2 bg-background border border-border rounded-lg shadow-lg z-50 min-w-[220px]">
          <div className="text-xs font-semibold text-text-muted mb-1 truncate max-w-[280px]" title={uncPath}>
            {uncPath}
          </div>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              window.open(`onyx-open://open?path=${encodeURIComponent(uncPath)}`);
            }}
            className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-hover rounded-md text-left text-text"
          >
            <FileText size={16} className="text-text-muted" />
            Mở trực tiếp (File)
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              window.open(`onyx-open://select?path=${encodeURIComponent(uncPath)}`);
            }}
            className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-hover rounded-md text-left text-text"
          >
            <FolderOpen size={16} className="text-text-muted" />
            Mở thư mục chứa
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              const success = syncCopy(uncPath);
              if (success) {
                toast({
                  message: "Copied Windows path (UNC) to clipboard!",
                  description: uncPath,
                  level: "success",
                });
              } else {
                toast({
                  message: "Failed to copy path to clipboard.",
                  level: "error",
                });
              }
            }}
            className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-hover rounded-md text-left text-text"
          >
            <Copy size={16} className="text-text-muted" />
            Sao chép đường dẫn (UNC)
          </button>

          <div className="border-t border-border my-1" />

          <a
            href="/scripts/onyx-open.reg"
            download="onyx-open.reg"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2 px-2 py-1 text-xs text-link hover:underline"
          >
            <Question size={14} />
            Tải file đăng ký mở trực tiếp trên Windows (.reg)
          </a>
        </div>
      </Popover.Content>
    </Popover>
  );
}
