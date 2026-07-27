import { invoke } from "@tauri-apps/api/core";

import type { AboutClient } from "./About";
import type {
  AiConfiguration,
  OnboardingRequest,
  ProviderConnectRequest,
  ProviderId,
  SettingsClient,
  SettingsSnapshot,
} from "./types";

/** Narrow custom commands keep Stronghold itself unavailable to the renderer. */
export const ipcSettingsClient: SettingsClient = {
  getSettings: () => invoke<SettingsSnapshot>("settings_get"),
  completeOnboarding: (request: OnboardingRequest) =>
    invoke<SettingsSnapshot>("settings_complete_onboarding", { request }),
  connectProvider: (request: ProviderConnectRequest) =>
    invoke<SettingsSnapshot>("provider_connect", { request }),
  rotateProvider: (provider: ProviderId, credential: string) =>
    invoke<SettingsSnapshot>("provider_rotate", { provider, credential }),
  saveAiConfiguration: (configuration: AiConfiguration) =>
    invoke<SettingsSnapshot>("settings_update_ai", { configuration }),
  setAiEnabled: (enabled: boolean) =>
    invoke<SettingsSnapshot>("settings_set_ai_enabled", { enabled }),
  saveWorkspaceState: (activeMode, layoutJson) =>
    invoke<SettingsSnapshot>("settings_update_workspace", {
      activeMode,
      layoutJson,
    }),
  testProvider: (provider: ProviderId) =>
    invoke<SettingsSnapshot>("provider_test", { provider }),
  removeProvider: (provider: ProviderId) =>
    invoke<SettingsSnapshot>("provider_remove", { provider }),
};

/** Settings → About's IPC client (T22/T23). */
export const ipcAboutClient: AboutClient = {
  getLogPath: () => invoke<string>("get_log_path"),
};
