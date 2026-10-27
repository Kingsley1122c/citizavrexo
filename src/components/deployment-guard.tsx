"use client";

import { useEffect } from "react";

const missingAction = (reason: unknown) => reason instanceof Error && (reason.name === "UnrecognizedActionError" || reason.message.includes("Failed to find Server Action") || reason.message.includes("was not found on the server"));

export function DeploymentGuard({ deploymentId }: { deploymentId: string }) {
  useEffect(() => {
    let checking = false;
    const checkDeployment = async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch("/api/deployment", { cache: "no-store" });
        const current = await response.json() as { deploymentId?: string };
        if (current.deploymentId && current.deploymentId !== deploymentId) location.reload();
      } catch {
        // Keep the current page usable during transient network failures.
      } finally {
        checking = false;
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void checkDeployment(); };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => { if (missingAction(event.reason)) location.reload(); };
    const interval = setInterval(() => void checkDeployment(), 30_000);
    window.addEventListener("focus", checkDeployment);
    window.addEventListener("pageshow", checkDeployment);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    document.addEventListener("visibilitychange", onVisible);
    void checkDeployment();
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", checkDeployment);
      window.removeEventListener("pageshow", checkDeployment);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [deploymentId]);

  return null;
}