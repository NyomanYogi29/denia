import type { MessageRouter } from '@/bot/types.ts';
import type { BufferService } from '@/core/services/buffer.service.ts';
import {
  createPinjamCommandHandler,
  type PinjamCommandOptions,
} from './pinjam.command.ts';

export { createPinjamCommandHandler };
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

  router.register('pinjam', pinjamHandler);

  return router;
}
