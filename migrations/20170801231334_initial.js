
exports.up = function(knex, Promise) {
  return Promise.all([
    knex.schema.createTable('users', (table) => {
      table.increments('id').primary()

      table.string('username', 26).unique().notNullable()
      table.string('display_name', 32).notNullable()
      table.string('email').notNullable()
      table.string('avatar_file')

      table.text('password')

      table.boolean('activated').defaultTo(false)
      table.boolean('locked').defaultTo(false)
      table.integer('nw_privilege').defaultTo(0)

      table.string('ip_address').notNullable()

      table.dateTime('activity_at')
      table.timestamps()
    }),
    knex.schema.createTable('external', (table) => {
      table.increments('id').primary()

      table.integer('user_id').unsigned().notNullable()
      table.string('service')
      table.text('identifier')

      table.foreign('user_id').references('users.id').onDelete('CASCADE').onUpdate('CASCADE')
      table.timestamps()
    }),
    knex.schema.createTable('simple_token', (table) => {
      table.increments('id').primary()

      table.integer('user_id').unsigned().notNullable()
      table.integer('type').notNullable()
      table.text('token')

      table.foreign('user_id').references('users.id').onDelete('CASCADE').onUpdate('CASCADE')

      table.dateTime('expires_at')
    }),
    knex.schema.createTable('oauth2_client', (table) => {
      table.increments('id').primary()

      table.string('title')
      table.text('description')
      table.text('url')
      table.text('redirect_url')
      table.text('icon')
      table.text('secret')
      table.text('scope')
      table.text('grants')

      table.integer('user_id').unsigned().notNullable()

      table.boolean('verified')

      table.foreign('user_id').references('users.id').onDelete('CASCADE').onUpdate('CASCADE')

      table.timestamps()
    }),
    knex.schema.createTable('oauth2_client_authorization', (table) => {
      table.increments('id').primary()

      table.integer('user_id').unsigned().notNullable()
      table.integer('client_id').unsigned().notNullable()
      table.text('scope')
      table.dateTime('expires_at')

      table.foreign('user_id').references('users.id').onDelete('CASCADE').onUpdate('CASCADE')
      table.timestamps()
    }),
    knex.schema.createTable('oauth2_code', (table) => {
      table.increments('id').primary()

      table.integer('user_id').unsigned().notNullable()
      table.integer('client_id').unsigned().notNullable()
      table.text('code')
      table.text('scope')

      table.foreign('user_id').references('users.id').onDelete('CASCADE').onUpdate('CASCADE')

      table.dateTime('expires_at')
      table.timestamps()
    }),
    knex.schema.createTable('oauth2_access_token', (table) => {
      table.increments('id').primary()

      table.integer('user_id').unsigned().notNullable()
      table.integer('client_id').unsigned().notNullable()
      table.text('token')
      table.text('scope')

      table.foreign('user_id').references('users.id').onDelete('CASCADE').onUpdate('CASCADE')

      table.dateTime('expires_at')
      table.timestamps()
    }),
    knex.schema.createTable('oauth2_refresh_token', (table) => {
      table.increments('id').primary()

      table.integer('user_id').unsigned().notNullable()
      table.integer('client_id').unsigned().notNullable()
      table.text('token')
      table.text('scope')

      table.foreign('user_id').references('users.id').onDelete('CASCADE').onUpdate('CASCADE')

      table.timestamps()
    }),
    knex.schema.createTable('totp_token', (table) => {
      table.increments('id').primary()

      table.integer('user_id').unsigned().notNullable()
      table.string('token')
      table.string('recovery_code')
      table.boolean('activated')

      table.foreign('user_id').references('users.id').onDelete('CASCADE').onUpdate('CASCADE')
      table.timestamps()
    }),
    knex.schema.createTable('network_ban', (table) => {
      table.increments('id').primary()

      table.integer('user_id').unsigned().notNullable()
      table.integer('admin_id').unsigned().notNullable()
      table.string('associated_ip')
      table.string('reason')

      table.dateTime('expires_at')
      table.timestamps()
    }),
    knex.schema.createTable('news', (table) => {
      table.increments('id').primary()

      table.integer('user_id').unsigned().notNullable()
      table.string('title')
      table.string('slug')
      table.text('content')
      table.text('tags')

      table.timestamps()
    }),
    knex.schema.createTable('donation', (table) => {
      table.increments('id').primary()

      table.integer('user_id').unsigned()
      table.string('amount')
      table.string('source')
      table.text('note')
      table.boolean('read')

      table.timestamps()
    }),
    knex.schema.createTable('subscription', (table) => {
      table.increments('id').primary()
      table.integer('user_id').unsigned()
      table.timestamps()
    })
  ])
}

exports.down = function(knex, Promise) {
  return Promise.all([
    knex.schema.dropTable('sessions'),
    knex.schema.dropTable('users'),
    knex.schema.dropTable('external'),
    knex.schema.dropTable('simple_token'),
    knex.schema.dropTable('oauth2_client'),
    knex.schema.dropTable('oauth2_code'),
    knex.schema.dropTable('oauth2_access_token'),
    knex.schema.dropTable('oauth2_client_authorization'),
    knex.schema.dropTable('totp_token'),
    knex.schema.dropTable('network_ban'),
    knex.schema.dropTable('news'),
    knex.schema.dropTable('donation'),
    knex.schema.dropTable('subscription')
  ])
}
