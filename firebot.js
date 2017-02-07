/* Main Firebot functionality */

if (!process.env.token) {
  console.log('Error: Specify token in environment');
  process.exit(1);
}

var Botkit = require('botkit');
var { subtypeWhitelist, responses, defaultInterval, historyConfig } = require('./constants');

var Firebot = {
  allUsers: [],
  allChannels: [],
  deadChannels: [],
  dailyActiveChannels: [],
  recentActiveChannels: [],
  memberChannels = [],
  hourlyActivity: {},
  is_active: false,

  run: function (options) {
    this.token = options.token;
    this.controller = Botkit.slackbot({
      debug: true,
      retry: Infinity,
    });

    this.attachEventListeners();
    this.attachConversationListeners();

    this.bot = this.controller.spawn({
      token: options.token
    });

    this.setUpBot();
  },

  stop: function() {
    this.stopInterval();
    this.bot.closeRTM();
    this.is_active = false;
  },

  resume: function() {
    this.setUpBot();
  },

  attachEventListeners: function() {
    var { controller } = this;

    controller.on('channel_created', function(bot,res) {
      if (res && res.channel) {
        this.allChannels.push(res.channel);
      }
    }.bind(this));

    controller.on('channel_archive', function(bot,res) {
      for (var c in bot.allChannels) {
        if (this.allChannels[c].id === res.channel) {
          this.allChannels.splice(c, 1);
        }
      }

      for (var ch in this.memberChannels) {
        if (this.memberChannels[ch] === res.channel) {
          this.memberChannels.splice(ch, 1);
        }
      }
    }.bind(this));

    controller.on('bot_channel_join', function(bot, res) {
      var bot_id = bot.config.bot.user_id;
      if (res.user === bot_id) {
        this.memberChannels.push(res.channel);
      }
    }.bind(this));

    controller.on('channel_left', function(bot, res) {
      for (var ch in this.memberChannels) {
        if (this.memberChannels[ch] === res.channel) {
          this.memberChannels.splice(ch, 1);
        }
      }
    }.bind(this));
  },

  attachConversationListeners: function() {
    var { controller } = this;

    controller.hears(['which channels(.*)'], 'ambient,direct_message,direct_mention,mention', function(bot, message) {
      var question = message.match[1];
      var type;

      if (question === ' are dead') {
        type = 'dead';
      } else if (question === ' are active') {
        type = 'daily';
      }

      if (type) {
        var { channelList, emptyListText } = historyConfig[type];

        this[channelList] = [];
        this.getChannelActivity(type, function(channel, isComplete) {
          if (channel) {
            this[channelList].push(channel);
          }

          if (isComplete) {
            var text = emptyListText;
            if (this[channelList].length) {
              text = this.formatBotText(this[channelList], type);
            }
            bot.reply(message, text);
          }
        });
      }
    }.bind(this));

    controller.hears(['who is lit'], 'ambient,direct_message,direct_mention,mention', function(bot, message) {
      bot.reply(message, 'firebot is pretty lit');
    });

    controller.hears(['am i lit'], 'ambient,direct_message,direct_mention,mention', function(bot, message) {
      bot.reply(message, 'nope');
    });

    controller.hears(['is (.*) lit', 'are (.*) lit'], 'ambient,direct_message,direct_mention,mention', function(bot, message) {
      var channel = message.match[1];

      if (channel) {
        var text = 'nope';

        if (channel[0] === '#') {
          channel = channel.slice(1);
        }

        if (channel[0] === '<') {
          var pipeIndex = channel.indexOf('|');
          if (pipeIndex > -1) {
            /* Gets a channel name from a mention */
            channel = channel.slice(pipeIndex + 1, channel.length - 1);
          } else if (channel[1] === '@') {
            /* Gets a user name from a mention */
            channel = channel.slice(2, channel.length - 1);
          }
        }

        for (var i = 0; i < this.allUsers.length; i++) {
          if (this.allUsers[i].id === channel || this.allUsers[i].name === channel) {
            channel = this.allUsers[i].name;
            text = responses.grabBag[Math.floor(Math.random() * responses.grabBag.length)];
          }
        }

        if (this.hourlyActivity[channel]) {
          text = channel === 'yep';
        }

        bot.reply(message, text);
      }
    }.bind(this));
  },

  setUpBot: function () {
    this.bot.startRTM(function(err, bot, payload) {
      if (payload) {
        if (payload.channels) {
          payload.channels.forEach(function(channel) {
            if (!channel.is_archived) {
              var bot_id = bot.config.bot.user_id;
              this.allChannels.push(channel);
              if (channel.members && channel.members.indexOf(bot_id) > -1 && this.memberChannels.indexOf(channel.id) < 0) {
                this.memberChannels.push(channel.id);
              }
            }
          }.bind(this));
        }

        if (payload.users) {
          this.allUsers = payload.users;
        }
      }

      if (err === "account_inactive") {
        this.stop();
      }

      if (!err) {
        this.startInterval();
      }
    }.bind(this));
  },

  stopInterval: function() {
    clearInterval(this.checkInterval);
    this.checkInterval = null;
  },

  startInterval: function () {
    /* Clears interval if it already exists */
    if (this.checkInterval) {
      this.stopInterval();
    }

    /* Checks level of activity every 10 minutes (600000ms)*/
    this.checkInterval = setInterval( function () {
      this.recentActiveChannels = [];

      this.getChannelActivity('recent', function (channel, isLast) {
        if (channel) {
          this.recentActiveChannels.push(channel);

          if (!this.hourlyActivity[channel.name] || this.hourlyActivity[channel.name] === 5) {
            this.hourlyActivity[channel.name] = 1;
          } else {
            this.hourlyActivity[channel.name] += 1;
          }
        }

        if (isLast) {
          /* Only announces channels that haven't been announced in the last half hour */
          var filteredChannels = [];
          for (var i in this.recentActiveChannels) {
            if (this.hourlyActivity[this.recentActiveChannels[i].name] === 1) {
              filteredChannels.push(this.recentActiveChannels[i]);
            }
          }

          /* If a channel wasn't active during the last tick, it resets the hourly count to 0 */
          Object.keys(this.hourlyActivity).forEach(function(key) {
            if (!this.recentActiveChannels.find(function(channel) { channel.name === key })) {
              var value = this.hourlyActivity[key];
              this.hourlyActivity[key] = value && value < 5 ? value + 1 : 0;
            }
          });

          if (filteredChannels.length) {
            var text = this.formatBotText(filteredChannels, "lit");
            for (var c in this.memberChannels) {
              bot.send({ text, channel: this.memberChannels[c] });
            }
          }
        }
      }.bind(this));
    }.bind(this), defaultInterval);
  },

  getChannelList: function(callback) {
    /* Slack API call to get list of channels */
    var { bot, token } = this;
    if (this.allChannels && this.allChannels.length) {
      callback(this.allChannels);
    } else {
      bot.api.channels.list({ token }, function (err, res) {
        if (res && res.ok) {
          this.allChannels = res.channels;
          callback(res.channels);
        }
      }.bind(this));
    }
  },

  getChannelHistory: function(channel, type, callback) {
    /* milliseconds in a day === 86400000 */
    /* milliseconds in 15 minutes === 900000 */
    var { bot, token } = this;
    var { timeOffset, messageMinimum } = historyConfig[type];
    var oldestTime = (new Date().getTime() - timeOffset) / 1000;

    bot.api.channels.history({
      token,
      channel: channel.id,
      oldest: oldestTime,
      count: 50,
    }, function(err, res) {
      var isValid = res && res.ok && res.messages && ((!messageMinimum && !res.messages.length) || (messageMinimum && this.channelIsActive(res.messages, messageMinimum)));
      callback(isValid);
    }.bind(this));
  },

  getChannelActivity: function(type, callback) {
    /* Gets list of channels with more than X messages in the last day */

    this.getChannelList(function (channels) {
      /*
        Only fetches the next channel's information once the previous one is fetched.
        A lot of nested callbacks. Cleaner way to do it?
      */
      var idx = 0;

      var loopArray = function(arr) {
        this.getChannelHistory(channels[idx], type, function(isValid) {
          var isLast = idx === arr.length - 1;
          if (isValid) {
            callback(channels[idx], isLast);
          } else if (isLast) {
            callback(false, isLast);
          }

          idx++;

          if (idx < arr.length) {
            loopArray(arr);
          }
        });
      };

      if (channels) {
        loopArray(channels).bind(this);
      }
    }.bind(this));
  },

  channelIsDead: function(channel) {
    return this.deadChannels.find(function(ch) { return ch.id === channel.id });
  },

  channelIsActive: function(messages, minimum) {
    var users = [];
    var messageCount = 0;

    for (var i = 0; i < messages.length; i++) {
      if (!messages[i].subtype || subtypeWhitelist.indexOf(messages[i].subtype) > -1) {
        messageCount++;
      }

      if (users.indexOf(messages[i].user) < 0) {
        users.push(messages[i].user);
      }
    }

    return messageCount > minimum && users.length > 1;
  },

  formatMessage: function(text) {
    return {
      text,
      username: 'firebot_nametest',
      icon_emoji: ':fire:'
    };
  },

  formatBotText: function(channelList, type) {
    var text = 'The ';
    var pastTense = type === 'daily' || type === 'revived';
    var channelName;

    for (var i = 0; i < channelList.length; i++) {
      channelName = this.formatChannelName(channelList[i].name);
      if (channelList.length === 1) {
        text += `${channelName} channel ${pastTense ? 'was' : 'is'} `;
      } else if (i === channelList.length - 1) {
        text += ` and ${channelName} channels ${pastTense ? 'were' : 'are'} `;
      } else if (i === channelList.length - 2) {
        text += `${channelName}`;
      } else {
        text += `${channelName}, `;
      }
    }

    if (type === 'daily') {
      text += 'busy today.';
    } else if (type === 'revived') {
      text += 'revived!!!';
    } else if (type === 'dead') {
      text += 'pretty dead. No new posts in the last week.'
    } else {
      text += 'lit right now.';
    }

    return text;
  },

  formatChannelName: function(channelName) {
    if (this.allChannels && this.allChannels.length) {
      var chan = this.allChannels.find(function(channel) {
        return channel.name === channelName;
      });

      if (chan) {
        return '<#' + chan.id + '|' + channelName + '>';
      }
    }

    return channelName;
  }
};

module.exports = Firebot;
