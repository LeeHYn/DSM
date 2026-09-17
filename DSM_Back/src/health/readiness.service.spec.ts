import { PrismaService } from '../prisma/prisma.service';
import { ReadinessService } from './readiness.service';

describe('ReadinessService', () => {
  const query = jest.fn();
  let service: ReadinessService;

  beforeEach(() => {
    jest.useFakeTimers();
    query.mockReset().mockResolvedValue([{ value: 1 }]);
    service = new ReadinessService({
      $queryRaw: query,
    } as unknown as PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('checks the live database with a read-only constant query', async () => {
    await expect(service.check()).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(['SELECT 1']);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('handles rejected and synchronously thrown database errors', async () => {
    query.mockRejectedValueOnce(new Error('private detail'));
    await expect(service.check()).resolves.toBe(false);
    query.mockImplementationOnce(() => {
      throw new Error('private detail');
    });
    await expect(service.check()).resolves.toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('coalesces concurrent checks into one query and rechecks after completion', async () => {
    let finish!: (value: unknown[]) => void;
    query.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = service.check();
    const second = service.check();
    await Promise.resolve();
    expect(query).toHaveBeenCalledTimes(1);
    finish([]);
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    await expect(service.check()).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('returns false after 1 second without queuing more queries until late success settles', async () => {
    let finish!: (value: unknown[]) => void;
    query.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    let outcome: boolean | undefined;
    void service.check().then((value) => {
      outcome = value;
    });
    await jest.advanceTimersByTimeAsync(999);
    expect(outcome).toBeUndefined();
    await jest.advanceTimersByTimeAsync(1);
    expect(outcome).toBe(false);
    await expect(service.check()).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
    finish([]);
    await jest.advanceTimersByTimeAsync(0);
    await expect(service.check()).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('observes a late rejection after timeout and permits a fresh probe', async () => {
    let fail!: (error: Error) => void;
    query.mockReturnValueOnce(
      new Promise((_, reject) => {
        fail = reject;
      }),
    );
    let outcome: boolean | undefined;
    void service.check().then((value) => {
      outcome = value;
    });
    await jest.advanceTimersByTimeAsync(1000);
    expect(outcome).toBe(false);
    fail(new Error('late private detail'));
    await jest.advanceTimersByTimeAsync(0);
    await expect(service.check()).resolves.toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
});
