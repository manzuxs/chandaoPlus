import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import type { WorkspaceProfile } from "@chandaoplus/shared"

export class WorkspaceStore {
  constructor(private readonly filePath: string) {}

  async list(): Promise<WorkspaceProfile[]> {
    try {
      const raw = await readFile(this.filePath, "utf8")
      return JSON.parse(raw) as WorkspaceProfile[]
    } catch {
      return []
    }
  }

  async get(id: string): Promise<WorkspaceProfile | undefined> {
    return (await this.list()).find((item) => item.id === id)
  }

  async save(profile: WorkspaceProfile): Promise<void> {
    const current = await this.list()
    const next = [...current.filter((item) => item.id !== profile.id), profile]
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(next, null, 2), "utf8")
  }

  async delete(id: string): Promise<void> {
    const current = await this.list()
    const next = current.filter((item) => item.id !== id)
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(next, null, 2), "utf8")
  }
}
