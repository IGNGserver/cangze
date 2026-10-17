import { z } from 'zod';

export const ADMIN_KEY_MIN = 12;

export const AdminKey = z.string().min(ADMIN_KEY_MIN).max(256);

export const SetupRequest = z.object({
  bootstrapCode: z.string().min(4).max(64),
  /** Omit to let the hub generate a strong key, returned once in the response. */
  adminKey: AdminKey.optional(),
});
export const SetupResponse = z.object({
  ok: z.literal(true),
  generatedAdminKey: z.string().nullable(),
});

export const LoginRequest = z.object({ adminKey: z.string().min(1).max(256) });

export const AuthState = z.object({
  authenticated: z.boolean(),
  via: z.enum(['cookie', 'device']).nullable(),
  setupRequired: z.boolean(),
  deviceId: z.string().nullable(),
});
export type AuthState = z.infer<typeof AuthState>;

export const ChangeAdminKeyRequest = z.object({
  currentKey: z.string().min(1).max(256),
  newKey: AdminKey,
  revokeDevices: z.boolean().default(false),
});

export const DevicePlatform = z.enum(['android', 'ios', 'desktop', 'cli', 'other']);

export const DeviceToken = z.object({
  id: z.string(),
  name: z.string(),
  platform: DevicePlatform,
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  lastIp: z.string().nullable(),
  revoked: z.boolean(),
});
export type DeviceToken = z.infer<typeof DeviceToken>;

export const CreateDeviceTokenRequest = z.object({
  name: z.string().min(1).max(80),
  platform: DevicePlatform.default('other'),
});
export const CreatedDeviceToken = z.object({ device: DeviceToken, token: z.string() });

export const PairingCode = z.object({
  code: z.string(),
  expiresAt: z.string(),
  /** Value to encode in a QR code: `cangze://pair?origin=…&code=…`. */
  uri: z.string(),
});

export const ClaimPairingRequest = z.object({
  code: z.string().min(4).max(32),
  name: z.string().min(1).max(80),
  platform: DevicePlatform.default('other'),
});

export const WebSession = z.object({
  id: z.string(),
  current: z.boolean(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
});
