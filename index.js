var uuid = require('node-uuid');
var express = require('express');
var Crypto = require('./crypto');
var Command = require('./command');
var os = require('os');
var app = express();
var port = 3700;

function local_addr() {
  var ifs = os.networkInterfaces();
  var addrs = [];
  for (var i in ifs) {
    if (ifs.hasOwnProperty(i)) {
      for (var j = 0; j < ifs[i].length; ++j) {
        if (!ifs[i][j].internal) {
          if (ifs[i][j].family === 'IPv4') {
            addrs.push(ifs[i][j].address);
          }
        }
      }
    }
  }
  return addrs[0];
};

var CORS = function(req, res, next) {
   res.header('Access-Control-Allow-Origin', '*');
   res.header('Access-Control-Allow-Headers', 'Authorization, Content-Length, X-Requested-With');
   res.header('Access-Control-Expose-Headers', 'Authorization, Content-Length, X-Requested-With');
   res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');

   // intercept OPTIONS method
   if ('OPTIONS' == req.method) {
      res.send(200);
   } else {
      next();
   }
};

app.use(CORS);
app.use(express.static(__dirname + '/public'));

app.set('views', __dirname + '/tpl');
app.set('view engine', 'jade');

app.engine('jade', require('jade').__express);

app.get('/', function(req, res) {
   res.render('basic-ui', { server: local_addr() });
});

// app.listen(port);
var io = require('socket.io').listen(app.listen(port));
console.log('Listening on port ' + port);

function get_keys(obj) {
   var keys = [];
   for (var k in obj) {
      keys.push(k);
   }
   return keys;
}

function is_empty(map) {
   for(var key in map) {
      if (map.hasOwnProperty(key)) {
         return false;
      }
   }
   return true;
}

// Maintain list of authenticated clients
var Users = {};
var Clients = {};

var SocketCommand = {};

// Note: SocketCommand[socket.id].Command.Setup() must be called prior to processing any commands for the connected socket.
io.sockets.on('connection', function (socket) {

   // Setup SocketCommand
   SocketCommand[socket.id] = {};
   SocketCommand[socket.id].Command = new Command(socket, io);
   SocketCommand[socket.id].Command.Clients = Clients;
   SocketCommand[socket.id].Command.Users = Users;

   // Propagates Users by references to all SocketCommand children
   Users = SocketCommand[socket.id].Command.GetUsers();

   // Greet new socket
   socket.emit('message', { message: 'Connection successful. Please authenticate.' });

   // Handle disconnect
   socket.on('disconnect', function () {
      if (!Clients[socket.id])
         return false;

      // Broadcast user offline to all but self
      SocketCommand[socket.id].Command.Disconnect();
      
      // Update online users
      io.sockets.in('auth').emit('online', SocketCommand[socket.id].Command.Online());
   });


   // Save authenticated client details
   socket.on('auth', function (data) {
      SocketCommand[socket.id].Command.Authenticate(data.username, data.password, SocketCommand);
   });


   // Handle requests to decode messages
   socket.on('decode', function (data) {
      if (!Clients[socket.id]) {
         socket.emit('message', { message: 'Invalid ident. Please re-authenticate.' });
         return false;
      }

      SocketCommand[socket.id].Command.DecryptMessage(data.key, data.salt, data.message, data);
   });


   // List for socket to emit data to 'send'
   socket.on('send', function (data) {
      if (!Clients[socket.id]) {
         socket.emit('message', { message: 'Invalid ident. Please re-authenticate.' });
         return false;
      }

      // Handle commands
      var cmd = (data.message).match(/^\/([^\s]+)/i);
      if (cmd) {
         var args = (data.message).split(' ');
         args.shift();
         SocketCommand[socket.id].Command.Do(cmd[1], args);

         return;
      } else {
         // Send plaintext
         var send = {
            name: Users[ Clients[socket.id].username ].name,
            message: data.message,
            admin: Users[ Clients[socket.id].username ].admin
         }

         // Send encrypted
         var client_select = JSON.parse(data.client_select);
         if (!is_empty(client_select)) {
            SocketCommand[socket.id].Command.EncryptBroadcast(send, client_select);
         } else {
            send.message = SocketCommand[socket.id].Command.SanitizeMessage(send.message);
            io.sockets.in('auth').emit('message', send);
         }
      }
   });
});