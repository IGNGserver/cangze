import type { ToolDef, ToolRisk } from './types.ts';

export interface ToolInfo {
  name: string;
  label: string;
  description: string;
  risk: ToolRisk;
  group: ToolDef['group'];
}

/** All tools known to the hub. Main sessions get every tool; subagents get the ones their definition grants. */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDef>();

  register(defs: ToolDef[]): void {
    for (const d of defs) {
      if (this.tools.has(d.name)) throw new Error(`tool ${d.name} registered twice`);
      this.tools.set(d.name, d);
    }
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  all(): ToolDef[] {
    return [...this.tools.values()];
  }

  pick(names: string[]): ToolDef[] {
    return names.map((n) => this.tools.get(n)).filter((t): t is ToolDef => Boolean(t));
  }

  catalog(): ToolInfo[] {
    return this.all().map((t) => ({
      name: t.name,
      label: t.label,
      description: t.description,
      risk: t.risk,
      group: t.group,
    }));
  }
}
