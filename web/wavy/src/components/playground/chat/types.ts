export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface ChatParams {
  temperature: number
  max_tokens: number
  top_p: number
}

export interface ChatSession {
  id: string
  title: string
  model: string
  systemPrompt: string
  params: ChatParams
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export const DEFAULT_PARAMS: ChatParams = {
  temperature: 0.7,
  max_tokens: 1024,
  top_p: 1,
}
