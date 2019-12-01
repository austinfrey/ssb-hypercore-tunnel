require('dotenv').config()
const path = require('path')
const {pull, drain} = require('pull-stream')
const RAM = require('random-access-memory')
const hypercore = require('hypercore')
const {duplex} = require('stream-to-pull-stream')

const portalAddress = process.env.PORTAL_ADDR
const targetAddress = process.env.TARGET_ADDR

const SecretStack = require('secret-stack')({})
  .use({
    version: '1.0.0',
    manifest: {
      status: 'sync',
      progress: 'sync',
      feed: {replicate: 'duplex', key: 'sync'}
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

const ssbKeys = require('ssb-keys')

const keys = ssbKeys.generate()

const client = (function (portalAddress) {
  return SecretStack({
    path: path.join(process.env.HOME || '/browser', '.' + (process.env.ssb_appname || 'ssb')),
    port: 1234, temp: true, keys,
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
        ws: [{transform: 'shs'}],
        tunnel: [{transform: 'shs'}]
      }
    }
  })
});
(function again() {
  const node = client(portalAddress)
  node.connect(targetAddress, (err, rpc) => {
    if (err) {
      throw err
    }
    console.log('CONNECTED', rpc.id)
    rpc.feed.key((err, key) => {
      if (err) {
        throw err
      }
      console.log('syncing hypercore: ', key.toString('hex'))
      const feed = hypercore(RAM, key)
      const feedStream = rpc.feed.replicate()

      pull(
        feedStream,
        duplex(feed.replicate({live: true})),
        feedStream
      )
      feed.on('sync', _ => feed.head((err, head) => console.log(err || head.toString())))
      rpc.on('closed', () => {
        console.log('CLOSED')
        setTimeout(again, 1000 * Math.random())
      })
    })
  })
})()
