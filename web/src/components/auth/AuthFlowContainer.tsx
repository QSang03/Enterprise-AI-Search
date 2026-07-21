"use client";

import Link from "next/link";
import { SvgOnyxLogo } from "@opal/logos";
import { useTranslation } from "@/providers/LanguageProvider";

export default function AuthFlowContainer({
  children,
  authState,
  footerContent,
}: {
  children: React.ReactNode;
  authState?: "signup" | "login" | "join";
  footerContent?: React.ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="p-4 flex flex-col items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md flex items-start flex-col bg-background-tint-00 rounded-16 shadow-lg shadow-box-02 p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="NKC Logo"
          src="/logo.png"
          className="h-10 w-auto object-contain"
        />
        <div className="w-full mt-3">{children}</div>
      </div>
      {authState === "login" && (
        <div className="text-sm mt-6 text-center w-full text-text-03 mainUiBody mx-auto">
          {footerContent === "sso_need_access" ? (
            t("auth.needAccess")
          ) : (
            footerContent ?? (
              <>
                {t("auth.newToOnyx")}{" "}
                <Link
                  href="/auth/signup"
                  className="text-text-05 mainUiAction underline transition-colors duration-200"
                >
                  {t("auth.createAccount")}
                </Link>
              </>
            )
          )}
        </div>
      )}
      {authState === "signup" && (
        <div className="text-sm mt-6 text-center w-full text-text-03 mainUiBody mx-auto">
          {t("auth.alreadyHaveAccount")}{" "}
          <Link
            href="/auth/login?autoRedirectToSignup=false"
            className="text-text-05 mainUiAction underline transition-colors duration-200"
          >
            {t("auth.signIn")}
          </Link>
        </div>
      )}
    </div>
  );
}
