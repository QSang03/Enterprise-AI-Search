"use client";

import { motion, AnimatePresence } from "motion/react";
import { cn } from "@opal/utils";

import {
  useSession,
  useIsPreProvisioning,
  useIsPreProvisioningReady,
  useIsPreProvisioningFailed,
} from "@/app/craft/hooks/useBuildSessionStore";
import { Text } from "@opal/components";
import { useTranslation } from "@/providers/LanguageProvider";

const STATUS_STYLE = {
  provisioning: { color: "bg-status-warning-05", pulse: true },
  running: { color: "bg-status-success-05", pulse: false },
  idle: { color: "bg-status-warning-05", pulse: false },
  sleeping: { color: "bg-status-info-05", pulse: false },
  restoring: { color: "bg-status-warning-05", pulse: true },
  terminated: { color: "bg-status-error-05", pulse: false },
  failed: { color: "bg-status-error-05", pulse: false },
  ready: { color: "bg-status-success-05", pulse: false },
  loading: { color: "bg-text-03", pulse: true },
} as const;

type Status = keyof typeof STATUS_STYLE;

interface SandboxStatusIndicatorProps {}

function deriveSandboxStatus(
  session: ReturnType<typeof useSession>,
  isPreProvisioning: boolean,
  isReady: boolean,
  isFailed: boolean
): Status {
  if (session?.sandbox) {
    return session.sandbox.status as Status;
  }
  if (session) {
    return "running";
  }
  if (isFailed) {
    return "failed";
  }
  if (isPreProvisioning) {
    return "provisioning";
  }
  if (isReady) {
    return "ready";
  }
  return "loading";
}

export default function SandboxStatusIndicator(
  _props: SandboxStatusIndicatorProps = {}
) {
  const { t } = useTranslation();
  const session = useSession();
  const isPreProvisioning = useIsPreProvisioning();
  const isReady = useIsPreProvisioningReady();
  const isFailed = useIsPreProvisioningFailed();

  const status = deriveSandboxStatus(
    session,
    isPreProvisioning,
    isReady,
    isFailed
  );
  const { color, pulse } = STATUS_STYLE[status];

  const labelKey: Record<Status, string> = {
    provisioning: "craft.sandboxProvisioning",
    running: "craft.sandboxRunning",
    idle: "craft.sandboxIdle",
    sleeping: "craft.sandboxSleeping",
    restoring: "craft.sandboxRestoring",
    terminated: "craft.sandboxTerminated",
    failed: "craft.sandboxFailed",
    ready: "craft.sandboxReady",
    loading: "craft.sandboxLoading",
  };

  return (
    <motion.div layout transition={{ duration: 0.3, ease: "easeInOut" }}>
      <div className="flex items-center gap-2 p-2 overflow-hidden rounded-12 border border-border-01 bg-background-neutral-00">
        <div
          className={cn(
            "w-2 h-2 rounded-full shrink-0",
            color,
            pulse && "animate-pulse"
          )}
        />
        <AnimatePresence mode="wait">
          <motion.span
            key={status}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2 }}
          >
            <Text font="main-ui-body" color="text-05" nowrap>
              {t(labelKey[status])}
            </Text>
          </motion.span>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
