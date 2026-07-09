"use client";

import React, { useState, memo } from "react";
import { SidebarTab } from "@opal/components";
import ChatButton from "@/sections/sidebar/ChatButton";
import { useAppRouter } from "@/hooks/appNavigation";
import { noProp } from "@/lib/utils";
import Truncated from "@/refresh-components/texts/Truncated";
import useAppFocus from "@/hooks/useAppFocus";
import { SvgFolder, SvgFolderOpen } from "@opal/icons";
import { useDepartmentChatSessions } from "@/hooks/useDepartmentChatSessions";
import { Button } from "@opal/components";
import { useSearchParams } from "next/navigation";
import useChatSessions from "@/hooks/useChatSessions";

export interface DepartmentFolderButtonProps {
  departmentId: number;
  name: string;
}

const DepartmentFolderButton = memo(({ departmentId, name }: DepartmentFolderButtonProps) => {
  const route = useAppRouter();
  const [open, setOpen] = useState(false);
  const activeSidebar = useAppFocus();
  const searchParams = useSearchParams();
  const { currentChatSession } = useChatSessions();

  const { chatSessions } = useDepartmentChatSessions(open ? departmentId : null);

  const isActive =
    (currentChatSession && currentChatSession.department_id === departmentId) ||
    (currentChatSession === null && searchParams?.get("departmentId") === String(departmentId));

  function getFolderIcon() {
    return open ? SvgFolderOpen : SvgFolder;
  }

  function handleIconClick() {
    setOpen((prev) => !prev);
  }

  function handleTextClick() {
    route({ departmentId });
  }

  return (
    <div>
      <SidebarTab
        icon={() => (
          <Button
            icon={getFolderIcon()}
            prominence="tertiary"
            size="sm"
            onClick={noProp(handleIconClick)}
          />
        )}
        selected={!!isActive}
        onClick={noProp(handleTextClick)}
      >
        <Truncated text03>{name}</Truncated>
      </SidebarTab>

      {/* Department Chat-Sessions */}
      {open &&
        chatSessions.map((chatSession) => (
          <ChatButton
            key={chatSession.id}
            chatSession={chatSession}
            draggable={false}
          />
        ))}
    </div>
  );
});
DepartmentFolderButton.displayName = "DepartmentFolderButton";

export default DepartmentFolderButton;
