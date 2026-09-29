// Public typed surface for @justworxcloud/sdk. Domain types are sourced from the generated
// OpenAPI types (`./types`) wherever the spec names them, so they stay in lockstep with the
// contract — regenerate with `npm run generate` whenever the API contract changes. A few
// response shapes (`WhoAmI`, `TimerStarted`, `TimerCancelled`) are hand-written below because
// /api/v2 defines them inline in the spec rather than as named component schemas.

import type { components } from './types.js';

export type DeviceSummary = components['schemas']['DeviceSummary'];
export type Device = components['schemas']['Device'];
export type IdState = components['schemas']['IdState'];
export type IdValue = components['schemas']['IdValue'];
export type IdTypeReported = components['schemas']['IdTypeReported'];
export type PinState = components['schemas']['PinState'];
export type Rule = components['schemas']['Rule'];
export type RuleCreate = components['schemas']['RuleCreate'];
export type RuleConfigured = components['schemas']['RuleConfigured'];
export type LogEntry = components['schemas']['LogEntry'];
export type LogEntryType = components['schemas']['LogEntryType'];
export type Sent = components['schemas']['Sent'];
export type Confirmed = components['schemas']['Confirmed'];
export type ValueWritten = components['schemas']['ValueWritten'];
export type RuleEnabledChanged = components['schemas']['RuleEnabledChanged'];

/** GET /me — not a named component schema in the spec, so this is hand-written. */
export interface WhoAmI {
  accountId: string;
  authType: 'api_key' | 'oauth2';
  /** The acting person, when an OAuth2 token was used. `null` for an API key. */
  userId: string | null;
  scopes: string[];
}

export interface JustworxOptions {
  /** A `jwx_live_…` API key, or an OAuth2 access token — either works. */
  apiKey: string;
  /** Defaults to https://api.justworx.com/api/v2 */
  baseUrl?: string;
  /** Custom fetch implementation (tests, proxies). */
  fetch?: typeof fetch;
}

export interface DevicePage {
  items: DeviceSummary[];
  nextCursor: string | null;
}

export interface ListDevicesQuery {
  /** Only devices that are currently online, or only those that are not. */
  online?: boolean;
  limit?: number;
  cursor?: string;
}

export interface DeviceLogQuery {
  /** ISO 8601. Defaults to 24 hours ago. */
  from?: string;
  /** ISO 8601. Defaults to now. */
  to?: string;
  type?: LogEntryType;
  idNumber?: number;
  ruleNumber?: number;
  limit?: number;
  cursor?: string;
}

export interface DeviceLogPage {
  serial: string;
  items: LogEntry[];
  nextCursor: string | null;
  at?: string;
}

/** Options shared by every write call. */
export interface WriteOptions {
  /** Wait for the device's real answer (sends `timeoutMs: 8000`). Omit for fire-and-forget (202 sent). */
  confirm?: boolean;
  /** Your own correlation id for the call, echoed back unchanged. */
  requestId?: string;
}

export interface SetIoOptions extends WriteOptions {
  /** Drive the ID directly and hold it, bypassing its configured timer or delay. */
  force?: boolean;
}

export interface PulseOptions extends WriteOptions {
  /** State to return to afterwards. Device default: low. */
  revertState?: PinState;
}

/** POST .../timer response shape — inline in the spec, not a named schema. */
export interface TimerStarted extends Confirmed {
  idNumber: number;
  value?: PinState;
  /** How long until the device reverts the pin. */
  revertsInMs?: number;
}

/** DELETE .../timer response shape — inline in the spec, not a named schema. */
export interface TimerCancelled extends Confirmed {
  idNumber: number;
  /** `null` means the ID existed but had no timer pending — nothing was cancelled. */
  restoredTo: PinState | null;
}

export type SetIoResult = ValueWritten | Sent;
export type PulseResult = TimerStarted | Sent;
export type CancelTimerResult = TimerCancelled | Sent;
export type SetRuleResult = RuleEnabledChanged | Sent;

export interface RulesPage {
  serial: string;
  items: Rule[];
  at?: string;
}

export type CreateRuleResult = RuleConfigured | Sent;

export interface RuleDeleted extends Confirmed {
  ruleNumber?: number;
}
export type DeleteRuleResult = RuleDeleted | Sent;

export interface RulesCleared extends Confirmed {
  /** How many rules were removed. */
  cleared: number;
  result?: 'ok';
}
export type ClearRulesResult = RulesCleared | Sent;

export interface ClearRulesOptions {
  /** REQUIRED — must be the literal `true`. Deletes every rule on the device; cannot be undone. */
  confirm: true;
  timeoutMs?: number;
  requestId?: string;
}

export class JustworxError extends Error {
  status: number;
  code: string;
  detail?: string;
}

export class Justworx {
  constructor(opts: JustworxOptions);

  /** Introspect the calling credential (account, auth type, scopes). */
  whoami(): Promise<WhoAmI>;

  /** One page of accessible devices. */
  listDevices(query?: ListDevicesQuery): Promise<DevicePage>;
  /** One device's full state — the twin. */
  getDevice(serial: string): Promise<Device>;
  /** Async-iterate ALL accessible devices, following cursors. */
  devices(query?: Omit<ListDevicesQuery, 'cursor'>): AsyncGenerator<DeviceSummary, void, unknown>;

  /** One page of a device's history (commands, replies, values, connection changes), newest first. */
  getDeviceLog(serial: string, query?: DeviceLogQuery): Promise<DeviceLogPage>;

  /** Write an ID's value (or fire a momentaryOutput/delayedOutput — the value is ignored on those). */
  setIo(serial: string, idNumber: number, value: PinState | number | string, opts?: SetIoOptions): Promise<SetIoResult>;
  /** Drive an ID for a fixed time, then revert. */
  pulseIo(serial: string, idNumber: number, value: PinState, durationMs: number, opts?: PulseOptions): Promise<PulseResult>;
  /** Cancel a pending timer on an ID. */
  cancelTimer(serial: string, idNumber: number, opts?: WriteOptions): Promise<CancelTimerResult>;
  /** Enable or disable a rule. Always send the state you want — there is no toggle. */
  setRule(serial: string, ruleNumber: number, enabled: boolean, opts?: WriteOptions): Promise<SetRuleResult>;

  /** List every rule stored on a device, in evaluation order. */
  listRules(serial: string): Promise<RulesPage>;
  /** Create a rule, or replace one by reusing its `ruleNumber`. */
  createRule(serial: string, rule: RuleCreate): Promise<CreateRuleResult>;
  /** Delete one rule by number. */
  deleteRule(serial: string, ruleNumber: number, opts?: WriteOptions): Promise<DeleteRuleResult>;
  /** Delete EVERY rule on a device. Cannot be undone — `confirm: true` is a required wire field, not the client-side `confirm` convenience used elsewhere in this SDK. */
  clearRules(serial: string, opts: ClearRulesOptions): Promise<ClearRulesResult>;

}
