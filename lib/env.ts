const isServer = typeof window === "undefined";

function warnIfServer(message: string) {
  if (isServer) {
    console.warn(`⚠️ ${message}`);
  }
}

export function assertRedisRestEnvPair() {
  const hasUrl = Boolean(process.env.REDIS_REST_URL);
  const hasToken = Boolean(process.env.REDIS_REST_TOKEN);

  if (hasUrl === hasToken) return;

  const msg = "REDIS_REST_URL and REDIS_REST_TOKEN must be provided together.";
  if (process.env.NODE_ENV === "production") {
    throw new Error(msg);
  }
  warnIfServer(msg + " Falling back to in-memory security store.");
}

export function assertAdminPasswordEnv() {
  const hasHash = Boolean(process.env.ADMIN_PASSWORD_HASH);
  const hasPlain = Boolean(process.env.ADMIN_PASSWORD);

  if (process.env.NODE_ENV === "production" && !hasHash) {
    throw new Error("ADMIN_PASSWORD_HASH is required in production");
  }

  if (process.env.NODE_ENV !== "production" && !hasHash && !hasPlain) {
    warnIfServer("ADMIN_PASSWORD_HASH/ADMIN_PASSWORD is not set.");
  }
}
