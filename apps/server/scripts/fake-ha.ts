// 开发用：启动一个内存版 Home Assistant（WebSocket + 少量 REST），便于没有真实 HA 时调试界面。
//   pnpm --filter @cangze/server fake-ha     → 打印地址与令牌
import { FakeHa, FAKE_TOKEN } from '../test/fake-ha.ts';

const ha = await new FakeHa().start();
process.stdout.write(`fake Home Assistant on ${ha.url}\ntoken: ${FAKE_TOKEN}\n`);

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
