"use client";

import Modal from "@/refresh-components/Modal";
import { Button } from "@opal/components";
import Text from "@/refresh-components/texts/Text";
import { useUser } from "@/providers/UserProvider";
import { SvgUser } from "@opal/icons";
import { useTranslation } from "@/providers/LanguageProvider";

export default function NoAgentModal() {
  const { isAdmin } = useUser();
  const { t } = useTranslation();

  return (
    <Modal open>
      <Modal.Content width="sm" height="sm">
        <Modal.Header icon={SvgUser} title={t("modals.noAgentAvailable")} />
        <Modal.Body>
          <Text as="p">
            {t("modals.noAgentConfiguredDesc")}
          </Text>
          {isAdmin ? (
            <>
              <Text as="p">
                {t("modals.adminNoAgentDesc")}
              </Text>
              <Button width="full" href="/admin/agents">
                {t("common.adminPanel")}
              </Button>
            </>
          ) : (
            <Text as="p">
              {t("modals.contactAdminNoAgentDesc")}
            </Text>
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal>
  );
}
