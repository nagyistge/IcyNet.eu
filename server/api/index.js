import path from 'path'
import cprog from 'child_process'
import config from '../../scripts/load-config'
import http from '../../scripts/http'
import exists from '../../scripts/existsSync'
import models from './models'
import crypto from 'crypto'
import notp from 'notp'
import base32 from 'thirty-two'
import emailer from './emailer'

import Promise from 'bluebird'
const fs = Promise.promisifyAll(require('fs'))

const emailRe = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/

// Fork a bcrypt process to hash and compare passwords
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

// Make sure an object contains the keys specified in `required`
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

// Clean up the donation responses for ease of use
async function cleanUpDonation (obj, mcOnly, timeframe) {
  if (timeframe && new Date(obj.created_at).getTime() < timeframe) {
    return null
  }

  let user

  if (obj.user_id) {
    user = await API.User.get(obj.user_id)
  }

  let result = {
    trackId: obj.id,
    amount: obj.amount,
    donated: obj.created_at
  }

  if (user) {
    result.name = user.display_name
  }

  let sources = obj.source.split(',')
  for (let i in sources) {
    if (sources[i].indexOf('mcu:') === 0) {
      let mcu = sources[i].split(':')[1]
      if (mcu.match(/^([\w_]{2,16})$/i)) {
        result.minecraft_username = mcu
      }
    }
  }

  if (!result.minecraft_username && mcOnly) return null

  return result
}

let txnStore = []

