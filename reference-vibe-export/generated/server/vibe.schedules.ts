// Scheduled tasks for this app. Lives under generated/server/ (server-side, where the agent writes
// server code) so the code-gen agent can write it. Each
// entry runs server-side when its schedule fires; the name + cron/every are registered on the app's
// Durable Object at deploy, and the DO calls this app's /_vibe/cron webhook to run the handler.
// cron is evaluated in the account's timezone. Empty default (seed) — the agent overwrites it.
//
// Example:
//   import { defineSchedule, db } from '@vibe/db/server';
//   export const schedules = [
//     defineSchedule({ name: 'dailyDigest', cron: '0 9 * * *', handler: async () => {
//       // ...read/write Vibe DB, send notifications, etc.
//     }}),
//     defineSchedule({ name: 'poll', every: '5m', handler: async ({ runId }) => { /* ... */ } }),
//   ];
import type { VibeSchedule } from '@vibe/db/server';

export const schedules: VibeSchedule[] = [];
