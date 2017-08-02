function pz (z) {
  if (z < 10) {
    return '0' + z
  }
  return z
}

function dateFormat (date) {
  return date.getDate() + '/' + (date.getMonth() + 1) + '/' + date.getFullYear() + ' ' +
         pz(date.getHours()) + ':' + pz(date.getMinutes()) + ':' + pz(date.getSeconds())
}

const realConsoleLog = console.log
console.log = function () {
  process.stdout.write('\x1b[2K\r')
  process.stdout.write('[info] [' + dateFormat(new Date()) + '] ')
  realConsoleLog.apply(this, arguments)
}

const realConsoleWarn = console.warn
console.warn = function () {
  process.stdout.write('\x1b[2K\r')
  process.stdout.write('[warn] [' + dateFormat(new Date()) + '] ')
  realConsoleWarn.apply(this, arguments)
}

const realConsoleError = console.error
console.error = function () {
  process.stdout.write('\x1b[2K\r')
  process.stdout.write('[ err] [' + dateFormat(new Date()) + '] ')
  realConsoleError.apply(this, arguments)
}

module.exports = function () {
  this.logProcess = (pid, msg) => {
    if (msg.indexOf('warn') === 0) {
      msg = msg.substring(5)
    } else if (msg.indexOf('error') === 0) {
      msg = msg.substring(6)
    }
    console.log('[%s] %s', pid, msg)
  }
}
