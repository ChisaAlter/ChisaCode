import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { acquirePidLock, getPidLockInfo, releasePidLock, updatePidLock } from "./pid-lock.js";

describe("pid-lock ownership", () => {
  test("reclaims lock when the recorded pid was reused by another process", async () => {
    const chisacodeHome = await mkdtemp(join(tmpdir(), "chisacode-pid-lock-reused-"));
    const ownerPid = process.pid + 10_000;

    try {
      await writeFile(
        join(chisacodeHome, "chisacode.pid"),
        JSON.stringify({
          pid: process.pid,
          startedAt: "2000-01-01T00:00:00.000Z",
          hostname: "old-host",
          uid: 0,
          listen: "127.0.0.1:6767",
        }),
      );

      await (
        acquirePidLock as unknown as (
          home: string,
          sockPath: string | null,
          options: { ownerPid: number },
        ) => Promise<void>
      )(chisacodeHome, null, { ownerPid });

      const lock = await getPidLockInfo(chisacodeHome);
      expect(lock?.pid).toBe(ownerPid);
      expect(lock?.listen).toBeNull();
    } finally {
      await rm(chisacodeHome, { recursive: true, force: true });
    }
  });

  test("writes and releases lock for explicit owner pid", async () => {
    const chisacodeHome = await mkdtemp(join(tmpdir(), "chisacode-pid-lock-owner-"));
    const ownerPid = process.pid + 10_000;

    try {
      await (
        acquirePidLock as unknown as (
          home: string,
          sockPath: string | null,
          options: { ownerPid: number },
        ) => Promise<void>
      )(chisacodeHome, null, { ownerPid });

      const lock = await getPidLockInfo(chisacodeHome);
      expect(lock?.pid).toBe(ownerPid);
      expect(lock?.listen).toBeNull();

      await (
        updatePidLock as unknown as (
          home: string,
          patch: { listen: string },
          options: { ownerPid: number },
        ) => Promise<void>
      )(chisacodeHome, { listen: "127.0.0.1:6767" }, { ownerPid });

      const updatedLock = await getPidLockInfo(chisacodeHome);
      expect(updatedLock?.listen).toBe("127.0.0.1:6767");

      await (
        releasePidLock as unknown as (home: string, options: { ownerPid: number }) => Promise<void>
      )(chisacodeHome, { ownerPid: ownerPid + 1 });
      const lockAfterWrongOwnerRelease = await getPidLockInfo(chisacodeHome);
      expect(lockAfterWrongOwnerRelease?.pid).toBe(ownerPid);

      await (
        releasePidLock as unknown as (home: string, options: { ownerPid: number }) => Promise<void>
      )(chisacodeHome, { ownerPid });
      const lockAfterOwnerRelease = await getPidLockInfo(chisacodeHome);
      expect(lockAfterOwnerRelease).toBeNull();
    } finally {
      await rm(chisacodeHome, { recursive: true, force: true });
    }
  });
});
