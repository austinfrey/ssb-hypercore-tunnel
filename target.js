require('dotenv').config()
const path = require('path')
const crypto = require('crypto')
const ssbKeys = require('ssb-keys')
const RAM = require('random-access-memory')
const hypercore = require('hypercore')
const {duplex} = require('stream-to-pull-stream')

const feed = hypercore(RAM)

feed.append('hello replicant')

setInterval(_ => {
  feed.append('hello replicant: ' + Date.now())
}, 500)

const SecretStack = require('secret-stack')({})
  .use({
    version: '1.0.0',
    manifest: {
      status: 'sync',
      progress: 'sync'
    },
    init() {
      return {
        status() {
          return {}
        },
        progress() {
          return {}
        },
        ready(fn) {
          fn && fn(true)
          return true
        },
        post(fn) {}
      }
    }
  })
  .use(require('ssb-gossip'))
  .use(require('ssb-tunnel'))
  .use(require('ssb-ws'))
  .use({
    name: 'feed',
    version: '1.0.0',
    manifest: {
      replicate: 'duplex',
      key: 'sync'
    },
    permissions: {
      anonymous: {allow: ['replicate', 'key']}
    },
    init(rpc, config) {
      const replicate = _ => duplex(feed.replicate({live: true}))
      const key = _ => feed.key

      return {replicate, key}
    }
  })

const hash = s => crypto.createHash('sha256').update(s).digest()

const keys = ssbKeys.generate(null, hash('something-to-hash'))
console.log(keys)

const target = (function (portalAddress) {
  return SecretStack({
    path: path.join(process.env.HOME || '/browser', '.' + (process.env.ssb_appname || 'ssb')),
    port: 1235, temp: true, keys,
    caps: require('ssb-caps'),
    seeds: [portalAddress],
    gossip: {
      pub: false
    },
    timers: {
      inactivity: -1, handshake: 30000
    },
    connections: {
      outgoing: {
        ws: [{transform: 'shs'}]
      },
      incoming: {
        tunnel: [{scope: 'public', portal: process.env.PORTAL_ID, transform: 'shs'}]
      }
    }
  })
});
(function again() {
  const portalAddress = process.env.PORTAL_ADDR
  const node = target(portalAddress)
  node.connect(portalAddress, (err, rpc) => {
    if (err) {
      throw err
    }
    console.log('CONNECTED', rpc.id)
    rpc.on('closed', () => {
      console.log('CLOSED')
      setTimeout(again, 1000 * Math.random())
    })
  })
})()

