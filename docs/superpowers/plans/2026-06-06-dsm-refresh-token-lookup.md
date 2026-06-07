# DSM Back — Refresh Token Lookup Hardening (Milestone 9)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the full-table scan in the refresh-token flow. Today `AuthService.refreshTokens` and `AuthService.logout` load **every** active refresh token and run `bcrypt.compare` against each row (O(N) bcrypt operations per request — a scalability and DoS risk that also makes the `@@index([userId, expiresAt])` unusable). Replace it with an O(1) primary-key lookup by embedding the token's record id in the opaque token string.

**Approach:** Change the refresh token wire format from `<secret>` to `<recordId>.<secret>`.
- `recordId` is the `RefreshToken.id` (UUID) — not a secret, safe to expose.
- `secret` is the existing 32-byte hex random value; only its bcrypt hash is stored in `tokenHash` (unchanged).
- On refresh/logout: parse `recordId`, `findUnique({ where: { id } })`, validate not-revoked / not-expired, then a **single** `bcrypt.compare(secret, record.tokenHash)`.

**No schema change / no migration:** `RefreshToken` already has `id`, `tokenHash @unique`, `expiresAt`, `revokedAt`, `userId`. UUIDs and hex secrets contain no `.`, so splitting on the first `.` round-trips safely (verified by prototype).

**Backward compatibility:** Refresh tokens issued before this change have no `.` separator and will be rejected as malformed → affected clients must re-login. Acceptable: the app is pre-production (no live users; Apple Sign In still pending). Call this out in the release note.

**Out of scope (future milestones):** revoked/expired token pruning (cron cleanup), refresh-token reuse detection / theft response, refresh secret rotation policy. Optional reuse-detection hook is noted in Task 1 Step 5 but not required to land this milestone.

**Tech Stack:** NestJS 11, TypeScript, Prisma, PostgreSQL, `bcrypt`, `crypto`, Jest.

---

## File Structure

- Modify: `DSM_Back/src/auth/auth.service.ts`
  Rewrite `issueTokens` to return `<recordId>.<secret>`; rewrite `refreshTokens` and `logout` to parse the id and do a single `findUnique` + one `bcrypt.compare`; add a private `parseRefreshToken` helper.
- Modify: `DSM_Back/src/auth/auth.service.spec.ts`
  Replace `refreshToken.findMany` mocks with `findUnique`; update existing refresh/logout tests; add malformed / revoked / expired / wrong-secret cases and assert the returned token is shaped `<uuid>.<secret>`.
- Modify: `.ai/memory/plan.md`, `.ai/memory/context.md`, `.ai/memory/checklist.md`
  Record Milestone 9 and its status.

No production dependency changes. No Prisma schema or migration changes.

---

### Task 1: Refactor refresh-token lookup to O(1)

**Files:**
- Modify: `DSM_Back/src/auth/auth.service.spec.ts`
- Modify: `DSM_Back/src/auth/auth.service.ts`

- [ ] **Step 1: Update the existing tests to the new contract (red)**

In `auth.service.spec.ts`, change the prisma mock so `refreshToken` exposes `findUnique` instead of `findMany`:

```ts
refreshToken: {
  create: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
},
```

Rewrite the "valid refresh" test to seed a single record and pass a `<id>.<secret>` token:

```ts
it('issues new tokens when refresh token is valid', async () => {
  const secret = 'raw-secret';
  const hash = await bcrypt.hash(secret, 1);
  prismaMock.refreshToken.findUnique.mockResolvedValue({
    id: 'rt-1',
    userId: MOCK_USER.id,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
  });
  prismaMock.refreshToken.update.mockResolvedValue({});
  prismaMock.refreshToken.create.mockResolvedValue({ id: 'rt-2' });

  const result = await service.refreshTokens(`rt-1.${secret}`);

  expect(result.accessToken).toBe('signed-access-token');
  expect(result.refreshToken).toMatch(/^rt-2\./);
  expect(prismaMock.refreshToken.findUnique).toHaveBeenCalledWith({
    where: { id: 'rt-1' },
  });
  expect(prismaMock.refreshToken.update).toHaveBeenCalledWith(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    expect.objectContaining({
      where: { id: 'rt-1' },
      data: { revokedAt: expect.any(Date) },
    }),
  );
});
```

- [ ] **Step 2: Add edge-case tests**

