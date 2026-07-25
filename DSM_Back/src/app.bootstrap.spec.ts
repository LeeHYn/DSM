import { buildCorsOptions } from './app.bootstrap';

function resolveOrigin(origin: string | undefined): Promise<boolean> {
  const options = buildCorsOptions([
    'http://localhost:8081',
    'https://qa.example.com',
  ]);

  return new Promise((resolve, reject) => {
    if (typeof options.origin !== 'function') {
      reject(new Error('origin callback is required'));
      return;
    }
    options.origin(origin, (error, allowed) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(Boolean(allowed));
    });
  });
}

it('allows exact browser origins and no-Origin clients', async () => {
  await expect(resolveOrigin('http://localhost:8081')).resolves.toBe(true);
  await expect(resolveOrigin(undefined)).resolves.toBe(true);
});

it('rejects unlisted browser origins and credentials', async () => {
  await expect(resolveOrigin('https://evil.example')).resolves.toBe(false);
  expect(buildCorsOptions([]).credentials).toBe(false);
});

it('restricts CORS methods and allowed headers', () => {
  const options = buildCorsOptions([]);

  expect(options.methods).toEqual([
    'GET',
    'HEAD',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
  ]);
  expect(options.allowedHeaders).toEqual(['Authorization', 'Content-Type']);
});
