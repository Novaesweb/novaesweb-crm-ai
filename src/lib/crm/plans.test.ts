import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PLANS,
  TRIAL_PLAN,
  CATALOG_SCHEMA_VERSION,
  buildFeatureGovernanceMap,
  TECHNICAL_FEATURES,
  normalizeCatalogPlan,
} from "./plans";
import {
  expectedSlotInstanceName,
  extractSlotFromInstanceName,
  buildTenantWhatsappSlots,
} from "./whatsapp-slots";

describe("Etapa 2 & 3 — Estrutura Oficial dos Planos Comerciais", () => {
  it("deve ter CATALOG_SCHEMA_VERSION >= 2 e migrar catálogos legados automaticamente", () => {
    assert.ok(CATALOG_SCHEMA_VERSION >= 2);
    const legacyBusiness = normalizeCatalogPlan({
      id: "crm-business",
      name: "CRM Business",
      price: "149,00",
      quotaLimit: 500,
      maxOperators: 3,
      maxWhatsappConnections: 1,
      description: "Legado",
      features: ["ai_chat", "human_handoff"],
      featureBullets: [],
      status: "active",
      version: 1,
      updated_at: "2026-01-01T00:00:00Z",
    });
    assert.equal(legacyBusiness.price, "99,90");
    assert.equal(legacyBusiness.quotaLimit, 600);
    assert.equal(legacyBusiness.maxWhatsappConnections, 3);
    assert.equal(legacyBusiness.maxOperators, 3);
    assert.ok(legacyBusiness.features.includes("conversation_priority"));
    assert.ok(legacyBusiness.features.includes("satisfaction_survey"));
  });

  it("deve definir Teste Grátis (7 dias) com 100 atendimentos, 1 WhatsApp, 1 operador e recursos do Business", () => {
    assert.equal(TRIAL_PLAN.id, "crm-trial");
    assert.equal(TRIAL_PLAN.price, "0,00");
    assert.equal(TRIAL_PLAN.quotaLimit, 100);
    assert.equal(TRIAL_PLAN.durationDays, 7);
    assert.equal(TRIAL_PLAN.maxWhatsappConnections, 1);
    assert.equal(TRIAL_PLAN.maxOperators, 1);
    assert.ok(TRIAL_PLAN.features.includes("business_hours"));
    assert.ok(TRIAL_PLAN.features.includes("commercial_tags"));
    assert.ok(TRIAL_PLAN.features.includes("conversation_priority"));
    assert.ok(TRIAL_PLAN.features.includes("satisfaction_survey"));
    assert.ok(!TRIAL_PLAN.features.includes("advanced_reports"));
  });

  it("deve definir CRM Start (R$ 59,90, 200 atendimentos, 1 WhatsApp, 1 operador)", () => {
    const start = DEFAULT_PLANS.find((p) => p.id === "crm-start");
    assert.ok(start);
    assert.equal(start.price, "59,90");
    assert.equal(start.quotaLimit, 200);
    assert.equal(start.maxWhatsappConnections, 1);
    assert.equal(start.maxOperators, 1);
    assert.ok(start.features.includes("ai_chat"));
    assert.ok(start.features.includes("human_handoff"));
    assert.ok(start.features.includes("simulator"));
    assert.ok(start.features.includes("business_hours_basic"));
    assert.ok(start.features.includes("quick_replies"));
    assert.ok(start.features.includes("basic_indicators"));
    assert.ok(!start.features.includes("commercial_tags"));
    assert.ok(!start.features.includes("advanced_reports"));
  });

  it("deve definir CRM Business (R$ 99,90, 600 atendimentos, 3 WhatsApps, 3 operadores)", () => {
    const business = DEFAULT_PLANS.find((p) => p.id === "crm-business");
    assert.ok(business);
    assert.equal(business.price, "99,90");
    assert.equal(business.quotaLimit, 600);
    assert.equal(business.maxWhatsappConnections, 3);
    assert.equal(business.maxOperators, 3);
    assert.ok(business.features.includes("business_hours"));
    assert.ok(business.features.includes("commercial_tags"));
    assert.ok(business.features.includes("handoff_summary"));
    assert.ok(business.features.includes("sound_notifications"));
    assert.ok(business.features.includes("model_fallback"));
    assert.ok(business.features.includes("conversation_priority"));
    assert.ok(business.features.includes("satisfaction_survey"));
    assert.ok(business.features.includes("commercial_indicators"));
    assert.ok(!business.features.includes("advanced_reports"));
  });

  it("deve definir CRM Premium (R$ 159,90, 1.500 atendimentos, 5 WhatsApps, 5 operadores)", () => {
    const premium = DEFAULT_PLANS.find((p) => p.id === "crm-premium");
    assert.ok(premium);
    assert.equal(premium.price, "159,90");
    assert.equal(premium.quotaLimit, 1500);
    assert.equal(premium.maxWhatsappConnections, 5);
    assert.equal(premium.maxOperators, 5);
    assert.ok(premium.features.includes("advanced_reports"));
    assert.ok(premium.features.includes("satisfaction_analytics"));
    assert.ok(premium.features.includes("operator_indicators"));
    assert.ok(premium.features.includes("advanced_commercial_filters"));
    assert.equal(premium.features.length, TECHNICAL_FEATURES.length);
  });
});

