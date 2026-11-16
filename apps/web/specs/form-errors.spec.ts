import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/lib/api-error';
import { mapFieldErrors } from '../src/lib/form-errors';

describe('backend validation mapping', () => {
  it('places class-validator messages under their matching fields', () => {
    const error = new ApiError(400, 'Validation failed', {
      statusCode: 400,
      message: ['code should not be empty', 'name must be a string'],
    });

    expect(mapFieldErrors(error, ['code', 'name'] as const)).toEqual({
      fields: {
        code: 'code should not be empty',
        name: 'name must be a string',
      },
      form: undefined,
    });
  });
});
