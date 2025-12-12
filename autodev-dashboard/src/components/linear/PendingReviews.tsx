import React from "react";
import { ExternalLink, Clock, GitPullRequest, CheckCircle } from "lucide-react";
import { usePendingReviews, type PendingReview } from "@/hooks/useLinear";

function formatWaitTime(dateString?: string): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const hours = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60),
  );
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h waiting`;
  return `${Math.floor(hours / 24)}d waiting`;
}

function ReviewCard({ review }: { review: PendingReview }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-1 rounded">
          {review.identifier}
        </span>
        {review.processedAt && (
          <span className="flex items-center gap-1 text-xs text-amber-400">
            <Clock className="w-3 h-3" />
            {formatWaitTime(review.processedAt)}
          </span>
        )}
      </div>

      <h4 className="text-white font-medium mb-2 line-clamp-2">
        {review.title}
      </h4>

      {review.githubRepo && review.githubIssueNumber && (
        <p className="text-xs text-slate-500 mb-3">
          {review.githubRepo} #{review.githubIssueNumber}
        </p>
      )}

      <div className="flex items-center gap-4 mt-4">
        {review.prUrl && (
          <a
            href={review.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300"
          >
            <GitPullRequest className="w-4 h-4" />
            View PR
          </a>
        )}
        {review.url && (
          <a
            href={review.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-slate-400 hover:text-white"
          >
            <ExternalLink className="w-4 h-4" />
            Linear
          </a>
        )}
      </div>
    </div>
  );
}

export function PendingReviews() {
  const { reviews, count, isLoading, error } = usePendingReviews();

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="animate-pulse bg-slate-900 border border-slate-800 rounded-xl h-32"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-red-400">
        <p>Failed to load pending reviews</p>
        <p className="text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <CheckCircle className="w-12 h-12 mx-auto mb-4 text-emerald-400" />
        <p className="text-lg text-white">No pending reviews</p>
        <p className="text-sm mt-2">All PRs have been reviewed!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Pending Reviews</h3>
        <span className="text-sm text-slate-400 bg-slate-800 px-2 py-1 rounded">
          {count} waiting
        </span>
      </div>
      {reviews.map((review) => (
        <ReviewCard key={review.id} review={review} />
      ))}
    </div>
  );
}

export default PendingReviews;
