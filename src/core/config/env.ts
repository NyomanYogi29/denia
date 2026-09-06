import type { AppConfig, GoogleServiceAccountKey } from './types.ts';

const getEnvOrThrow = (key: string): string => {
  const value = Bun.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`[Config Error] Missing required environment variable: "${key}"`);
  }
  return value.trim();
};

const getEnvOrDefault = (key: string, defaultValue: string): string => {
  const value = Bun.env[key];
  return value && value.trim() !== '' ? value.trim() : defaultValue;
};

const parseServiceAccountKey = async (): Promise<GoogleServiceAccountKey | null> => {
  const rawKey = Bun.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (rawKey && rawKey.trim() !== '') {
    try {
      return JSON.parse(rawKey) as GoogleServiceAccountKey;
    } catch (error) {
      throw new Error(
        `[Config Error] GOOGLE_SERVICE_ACCOUNT_KEY is not a valid JSON string: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  // Fallback: Check if path is provided and load it using Bun.file native API
  const keyPath = Bun.env.GOOGLE_SERVICE_ACCOUNT_PATH;
  if (keyPath && keyPath.trim() !== '') {
    const file = Bun.file(keyPath.trim());
    if (!(await file.exists())) {
      throw new Error(`[Config Error] Service account file not found at: "${keyPath}"`);
    }
    try {
      return (await file.json()) as GoogleServiceAccountKey;
    } catch (error) {
      throw new Error(
        `[Config Error] Failed to read/parse service account from "${keyPath}": ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return null;
};

const parseAdminJids = (raw: string): readonly string[] => {
  return Object.freeze(
    raw
      .split(',')
      .map((jid) => jid.trim())
      .filter((jid) => jid.length > 0)
  );
};

const serviceAccountKey = await parseServiceAccountKey();

const nodeEnv = (getEnvOrDefault('NODE_ENV', 'development')) as AppConfig['app']['env'];
const bufferWindowSeconds = parseInt(getEnvOrDefault('BUFFER_WINDOW_SECONDS', '60'), 10);
const dbFileName = getEnvOrThrow('DB_FILE_NAME');
const groupJid = getEnvOrThrow('GROUP_JID');
const adminJidRaw = getEnvOrThrow('ADMIN_JID_LIST');
const botPhoneNumber = getEnvOrThrow('BOT_PHONE_NUMBER');
const googleSheetId = getEnvOrThrow('GOOGLE_SHEET_ID');
const serviceAccountPath = Bun.env.GOOGLE_SERVICE_ACCOUNT_PATH?.trim() ?? null;

export const config: AppConfig = Object.freeze({
  app: Object.freeze({
    env: nodeEnv,
    bufferWindowSeconds: isNaN(bufferWindowSeconds) ? 60 : bufferWindowSeconds,
  }),
  db: Object.freeze({
    fileName: dbFileName,
  }),
  whatsapp: Object.freeze({
    groupJid,
    adminJids: parseAdminJids(adminJidRaw),
    botPhoneNumber,
    authDir: getEnvOrDefault('WA_AUTH_DIR', './auth_info'),
  }),
  google: Object.freeze({
    sheetId: googleSheetId,
    serviceAccountKey: serviceAccountKey ? Object.freeze(serviceAccountKey) : null,
    serviceAccountPath,
  }),
});
