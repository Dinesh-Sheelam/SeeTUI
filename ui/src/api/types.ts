export type AuthMethod = "password" | "key_path" | "key_content";
export type CheckStatus = "ok" | "warning" | "problem" | "unknown";

export type SessionMeta = {
  session_id: string;
  host: string;
  username: string;
  home: string;
  uname: string;
  port: number;
  fingerprint?: string;
  name?: string;
  server_id?: string;
};

export type ConnectBody = {
  host: string;
  port: number;
  username: string;
  auth_method: AuthMethod;
  password?: string | null;
  key_path?: string | null;
  key_content?: string | null;
  passphrase?: string | null;
};

export type ConnectEvent = {
  step: string;
  status: "running" | "ok" | "error";
  message?: string;
  session_id?: string;
  host?: string;
  username?: string;
  home?: string;
  uname?: string;
  fingerprint?: string;
  code?: string;
  key_path?: string;
  chmod_command?: string;
};

export type FileEntry = {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  size: number;
  mtime: number;
  permissions: string;
  kind: string;
};

export type HealthFix = { id: string; label: string; inputs?: string[] };

export type HealthCheck = {
  id: string;
  title: string;
  status: CheckStatus;
  summary: string;
  details?: string[];
  facts?: Record<string, unknown>;
  fixes?: HealthFix[];
};

export type HealthReport = {
  passing: number;
  total: number;
  critical: number;
  warning?: number;
  checks: HealthCheck[];
};

export type CertFact = {
  name?: string;
  status: CheckStatus;
  not_after?: string | null;
  days_remaining?: number | null;
};

export type ProcessRow = {
  pid: number;
  cpu: number;
  mem: number;
  command: string;
  name?: string;
  user?: string;
  ppid?: number;
  threads?: number;
  stat?: string;
  elapsed_seconds?: number;
  rss?: number;
};

export type MountRow = {
  mount: string;
  used_pct: number;
  filesystem?: string;
  size_bytes?: number;
  used_bytes?: number;
  avail_bytes?: number;
};

export type ConnRow = { state: string; local?: string; remote: string; remote_ip: string; process: string };

export type CpuCoreRow = { id: string; usage_pct: number };

export type DiskIoRow = {
  name: string;
  read_bps: number;
  write_bps: number;
  read_iops: number;
  write_iops: number;
  type?: string;
};

export type NetIfaceRow = {
  name: string;
  rx_bps: number;
  tx_bps: number;
  rx_bytes: number;
  tx_bytes: number;
  ipv4?: string;
};

export type Snapshot = {
  verdict: string;
  host?: {
    hostname?: string;
    uptime_seconds?: number;
    os_name?: string;
    kernel?: string;
    arch?: string;
    virtualization?: string;
    gateway?: string;
    dns?: string[];
    load1?: number;
    load5?: number;
    load15?: number;
  };
  cpu: {
    cpu_pct: number;
    user_pct?: number;
    system_pct?: number;
    iowait_pct?: number;
    cores?: CpuCoreRow[];
    info?: {
      model?: string;
      cores?: number | null;
      mhz?: number | null;
      cur_mhz?: number | null;
      base_mhz?: number | null;
      max_mhz?: number | null;
      temp_c?: number | null;
    };
  };
  memory: {
    used_pct: number;
    total_kb?: number;
    used_kb?: number;
    available_kb?: number;
    cached_kb?: number;
    buffers_kb?: number;
    swap_total_kb?: number;
    swap_used_kb?: number;
    pgfault?: number;
    pgmajfault?: number;
  };
  load: { load1: number; load5?: number; load15?: number };
  process_counts?: { total: number; running: number; root: number; user: number };
  processes: ProcessRow[];
  mounts: MountRow[];
  connections: ConnRow[];
  diskstats?: { read_sectors: number; write_sectors: number; name?: string }[];
  disk_io?: DiskIoRow[];
  netdev?: { rx: number; tx: number };
  net_ifaces?: NetIfaceRow[];
  net?: { listen_ports?: number[]; gateway?: string; dns?: string[] };
};

export type ServiceUnit = {
  name: string;
  description?: string;
  state: string;
  sub_state: string;
  cpu?: number;
  memory?: number;
  memory_bytes?: number;
  pid?: number;
};

export type ServicesResponse = {
  counts: { running: number; stopped: number; failed: number; other: number };
  services: ServiceUnit[];
};

export type PortPid = { pid: number; name: string; user?: string };

export type ListeningPort = {
  proto: string;
  address: string;
  host: string;
  port: number;
  pids: PortPid[];
};

export type PortsResponse = { listeners: ListeningPort[]; ssh_port: number };

export type ServerNote = {
  name: string;
  purpose: string;
  owner: string;
  contact: string;
  environment: string;
  notes: string;
};

export type ServerInfo = {
  note: ServerNote;
  location: string;
  facts: Record<string, string>;
};

export type SavedServer = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_method: AuthMethod;
  key_path?: string;
  password?: string;
  passphrase?: string;
  key_content?: string;
};

export type RecentConn = {
  host: string;
  port: number;
  username: string;
  auth_method: AuthMethod;
  key_path?: string;
};

export type EditorId = "code" | "cursor" | "antigravity" | "kiro" | "windsurf";

export type EditorOption = {
  id: EditorId;
  label: string;
  available: boolean;
};

export type EditorAvailability = {
  available: boolean;
  editors: EditorOption[];
};

export type EditorOpenResult = {
  ok: boolean;
  message: string;
};

export type RemoteEditActivity = { step: string; detail: string };

export type RemoteEditOpenResponse = {
  edit_id: string;
  path: string;
  text: string;
  sha256: string;
  uses_sudo: boolean;
  activity: RemoteEditActivity[];
  can_validate: boolean;
  can_reload: boolean;
};

export type RemoteEditSaveResponse = {
  ok: boolean;
  message: string;
  path: string;
  sha256: string;
  activity: RemoteEditActivity[];
};

export type RemoteEditActionResponse = {
  ok: boolean;
  detail: string;
  log: string[];
};

export type RemoteEditRestoreResponse = {
  ok: boolean;
  message: string;
  text: string;
  sha256: string;
};

export type TransferJob = {
  id: string;
  name: string;
  pct: number;
  status: "active" | "uploaded" | "downloaded" | "cancelled" | "failed";
  at: string;
};
