// Self-hosted Hocuspocus sync server for the Boostnote collab PoC.
//
// Proves three things from the revised architecture decision:
//   1. A self-hosted Yjs sync server (flat-cost, plaintext stays on our box).
//   2. Device-pairing auth via onAuthenticate (Yjs has NO built-in access
//      control, so the WebSocket MUST be gated — here by a shared secret).
//   3. The "file is still the source of truth" contract: onStoreDocument
//      writes a derived .cson snapshot in the legacy note shape, and
//      onLoadDocument seeds a freshly-loaded doc from that snapshot.
//
// Run: npm run server   (Node 22 via volta)

import { Server } from '@hocuspocus/server'
import CSON from 'cson'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_SNAPSHOT_DIR = path.join(__dirname, '..', 'snapshots')
const DEFAULT_PORT = Number(process.env.PORT || 1234)
// In the real app this is a per-device pairing token, not a hardcoded string.
const DEFAULT_PAIRING_TOKEN = process.env.PAIRING_TOKEN || 'demo-pairing-secret'

// Serialize a Yjs document to the legacy .cson note shape.
function docToNote(doc) {
  const meta = doc.getMap('metadata')
  return {
    type: meta.get('type') || 'MARKDOWN_NOTE',
    title: meta.get('title') || '',
    tags: meta.get('tags') || [],
    isStarred: meta.get('isStarred') || false,
    isTrashed: meta.get('isTrashed') || false,
    content: doc.getText('content').toString()
  }
}

export function createServer({
  port = DEFAULT_PORT,
  pairingToken = DEFAULT_PAIRING_TOKEN,
  snapshotDir = DEFAULT_SNAPSHOT_DIR,
  debounce = 1000
} = {}) {
  fs.mkdirSync(snapshotDir, { recursive: true })
  const snapshotPath = name => path.join(snapshotDir, `${name}.cson`)

  return new Server({
    port,
    // Flush the snapshot at most once per `debounce` ms per document
    // (Hocuspocus debounces onStoreDocument internally; mirrors the app's 1s).
    debounce,
    quiet: true,

    // --- Security gate: device pairing -------------------------------------
    // Without this, anyone who can reach the socket and knows a document name
    // can read/write it. The token is verified before any sync happens.
    async onAuthenticate({ token }) {
      if (token !== pairingToken) {
        throw new Error('Not authorized: invalid device-pairing token')
      }
      return { device: 'paired' }
    },

    // --- Seed a freshly loaded doc from its .cson snapshot -----------------
    async onLoadDocument({ document, documentName }) {
      const file = snapshotPath(documentName)
      const ytext = document.getText('content')
      // Only seed if the in-memory doc is still empty, so we never duplicate
      // content that clients have already synced.
      if (ytext.length === 0 && fs.existsSync(file)) {
        const note = CSON.parse(fs.readFileSync(file, 'utf8'))
        if (note && typeof note.content === 'string') {
          ytext.insert(0, note.content)
        }
        const meta = document.getMap('metadata')
        for (const key of ['type', 'title', 'tags', 'isStarred', 'isTrashed']) {
          if (note && note[key] !== undefined) meta.set(key, note[key])
        }
      }
      return document
    },

    // --- Persist a derived .cson snapshot ----------------------------------
    async onStoreDocument({ document, documentName }) {
      const note = docToNote(document)
      const out = CSON.stringify(note, null, 2)
      fs.writeFileSync(snapshotPath(documentName), out)
      // eslint-disable-next-line no-console
      console.log(
        `[snapshot] ${documentName}.cson <- ${note.content.length} chars`
      )
    }
  })
}

// Start when run directly (not when imported by the test).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = createServer()
  server.listen().then(() => {
    // eslint-disable-next-line no-console
    console.log(
      `Hocuspocus listening on ws://127.0.0.1:${DEFAULT_PORT}  (pairing token: "${DEFAULT_PAIRING_TOKEN}")\n` +
        `Snapshots -> ${DEFAULT_SNAPSHOT_DIR}`
    )
  })
}
