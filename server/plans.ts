import { PlanId } from '../src/types';

/**
 * Feature flags gated per subscription plan. Every non-super-admin route that
 * corresponds to a gated feature must check `organization.features[flag]`
 * server-side (see server.ts requireFeature middleware) — never rely on the
 * frontend hiding a button.
 */
export interface PlanDefinition {
  id: PlanId;
  label: string;
  features: Record<string, boolean>;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  BASIC: {
    id: 'BASIC',
    label: 'Basic',
    features: {
      analytics: false,
      exports: false,
      multiUser: false,
      auditHistory: true,
      customReports: false,
    },
  },
  PRO: {
    id: 'PRO',
    label: 'Pro',
    features: {
      analytics: true,
      exports: true,
      multiUser: false,
      auditHistory: true,
      customReports: true,
    },
  },
  ENTERPRISE: {
    id: 'ENTERPRISE',
    label: 'Enterprise',
    features: {
      analytics: true,
      exports: true,
      multiUser: true,
      auditHistory: true,
      customReports: true,
    },
  },
};

export const DEFAULT_PLAN_ID: PlanId = 'BASIC';

export function getPlanFeatures(planId: PlanId): Record<string, boolean> {
  return { ...(PLANS[planId] || PLANS[DEFAULT_PLAN_ID]).features };
}
