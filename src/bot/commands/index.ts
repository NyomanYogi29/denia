import type { MessageRouter } from '@/bot/types.ts';
import type { BufferService } from '@/core/services/buffer.service.ts';
import {
  createPinjamCommandHandler,
  type PinjamCommandOptions,
} from './pinjam.command.ts';
import { createBatalCommandHandler } from './batal.command.ts';
import { createInfoCommandHandler } from './info.command.ts';

export {
  createPinjamCommandHandler,
  createBatalCommandHandler,
  createInfoCommandHandler,
};
export type { PinjamCommandOptions };

export interface DefaultCommandsOptions {
  readonly bufferService?: BufferService;
}

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

  router.register('pinjam', pinjamHandler);
  router.register('book', pinjamHandler);
  router.register('batal', batalHandler);
  router.register('cancel', batalHandler);
  router.register('info', infoHandler);
  router.register('jadwal', infoHandler);

  return router;
}
