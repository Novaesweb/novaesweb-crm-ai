-- ============================================================================
-- NOVAES CRM IA — MIGRAÇÃO PREPARADA (NÃO APLICADA AUTOMATICAMENTE)
-- Data: 2026-11-07
-- Objetivo: Suporte opcional de schema e índices para:
--   1. Cinco espaços de WhatsApp por empresa (slot_index 1..5 em whatsapp_channels)
--   2. Prioridade de atendimento e pesquisa de satisfação em conversations
--   3. Solicitações de upgrade e histórico comercial auditável
-- Nota: O backend também opera de forma retrocompatível via JSONB (settings / metadata)
--       mesmo antes da aplicação desta migration no Supabase remoto.
-- ============================================================================

-- 1. Suporte explícito de slot_index (1..5) em whatsapp_channels
ALTER TABLE IF EXISTS public.whatsapp_channels
  ADD COLUMN IF NOT EXISTS slot_index smallint DEFAULT 1 CHECK (slot_index >= 1 AND slot_index <= 5),
  ADD COLUMN IF NOT EXISTS paused_reason text;

CREATE INDEX IF NOT EXISTS idx_whatsapp_channels_tenant_slot
  ON public.whatsapp_channels (tenant_id, slot_index);

-- 2. Índices para prioridade e etiquetas em conversations (metadata JSONB)
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_status_updated
  ON public.conversations (tenant_id, status, last_message_at DESC);

-- 3. Tabela opcional dedicada para Solicitações de Upgrade (além de tenants.settings->upgradeRequests)
CREATE TABLE IF NOT EXISTS public.crm_upgrade_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  current_plan_id text NOT NULL,
  requested_plan_id text NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by text,
  resolved_by text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_crm_upgrade_requests_tenant_status
  ON public.crm_upgrade_requests (tenant_id, status, requested_at DESC);

