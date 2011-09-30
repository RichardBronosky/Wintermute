var plugin = new (require('../lib/wintermute').Plugin)();

plugin.help   = 'auto join channels when invited';
plugin.author = 'rbronosky';

plugin.on('INVITE', function(bot, msg) {
  bot.join(msg.params[1]);
});

exports.plugin = plugin;
