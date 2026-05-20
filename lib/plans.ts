import type { Plan } from "./supabase";

export interface PlanConfig {
  maxItems: number;
  maxPagesPerQuery: number;
  analisisPorMes: number;
  allowImage: boolean;
}

export const PLAN_CONFIG: Record<Plan, PlanConfig> = {
  free:    { maxItems: 15,  maxPagesPerQuery: 1, analisisPorMes: 1,  allowImage: false },
  starter: { maxItems: 100, maxPagesPerQuery: 2, analisisPorMes: 10, allowImage: false },
  pro:     { maxItems: 200, maxPagesPerQuery: 4, analisisPorMes: 30, allowImage: true  },
};
