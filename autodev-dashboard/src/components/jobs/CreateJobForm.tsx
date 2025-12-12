import React, { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

export type Job = {
  id: string;
  repository: string;
  issueNumbers: number[];
  status?: string;
  createdAt?: string;
};

export class ApiClientError extends Error {
  public readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

const apiClient = {
  async createJob(params: { repository: string; issueNumbers: number[] }): Promise<Job> {
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const data: unknown = await res.json();
        if (data && typeof data === "object" && "message" in data && typeof (data as any).message === "string") {
          message = (data as any).message;
        }
      } catch {
        // Ignore JSON parsing errors; fall back to generic message.
      }
      throw new ApiClientError(message, res.status);
    }

    return (await res.json()) as Job;
  },
};

export function parseIssueNumbers(input: string): {
  issueNumbers: number[];
  invalidTokens: string[];
} {
  const rawTokens = input
    .split(/[\s,]+/g)
    .map((t) => t.trim())
    .filter(Boolean);

  const issueNumbers: number[] = [];
  const invalidTokens: string[] = [];
  const seen = new Set<number>();

  for (const token of rawTokens) {
    if (!/^\d+$/.test(token)) {
      invalidTokens.push(token);
      continue;
    }

    const n = Number.parseInt(token, 10);
    if (!Number.isFinite(n) || n <= 0) {
      invalidTokens.push(token);
      continue;
    }

    if (!seen.has(n)) {
      seen.add(n);
      issueNumbers.push(n);
    }
  }

  return { issueNumbers, invalidTokens };
}

export type CreateJobFormProps = {
  repositories: string[];
  onSuccess: (job: Job) => void;
  onCancel: () => void;
  initialRepository?: string;
  initialIssueNumbers?: string;
};

export function CreateJobForm({
  repositories,
  onSuccess,
  onCancel,
  initialRepository,
  initialIssueNumbers,
}: CreateJobFormProps) {
  const [repository, setRepository] = useState<string>(
    initialRepository ?? repositories[0] ?? ""
  );
  const [issueNumbersText, setIssueNumbersText] = useState<string>(initialIssueNumbers ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parsed = useMemo(() => parseIssueNumbers(issueNumbersText), [issueNumbersText]);

  const canSubmit = repository.trim().length > 0 && parsed.issueNumbers.length > 0 && !isSubmitting;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMessage(null);

    const repo = repository.trim();
    if (!repo) {
      setErrorMessage("Please select a repository.");
      return;
    }

    const { issueNumbers, invalidTokens } = parsed;
    if (invalidTokens.length > 0) {
      setErrorMessage(
        `Invalid issue number${invalidTokens.length === 1 ? "" : "s"}: ${invalidTokens.join(", ")}`
      );
      return;
    }

    if (issueNumbers.length === 0) {
      setErrorMessage("Please enter at least one valid issue number.");
      return;
    }

    setIsSubmitting(true);
    try {
      const job = await apiClient.createJob({
        repository: repo,
        issueNumbers,
      });
      onSuccess(job);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrorMessage(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("An unknown error occurred.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="create-job-form" style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <label htmlFor="repository" style={{ fontWeight: 600 }}>
          Repository
        </label>
        <select
          id="repository"
          value={repository}
          onChange={(e) => setRepository(e.target.value)}
          disabled={isSubmitting}
          style={{ padding: "8px 10px" }}
        >
          <option value="" disabled>
            Select a repository
          </option>
          {repositories.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <label htmlFor="issueNumbers" style={{ fontWeight: 600 }}>
          Issue numbers
        </label>
        <textarea
          id="issueNumbers"
          value={issueNumbersText}
          onChange={(e) => setIssueNumbersText(e.target.value)}
          disabled={isSubmitting}
          rows={4}
          placeholder="e.g. 12, 34 56\n78"
          style={{ padding: "8px 10px", resize: "vertical" }}
        />
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Separate values with commas, spaces, or newlines.
        </div>
      </div>

      <div
        className="issue-preview"
        style={{
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 6,
          padding: 12,
          display: "grid",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <div style={{ fontWeight: 600 }}>Preview</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{parsed.issueNumbers.length} issue(s)</div>
        </div>

        {parsed.issueNumbers.length === 0 ? (
          <div style={{ fontSize: 12, opacity: 0.7 }}>No valid issue numbers yet.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {parsed.issueNumbers.map((n) => (
              <span
                key={n}
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "rgba(0,0,0,0.06)",
                  fontSize: 12,
                }}
              >
                #{n}
              </span>
            ))}
          </div>
        )}

        {parsed.invalidTokens.length > 0 ? (
          <div style={{ fontSize: 12, color: "#b00020" }}>
            Invalid token{parsed.invalidTokens.length === 1 ? "" : "s"}: {parsed.invalidTokens.join(", ")}
          </div>
        ) : null}
      </div>

      {errorMessage ? (
        <div
          role="alert"
          style={{
            border: "1px solid rgba(176, 0, 32, 0.35)",
            background: "rgba(176, 0, 32, 0.06)",
            color: "#b00020",
            borderRadius: 6,
            padding: 10,
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => onCancel()}
          disabled={isSubmitting}
          style={{ padding: "8px 12px" }}
        >
          Cancel
        </button>
        <button type="submit" disabled={!canSubmit} style={{ padding: "8px 12px" }}>
          {isSubmitting ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Loader2 className="create-job-form__spinner" size={16} style={{ animation: "spin 1s linear infinite" }} />
              Creating…
            </span>
          ) : (
            "Create job"
          )}
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </form>
  );
}

export default CreateJobForm;