```ts
it('throws on a malformed token (no separator)', async () => {
  await expect(service.refreshTokens('legacy-no-dot')).rejects.toThrow(
    UnauthorizedException,
  );
  expect(prismaMock.refreshToken.findUnique).not.toHaveBeenCalled();
});

it('throws when the record is missing', async () => {
  prismaMock.refreshToken.findUnique.mockResolvedValue(null);
  await expect(service.refreshTokens('rt-x.secret')).rejects.toThrow(
    UnauthorizedException,
  );
});

it('throws when the record is revoked', async () => {
  const hash = await bcrypt.hash('s', 1);
  prismaMock.refreshToken.findUnique.mockResolvedValue({
    id: 'rt-1', userId: MOCK_USER.id, tokenHash: hash,
    expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date(),
  });
  await expect(service.refreshTokens('rt-1.s')).rejects.toThrow(
    UnauthorizedException,
  );
});

it('throws when the record is expired', async () => {
  const hash = await bcrypt.hash('s', 1);
  prismaMock.refreshToken.findUnique.mockResolvedValue({
    id: 'rt-1', userId: MOCK_USER.id, tokenHash: hash,
    expiresAt: new Date(Date.now() - 60_000), revokedAt: null,
  });
  await expect(service.refreshTokens('rt-1.s')).rejects.toThrow(
    UnauthorizedException,
  );
});

it('throws when the secret does not match', async () => {
  const hash = await bcrypt.hash('correct', 1);
  prismaMock.refreshToken.findUnique.mockResolvedValue({
    id: 'rt-1', userId: MOCK_USER.id, tokenHash: hash,
    expiresAt: new Date(Date.now() + 60_000), revokedAt: null,
  });
  await expect(service.refreshTokens('rt-1.wrong')).rejects.toThrow(
    UnauthorizedException,
  );
});
```

Update the two `logout` tests the same way (seed `findUnique`, pass `rt-1.<secret>`; the "no matching token" case sets `findUnique` to `null` and still resolves to `undefined`).

- [ ] **Step 3: Run the tests to confirm they fail**

```powershell
cd C:\DEV\DSM_Back
npm test -- auth.service.spec.ts --runInBand
```

- [ ] **Step 4: Implement the refactor (green)**

In `auth.service.ts`:

```ts
private parseRefreshToken(token: string): { id: string; secret: string } {
  const idx = token.indexOf('.');
  if (idx <= 0 || idx === token.length - 1) {
    throw new UnauthorizedException('Invalid or expired refresh token');
  }
  return { id: token.slice(0, idx), secret: token.slice(idx + 1) };
}

private async issueTokens(userId: string): Promise<TokenResponseDto> {
  const payload: JwtPayload = { sub: userId, type: 'access' };
  const accessToken = this.jwtService.sign(payload, {
    secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
    expiresIn: ACCESS_TOKEN_TTL,
  });

  const secret = crypto.randomBytes(32).toString('hex');
  const tokenHash = await bcrypt.hash(secret, BCRYPT_ROUNDS);
  const record = await this.prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });

  return { accessToken, refreshToken: `${record.id}.${secret}` };
}

async refreshTokens(rawRefreshToken: string): Promise<TokenResponseDto> {
  const { id, secret } = this.parseRefreshToken(rawRefreshToken);
  const record = await this.prisma.refreshToken.findUnique({ where: { id } });

  if (
    !record ||
    record.revokedAt !== null ||
    record.expiresAt <= new Date() ||
    !(await bcrypt.compare(secret, record.tokenHash))
  ) {
    throw new UnauthorizedException('Invalid or expired refresh token');
  }

  await this.prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });

  return this.issueTokens(record.userId);
}

async logout(userId: string, rawRefreshToken: string): Promise<void> {
  let parsed: { id: string; secret: string };
  try {
    parsed = this.parseRefreshToken(rawRefreshToken);
  } catch {
    return; // logout is idempotent — ignore malformed tokens
  }

  const record = await this.prisma.refreshToken.findUnique({
    where: { id: parsed.id },
  });
  if (
    !record ||
    record.userId !== userId ||
    record.revokedAt !== null ||
    !(await bcrypt.compare(parsed.secret, record.tokenHash))
  ) {
    return;
  }

  await this.prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });
}
```

- [ ] **Step 5 (optional hardening, not required to land):** When `findUnique` returns a record whose `revokedAt !== null` on the refresh path, treat it as a possible reuse of a rotated token and revoke all of the user's active refresh tokens (`updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })`). Add a dedicated test if implemented.

- [ ] **Step 6: Run the full backend test suite + lint + type-check (green)**

```powershell
cd C:\DEV\DSM_Back
npm run lint
npx tsc -p tsconfig.build.json --noEmit
npm test -- --runInBand
```

All suites pass, eslint clean, no type errors.

---

### Task 2: Record the milestone

**Files:**
- Modify: `.ai/memory/plan.md`, `.ai/memory/checklist.md`, `.ai/memory/context.md`

- [ ] Mark Milestone 9 (refresh-token lookup hardening) complete; renumber the DailyScore work to Milestone 10. Note the wire-format change (`<recordId>.<secret>`) and the re-login-required backward-compatibility caveat in `context.md`.

---

## Acceptance Criteria

- `refreshTokens` and `logout` perform exactly one `findUnique` (by primary key) and at most one `bcrypt.compare` per call — no `findMany`, no per-row loop.
- Malformed (no `.`), missing, revoked, expired, and wrong-secret tokens all yield `401` on refresh; `logout` is idempotent for all of these.
- Issued refresh tokens match `^<uuid>\.<hex>$`.
- No Prisma schema or migration change.
- Lint, type-check, and the full Jest suite pass.
