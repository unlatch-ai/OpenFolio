export type DeploymentMode = "hosted" | "self-hosted";
export type AuthMode = "supabase" | "none";
export type BillingMode = "enabled" | "disabled";

export interface RuntimeMode {
  deploymentMode: DeploymentMode;
  authMode: AuthMode;
  billingMode: BillingMode;
}

function parseDeploymentMode(value: string | undefined): DeploymentMode {
  return value === "hosted" ? "hosted" : "self-hosted";
}

function parseAuthMode(value: string | undefined, deploymentMode: DeploymentMode): AuthMode {
  if (value === "supabase") return "supabase";
  if (value === "none") return "none";
  return deploymentMode === "self-hosted" ? "none" : "supabase";
}

function parseBillingMode(value: string | undefined, deploymentMode: DeploymentMode): BillingMode {
  if (value === "enabled") return "enabled";
  if (value === "disabled") return "disabled";
  return deploymentMode === "self-hosted" ? "disabled" : "enabled";
}

export function getRuntimeMode(): RuntimeMode {
  const deploymentRaw =
    process.env.OPENFOLIO_DEPLOYMENT_MODE ||
    process.env.OPENFOLIO_MODE ||
    process.env.NEXT_PUBLIC_OPENFOLIO_DEPLOYMENT_MODE ||
    process.env.NEXT_PUBLIC_OPENFOLIO_MODE;

  const deploymentMode = parseDeploymentMode(deploymentRaw);
  const authMode = parseAuthMode(process.env.OPENFOLIO_AUTH_MODE, deploymentMode);
  const billingMode = parseBillingMode(process.env.OPENFOLIO_BILLING_MODE, deploymentMode);

  return {
    deploymentMode,
    authMode,
    billingMode,
  };
}

export function getClientRuntimeMode(): RuntimeMode {
  const deploymentRaw =
    process.env.NEXT_PUBLIC_OPENFOLIO_DEPLOYMENT_MODE ||
    process.env.NEXT_PUBLIC_OPENFOLIO_MODE;
  const deploymentMode = parseDeploymentMode(deploymentRaw);
  const authMode = parseAuthMode(process.env.NEXT_PUBLIC_OPENFOLIO_AUTH_MODE, deploymentMode);
  const billingMode = parseBillingMode(
    process.env.NEXT_PUBLIC_OPENFOLIO_BILLING_MODE,
    deploymentMode
  );

  return {
    deploymentMode,
    authMode,
    billingMode,
  };
}

export function isNoAuthMode() {
  return getRuntimeMode().authMode === "none";
}

