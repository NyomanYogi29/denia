import type { ResolvedError } from '../errors/index.ts';

export interface DirectMessageOptions {
  readonly error: ResolvedError;
  readonly command?: string;
  readonly recipientName?: string;
}

/**
 * Builder template pesan penolakan/error khusus Japri/DM WhatsApp.
 * Menampilkan penyebab kegagalan dan saran solutif agar pengguna dapat memperbaiki perintahnya.
 */
export function formatDirectErrorMessage(options: DirectMessageOptions): string {
  const { error, command, recipientName } = options;

  const greeting = recipientName ? `Halo *${recipientName}*,` : 'Halo,';
  const commandSection = command ? `\n📌 *Perintah*: \`${command}\`` : '';
  const suggestionSection = error.suggestion
    ? `\n💡 *Saran Solutif*:\n${error.suggestion}`
    : '';

  return [
    '⚠️ *NOTIFIKASI SISTEM SDP UNDIKSHA* ⚠️',
    '',
    `${greeting} permintaan Anda tidak dapat diproses:`,
    commandSection,
    `❌ *Penyebab*: ${error.userMessage}`,
    suggestionSection,
    '',
    '────────────────────────',
    '_Pesan ini dikirimkan via Japri (DM) otomatis oleh bot agar tidak mengotori obrolan grup._',
  ]
    .filter((line) => line !== '')
    .join('\n');
}
