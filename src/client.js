// Runtime client for the Justworx API (/api/v2). Built on openapi-fetch, so every call is
// typed against the generated OpenAPI `paths` (see index.d.ts for the typed surface). This
// file is plain JS — the types are compile-time only and ship via the .d.ts + types.ts.

import createClient from 'openapi-fetch';

export class JustworxError extends Error {
  constructor(status, code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'JustworxError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

const DEFAULT_BASE = 'https://api.justworx.com/api/v2';

export class Justworx {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey  a jwx_live_… API key, or an OAuth2 access token — either works,
   *   the SDK just sends whatever bearer you give it.
   * @param {string} [opts.baseUrl]
   * @param {typeof fetch} [opts.fetch] custom fetch (tests, proxies)
   */
  constructor({ apiKey, baseUrl = DEFAULT_BASE, fetch } = {}) {
    if (!apiKey) throw new Error('Justworx: apiKey is required');
    this.raw = createClient({
      baseUrl,
      headers: { Authorization: `Bearer ${apiKey}` },
      ...(fetch ? { fetch } : {}),
    });
  }

  #unwrap({ data, error, response }) {
    if (error !== undefined) {
      const body = error || {};
      throw new JustworxError(response?.status ?? 0, body.error || `HTTP_${response?.status ?? 0}`, body.detail);
    }
    return data;
  }

  // ---- meta ----
  async whoami() {
    return this.#unwrap(await this.raw.GET('/me'));
  }

  // ---- devices ----
  async listDevices(query = {}) {
    return this.#unwrap(await this.raw.GET('/devices', { params: { query } }));
  }

  async getDevice(serial) {
    return this.#unwrap(await this.raw.GET('/devices/{serial}', { params: { path: { serial } } }));
  }

  /**
   * Async iterator over ALL accessible devices, transparently following cursors.
   * @example for await (const d of jwx.devices()) { ... }
   */
  async *devices(query = {}) {
    let cursor;
    do {
      const page = await this.listDevices({ ...query, ...(cursor ? { cursor } : {}) });
      for (const item of page.items) yield item;
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }

  // ---- device history ----
  /**
   * One page of a device's history, newest first — commands sent, replies received, values
   * reported, connections lost and regained. Reads stored data only: no command is sent, no
   * airtime is used, and it works for an offline device.
   *
   * Not to be confused with `GET /devices/{serial}/events`, which is that device's event
   * *notification settings* (enabled/verb/suffix/channel per event key), not its history.
   */
  async getDeviceLog(serial, query = {}) {
    return this.#unwrap(await this.raw.GET('/devices/{serial}/log', { params: { path: { serial }, query } }));
  }

  // ---- IO actuation ----
  // Every action is its own REST verb and path. `confirm: true` sends `timeoutMs: 8000`; `confirm`
  // itself never goes on the wire — it is a client-side convenience that chooses whether to send
  // `timeoutMs`.

  /**
   * Write an ID's value. Also how you *fire* a `momentaryOutput` or `delayedOutput` — the value
   * sent is ignored on those, and the timer/delay configured on the ID is what runs.
   * @param {object} [opts]
   * @param {boolean} [opts.confirm] wait for the device's real answer (sends timeoutMs: 8000)
   * @param {boolean} [opts.force] drive the ID directly and hold it, bypassing its configured timer/delay
   * @param {string} [opts.requestId] your own correlation id, echoed back unchanged
   */
  async setIo(serial, idNumber, value, { confirm = false, force, requestId } = {}) {
    return this.#unwrap(await this.raw.PUT('/devices/{serial}/ids/{idNumber}/value', {
      params: { path: { serial, idNumber } },
      body: {
        value,
        ...(force !== undefined ? { force } : {}),
        ...(confirm ? { timeoutMs: 8000 } : {}),
        ...(requestId ? { requestId } : {}),
      },
    }));
  }

  /**
   * Drive an ID for a fixed time, then revert — the device runs the timer itself, so the revert
   * still happens even if the network drops in between.
   * @param {object} [opts]
   * @param {'high'|'low'} [opts.revertState] state to return to afterwards (device default: low)
   * @param {boolean} [opts.confirm] wait for the device's confirmation that the timer started
   * @param {string} [opts.requestId] your own correlation id, echoed back unchanged
   */
  async pulseIo(serial, idNumber, value, durationMs, { revertState, confirm = false, requestId } = {}) {
    return this.#unwrap(await this.raw.POST('/devices/{serial}/ids/{idNumber}/timer', {
      params: { path: { serial, idNumber } },
      body: {
        value,
        durationMs,
        ...(revertState !== undefined ? { revertState } : {}),
        ...(confirm ? { timeoutMs: 8000 } : {}),
        ...(requestId ? { requestId } : {}),
      },
    }));
  }

  /**
   * Cancel a pending timer on an ID (a `momentaryOutput`/`delayedOutput` in flight, or a one-off
   * timed force-set). The pin is restored to the value it held immediately before the timer
   * started — not the timer's configured revert value.
   * @param {object} [opts]
   * @param {boolean} [opts.confirm] wait for the device's confirmation
   * @param {string} [opts.requestId] your own correlation id, echoed back unchanged
   */
  async cancelTimer(serial, idNumber, { confirm = false, requestId } = {}) {
    return this.#unwrap(await this.raw.DELETE('/devices/{serial}/ids/{idNumber}/timer', {
      params: { path: { serial, idNumber } },
      body: {
        ...(confirm ? { timeoutMs: 8000 } : {}),
        ...(requestId ? { requestId } : {}),
      },
    }));
  }

  /**
   * Enable or disable a rule, leaving its definition in place. Always send the state you want —
   * there is deliberately no toggle.
   * @param {object} [opts]
   * @param {boolean} [opts.confirm] wait for the device's confirmation
   * @param {string} [opts.requestId] your own correlation id, echoed back unchanged
   */
  async setRule(serial, ruleNumber, enabled, { confirm = false, requestId } = {}) {
    return this.#unwrap(await this.raw.PATCH('/devices/{serial}/rules/{ruleNumber}', {
      params: { path: { serial, ruleNumber } },
      body: {
        enabled,
        ...(confirm ? { timeoutMs: 8000 } : {}),
        ...(requestId ? { requestId } : {}),
      },
    }));
  }

  // ---- rules ----
  // A rule is logic that lives on the device itself -- evaluated continuously, no cloud round
  // trip, and it keeps working when the device is offline.

  /** List every rule stored on a device. */
  async listRules(serial) {
    return this.#unwrap(await this.raw.GET('/devices/{serial}/rules', { params: { path: { serial } } }));
  }

  /**
   * Create (or replace, if `rule.ruleNumber` is already in use) a rule. `rule` is a full
   * RuleCreate body: `{ ruleNumber, type: 'digital'|'analog'|'schedule', if: <condition>,
   * then: <action>, name?, enabled?, runIntervalMs?, onTrueJumpToRule?, onFalseJumpToRule?,
   * timeoutMs?, requestId? }` — see the OpenAPI spec's `RuleCreate` schema for the condition/action
   * shapes per type. Rule-management actions (createRule/deleteRule/clearRules) cannot themselves
   * be a rule's `then`.
   *
   * Schedule rules: `if: { startTime, endTime?, daysOfWeek?, startDate?, endDate? }`, all in the
   * device's local time (the platform converts to the device's UTC clock). On device firmware 8.13.0
   * and later `then` fires once at `startTime`, and an optional top-level `thenAtEnd` (same action
   * shapes as `then`) fires once at `endTime`; omit `endTime` for a start-only rule. Below 8.13.0
   * `then` fires on every check inside the window, and `thenAtEnd` or a missing `endTime` is
   * refused with 422.
   *
   * `then.type` in plain language, matching the same labels Justworx Studio's rule builder uses
   * rather than this SDK inventing its own wording:
   *   - `setState` — "Set an output"
   *   - `refreshId` — "Update this ID to the cloud" (one-shot forced read)
   *   - `enableRule` / `disableRule` — "Turn on/off another rule"
   *   - `getRules` — "Report this device's rules"
   *   - `createId` — "Configure a new IO" (new idNumber) / "Edit an existing IO" (existing one)
   *   - `deleteId` — "Delete an IO" (destructive)
   *   - `clearIds` — "Delete every IO" (destructive, unrecoverable, needs `confirm: true`)
   *   - `setTimer` — "Pulse an IO"
   *   - `cancelTimer` — "Cancel a timer on one IO"
   *   - `cancelAllTimers` — "Cancel all timers"
   *   - `reboot` — "Reboot device"
   *   - `addTelemetry` — "Start reporting an IO's value on a schedule"
   *   - `removeTelemetry` — "Stop reporting an IO's value"
   *   - `setTracking` — "Turn location tracking on/off"
   */
  async createRule(serial, rule) {
    return this.#unwrap(await this.raw.POST('/devices/{serial}/rules', {
      params: { path: { serial } },
      body: rule,
    }));
  }

  /**
   * Delete one rule by number.
   * @param {object} [opts]
   * @param {number} [opts.timeoutMs] wait for the device's confirmation, up to this long
   * @param {string} [opts.requestId] your own correlation id, echoed back unchanged
   */
  async deleteRule(serial, ruleNumber, { timeoutMs, requestId } = {}) {
    return this.#unwrap(await this.raw.DELETE('/devices/{serial}/rules/{ruleNumber}', {
      params: { path: { serial, ruleNumber } },
      body: {
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        ...(requestId ? { requestId } : {}),
      },
    }));
  }

  /**
   * Delete EVERY rule on a device. Cannot be undone. Unlike the `confirm` option elsewhere in
   * this SDK (a client-side convenience that just waits longer), `confirm: true` here is a
   * required wire field the API refuses to act without — there is no default and no inference;
   * you must pass it explicitly every time.
   * @param {object} opts
   * @param {true} opts.confirm required — must be the literal `true`
   * @param {number} [opts.timeoutMs] wait for the device's confirmation, up to this long
   * @param {string} [opts.requestId] your own correlation id, echoed back unchanged
   */
  async clearRules(serial, { confirm, timeoutMs, requestId } = {}) {
    if (confirm !== true) {
      throw new Error('Justworx: clearRules requires { confirm: true } -- it deletes every rule on the device and cannot be undone');
    }
    return this.#unwrap(await this.raw.DELETE('/devices/{serial}/rules', {
      params: { path: { serial } },
      body: {
        confirm: true,
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        ...(requestId ? { requestId } : {}),
      },
    }));
  }
}
