import config from './load-config'
import path from 'path'
import fs from 'fs'
import util from 'util'

let lfs

function pz (z) {
  if (z < 10) {
    return '0' + z
  }
  return z
}

// Time stamp constructor
function dateFormat (date) {
  return date.getDate() + '/' + (date.getMonth() + 1) + '/' + date.getFullYear() + ' ' +
         pz(date.getHours()) + ':' + pz(date.getMinutes()) + ':' + pz(date.getSeconds())
}

// Console.log/error/warn "middleware" - add timestamp and write to file
function stampAndWrite (fnc, prfx, message) {
  let prefix = '[' + prfx + '] [' + dateFormat(new Date()) + '] '
  message = prefix + message

  if (lfs) {
    lfs.write(message + '\n')
  }

  fnc.call(this, message)
}

// Reassign logger functions and send them to the "middleware"
const realConsoleLog = console.log
console.log = function () {
  let message = util.format.apply(null, arguments)
  stampAndWrite.call(this, realConsoleLog, 'info', message)
}

const realConsoleWarn = console.warn
console.warn = function () {
  let message = util.format.apply(null, arguments)
  stampAndWrite.call(this, realConsoleWarn, 'warn', message)
}

const realConsoleError = console.error
console.error = function () {
  let message = util.format.apply(null, arguments)
  stampAndWrite.call(this, realConsoleError, ' err', message)
}

module.exports = function () {
  this.logProcess = (pid, msg) => {
    if (msg.indexOf('warn') === 0) {
      msg = msg.substring(5)
      console.warn('[%s] %s', pid, msg)
    } else if (msg.indexOf('error') === 0) {
      msg = msg.substring(6)
      console.error('[%s] %s', pid, msg)
    } else {
      console.log('[%s] %s', pid, msg)
    }
  }

  // Create log file write stream
  if (!config.logger || !config.logger.write) return

  try {
    lfs = fs.createWriteStream(path.resolve(config.logger.file), {flags: 'a'})
  } catch (e) {
    lfs = null
    console.error('Failed to initiate log file write stream')
    console.error(e.stack)
  }
}
