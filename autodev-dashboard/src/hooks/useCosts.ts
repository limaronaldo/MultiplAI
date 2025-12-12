import { useState, useEffect, useCallback } from "react";
import { API_BASE_URL } from "@/config/api";

interface DayCost {
  date: string;
  cost: number;
  tokens: number;
}

interface AgentCost {
  cost: number;
  tokens: number;
  calls: number;
}

interface ModelCost {
  cost: number;
  tokens: number;
  calls: number;
}

export interface CostData {
  total: number;
  totalTokens: number;
  totalCalls: number;
  byDay: DayCost[];
  byAgent: Record<string, AgentCost>;
  byModel: Record<string, ModelCost>;
}

interface UseCostsResult {
  data: CostData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCosts(range: string = "30d"): UseCostsResult {
  const [data, setData] = useState<CostData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCosts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(
        `${API_BASE_URL}/api/analytics/costs?range=${range}`,
      );
      if (!response.ok) throw new Error("Failed to fetch costs");
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchCosts();
  }, [fetchCosts]);

  return { data, isLoading, error, refetch: fetchCosts };
}
