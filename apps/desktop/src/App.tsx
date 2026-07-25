import { AppShell, type PrimaryMode } from "./app/AppShell";
import type { EditorClient } from "./editor";
import type {
  FolderPicker,
  SettingsClient,
  SettingsSnapshot,
} from "./settings";

interface AppProps {
  editorClient?: EditorClient;
  folderPicker?: FolderPicker;
  initialMode?: PrimaryMode;
  initialSettings?: SettingsSnapshot;
  online?: boolean;
  settingsClient?: SettingsClient;
  setupComplete?: boolean;
}

export function App(props: AppProps) {
  return <AppShell {...props} />;
}
