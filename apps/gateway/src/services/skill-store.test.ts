import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { SkillStore } from "./skill-store"

describe("SkillStore", () => {
  let store: SkillStore
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "skill-store-test-"))
    store = new SkillStore(join(tmpDir, "skills.json"))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("provides built-in estimate, fix, and verify skills", async () => {
    const skills = await store.list()

    expect(skills.map((skill) => skill.id)).toEqual(expect.arrayContaining(["estimate", "fix", "verify"]))
    expect(await store.get("fix")).toMatchObject({
      id: "fix",
      name: "定位并修复问题",
      builtin: true,
      outputFormat: "markdown",
    })
    expect(await store.get("verify")).toMatchObject({
      id: "verify",
      name: "修复验收检查",
      builtin: true,
      outputFormat: "markdown",
    })
  })

  it("prevents deleting new built-in skills", async () => {
    await expect(store.delete("fix")).rejects.toThrow("Cannot delete builtin skill")
    await expect(store.delete("verify")).rejects.toThrow("Cannot delete builtin skill")
  })
})
