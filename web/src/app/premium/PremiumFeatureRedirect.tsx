"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/useToast";

export default function PremiumFeatureRedirect() {
  const router = useRouter();

  useEffect(() => {
    toast.error(
      "This feature requires a premium license. Please apply a valid license key to access."
    );
    router.replace("/app");
  }, [router]);

  return null;
}
