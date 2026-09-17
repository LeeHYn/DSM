import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReadinessService {
  private probe?: Promise<boolean>;

  constructor(private readonly prisma: PrismaService) {}

  check(): Promise<boolean> {
    if (this.probe) return this.probe;

    const query = Promise.resolve()
      .then(() => this.prisma.$queryRaw`SELECT 1`)
      .then(
        () => true,
        () => false,
      );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), 1000);
    });
    const result = Promise.race([query, timeout]);
    this.probe = result;

    // A response timeout does not cancel Prisma's query. Keep sharing the
    // failed probe until it settles so polling cannot queue more DB work.
    void query.then(() => {
      clearTimeout(timer);
      if (this.probe === result) this.probe = undefined;
    });
    return result;
  }
}
