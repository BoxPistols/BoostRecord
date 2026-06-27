// Headless proof of the collaborative-editing architecture.
//
// No browser needed: we spin up the self-hosted Hocuspocus server and connect
// TWO Yjs clients (as two devices) to the same note, then assert:
//   1. device-pairing auth REJECTS a wrong token,
//   2. an edit on device A converges to device B (character-level CRDT merge),
//   3. concurrent edits from both devices both survive (no lost write),
//   4. the server writes a derived .cson snapshot in the legacy note shape.
//
// Run: npm test   (Node 22 via volta)

import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'
import { WebSocket } from 'ws'
import CSON from 'cson'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer } from '../server/hocuspocus-server.mjs'

const PORT = 7777
const TOKEN = 'demo-pairing-secret'
const SNAPSHOT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-poc-'))
const URL = `ws://127.0.0.1:${PORT}`

const sleep = ms => new Promise(r => setTimeout(r, ms))

function connect(name, token = TOKEN) {
  const doc = new Y.Doc()
  const provider = new HocuspocusProvider({
    url: URL,
    name,
    token,
    document: doc,
    WebSocketPolyfill: WebSocket,
    connect: true
  })
  return { doc, provider }
}

async function waitFor(predicate, { timeout = 5000, label = 'condition' } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (predicate()) return
    await sleep(25)
  }
  throw new Error(`Timed out waiting for: ${label}`)
}

let pass = 0
const ok = msg => {
  pass++
  // eslint-disable-next-line no-console
  console.log(`  ✓ ${msg}`)
}

async function main() {
  const server = createServer({
    port: PORT,
    pairingToken: TOKEN,
    snapshotDir: SNAPSHOT_DIR,
    debounce: 200
  })
  await server.listen()

  // --- 1. Auth gate rejects an unpaired device ---------------------------
  {
    const bad = connect('note-auth', 'wrong-token')
    let rejected = false
    bad.provider.on('authenticationFailed', () => {
      rejected = true
    })
    await waitFor(() => rejected, { label: 'auth rejection of wrong token' })
    ok('device-pairing auth rejects an invalid token')
    bad.provider.destroy()
  }

  // --- 2 & 3. Two paired devices on the same note converge ---------------
  const NOTE = 'note-1'
  const a = connect(NOTE)
  const b = connect(NOTE)
  await waitFor(() => a.provider.isSynced && b.provider.isSynced, {
    label: 'both devices synced'
  })
  ok('two paired devices connect and sync')

  // Device A types.
  a.doc.getText('content').insert(0, 'Hello from device A. ')
  await waitFor(
    () => b.doc.getText('content').toString().includes('Hello from device A.'),
    { label: 'A -> B convergence' }
  )
  ok('an edit on device A converges to device B')

  // Concurrent edits from both devices (prepend on A, append on B).
  const beforeLen = b.doc.getText('content').length
  a.doc.getText('content').insert(0, '[A-prepend] ')
  b.doc.getText('content').insert(beforeLen, ' [B-append]')
  await waitFor(
    () => {
      const ta = a.doc.getText('content').toString()
      const tb = b.doc.getText('content').toString()
      return (
        ta === tb &&
        ta.includes('[A-prepend]') &&
        ta.includes('[B-append]') &&
        ta.includes('Hello from device A.')
      )
    },
    { label: 'concurrent edits converge with no lost write' }
  )
  const converged = a.doc.getText('content').toString()
  assert.equal(converged, b.doc.getText('content').toString())
  ok(`concurrent edits both survive and converge: "${converged}"`)

  // Set some metadata (title) the way the app would.
  a.doc.getMap('metadata').set('title', 'Collab PoC Note')
  a.doc.getMap('metadata').set('type', 'MARKDOWN_NOTE')

  // --- 4. Server persisted a derived .cson snapshot ----------------------
  const snapshotFile = path.join(SNAPSHOT_DIR, `${NOTE}.cson`)
  await waitFor(() => fs.existsSync(snapshotFile), {
    label: '.cson snapshot written',
    timeout: 4000
  })
  // Give the debounced writer a beat to capture the latest state.
  await sleep(400)
  const note = CSON.parse(fs.readFileSync(snapshotFile, 'utf8'))
  assert.equal(note.content, converged)
  assert.equal(note.type, 'MARKDOWN_NOTE')
  ok(`server wrote a legacy-shaped .cson snapshot (title="${note.title}")`)

  // --- 5. A late-joining device loads from the snapshot ------------------
  // Drop both clients so the server unloads the in-memory doc, then reconnect.
  a.provider.destroy()
  b.provider.destroy()
  await sleep(600)
  const c = connect(NOTE)
  await waitFor(() => c.provider.isSynced, { label: 'late device synced' })
  await waitFor(
    () => c.doc.getText('content').toString().includes('Hello from device A.'),
    { label: 'late device seeded from .cson snapshot' }
  )
  ok('a late-joining device is seeded from the .cson snapshot')
  c.provider.destroy()

  await server.destroy()
  fs.rmSync(SNAPSHOT_DIR, { recursive: true, force: true })
  // eslint-disable-next-line no-console
  console.log(`\nAll ${pass} checks passed — collab core architecture validated.`)
}

main().then(
  () => process.exit(0),
  err => {
    // eslint-disable-next-line no-console
    console.error('\n✗ FAILED:', err && err.message ? err.message : err)
    process.exit(1)
  }
)
