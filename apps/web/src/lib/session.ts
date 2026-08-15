const STORAGE_KEY = "veritable:workspace";

export interface WorkspaceSession {
  assetLabel: string;
  assetName: string;
  tokenSymbol: string;
  periodKey: string;
  expectedAmount: string;
  evidenceBundle: string;
  claimId: string;
  attestationId: string;
  attestationTx: string;
  attestedAt: number;
  settled: boolean;
}

export const emptySession: WorkspaceSession = {
  assetLabel: "",
  assetName: "",
  tokenSymbol: "",
  periodKey: "",
  expectedAmount: "",
  evidenceBundle: "",
  claimId: "",
  attestationId: "",
  attestationTx: "",
  attestedAt: 0,
  settled: false,
};

export function loadSession(): WorkspaceSession {
  if (typeof window === "undefined") return emptySession;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...emptySession, ...JSON.parse(raw) as Partial<WorkspaceSession> } : emptySession;
  } catch {
    return emptySession;
  }
}

export function saveSession(session: WorkspaceSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function rememberEvidence(claimId: string, bundle: string) {
  if (typeof window === "undefined" || !claimId) return;
  window.localStorage.setItem(`veritable:evidence:${claimId}`, bundle);
}

export function recallEvidence(claimId: string) {
  if (typeof window === "undefined" || !claimId) return "";
  return window.localStorage.getItem(`veritable:evidence:${claimId}`) || "";
}
