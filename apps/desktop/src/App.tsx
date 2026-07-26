import { AppShell, type PrimaryMode } from "./app/AppShell";
import type { EditorClient } from "./editor";
import type {
  FolderPicker,
  SettingsClient,
  SettingsSnapshot,
} from "./settings";
import type { KnowledgeClient } from "./knowledge";
import type { WindowChromeClient } from "./app/windowChrome";

interface AppProps {
  editorClient?: EditorClient;
  folderPicker?: FolderPicker;
  initialMode?: PrimaryMode;
  initialSettings?: SettingsSnapshot;
  knowledgeClient?: KnowledgeClient;
  online?: boolean;
  settingsClient?: SettingsClient;
  setupComplete?: boolean;
  windowChrome?: WindowChromeClient | null;
}

export function App(props: AppProps) {
  return <AppShell {...props} />;
}
