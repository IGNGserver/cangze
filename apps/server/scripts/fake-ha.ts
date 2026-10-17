// 开发用：启动内存版 Home Assistant（WebSocket + 少量 REST）与规则驱动的 OpenAI 兼容假模型，
// 便于没有真实 HA 和模型密钥时调试界面。
//   pnpm --filter @cangze/server fake-ha     → 打印地址与令牌
import { FakeHa, FAKE_TOKEN } from '../test/fake-ha.ts';
import { FakeLlm } from '../test/fake-llm.ts';

const ha = await new FakeHa().start(Number(process.env.FAKE_HA_PORT ?? 0));
const llm = await new FakeLlm().start(Number(process.env.FAKE_LLM_PORT ?? 0));
process.stdout.write(
  `fake Home Assistant on ${ha.url}\ntoken: ${FAKE_TOKEN}\nfake OpenAI-compatible model API on ${llm.url} (models: fake-1, fake-vision; no key needed)\n`,
);

// Make the home feel alive: the hall motion sensor and temperature change every few seconds.
setInterval(() => {
  const motion = ha.state('binary_sensor.hall_motion');
  ha.humanSet('binary_sensor.hall_motion', motion?.state === 'on' ? 'off' : 'on');
  const t = Number(ha.state('sensor.living_temperature')?.state ?? 20);
  ha.setState('sensor.living_temperature', (t + (Math.random() - 0.5) * 0.4).toFixed(1), undefined, {
    id: crypto.randomUUID(),
    user_id: null,
    parent_id: null,
  });
}, 5000);
