# DSM_Back Milestone 13 Audit Review

## Command

- `npm audit --omit=dev --json`
- `npm audit fix --omit=dev`
- `npm audit --omit=dev --json`

## Result

- Remaining production vulnerabilities after non-breaking audit fix:
  - 13 total
  - 7 high
  - 6 moderate

## Remaining Vulnerability Paths

- `multer` path:
  - `@nestjs/platform-express -> multer`
  - Advisories:
    - `GHSA-72gw-mp4g-v24j`: Denial of Service via deeply nested field names.
    - `GHSA-3p4h-7m6x-2hcm`: incomplete cleanup of aborted uploads.
  - `npm audit fix --force` proposes `@nestjs/core@7.5.5`, a breaking downgrade from the current NestJS 11 stack.

- NestJS transitive path:
  - `@nestjs/core`
  - `@nestjs/event-emitter -> @nestjs/core`
  - `@nestjs/platform-express -> @nestjs/core`
  - `@nestjs/platform-socket.io -> @nestjs/websockets`
  - `@nestjs/schedule -> @nestjs/core`
  - `@nestjs/websockets -> @nestjs/core / @nestjs/platform-socket.io`
  - The proposed forced fixes downgrade NestJS packages to 7.x, so they were not applied.

- `uuid` path:
  - `firebase-admin -> @google-cloud/storage -> teeny-request -> uuid`
  - `firebase-admin -> @google-cloud/storage -> retry-request -> teeny-request -> uuid`
  - `firebase-admin -> @google-cloud/storage -> gaxios -> uuid`
  - `firebase-admin -> gtoken -> gaxios -> uuid`
  - Advisory:
    - `GHSA-w5hq-g745-h8pq`: missing buffer bounds check in v3/v5/v6 when `buf` is provided.
  - `npm audit fix --force` proposes `firebase-admin@10.3.0`, a breaking downgrade from the current Firebase Admin 14 stack.

## Decision

- `npm audit fix --omit=dev` was executed.
- No non-breaking production fix was available for the remaining vulnerable paths.
- `npm audit fix --force` was not applied because it proposes breaking downgrades for NestJS and Firebase Admin SDK.
- Accepted risk is temporary and limited to the current pre-production milestone.

## Follow-up Trigger

- Re-run this review before production deployment.
- Revisit after upstream NestJS, `@nestjs/platform-express`, Firebase Admin SDK, Google Cloud Storage, or `uuid` dependency updates.
- If file upload endpoints are introduced before upstream fixes land, add explicit request limits and upload-specific hardening before enabling public traffic.
