# IcyNet.eu
Icy Network Primary Web Application - Authentication and News

## About Icy Network
Icy Network is a community network aimed at anyone who likes friendly discussions and playing multiplayer games, such as Minecraft.

### Currently IcyNet-managed community platforms
* mc.icynet.eu - Minecraft Server
* [Discord server](https://discord.gg/Xe7MKSx)
* icynet.ml - IRC Network

More to come!

## The Goal of this Application
This application is used for authentication services such as OAuth2 in order to unite our websites with a single login and as a central news outlet for Icy Network services.

## Setup
The first time you run the application, it will migrate the database and that may take a while. **You will also need a running instance of `redis-server` for session storage!**
### Development
1. Clone this repository and `cd` into it
2. `npm install` - Get all the dependencies
3. `cp config.example.toml config.toml` - Copy the configuration
4. `npm run watch` - Run the style and front-end script watch task
5. `npm start -- -d` - Start the application in development mode

There is also a watch mode for the server. To enable `server` file tree watching you must provide both `-d` and `-w` as parameters. This task will reset all workers when any file in the `server` directory changes, enabling for live debugging.

### Production
1. `npm run build` - Build the front-end
2. `npm start` - Start the application in production mode
