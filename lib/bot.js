var events = require('events');
var path = require('path');
var sys = require('sys');

var util = require(path.join(__dirname, 'util'));

function Bot(config) {
  events.EventEmitter.call(this);
  this.config = {
    host:             '127.0.0.1',
    port:             6667,
    nick:             'wintermute',
    user:             'wintermute',
    realname:         'tessier ashpool',
    // openssl genrsa -out ryans-key.pem 1024
    ssl_cert_file:    undefined,
    plugins_dir:      path.join(__dirname, '../plugins'),
    default_plugins:  [],
    default_channels:  []
  };
  this.config = util.update.call(this.config, config);

  this.plugins = {};

  this.buffer = '';

  // Handlers that respond to low-level events
  this.on('connect', this.on_connect);
  this.on('disconnect', this.on_disconnect);
  this.on('data', this.on_data);

  // Prepare basic message events for higher-level event handlers
  this.on('message', function(message){
    // TODO: what if message has no .command?
    if (! /PING|PRIVMSG|NOTICE|MODE|\d{1,4}/.test(message.command)) {
      console.log('<', message);
    }
    this.emit(message.command, message);
    this.emit_to_plugins(message.command, message);
  });

  // Handlers that process specific IRC commands
  this.on('PING', function(message){
    this.send('PONG', 'localhost');
  });
  this.on('PRIVMSG', function(message){
    message.text = message.params[1];
    if (message.params[0] == this.config.nick) {
      this.emit('whisper', message);
      this.emit_to_plugins('whisper', message);
    } else {
      message.channel = message.params[0];
      this.emit('chat', message);
      this.emit_to_plugins('chat', message);
    }
  });
  this.on('NOTICE', function(message){
    message.sender = message.params[0];
    message.text = message.params[1];
    console.log('!', message.sender, ':', message.text);
  });

  // Higher-level event handlers, usually triggered by IRC event handlers
  this.on('whisper', function(message){
    console.log(
      '<', message.nick, 'whispers,', message.text);
  });
  this.on('chat', function(message){
    console.log(
      '< in', message.channel, '<' + message.nick + '>', message.text);
  });

  // plugin setup
  var that = this;
  this.config.default_plugins.forEach(function(x) { that.load_plugin.call(that, x) });
  // reload a plugin
  this.on('chat', function(message) {
    var match = message.text.match(/^\.(reload|unload|load) +([^ ]+)/);
    if (match === null) { return; }
    var plugin_command = match[1];
    var plugin_path = match[2];
    this[plugin_command+'_plugin'](plugin_path);
  });
}
sys.inherits(Bot, events.EventEmitter);

// core Bot functionality
Bot.prototype.connect = function() {
  var that = this;
  var onconnect = function() {
    that.emit('connect');
  };

  if (this.config.ssl_key_file) {
    // FIXME it's bizarre that .on('connect', onconnect) does not work with
    // this the way it does for net.createConnection, and everything else does.
    // What the heck is going on??
    this.connection = require('tls').connect(
        this.config.port,
        this.config.host,
        {key: fs.readFileSync(this.config.ssl_key_file)},
        onconnect);
  } else {
    this.connection = require('net').createConnection(
        this.config.port,
        this.config.host
        ).on('connect', onconnect);
  }
  this.connection.setEncoding('utf8');
  this.connection.setTimeout(60*60*10);
  this.connection.on('data', function(chunk) {that.emit('data', chunk)});
  this.connection.on('disconnect', function() {that.emit('disconnect')});
};

Bot.prototype.disconnect = function() {
  if (this.connection.readyState !== 'closed') {
    this.connection.close();
  }
};

Bot.prototype.send = function(command, params, prefix) {
  // prefix: optional string
  // params: string or Array of strings. If Array, only the last may contain
  // spaces.
  return this.raw(''
      + (prefix
        ? ':' + prefix + ' '
        : '')
      + command
      + (params
        ? ' ' +
          (typeof(params) == 'string'
          ? ':' + params
          : params.slice(0, -1).concat(':' + params.slice(-1)).join(' '))
        : ''));
}

Bot.prototype.raw = function(message) {
  if (this.connection.readyState !== 'open') {
    console.error('raw: not connected');
    return;
  }

  if (message.length > 450) {
    console.error('Message too long: ' + message);
    return;
  }

  if (/PASS /.test(message)) {
    console.log('> PASS (not displaying password)');
  } else {
    console.log('>', message);
  }
  this.connection.write(message + "\r\n", 'utf8');
};

