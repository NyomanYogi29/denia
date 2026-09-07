export { ErrorCode, type ErrorCodeType } from './codes.ts';
export {
  AppError,
  UnauthorizedError,
  SlotConflictError,
  ValidationError,
  NotFoundError,
  DatabaseError,
  type AppErrorOptions,
} from './app-error.ts';

export { resolveError, type ResolvedError } from './resolver.ts';