describe("Etapa 4 — Governança dos 4 Estados das Funcionalidades", () => {
  it("deve retornar allowed para recursos do Start e locked_by_plan para Business/Premium", () => {
    const start = DEFAULT_PLANS.find((p) => p.id === "crm-start")!;
    const gov = buildFeatureGovernanceMap(start.features, false);

    assert.equal(gov.ai_chat.state, "allowed");
    assert.equal(gov.quick_replies.state, "allowed");
    assert.equal(gov.commercial_tags.state, "locked_by_plan");
    assert.equal(gov.commercial_tags.minPlanName, "CRM Business");
    assert.equal(gov.advanced_reports.state, "locked_by_plan");
    assert.equal(gov.advanced_reports.minPlanName, "CRM Premium");
  });

  it("deve retornar suspended com motivo público quando a empresa estiver suspensa administrativamente", () => {
    const premium = DEFAULT_PLANS.find((p) => p.id === "crm-premium")!;
    const gov = buildFeatureGovernanceMap(
      premium.features,
      true,
      "Mensalidade em aberto. Contate o financeiro."
    );

    assert.equal(gov.ai_chat.state, "suspended");
    assert.equal(gov.ai_chat.reason, "Mensalidade em aberto. Contate o financeiro.");
  });

  it("deve retornar maintenance quando uma funcionalidade estiver em manutenção técnica", () => {
    const business = DEFAULT_PLANS.find((p) => p.id === "crm-business")!;
    const gov = buildFeatureGovernanceMap(
      business.features,
      false,
      undefined,
      ["model_fallback"]
    );

    assert.equal(gov.model_fallback.state, "maintenance");
    assert.equal(gov.commercial_tags.state, "allowed");
  });
});

describe("Etapa 5 — Cinco Espaços de WhatsApp e Downgrade Seguro", () => {
  it("deve gerar nomes de instância determinísticos para os 5 espaços e extrair o slot corretamente", () => {
    assert.equal(expectedSlotInstanceName("Pizzaria Sabor", 1), "loja_pizzaria_sabor");
    assert.equal(expectedSlotInstanceName("Pizzaria Sabor", 2), "loja_pizzaria_sabor_2");
    assert.equal(expectedSlotInstanceName("Pizzaria Sabor", 5), "loja_pizzaria_sabor_5");

    assert.equal(extractSlotFromInstanceName("loja_pizzaria_sabor"), 1);
    assert.equal(extractSlotFromInstanceName("loja_pizzaria_sabor_3"), 3);
    assert.equal(extractSlotFromInstanceName("loja_pizzaria_sabor_5"), 5);
  });

  it("deve liberar 1/5 no Start, 3/5 no Business e 5/5 no Premium", () => {
    const startSlots = buildTenantWhatsappSlots("Loja A", [], {
      maxWhatsappConnections: 1,
      isSuspended: false,
    });
    assert.equal(startSlots.length, 5);
    assert.equal(startSlots.filter((s) => s.unlocked).length, 1);
    assert.equal(startSlots[1].status, "locked");
    assert.equal(startSlots[1].minPlanName, "CRM Business");
    assert.equal(startSlots[3].status, "locked");
    assert.equal(startSlots[3].minPlanName, "CRM Premium");

    const businessSlots = buildTenantWhatsappSlots("Loja B", [], {
      maxWhatsappConnections: 3,
      isSuspended: false,
    });
    assert.equal(businessSlots.filter((s) => s.unlocked).length, 3);
    assert.equal(businessSlots[2].status, "disconnected");
    assert.equal(businessSlots[3].status, "locked");

    const premiumSlots = buildTenantWhatsappSlots("Loja C", [], {
      maxWhatsappConnections: 5,
      isSuspended: false,
    });
    assert.equal(premiumSlots.filter((s) => s.unlocked).length, 5);
  });

  it("deve pausar canais excedentes (pausedByDowngrade = true) ao reduzir de Business (3) para Start (1) preservando histórico", () => {
    const downgradedSlots = buildTenantWhatsappSlots(
      "Loja Downgrade",
      [
        { id: "ch1", instance_name: "loja_loja_downgrade", status: "connected" },
        { id: "ch2", instance_name: "loja_loja_downgrade_2", status: "paused" },
      ],
      {
        maxWhatsappConnections: 1,
        isSuspended: false,
      }
    );

    assert.equal(downgradedSlots[0].status, "connected");
    assert.equal(downgradedSlots[0].unlocked, true);
    assert.equal(downgradedSlots[1].status, "paused");
    assert.equal(downgradedSlots[1].pausedByDowngrade, true);
    assert.equal(downgradedSlots[1].unlocked, false);
  });
});
