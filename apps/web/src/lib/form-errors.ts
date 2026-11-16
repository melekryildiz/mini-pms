import { ApiError } from './api-error';

/** NestJS ValidationPipe'ın ürettiği mesajları güvenli bir string listesine çevirir. */
export function getApiMessages(error: unknown): string[] {
  if (!(error instanceof ApiError)) {
    return [
      error instanceof Error ? error.message : 'Beklenmeyen bir hata oluştu.',
    ];
  }

  const details =
    error.details && typeof error.details === 'object'
      ? (error.details as Record<string, unknown>)
      : {};
  const message = details.message;

  if (Array.isArray(message)) {
    return message.filter((item): item is string => typeof item === 'string');
  }

  return [typeof message === 'string' ? message : error.message];
}

/**
 * class-validator mesajları alan adıyla başladığı için ilgili input'un altında
 * gösterebiliriz. Eşleşmeyen iş kuralı mesajı formun genel hata alanında kalır.
 */
export function mapFieldErrors<T extends string>(
  error: unknown,
  fields: readonly T[],
): { fields: Partial<Record<T, string>>; form?: string } {
  const messages = getApiMessages(error);
  const fieldErrors: Partial<Record<T, string>> = {};
  const unmatched: string[] = [];

  for (const message of messages) {
    const normalized = message.toLocaleLowerCase('en-US');
    const field = fields.find((candidate) =>
      normalized.includes(candidate.toLocaleLowerCase('en-US')),
    );

    if (field && !fieldErrors[field]) fieldErrors[field] = message;
    else unmatched.push(message);
  }

  return {
    fields: fieldErrors,
    form: unmatched.length ? unmatched.join(' ') : undefined,
  };
}
