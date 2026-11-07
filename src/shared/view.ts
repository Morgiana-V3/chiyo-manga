import { z } from 'zod'

export const viewSchema = z.object({
  tool: z.enum(['select', 'hand', 'panel', 'knife', 'nodes', 'pen', 'white']).optional(),
  leftTab: z.enum(['assets', 'layers']).optional(),
  rightTab: z.enum(['properties', 'generation', 'agent']).optional(),
  zoom: z.number().min(0.05).max(4).optional(),
  fit: z.boolean().optional(),
  showGuides: z.boolean().optional(),
})
export type ViewOptions = z.infer<typeof viewSchema>

const point = z.tuple([z.number().min(-20000).max(20000), z.number().min(-20000).max(20000)])
export const canvasDragSchema = z.object({
  from: point,
  to: point,
  shift: z.boolean().default(false),
  step_delay_ms: z.number().int().min(20).max(200).default(40),
  expected_revision: z.number().int(),
  operation_id: z.string().uuid(),
})
export type CanvasDrag = z.infer<typeof canvasDragSchema>
