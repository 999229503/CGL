export type CloudData = {
  obras: unknown[];
  tarefas: unknown[];
  pessoas: unknown[];
  materiais: unknown[];
  despesas: unknown[];
  pagamentos: unknown[];
};

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  user: { id: string; email?: string };
};

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "");
const SESSION_KEY = "obracontrol_auth_session_v1";

export const cloudConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

function ensureConfigured() {
  if (!cloudConfigured) {
    throw new Error(
      "O acesso online ainda não foi configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY."
    );
  }
}

async function request(path: string, options: RequestInit = {}, token?: string) {
  ensureConfigured();
  const headers = new Headers(options.headers);
  headers.set("apikey", SUPABASE_KEY);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
  const text = await response.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }

  if (!response.ok) {
    const message = typeof body === "object" && body !== null
      ? String((body as Record<string, unknown>).msg || (body as Record<string, unknown>).message || (body as Record<string, unknown>).error_description || "Erro na operação")
      : String(body || `Erro HTTP ${response.status}`);
    throw new Error(message);
  }
  return body;
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const session = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: email.trim(), password }),
  }) as AuthSession;
  const withExpiry = {
    ...session,
    expires_at: session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(withExpiry));
  return withExpiry;
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function readSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as AuthSession : null;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<AuthSession | null> {
  const current = readSession();
  if (!current) return null;

  const expiresAt = Number(current.expires_at || 0);
  if (expiresAt > Math.floor(Date.now() / 1000) + 60) return current;

  try {
    const refreshed = await request("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: current.refresh_token }),
    }) as AuthSession;
    const next = {
      ...refreshed,
      expires_at: refreshed.expires_at || Math.floor(Date.now() / 1000) + Number(refreshed.expires_in || 3600),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    return next;
  } catch {
    clearSession();
    return null;
  }
}

export async function logout(session: AuthSession | null) {
  try {
    if (session?.access_token) {
      await request("/auth/v1/logout", { method: "POST" }, session.access_token);
    }
  } catch {
    // A sessão local ainda deve ser encerrada mesmo se a rede estiver indisponível.
  } finally {
    clearSession();
  }
}

export async function loadCloudData(session: AuthSession): Promise<{ data: CloudData | null; updatedAt: string | null }> {
  const rows = await request(
    `/rest/v1/obracontrol_data?select=data,updated_at&user_id=eq.${encodeURIComponent(session.user.id)}&limit=1`,
    { method: "GET" },
    session.access_token
  ) as Array<{ data: CloudData; updated_at: string }>;

  const row = rows?.[0];
  return { data: row?.data || null, updatedAt: row?.updated_at || null };
}

export async function saveCloudData(session: AuthSession, data: CloudData): Promise<string> {
  const updatedAt = new Date().toISOString();
  await request(
    "/rest/v1/obracontrol_data",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: session.user.id, data, updated_at: updatedAt }),
    },
    session.access_token
  );
  return updatedAt;
}
