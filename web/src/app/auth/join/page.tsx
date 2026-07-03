import { User } from "@/lib/types";
import {
  getCurrentUserSS,
  getAuthTypeMetadataSS,
  AuthTypeMetadata,
  getAuthUrlSS,
} from "@/lib/userSS";
import { redirect } from "next/navigation";
import EmailPasswordForm from "../login/EmailPasswordForm";
import SignInButton from "@/app/auth/login/SignInButton";
import AuthFlowContainer from "@/components/auth/AuthFlowContainer";
import AuthErrorDisplay from "@/components/auth/AuthErrorDisplay";
import { AuthType } from "@/lib/constants";
import { cookies } from "next/headers";
import en from "@/lib/locales/en.json";
import vi from "@/lib/locales/vi.json";

const dictionaries = { en, vi };

async function getServerTranslation() {
  const cookieStore = await cookies();
  const locale = (cookieStore.get("app_lang")?.value || "vi") as "en" | "vi";
  const dict = dictionaries[locale];

  return (key: string, replacements?: Record<string, string | number>) => {
    const keys = key.split(".");
    let value: any = dict;
    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        let fallbackValue: any = dictionaries.en;
        for (const fk of keys) {
          if (fallbackValue && typeof fallbackValue === "object" && fk in fallbackValue) {
            fallbackValue = fallbackValue[fk];
          } else {
            fallbackValue = null;
            break;
          }
        }
        if (typeof fallbackValue === "string") {
          value = fallbackValue;
        } else {
          return key;
        }
        break;
      }
    }
    if (typeof value !== "string") return key;
    if (replacements) {
      return Object.entries(replacements).reduce((acc, [k, v]) => {
        return acc.replaceAll(`{${k}}`, String(v));
      }, value);
    }
    return value;
  };
}

const Page = async (props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) => {
  const t = await getServerTranslation();
  const searchParams = await props.searchParams;
  const nextUrl = Array.isArray(searchParams?.next)
    ? searchParams?.next[0]
    : searchParams?.next || null;

  const defaultEmail = Array.isArray(searchParams?.email)
    ? searchParams?.email[0]
    : searchParams?.email || null;

  const teamName = Array.isArray(searchParams?.team)
    ? searchParams?.team[0]
    : searchParams?.team || "your team";

  // catch cases where the backend is completely unreachable here
  // without try / catch, will just raise an exception and the page
  // will not render
  let authTypeMetadata: AuthTypeMetadata | null = null;
  let currentUser: User | null = null;
  try {
    [authTypeMetadata, currentUser] = await Promise.all([
      getAuthTypeMetadataSS(),
      getCurrentUserSS(),
    ]);
  } catch (e) {
    console.log(`Some fetch failed for the login page - ${e}`);
  }

  // if user is already logged in, take them to the main app page
  if (currentUser && currentUser.is_active && !currentUser.is_anonymous_user) {
    if (!authTypeMetadata?.requiresVerification || currentUser.is_verified) {
      return redirect("/app");
    }
    return redirect("/auth/waiting-on-verification");
  }
  const cloud = authTypeMetadata?.authType === AuthType.CLOUD;

  // only enable this page if basic login is enabled
  if (authTypeMetadata?.authType !== AuthType.BASIC && !cloud) {
    return redirect("/app");
  }

  let authUrl: string | null = null;
  if (cloud && authTypeMetadata) {
    authUrl = await getAuthUrlSS(authTypeMetadata.authType, null);
  }
  const emailDomain = defaultEmail?.split("@")[1];

  return (
    <AuthFlowContainer authState="join">
      <AuthErrorDisplay searchParams={searchParams} />

      <>
        <div className="absolute top-10x w-full"></div>
        <div className="flex w-full flex-col justify-center">
          <h2 className="text-center text-xl text-strong font-bold">
            {t("auth.reauthenticateJoinTeam")}
          </h2>

          {cloud && authUrl && (
            <div className="w-full justify-center">
              <SignInButton authorizeUrl={authUrl} authType={AuthType.CLOUD} />
              <div className="flex items-center w-full my-4">
                <div className="grow border-t border-background-300"></div>
                <span className="px-4 text-text-500">{t("auth.or")}</span>
                <div className="grow border-t border-background-300"></div>
              </div>
            </div>
          )}

          <EmailPasswordForm
            isSignup
            isJoin
            shouldVerify={authTypeMetadata?.requiresVerification}
            nextUrl={nextUrl}
            defaultEmail={defaultEmail}
          />
        </div>
      </>
    </AuthFlowContainer>
  );
};

export default Page;
