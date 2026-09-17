// Test-only file persistence. No runtime URL, credentials, or production repository.
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseStorefrontDesignWorkspace, type StorefrontDesignWorkspace } from "@celebix/saas-contracts";
import { initialDesignFixture } from "./fixture-data";

const state = globalThis as typeof globalThis & {
  designSettingsFixtureFile?: Promise<string>;
  designSettingsFixtureFailure?: boolean;
  designSettingsFixtureHoldNext?: boolean;
  designSettingsFixtureRelease?: () => void;
};
function file() {
  return state.designSettingsFixtureFile ??= mkdtemp(join(tmpdir(), "celebix-design-settings-fixture-")).then(async (directory) => {
    const path = join(directory, "workspace.json");
    await writeFile(path, JSON.stringify(initialDesignFixture()), { mode: 0o600 });
    return path;
  });
}
export async function readFixture() { return parseStorefrontDesignWorkspace(JSON.parse(await readFile(await file(), "utf8"))); }
export async function writeFixture(value: StorefrontDesignWorkspace) { await writeFile(await file(), JSON.stringify(parseStorefrontDesignWorkspace(value)), { mode: 0o600 }); }
export function failNextFixtureSave() { state.designSettingsFixtureFailure = true; }
export function consumeFixtureFailure() { const fail = state.designSettingsFixtureFailure; state.designSettingsFixtureFailure = false; return fail; }
export function holdNextFixtureSave() { state.designSettingsFixtureHoldNext = true; }
export function releaseFixtureSave() { state.designSettingsFixtureRelease?.(); state.designSettingsFixtureRelease = undefined; }
export async function waitForFixtureSaveRelease() {
  if (!state.designSettingsFixtureHoldNext) return;
  state.designSettingsFixtureHoldNext = false;
  await new Promise<void>((resolve) => { state.designSettingsFixtureRelease = resolve; });
}
