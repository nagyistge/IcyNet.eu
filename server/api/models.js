import {Model} from '../../scripts/load-database'

class User extends Model {
  static get tableName () {
    return 'users'
  }
}

class External extends Model {
  static get tableName () {
    return 'external'
  }
}

class Token extends Model {
  static get tableName () {
    return 'simple_token'
  }
}

class OAuth2Client extends Model {
  static get tableName () {
    return 'oauth2_client'
  }
}

class OAuth2AuthorizedClient extends Model {
  static get tableName () {
    return 'oauth2_client_authorization'
  }
}

class OAuth2Code extends Model {
  static get tableName () {
    return 'oauth2_client_authorization'
  }
}

class OAuth2AccessToken extends Model {
  static get tableName () {
    return 'oauth2_access_token'
  }
}

class OAuth2RefreshToken extends Model {
  static get tableName () {
    return 'oauth2_refresh_token'
  }
}

class TotpToken extends Model {
  static get tableName () {
    return 'totp_token'
  }
}

class Ban extends Model {
  static get tableName () {
    return 'network_ban'
  }
}

class News extends Model {
  static get tableName () {
    return 'news'
  }
}

class Donation extends Model {
  static get tableName () {
    return 'donation'
  }
}

class Subscription extends Model {
  static get tableName () {
    return 'subscription'
  }
}

module.exports = {
  User: User,
  External: External,
  Token: Token,
  OAuth2Client: OAuth2Client,
  OAuth2AuthorizedClient: OAuth2AuthorizedClient,
  OAuth2Code: OAuth2Code,
  OAuth2AccessToken: OAuth2AccessToken,
  OAuth2RefreshToken: OAuth2RefreshToken,
  TotpToken: TotpToken,
  Ban: Ban,
  News: News,
  Donation: Donation,
  Subscription: Subscription
}
