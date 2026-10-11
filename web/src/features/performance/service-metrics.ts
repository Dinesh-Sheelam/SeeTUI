import type { ProcessRow, ServiceUnit, ServicesResponse } from "../../api/types";

const ALIASES: Record<string, string> = {
  "sshd.service": "sshd",
  "ssh.service": "sshd",
  "nginx.service": "nginx",
  "docker.service": "dockerd",
};

function processKey(proc: ProcessRow) {
  return proc.name || proc.command.split(/\s+/)[0] || "";
}

/** Service CPU and memory come from the same process sample as the process list. */
export function attachServiceMetrics(data: ServicesResponse | null, processes: ProcessRow[]): ServicesResponse | null {
  if (!data) return null;
  const byName = new Map<string, ProcessRow>();
  for (const proc of processes) {
    const key = processKey(proc);
    if (!key) continue;
    const prev = byName.get(key);
    if (!prev || proc.cpu > prev.cpu) byName.set(key, proc);
  }
  const services: ServiceUnit[] = data.services.map((unit) => {
    const stem = unit.name.replace(/\.service$/, "");
    const proc = byName.get(ALIASES[unit.name] || stem) || byName.get(stem);
    if (!proc) return { ...unit, cpu: 0, memory: 0, memory_bytes: 0 };
    return {
      ...unit,
      cpu: proc.cpu,
      memory: proc.mem,
      memory_bytes: (proc.rss || 0) * 1024,
      pid: proc.pid,
    };
  });
  return { ...data, services };
}
