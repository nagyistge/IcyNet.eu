
exports.up = function (knex, Promise) {
  return Promise.all([
    knex.schema.createTable('mc_member', (table) => {
      table.increments('id').primary()
      table.integer('user_id').unsigned().notNullable()
      table.string('uuid', 36)
      table.string('name')

      table.foreign('user_id').references('users.id').onDelete('CASCADE').onUpdate('CASCADE')
      table.timestamps()
    }),
    knex.schema.createTable('mc_verify', (table) => {
      table.increments('id').primary()
      table.integer('user_id').unsigned().notNullable()
      table.string('token')

      table.foreign('user_id').references('users.id').onDelete('CASCADE').onUpdate('CASCADE')
      table.timestamps()
    })
  ])
}

exports.down = function (knex, Promise) {
  return Promise.all([
    knex.schema.dropTable('mc_member'),
    knex.schema.dropTable('mc_verify')
  ])
}
