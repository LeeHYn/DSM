import { ApiError, isApiError } from './api-error';

it('serializes only safe fields', () => {
  const sensitiveCause = new Error('Bearer secret-access-token');
  const error = new ApiError('http', 'Request failed', {
    status: 409,
    code: 'CONFLICT',
    cause: sensitiveCause,
  });

  expect(error.toJSON()).toEqual({
    name: 'ApiError',
    kind: 'http',
    message: 'Request failed',
    status: 409,
    code: 'CONFLICT',
  });
  expect(isApiError(error)).toBe(true);
  expect(isApiError(new Error('Request failed'))).toBe(false);
  expect(JSON.stringify(error)).not.toContain('Bearer');
  expect(JSON.stringify(error)).not.toContain('secret-access-token');
});
