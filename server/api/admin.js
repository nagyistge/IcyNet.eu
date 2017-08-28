import Users from './index'
import Models from './models'

const perPage = 6

function cleanUserObject (dbe) {
  return {
    id: dbe.id,
    username: dbe.username,
    display_name: dbe.display_name,
    email: dbe.email,
    avatar_file: dbe.avatar_file,
    activated: dbe.activated === 1,
    locked: dbe.locked === 1,
    ip_addess: dbe.ip_addess,
    password: dbe.password !== null,
    nw_privilege: dbe.nw_privilege,
    created_at: dbe.created_at
  }
}

async function cleanClientObject (dbe) {
  let user = await Users.User.get(dbe.user_id)
  return {
    id: dbe.id,
    title: dbe.title,
    description: dbe.description,
    url: dbe.url,
    redirect_url: dbe.redirect_url,
    grants: dbe.grants,
    icon: dbe.icon,
    user: {
      id: user.id,
      display_name: user.display_name
    },
    scope: dbe.scope,
    secret: dbe.secret,
    verified: dbe.verified === 1,
    created_at: dbe.created_at
  }
}

const API = {
  getAllUsers: async function (page) {
    let count = await Models.User.query().count('id as ids')
    if (!count.length || !count[0]['ids'] || isNaN(page)) {
      return {error: 'No users found'}
    }

    count = count[0].ids
    let paginated = Users.Pagination(perPage, parseInt(count), page)
    let raw = await Models.User.query().offset(paginated.offset).limit(perPage)

    let users = []
    for (let i in raw) {
      let entry = raw[i]

      users.push(cleanUserObject(entry))
    }

    return {
      page: paginated,
      users: users
    }
  },
  getAllClients: async function (page) {
    let count = await Models.OAuth2Client.query().count('id as ids')
    if (!count.length || !count[0]['ids'] || isNaN(page)) {
      return {error: 'No clients found'}
    }

    count = count[0].ids
    let paginated = Users.Pagination(perPage, parseInt(count), page)
    let raw = await Models.OAuth2Client.query().offset(paginated.offset).limit(perPage)

    let clients = []
    for (let i in raw) {
      let entry = raw[i]

      clients.push(await cleanClientObject(entry))
    }

    return {
      page: paginated,
      clients: clients
    }
  },
  getClient: async function (id) {
    let raw = await Models.OAuth2Client.query().where('id', id)
    if (!raw.length) return null

    return cleanClientObject(raw[0])
  },
  updateClient: async function (id, data) {
    if (isNaN(id)) return {error: 'Invalid client ID'}

    let fields = [
      'title', 'description', 'url', 'redirect_url', 'scope'
    ]

    for (let i in data) {
      if (fields.indexOf(i) === -1) {
        delete data[i]
      }
    }

    for (let i in fields) {
      if (!data[fields[i]] && fields[i] !== 'scope') return {error: 'Missing fields'}
    }

    try {
      await Models.OAuth2Client.query().patchAndFetchById(id, data)
    } catch (e) {
      return {error: 'No such client'}
    }

    return {}
  },
  newSecret: async function (id) {
    if (isNaN(id)) return {error: 'Invalid client ID'}
    let secret = Users.Hash(16)

    try {
      await Models.OAuth2Client.query().patchAndFetchById(id, {secret: secret})
    } catch (e) {
      return {error: 'No such client'}
    }

    return {}
  },
  createClient: async function (data, user) {
    let fields = [
      'title', 'description', 'url', 'redirect_url', 'scope'
    ]

    for (let i in data) {
      if (fields.indexOf(i) === -1) {
        delete data[i]
      }
    }

    for (let i in fields) {
      if (!data[fields[i]] && fields[i] !== 'scope') return {error: 'Missing fields'}
    }

    let obj = Object.assign({
      secret: Users.Hash(16),
      grants: 'authorization_code',
      created_at: new Date(),
      user_id: user.id
    }, data)

    return Models.OAuth2Client.query().insert(obj)
  },
  removeClient: async function (id) {
    if (isNaN(id)) return {error: 'Invalid number'}
    await Models.OAuth2Client.query().delete().where('id', id)
    await Models.OAuth2AuthorizedClient.query().delete().where('client_id', id)
    await Models.OAuth2AccessToken.query().delete().where('client_id', id)
    await Models.OAuth2RefreshToken.query().delete().where('client_id', id)
    return true
  }
}

module.exports = API
