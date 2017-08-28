import Users from './index'
import Models from './models'

const perPage = 6

function cleanUserObject (dbe, admin) {
  return {
    id: dbe.id,
    username: dbe.username,
    display_name: dbe.display_name,
    email: dbe.email,
    avatar_file: dbe.avatar_file,
    activated: dbe.activated === 1,
    locked: dbe.locked === 1,
    ip_address: dbe.ip_address,
    password: dbe.password !== null,
    nw_privilege: dbe.nw_privilege,
    created_at: dbe.created_at,
    bannable: dbe.nw_privilege < admin.nw_privilege && dbe.id !== admin.id
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

async function cleanBanObject (dbe) {
  let user = await Users.User.get(dbe.user_id)
  let admin = await Users.User.get(dbe.admin_id)
  return {
    id: dbe.id,
    reason: dbe.reason,
    user: {
      id: user.id,
      display_name: user.display_name
    },
    admin: {
      id: admin.id,
      display_name: admin.display_name
    },
    expires_at: dbe.expires_at,
    created_at: dbe.created_at,
    ip_address: dbe.associated_ip,
    expired: dbe.expires_at && new Date(dbe.expires_at).getTime() < Date.now()
  }
}

const API = {
  getAllUsers: async function (page, adminId) {
    let count = await Models.User.query().count('id as ids')
    if (!count.length || !count[0]['ids'] || isNaN(page)) {
      return {error: 'No users found'}
    }

    count = count[0].ids
    let paginated = Users.Pagination(perPage, parseInt(count), page)
    let raw = await Models.User.query().offset(paginated.offset).limit(perPage)
    let admin = await Users.User.get(adminId)

    let users = []
    for (let i in raw) {
      let entry = raw[i]

      users.push(cleanUserObject(entry, admin))
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
      await Models.OAuth2AuthorizedClient.query().delete().where('client_id', id)
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
  },
  getAllBans: async function (page) {
    let count = await Models.Ban.query().count('id as ids')
    if (!count.length || !count[0]['ids'] || isNaN(page)) {
      return {error: 'No bans on record'}
    }

    count = count[0].ids
    let paginated = Users.Pagination(perPage, parseInt(count), page)
    let raw = await Models.Ban.query().offset(paginated.offset).limit(perPage)

    let bans = []
    for (let i in raw) {
      let entry = raw[i]

      bans.push(await cleanBanObject(entry))
    }

    return {
      page: paginated,
      bans: bans
    }
  },
  removeBan: async function (banId) {
    if (isNaN(banId)) return {error: 'Invalid number'}
    return Models.Ban.query().delete().where('id', banId)
  },
  addBan: async function (data, adminId) {
    let user = await Users.User.get(parseInt(data.user_id))

    if (!user) return {error: 'No such user.'}
    if (user.id === adminId) return {error: 'Cannot ban yourself!'}

    let admin = await Users.User.get(adminId)

    if (user.nw_privilege > admin.nw_privilege) return {error: 'Cannot ban user.'}

    let banAdd = {
      reason: data.reason || 'Unspecified ban',
      admin_id: adminId,
      user_id: user.id,
      expires_at: data.expires_at != null ? new Date(data.expires_at) : null,
      created_at: new Date(),
      associated_ip: data.ip_address || user.ip_address || null
    }

    await Models.Ban.query().insert(banAdd)
    return {}
  }
}

module.exports = API
