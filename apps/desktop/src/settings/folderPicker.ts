import { open } from "@tauri-apps/plugin-dialog";

export interface FolderPicker {
  chooseParentLocation(): Promise<string | null>;
  chooseExistingVault(): Promise<string | null>;
}

async function chooseDirectory() {
  return open({ directory: true, multiple: false });
}

export const tauriFolderPicker: FolderPicker = {
  chooseParentLocation: chooseDirectory,
  chooseExistingVault: chooseDirectory,
};
