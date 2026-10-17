const list = (v: unknown) => (Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : '');

/** One-line human summary of a tool call for the collapsed tool chain row. */
export function toolSummary(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'ha_call_service': {
      const target = (args.target ?? {}) as Record<string, unknown>;
      const parts = ['entity_id', 'area_id', 'floor_id', 'device_id', 'label_id']
        .map((k) => list(target[k]))
        .filter(Boolean);
      const data =
        args.data && Object.keys(args.data as object).length ? ` ${JSON.stringify(args.data)}` : '';
      return `${String(args.domain)}.${String(args.service)}${parts.length ? ' → ' + parts.join(', ') : ''}${data}`;
    }
    case 'ha_search_entities':
      return [args.query, args.domain, args.area, args.floor, args.label].filter(Boolean).join(' · ');
    case 'ha_get_states':
      return list(args.entity_ids);
    case 'ha_history':
    case 'ha_logbook':
      return `${String(args.entity_id ?? '')} ${args.hours ? `(${String(args.hours)}h)` : ''}`.trim();
    case 'ha_list_services':
      return String(args.domain ?? '');
    case 'ha_render_template':
      return String(args.template ?? '').slice(0, 80);
    case 'ha_get_config':
    case 'ha_save_config':
    case 'ha_delete_config':
      return `${String(args.kind ?? '')} ${String(args.config_id ?? '')}`.trim();
    default: {
      const s = JSON.stringify(args);
      return s === '{}' ? '' : s.slice(0, 100);
    }
  }
}
