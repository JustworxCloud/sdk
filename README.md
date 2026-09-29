# @justworxcloud/sdk

The official **TypeScript SDK** for the Justworx API (`/api/v2`). Types are **generated from the
OpenAPI spec**, so the SDK stays in lockstep with the contract; a small ergonomic client (built on
`openapi-fetch`) wraps it.

It makes Justworx reliably buildable by AI app-builders (Lovable/v0/Bolt/Cursor) and any TS/JS backend.

## Install

```sh
npm install @justworxcloud/sdk
```

## Use

```ts
import { Justworx, JustworxError } from '@justworxcloud/sdk';

const jwx = new Justworx({ apiKey: process.env.JWX_API_KEY! }); // jwx_live_… (or an OAuth2 access token)

// who am I?
const me = await jwx.whoami();

// list devices (typed), or iterate them all (auto-pagination)
const { items } = await jwx.listDevices({ online: true });
for await (const d of jwx.devices()) console.log(d.serial, d.name);

// read one device's live state (the twin)
const device = await jwx.getDevice('ABCD1234');

// actuate — confirm:true waits for the device's real answer
await jwx.setIo('ABCD1234', 10, 'high', { confirm: true });
await jwx.pulseIo('ABCD1234', 10, 'high', 3000, { revertState: 'low' });
await jwx.cancelTimer('ABCD1234', 10);
await jwx.setRule('ABCD1234', 1, false);

// on-device automations -- run on the device itself, keep working offline
const { items: rules } = await jwx.listRules('ABCD1234');
await jwx.createRule('ABCD1234', {
  ruleNumber: 12, type: 'digital',
  if: { id: 5, state: 'high' },
  then: { type: 'refreshId', idNumber: 14 },
});
await jwx.deleteRule('ABCD1234', 12);
await jwx.clearRules('ABCD1234', { confirm: true }); // confirm is REQUIRED here -- deletes ALL rules

// a device's history (commands sent, replies received, values reported, connection changes)
const { items: log } = await jwx.getDeviceLog('ABCD1234');

// errors are typed
try { await jwx.getDevice('nope'); }
catch (e) { if (e instanceof JustworxError && e.status === 404) { /* … */ } }
```

Every method, argument, and return type is derived from the OpenAPI schemas (`Device`, `IdState`,
`Rule`, `LogEntry`, …), re-exported for consumers.

## Auth

Pass a `jwx_live_…` **API key** (server-to-server), or an **OAuth2 access token** from
`https://oauth.justworx.com` (scopes: `devices:read`, `devices:command`, `devices:configure`,
`devices:own`, `events:read`) — the SDK just sends whatever bearer you give it.

## Capabilities

Each ID may carry a `capability` (`type`/`names`/`secure`, e.g. `GarageDoor` / `["Door"]`) when the
owner has authored one. `getDevice()` returns it per ID, and `capability.names[0]` is the label to
show, when present.

## Events

Justworx's own events feed is a WebSocket (`wss://api.justworx.com/api/v2/stream`) or a long-poll
(`GET /events`) — not covered by this SDK yet. Device **history** (as opposed to the live feed) is
`jwx.getDeviceLog(serial, query)`.

## Regenerate types after a spec change

```sh
npm run generate   # regenerates src/types.ts from the OpenAPI spec (checkout of JustworxCloud/OpenAPI, as a sibling directory)
```

## Test

```sh
npm test   # mocks the fetch layer with canned /api/v2 responses -- no real server involved
```

## Layout

```
src/types.ts     generated OpenAPI types (do not edit — run `npm run generate`)
src/client.js    runtime client (openapi-fetch), ergonomic helpers, JustworxError
src/index.js     entry (re-exports)
src/index.d.ts   public typed surface, sourced from types.ts
test/sdk.test.js unit tests against a mocked fetch layer
```
