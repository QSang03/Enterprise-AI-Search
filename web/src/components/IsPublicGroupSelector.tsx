"use client";

import { useTierAtLeast } from "@/hooks/useTierAtLeast";
import { Tier } from "@/lib/settings/types";
import React, { useState, useEffect } from "react";
import { FormikProps } from "formik";
import { UserRole } from "@/lib/types";
import { useUserGroups } from "@/lib/hooks";
import { BooleanFormField } from "@/components/Field";
import { useUser } from "@/providers/UserProvider";
import { GroupsMultiSelect } from "./GroupsMultiSelect";
import { useTranslation } from "@/providers/LanguageProvider";

export type IsPublicGroupSelectorFormType = {
  is_public: boolean;
  groups: number[];
};

// This should be included for all forms that require groups / public access
// to be set, and access to this / permissioning should be handled within this component itself.
export const IsPublicGroupSelector = <T extends IsPublicGroupSelectorFormType>({
  formikProps,
  objectName,
  publicToWhom = "Users",
  removeIndent = false,
  enforceGroupSelection = true,
  smallLabels = false,
}: {
  formikProps: FormikProps<T>;
  objectName: string;
  publicToWhom?: string;
  removeIndent?: boolean;
  enforceGroupSelection?: boolean;
  smallLabels?: boolean;
}) => {
  const { t } = useTranslation();
  const { data: userGroups, isLoading: userGroupsIsLoading } = useUserGroups();
  const { isAdmin, user, isCurator } = useUser();
  const businessTier = useTierAtLeast(Tier.BUSINESS);
  const [shouldHideContent, setShouldHideContent] = useState(false);

  useEffect(() => {
    if (user && userGroups && businessTier) {
      const isUserAdmin = user.role === UserRole.ADMIN;
      if (!isUserAdmin && userGroups.length > 0) {
        formikProps.setFieldValue("is_public", false);
      }
      if (
        userGroups.length === 1 &&
        userGroups[0] !== undefined &&
        !isUserAdmin
      ) {
        formikProps.setFieldValue("groups", [userGroups[0].id]);
        setShouldHideContent(true);
      } else if (formikProps.values.is_public) {
        formikProps.setFieldValue("groups", []);
        setShouldHideContent(false);
      } else {
        setShouldHideContent(false);
      }
    }
  }, [user, userGroups, businessTier]);

  if (userGroupsIsLoading) {
    return <div>{t("isPublicGroupSelector.loading")}</div>;
  }
  if (!businessTier) {
    return null;
  }

  let firstUserGroupName = t("isPublicGroupSelector.unknownGroup");
  if (userGroups) {
    const userGroup = userGroups[0];
    if (userGroup) {
      firstUserGroupName = userGroup.name;
    }
  }

  if (shouldHideContent && enforceGroupSelection) {
    return (
      <>
        {userGroups && (
          <div className="mb-1 font-medium text-base">
            {t("isPublicGroupSelector.assignedToGroup", {
              objectName,
              groupName: firstUserGroupName,
            })}
          </div>
        )}
      </>
    );
  }

  return (
    <div>
      {isAdmin && (
        <>
          <BooleanFormField
            name="is_public"
            removeIndent={removeIndent}
            small={smallLabels}
            label={
              publicToWhom === "Curators"
                ? t("isPublicGroupSelector.makeCuratorAccessible", {
                    objectName,
                  })
                : t("isPublicGroupSelector.makePublic", { objectName })
            }
            disabled={!isAdmin}
            subtext={
              <span className="block mt-2 text-sm text-text-600 dark:text-neutral-400">
                {t("isPublicGroupSelector.publicSubtext", {
                  objectName,
                  publicToWhom,
                })}
              </span>
            }
          />
        </>
      )}

      <GroupsMultiSelect
        formikProps={formikProps}
        label={t("isPublicGroupSelector.assignGroupAccess", { objectName })}
        subtext={
          isAdmin || !enforceGroupSelection
            ? t("isPublicGroupSelector.adminGroupSubtext", { objectName })
            : t("isPublicGroupSelector.curatorGroupSubtext", { objectName })
        }
        disabled={formikProps.values.is_public && !isCurator}
        disabledMessage={t("isPublicGroupSelector.publicDisabledMessage", {
          objectName,
        })}
      />
    </div>
  );
};
