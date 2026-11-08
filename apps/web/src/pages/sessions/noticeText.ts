import type { TFunction } from 'i18next';

export interface SessionNotice {
  level: string;
  title: string;
  body: string;
  code?: unknown;
  data?: unknown;
}

const titleKeys: Record<string, string> = {
  reply_failed: 'chat.notice.replyFailed',
  automatic_continuation_paused: 'chat.notice.automaticContinuationPaused',
  report_continuation_unavailable: 'chat.notice.reportContinuationUnavailable',
  task_report: 'chat.notice.taskReport',
  report_unavailable: 'chat.notice.reportUnavailable',
};

const bodyKeys: Record<string, string> = {
  automatic_continuation_paused: 'chat.notice.automaticContinuationPausedBody',
  report_continuation_unavailable: 'chat.notice.reportContinuationUnavailableBody',
  report_unavailable: 'chat.notice.reportUnavailableBody',
};

const titleCodes: Record<string, string> = {
  'Reply failed': 'reply_failed',
  'Automatic continuation paused': 'automatic_continuation_paused',
  'Report received; continuation unavailable': 'report_continuation_unavailable',
  'Task report': 'task_report',
  'Report unavailable': 'report_unavailable',
};

function translated(t: TFunction, key: string, fallback: string): string {
  const value = t(key);
  return value === key ? fallback : value;
}

function noticeCode(notice: SessionNotice): string | undefined {
  if (typeof notice.code === 'string') return notice.code;
  if (typeof notice.data === 'object' && notice.data !== null) {
    const code = (notice.data as Record<string, unknown>).code;
    if (typeof code === 'string') return code;
  }
  return titleCodes[notice.title];
}

function statusText(t: TFunction, status: string): string {
  const key = `agents.status.${status}`;
  return translated(t, key, status);
}

/** Translate stable notice codes (and the legacy English titles) without translating user/model text. */
export function localizeNotice(t: TFunction, notice: SessionNotice): { title: string; body: string } {
  const code = noticeCode(notice);
  let title = code && titleKeys[code] ? translated(t, titleKeys[code]!, notice.title) : notice.title;
  const body = code && bodyKeys[code] ? translated(t, bodyKeys[code]!, notice.body) : notice.body;

  // Agent reports historically had no notice code; their data.status is stable and safe to translate.
  const data =
    typeof notice.data === 'object' && notice.data !== null
      ? (notice.data as Record<string, unknown>)
      : undefined;
  const status = typeof data?.status === 'string' ? data.status : undefined;
  if (notice.level === 'report' && status) {
    const separator = notice.title.indexOf(' · ');
    const prefix = separator >= 0 ? notice.title.slice(0, separator) : notice.title;
    const suffix =
      status === 'succeeded'
        ? translated(t, 'chat.notice.taskReport', 'task report')
        : translated(t, 'chat.notice.runStatus', 'run {{status}}').replace(
            '{{status}}',
            statusText(t, status),
          );
    title = `${prefix}${separator >= 0 ? ' · ' : ' '}${suffix}`;
  }

  return { title, body };
}
