import path from 'path'
import cprog from 'child_process'
import config from '../../scripts/load-config'
import database from '../../scripts/load-database'
import models from './models'
import crypto from 'crypto'
import notp from 'notp'
import base32 from 'thirty-two'

const emailRe = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/

function bcryptTask (data) {
  return new Promise((resolve, reject) => {
    let proc = cprog.fork(path.join(__dirname, '../../scripts', 'bcrypt.js'))
    let done = false
    proc.send(data.task + ' ' + JSON.stringify(data))
    proc.on('message', (chunk) => {
      if (chunk == null) return reject(new Error('No response'))
      let line = chunk.toString().trim()
      done = true
      if (line === 'error') {
        return reject(new Error(line))
      }
      if (line === 'true' || line === 'false') {
        return resolve(line === 'true')
      }
      resolve(line)
    })
    proc.on('exit', () => {
      if (!done) {
        reject(new Error('No response'))
      }
    })
  })
}

function keysAvailable (object, required) {
  let found = true

  for (let i in required) {
    let key = required[i]
    if (object[key] == null) {
      found = false
    }
  }

  return found
}

const API = {
  Hash: (len) => {
    return crypto.randomBytes(len).toString('hex')
  },
  User: {
    get: async function (identifier) {
      let scope = 'id'
      if (typeof identifier === 'string') {
        scope = 'username'
        if (identifier.indexOf('@') !== -1) {
          scope = 'email'
        }
      } else if (typeof identifier === 'object') {
        if (identifier.id != null) {
          identifier = identifier.id
        } else if (identifier.username) {
          scope = 'username'
          identifier = identifier.username
        } else {
          return null
        }
      }

      let user = await models.User.query().where(scope, identifier)
      if (!user.length) return null

      return user[0]
    },
    ensureObject: async function (user, fieldsPresent = ['id']) {
      if (typeof user !== 'object' || !keysAvailable(user, fieldsPresent)) {
        return await API.User.get(user)
      }

      if (user.id) {
        return user
      }

      return null
    },
    Login: {
      password: async function (user, password) {
        user = await API.User.ensureObject(user)
        if (!user.password) return false
        return bcryptTask({task: 'compare', password: password, hash: user.password})
      },
      activationToken: async function (token) {
        let getToken = await models.Token.query().where('token', token)
        if (!getToken || !getToken.length) return false

        let user = await API.User.get(getToken[0].user_id)
        if (!user) return false

        await models.User.query().patchAndFetchById(user.id, {activated: 1})
        await models.Token.query().delete().where('id', getToken[0].id)
        return true
      },
      totpTokenRequired: async function (user) {
        let getToken = await models.TotpToken.query().where('user_id', user.id)

        if (!getToken || !getToken.length) return false
        if (getToken[0].activated !== 1) return false

        return true
      },
      totpCheck: async function (user, code, emerg) {
        user = await API.User.ensureObject(user)
        let getToken = await models.TotpToken.query().where('user_id', user.id)
        if (!getToken || !getToken.length) return false
        getToken = getToken[0]

        if (emerg) {
          if (emerg === getToken.recovery_code) {
            return true
          }

          return false
        }

        let login = notp.totp.verify(code, getToken.token, {})

        if (login) {
          if (login.delta !== 0) {
            return false
          }

          if (getToken.activated !== 1) {
            // TODO: Send an email including the recovery code to the user
            await models.TotpToken.query().patchAndFetchById(getToken.id, {activated: true})
          }

          return true
        }

        return false
      },
      purgeTotp: async function (user, password) {
        user = await API.User.ensureObject(user, ['password'])
        let pwmatch = await API.User.Login.password(user, password)
        if (!pwmatch) return false

        // TODO: Inform user via email
        await models.TotpToken.query().delete().where('user_id', user.id)

        return true
      },
      totpAquire: async function (user) {
        user = await API.User.ensureObject(user, ['password'])

        // Do not allow totp for users who have registered using an external service
        if (!user.password || user.password === '') return null

        // Get existing tokens for the user and delete them if found
        let getToken = await models.TotpToken.query().where('user_id', user.id)
        if (getToken && getToken.length) {
          await models.TotpToken.query().delete().where('user_id', user.id)
        }

        let newToken = {
          user_id: user.id,
          token: API.Hash(16),
          recovery_code: API.Hash(8),
          activated: 0,
          created_at: new Date()
        }

        let hashed = base32.encode(newToken.token)
        let domain = 'icynet.eu'

        await models.TotpToken.query().insert(newToken)

        let uri = encodeURIComponent('otpauth://totp/' + user.username + '@' + domain + '?secret=' + hashed)

        return uri
      }
    },
    Register: {
      hashPassword: async function (password) {
        return bcryptTask({task: 'hash', password: password})
      },
      validateEmail: (email) => {
        return emailRe.test(email)
      },
      newAccount: async function (regdata) {
        let data = Object.assign(regdata, {
          created_at: new Date()
        })

        let userTest = await API.User.get(regdata.username)
        if (userTest) {
          return {error: 'This username is already taken!'}
        }

        let emailTest = await API.User.get(regdata.email)
        if (emailTest) {
          return {error: 'This email address is already registered!'}
        }

        // Create user
        let user = await models.User.query().insert(data)

        // Activation token
        let activationToken = API.Hash(16)
        await models.Token.query().insert({
          expires_at: new Date(Date.now() + 86400000), // 1 day
          token: activationToken,
          user_id: user.id,
          type: 1
        })

        // TODO: Send email
        console.log(activationToken)
        return {error: null, user: user}
      }
    }
  }
}

module.exports = API
