import type { ContractedSnapshot, PendingPlanUpdate } from "./plans";

/** Persisted commercial fields; unknown extension fields remain preserved on updates. */
export type StoredTenantPlan = Record<string, unknown> & {
  planId?: string;
  name?: string;
  price?: string;
  quotaLimit?: number;
  maxOperators?: number;
  maxWhatsappConnections?: number;
  isSuspended?: boolean;
  dueDate?: string;
  contractedAt?: string;
  contractedPlan?: ContractedSnapshot;
  pendingPlanUpdate?: PendingPlanUpdate;
  monthlyQuotaUsed?: Record<string, number>;
};

export type StoredTenantConfig = Record<string, unknown> & {
  plan?: StoredTenantPlan;
  suspension?: { isSuspended?: boolean; publicReason?: string; internalNote?: string; updatedAt?: string; actor?: string };
  usageCounters?: { trialUsed?: number; monthly?: Record<string, number> };
  conversationTags?: Record<string, string>;
  conversationPriorities?: Record<string, "low" | "normal" | "high" | "urgent">;
  ai_settings?: Record<string, unknown>;
  tagHistory?: Array<Record<string, unknown>>;
  teamOperators?: Array<Record<string, unknown>>;
  quickReplies?: Array<Record<string, unknown>>;
  satisfactionSurveys?: Array<Record<string, unknown>>;
  upgradeRequests?: Array<Record<string, unknown>>;
  paymentHistory?: Array<Record<string, unknown>>;
};
