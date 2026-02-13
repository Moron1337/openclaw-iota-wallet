import fs from "node:fs";
import path from "node:path";
import type { PreparedTransfer } from "./types.js";

type StoredDraft = {
  id: string;
  recipient: string;
  amountNanos: string;
  createdAt: number;
  expiresAt: number;
  approved: boolean;
  txBytes?: string;
  decodedTx?: unknown;
  signerAddress?: string;
  signature?: string;
};

function toStored(draft: PreparedTransfer): StoredDraft {
  return {
    ...draft,
    amountNanos: draft.amountNanos.toString(),
  };
}

function fromStored(draft: StoredDraft): PreparedTransfer {
  return {
    ...draft,
    amountNanos: BigInt(draft.amountNanos),
  };
}

function defaultStorePath(): string {
  const stateDir = process.env.OPENCLAW_STATE_DIR?.trim();
  if (stateDir) {
    return path.join(stateDir, "iota-wallet", "drafts.json");
  }
  return path.join(process.cwd(), ".iota-wallet", "drafts.json");
}

export class DraftStore {
  private readonly filePath: string;
  private readonly drafts = new Map<string, PreparedTransfer>();

  constructor(filePath?: string) {
    this.filePath = filePath ?? defaultStorePath();
    this.load();
  }

  private ensureDir(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) {
      return;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as StoredDraft[];
      if (!Array.isArray(raw)) {
        return;
      }
      for (const entry of raw) {
        if (entry && typeof entry.id === "string" && typeof entry.amountNanos === "string") {
          this.drafts.set(entry.id, fromStored(entry));
        }
      }
    } catch {
      // ignore corrupted store; plugin can continue with empty state
    }
  }

  private persist(): void {
    this.ensureDir();
    const tmpPath = `${this.filePath}.tmp`;
    const serialized = JSON.stringify(Array.from(this.drafts.values()).map(toStored), null, 2);
    fs.writeFileSync(tmpPath, serialized, "utf8");
    fs.renameSync(tmpPath, this.filePath);
  }

  get(id: string): PreparedTransfer | undefined {
    return this.drafts.get(id);
  }

  set(draft: PreparedTransfer): void {
    this.drafts.set(draft.id, draft);
    this.persist();
  }

  delete(id: string): boolean {
    const deleted = this.drafts.delete(id);
    if (deleted) {
      this.persist();
    }
    return deleted;
  }

  pruneExpired(now: number): number {
    let removed = 0;
    for (const [id, draft] of this.drafts.entries()) {
      if (now > draft.expiresAt) {
        this.drafts.delete(id);
        removed += 1;
      }
    }
    if (removed > 0) {
      this.persist();
    }
    return removed;
  }
}
