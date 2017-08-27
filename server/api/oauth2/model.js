import config from '../../../scripts/load-config'
import Models from '../models'
import Users from '../index'
import crypto from 'crypto'

const OAuthDB = {
  accessToken: {
    ttl: config.oauth2.access_token_life,
    getToken: (object) => {
      if (object) return object.token
      return null
    },
    create: async (userId, clientId, scope, ttl) => {
      const token = crypto.randomBytes(config.oauth2.token_length).toString('hex')
      const expr = new Date(Date.now() + ttl * 1000)

      if (typeof scope === 'object') {
        scope = scope.join(' ')
      }

      // Delete already existing tokens with this exact user id, client id and scope, because it will
      // eventually pile up and flood the database.
      await Models.OAuth2AccessToken.query().delete().where('user_id', userId)
        .andWhere('client_id', clientId)

      const obj = { token: token, user_id: userId, client_id: clientId, scope: scope, expires_at: expr, created_at: new Date() }

      let res = await Models.OAuth2AccessToken.query().insert(obj)
      if (!res) return null

      return res.token
    },
    fetchByToken: async (token) => {
      if (typeof token === 'object') {
        return token
      }

      token = await Models.OAuth2AccessToken.query().where('token', token)
      if (!token.length) return null

      return token[0]
    },
    checkTTL: (object) => {
      return (object.expires_at > Date.now())
    },
    getTTL: (object) => {
      return (object.expires_at - Date.now())
    },
    fetchByUserIdClientId: async (userId, clientId) => {
      let tkn = await Models.OAuth2AccessToken.query().where('user_id', userId).andWhere('client_id', clientId)

      if (!tkn.length) return null

      return tkn[0]
    }
  },
  client: {
    getId: (client) => {
      return client.id
    },
    fetchById: async (id) => {
      let client = await Models.OAuth2Client.query().where('id', id)

      if (!client.length) return null

      return client[0]
    },
    checkSecret: (client, secret) => {
      return client.secret === secret
    },
    checkGrantType: (client, grant) => {
      if (client.grants.indexOf(grant) !== -1) {
        return true
      }

      return false
    },
    getRedirectUri: (client) => {
      return client.redirect_url
    },
    checkRedirectUri: (client, redirectUri) => {
      return (redirectUri.indexOf(OAuthDB.client.getRedirectUri(client)) === 0 &&
        redirectUri.replace(OAuthDB.client.getRedirectUri(client), '').indexOf('#') === -1)
    },
    transformScope: (scope) => {
      if (!scope) return []
      if (typeof scope === 'object') {
        return scope
      }

      scope = scope.trim()
      if (scope.indexOf(',') !== -1) {
        scope = scope.split(',')
      } else {
        scope = scope.split(' ')
      }

      return scope
    },
    checkScope: (client, scope) => {
      if (!scope) return []
      if (typeof scope === 'string') {
        scope = OAuthDB.client.transformScope(scope)
      }

      let clientScopes = client.scope.split(' ')

      for (let i in scope) {
        if (clientScopes.indexOf(scope[i]) === -1) {
          return false
        }
      }

      return scope
    }
  },
  code: {
    ttl: config.oauth2.code_life,
    create: async (userId, clientId, scope, ttl) => {
      const code = crypto.randomBytes(config.oauth2.token_length).toString('hex')
      const expr = new Date(Date.now() + ttl * 1000)

      if (typeof scope === 'object') {
        scope = scope.join(' ')
      }

      // Delete already existing codes with this exact user id, client id and scope, because it will
      // eventually pile up and flood the database, especially when they were never used.
      await Models.OAuth2Code.query().delete().where('user_id', userId).andWhere('client_id', clientId)

      const obj = { code: code, user_id: userId, client_id: clientId, scope: scope, expires_at: expr, created_at: new Date() }

      await Models.OAuth2Code.query().insert(obj)

      return obj.code
    },
    fetchByCode: async (code) => {
      code = await Models.OAuth2Code.query().where('code', code)

      if (!code.length) return null

      return code[0]
    },
    removeByCode: async (code) => {
      if (typeof code === 'object') {
        code = code.code
      }

      return Models.OAuth2Code.query().delete().where('code', code)
    },
    getUserId: (code) => {
      return code.user_id
    },
    getClientId: (code) => {
      return code.client_id
    },
    getScope: (code) => {
      return code.scope
    },
    checkTTL: (code) => {
      return (code.expires_at > Date.now())
    }
  },
  refreshToken: {
    create: async (userId, clientId, scope) => {
      const token = crypto.randomBytes(config.oauth2.token_length).toString('hex')

      if (typeof scope === 'object') {
        scope = scope.join(' ')
      }

      const obj = { token: token, user_id: userId, client_id: clientId, scope: scope, created_at: new Date() }

      await Models.OAuth2RefreshToken.query().insert(obj)

      return obj.token
    },
    fetchByToken: async (token) => {
      token = await Models.OAuth2RefreshToken.query().where('token', token)

      if (!token.length) return null

      return token[0]
    },
    removeByUserIdClientId: async (userId, clientId) => {
      return Models.OAuth2RefreshToken.query().delete().where('user_id', userId)
        .andWhere('client_id', clientId)
    },
    removeByRefreshToken: async (token) => {
      return Models.OAuth2RefreshToken.query().delete().where('token', token)
    },
    getUserId: (refreshToken) => {
      return refreshToken.user_id
    },
    getClientId: (refreshToken) => {
      return refreshToken.client_id
    },
    getScope: (refreshToken) => {
      return refreshToken.scope
    }
  },
  user: {
    getId: (user) => {
      return user.id
    },
    fetchById: Users.User.get,
    fetchByUsername: Users.User.get,
    checkPassword: Users.User.Login.password,
    fetchFromRequest: async (req) => {
      if (!req.session.user) return null
      let banStatus = await Users.User.getBanStatus(req.session.user.id)

      if (banStatus.length) {
        delete req.session.user
        return null
      }

      return req.session.user
    },
    clientAllowed: async (userId, clientId, scope) => {
      if (typeof scope === 'object') {
        scope = scope.join(' ')
      }

      let authorized = await Models.OAuth2AuthorizedClient.query().where('user_id', userId)
      if (!authorized.length) return false

      let correct = false
      for (let i in authorized) {
        if (authorized[i].client_id === clientId) {
          correct = authorized[i]
        }
      }

      if (correct) {
        if (correct.scope !== scope) {
          await Models.OAuth2AuthorizedClient.query().delete().where('user_id', userId)
            .andWhere('client_id', correct.client_id)

          return false
        }

        correct = true
      }

      return correct
    },
    allowClient: async (userId, clientId, scope) => {
      if (!config.oauth2.save_decision) return true
      if (typeof scope === 'object') {
        scope = scope.join(' ')
      }

      let obj = { user_id: userId, client_id: clientId, scope: scope, created_at: new Date() }

      await Models.OAuth2AuthorizedClient.query().insert(obj)

      return true
    }
  }
}

module.exports = OAuthDB
