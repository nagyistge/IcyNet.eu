import config from '../../scripts/load-config'
import database from '../../scripts/load-database'
import http from '../../scripts/http'
import models from './models'
import UAPI from './index'
import qs from 'querystring'
import oauth from 'oauth-libre'

let twitterApp
let discordApp

const API = {
  Common: {
    getExternal: async (service, identifier) => {
      let extr = await models.External.query().where('service', service).andWhere('identifier', identifier)
      if (!extr || !extr.length) return null
      extr = extr[0]
      extr.user = null

      if (extr.user_id !== null) {
        let user = await UAPI.User.get(extr.user_id)
        if (user) {
          extr.user = user
        }
      }

      return extr
    },
    new: async (service, identifier, user) => {
      let data = {
        user_id: user.id,
        service: service,
        identifier: identifier,
        created_at: new Date()
      }

      await await models.External.query().insert(data)
      return true
    }
  },
  Facebook: {
    callback: async (user, data) => {
      if (!data.authResponse || data.status !== 'connected') {
        return {error: 'No Authorization'}
      }

      let uid = data.authResponse.userID
      if (!uid) {
        return {error: 'No Authorization'}
      }

      // Get facebook user information in order to create a new user or verify
      let fbdata
      let intel = {
        access_token: data.authResponse.accessToken,
        fields: 'name,email,picture,short_name'
      }

      try {
        fbdata = await http.GET('https://graph.facebook.com/v2.10/' + uid + '?' + qs.stringify(intel))
        fbdata = JSON.parse(fbdata)
      } catch (e) {
        return {error: 'Could not get user information', errorObject: e}
      }

      if (fbdata.error) {
        return {error: fbdata.error.message}
      }

      let exists = await API.Common.getExternal('fb', uid)

      if (user) {
        if (exists) return {error: null, user: user}

        await API.Common.new('fb', uid, user)
        return {error: null, user: user}
      }

      // Callback succeeded with user id and the external table exists, we log in the user
      if (exists) {
        return {error: null, user: exists.user}
      }

      // Determine profile picture
      let profilepic = ''
      if (fbdata.picture) {
        if (fbdata.picture.is_silhouette == false && fbdata.picture.url) {
          // TODO: Download the profile image and save it locally
          profilepic = fbdata.picture.url
        }
      }

      // Create a new user
      let udataLimited = {
        username: fbdata.short_name || 'FB' + UAPI.Hash(4),
        display_name: fbdata.name,
        email: fbdata.email || '',
        avatar_file: profilepic,
        activated: 1,
        ip_address: data.ip_address,
        created_at: new Date()
      }

      // Check if the username is already taken
      if (await UAPI.User.get(udataLimited.username) != null) {
        udataLimited.username = 'FB' + UAPI.Hash(4)
      }

      // Check if the email Facebook gave us is already registered, if so,
      // associate an external node with the user bearing the email
      if (udataLimited.email && udataLimited.email !== '') {
        let getByEmail = await UAPI.User.get(udataLimited.email)
        if (getByEmail) {
          await API.Common.new('fb', getByEmail.id, getByEmail)
          return {error: null, user: getByEmail}
        }
      }

      // Create a new user based on the information we got from Facebook
      let newUser = await models.User.query().insert(udataLimited)
      await API.Common.new('fb', uid, newUser)

      return {error: null, user: newUser}
    }
  },
  Twitter: {
    oauthApp: function () {
      if (!twitterApp) {
        let redirectUri = config.server.domain + '/api/external/twitter/callback'
        twitterApp = new oauth.PromiseOAuth(
          'https://api.twitter.com/oauth/request_token',
          'https://api.twitter.com/oauth/access_token',
          config.twitter.api,
          config.twitter.api_secret,
          '1.0A',
          redirectUri,
          'HMAC-SHA1'
        )
      }
    },
    getRequestToken: async function () {
      if (!twitterApp) API.Twitter.oauthApp()
      let tokens
      
      try {
        tokens = await twitterApp.getOAuthRequestToken()
      } catch (e) {
        console.error(e)
        return {error: 'No tokens returned'}
      }

      if (tokens[2].oauth_callback_confirmed !== "true") return {error: 'No tokens returned.'}

      return {error: null, token: tokens[0], token_secret: tokens[1]}
    },
    getAccessTokens: async function (token, secret, verifier) {
      if (!twitterApp) API.Twitter.oauthApp()
      let tokens

      try {
        tokens = await twitterApp.getOAuthAccessToken(token, secret, verifier)
      } catch (e) {
        console.error(e)
        return {error: 'No tokens returned'}
      }

      if (!tokens || !tokens.length) return {error: 'No tokens returned'}

      return {error: null, access_token: tokens[0], access_token_secret: tokens[1]}
    },
    callback: async function (user, accessTokens, ipAddress) {
      if (!twitterApp) API.Twitter.oauthApp()
      let twdata
      try {
        let resp = await twitterApp.get('https://api.twitter.com/1.1/account/verify_credentials.json?include_email=true', accessTokens.access_token, 
          accessTokens.access_token_secret)
        twdata = JSON.parse(resp[0])
      } catch (e) {
        console.error(e)
        return {error: 'Failed to verify user credentials.'}
      }

      let uid = twdata.id_str
      let exists = await API.Common.getExternal('twitter', uid)

      if (user) {
        if (exists) return {error: null, user: user}

        await API.Common.new('twitter', uid, user)
        return {error: null, user: user}
      }

      // Callback succeeded with user id and the external table exists, we log in the user
      if (exists) {
        return {error: null, user: exists.user}
      }

      // Determine profile picture
      let profilepic = ''
      if (twdata.profile_image_url_https) {
        // TODO: Download the profile image and save it locally
        profilepic = twdata.profile_image_url_https
      }

      // Create a new user
      let udataLimited = {
        username: twdata.screen_name,
        display_name: twdata.name,
        email: twdata.email || '',
        avatar_file: profilepic,
        activated: 1,
        ip_address: ipAddress,
        created_at: new Date()
      }

      // Check if the username is already taken
      if (await UAPI.User.get(udataLimited.username) != null) {
        udataLimited.username = 'Tw' + UAPI.Hash(4)
      }

      // Check if the email Twitter gave us is already registered, if so,
      // associate an external node with the user bearing the email
      if (udataLimited.email && udataLimited.email !== '') {
        let getByEmail = await UAPI.User.get(udataLimited.email)
        if (getByEmail) {
          await API.Common.new('twitter', getByEmail.id, getByEmail)
          return {error: null, user: getByEmail}
        }
      }

      // Create a new user based on the information we got from Twitter
      let newUser = await models.User.query().insert(udataLimited)
      await API.Common.new('twitter', uid, newUser)

      return {error: null, user: newUser}
    }
  },
  Discord: {
    oauth2App: function() {
      if (discordApp) return
      discordApp = new oauth.PromiseOAuth2(
        config.discord.api,
        config.discord.api_secret,
        'https://discordapp.com/api/',
        'oauth2/authorize',
        'oauth2/token'
      )

      discordApp.useAuthorizationHeaderforGET(true)
    },
    getAuthorizeURL: function () {
      if (!discordApp) API.Discord.oauth2App()
      let state = UAPI.Hash(6)
      let redirectUri = config.server.domain + '/api/external/discord/callback'

      const params = {
        'client_id': config.discord.api,
        'redirect_uri': redirectUri,
        'scope': 'identify email',
        'response_type': 'code',
        'state': state
      }

      let url = discordApp.getAuthorizeUrl(params)

      return {error: null, state: state, url: url}
    },
    getAccessToken: async function (code) {
      if (!discordApp) API.Discord.oauth2App()

      let redirectUri = config.server.domain + '/api/external/discord/callback'
      let tokens
      try {
        tokens = await discordApp.getOAuthAccessToken(code, {grant_type: 'authorization_code', redirect_uri: redirectUri})
      } catch (e) {
        console.error(e)
        return {error: 'No Authorization'}
      }

      if (!tokens.length) return {error: 'No Tokens'}
      tokens = tokens[2]

      return {error: null, accessToken: tokens.access_token}
    },
    callback: async function (user, accessToken, ipAddress) {
      if (!discordApp) API.Discord.oauth2App()

      let ddata
      try {
        let resp = await discordApp.get('https://discordapp.com/api/users/@me', accessToken)
        ddata = JSON.parse(resp)
      } catch (e) {
        console.error(e)
        return {error: 'Could not get user information'}
      }

      let uid = ddata.id
      let exists = await API.Common.getExternal('discord', uid)

      if (user) {
        if (exists) return {error: null, user: user}

        await API.Common.new('discord', uid, user)
        return {error: null, user: user}
      }

      // Callback succeeded with user id and the external table exists, we log in the user
      if (exists) {
        return {error: null, user: exists.user}
      }

      // Determine profile picture
      let profilepic = ''
      // TODO: Download the profile image and save it locally

      // Create a new user
      let udataLimited = {
        username: 'D' + ddata.discriminator,
        display_name: ddata.username,
        email: ddata.email || '',
        avatar_file: profilepic,
        activated: 1,
        ip_address: ipAddress,
        created_at: new Date()
      }

      // Check if the email Discord gave us is already registered, if so,
      // associate an external node with the user bearing the email
      if (udataLimited.email && udataLimited.email !== '') {
        let getByEmail = await UAPI.User.get(udataLimited.email)
        if (getByEmail) {
          await API.Common.new('discord', uid, getByEmail)
          return {error: null, user: getByEmail}
        }
      }

      // Create a new user based on the information we got from Discord
      let newUser = await models.User.query().insert(udataLimited)
      await API.Common.new('discord', uid, newUser)

      return {error: null, user: newUser}
    }
  }
}

module.exports = API
