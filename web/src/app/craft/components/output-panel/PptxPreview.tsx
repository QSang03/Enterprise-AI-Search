"use client";

import { useState, useEffect, useCallback } from "react";
import useSWR from "swr";
import { SWR_KEYS } from "@/lib/swr-keys";
import { cn } from "@opal/utils";
import { Text } from "@opal/components";
import { SvgChevronLeft, SvgChevronRight, SvgFileText } from "@opal/icons";
import { Section } from "@/layouts/general-layouts";
import { fetchPptxPreview } from "@/app/craft/services/apiServices";
import { getArtifactUrl } from "@/lib/build/client";
import { useTranslation } from "@/providers/LanguageProvider";

interface PptxPreviewProps {
  sessionId: string;
  filePath: string;
  refreshKey?: number;
}

/**
 * PptxPreview - Displays PPTX files as navigable slide images.
 * Triggers on-demand conversion via the backend, then renders
 * individual slide JPEGs in a carousel with keyboard navigation.
 */
export default function PptxPreview({
  sessionId,
  filePath,
  refreshKey,
}: PptxPreviewProps) {
  const { t } = useTranslation();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [imageLoading, setImageLoading] = useState(true);

  const { data, error, isLoading, mutate } = useSWR(
    SWR_KEYS.buildSessionPptxPreview(sessionId, filePath),
    () => fetchPptxPreview(sessionId, filePath),
    {
      revalidateOnFocus: false,
      dedupingInterval: 10000,
    }
  );

  const slideCount = data?.slide_count ?? 0;

  const goToPrev = useCallback(() => {
    setCurrentSlide((prev) => Math.max(0, prev - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentSlide((prev) => Math.min(slideCount - 1, prev + 1));
  }, [slideCount]);

  // Reset slide index when file changes
  useEffect(() => {
    setCurrentSlide(0);
  }, [filePath]);

  // Reset image loading state when slide changes
  useEffect(() => {
    setImageLoading(true);
  }, [currentSlide, data]);

  // Re-fetch when refreshKey changes
  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      mutate();
    }
  }, [refreshKey, mutate]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        goToPrev();
      } else if (e.key === "ArrowRight") {
        goToNext();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goToPrev, goToNext]);

  if (isLoading) {
    return (
      <Section
        height="full"
        alignItems="center"
        justifyContent="center"
        padding={2}
      >
        <Text font="secondary-body" color="text-03">
          {t("craft.convertingPresentation")}
        </Text>
      </Section>
    );
  }

  if (error) {
    return (
      <Section
        height="full"
        alignItems="center"
        justifyContent="center"
        padding={2}
      >
        <SvgFileText size={48} className="stroke-text-02" />
        <Text font="heading-h3" color="text-03">
          {t("craft.cannotPreviewPresentation")}
        </Text>
        <div className="text-center max-w-md">
          <Text font="secondary-body" color="text-02">
            {error.message}
          </Text>
        </div>
      </Section>
    );
  }

  if (!data || slideCount === 0) {
    return (
      <Section
        height="full"
        alignItems="center"
        justifyContent="center"
        padding={2}
      >
        <SvgFileText size={48} className="stroke-text-02" />
        <Text font="secondary-body" color="text-03">
          {t("craft.noSlidesInPresentation")}
        </Text>
      </Section>
    );
  }

  const slidePath = data.slide_paths[currentSlide] ?? "";
  const slideUrl = getArtifactUrl(sessionId, slidePath);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Slide image */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        {imageLoading && (
          <div className="absolute">
            <Text font="secondary-body" color="text-03">
              {t("craft.loadingSlide")}
            </Text>
          </div>
        )}
        <img
          src={slideUrl}
          alt={t("craft.slideOf", { current: currentSlide + 1, total: slideCount })}
          className={cn(
            "max-w-full max-h-full object-contain transition-opacity",
            imageLoading ? "opacity-0" : "opacity-100"
          )}
          onLoad={() => setImageLoading(false)}
          onError={() => setImageLoading(false)}
        />
      </div>

      {/* Navigation bar */}
      {slideCount > 1 && (
        <div className="flex items-center justify-center gap-3 p-2 border-t border-border-02">
          <button
            onClick={goToPrev}
            disabled={currentSlide === 0}
            className={cn(
              "p-1 rounded-sm",
              currentSlide === 0
                ? "opacity-30 cursor-not-allowed"
                : "hover:bg-background-neutral-03 cursor-pointer"
            )}
          >
            <SvgChevronLeft size={16} className="stroke-text-02" />
          </button>
          <Text font="secondary-body" color="text-03">
            {t("craft.slideOf", { current: currentSlide + 1, total: slideCount })}
          </Text>
          <button
            onClick={goToNext}
            disabled={currentSlide === slideCount - 1}
            className={cn(
              "p-1 rounded-sm",
              currentSlide === slideCount - 1
                ? "opacity-30 cursor-not-allowed"
                : "hover:bg-background-neutral-03 cursor-pointer"
            )}
          >
            <SvgChevronRight size={16} className="stroke-text-02" />
          </button>
        </div>
      )}
    </div>
  );
}
