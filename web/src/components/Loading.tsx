"use client";

import React, { useState, useEffect } from "react";
import "./loading.css";
import { cn } from "@opal/utils";
import { useTranslation } from "@/providers/LanguageProvider";

interface LoadingAnimationProps {
  text?: string;
  size?: "text-sm" | "text-md";
}

export const LoadingAnimation: React.FC<LoadingAnimationProps> = ({
  text,
  size,
}) => {
  const { t } = useTranslation();
  const [dots, setDots] = useState("...");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prevDots) => {
        switch (prevDots) {
          case ".":
            return "..";
          case "..":
            return "...";
          case "...":
            return ".";
          default:
            return "...";
        }
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <span className="loading-animation inline-flex">
      <span className={cn("mx-auto inline-flex", size)}>
        {text === undefined ? t("tools.thinking") : text}
        <span className="dots">{dots}</span>
      </span>
    </span>
  );
};
