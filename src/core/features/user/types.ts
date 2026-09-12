import type { User } from '@/core/db/schema.ts';
import type { CreateUserInput, CreateUserRawInput } from '@/core/validators/user';

export type CreateUserUseCaseInput = Partial<CreateUserRawInput>;

export type CreateUserUseCaseResult = User;

export type { CreateUserInput, CreateUserRawInput };
