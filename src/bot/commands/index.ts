import type { CommandHandler, MessageRouter } from '@/bot/types.ts';
import type { BufferService } from '@/core/services/buffer.ts';
import { logger } from '@/core/logger';
import {
  createPinjamCommandHandler,
  type PinjamCommandOptions,
} from './pinjam.ts';
import { createBatalCommandHandler } from './batal.ts';
import { createInfoCommandHandler } from './info.ts';
import { createForceCommandHandler } from './force.ts';
import { createForceEventCommandHandler } from './force-event.ts';
import { createAbortCommandHandler } from './abort.ts';
import { createHelpCommandHandler } from './help.ts';

export {
  createPinjamCommandHandler,
  createBatalCommandHandler,
  createInfoCommandHandler,
  createForceCommandHandler,
  createForceEventCommandHandler,
  createAbortCommandHandler,
  createHelpCommandHandler,
};
export type { PinjamCommandOptions };

export interface DefaultCommandsOptions {
  readonly bufferService?: BufferService;
}

const log = logger.child({ module: 'COMMAND_REGISTRATION' });

/**
 * Mendaftarkan seluruh command handler bot standar ke instance MessageRouter.
 */
export function registerDefaultBotCommands(
  router: MessageRouter,
  options: DefaultCommandsOptions = {}
): MessageRouter {
  const pinjamHandler = createPinjamCommandHandler({
    bufferService: options.bufferService,
  });
  const batalHandler = createBatalCommandHandler();
  const infoHandler = createInfoCommandHandler();
  const forceHandler = createForceCommandHandler();
  const forceEventHandler = createForceEventCommandHandler();
  const abortHandler = createAbortCommandHandler();
  const helpHandler = createHelpCommandHandler();

  const commandEntries: ReadonlyArray<readonly [string, CommandHandler]> = [
    ['pinjam', pinjamHandler],
    ['book', pinjamHandler],
    ['batal', batalHandler],
    ['cancel', batalHandler],
    ['info', infoHandler],
    ['jadwal', infoHandler],
    ['force', forceHandler],
    ['ambilalih', forceHandler],
    ['paksa', forceHandler],
    ['forceevent', forceEventHandler],
    ['event', forceEventHandler],
    ['blokir', forceEventHandler],
    ['abort', abortHandler],
    ['batalforce', abortHandler],
    ['help', helpHandler],
    ['panduan', helpHandler],
    ['bantuan', helpHandler],
    ['menu', helpHandler],
  ];

  for (const [command, handler] of commandEntries) {
    router.register(command, handler);
  }

  const registeredList = commandEntries.map(([command]) => command);
  log.info(
    `Seluruh command handler bot berhasil dimuat (${registeredList.length} perintah aktif)`,
    {
      totalCommands: registeredList.length,
      commands: registeredList,
    }
  );

  return router;
}


