import error from '../../error'

module.exports = async (oauth2, client, username, password, scope) => {
  let user = null
  let resObj = {
    token_type: 'bearer'
  }

  if (!username) {
    throw new error.InvalidRequest('Username is mandatory for password grant type')
  }

  if (!password) {
    throw new error.InvalidRequest('Password is mandatory for password grant type')
  }

  scope = oauth2.model.client.transformScope(scope)
  scope = oauth2.model.client.checkScope(client, scope)
  if (!scope) {
    throw new error.InvalidScope('Client does not allow access to this scope')
  } else {
    console.debug('Scope check passed: ', scope)
  }

  try {
    user = await oauth2.model.user.fetchByUsername(username)
  } catch (err) {
    throw new error.ServerError('Failed to call user.fetchByUsername function')
  }

  if (!user) {
    throw new error.InvalidClient('User not found')
  }

  let valid = await oauth2.model.user.checkPassword(user, password)
  if (!valid) {
    throw new error.InvalidClient('Wrong password')
  }

  try {
    await oauth2.model.refreshToken.removeByUserIdClientId(oauth2.model.user.getId(user), oauth2.model.client.getId(client))
  } catch (err) {
    throw new error.ServerError('Failed to call refreshToken.removeByUserIdClientId function')
  }

  console.debug('Refresh token removed')

  if (!oauth2.model.client.checkGrantType(client, 'refresh_token')) {
    console.debug('Client does not allow grant type refresh_token, skip creation')
  } else {
    try {
      resObj.refresh_token = await oauth2.model.refreshToken.create(oauth2.model.user.getId(user), oauth2.model.client.getId(client), scope)
    } catch (err) {
      throw new error.ServerError('Failed to call refreshToken.create function')
    }
  }

  try {
    resObj.access_token = await oauth2.model.accessToken.create(oauth2.model.user.getId(user), oauth2.model.client.getId(client), scope, oauth2.model.accessToken.ttl)
  } catch (err) {
    throw new error.ServerError('Failed to call accessToken.create function')
  }

  resObj.expires_in = oauth2.model.accessToken.ttl
  console.debug('Access token saved ', resObj.access_token)

  return resObj
}
