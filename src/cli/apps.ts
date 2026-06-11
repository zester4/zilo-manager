import { printPanel, printTable } from './format.js';

type AppStatus = {
  configured: boolean;
  userId: string | null;
  sessionId: string | null;
  reusedSession: boolean;
  toolkits: Array<{ slug: string; name: string; isNoAuth: boolean; connected: boolean; status?: string }>;
};

export function printAppsStatus(status: AppStatus) {
  printPanel('Composio Apps', [
    ['Configured', status.configured ? 'yes' : 'no'],
    ['User', status.userId ?? 'not set'],
    ['Session', status.sessionId ?? 'none'],
    ['Session reused', status.reusedSession ? 'yes' : 'no'],
  ]);

  if (!status.configured) {
    console.log('Composio is optional. Run `zilmate setup` to add it, or keep using local tools.');
    return;
  }

  printTable(['App', 'Connected', 'Status'], status.toolkits.map((toolkit) => [
    toolkit.slug,
    toolkit.connected ? 'yes' : toolkit.isNoAuth ? 'no auth' : 'no',
    toolkit.status ?? toolkit.name,
  ]));
}
