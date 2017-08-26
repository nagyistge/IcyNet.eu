'use strict'
import config from '../scripts/load-config.js'
import Logger from '../scripts/logger.js'
import cluster from 'cluster'
import path from 'path'

const cpuCount = require('os').cpus().length
const workers = []
const logger = new Logger()

const args = {
  dev: process.env.NODE_ENV !== 'production',
  port: config.server.port
}

function spawnWorkers () {
  let workerCount = config.server.workers === 0 ? cpuCount : config.server.workers
  console.log('Spinning up ' + workerCount + ' worker process' + (workerCount !== 1 ? 'es' : ''))

  for (let i = 0; i < workerCount; i++) {
    spawnWorker()
  }
}

async function initialize () {
  try {
    const knex = require('knex')(require('../knexfile'))
    console.log('Initializing database...')
    await knex.migrate.latest()
    console.log('Database initialized')
    await knex.destroy()
  } catch (err) {
    console.error('Database error:', err)
  }

  spawnWorkers()
  if (args.dev) {
    watchFileTree()
  }
}

function watchFileTree () {
  if (process.argv.indexOf('-w') === -1) return
  console.log('[WatchTask] Starting watcher')

  const watch = require('watch')
  watch.watchTree(__dirname, (f, curr, prev) => {
    if (typeof f === 'object' && prev === null && curr === null) {
      console.log('[WatchTask] Watching %d files', Object.keys(f).length)
      return
    }

    console.log('[WatchTask] %s changed, restarting workers', f)
    if (workers.length) {
      for (let i in workers) {
        workers[i].send('stop')
      }
    }
    spawnWorkers()
  })
}

function spawnWorker (oldWorker) {
  const w = cluster.fork()
  w.process.stdout.on('data', (data) => {
    console.log(w.process.pid, data.toString().trim())
  })
  w.process.stderr.on('data', (data) => {
    console.log(w.process.pid, data.toString().trim())
  })
  args.verbose && console.log('Starting worker process ' + w.process.pid + '...')

  w.on('message', (message) => {
    if (message === 'started') {
      workers.push(w)
      args.verbose && console.log('Started worker process ' + w.process.pid)
      if (oldWorker) {
        args.verbose && console.log('Stopping worker process ' + oldWorker.process.pid)
        oldWorker.send('stop')
      }
    } else {
      logger.logProcess(w.process.pid, message)
    }
  })

  args.id = w.process.pid

  w.send(args)
  return w
}

console.log('Initializing')

cluster.setupMaster({
  stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  exec: path.join(__dirname, './worker.js')
})

cluster.on('exit', (worker, code, signal) => {
  let extra = ((code || '') + ' ' + (signal || '')).trim()

  console.error('Worker process ' + worker.process.pid + ' exited ' + (extra ? '(' + extra + ')' : ''))

  let index = workers.indexOf(worker)

  if (index !== -1) workers.splice(index, 1)
  if (code === 0) return

  setTimeout(() => {
    spawnWorker()
  }, 10 * 1000)
})

initialize()
