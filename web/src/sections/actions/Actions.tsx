"use client";
import { ActionStatus } from "@/lib/tools/interfaces";
import React from "react";
import { Button } from "@opal/components";
import {
  SvgArrowExchange,
  SvgChevronDown,
  SvgPlug,
  SvgSettings,
  SvgTrash,
  SvgUnplug,
} from "@opal/icons";
import { useActionCardContext } from "@/sections/actions/ActionCardContext";
import { cn } from "@opal/utils";
import { useTranslation } from "@/providers/LanguageProvider";

interface ActionsProps {
  status: ActionStatus;
  serverName: string;
  onDisconnect?: () => void;
  onManage?: () => void;
  onAuthenticate?: () => void;
  onReconnect?: () => void;
  onDelete?: () => void;
  toolCount?: number;
  isToolsExpanded?: boolean;
  onToggleTools?: () => void;
}

const Actions = React.memo(
  ({
    status,
    serverName,
    onDisconnect,
    onManage,
    onAuthenticate,
    onReconnect,
    onDelete,
    toolCount,
    isToolsExpanded,
    onToggleTools,
  }: ActionsProps) => {
    const { isHovered: isParentHovered } = useActionCardContext();
    const { t } = useTranslation();
    const showViewToolsButton =
      (status === ActionStatus.CONNECTED ||
        status === ActionStatus.FETCHING ||
        status === ActionStatus.DISCONNECTED) &&
      !isToolsExpanded &&
      onToggleTools;

    // Connected state
    if (status === ActionStatus.CONNECTED || status === ActionStatus.FETCHING) {
      return (
        <div className="flex flex-col gap-1 items-end">
          <div className="flex items-center">
            {onDisconnect && (
              <div
                className={cn(
                  "inline-flex transition-all duration-200 ease-out",
                  isParentHovered
                    ? "opacity-100 translate-x-0 pointer-events-auto"
                    : "opacity-0 translate-x-2 pointer-events-none"
                )}
              >
                <Button
                  icon={SvgUnplug}
                  tooltip={t("actions.disconnectServer")}
                  prominence="tertiary"
                  onClick={onDisconnect}
                  aria-label={`Disconnect ${serverName} server`}
                />
              </div>
            )}
            {onManage && (
              <Button
                icon={SvgSettings}
                tooltip={t("actions.manageServer")}
                prominence="tertiary"
                onClick={onManage}
                aria-label={`Manage ${serverName} server`}
              />
            )}
          </div>
          {showViewToolsButton && (
            <Button
              prominence="tertiary"
              onClick={onToggleTools}
              rightIcon={SvgChevronDown}
              aria-label={`View tools for ${serverName}`}
            >
              {status === ActionStatus.FETCHING
                ? t("actions.fetchingTools")
                : t(toolCount !== 1 ? "actions.viewToolsPlural" : "actions.viewTools", { count: toolCount ?? 0 })}
            </Button>
          )}
        </div>
      );
    }

    // Pending state
    if (status === ActionStatus.PENDING) {
      return (
        <div className="flex flex-col gap-1 items-end shrink-0">
          {onAuthenticate && (
            <Button
              prominence="tertiary"
              onClick={onAuthenticate}
              rightIcon={SvgArrowExchange}
              aria-label={`Authenticate and connect to ${serverName}`}
            >
              {t("actions.authenticate")}
            </Button>
          )}
          <div
            className={cn(
              "flex gap-1 items-center transition-opacity duration-200 ease-out",
              isParentHovered
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none"
            )}
          >
            {onDelete && (
              <Button
                icon={SvgTrash}
                tooltip={t("actions.deleteServer")}
                prominence="tertiary"
                onClick={onDelete}
                aria-label={`Delete ${serverName} server`}
              />
            )}
            {onManage && (
              <Button
                icon={SvgSettings}
                tooltip={t("actions.manageServer")}
                prominence="tertiary"
                onClick={onManage}
                aria-label={`Manage ${serverName} server`}
              />
            )}
          </div>
        </div>
      );
    }

    // Disconnected state
    return (
      <div className="flex flex-col gap-1 items-end shrink-0">
        <div className="flex gap-1 items-end">
          {onReconnect && (
            <Button
              prominence="secondary"
              onClick={onReconnect}
              rightIcon={SvgPlug}
              aria-label={`Reconnect to ${serverName}`}
            >
              {t("actions.reconnect")}
            </Button>
          )}
          {onManage && (
            <Button
              icon={SvgSettings}
              tooltip={t("actions.manageServer")}
              prominence="tertiary"
              onClick={onManage}
              aria-label={`Manage ${serverName} server`}
            />
          )}
        </div>
        {showViewToolsButton && (
          <Button
            disabled
            prominence="tertiary"
            onClick={onToggleTools}
            rightIcon={SvgChevronDown}
            aria-label={`View tools for ${serverName}`}
          >
            {t(toolCount !== 1 ? "actions.viewToolsPlural" : "actions.viewTools", { count: toolCount ?? 0 })}
          </Button>
        )}
      </div>
    );
  }
);
Actions.displayName = "Actions";

export default Actions;
