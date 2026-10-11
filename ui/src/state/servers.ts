import type { ConnectBody, SavedServer } from "../api/types";

export const SERVERS_KEY = "SeeTUI.servers";
const LEGACY_SERVERS_KEYS = ["seetui.servers", "VSC.servers"] as const;
export const SERVERS_EVENT = "SeeTUI-servers";

function readServersRaw(): string {
  const current = localStorage.getItem(SERVERS_KEY);
  if (current) return current;
  for (const key of LEGACY_SERVERS_KEYS) {
    const legacy = localStorage.getItem(key);
    if (legacy) return legacy;
  }
  return "[]";
}

export function loadServers(): SavedServer[] {
  try {
    const raw = JSON.parse(readServersRaw()) as SavedServer[];
    return Array.isArray(raw) ? raw.filter((item) => item?.id && item.host && item.username) : [];
  } catch {
    return [];
  }
}

export function saveServers(servers: SavedServer[]) {
  localStorage.setItem(SERVERS_KEY, JSON.stringify(servers.slice(0, 24)));
  for (const key of LEGACY_SERVERS_KEYS) localStorage.removeItem(key);
  window.dispatchEvent(new Event(SERVERS_EVENT));
}

export function upsertServer(server: SavedServer): SavedServer[] {
  const next = [server, ...loadServers().filter((item) => item.id !== server.id)];
  saveServers(next);
  return loadServers();
}

export function removeServer(id: string): SavedServer[] {
  const next = loadServers().filter((item) => item.id !== id);
  saveServers(next);
  return next;
}

export function serverBody(server: SavedServer): ConnectBody {
  return {
    host: server.host.trim(),
    port: server.port,
    username: server.username.trim(),
    auth_method: server.auth_method,
    password: server.password || null,
    key_path: server.auth_method === "key_path" ? server.key_path || null : null,
    key_content: server.auth_method === "key_content" ? server.key_content || null : null,
    passphrase: server.passphrase || null,
  };
}

export function missingSecret(server: SavedServer): string | null {
  if (!server.host.trim() || !server.username.trim()) return "Host and username are required";
  if (server.auth_method === "password" && !server.password) return "Password is required";
  if (server.auth_method === "key_path" && !server.key_path) return "Key path is required";
  if (server.auth_method === "key_content" && !server.key_content) return "PEM file is required";
  return null;
}
