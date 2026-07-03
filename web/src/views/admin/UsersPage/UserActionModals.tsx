"use client";

import { useState } from "react";
import { Button } from "@opal/components";
import { SvgUserPlus, SvgUserX, SvgXCircle, SvgKey } from "@opal/icons";
import ConfirmationModalLayout from "@/refresh-components/layouts/ConfirmationModalLayout";
import Text from "@/refresh-components/texts/Text";
import { toast } from "@/hooks/useToast";
import {
  deactivateUser,
  activateUser,
  deleteUser,
  cancelInvite,
  resetPassword,
} from "./svc";
import { useTranslation } from "@/providers/LanguageProvider";


// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

async function runAction(
  action: () => Promise<void>,
  successMessage: string,
  onDone: () => void,
  setIsSubmitting: (v: boolean) => void,
  t: any
) {
  setIsSubmitting(true);
  try {
    await action();
    onDone();
    toast.success(successMessage);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : t("common.networkError"));
  } finally {
    setIsSubmitting(false);
  }
}

// ---------------------------------------------------------------------------
// Cancel Invite Modal
// ---------------------------------------------------------------------------

interface CancelInviteModalProps {
  email: string;
  onClose: () => void;
  onMutate: () => void;
}

export function CancelInviteModal({
  email,
  onClose,
  onMutate,
}: CancelInviteModalProps) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <ConfirmationModalLayout
      icon={(props) => (
        <SvgUserX {...props} className="text-action-danger-05" />
      )}
      title={t("admin.users.cancelInvite")}
      onClose={isSubmitting ? undefined : onClose}
      submit={
        <Button
          disabled={isSubmitting}
          variant="danger"
          onClick={() =>
            runAction(
              () => cancelInvite(email),
              t("admin.users.inviteCancelled"),
              () => {
                onMutate();
                onClose();
              },
              setIsSubmitting,
              t
            )
          }
        >
          {t("admin.users.cancelInvite")}
        </Button>
      }
    >
      <Text as="p" text03>
        <Text as="span" text05>
          {email}
        </Text>{" "}
        {t("admin.users.cancelInviteDesc", { email: "" })}
      </Text>
    </ConfirmationModalLayout>
  );
}

// ---------------------------------------------------------------------------
// Deactivate User Modal
// ---------------------------------------------------------------------------

interface DeactivateUserModalProps {
  email: string;
  onClose: () => void;
  onMutate: () => void;
}

export function DeactivateUserModal({
  email,
  onClose,
  onMutate,
}: DeactivateUserModalProps) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <ConfirmationModalLayout
      icon={(props) => (
        <SvgUserX {...props} className="text-action-danger-05" />
      )}
      title={t("admin.users.deactivateUser")}
      onClose={isSubmitting ? undefined : onClose}
      submit={
        <Button
          disabled={isSubmitting}
          variant="danger"
          onClick={() =>
            runAction(
              () => deactivateUser(email),
              t("admin.users.userDeactivated"),
              () => {
                onMutate();
                onClose();
              },
              setIsSubmitting,
              t
            )
          }
        >
          {t("admin.users.deactivate")}
        </Button>
      }
    >
      <Text as="p" text03>
        {t("admin.users.deactivateDesc", { email })}
      </Text>
    </ConfirmationModalLayout>
  );
}

// ---------------------------------------------------------------------------
// Activate User Modal
// ---------------------------------------------------------------------------

interface ActivateUserModalProps {
  email: string;
  onClose: () => void;
  onMutate: () => void;
}

export function ActivateUserModal({
  email,
  onClose,
  onMutate,
}: ActivateUserModalProps) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <ConfirmationModalLayout
      icon={SvgUserPlus}
      title={t("admin.users.activateUser")}
      onClose={isSubmitting ? undefined : onClose}
      submit={
        <Button
          disabled={isSubmitting}
          onClick={() =>
            runAction(
              () => activateUser(email),
              t("admin.users.userActivated"),
              () => {
                onMutate();
                onClose();
              },
              setIsSubmitting,
              t
            )
          }
        >
          {t("admin.users.activate")}
        </Button>
      }
    >
      <Text as="p" text03>
        {t("admin.users.activateDesc", { email })}
      </Text>
    </ConfirmationModalLayout>
  );
}

// ---------------------------------------------------------------------------
// Delete User Modal
// ---------------------------------------------------------------------------

interface DeleteUserModalProps {
  email: string;
  onClose: () => void;
  onMutate: () => void;
}

export function DeleteUserModal({
  email,
  onClose,
  onMutate,
}: DeleteUserModalProps) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <ConfirmationModalLayout
      icon={(props) => (
        <SvgUserX {...props} className="text-action-danger-05" />
      )}
      title={t("admin.users.deleteUser")}
      onClose={isSubmitting ? undefined : onClose}
      submit={
        <Button
          disabled={isSubmitting}
          variant="danger"
          onClick={() =>
            runAction(
              () => deleteUser(email),
              t("admin.users.userDeleted"),
              () => {
                onMutate();
                onClose();
              },
              setIsSubmitting,
              t
            )
          }
        >
          {t("admin.users.delete")}
        </Button>
      }
    >
      <Text as="p" text03>
        {t("admin.users.deleteDesc", { email })}
      </Text>
    </ConfirmationModalLayout>
  );
}

// ---------------------------------------------------------------------------
// Reset Password Modal
// ---------------------------------------------------------------------------

interface ResetPasswordModalProps {
  email: string;
  onClose: () => void;
}

export function ResetPasswordModal({
  email,
  onClose,
}: ResetPasswordModalProps) {
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);

  const handleClose = () => {
    onClose();
    setNewPassword(null);
  };

  return (
    <ConfirmationModalLayout
      icon={SvgKey}
      title={newPassword ? t("admin.users.passwordReset") : t("admin.users.resetPassword")}
      onClose={isSubmitting ? undefined : handleClose}
      submit={
        newPassword ? (
          <Button onClick={handleClose}>{t("admin.users.done")}</Button>
        ) : (
          <Button
            disabled={isSubmitting}
            variant="danger"
            onClick={async () => {
              setIsSubmitting(true);
              try {
                const result = await resetPassword(email);
                setNewPassword(result.new_password);
              } catch (err) {
                toast.error(
                  err instanceof Error
                    ? err.message
                    : t("admin.users.failedResetPassword")
                );
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            {t("admin.users.resetPassword")}
          </Button>
        )
      }
    >
      {newPassword ? (
        <div className="flex flex-col gap-2">
          <Text as="p" text03>
            {t("admin.users.passwordResetSuccessDesc", { email })}
          </Text>
          <code className="rounded-xs bg-background-neutral-02 px-3 py-2 text-sm select-all">
            {newPassword}
          </code>
        </div>
      ) : (
        <Text as="p" text03>
          {t("admin.users.passwordResetWarningDesc", { email })}
        </Text>
      )}
    </ConfirmationModalLayout>
  );
}
