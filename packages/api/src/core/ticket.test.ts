/**
 * Follow-up to PR #425 (ENG-1671): short-lived HMAC stream tickets.
 *
 * Unit coverage for issue/validate: signature integrity, expiry, purpose
 * binding, single-use replay defense, and secret derivation/fail-closed.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  issueTicket,
  validateTicket,
  getTicketSecret,
  clearUsedTicketsForTests,
  TICKET_DEFAULT_TTL_MS,
} from "./ticket";

const ORIGINAL = {
  MULTIPLAI_API_KEY: process.env.MULTIPLAI_API_KEY,
  MULTIPLAI_API_KEYS: process.env.MULTIPLAI_API_KEYS,
  MULTIPLAI_TICKET_SECRET: process.env.MULTIPLAI_TICKET_SECRET,
};

beforeEach(() => {
  clearUsedTicketsForTests();
  delete process.env.MULTIPLAI_API_KEYS;
  delete process.env.MULTIPLAI_TICKET_SECRET;
  process.env.MULTIPLAI_API_KEY = "secret-key-1";
});

afterEach(() => {
  delete process.env.MULTIPLAI_API_KEY;
  delete process.env.MULTIPLAI_API_KEYS;
  delete process.env.MULTIPLAI_TICKET_SECRET;
  if (ORIGINAL.MULTIPLAI_API_KEY !== undefined)
    process.env.MULTIPLAI_API_KEY = ORIGINAL.MULTIPLAI_API_KEY;
  if (ORIGINAL.MULTIPLAI_API_KEYS !== undefined)
    process.env.MULTIPLAI_API_KEYS = ORIGINAL.MULTIPLAI_API_KEYS;
  if (ORIGINAL.MULTIPLAI_TICKET_SECRET !== undefined)
    process.env.MULTIPLAI_TICKET_SECRET = ORIGINAL.MULTIPLAI_TICKET_SECRET;
});

describe("getTicketSecret", () => {
  test("derives a secret from configured API keys", () => {
    expect(getTicketSecret()).not.toBeNull();
  });

  test("is order-independent across MULTIPLAI_API_KEYS CSV", () => {
    process.env.MULTIPLAI_API_KEYS = "a,b,c";
    const s1 = getTicketSecret()!.toString("hex");
    process.env.MULTIPLAI_API_KEYS = "c,b,a";
    const s2 = getTicketSecret()!.toString("hex");
    expect(s1).toBe(s2);
  });

  test("explicit MULTIPLAI_TICKET_SECRET overrides derivation", () => {
    const derived = getTicketSecret()!.toString("hex");
    process.env.MULTIPLAI_TICKET_SECRET = "an-independent-secret";
    const explicit = getTicketSecret()!.toString("hex");
    expect(explicit).not.toBe(derived);
  });

  test("returns null when nothing is configured (fail closed)", () => {
    delete process.env.MULTIPLAI_API_KEY;
    delete process.env.MULTIPLAI_API_KEYS;
    delete process.env.MULTIPLAI_TICKET_SECRET;
    expect(getTicketSecret()).toBeNull();
  });
});

describe("issueTicket / validateTicket", () => {
  test("a freshly issued ticket validates for its purpose", () => {
    const issued = issueTicket("ws")!;
    expect(issued).not.toBeNull();
    const res = validateTicket(issued.ticket, "ws");
    expect(res.valid).toBe(true);
  });

  test("default TTL is ~60s and expiresAt is in the future", () => {
    const now = Date.now();
    const issued = issueTicket("sse", undefined, now)!;
    expect(issued.expiresAt).toBe(now + TICKET_DEFAULT_TTL_MS);
  });

  test("expired ticket is rejected", () => {
    const now = 1_000_000;
    const issued = issueTicket("ws", 60_000, now)!;
    const res = validateTicket(issued.ticket, "ws", { now: now + 60_001 });
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("expired");
  });

  test("a ticket for one purpose does not validate for another", () => {
    const issued = issueTicket("ws")!;
    const res = validateTicket(issued.ticket, "sse");
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("bad_purpose");
  });

  test("tampering with the signature is rejected", () => {
    const issued = issueTicket("ws")!;
    const tampered =
      issued.ticket.slice(0, -1) + (issued.ticket.endsWith("A") ? "B" : "A");
    const res = validateTicket(tampered, "ws");
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("bad_signature");
  });

  test("tampering with the embedded expiry is rejected (signature covers exp)", () => {
    const issued = issueTicket("ws", 60_000, 1_000_000)!;
    const parts = issued.ticket.split(".");
    // Push exp far into the future but keep the original signature.
    parts[2] = String(Number(parts[2]) + 10_000_000);
    const forged = parts.join(".");
    const res = validateTicket(forged, "ws", { now: 1_000_001 });
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("bad_signature");
  });

  test("malformed tickets are rejected", () => {
    expect(validateTicket("", "ws").reason).toBe("malformed");
    expect(validateTicket("not-a-ticket", "ws").reason).toBe("malformed");
    expect(validateTicket("a.b.c.d", "ws").reason).toBe("malformed");
  });

  test("wrong version tag is rejected", () => {
    const issued = issueTicket("ws")!;
    const parts = issued.ticket.split(".");
    parts[0] = "v2";
    expect(validateTicket(parts.join("."), "ws").reason).toBe("bad_version");
  });

  test("single-use: markUsed rejects the second validation (replay)", () => {
    const issued = issueTicket("ws")!;
    expect(validateTicket(issued.ticket, "ws", { markUsed: true }).valid).toBe(
      true,
    );
    const replay = validateTicket(issued.ticket, "ws", { markUsed: true });
    expect(replay.valid).toBe(false);
    expect(replay.reason).toBe("replayed");
  });

  test("without markUsed the same ticket validates repeatedly (until expiry)", () => {
    const issued = issueTicket("ws")!;
    expect(validateTicket(issued.ticket, "ws").valid).toBe(true);
    expect(validateTicket(issued.ticket, "ws").valid).toBe(true);
  });

  test("a ticket signed under a different key set no longer validates (rotation)", () => {
    const issued = issueTicket("ws")!;
    // Rotate the API key -> derived secret changes -> old ticket invalid.
    process.env.MULTIPLAI_API_KEY = "rotated-key";
    const res = validateTicket(issued.ticket, "ws");
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("bad_signature");
  });

  test("validate fails closed when no secret is derivable", () => {
    const issued = issueTicket("ws")!;
    delete process.env.MULTIPLAI_API_KEY;
    delete process.env.MULTIPLAI_API_KEYS;
    const res = validateTicket(issued.ticket, "ws");
    expect(res.valid).toBe(false);
    expect(res.reason).toBe("no_secret");
  });

  test("issueTicket returns null when no secret is derivable", () => {
    delete process.env.MULTIPLAI_API_KEY;
    delete process.env.MULTIPLAI_API_KEYS;
    expect(issueTicket("ws")).toBeNull();
  });
});