// Event handlers
Bot.prototype.on_connect = function() {
  console.log('connected');
  if (this.config.password) {
    this.send('PASS', this.config.password);
  }

  this.send('NICK', this.config.nick);
  this.send('USER', [
    this.config.user, 0, '*', this.config.realname]);
  // auto join default channels
  this.config.default_channels.forEach(function(channel) {
    this.join(channel);
  }, this);
};

Bot.prototype.on_disconnect = function() {
  console.log('disconnected');
};

Bot.prototype.on_data = function(chunk) {
  this.buffer += chunk;
  while (this.buffer) {
    var offset = this.buffer.indexOf("\r\n");
    if (offset < 0) {
      return;
    }
    var line = this.buffer.slice(0, offset);
    this.buffer = this.buffer.slice(offset+2);

    // FIXME shouldn't this RE get built somewhere global-ish so we don't have
    // to compile it for every data chunk?
    //
    // build a message object containing all the parts
    // See RFC2812, Section 2.3.
    var irc_lineparse_re = new RegExp(
        // Match the whole line. Start.
        "^" +
        // Optional prefix and the space that separates it from the next thing.
        // Prefix can be a servername, or nick[[!user]@host]
        "(?::(([^@! ]*)(?:(?:!([^@]*))?@([^ ]*))?) )?" +
        // IRC command (required)
        "([^ ]+)" +
        // Optional args, max 15, space separated. Last arg is the only one
        // that may contain inner spaces. More than 15 words means remainder of
        // words are part of 15th arg. Last arg may be indicated by a colon
        // prefix instead. Pull the leading and last args out separately; we
        // have to split the former on spaces.
        "((?: [^: ][^ ]*){0,14})" + // stops matching on arg 15 or colon
        "(?: :?(.*))?" + // catptures the rest, does not capture colon.
        // EOL
        "$"
        );

    var res = irc_lineparse_re.exec(line);

    if (! res) {
      console.error('The server sent a line that does not look like IRC protocol:', line);
      continue;
    }

    var message = {
      raw: line, // Whole line
      prefix: res[1], // complete prefix
      nick: res[2], // or servername
      username: res[3],
      hostname: res[4],
      command: res[5],
      params: res[6].
        split(' ').
        slice(1).   // First char of args is always ' '
        concat(res[7] ? res[7] : [])
    };
    this.emit('message', message);
  }
};

// Actions
Bot.prototype.say = function(channel, text) {
  var headers = 'PRIVMSG ' + channel + ' :';
  var message_limit = 450 - headers.length;
  var that = this;
  sendmsg = function(str){that.send('PRIVMSG', [channel, str]);};
  text.match(RegExp("((?:.){1,"+message_limit+"}(?: |$))","g")).forEach(sendmsg);
};

Bot.prototype.join = function(channel) {
  this.send('JOIN', [channel]);
};

Bot.prototype.action = function(channel, action) {
  this.send(channel, '\001ACTION ' + action + '\001');
};

// Plugins
Bot.prototype.emit_to_plugins = function() {
  var evnt = arguments[0];
  var bot = this;
  var rest = Array.prototype.slice.call(arguments, 1);
  var args_for_emit = [evnt, bot].concat(rest);
  util.items.call(this.plugins, function(full_plugin_path, plugin) {
    plugin.emit.apply(plugin, args_for_emit);
  });
};

Bot.prototype.load_plugin = function(plugin_name) {
  var full_plugin_path = path.join(this.config.plugins_dir, plugin_name);
  try {
    console.log('Loading plugin: ' + plugin_name);
    var plugin = require(full_plugin_path).plugin;
    plugin.name = plugin_name;
    this.plugins[plugin_name] = plugin;
  }
  catch (exc) {
    console.error('Error loading plugin "'+full_plugin_path+'": '+exc);
  };
};

Bot.prototype.unload_plugin = function(plugin_name) {
  var full_plugin_path = path.join(this.config.plugins_dir, plugin_name);
  delete require.cache[require.resolve(full_plugin_path)];
  delete this.plugins[plugin_name];
};

Bot.prototype.reload_plugin = function(plugin_name) {
  this.unload_plugin(plugin_name);
  this.load_plugin(plugin_name);
};

// personality
// TODO

exports.Bot = Bot;
