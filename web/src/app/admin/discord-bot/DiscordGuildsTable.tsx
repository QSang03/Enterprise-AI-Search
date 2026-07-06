"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DeleteButton } from "@/components/DeleteButton";
import { Button } from "@opal/components";
import { Switch } from "@opal/components";
import { SvgEdit, SvgServer } from "@opal/icons";
import { EmptyMessageCard } from "@opal/components";
import { DiscordGuildConfig } from "@/app/admin/discord-bot/types";
import {
  deleteGuildConfig,
  updateGuildConfig,
} from "@/app/admin/discord-bot/lib";
import { toast } from "@/hooks/useToast";
import { ConfirmEntityModal } from "@/sections/modals/ConfirmEntityModal";
import { useTranslation } from "@/providers/LanguageProvider";

interface Props {
  guilds: DiscordGuildConfig[];
  onRefresh: () => void;
}

export function DiscordGuildsTable({ guilds, onRefresh }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [guildToDelete, setGuildToDelete] = useState<DiscordGuildConfig | null>(
    null
  );
  const [updatingGuildIds, setUpdatingGuildIds] = useState<Set<number>>(
    new Set()
  );

  const handleDelete = async (guildId: number) => {
    try {
      await deleteGuildConfig(guildId);
      onRefresh();
      toast.success(t("discordBots.toastDeleteSuccess"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("discordBots.toastDeleteFailed")
      );
    } finally {
      setGuildToDelete(null);
    }
  };

  const handleToggleEnabled = async (guild: DiscordGuildConfig) => {
    if (!guild.guild_id) {
      toast.error(t("discordBots.toastMustRegister"));
      return;
    }

    setUpdatingGuildIds((prev) => new Set(prev).add(guild.id));
    try {
      await updateGuildConfig(guild.id, {
        enabled: !guild.enabled,
        default_persona_id: guild.default_persona_id,
      });
      onRefresh();
      toast.success(
        t("discordBots.toastUpdateSuccess", {
          status: !guild.enabled ? t("discordBots.enabledStatus") : t("discordBots.disabledStatus")
        })
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("discordBots.toastUpdateFailed")
      );
    } finally {
      setUpdatingGuildIds((prev) => {
        const next = new Set(prev);
        next.delete(guild.id);
        return next;
      });
    }
  };

  if (guilds.length === 0) {
    return (
      <EmptyMessageCard
        sizePreset="main-ui"
        icon={SvgServer}
        title={t("discordBots.emptyTitle")}
        description={t("discordBots.emptyDesc")}
      />
    );
  }

  return (
    <>
      {guildToDelete && (
        <ConfirmEntityModal
          danger
          entityType={t("discordBots.confirmDeleteTitle")}
          entityName={guildToDelete.guild_name || `Server #${guildToDelete.id}`}
          onClose={() => setGuildToDelete(null)}
          onSubmit={() => handleDelete(guildToDelete.id)}
          additionalDetails={t("discordBots.confirmDeleteDesc")}
        />
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("discordBots.tableHeaderServer")}</TableHead>
            <TableHead>{t("discordBots.tableHeaderStatus")}</TableHead>
            <TableHead>{t("discordBots.tableHeaderRegistered")}</TableHead>
            <TableHead>{t("discordBots.tableHeaderEnabled")}</TableHead>
            <TableHead>{t("discordBots.tableHeaderActions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {guilds.map((guild) => (
            <TableRow key={guild.id}>
              <TableCell>
                <Button
                  disabled={!guild.guild_id}
                  prominence="internal"
                  onClick={() => router.push(`/admin/discord-bot/${guild.id}`)}
                  icon={SvgEdit}
                >
                  {guild.guild_name || `Server #${guild.id}`}
                </Button>
              </TableCell>
              <TableCell>
                {guild.guild_id ? (
                  <Badge variant="success">{t("discordBots.badgeRegistered")}</Badge>
                ) : (
                  <Badge variant="secondary">{t("discordBots.badgePending")}</Badge>
                )}
              </TableCell>
              <TableCell>
                {guild.registered_at
                  ? new Date(guild.registered_at).toLocaleDateString()
                  : "-"}
              </TableCell>
              <TableCell>
                {!guild.guild_id ? (
                  "-"
                ) : (
                  <Switch
                    checked={guild.enabled}
                    onCheckedChange={() => handleToggleEnabled(guild)}
                    disabled={updatingGuildIds.has(guild.id)}
                  />
                )}
              </TableCell>
              <TableCell>
                <DeleteButton onClick={() => setGuildToDelete(guild)} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
