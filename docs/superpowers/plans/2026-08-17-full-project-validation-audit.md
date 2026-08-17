# Full Project Validation Audit Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify the complete local DSM project and close every locally executable Android authentication validation while preserving secrets, data, and Git history.

**Architecture:** Treat backend, frontend, Android native runtime, OAuth configuration, and repository hygiene as separate evidence gates. Use read-only inspection first; run local tests/builds second; perform emulator and provider smoke only when the required local configuration and authenticated UI state exist. Any failure enters systematic root-cause analysis before a fix is proposed.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Jest, React Native 0.83, React Navigation, Android Gradle Plugin, Android Studio, Google OAuth.

## Global Constraints

- Do not print or persist OAuth client IDs, tokens, SHA-1 fingerprints, keystore content, passwords, or database credentials.
- Do not run EAS, Expo, paid cloud builds, deployment, remote migration, destructive DB operations, or Git writes.
- Use the existing local worktree `C:\DEV\fsr`; preserve all user changes.
- A local command only passes when its fresh exit code and complete output confirm success.
- External Google Cloud mutations require a separate explicit approval at action time.

---

### Task 1: Establish the validation baseline

**Files:**
- Read: `.ai/memory/*`, root/child `AGENTS.md`, package manifests, Docker/Prisma configuration
- Create: `docs/superpowers/plans/2026-08-17-full-project-validation-audit.md`

**Interfaces:**
- Consumes: current worktree, installed SDK/JDK/Node, local ignored configuration
- Produces: exact runnable gates and external blockers without secret disclosure

- [ ] Record Git branch/status and installed/runtime process state.
- [ ] Check required environment variable presence and audience equality as booleans only.
- [ ] Confirm emulator, backend dependency, database, and Metro availability.

### Task 2: Run the complete local verification matrix

**Files:**
- Read: `DSM_Back/**`, `DSM_Front/**`
- Modify: none unless a verified defect receives an in-scope minimal fix

**Interfaces:**
- Consumes: package scripts and native Gradle project
- Produces: test/type/lint/build/schema evidence for both applications

- [ ] Run backend format/lint/type/build/unit/e2e/schema gates supported by package scripts.
- [ ] Run frontend full Jest, TypeScript, ESLint, dependency/autolink and Expo-leak gates.
- [ ] Run Android debug build and signing/config boundary checks without disclosing values.

### Task 3: Run Android session smoke

**Files:**
- Modify: no tracked files

**Interfaces:**
- Consumes: Metro, installed debug APK, API 36 emulator, local backend
- Produces: launch/login boundary, provider login, reload/bootstrap, profile/refresh/logout evidence

- [ ] Start or reconnect Metro and the API 36 emulator.
- [ ] Install/launch the current debug APK and confirm the unauthenticated route.
- [ ] If backend audience and Google debug OAuth registration are ready, execute authenticated login and lifecycle smoke.
- [ ] If external state blocks the smoke, report the exact missing approval/action without guessing.

### Task 4: Audit and independent review

**Files:**
- Read: repository diff, source, tests, configs, docs
- Modify: `.ai/memory/plan.md`, `.ai/memory/context.md`, `.ai/memory/checklist.md`, `.ai/memory/README.md` only for verified final state

**Interfaces:**
- Consumes: all gate results and runtime evidence
- Produces: severity-ranked findings, fixed/blocked status, reproducible handoff

- [ ] Scan secrets, ignored artifacts, dependency/runtime boundaries, and `git diff --check`.
- [ ] Request an independent read-only reviewer for P0–P3 findings.
- [ ] Reconcile findings with actual evidence and update active memory.
- [ ] Report tests, failures, external blockers, removed artifacts, and Git state.
