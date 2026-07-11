"use client";

import { ValidSources } from "@/lib/types";
import { SourceIcon } from "./SourceIcon";
import { useState } from "react";
import { SvgOnyxLogo, SvgGithub } from "@opal/logos";

export function WebResultIcon({
  url,
  size = 18,
}: {
  url: string;
  size?: number;
}) {
  const [error, setError] = useState(false);

  // Non-HTTP(S) protocols (smb://, file://, etc.) can't have favicons
  const isNonHttpProtocol =
    url.startsWith("smb:") || url.startsWith("file:");

  let hostname;
  if (!isNonHttpProtocol) {
    try {
      hostname = new URL(url).hostname;
    } catch (e) {
      hostname = "onyx.app";
    }
  }

  if (isNonHttpProtocol) {
    return <SourceIcon sourceType={ValidSources.Smb} iconSize={size} />;
  }

  return (
    <>
      {(hostname === "onyx.app" || hostname?.includes("onyx.app")) ? (
        <SvgOnyxLogo size={size} className="dark:text-white text-black" />
      ) : hostname === "github.com" || hostname?.endsWith(".github.com") ? (
        <SvgGithub size={size} />
      ) : !error ? (
        <img
          className="my-0 rounded-full py-0"
          src={`https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${hostname}&size=128`}
          alt="favicon"
          height={size}
          onError={() => setError(true)}
          width={size}
          style={{
            height: `${size}px`,
            width: `${size}px`,
            background: "transparent",
          }}
        />
      ) : (
        <SourceIcon sourceType={ValidSources.Web} iconSize={size} />
      )}
    </>
  );
}
