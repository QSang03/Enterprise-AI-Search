"use client";

import { ValidStatuses } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@opal/time";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClock,
  FiMinus,
  FiPauseCircle,
} from "react-icons/fi";
import {
  ConnectorCredentialPairStatus,
  PermissionSyncStatusEnum,
} from "@/app/admin/connector/[ccPairId]/types";
import { Tooltip } from "@opal/components";
import { useTranslation } from "@/providers/LanguageProvider";

export function IndexAttemptStatus({
  status,
  errorMsg,
}: {
  status: ValidStatuses | null;
  errorMsg?: string | null;
}) {
  const { t } = useTranslation();
  let badge;

  if (status === "failed") {
    const icon = (
      <Badge variant="destructive" icon={FiAlertTriangle}>
        {t("statusBadges.failed")}
      </Badge>
    );
    if (errorMsg) {
      badge = (
        <Tooltip tooltip={errorMsg}>
          <div className="cursor-pointer">{icon}</div>
        </Tooltip>
      );
    } else {
      badge = icon;
    }
  } else if (status === "completed_with_errors") {
    badge = (
      <Badge variant="secondary" icon={FiAlertTriangle}>
        {t("statusBadges.completedWithErrors")}
      </Badge>
    );
  } else if (status === "success") {
    badge = (
      <Badge variant="success" icon={FiCheckCircle}>
        {t("statusBadges.succeeded")}
      </Badge>
    );
  } else if (status === "in_progress") {
    badge = (
      <Badge variant="in_progress" icon={FiClock}>
        {t("statusBadges.inProgress")}
      </Badge>
    );
  } else if (status === "not_started") {
    badge = (
      <Badge variant="not_started" icon={FiClock}>
        {t("statusBadges.scheduled")}
      </Badge>
    );
  } else if (status === "canceled") {
    badge = (
      <Badge variant="canceled" icon={FiClock}>
        {t("statusBadges.canceled")}
      </Badge>
    );
  } else if (status === "invalid") {
    badge = (
      <Badge variant="invalid" icon={FiAlertTriangle}>
        {t("statusBadges.invalid")}
      </Badge>
    );
  } else {
    badge = (
      <Badge variant="outline" icon={FiMinus}>
        {t("statusBadges.none")}
      </Badge>
    );
  }

  return <div>{badge}</div>;
}

export function PermissionSyncStatus({
  status,
  errorMsg,
}: {
  status: PermissionSyncStatusEnum | null;
  errorMsg?: string | null;
}) {
  const { t } = useTranslation();
  let badge;

  if (status === PermissionSyncStatusEnum.FAILED) {
    const icon = (
      <Badge variant="destructive" icon={FiAlertTriangle}>
        {t("statusBadges.failed")}
      </Badge>
    );
    if (errorMsg) {
      badge = (
        <Tooltip tooltip={errorMsg} side="bottom">
          <div className="cursor-pointer">{icon}</div>
        </Tooltip>
      );
    } else {
      badge = icon;
    }
  } else if (status === PermissionSyncStatusEnum.COMPLETED_WITH_ERRORS) {
    badge = (
      <Badge variant="secondary" icon={FiAlertTriangle}>
        {t("statusBadges.completedWithErrors")}
      </Badge>
    );
  } else if (status === PermissionSyncStatusEnum.SUCCESS) {
    badge = (
      <Badge variant="success" icon={FiCheckCircle}>
        {t("statusBadges.succeeded")}
      </Badge>
    );
  } else if (status === PermissionSyncStatusEnum.IN_PROGRESS) {
    badge = (
      <Badge variant="in_progress" icon={FiClock}>
        {t("statusBadges.inProgress")}
      </Badge>
    );
  } else if (status === PermissionSyncStatusEnum.NOT_STARTED) {
    badge = (
      <Badge variant="not_started" icon={FiClock}>
        {t("statusBadges.scheduled")}
      </Badge>
    );
  } else {
    badge = (
      <Badge variant="secondary" icon={FiClock}>
        {t("statusBadges.notStarted")}
      </Badge>
    );
  }

  return <div>{badge}</div>;
}

export function CCPairStatus({
  ccPairStatus,
  inRepeatedErrorState,
  lastIndexAttemptStatus,
  size = "md",
}: {
  ccPairStatus: ConnectorCredentialPairStatus;
  inRepeatedErrorState: boolean;
  lastIndexAttemptStatus: ValidStatuses | undefined | null;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const { t } = useTranslation();
  let badge;

  if (ccPairStatus == ConnectorCredentialPairStatus.DELETING) {
    badge = (
      <Badge variant="destructive" icon={FiAlertTriangle}>
        {t("statusBadges.deleting")}
      </Badge>
    );
  } else if (ccPairStatus == ConnectorCredentialPairStatus.PAUSED) {
    badge = (
      <Badge variant="paused" icon={FiPauseCircle}>
        {t("statusBadges.paused")}
      </Badge>
    );
  } else if (inRepeatedErrorState) {
    badge = (
      <Badge variant="destructive" icon={FiAlertTriangle}>
        {t("statusBadges.error")}
      </Badge>
    );
  } else if (ccPairStatus == ConnectorCredentialPairStatus.SCHEDULED) {
    badge = (
      <Badge variant="not_started" icon={FiClock}>
        {t("statusBadges.scheduled")}
      </Badge>
    );
  } else if (ccPairStatus == ConnectorCredentialPairStatus.INITIAL_INDEXING) {
    badge = (
      <Badge variant="in_progress" icon={FiClock}>
        {t("statusBadges.initialIndexing")}
      </Badge>
    );
  } else if (ccPairStatus == ConnectorCredentialPairStatus.INVALID) {
    badge = (
      <Badge
        tooltip={t("statusBadges.invalidConnectorTooltip")}
        circle
        variant="invalid"
      >
        {t("statusBadges.invalid")}
      </Badge>
    );
  } else {
    if (lastIndexAttemptStatus && lastIndexAttemptStatus === "in_progress") {
      badge = (
        <Badge variant="in_progress" icon={FiClock}>
          {t("statusBadges.indexing")}
        </Badge>
      );
    } else if (
      lastIndexAttemptStatus &&
      lastIndexAttemptStatus === "not_started"
    ) {
      badge = (
        <Badge variant="not_started" icon={FiClock}>
          {t("statusBadges.scheduled")}
        </Badge>
      );
    } else if (
      lastIndexAttemptStatus &&
      lastIndexAttemptStatus === "canceled"
    ) {
      badge = (
        <Badge variant="canceled" icon={FiClock}>
          {t("statusBadges.canceled")}
        </Badge>
      );
    } else {
      badge = (
        <Badge variant="success" icon={FiCheckCircle}>
          {t("statusBadges.indexed")}
        </Badge>
      );
    }
  }

  return <div>{badge}</div>;
}
