import { describe, expect, it } from 'bun:test';
import { createBotClient } from '@/core/bot';
import { config } from '@/core/config';
import { ErrorCode } from '@/core/errors';

describe('WhatsApp Bot Client Module', () => {
  it('should initialize bot client with default options (qr code mode) and idle status', () => {
    const client = createBotClient();

    expect(client).toBeDefined();
    expect(client.getStatus()).toBe('idle');
    expect(client.getSocket()).toBeNull();

    const options = client.getOptions();
    expect(options.authDir).toBe(config.whatsapp.authDir);
    expect(options.phoneNumber).toBe(config.whatsapp.botPhoneNumber);
    expect(options.authMode).toBe('qr'); // Default adalah qr code
    expect(options.autoReconnect).toBe(true);
    expect(options.reconnectIntervalMs).toBe(3000);
  });

  it('should accept custom configuration options and allow overriding to pairing mode', () => {
    const client = createBotClient({
      authDir: './test_auth_dir',
      phoneNumber: '628999888777',
      authMode: 'pairing',
      autoReconnect: false,
      maxReconnectAttempts: 5,
      reconnectIntervalMs: 5000,
    });

    const options = client.getOptions();
    expect(options.authDir).toBe('./test_auth_dir');
    expect(options.phoneNumber).toBe('628999888777');
    expect(options.authMode).toBe('pairing');
    expect(options.autoReconnect).toBe(false);
    expect(options.maxReconnectAttempts).toBe(5);
    expect(options.reconnectIntervalMs).toBe(5000);
  });

  it('should allow registering event listeners via on() method', () => {
    const client = createBotClient();
    let handled = false;

    expect(() => {
      client.on('messages.upsert', () => {
        handled = true;
      });
    }).not.toThrow();

    expect(handled).toBe(false);
  });

  it('should handle manual disconnect gracefully and return Result<void, AppError>', async () => {
    let statusReceived = '';
    const client = createBotClient({
      onStatusChange: (status) => {
        statusReceived = status;
      },
    });

    expect(client.getStatus()).toBe('idle');

    const result = await client.disconnect();

    // Result pattern validation
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }

    expect(client.getStatus()).toBe('disconnected');
    expect(client.getSocket()).toBeNull();
    expect(statusReceived).toBe('disconnected');
  });

  it('should return Err with Result pattern when requestPairingCode is called without connected socket', async () => {
    const client = createBotClient({
      phoneNumber: '628123456789',
    });

    const result = await client.requestPairingCode();

    // Validasi Result pattern kegagalan
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    }
  });

  it('should return Err with ValidationError when requesting pairing code with empty phone number', async () => {
    const client = createBotClient({
      phoneNumber: '',
    });

    const result = await client.requestPairingCode('');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe(ErrorCode.INVALID_COMMAND_SYNTAX);
    }
  });

  it('should return frozen BotClient and options objects for immutability', () => {
    const client = createBotClient();

    expect(Object.isFrozen(client)).toBe(true);
    expect(Object.isFrozen(client.getOptions())).toBe(true);
  });
});
