import path from 'path'
import cprog from 'child_process'
import config from '../../scripts/load-config'
import database from '../../scripts/load-database'
import models from './models'
import crypto from 'crypto'

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

const API = {
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
    ensureObject: async function (user) {
      if (!typeof user === 'object') {
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
        let activationToken = crypto.randomBytes(16).toString('hex')
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
