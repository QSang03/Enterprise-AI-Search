"use client";

import React, { useState, memo, useEffect } from "react";
import { SidebarTab } from "@opal/components";
import ChatButton from "@/sections/sidebar/ChatButton";
import { useAppRouter } from "@/hooks/appNavigation";
import { noProp } from "@/lib/utils";
import Truncated from "@/refresh-components/texts/Truncated";
import useAppFocus from "@/hooks/useAppFocus";
import { SvgFolder, SvgFolderOpen, SvgPlus } from "@opal/icons";
import { useDepartmentChatSessions } from "@/hooks/useDepartmentChatSessions";
import { Button } from "@opal/components";
import { useSearchParams } from "next/navigation";
import useChatSessions from "@/hooks/useChatSessions";
import IconButton from "@/refresh-components/buttons/IconButton";
import { useTranslation } from "@/providers/LanguageProvider";
import { useQueryController } from "@/providers/QueryControllerProvider";

export interface DepartmentFolderButtonProps {
  departmentId: number;
  name: string;
}

const DepartmentFolderButton = memo(({ departmentId, name }: DepartmentFolderButtonProps) => {
  const route = useAppRouter();
  const activeSidebar = useAppFocus();
  const searchParams = useSearchParams();
  const { currentChatSession } = useChatSessions();
  const { t } = useTranslation();

  const { reset } = useQueryController();

  const isActive =
    (currentChatSession && currentChatSession.department_id === departmentId) ||
    (currentChatSession === null && searchParams?.get("departmentId") === String(departmentId));

  const [open, setOpen] = useState(!!isActive);

  useEffect(() => {
    if (isActive) {
      setOpen(true);
    }
  }, [isActive]);

  const { chatSessions } = useDepartmentChatSessions(open ? departmentId : null);

  function getFolderIcon() {
    return open ? SvgFolderOpen : SvgFolder;
  }

  function handleFolderToggle() {
    setOpen((prev) => !prev);
  }

  function handleNewChatClick() {
    reset();
    route({ departmentId });
  }

  const isNewChatInStoreActive =
    currentChatSession === null && searchParams?.get("departmentId") === String(departmentId);

  return (
    <div>
      <SidebarTab
        icon={() => (
          <Button
            icon={getFolderIcon()}
            prominence="tertiary"
            size="sm"
            onClick={noProp(handleFolderToggle)}
          />
        )}
        selected={false}
        onClick={noProp(handleFolderToggle)}
        rightChildren={
          <IconButton
            icon={SvgPlus}
            className="hidden group-hover/SidebarTab:flex"
            onClick={noProp(handleNewChatClick)}
            internal
          />
        }
      >
        <Truncated text03>{name}</Truncated>
      </SidebarTab>

      {/* Department Chat-Sessions */}
      {open && (
        <>
          {chatSessions.length > 0 ? (
            chatSessions.map((chatSession) => (
              <ChatButton
                key={chatSession.id}
                chatSession={chatSession}
                draggable={false}
                nested={true}
              />
            ))
          ) : (
            <SidebarTab
              icon={SvgPlus}
              nested={true}
              selected={isNewChatInStoreActive}
              onClick={noProp(handleNewChatClick)}
            >
              <span className="text-xs text-neutral-500 italic">
                {t("sidebar.newChatInStore") || "Trò chuyện mới trong kho"}
              </span>
            </SidebarTab>
          )}
        </>
      )}
    </div>
  );
});
DepartmentFolderButton.displayName = "DepartmentFolderButton";

export default DepartmentFolderButton;
