import { useEffect, useState } from "react";

/** The self-update path's current state (mirrors Rust's `UpdateStatus`, T23). */
export type UpdateStatus =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "pending_restart" }
  | { status: "failed"; message: string };

export interface AppInfo {
  version: string;
  channel: "stable" | "dev";
  updateStatus: UpdateStatus;
}

/**
 * Settings → About: version, channel, a non-modal pending-restart
 * indicator, surfaced update failures (T23), and the log-path action (T22).
 */
export interface AboutClient {
  getLogPath: () => Promise<string>;
  getAppInfo: () => Promise<AppInfo>;
  restart: () => Promise<void>;
}

interface AboutProps {
  client: AboutClient;
}

export function About({ client }: AboutProps) {
  const [logPath, setLogPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .getLogPath()
      .then((path) => {
        if (!cancelled) setLogPath(path);
      })
      .catch(() => {
        if (!cancelled) setLogPath(null);
      });
    client
      .getAppInfo()
      .then((info) => {
        if (!cancelled) setAppInfo(info);
      })
      .catch(() => {
        if (!cancelled) setAppInfo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const handleCopyLogPath = () => {
    if (!logPath) return;
    void navigator.clipboard.writeText(logPath);
    setCopied(true);
  };

  const handleRestart = () => {
    void client.restart();
  };

  return (
    <section aria-label="About">
      <h2>About</h2>

      {appInfo && (
        <p>
          Version {appInfo.version} · {appInfo.channel} channel
        </p>
      )}

      {appInfo?.updateStatus.status === "pending_restart" && (
        // Non-modal, non-blocking: a status region, not a dialog, so the
        // rest of the app stays fully interactive (MVP-48 AC1).
        <div role="status" aria-live="polite">
          An update has been installed.{" "}
          <button type="button" onClick={handleRestart}>
            Restart now
          </button>
        </div>
      )}

      {appInfo?.updateStatus.status === "failed" && (
        <div role="alert">Update failed: {appInfo.updateStatus.message}</div>
      )}

      <div>
        <p>
          Log file: <code>{logPath ?? "Resolving…"}</code>
        </p>
        <button type="button" onClick={handleCopyLogPath} disabled={!logPath}>
          {copied ? "Copied" : "Copy log path"}
        </button>
      </div>
    </section>
  );
}
