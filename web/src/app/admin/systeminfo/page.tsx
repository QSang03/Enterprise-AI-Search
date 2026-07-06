import { getWebVersion, getBackendVersion } from "@/lib/version";
import SystemInfoClient from "./SystemInfoClient";

const Page = async () => {
  let web_version: string | null = null;
  let backend_version: string | null = null;
  try {
    [web_version, backend_version] = await Promise.all([
      getWebVersion(),
      getBackendVersion(),
    ]);
  } catch (e) {
    console.log(`Version info fetch failed for system info page - ${e}`);
  }

  return (
    <SystemInfoClient
      webVersion={web_version}
      backendVersion={backend_version}
    />
  );
};

export default Page;
