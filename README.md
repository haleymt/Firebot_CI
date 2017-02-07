# Firebot for Custom Integrations
Firebot is a Slack Bot for tracking activity in a team's public channels. It is written in Node.js, building off of the [ Botkit ]( https://github.com/howdyai/botkit ) library. This repository will help you install Firebot in your Slack team as a custom integration (Don't know what that is? Check out Slack's [ API documentation ]( https://api.slack.com/custom-integrations )).

If you'd like to install or contribute to the Slack App version of Firebot, go to [ this repository ]( https://github.com/haleymt/Firebot ) instead.


## Using Firebot CI
Create a bot user in whatever Slack group you'd like Firebot to post in. Navigate to `[YOUR_GROUP_NAME].com/apps/build/custom-integration` and select **Bots**. Create the bot and name it whatever you like. Be sure to hang on to the token that Slack gives you.

From there you can host the Firebot functionality in two ways:

## Firebot as its own app
`firebot_ci` is a basic Express app, meant to help you get the bot up and running as soon as possible if you don't already have an app to include it in. To host it locally or on its own server, do the following:    

**1.** Clone this repository to your computer and run `npm install`.

**2.** Create a file called `.env` and add your `token` to it. You'll also need to define the port. Your `.env` file should look like this:
```
token="XXXXXXX-XXXXXXXXX-XXXXXXXXX"
port=3000
```  

**3.** If you'd like to host the bot on its own server, deploy it as you would any other app. If you only want to host it on your local server, run `npm start` in the command line. As long as your local server is up on your computer, the bot will work in your Slack group.

**4.** **NOTE:** Before pushing any edits, be sure to either add `.env` to a `.gitignore` file, remove `.env` from your repository, or simply delete your token from `.env`. Pushing your `token` to a code repository will cause it to become invalid (you can get a new one, but that's a pain). If you're using Firebot on its own server, be sure to remove your `node_modules` too. Your `.gitignore` should look like this:
```
.env
node_modules/*
```

## Firebot in another app
Firebot is not yet available as a package on npm. If you'd like to run it within an app you already have, do the following:  

**1.** Download the `firebot.js` file from this repository.

**2.** Include the latest version of Botkit in your `package.json`.  

**3.** Include `firebot.js` somewhere in your application.  

**4.** Include your `token` in your application's `process.env`.  

**5.** Import `firebot` and run it somewhere in your application. Pass in your token. Your file will look something like this:  
```javascript
var Firebot = require('./firebot');

Firebot.run({ token: process.env.firebot_token });

// If you'd like to stop Firebot at any time, you can do that too.
if (xyz) {
  Firebot.stop();
}

// If you stopped Firebot and you'd like to resume it:
if (!Firebot.is_active) {
  Firebot.restart();
}

```
