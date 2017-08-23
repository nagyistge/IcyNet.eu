import error from '../error'
import response from '../response'
import model from '../model'
import authorization from './code'
import wrap from '../../../../scripts/asyncRoute'

const usermodel = model.user

module.exports = wrap(async (req, res, next) => {
  let clientId = null
  let redirectUri = null
  let responseType = null
  let grantType = null
  let scope = null
  let user = null

  if (!req.query.redirect_uri) {
    return response.error(req, res, new error.InvalidRequest('redirect_uri field is mandatory for authorization endpoint'), redirectUri)
  }

  redirectUri = req.query.redirect_uri
  console.debug('Parameter redirect uri is', redirectUri)

  if (!req.query.client_id) {
    return response.error(req, res, new error.InvalidRequest('client_id field is mandatory for authorization endpoint'), redirectUri)
  }

  // Check for client_secret (prevent passing it)
  if (req.query.client_secret) {
    return response.error(req, res, new error.InvalidRequest('client_secret field should not be passed to the authorization endpoint'), redirectUri)
  }

  clientId = req.query.client_id
  console.debug('Parameter client_id is', clientId)

  if (!req.query.response_type) {
    return response.error(req, res, new error.InvalidRequest('response_type field is mandatory for authorization endpoint'), redirectUri)
  }

  responseType = req.query.response_type
  console.debug('Parameter response_type is', responseType)

  switch (responseType) {
    case 'code':
      grantType = 'authorization_code'
      break
    case 'token':
      grantType = 'implicit'
      break
    default:
      return response.error(req, res, new error.UnsupportedResponseType('Unknown response_type parameter passed'), redirectUri)
  }
  console.debug('Parameter response_type is', responseType)

  let client = await req.oauth2.model.client.fetchById(clientId)
  if (!client) {
    return response.error(req, res, new error.InvalidClient('Client not found'), redirectUri)
  }

  if (!req.oauth2.model.client.getRedirectUri(client)) {
    return response.error(req, res, new error.UnsupportedResponseType('The client has not set a redirect uri'), redirectUri)
  } else if (!req.oauth2.model.client.checkRedirectUri(client, redirectUri)) {
    return response.error(req, res, new error.InvalidRequest('Wrong RedirectUri provided'), redirectUri)
  } else {
    console.debug('redirect_uri check passed')
  }

  if (!req.oauth2.model.client.checkGrantType(client, grantType)) {
    return response.error(req, res, new error.UnauthorizedClient('This client does not support this grant type'), redirectUri)
  } else {
    console.debug('Grant type check passed')
  }

  scope = req.oauth2.model.client.transformScope(req.query.scope)
  scope = req.oauth2.model.client.checkScope(client, scope)
  if (!scope) {
    return response.error(req, res, new error.InvalidScope('Client does not allow access to this scope'), redirectUri)
  } else {
    console.debug('Scope check passed')
  }

  user = await req.oauth2.model.user.fetchFromRequest(req)
  if (!user) {
    return response.error(req, res, new error.InvalidRequest('There is no currently logged in user'), redirectUri)
  } else {
    if (!user.username) {
      return response.error(req, res, new error.Forbidden(user), redirectUri)
    }
    console.debug('User fetched from request')
  }

  let data = null

  if (req.method === 'GET') {
    let hasAuthorizedAlready = await usermodel.clientAllowed(user.id, client.id, scope)
    if (client.verified === 1) {
      hasAuthorizedAlready = true
    }

    if (hasAuthorizedAlready) {
      if (grantType === 'authorization_code') {
        try {
          data = await authorization.Code(req, res, client, scope, user, redirectUri, false)
        } catch (err) {
          return response.error(req, res, err, redirectUri)
        }

        return response.data(req, res, { code: data }, redirectUri)
      } else if (grantType === 'implicit') {
        try {
          data = await authorization.Implicit(req, res, client, scope, user, redirectUri, false)
        } catch (err) {
          return response.error(req, res, err, redirectUri)
        }

        return response.data(req, res, {
          token_type: 'bearer',
          access_token: data,
          expires_in: req.oauth2.model.accessToken.ttl
        }, redirectUri)
      }
    } else {
      return req.oauth2.decision(req, res, client, scope, user, redirectUri)
    }

    return response.error(req, res, new error.InvalidRequest('Invalid request method'), redirectUri)
  }

  if (grantType === 'authorization_code') {
    try {
      data = await authorization.Code(req, res, client, scope, user, redirectUri, true)
    } catch (err) {
      return response.error(req, res, err, redirectUri)
    }

    return response.data(req, res, { code: data }, redirectUri)
  } else if (grantType === 'implicit') {
    try {
      data = await authorization.Implicit(req, res, client, scope, user, redirectUri, true)
    } catch (err) {
      return response.error(req, res, err, redirectUri)
    }

    return response.data(req, res, {
      token_type: 'bearer',
      access_token: data,
      expires_in: req.oauth2.model.accessToken.ttl
    }, redirectUri)
  } else {
    return response.error(req, res, new error.InvalidRequest('Invalid request method'), redirectUri)
  }
})
