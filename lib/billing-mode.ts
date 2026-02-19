import { getRuntimeMode } from "@/lib/runtime-mode";

export function isBillingEnabled() {
  return getRuntimeMode().billingMode === "enabled";
}

