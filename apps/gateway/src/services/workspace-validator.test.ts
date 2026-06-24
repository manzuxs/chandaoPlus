import { describe, expect, it } from "vitest"
import os from "node:os"
import { validateWorkspaceRoot } from "./workspace-validator"

describe("validateWorkspaceRoot", () => {
  it("rejects non-absolute paths", () => {
    const result = validateWorkspaceRoot("relative/path")
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("绝对路径")
  })

  it("rejects home directory", () => {
    const result = validateWorkspaceRoot(os.homedir())
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("主目录")
  })

  it("rejects root directory", () => {
    const result = validateWorkspaceRoot("/")
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("根目录")
  })

  it("rejects /tmp", () => {
    const result = validateWorkspaceRoot("/tmp")
    expect(result.valid).toBe(false)
  })

  it("rejects /etc", () => {
    const result = validateWorkspaceRoot("/etc")
    expect(result.valid).toBe(false)
  })

  it("rejects /usr", () => {
    const result = validateWorkspaceRoot("/usr")
    expect(result.valid).toBe(false)
  })

  it("rejects shallow directory under home", () => {
    const result = validateWorkspaceRoot(os.homedir() + "/Desktop")
    expect(result.valid).toBe(false)
    expect(result.reason).toContain("层级过浅")
  })

  it("accepts deep project directory", () => {
    const result = validateWorkspaceRoot(os.homedir() + "/service/Claude/my-project")
    expect(result.valid).toBe(true)
  })

  it("accepts non-home project directory", () => {
    const result = validateWorkspaceRoot("/opt/projects/my-app")
    expect(result.valid).toBe(true)
  })
})
