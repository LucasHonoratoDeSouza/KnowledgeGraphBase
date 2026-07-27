import { useEffect, useState } from "react";

/**
 * Settings → About (T22/T23). T22 adds the log-path action; T23 extends
 * this component with version/channel and update observability.
 */
export interface AboutClient {
  getLogPath: () => Promise<string>;
}

interface AboutProps {
  client: AboutClient;
}

export function About({ client }: AboutProps) {
  const [logPath, setLogPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
    return () => {
      cancelled = true;
    };
  }, [client]);

  const handleCopyLogPath = () => {
    if (!logPath) return;
    void navigator.clipboard.writeText(logPath);
    setCopied(true);
  };

  return (
    <section aria-label="About">
      <h2>About</h2>
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
