import { homeDir } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";

export interface FolderPicker {
  chooseParentLocation(): Promise<string | null>;
  chooseExistingVault(): Promise<string | null>;
  /** Where a new vault lands unless the user picks somewhere else. Returning
   * null means we could not resolve one, and setup has to ask. */
  defaultParentLocation(): Promise<string | null>;
}

async function chooseDirectory() {
  const defaultPath = await homeDir().catch(() => undefined);
  return open({
    directory: true,
    multiple: false,
    ...(defaultPath === undefined ? {} : { defaultPath }),
  });
}

export const tauriFolderPicker: FolderPicker = {
  chooseParentLocation: chooseDirectory,
  chooseExistingVault: chooseDirectory,
  defaultParentLocation: () => homeDir().catch(() => null),
};
