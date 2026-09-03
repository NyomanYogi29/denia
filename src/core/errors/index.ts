export { ErrorCode, type ErrorCodeType } from './codes.ts';
export {
  AppError,
  UnauthorizedError,
  SlotConflictError,
  ValidationError,
  NotFoundError,
  type AppErrorOptions,
} from './app-error.ts';
export { resolveError, type ResolvedError } from './resolver.ts';
