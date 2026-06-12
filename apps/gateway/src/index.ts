import { createServer } from "./server"
import { PORT, WORKSPACE_STORE_PATH, SKILL_STORE_PATH } from "./config"
import { WorkspaceStore } from "./services/workspace-store"
import { SkillStore } from "./services/skill-store"
import { agentRegistry } from "./agents"

const workspaceStore = new WorkspaceStore(WORKSPACE_STORE_PATH)
const skillStore = new SkillStore(SKILL_STORE_PATH)

const app = createServer({
  workspaceStore,
  skillStore,
  agentRegistry
})

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Gateway is running at http://127.0.0.1:${PORT}`)
})
