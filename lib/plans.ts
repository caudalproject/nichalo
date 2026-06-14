import type { Plan } from "./supabase";

export interface PlanConfig {
  maxItems: number;
  maxPagesPerQuery: number;
  analisisPorMes: number;
  allowImage: boolean;
}

export const PLAN_CONFIG: Record<Plan, PlanConfig> = {
  free:    { maxItems: 30,  maxPagesPerQuery: 1, analisisPorMes: 1,  allowImage: true },
  starter: { maxItems: 50,  maxPagesPerQuery: 1, analisisPorMes: 10, allowImage: true },
  pro:     { maxItems: 100, maxPagesPerQuery: 2, analisisPorMes: 30, allowImage: true  },
};
