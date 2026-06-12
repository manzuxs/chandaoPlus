import { z } from "zod"

export const AgentKindSchema = z.enum(["claude-code", "codex"])
export const ChatCommandSchema = z.enum(["estimate"])

export const WorkspaceProfileSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  rootPath: z.string().min(1),
  defaultAgent: AgentKindSchema
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
  content: z.string().min(1)
})

export const ChatRequestSchema = z.object({
  workspaceId: z.string().min(1),
  agent: AgentKindSchema,
  command: ChatCommandSchema,
  page: PageCaptureSchema,
  messages: z.array(ChatMessageSchema).min(1)
})

export const ChatStreamChunkSchema = z.object({
  type: z.enum(["status", "text", "error", "done", "progress"]),
  content: z.string(),
  meta: z.record(z.string(), z.string()).optional()
})

export type AgentKind = z.infer<typeof AgentKindSchema>
export type ChatCommand = z.infer<typeof ChatCommandSchema>
export type WorkspaceProfile = z.infer<typeof WorkspaceProfileSchema>
export type PageImage = z.infer<typeof PageImageSchema>
export type PageCapture = z.infer<typeof PageCaptureSchema>
export type ChatMessage = z.infer<typeof ChatMessageSchema>
export type ChatRequest = z.infer<typeof ChatRequestSchema>
export type ChatStreamChunk = z.infer<typeof ChatStreamChunkSchema>
