"use client";

import SimpleTabs from "@/refresh-components/SimpleTabs";
import { SettingsLayouts } from "@opal/layouts";
import { Button, Text } from "@opal/components";
import { useState } from "react";
import {
  insertGlobalTokenRateLimit,
  insertGroupTokenRateLimit,
  insertUserTokenRateLimit,
} from "./lib";
import { Scope, TokenRateLimit } from "./types";
import { GenericTokenRateLimitTable } from "./TokenRateLimitTables";
import { mutate } from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { toast } from "@/hooks/useToast";
import { useTranslation } from "@/providers/LanguageProvider";
import CreateRateLimitModal from "./CreateRateLimitModal";
import { useTierAtLeast } from "@/hooks/useTierAtLeast";
import { Tier } from "@/lib/settings/types";
import { SvgGlobe, SvgPlusCircle, SvgUser, SvgUsers } from "@opal/icons";
import { Section } from "@/layouts/general-layouts";
import { ADMIN_ROUTES } from "@/lib/admin-routes";

const route = ADMIN_ROUTES.TOKEN_RATE_LIMITS;
const GLOBAL_TOKEN_FETCH_URL = SWR_KEYS.globalTokenRateLimits;
const USER_TOKEN_FETCH_URL = SWR_KEYS.userTokenRateLimits;
const USER_GROUP_FETCH_URL = SWR_KEYS.userGroupTokenRateLimits;

// Descriptions are localized dynamically in the component

const handleCreateTokenRateLimit = async (
  target_scope: Scope,
  period_hours: number,
  token_budget: number,
  group_id: number = -1
) => {
  const tokenRateLimitArgs = {
    enabled: true,
    token_budget: token_budget,
    period_hours: period_hours,
  };

  if (target_scope === Scope.GLOBAL) {
    return await insertGlobalTokenRateLimit(tokenRateLimitArgs);
  } else if (target_scope === Scope.USER) {
    return await insertUserTokenRateLimit(tokenRateLimitArgs);
  } else if (target_scope === Scope.USER_GROUP) {
    return await insertGroupTokenRateLimit(tokenRateLimitArgs, group_id);
  } else {
    throw new Error(`Invalid target_scope: ${target_scope}`);
  }
};

function Main() {
  const { t } = useTranslation();
  const [tabIndex, setTabIndex] = useState(0);
  const [modalIsOpen, setModalIsOpen] = useState(false);

  const enterpriseTier = true;

  const updateTable = (target_scope: Scope) => {
    if (target_scope === Scope.GLOBAL) {
      mutate(GLOBAL_TOKEN_FETCH_URL);
      setTabIndex(0);
    } else if (target_scope === Scope.USER) {
      mutate(USER_TOKEN_FETCH_URL);
      setTabIndex(1);
    } else if (target_scope === Scope.USER_GROUP) {
      mutate(USER_GROUP_FETCH_URL);
      setTabIndex(2);
    }
  };

  const handleSubmit = (
    target_scope: Scope,
    period_hours: number,
    token_budget: number,
    group_id: number = -1
  ) => {
    handleCreateTokenRateLimit(
      target_scope,
      period_hours,
      token_budget,
      group_id
    )
      .then(() => {
        setModalIsOpen(false);
        toast.success(t("tokenRateLimits.toastLimitCreated"));
        updateTable(target_scope);
      })
      .catch((error) => {
        toast.error(error.message);
      });
  };

  return (
    <Section alignItems="stretch" justifyContent="start" height="auto">
      <Text as="p">
        {t("rateLimits.pageIntro")}
      </Text>

      <ul className="list-disc ml-4">
        <li>
          <Text as="p">
            {t("rateLimits.introGlobalLimit")}
          </Text>
        </li>
        {enterpriseTier && (
          <>
            <li>
              <Text as="p">
                {t("rateLimits.introUserLimit")}
              </Text>
            </li>
            <li>
              <Text as="p">
                {t("rateLimits.introUserGroupLimit")}
              </Text>
            </li>
          </>
        )}
        <li>
          <Text as="p">{t("rateLimits.pageDesc")}</Text>
        </li>
      </ul>

      <Button
        icon={SvgPlusCircle}
        prominence="secondary"
        onClick={() => setModalIsOpen(true)}
      >
        {t("rateLimits.createRateLimitTitle")}
      </Button>

      {enterpriseTier ? (
        <SimpleTabs
          tabs={{
            "0": {
              name: t("rateLimits.globalTab"),
              icon: SvgGlobe,
              content: (
                <GenericTokenRateLimitTable
                  fetchUrl={GLOBAL_TOKEN_FETCH_URL}
                  title={t("rateLimits.globalTitle")}
                  description={t("rateLimits.globalDesc")}
                />
              ),
            },
            "1": {
              name: t("rateLimits.userTab"),
              icon: SvgUser,
              content: (
                <GenericTokenRateLimitTable
                  fetchUrl={USER_TOKEN_FETCH_URL}
                  title={t("rateLimits.userTitle")}
                  description={t("rateLimits.userDesc")}
                />
              ),
            },
            "2": {
              name: t("rateLimits.userGroupsTab"),
              icon: SvgUsers,
              content: (
                <GenericTokenRateLimitTable
                  fetchUrl={USER_GROUP_FETCH_URL}
                  title={t("rateLimits.userGroupTitle")}
                  description={t("rateLimits.userGroupDesc")}
                  responseMapper={(data: Record<string, TokenRateLimit[]>) =>
                    Object.entries(data).flatMap(([group_name, elements]) =>
                      elements.map((element) => ({
                        ...element,
                        group_name,
                      }))
                    )
                  }
                />
              ),
            },
          }}
          value={tabIndex.toString()}
          onValueChange={(val) => setTabIndex(parseInt(val))}
        />
      ) : (
        <GenericTokenRateLimitTable
          fetchUrl={GLOBAL_TOKEN_FETCH_URL}
          title={t("rateLimits.globalTitle")}
          description={t("rateLimits.globalDesc")}
        />
      )}

      <CreateRateLimitModal
        isOpen={modalIsOpen}
        setIsOpen={() => setModalIsOpen(false)}
        onSubmit={handleSubmit}
        forSpecificScope={enterpriseTier ? undefined : Scope.GLOBAL}
      />
    </Section>
  );
}

export default function Page() {
  return (
    <SettingsLayouts.Root>
      <SettingsLayouts.Header title={route.title} icon={route.icon} divider />
      <SettingsLayouts.Body>
        <Main />
      </SettingsLayouts.Body>
    </SettingsLayouts.Root>
  );
}
