import type { Plan } from "./supabase";

export interface PlanConfig {
  maxItems: number;
  maxPagesPerQuery: number;
  analisisPorMes: number;
  allowImage: boolean;
}

export const PLAN_CONFIG: Record<Plan, PlanConfig> = {
  free:    { maxItems: 10, maxPagesPerQuery: 1, analisisPorMes: 1,  allowImage: false },
  starter: { maxItems: 10, maxPagesPerQuery: 1, analisisPorMes: 10, allowImage: false },
  pro:     { maxItems: 10, maxPagesPerQuery: 1, analisisPorMes: 30, allowImage: true  },
};
