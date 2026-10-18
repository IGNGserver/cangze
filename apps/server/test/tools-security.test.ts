import { describe, expect, it, vi } from 'vitest';
import type { HaGateway } from '../src/modules/ha/gateway.ts';
import { haTools } from '../src/modules/tools/ha-tools.ts';
import type { ToolEnv } from '../src/modules/tools/types.ts';

/** A gateway stub that fails the test if a request ever reaches Home Assistant. */
function stubGateway() {
  const rest = vi.fn(async () => new Response('{}'));
  const query = vi.fn(async () => ({ items: [] }));
  return { ha: { rest, query, isHaAdmin: true } as unknown as HaGateway, rest, query };
}

const env = {
  principal: { kind: 'admin' },
  runId: 'run_test',
  model: { input: ['text', 'image'] },
} as unknown as ToolEnv;

describe('entity ids in Home Assistant requests', () => {
  it('denies external statistics to a partially authorized agent', async () => {
    const { ha, query } = stubGateway();
    const tool = haTools(ha).find((t) => t.name === 'ha_statistics')!;
    await expect(
      tool.execute({ ...env, access: { readAll: false, canRead: () => false } }, {
        statistic_ids: ['external:private'],
        period: 'day',
      } as never),
    ).rejects.toMatchObject({ status: 403 });
    expect(query).not.toHaveBeenCalled();
  });
  const cases: Array<[tool: string, valid: string]> = [
    ['ha_camera_snapshot', 'camera.front_door'],
    ['ha_calendar_events', 'calendar.family'],
    ['ha_todo_items', 'todo.shopping'],
  ];

  it.each(cases)('%s rejects ids that are not canonical entity ids', async (name, valid) => {
    const { ha, rest, query } = stubGateway();
    const tool = haTools(ha).find((t) => t.name === name)!;
    const domain = valid.split('.')[0]!;
    for (const bad of [
      `${domain}.x/../../config/core`,
      `${domain}.x?token=1`,
      `${domain}.Front`,
      `${domain}.x#y`,
      `light.kitchen`,
      domain,
    ]) {
      await expect(tool.execute(env, { entity_id: bad } as never)).rejects.toMatchObject({ status: 400 });
    }
    expect(rest).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    await tool.execute(env, { entity_id: valid } as never).catch(() => undefined);
    expect(rest.mock.calls.length + query.mock.calls.length).toBe(1);
  });
});
