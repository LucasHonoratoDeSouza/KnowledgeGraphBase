export type ProviderId = "openai" | "anthropic" | "deepseek";
export type HealthStatus = "untested" | "healthy" | "unhealthy";

export interface ProviderConnection {
  provider: ProviderId;
  endpoint: string;
  credentialStatus: "configured_masked";
  health: HealthStatus;
}

export interface ModelProfile {
  id: string;
  provider: ProviderId;
  displayName: string;
  enabled: boolean;
}

export type AiConfiguration = SettingsSnapshot["ai"];

export interface SettingsSnapshot {
  setupComplete: boolean;
  vaultName: string | null;
  activeMode: "Ingest" | "Retrieve";
  layoutJson: string;
  aiEnabled: boolean;
  providers: ProviderConnection[];
  ai: {
    models: ModelProfile[];
    routing: {
      mainModelId: string | null;
      assistantDefaultModelId: string | null;
      explicitFallbackModelId: string | null;
    };
    budgets: {
      dailyCents: number;
      monthlyCents: number;
    };
    privacy: {
      allowSourceContent: boolean;
      storePrompts: boolean;
    };
  };
}

export interface OnboardingRequest {
  vault:
    | { kind: "create"; parentPath: string; vaultName: string }
    | { kind: "open_existing"; vaultPath: string };
  aiEnabled: boolean;
  provider: ProviderId | null;
  endpoint: string | null;
  credential: string | null;
  mainModelId: string | null;
  dailyBudgetCents: number;
  monthlyBudgetCents: number;
  layoutJson: string;
}

export interface ProviderConnectRequest {
  provider: ProviderId;
  endpoint: string;
  credential: string;
}

export interface SettingsClient {
  getSettings(): Promise<SettingsSnapshot>;
  completeOnboarding(request: OnboardingRequest): Promise<SettingsSnapshot>;
  connectProvider(request: ProviderConnectRequest): Promise<SettingsSnapshot>;
  rotateProvider(
    provider: ProviderId,
    credential: string,
  ): Promise<SettingsSnapshot>;
  saveAiConfiguration(
    configuration: AiConfiguration,
  ): Promise<SettingsSnapshot>;
  saveWorkspaceState(
    activeMode: SettingsSnapshot["activeMode"],
    layoutJson: string,
  ): Promise<SettingsSnapshot>;
  testProvider(provider: ProviderId): Promise<SettingsSnapshot>;
  removeProvider(provider: ProviderId): Promise<SettingsSnapshot>;
}
