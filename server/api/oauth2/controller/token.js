import token from './tokens'
import error from '../error'
import response from '../response'
import wrap from '../../../../scripts/asyncRoute'

module.exports = wrap(async (req, res) => {
  let clientId = null
  let clientSecret = null
  let grantType = null

  if (req.body.client_id && req.body.client_secret) {
    clientId = req.body.client_id
    clientSecret = req.body.client_secret
    console.debug('Client credentials parsed from body parameters', clientId, clientSecret)
  } else {
    if (!req.headers || !req.headers.authorization) {
      return response.error(req, res, new error.InvalidRequest('No authorization header passed'))
    }

    let pieces = req.headers.authorization.split(' ', 2)
    if (!pieces || pieces.length !== 2) {
      return response.error(req, res, new error.InvalidRequest('Authorization header is corrupted'))
    }

    if (pieces[0] !== 'Basic') {
      return response.error(req, res, new error.InvalidRequest('Unsupported authorization method:', pieces[0]))
    }

    pieces = new Buffer(pieces[1], 'base64').toString('ascii').split(':', 2)
    if (!pieces || pieces.length !== 2) {
      return response.error(req, res, new error.InvalidRequest('Authorization header has corrupted data'))
    }

    clientId = pieces[0]
    clientSecret = pieces[1]
    console.debug('Client credentials parsed from basic auth header:', clientId, clientSecret)
  }

  if (!req.body.grant_type) {
    return response.error(req, res, new error.InvalidRequest('Request body does not contain grant_type parameter'))
  }

  grantType = req.body.grant_type
  console.debug('Parameter grant_type is', grantType)

  let client = await req.oauth2.model.client.fetchById(clientId)
  
  if (!client) {
    return response.error(req, res, new error.InvalidClient('Client not found'))
  }

  let valid = req.oauth2.model.client.checkSecret(client, clientSecret)
  if (!valid) {
    return response.error(req, res, new error.UnauthorizedClient('Invalid client secret'))
  }

  if (!req.oauth2.model.client.checkGrantType(client, grantType) && grantType !== 'refresh_token') {
    return response.error(req, res, new error.UnauthorizedClient('Invalid grant type for the client'))
  } else {
    console.debug('Grant type check passed')
  }

  let evt
  try {
    switch (grantType) {
      case 'authorization_code':
        evt = await token.authorizationCode(req.oauth2, client, req.body.code, req.body.redirect_uri)
        break
      case 'password':
        evt = await token.password(req.oauth2, client, req.body.username, req.body.password, req.body.scope)
        break
      case 'client_credentials':
        evt = await token.clientCredentials(req.oauth2, client, req.body.scope)
        break
      case 'refresh_token':
        evt = await token.refreshToken(req.oauth2, client, req.body.refresh_token, req.body.scope)
        break
      default:
        throw new error.UnsupportedGrantType('Grant type does not match any supported type')
    }

    if (evt) {
      response.data(req, res, evt)
    }
  } catch (e) {
    response.error(req, res, e)
  }
})
