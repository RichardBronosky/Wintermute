var Plugin = require('../lib/wintermute').Plugin;
var plugin = new Plugin();
var exec = require("child_process").exec;


plugin.help = 'fortunes and stuff';
plugin.author = 'justin';

plugin.on('chat', function(bot, msg) {
  var match = msg.text.match(/^\.(fortune-help|fortune)\s?([a-z|0-9|-]+)?/);
  if(match) {
    var fortune_type = '';
    if (match[2]) {
      fortune_type = match[2];
    }

    if (match[1] == 'fortune-help') {
      exec("fortune -f", function (err, stdout, stderr) {
        if (err) return;
        var oneline = stderr.replace(/(\r\n|\n|\r)/gm,"").split(' ');
        var results = [];
        for ( i = 3; i < oneline.length; i=i+2) {
          if(oneline[i].length > 0) { results.push(' '+ oneline[i]); }
	}
        bot.say(msg.channel, results);
      });
    } else {
        exec("fortune -s " + fortune_type, function (err, stdout, stderr) {
          if (err) return;
          bot.say(msg.channel, stdout.replace(/(\r\n|\n|\r)/gm," "));
	});
    }
  }
});

exports.plugin = plugin;
