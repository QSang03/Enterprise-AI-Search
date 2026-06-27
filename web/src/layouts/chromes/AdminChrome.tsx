"use client";

import AdminSidebar from "@/sections/sidebar/AdminSidebar";
import { usePathname } from "next/navigation";
import { useSettings } from "@/lib/settings/hooks";
import { ApplicationStatus } from "@/lib/settings/types";
import { Button, Text } from "@opal/components";
import { markdown } from "@opal/utils";
import useScreenSize from "@/hooks/useScreenSize";
import { SvgSidebar, SvgSimpleLoader } from "@opal/icons";
import { RootLayout, useSidebarState } from "@opal/layouts";
import { Section } from "@/layouts/general-layouts";
import { isVectorDbRequiredRoute } from "@/lib/admin-routes";
import LiteModeIndexingNotice from "@/sections/admin/LiteModeIndexingNotice";

export interface AdminChromeProps {
  children: React.ReactNode;
}

export default function AdminChrome({ children }: AdminChromeProps) {
  const { setFolded } = useSidebarState();
  const { isMobile } = useScreenSize();
  const pathname = usePathname();
  const settings = useSettings();

  // Certain admin panels have their own custom sidebar.
  // For those pages, we skip rendering the default `AdminSidebar` and let those individual pages render their own.
  const hasCustomSidebar = pathname.startsWith("/admin/connectors");

  // Lite mode (no vector DB): connector/indexing pages can't run, show a notice.
  const vectorDbEnabled = settings.vector_db_enabled !== false;
  let content = children;
  if (isVectorDbRequiredRoute(pathname)) {
    if (settings.isLoading) {
      content = (
        <Section padding={2}>
          <SvgSimpleLoader className="h-6 w-6" />
        </Section>
      );
    } else if (!vectorDbEnabled) {
      content = <LiteModeIndexingNotice />;
    }
  }

  return (
    <RootLayout.Root>
      {!hasCustomSidebar && <AdminSidebar />}

      <RootLayout.App data-main-container>
        {isMobile && !hasCustomSidebar && (
          <RootLayout.Header>
            <div className="h-full flex items-center px-4 py-2">
              <Button
                prominence="internal"
                icon={SvgSidebar}
                onClick={() => setFolded(false)}
              />
            </div>
          </RootLayout.Header>
        )}
        <RootLayout.MainContent>{content}</RootLayout.MainContent>
      </RootLayout.App>
    </RootLayout.Root>
  );
}
