export interface Command {
  id: string;
  label: string;
  keywords: string[];
  shortcut?: string;
  execute: () => void;
}

export class CommandRegistry {
  readonly #commands: Command[];

  constructor(commands: Command[]) {
    const ids = new Set<string>();
    const shortcuts = new Set<string>();

    for (const command of commands) {
      if (ids.has(command.id))
        throw new Error(`Duplicate command id: ${command.id}`);
      ids.add(command.id);

      if (command.shortcut) {
        const normalized = command.shortcut.toLowerCase();
        if (shortcuts.has(normalized))
          throw new Error(`Shortcut conflict: ${normalized}`);
        shortcuts.add(normalized);
      }
    }

    this.#commands = [...commands];
  }

  all() {
    return [...this.#commands];
  }

  search(query: string) {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return this.all();

    return this.#commands.filter((command) =>
      [command.label, ...command.keywords].some((value) =>
        value.toLocaleLowerCase().includes(normalized),
      ),
    );
  }

  execute(id: string) {
    const command = this.#commands.find((candidate) => candidate.id === id);
    if (!command) return false;
    command.execute();
    return true;
  }
}

/** Chords declared here become live bindings and palette hints (#34). */
const commandShortcuts: Record<string, string> = {
  "add-source": "Mod+Shift+V",
  "search-knowledge": "Mod+F",
};

const commandDefinitions = [
  ["add-source", "Add Source", ["capture", "ingest"]],
  ["open-note", "Open Note", ["markdown", "document"]],
  ["open-graph", "Open Graph", ["connections", "concepts"]],
  ["search-knowledge", "Search Knowledge", ["find", "retrieve"]],
  ["ask-knowledge", "Ask Knowledge", ["assistant", "question"]],
  ["open-source", "Open Source", ["provenance", "original"]],
  ["show-backlinks", "Show Backlinks", ["references", "links"]],
  ["show-connections", "Show Connections", ["related", "edges"]],
  ["create-note", "Create Note", ["new", "markdown"]],
  ["export-vault", "Export Vault", ["backup", "portable"]],
  ["switch-workspace", "Switch Workspace", ["vault", "change"]],
] as const;

export function createDefaultCommands(
  onCommand: (id: string) => void,
): Command[] {
  return commandDefinitions.map(([id, label, keywords]) => ({
    id,
    label,
    keywords: [...keywords],
    ...(commandShortcuts[id] ? { shortcut: commandShortcuts[id] } : {}),
    execute: () => {
      onCommand(id);
    },
  }));
}