const API = {
  Hash: (len) => {
    return crypto.randomBytes(len).toString('hex')
  },
  /* ppp - Posts Per Page; dcount - Post Count; page - number of current page */
  Pagination: (ppp, dcount, page) => {
    if (!ppp) ppp = 5
    if (!dcount) return null

    let pageCount = Math.ceil(dcount / ppp)
    if (page > pageCount) page = pageCount

    let offset = (page - 1) * ppp

    return {
      page: page,
      perPage: ppp,
      pages: pageCount,
      offset: offset,
      total: dcount
    }
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
        return API.User.get(user)
      }

      if (user.id) {
        return user
      }

      return null
    },
    socialStatus: async function (user) {
      user = await API.User.ensureObject(user, ['password'])
      if (!user) return null
      let external = await models.External.query().orderBy('created_at', 'asc').where('user_id', user.id)
      let enabled = {}

      for (let i in external) {
        let ext = external[i]
        enabled[ext.service] = true
      }

      let accountSourceIsExternal = user.password === null || user.password === ''
      let obj = {
        enabled: enabled,
        password: !accountSourceIsExternal
      }

      if (accountSourceIsExternal) {
        obj.source = external[0].service
      }

      return obj
    },
    update: async function (user, data) {
      user = await API.User.ensureObject(user)
      if (!user) return {error: 'No such user.'}

      data = Object.assign({
        updated_at: new Date()
      }, data)

      return models.User.query().patchAndFetchById(user.id, data)
    },
    changeAvatar: async function (user, fileName) {
      user = await API.User.ensureObject(user, ['avatar_file'])
      let uploadsDir = path.join(__dirname, '../../', 'usercontent', 'images')
      let pathOf = path.join(uploadsDir, fileName)

      if (!await exists(pathOf)) {
        return {error: 'No such file'}
      }

      // Delete previous upload
      if (user.avatar_file != null) {
        let file = path.join(uploadsDir, user.avatar_file)
        if (await exists(file)) {
          await fs.unlinkAsync(file)
        }
      }

      await API.User.update(user, {avatar_file: fileName})
      return { file: fileName }
    },
    removeAvatar: async function (user) {
      user = await API.User.ensureObject(user, ['avatar_file'])
      let uploadsDir = path.join(__dirname, '../../', 'usercontent', 'images')
      if (!user.avatar_file) return {}

      let file = path.join(uploadsDir, user.avatar_file)
      if (await exists(file)) {
        await fs.unlinkAsync(file)
      }

      return API.User.update(user, {avatar_file: null})
    },
    getBanStatus: async function (field, ip = false) {
      let bans
      if (ip === true) {
        bans = await models.Ban.query().where('associated_ip', field)
      } else {
        bans = await models.Ban.query().where('user_id', field)
      }

      let bansActive = []

      for (let i in bans) {
        let ban = bans[i]

        // Check expiry
        if (ban.expires_at && new Date(ban.expires_at).getTime() < Date.now()) continue

        let banInfo = {
          banned: ban.created_at,
          reason: ban.reason,
          expiry: ban.expires_at
        }

        bansActive.push(banInfo)
      }

      return bansActive
    },
    Login: {
      password: async function (user, password) {
        user = await API.User.ensureObject(user, ['password'])
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
        let email = config.email && config.email.enabled
        let data = Object.assign(regdata, {
          created_at: new Date(),
          updated_at: new Date(),
          activated: email ? 0 : 1
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

        // Send Activation Email
        console.debug('Activation token:', activationToken)
        if (email) {
          await emailer.pushMail('activate', user.email, {
            domain: config.server.domain,
            display_name: user.display_name,
            activation_token: activationToken
          })
        }

        return {error: null, user: user}
      }
    },
    OAuth2: {
      getUserAuthorizations: async function (user) {
        user = await API.User.ensureObject(user)
        let auths = await models.OAuth2AuthorizedClient.query().where('user_id', user.id)

        let nicelist = []

        for (let i in auths) {
          let auth = auths[i]
          let client = await models.OAuth2Client.query().where('id', auth.client_id)

          if (!client.length) continue
          client = client[0]

          let obj = {
            id: client.id,
            title: client.title,
            description: client.description,
            url: client.url,
            icon: client.icon,
            scope: client.scope.split(' '),
            created_at: auth.created_at,
            expires_at: auth.expires_at
          }
          nicelist.push(obj)
        }

        return nicelist
      },
      removeUserAuthorization: async function (user, clientId) {
        user = await API.User.ensureObject(user)
        let auth = await models.OAuth2AuthorizedClient.query().where('user_id', user.id).andWhere('client_id', clientId)
        if (!auth.length) return false

        await models.OAuth2AccessToken.query().delete().where('client_id', clientId).andWhere('user_id', user.id)
        await models.OAuth2RefreshToken.query().delete().where('client_id', clientId).andWhere('user_id', user.id)

        for (let i in auth) {
          await models.OAuth2AuthorizedClient.query().delete().where('id', auth[i].id)
        }

        return true
      }
    }
  },
  Payment: {
    handleIPN: async function (body) {
      let sandboxed = body.test_ipn === '1'
      let url = 'https://ipnpb.' + (sandboxed ? 'sandbox.' : '') + 'paypal.com/cgi-bin/webscr'

      console.debug('Incoming payment')
      let verification = await http.POST(url, {}, Object.assign({
        cmd: '_notify-validate'
      }, body))

      if (verification !== 'VERIFIED') return null

      // Ignore the adding of non-on-site donations
      if (body.item_name && config.donations.name && body.item_name !== config.donations.name) {
        return true
      }

      if (sandboxed) {
        console.debug('Sandboxed payment:', body)
      } else {
        console.debug('IPN Verified Notification:', body)
      }

      // TODO: add database field for this
      if (body.txn_id) {
        if (txnStore.indexOf(body.txn_id) !== -1) return true
        txnStore.push(body.txn_id)
      }

      let user
      let source = []
      if (sandboxed) {
        source.push('virtual')
      }

      // TODO: add hooks
      let custom = body.custom.split(',')
      for (let i in custom) {
        let str = custom[i]
        if (str.indexOf('userid:') === 0) {
          body.user_id = parseInt(str.split(':')[1])
        } else if (str.indexOf('mcu:') === 0) {
          source.push('mcu:' + str.split(':')[1])
        }
      }

      if (body.user_id != null) {
        user = await API.User.get(body.user_id)
      } else if (body.payer_email != null) {
        user = await API.User.get(body.payer_email)
      }

      let donation = {
        user_id: user ? user.id : null,
        amount: (body.mc_gross || body.payment_gross || 'Unknown') + ' ' + (body.mc_currency || 'EUR'),
        source: source.join(','),
        note: body.memo || '',
        read: 0,
        created_at: new Date(body.payment_date)
      }

      console.log('Server receieved a successful PayPal IPN message.')

      return models.Donation.query().insert(donation)
    },
    userContributions: async function (user) {
      user = await API.User.ensureObject(user)

      let dbq = await models.Donation.query().orderBy('created_at', 'desc').where('user_id', user.id)
      let contribs = []

      for (let i in dbq) {
        contribs.push(await cleanUpDonation(dbq[i]))
      }

      return contribs
    },
    allContributions: async function (count, mcOnly, timeframe = 0) {
      let dbq = await models.Donation.query().orderBy('created_at', 'desc').limit(count)
      let contribs = []

      for (let i in dbq) {
        let obj = await cleanUpDonation(dbq[i], mcOnly, timeframe)
        if (!obj) continue
        contribs.push(obj)
      }

      return contribs
    }
  }
}

module.exports = API
