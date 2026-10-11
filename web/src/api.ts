// API 客户端（与后端 schema 对齐的类型 + fetch 封装）
export interface Client {
  id: string; name: string; phone: string; address: string;
  phase: string; needs: string; note: string; progress: number;
  createdAt: string; updatedAt: string;
}
export interface Task {
  id: string; clientId: string; title: string; type: string;
  priority: string; status: string; due: string; note: string;
  createdAt: string; updatedAt: string;
}
export interface Appliance {
  id: string; clientId: string; brand?: string; model?: string; name?: string;
  w: number | null; d: number | null; h: number | null;
  ow: number | null; od: number | null; oh: number | null;
  cutout?: string; docUrl?: string; pageUrl?: string; note?: string;
}
export interface SiteRecord { id: string; clientId: string; type: string; date: string; note: string; }
export interface Meeting {
  id: string; clientId: string; date: string; attendees: string;
  topics: string; conclusion: string;
  followUps?: { id: string; text: string; due: string; done: number }[];
}
export interface FileRow {
  id: string; clientId: string; phase: string; kind: string; name: string;
  url: string; size: number; ext: string; version: string; note: string; date: string;
}
export interface CheckDef { key: string; text: string }
export interface ClientDetail {
  client: Client; tasks: Task[]; site: SiteRecord[]; appliances: Appliance[];
  check: { id: string; clientId: string; items: string } | null; files: FileRow[]; meetings: Meeting[];
}
export interface CatalogBrief {
  brand: string; category: string; model: string; name: string;
  w?: string | number | null; d?: string | number | null; h?: string | number | null;
  dimSource?: 'official' | 'official-label' | null;
  cutout: string | null; sizeRaw: string | null; docs: string | null; page: string | null;
}
export interface Dashboard {
  stats: { clients: number; openTasks: number; overdue: number; dueToday: number; doneRate: number };
  dueToday: Task[]; upcoming: Task[]; risks: string[]; recentClients: Client[];
}

const BASE = '';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(BASE + path, {
    headers: init?.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!r.ok && r.status !== 404) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export const apiGet = <T>(p: string) => req<T>(p);
export const apiPost = <T>(p: string, body?: unknown) =>
  req<T>(p, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const apiPatch = <T>(p: string, body: unknown) =>
  req<T>(p, { method: 'PATCH', body: JSON.stringify(body) });
export const apiPut = <T>(p: string, body: unknown) =>
  req<T>(p, { method: 'PUT', body: JSON.stringify(body) });
export const apiDelete = <T>(p: string) => req<T>(p, { method: 'DELETE' });
