var plugin = new (require('../lib/wintermute').Plugin)();

plugin.help   = 'get everybody\'s attention';
plugin.author = 'rbronosky';
plugin.listen = false;

plugin.on('353', function(bot, msg) {
  if(plugin.listen){
    msg.params[3].match(/([^ ]+ ?){1,10}/g).forEach(function(names){
      bot.say(msg.params[2], 'ATTENTION ^^ '+names);
    })
  }
  plugin.listen = false;
});

plugin.on('chat', function(bot, msg) {
  var match = msg.text.match(RegExp('^\.'+plugin.name));
  if(match) {
    bot.send("NAMES", msg.params[0])
    plugin.listen = true;
  }
});

exports.plugin = plugin;
