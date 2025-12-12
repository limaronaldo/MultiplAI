import { useCallback, useEffect, useState } from "react";

export type PendingReview = {
  id: string;
  identifier: string;
  title: string;
  processedAt?: string;
  prUrl?: string;
  url?: string;
  githubRepo?: string;
  githubIssueNumber?: number;
};

type UsePendingReviewsResult = {
  reviews: PendingReview[];
  count: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
};

function getPendingReviewsFromResponse(
  response: unknown,
): PendingReview[] {
  if (Array.isArray(response)) {
    return response as PendingReview[];
  }

  if (!response || typeof response !== "object") return [];

  const record = response as Record<string, unknown>;
  const candidates = [
    record.reviews,
    record.pendingReviews,
    record.data,
    record.items,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as PendingReview[];
  }

  return [];
}

export function usePendingReviews(): UsePendingReviewsResult {
  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPendingReviews = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const client = (globalThis as unknown as { apiClient?: unknown })
        .apiClient as
        | {
            getPendingReviews?: () => Promise<unknown>;
          }
        | undefined;

      if (!client || typeof client.getPendingReviews !== "function") {
        throw new Error("apiClient.getPendingReviews is not available");
      }

      const response = await client.getPendingReviews();
      const nextReviews = getPendingReviewsFromResponse(response);
      setReviews(nextReviews);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setReviews([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPendingReviews();
  }, [fetchPendingReviews]);

  const refetch = useCallback(async () => {
    await fetchPendingReviews();
  }, [fetchPendingReviews]);

  return {
    reviews,
    count: reviews.length,
    isLoading,
    error,
    refetch,
  };
}
