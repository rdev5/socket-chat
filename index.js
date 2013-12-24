var uuid = require('node-uuid');
var express = require('express');
var crypto = require('crypto');
var Crypto = require('./crypto');
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
  console.log(addrs[0]);
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

function broadcast(emitter, data, excludes, includes) {
   for (var socket_id in clients) {
      var u = clients[socket_id].uuid;

      if (excludes !== undefined && excludes.length > 0 && excludes.indexOf(u) !== -1)
         continue;

      if (includes !== undefined && includes.indexOf(u) === -1)
         continue;

      clients[socket_id].socket.emit(emitter, data);
   }
}

function logoff(socket) {
   // Leave room
   socket.leave('auth');

   // Revert form controls via 'connected'
   socket.emit('connected');

   // Remove from clients
   delete clients[socket.id];

   // Update client list on logoff
   io.sockets.in('auth').emit('online', get_users_online());
}

function shuffle_string(value) {
   var a = value.split(""),
      n = a.length;

   for(var i = n - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
   }

   return a.join("");
}

function random_string(len, possible) {
   var text = "";

   if (!possible) {
      possible = "$#*ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
   }

   for( var i=0; i < len; i++ )
   text += possible.charAt(Math.floor(Math.random() * possible.length));

   return text;
}

function generate_key() {
   var key = uuid.v4();
   key = key.replace(/\-/g, random_string(1));
   // key = shuffle_string(key);

   return key;
}

function generate_salt() {
   var salt = uuid.v4();
   salt = salt.replace(/\-/g, random_string(1));
   // salt = shuffle_string(salt);

   return salt;
}

// Crypto configuration
const IV_SIZE = 16;
const INTEGER_LEN = 4;
const ITERATIONS = 65536;
const KEY_LEN = 16;
const DEFAULT_ENCRYPTION_ALGORITHM = 'aes-128-cbc';
const DEFAULT_ENCODING = 'hex';

function client_encrypt(value, key, salt, callback) {

   // Step 1: Generate cryptographically strong pseudo-random IV
   crypto.randomBytes(IV_SIZE, function(err, iv) {
      if(err) {
         return callback(err);
      }
      
      // Step 2: Password based key encryption
      crypto.pbkdf2(key, salt, ITERATIONS, KEY_LEN, function(err, k) {

         var ciphertext;
         cipher = crypto.createCipheriv(DEFAULT_ENCRYPTION_ALGORITHM, k, iv);
         ciphertext = cipher.update(value);
         ciphertext += cipher.final('binary');

         // Setup binary buffers
         var n_buffer = new Buffer(INTEGER_LEN);
         n_buffer.writeUInt32BE(IV_SIZE, 0); // BIG_ENDIAN

         // console.log('n_buffer:' + n_buffer.toString());

         var i_buffer = new Buffer(iv, 'binary');
         var c_buffer = new Buffer(ciphertext, 'binary');

         // Assemble resultant buffer
         var result = new Buffer(n_buffer.length + i_buffer.length + c_buffer.length);
         n_buffer.copy(result, 0, 0, n_buffer.length);
         i_buffer.copy(result, n_buffer.length, 0, i_buffer.length);
         c_buffer.copy(result, n_buffer.length + i_buffer.length, 0, c_buffer.length);

         callback(null, result.toString(DEFAULT_ENCODING));

         // console.log('Integer Buffer: ' + JSON.stringify(n_buffer));
         // console.log('IV Size Buffer: ' + i_buffer.toString('base64'));
         // console.log('Ciphertext Buffer: ' + c_buffer.toString('base64'));
         // console.log('Result Buffer: ' + JSON.stringify(result));

         // console.log(result.toString('base64'));
      });
   });
}

// Maintain list of authenticated clients
var clients = {};

// TODO: Pull from Couchbase
function get_users() {
   var users = {
      matt: { name: 'Matt', password: 'matt123', admin: true },
      bob: { name: 'Bob', password: 'bob456' },
      john: { name: 'John', password: 'john789' },
      demo: { name: 'Guest', password: 'demo' }
   };

   return users;
}

function get_users_online() {
   var users = get_users();
   var users_online = {};
   for (var k in clients) {
      var username = clients[k].username;
      var user_uuid = clients[k].uuid;
      users_online[user_uuid] = {
         name: users[username].name,
         admin: users[username].admin
      };
   }

   return users_online;
}

function get_uuid_socket_id(u) {
   for (var k in clients) {
      if (clients[k].uuid === u) {
         return k;
      }
   }

   return false;
}

