export interface RefreshTokenStore {
  read(): Promise<string | null>;
  write(refreshToken: string): Promise<void>;
  clear(): Promise<void>;
}

export class TokenStoreCoordinator {
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: RefreshTokenStore,
    private readonly getCurrentEpoch: () => number,
  ) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  read(): Promise<string | null> {
    return this.enqueue(() => this.store.read());
  }

  writeIfCurrent(refreshToken: string, epoch: number): Promise<boolean> {
    return this.enqueue(async () => {
      if (this.getCurrentEpoch() !== epoch) {
        return false;
      }
      await this.store.write(refreshToken);
      if (this.getCurrentEpoch() !== epoch) {
        await this.store.clear();
        return false;
      }
      return true;
    });
  }

  readAndClear(): Promise<string | null> {
    return this.enqueue(async () => {
      const refreshToken = await this.store.read();
      await this.store.clear();
      return refreshToken;
    });
  }
}
