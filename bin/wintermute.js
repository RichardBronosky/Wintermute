var fs = require('fs');
var path = require('path');
var repl = require('repl');

var Bot = require(path.join(__dirname, '../lib/bot')).Bot;


// TODO make this -c or --config, not just a pos arg
var rc = process.argv[2] || path.join(process.env.HOME, '.wintermuterc');

var config = {};
try {
  config = JSON.parse(fs.readFileSync(rc, 'utf8'));
} catch(e) {
  console.error('Caught error reading '+rc+': '+e);
  process.exit();
}

var bot = new Bot(config);
bot.connect();

// TODO make a socket repl
repl.start('irc>').context.bot = bot;