io.sockets.on('connection', function (socket) {

   // Generate UUID for authenticated client
   while (client_uuid === undefined || clients[client_uuid] !== undefined)
      var client_uuid = uuid.v4();

   var auth = get_users();

   // Emit welcome message to newly connected socket
   socket.emit('connected');
   socket.emit('message', { message: 'Connection successful. Please authenticate.' });

   // Authentication
   socket.on('auth', function (data) {

      var auth_user = auth[data.username];

      if (auth_user !== undefined && auth_user.password === data.password) {

         // Save authenticated client details
         clients[socket.id] = {
            uuid: client_uuid,
            username: data.username,
            ip: socket.handshake.address.address,
            port: socket.handshake.address.port,
            socket: socket
            // crypto: { key: generate_key(), salt: generate_salt(), iv_size: IV_SIZE }
         };

         // Join room
         socket.join('auth');

         // Update client list on logon
         io.sockets.in('auth').emit('online', get_users_online());

         // Send UUID
         socket.emit('message', { message: 'Authentication successful. Welcome back, ' + auth[data.username].name + '!' });
         socket.emit('ident', { success: true, uuid: client_uuid, name: auth[data.username].name, admin: auth[data.username].admin });

         // Broadcast user online to all but self
         broadcast('message', { message: auth[data.username].name + ' is now online.' }, [ client_uuid ]);
      } else {
         socket.emit('message', { message: 'Authentication failed. Please try again.' });
      }
   });

   // Handle requests to decode messages
   socket.on('decode', function (data) {
      Crypto.Config.secret_key = data.key;
      Crypto.Config.salt = data.salt;
      Crypto.Reload();

      Crypto.Decrypt(data.message, function (err, plaintext) {
         socket.emit('message', { name: data.name, message: plaintext, decoded: true });
      });
   });

   // Handle disconnect
   socket.on('disconnect', function () {
      if (clients[socket.id] === undefined)
         return false;

      // Broadcast user offline to all but self
      broadcast('message', { message: auth[clients[socket.id].username].name + ' logged off.' }, [ clients[socket.id].uuid ]);
      logoff(socket);
   });

   // List for socket to emit data to 'send'
   socket.on('send', function (data) {

      // Require authenticated UUID
      if (clients[socket.id] === undefined) {
         socket.emit('message', { message: 'Invalid ident. Please re-authenticate.' });
         // logoff(socket, data);
         return false;
      }

      // Send plaintext
      var username = clients[socket.id].username;
      var send = {
         name: auth[username].name,
         message: data.message,
         admin: auth[username].admin
      }

      function kick_uuid(u) {
         var target_socket_id = get_uuid_socket_id(u);
         if (target_socket_id) {

            logoff(clients[target_socket_id].socket);
         }
      }

      // Admin commands
      if (auth[username].admin === true) {
         var cmd = (data.message).match(/^\/([^\s]+)/i);

         if (cmd) {
            var args = (data.message).split(' ');
            args.shift();
            switch(cmd[1]) {
               case 'disconnect':
                  if (args[0]) {
                     var disconnect_message = auth[clients[get_uuid_socket_id(args[0])].username].name + ' was kicked from this channel.';

                     kick_uuid(args[0]);
                     io.sockets.in('auth').emit('message', { message: disconnect_message });
                  }
                  break;

               case 'reboot':
                  clients = {};
                  io.sockets.emit('message', { message: 'Disconnecting...' });
                  io.sockets.emit('reload');
                  break;

               default:
                  console.log('COMMAND: ' + cmd[1]);
                  console.log('ARGS: ' + args);
                  break;
            }
            return;
         }
      }

      // Send encrypted
      var client_select = JSON.parse(data.client_select);
      if (!is_empty(client_select)) {
         // var client_crypto = clients[data.uuid].crypto;

         var recipients = get_keys(client_select);
         var client_encoded = send;

         client_encoded.key = generate_key();
         client_encoded.salt = generate_salt();

         Crypto.Config.secret_key = client_encoded.key;
         Crypto.Config.salt = client_encoded.salt;
         Crypto.Reload();

         Crypto.Encrypt(send.message, function(err, ciphertext) {
            client_encoded.message = ciphertext;

            recipients.push(client_uuid);
            broadcast('encoded', client_encoded, [], recipients);
         });
      } else {
         // Broadcast on all io.sockets
         // io.sockets.emit('message', send);

         send.message = (send.message).replace(/</g, '&lt;');
         send.message = (send.message).replace(/>/g, '&gt;');

         // Broadcast on all authenticated io.sockets
         io.sockets.in('auth').emit('message', send);
      }
   });
   
});