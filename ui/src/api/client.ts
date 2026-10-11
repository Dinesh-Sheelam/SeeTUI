import type {
  ConnectBody,
  ConnectEvent,
  EditorAvailability,
  EditorId,
  EditorOpenResult,
  FileEntry,
  HealthReport,
  RemoteEditActionResponse,
  RemoteEditOpenResponse,
  RemoteEditRestoreResponse,
  RemoteEditSaveResponse,
  ServerInfo,
  PortsResponse,
  ServicesResponse,
  Snapshot,
} from "./types";

export async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json() as { detail?: unknown };
    if (typeof data.detail === "string" && data.detail) return data.detail;
    if (Array.isArray(data.detail)) {
      const parts = data.detail.map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) return String(item.msg);
        return "";
      }).filter(Boolean);
      if (parts.length) return parts.join("; ");
    }
    return res.statusText;
  } catch {
    return res.statusText;
  }
}

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(await parseError(res));
  if (res.status === 204) return null as T;
  const type = res.headers.get("content-type") || "";
  if (type.includes("json")) return res.json() as Promise<T>;
  return res as T;
}

export async function readNdjson(res: Response, onEvent: (event: ConnectEvent) => void): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as ConnectEvent);
    }
  }
  if (buf.trim()) onEvent(JSON.parse(buf) as ConnectEvent);
}

function jsonBody(body: unknown): RequestInit {
  return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export function sessionApi(sessionId: string) {
  const base = `/api/sessions/${sessionId}`;
  return {
    files: (path: string) => api<{ path: string; entries: FileEntry[] }>(`${base}/files?path=${encodeURIComponent(path)}`),
    mkdir: (path: string) => api(`${base}/mkdir`, { method: "POST", ...jsonBody({ path }) }),
    rename: (src: string, dest: string) => api(`${base}/rename`, { method: "POST", ...jsonBody({ src, dest }) }),
    remove: (path: string, recursive = false) => api(`${base}/delete`, { method: "POST", ...jsonBody({ path, recursive }) }),
    preview: (path: string) => api<{ path: string; text: string }>(`${base}/preview?path=${encodeURIComponent(path)}`),
    writeFile: (path: string, content: string) => api(`${base}/write`, { method: "PUT", ...jsonBody({ path, content }) }),
    createFile: (path: string) => api(`${base}/create-file`, { method: "POST", ...jsonBody({ path }) }),
    archive: (body: { paths: string[]; format: string; archive_name: string }) =>
      api<{ command: string; path: string }>(`${base}/archive`, { method: "POST", ...jsonBody(body) }),
    extract: (body: { path: string }) => api<{ command: string; path: string }>(`${base}/extract`, { method: "POST", ...jsonBody(body) }),
    health: () => api<HealthReport>(`${base}/health`),
    previewFix: (id: string, inputs: Record<string, string>) =>
      api<{ title: string; description: string; risk: string; commands: string[] }>(
        `${base}/health/fixes/${id}/preview`,
        { method: "POST", ...jsonBody({ inputs }) },
      ),
    snapshot: () => api<Snapshot>(`${base}/performance/snapshot`),
    services: () => api<ServicesResponse>(`${base}/performance/services`),
    ports: () => api<PortsResponse>(`${base}/performance/ports`),
    serverInfo: () => api<ServerInfo>(`${base}/server-info`),
    saveInfo: (body: Record<string, string | boolean>) => api<ServerInfo>(`${base}/server-info`, { method: "PUT", ...jsonBody(body) }),
    editorStatus: () => api<EditorAvailability>(`${base}/editor`),
    openEditor: (body: { editor: EditorId; path: string; kind: "dir" | "file" }) =>
      api<EditorOpenResult>(`${base}/editor`, { method: "POST", ...jsonBody(body) }),
    disconnect: () => api(`${base}`, { method: "DELETE" }),
    downloadUrl: (path: string) => `${base}/download?path=${encodeURIComponent(path)}`,
    uploadUrl: (path: string) => `${base}/upload?path=${encodeURIComponent(path)}`,
    signalProcess: (pid: number, signal: "TERM" | "KILL", sudo_password?: string | null) =>
      api(`${base}/performance/processes/${pid}/signal`, {
        method: "POST",
        ...jsonBody({ signal, sudo_password: sudo_password ?? null, use_ssh_password: !sudo_password }),
      }),
    killPort: (body: {
      port: number;
      proto?: "tcp" | "udp";
      signal?: "TERM" | "KILL";
      force?: boolean;
      sudo_password?: string | null;
    }) =>
      api(`${base}/performance/ports/kill`, {
        method: "POST",
        ...jsonBody({
          proto: "tcp",
          signal: "TERM",
          ...body,
          use_ssh_password: !body.sudo_password,
        }),
      }),
    unitAction: (unit: string, action: "start" | "stop" | "restart", sudo_password?: string | null) =>
      api(`${base}/performance/units/action`, {
        method: "POST",
        ...jsonBody({ unit, action, sudo_password: sudo_password ?? null, use_ssh_password: !sudo_password }),
      }),
    remoteEditOpen: (path: string) =>
      api<RemoteEditOpenResponse>(`${base}/remote-edit/open`, { method: "POST", ...jsonBody({ path, use_ssh_password: true }) }),
    remoteEditSave: (body: { edit_id: string; content: string; exit_after?: boolean }) =>
      api<RemoteEditSaveResponse>(`${base}/remote-edit/save`, {
        method: "POST",
        ...jsonBody({ ...body, use_ssh_password: true }),
      }),
    remoteEditExit: (edit_id: string) =>
      api(`${base}/remote-edit/exit`, { method: "POST", ...jsonBody({ edit_id, use_ssh_password: true }) }),
    remoteEditValidate: (edit_id: string) =>
      api<RemoteEditActionResponse>(`${base}/remote-edit/validate`, {
        method: "POST",
        ...jsonBody({ edit_id, use_ssh_password: true }),
      }),
    remoteEditReload: (edit_id: string) =>
      api<RemoteEditActionResponse>(`${base}/remote-edit/reload`, {
        method: "POST",
        ...jsonBody({ edit_id, use_ssh_password: true }),
      }),
    remoteEditRestore: (edit_id: string) =>
      api<RemoteEditRestoreResponse>(`${base}/remote-edit/restore`, {
        method: "POST",
        ...jsonBody({ edit_id, use_ssh_password: true }),
      }),
  };
}

export function startConnect(body: ConnectBody): Promise<Response> {
  return fetch("/api/sessions", { method: "POST", ...jsonBody(body) });
}

export function chmodKey(path: string) {
  return api<{ command: string; mode: string }>("/api/local/chmod-key", { method: "POST", ...jsonBody({ path }) });
}

export function testConnect(body: ConnectBody) {
  return api<{ ok: boolean; uname?: string }>("/api/test-connect", { method: "POST", ...jsonBody(body) });
}
