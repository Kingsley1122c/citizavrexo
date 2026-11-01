export function isRecoveryCodePepperConfigured(environment: Partial<NodeJS.ProcessEnv> = process.env): boolean {
  return typeof environment.RECOVERY_CODE_PEPPER === "string" && environment.RECOVERY_CODE_PEPPER.length >= 32;
}

export function requireRecoveryCodePepper(environment: Partial<NodeJS.ProcessEnv> = process.env): string {
  if (!isRecoveryCodePepperConfigured(environment)) throw new Error("RECOVERY_CODE_PEPPER must contain at least 32 characters.");
  return environment.RECOVERY_CODE_PEPPER!;
}