import { z } from "zod"

export const AgentKindSchema = z.enum(["claude-code", "codex", "opencode", "antigravity", "qcode"])
export const ChatCommandSchema = z.string().min(1)

export const SkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  icon: z.string().default("⚡"),
  description: z.string().default(""),
  keywords: z.array(z.string()).default([]),
  promptTemplate: z.string().min(1),
  outputFormat: z.enum(["markdown", "json", "text"]).default("markdown"),
  builtin: z.boolean().default(false),
})

export const SkillConfigSchema = z.object({
  skills: z.array(SkillSchema),
})

export const WorkspaceProfileSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  rootPath: z.string().min(1),
  defaultAgent: AgentKindSchema,
  requiredFiles: z.array(z.string()).optional()
})

export const PageImageSchema = z.object({
  filename: z.string().min(1),
  alt: z.string().default(""),
  mimeType: z.string().min(1),
  sourceUrl: z.string().url(),
  base64Data: z.string() // Allow base64Data to be empty initially
})

export const PageCaptureSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  markdown: z.string().min(1),
  images: z.array(PageImageSchema),
  metadata: z.record(z.string(), z.string()).default({})
})

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  thinking: z.string().optional()
})

export const SessionSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string(),
  title: z.string().optional(),
  messages: z.array(ChatMessageSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  runningTaskId: z.string().optional(),
  runningStatus: z.enum(["running", "stopping"]).optional(),
  agent: AgentKindSchema.optional(),
  model: z.string().optional(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  permissionMode: z.enum(["ask", "auto", "full", "custom"]).optional(),
  summary: z.string().optional(),
})

export const SessionListItemSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string(),
  title: z.string().optional(),
  messageCount: z.number(),
  lastMessage: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  runningTaskId: z.string().optional(),
  runningStatus: z.enum(["running", "stopping"]).optional(),
})

export const CreateSessionRequestSchema = z.object({
  workspaceId: z.string(),
})

export const ChatRequestSchema = z.object({
  workspaceId: z.string().min(1),
  agent: AgentKindSchema,
  command: ChatCommandSchema,
  sessionId: z.string().uuid().optional(),
  page: PageCaptureSchema,
  messages: z.array(ChatMessageSchema).min(1),
  model: z.string().optional(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
  permissionMode: z.enum(["ask", "auto", "full", "custom"]).optional(),
})

export const ChatStreamChunkSchema = z.object({
  type: z.enum(["meta", "status", "text", "error", "done", "progress"]),
  content: z.string().default(""),
  sessionId: z.string().optional(),
  workspaceId: z.string().optional(),
  taskId: z.string().optional(),
  meta: z.record(z.string(), z.string()).optional()
})

export type AgentKind = z.infer<typeof AgentKindSchema>
export type ChatCommand = z.infer<typeof ChatCommandSchema>
export type WorkspaceProfile = z.infer<typeof WorkspaceProfileSchema>
export type PageImage = z.infer<typeof PageImageSchema>
export type PageCapture = z.infer<typeof PageCaptureSchema>
export type ChatMessage = z.infer<typeof ChatMessageSchema>
export type Session = z.infer<typeof SessionSchema>
export type SessionListItem = z.infer<typeof SessionListItemSchema>
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>
export type ChatRequest = z.infer<typeof ChatRequestSchema>
export type ChatStreamChunk = z.infer<typeof ChatStreamChunkSchema>
export type Skill = z.infer<typeof SkillSchema>
export type SkillConfig = z.infer<typeof SkillConfigSchema>
