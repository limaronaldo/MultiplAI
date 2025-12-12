import { useState, useEffect, useCallback } from "react";
import { API_BASE_URL } from "@/config/api";

export interface PendingReview {
  id: string;
  identifier: string;
  title: string;
  url: string;
  state: string;
  prUrl?: string;
  prTitle?: string;
  githubRepo?: string;
  githubIssueNumber?: number;
  processedAt?: string;
}

interface UsePendingReviewsResult {
  reviews: PendingReview[];
  count: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function usePendingReviews(): UsePendingReviewsResult {
  const [reviews, setReviews] = useState<PendingReview[]>([]);
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReviews = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`${API_BASE_URL}/api/review/pending`);

      if (!response.ok) {
        if (response.status === 503) {
          // Linear not configured - not an error
          setReviews([]);
          setCount(0);
          return;
        }
        throw new Error("Failed to fetch pending reviews");
      }

      const data = await response.json();
      setReviews(data.issues || []);
      setCount(data.count || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  return { reviews, count, isLoading, error, refetch: fetchReviews };
}
