/** Converte snapshots de auditoria em alterações atômicas legíveis. */
export type AuditChange = { path: string; before: unknown; after: unknown };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function parseAuditValue(value: string): unknown {
  try { return JSON.parse(value); } catch { return value; }
}
const keyNames: Record<string, string> = {
  stages: 'Etapas', segments: 'Trechos', startChecklist: 'Checklist de Início', endChecklist: 'Checklist de Término',
  status: 'Status', statusAt: 'Data do Status', start: 'Previsão início', end: 'Previsão término',
  responsible: 'Responsável', note: 'Observação', guidance: 'Orientação', name: 'Nome',
  address: 'Endereço', city: 'Município', budget: 'Orçamento', priority: 'Prioridade',
  registro: 'Registro', createdAt: 'Data de cadastro', updatedAt: 'Última atualização',
};
const label = (key: string) => keyNames[key] || key;
const identity = (item: unknown, index: number): string => {
  if (!object(item)) return `Posição ${index + 1}`;
  return String(item.id ?? item.name ?? item.title ?? index);
};
const displayName = (item: unknown, index: number): string =>
  object(item) ? String(item.name || item.title || item.label || `Item ${index + 1}`) : `Item ${index + 1}`;
export function diffAudit(before: unknown, after: unknown, prefix = ''): AuditChange[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    const oldMap = new Map(before.map((item, i) => [identity(item, i), { item, i }]));
    const newMap = new Map(after.map((item, i) => [identity(item, i), { item, i }]));
    const keys = new Set([...oldMap.keys(), ...newMap.keys()]);
    return [...keys].flatMap((key) => {
      const oldItem = oldMap.get(key), newItem = newMap.get(key);
      const name = displayName(newItem?.item ?? oldItem?.item, newItem?.i ?? oldItem?.i ?? 0);
      const path = prefix ? `${prefix} · ${name}` : name;
      if (!oldItem) return [{ path: `${path} — Inclusão`, before: null, after: name }];
      if (!newItem) return [{ path: `${path} — Exclusão`, before: name, after: null }];
      return diffAudit(oldItem.item, newItem.item, path);
    });
  }
  if (object(before) && object(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].filter(k => k !== 'id').flatMap(k => diffAudit(before[k], after[k], prefix ? `${prefix} — ${label(k)}` : label(k)));
  }
  // Evita expor snapshots de objetos ou arrays na interface.
  if (object(before) || object(after) || Array.isArray(before) || Array.isArray(after)) {
    if (before == null || after == null) return [{ path: prefix || 'Registro', before: before == null ? '—' : 'Existente', after: after == null ? '—' : 'Cadastrado' }];
    return [{ path: prefix || 'Registro', before: 'Alterado', after: 'Atualizado' }];
  }
  return [{ path: prefix || 'Registro', before, after }];
}
export function auditRows(field: string, before: unknown, after: unknown): AuditChange[] {
  if (field === 'UPDATE' || field === 'ADMIN_UPDATE') return diffAudit(before, after);
  if (field === 'INSERT' || field === 'CREATE') return [{ path: 'Cadastro', before: '—', after: 'Cadastrado' }];
  if (field === 'DELETE') return [{ path: 'Exclusão', before: 'Existente', after: 'Excluído' }];
  return diffAudit(before, after, label(field));
}
export function displayAuditValue(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4);
  if (typeof value === 'object') return 'Alterado';
  return String(value);
}
