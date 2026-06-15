import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { ChatMessage, Session, SessionListItem } from "@chandaoplus/shared";

interface SessionRecord {
  id: string;
  workspaceId: string;
  title?: string;
  messages: ChatMessage[];
  contextBundleDirs?: string[];
  createdAt: string;
  updatedAt: string;
  codexThreadId?: string;
}

export class SessionStore {
  private filePath: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(storePath?: string) {
    this.filePath = storePath ?? path.join(os.homedir(), ".chandaoplus", "sessions.json");
  }

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => fn());
    this.queue = run.then(() => {}, () => {});
    return run;
  }

  private async readAll(): Promise<SessionRecord[]> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  private async writeAll(records: SessionRecord[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(records, null, 2), "utf-8");
  }

  async create(workspaceId: string, title?: string): Promise<Session> {
    return this.withLock(async () => {
      const records = await this.readAll();
      const now = new Date().toISOString();
      const record: SessionRecord = {
        id: crypto.randomUUID(),
        workspaceId,
        title,
        messages: [],
        createdAt: now,
        updatedAt: now,
      };
      records.push(record);
      await this.writeAll(records);
      return { ...record };
    });
  }

  async get(sessionId: string): Promise<Session | undefined> {
    const records = await this.readAll();
    const record = records.find((r) => r.id === sessionId);
    return record ? { ...record } : undefined;
  }

  async listByWorkspace(workspaceId: string): Promise<SessionListItem[]> {
    const records = await this.readAll();
    return records
      .filter((r) => r.workspaceId === workspaceId)
      .map((r) => ({
        id: r.id,
        workspaceId: r.workspaceId,
        title: r.title,
        messageCount: r.messages.length,
        lastMessage: r.messages.length > 0 ? r.messages[r.messages.length - 1].content.slice(0, 80) : undefined,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async appendMessage(sessionId: string, message: ChatMessage): Promise<void> {
    return this.withLock(async () => {
      const records = await this.readAll();
      const record = records.find((r) => r.id === sessionId);
      if (!record) throw new Error(`Session ${sessionId} not found`);
      record.messages.push(message);
      record.updatedAt = new Date().toISOString();
      await this.writeAll(records);
    });
  }

  async updateTitle(sessionId: string, title: string): Promise<void> {
    return this.withLock(async () => {
      const records = await this.readAll();
      const record = records.find((r) => r.id === sessionId);
      if (!record) throw new Error(`Session ${sessionId} not found`);
      record.title = title;
      record.updatedAt = new Date().toISOString();
      await this.writeAll(records);
    });
  }

  async updateCodexThreadId(sessionId: string, codexThreadId: string): Promise<void> {
    return this.withLock(async () => {
      const records = await this.readAll();
      const record = records.find((r) => r.id === sessionId);
      if (!record) throw new Error(`Session ${sessionId} not found`);
      record.codexThreadId = codexThreadId;
      record.updatedAt = new Date().toISOString();
      await this.writeAll(records);
    });
  }

  async delete(sessionId: string): Promise<void> {
    return this.withLock(async () => {
      const records = await this.readAll();
      const idx = records.findIndex((r) => r.id === sessionId);
      if (idx === -1) throw new Error(`Session ${sessionId} not found`);
      const record = records[idx];
      records.splice(idx, 1);
      await this.writeAll(records);
      if (record.contextBundleDirs?.length) {
        await Promise.allSettled(
          record.contextBundleDirs.map((dir) => rm(dir, { recursive: true, force: true }))
        );
      }
    });
  }

  async addContextBundleDir(sessionId: string, bundleDir: string): Promise<void> {
    return this.withLock(async () => {
      const records = await this.readAll();
      const record = records.find((r) => r.id === sessionId);
      if (!record) throw new Error(`Session ${sessionId} not found`);
      if (!record.contextBundleDirs) record.contextBundleDirs = [];
      record.contextBundleDirs.push(bundleDir);
      await this.writeAll(records);
    });
  }
}
