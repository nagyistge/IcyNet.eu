import error from '../../error'

module.exports = async (oauth2, client, pRefreshToken, scope) => {
  let user = null
  let ttl = null
  let refreshToken = null
  let accessToken = null

  let resObj = {
    token_type: 'bearer'
  }

  if (!pRefreshToken) {
    throw new error.InvalidRequest('refresh_token is mandatory for refresh_token grant type')
  }

  try {
    refreshToken = await oauth2.model.refreshToken.fetchByToken(pRefreshToken)
  } catch (err) {
    throw new error.ServerError('Failed to call refreshToken.fetchByToken function')
  }

  if (!refreshToken) {
    throw new error.InvalidGrant('Refresh token not found')
  }

  if (oauth2.model.refreshToken.getClientId(refreshToken) !== oauth2.model.client.getId(client)) {
    console.warn('Client "' + oauth2.model.client.getId(client) + '" tried to fetch a refresh token which belongs to client"' + 
      oauth2.model.refreshToken.getClientId(refreshToken) + '"')
    throw new error.InvalidGrant('Refresh token not found')
  }

  try {
    user = await oauth2.model.user.fetchById(oauth2.model.refreshToken.getUserId(refreshToken))
  } catch (err) {
    throw new error.ServerError('Failed to call user.fetchById function')
  }

  if (!user) {
    throw new error.InvalidClient('User not found')
  }

  try {
    accessToken = await oauth2.model.accessToken.fetchByUserIdClientId(oauth2.model.user.getId(user), oauth2.model.client.getId(client))
  } catch (err) {
    throw new error.ServerError('Failed to call accessToken.fetchByUserIdClientId function')
  }

  if (accessToken) {
    ttl = oauth2.model.accessToken.getTTL(accessToken)

    if (!ttl) {
      accessToken = null
    } else {
      resObj.access_token = oauth2.model.accessToken.getToken(accessToken)
      resObj.expires_in = ttl
    }
  }

  if (!accessToken) {
    try {
      resObj.access_token = await oauth2.model.accessToken.create(oauth2.model.user.getId(user), 
        oauth2.model.client.getId(client), oauth2.model.refreshToken.getScope(refreshToken), oauth2.model.accessToken.ttl)
    } catch (err) {
      throw new error.ServerError('Failed to call accessToken.create function')
    }

    resObj.expires_in = oauth2.model.accessToken.ttl
  }

  return resObj
}
