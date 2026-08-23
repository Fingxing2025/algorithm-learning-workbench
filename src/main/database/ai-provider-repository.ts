import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'

import {
  aiProviderCapabilitiesSchema,
  aiProviderProtocolSchema,
  aiTaskKindSchema,
  type AiProviderProfile,
  type AiTaskRoute,
  type CreateAiProviderRequest,
  type UpdateAiProviderRequest,
} from '@core/contracts/ai-provider'

import type { AppDatabase } from './database'
import { aiProviderProfiles, aiTaskRoutes } from './schema'

export type AiProviderRecord = typeof aiProviderProfiles.$inferSelect

function parseRecord(record: AiProviderRecord): AiProviderProfile {
  return {
    baseUrl: record.baseUrl,
    capabilities: aiProviderCapabilitiesSchema.parse(JSON.parse(record.capabilitiesJson)),
    createdAt: record.createdAt,
    customHeaders: JSON.parse(record.customHeadersJson) as Record<string, string>,
    hasSecret: Boolean(record.secretRef),
    id: record.id,
    model: record.model,
    name: record.name,
    protocol: aiProviderProtocolSchema.parse(record.protocol),
    timeoutMs: record.timeoutMs,
    updatedAt: record.updatedAt,
  }
}

export class AiProviderRepository {
  constructor(private readonly database: AppDatabase) {}

  create(request: CreateAiProviderRequest, secretRef: string | null): AiProviderProfile {
    const now = new Date().toISOString()
    const id = randomUUID()
    this.database.orm
      .insert(aiProviderProfiles)
      .values({
        baseUrl: request.baseUrl,
        capabilitiesJson: JSON.stringify(request.capabilities),
        createdAt: now,
        customHeadersJson: JSON.stringify(request.customHeaders),
        id,
        model: request.model,
        name: request.name,
        protocol: request.protocol,
        secretRef,
        timeoutMs: request.timeoutMs,
        updatedAt: now,
      })
      .run()
    return parseRecord(this.getRecord(id)!)
  }

  delete(id: string): AiProviderRecord | undefined {
    const existing = this.getRecord(id)
    if (!existing) return undefined
    this.database.orm.delete(aiProviderProfiles).where(eq(aiProviderProfiles.id, id)).run()
    return existing
  }

  getRecord(id: string): AiProviderRecord | undefined {
    return this.database.orm
      .select()
      .from(aiProviderProfiles)
      .where(eq(aiProviderProfiles.id, id))
      .get()
  }

  getProviderForTask(task: AiTaskRoute['task']): AiProviderRecord | undefined {
    return this.database.orm
      .select({ provider: aiProviderProfiles })
      .from(aiTaskRoutes)
      .innerJoin(aiProviderProfiles, eq(aiTaskRoutes.providerId, aiProviderProfiles.id))
      .where(eq(aiTaskRoutes.task, task))
      .get()?.provider
  }

  list(): AiProviderProfile[] {
    return this.database.orm
      .select()
      .from(aiProviderProfiles)
      .orderBy(aiProviderProfiles.updatedAt)
      .all()
      .map(parseRecord)
      .reverse()
  }

  listRoutes(): AiTaskRoute[] {
    return this.database.orm
      .select()
      .from(aiTaskRoutes)
      .all()
      .map(route => ({
        providerId: route.providerId,
        task: aiTaskKindSchema.parse(route.task),
        updatedAt: route.updatedAt,
      }))
  }

  update(request: UpdateAiProviderRequest, secretRef: string | null): AiProviderProfile | null {
    const existing = this.getRecord(request.id)
    if (!existing) return null
    this.database.orm
      .update(aiProviderProfiles)
      .set({
        baseUrl: request.baseUrl,
        capabilitiesJson: JSON.stringify(request.capabilities),
        customHeadersJson: JSON.stringify(request.customHeaders),
        model: request.model,
        name: request.name,
        protocol: request.protocol,
        secretRef,
        timeoutMs: request.timeoutMs,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(aiProviderProfiles.id, request.id))
      .run()
    return parseRecord(this.getRecord(request.id)!)
  }

  upsertRoute(task: AiTaskRoute['task'], providerId: string): AiTaskRoute {
    const updatedAt = new Date().toISOString()
    this.database.orm
      .insert(aiTaskRoutes)
      .values({ providerId, task, updatedAt })
      .onConflictDoUpdate({
        set: { providerId, updatedAt },
        target: aiTaskRoutes.task,
      })
      .run()
    return { providerId, task, updatedAt }
  }
}
