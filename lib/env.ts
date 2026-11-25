import { z } from "zod";

const HEX_32_BYTE = /^[a-f0-9]{64}$/i;

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}

export function requireEnv(name: string): string {
  return readEnv(name);
}

export function getBaseUrl(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}

export function getEncryptionKeyHex(): string {
  const value = readEnv("ENCRYPTION_KEY");
  if (!HEX_32_BYTE.test(value)) {
    throw new Error("ENCRYPTION_KEY must be a 32-byte hex string");
  }
  return value;
}

/**
 * Which Meta login the app uses to connect Instagram accounts. Instagram Login
 * (the default) needs INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET. Meta no longer
 * offers Instagram Login setup on newly created apps, only Facebook Login for
 * Business ("Unified login"); setting FACEBOOK_LOGIN_CONFIG_ID switches to it.
 */
export function isFacebookLoginMode(): boolean {
  return Boolean(process.env.FACEBOOK_LOGIN_CONFIG_ID);
}

// Env vars that must be present before an Instagram OAuth round trip can even
// start. Checked up front so a self-hoster with a half-filled .env gets the
// variable names back instead of an unhandled throw from requireEnv().
const INSTAGRAM_OAUTH_ENV = [
  "INSTAGRAM_APP_ID",
  "INSTAGRAM_APP_SECRET",
  "ENCRYPTION_KEY",
  "NEXTAUTH_SECRET",
] as const;

const FACEBOOK_OAUTH_ENV = [
  "FACEBOOK_APP_ID",
  "FACEBOOK_APP_SECRET",
  "FACEBOOK_LOGIN_CONFIG_ID",
  "ENCRYPTION_KEY",
  "NEXTAUTH_SECRET",
] as const;

export function getMissingInstagramOAuthEnv(): string[] {
  const required: readonly string[] = isFacebookLoginMode()
    ? FACEBOOK_OAUTH_ENV
    : INSTAGRAM_OAUTH_ENV;
  return required.filter((name) => {
    const value = process.env[name];
    if (!value) return true;
    // A malformed key fails later inside encryptToken, after the user has
    // already round-tripped through Meta — catch the bad format here instead.
    return name === "ENCRYPTION_KEY" && !HEX_32_BYTE.test(value);
  });
}

export function getMetaGraphApiVersion(): string {
  return process.env.META_GRAPH_API_VERSION ?? "v25.0";
}

export const serverEnvSchema = z.object({
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(16),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  ENCRYPTION_KEY: z.string().regex(HEX_32_BYTE),
  // Instagram Login needs the INSTAGRAM_* pair; Facebook Login needs
  // FACEBOOK_APP_ID and FACEBOOK_LOGIN_CONFIG_ID. FACEBOOK_APP_SECRET is
  // required either way, since it verifies webhook signatures.
  INSTAGRAM_APP_ID: z.string().min(1).optional(),
  INSTAGRAM_APP_SECRET: z.string().min(1).optional(),
  FACEBOOK_APP_ID: z.string().min(1).optional(),
  FACEBOOK_LOGIN_CONFIG_ID: z.string().min(1).optional(),
  FACEBOOK_APP_SECRET: z.string().min(1),
  WEBHOOK_VERIFY_TOKEN: z.string().min(1),
});

export function validateCoreEnv() {
  return serverEnvSchema.parse(process.env);
}
