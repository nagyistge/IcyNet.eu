import error from '../../error'

module.exports = async (oauth2, client, wantScope) => {
  let scope = null

  let resObj = {
    token_type: 'bearer'
  }

  scope = oauth2.model.client.transformScope(wantScope)
  scope = oauth2.model.client.checkScope(client, scope)

  if (!scope) {
    throw new error.InvalidScope('Client does not allow access to this scope')
  } else {
    console.debug('Scope check passed ', scope)
  }

  try {
    resObj.access_token = await oauth2.model.accessToken.create(null, oauth2.model.client.getId(client), scope, oauth2.model.accessToken.ttl)
  } catch (err) {
    throw new error.ServerError('Failed to call accessToken.create function')
  }

  resObj.expires_in = oauth2.model.accessToken.ttl

  return resObj
}
