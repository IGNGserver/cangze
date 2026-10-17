import { isIP } from 'node:net';

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function inV4(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
}

/** Expand an IPv6 address to 8 groups of 16 bits. */
function v6Groups(ip: string): number[] {
  const [head, tail] = ip.split('::') as [string, string | undefined];
  const h = head ? head.split(':') : [];
  const t = tail !== undefined && tail !== '' ? tail.split(':') : [];
  // embedded IPv4 (e.g. ::ffff:192.168.1.1)
  const last = (t.length ? t : h)[(t.length ? t : h).length - 1];
  let v4: number[] = [];
  if (last && last.includes('.')) {
    const n = v4ToInt(last);
    v4 = [n >>> 16, n & 0xffff];
    if (t.length) t.pop();
    else h.pop();
  }
  const fill = tail !== undefined ? 8 - h.length - t.length - v4.length : 0;
  return [...h, ...Array(Math.max(0, fill)).fill('0'), ...t]
    .map((g) => parseInt(g as string, 16) || 0)
    .concat(v4);
}

function inV6(ip: string, base: string, bits: number): boolean {
  const a = v6Groups(ip);
  const b = v6Groups(base);
  for (let i = 0; i < 8; i++) {
    const take = Math.max(0, Math.min(16, bits - i * 16));
    if (take === 0) return true;
    const mask = (0xffff << (16 - take)) & 0xffff;
    if (((a[i] ?? 0) & mask) !== ((b[i] ?? 0) & mask)) return false;
  }
  return true;
}

/** Strip an IPv4-mapped IPv6 prefix and zone id. */
export function normalizeIp(ip: string): string {
  let v = ip.trim();
  const zone = v.indexOf('%');
  if (zone >= 0) v = v.slice(0, zone);
  if (v.toLowerCase().startsWith('::ffff:') && isIP(v.slice(7)) === 4) return v.slice(7);
  return v;
}

export function inCidr(ip: string, cidr: string): boolean {
  const addr = normalizeIp(ip);
  const [base, bitsStr] = cidr.split('/') as [string, string | undefined];
  const fam = isIP(addr);
  const baseFam = isIP(base);
  if (!fam || fam !== baseFam) return false;
  const bits = bitsStr === undefined ? (fam === 4 ? 32 : 128) : Number(bitsStr);
  return fam === 4 ? inV4(addr, base, bits) : inV6(addr, base, bits);
}

const PRIVATE_RANGES = [
  '127.0.0.0/8',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '100.64.0.0/10',
  '169.254.0.0/16',
  '::1/128',
  'fc00::/7',
  'fe80::/10',
];

/** Loopback, RFC 1918, CGNAT, link-local and unique local addresses. */
export function isPrivateAddress(ip: string): boolean {
  return PRIVATE_RANGES.some((r) => inCidr(ip, r));
}
