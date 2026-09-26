// Test-only file persistence. No runtime URL, credentials, or production repository.
import { mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseStorefrontDesignWorkspace, type StorefrontDesignWorkspace } from "@celebix/saas-contracts";
import { initialDesignFixture } from "./fixture-data";

const state = globalThis as typeof globalThis & {
  designSettingsFixtureFile?: Promise<string>;
  designSettingsFixtureFailure?: boolean;
  designSettingsFixtureHoldNext?: boolean;
  designSettingsFixtureRelease?: () => void;
  designSettingsFixtureMutationTail?: Promise<void>;
};
function file() {
  return state.designSettingsFixtureFile ??= mkdtemp(join(tmpdir(), "celebix-design-settings-fixture-")).then(async (directory) => {
    const path = join(directory, "workspace.json");
    await writeFile(path, JSON.stringify(initialDesignFixture()), { mode: 0o600 });
    return path;
  });
}
export async function readFixture() { return parseStorefrontDesignWorkspace(JSON.parse(await readFile(await file(), "utf8"))); }
async function writeFixtureAtomically(value: StorefrontDesignWorkspace) {
  const target = await file();
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(parseStorefrontDesignWorkspace(value)), { mode: 0o600, flag: "wx" });
  await rename(temporary, target);
}
export function mutateFixture<T>(mutation: (current: StorefrontDesignWorkspace) => Readonly<{ workspace?: StorefrontDesignWorkspace; result: T }>): Promise<T> {
  const task = (state.designSettingsFixtureMutationTail ?? Promise.resolve()).then(async () => {
    const outcome = mutation(await readFixture());
    if (outcome.workspace) await writeFixtureAtomically(outcome.workspace);
    return outcome.result;
  });
  state.designSettingsFixtureMutationTail = task.then(() => undefined, () => undefined);
  return task;
}
export function writeFixture(value: StorefrontDesignWorkspace) { return mutateFixture(() => ({ workspace: value, result: undefined })); }
export function failNextFixtureSave() { state.designSettingsFixtureFailure = true; }
export function consumeFixtureFailure() { const fail = state.designSettingsFixtureFailure; state.designSettingsFixtureFailure = false; return fail; }
export function holdNextFixtureSave() { state.designSettingsFixtureHoldNext = true; }
export function releaseFixtureSave() { state.designSettingsFixtureRelease?.(); state.designSettingsFixtureRelease = undefined; }
export async function waitForFixtureSaveRelease() {
  if (!state.designSettingsFixtureHoldNext) return;
  state.designSettingsFixtureHoldNext = false;
  await new Promise<void>((resolve) => { state.designSettingsFixtureRelease = resolve; });
}
