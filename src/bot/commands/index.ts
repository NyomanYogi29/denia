import type { MessageRouter } from '@/bot/types.ts';
import type { BufferService } from '@/core/services/buffer.ts';
import {
  createPinjamCommandHandler,
  type PinjamCommandOptions,
} from './pinjam.ts';
import { createBatalCommandHandler } from './batal.ts';
import { createInfoCommandHandler } from './info.ts';
import { createForceCommandHandler } from './force.ts';

export {
  createPinjamCommandHandler,
  createBatalCommandHandler,
  createInfoCommandHandler,
  createForceCommandHandler,
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
  const forceHandler = createForceCommandHandler();

  router.register('pinjam', pinjamHandler);
  router.register('book', pinjamHandler);
  router.register('batal', batalHandler);
  router.register('cancel', batalHandler);
  router.register('info', infoHandler);
  router.register('jadwal', infoHandler);
  router.register('force', forceHandler);
  router.register('ambilalih', forceHandler);
  router.register('paksa', forceHandler);

  return router;
}
