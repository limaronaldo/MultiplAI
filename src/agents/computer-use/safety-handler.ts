interface SafetyCheck {
  id: string;
  code: string;
  message: string;
}

interface SafetyResult {
  proceed: boolean;
  acknowledged?: SafetyCheck[];
  reason?: string;
}

class SafetyHandler {
  private allowlist: string[];

  constructor() {
    const env = process.env.CUA_ALLOWED_URLS;
    this.allowlist = env ? env.split(',').map(s => s.trim()) : ['localhost'];
  }

  private isUrlAllowed(currentUrl: string): boolean {
    try {
      const url = new URL(currentUrl);
      const hostname = url.hostname;
      for (const entry of this.allowlist) {
        if (entry.startsWith('http://') || entry.startsWith('https://')) {
          if (currentUrl.startsWith(entry)) return true;
        } else {
          if (hostname === entry || hostname.endsWith('.' + entry)) return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  handle(call: { pending_safety_checks?: SafetyCheck[] }, currentUrl: string): SafetyResult {
    const checks = call.pending_safety_checks ?? [];
    const acknowledged: SafetyCheck[] = [];
    let reason: string | undefined;
    let shouldBlock = false;

    for (const check of checks) {
      if (check.code === 'malicious_instructions' || check.code === 'sensitive_domain') {
        console.warn(`Blocked safety check: ${check.code} for URL: ${currentUrl}`);
        return { proceed: false, reason: `Blocked due to ${check.code}: ${check.message}` };
      } else if (check.code === 'irrelevant_domain') {
        if (this.isUrlAllowed(currentUrl)) {
          acknowledged.push(check);
        } else {
          console.warn(`Blocked safety check: ${check.code} for URL: ${currentUrl}`);
          return { proceed: false, reason: `Blocked due to ${check.code}: ${check.message}` };
        }
      } else {
        acknowledged.push(check);
      }
    }

    return { proceed: true, acknowledged };
  }
}

export { SafetyHandler, SafetyCheck, SafetyResult };