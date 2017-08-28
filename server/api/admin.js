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
  }
}

module.exports = API
