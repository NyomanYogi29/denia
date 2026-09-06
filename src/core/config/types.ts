export interface GoogleServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain?: string;
}

export interface AppConfig {
  readonly app: {
    readonly env: 'development' | 'production' | 'test';
    readonly bufferWindowSeconds: number;
  };
  readonly db: {
    readonly fileName: string;
  };
  readonly whatsapp: {
    readonly groupJid: string;
    readonly adminJids: readonly string[];
    readonly botPhoneNumber: string;
    readonly authDir: string;
  };
  readonly google: {
    readonly sheetId: string;
    readonly serviceAccountKey: GoogleServiceAccountKey | null;
    readonly serviceAccountPath: string | null;
  };
}
