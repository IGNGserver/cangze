import type { Notification } from '@cangze/contracts';
import { newId } from '../../core/ids.ts';
import { json, type Db } from '../../db/index.ts';
import type { StreamHub } from '../stream/hub.ts';

interface Row {
  id: string;
  kind: string;
  severity: Notification['severity'];
  title: string;
  body: string;
  data: string;
  created_at: number;
  read_at: number | null;
}

const toNotification = (r: Row): Notification => ({
  id: r.id,
  kind: r.kind,
  severity: r.severity,
  title: r.title,
  body: r.body,
  data: json.parse(r.data, {}),
  createdAt: new Date(r.created_at).toISOString(),
  readAt: r.read_at ? new Date(r.read_at).toISOString() : null,
});

/** Delivery channel for notifications outside the web UI (e.g. push to the Android app later). */
export interface NotificationChannel {
  name: string;
  deliver(n: Notification): Promise<void>;
}

/** In-app inbox. Every notification is also offered to registered channels. */
export class NotificationsService {
  private readonly channels: NotificationChannel[] = [];

  constructor(
    private readonly db: Db,
    private readonly stream: StreamHub,
  ) {}

  addChannel(c: NotificationChannel): void {
    this.channels.push(c);
  }

  create(input: {
    kind: string;
    severity?: Notification['severity'];
    title: string;
    body?: string;
    data?: Record<string, unknown>;
  }): Notification {
    const id = newId('ntf');
    this.db
      .prepare(
        'INSERT INTO notifications (id, kind, severity, title, body, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        input.kind,
        input.severity ?? 'info',
        input.title,
        input.body ?? '',
        json.stringify(input.data ?? {}),
        Date.now(),
      );
    const n = toNotification(this.db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) as Row);
    this.stream.publish('notifications', { kind: 'created', notification: n });
    for (const c of this.channels) void c.deliver(n).catch(() => undefined);
    // keep the inbox bounded
    this.db
      .prepare(
        'DELETE FROM notifications WHERE id NOT IN (SELECT id FROM notifications ORDER BY created_at DESC LIMIT 1000)',
      )
      .run();
    return n;
  }

  list(q: { unreadOnly?: boolean; limit?: number }): Notification[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM notifications ${q.unreadOnly ? 'WHERE read_at IS NULL' : ''} ORDER BY created_at DESC LIMIT ?`,
      )
      .all(q.limit ?? 50) as Row[];
    return rows.map(toNotification);
  }

  unreadCount(): number {
    return (
      this.db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE read_at IS NULL').get() as { n: number }
    ).n;
  }

  markRead(ids: string[] | 'all'): void {
    const now = Date.now();
    if (ids === 'all') this.db.prepare('UPDATE notifications SET read_at = ? WHERE read_at IS NULL').run(now);
    else
      for (const id of ids)
        this.db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL').run(now, id);
    this.stream.publish('notifications', { kind: 'read' });
  }
}
