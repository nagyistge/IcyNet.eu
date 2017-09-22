
exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('users', (table) => {
      table.string('uuid', 36)
    }),
    knex.schema.table('news', (table) => {
      table.dropColumn('slug')
    })
  ])
}

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.table('users', (table) => {
      table.dropColumn('uuid')
    }),
    knex.schema.table('news', (table) => {
      table.string('slug')
    })
  ])
}
