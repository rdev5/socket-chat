window.onload = function() {

   var messages = [];
   var port = 3700;
   var socket = io.connect('http://localhost:' + port);

   var field = document.getElementById('field');
   var sendButton = document.getElementById('send');
   var content = document.getElementById('content');
   var name = document.getElementById('name');

   $('#name').html('<h1>socket.io</h1>');

   socket.on('ident', function (data) {
      if (!data.success)
         return false;

      if (data.success) {
         $('#uuid').val(data.uuid);
         $('#auth-form').hide();
         $('#chat-controls').show();
         
         $('#field').focus();
      }
   });

   socket.on('connected', function() {
      $('#auth-form').show();
      $('#chat-controls').hide();
   });

   socket.on('message', function (data) {
      if (data.message) {
         messages.push(data);
         var html = ''
         for (var i = 0; i < messages.length; i++) {

            html += '<strong>' + (messages[i].name ? messages[i].name : 'Server') + ':</strong> ';
            html += messages[i].message + '<br />';
         }
         content.innerHTML = html;

         $('#content').scrollTop($('#content')[0].scrollHeight);
      } else {
         console.log('Error (no message): ' + JSON.stringify(data));
      }
   });

   socket.on('encoded', function (data) {
      if (!data.key || !data.salt) {
         console.log('Error (no crypto): ' + data);
         return;
      }

      if (!data.message) {
         console.log('Error (no message): ' + JSON.stringify(data));
         return;
      }

      var decoded = {
         name: '<em style="font-weight: normal;">Encoded</em>',
         message: '<a onclick="javascript:return show_crypto(this)" href="#crypto" rel="' + i + '">View<span style="display: none;">' + JSON.stringify(data) + '</span></a>'
      }

      messages.push(decoded);
      var html = ''
      for (var i = 0; i < messages.length; i++) {

         html += '<strong>' + (messages[i].name ? messages[i].name : 'Server') + ':</strong> ';
         html += messages[i].message + '<br />';
      }
      content.innerHTML = html;

      $('#content').scrollTop($('#content')[0].scrollHeight);
   });

   sendButton.onclick = function() {
      if (name.value === '') {
         alert('Please enter your name!');
      } else {
         var text = field.value;
         socket.emit('send', { message: text, name: name.value, uuid: uuid.value });

         field.value = '';
         field.focus();
      }
   };

   $('#authenticate').click(function() {
      socket.emit('auth', { username: $('#username').val(), password: $('#password').val() });
   });

   $('#logoff').click(function() {
      socket.emit('deauth', { uuid: uuid.value });
   });
}

function show_crypto(self) {
   var _this = jQuery(self);
   var encoded = JSON.parse($(_this).find('span').first().text());

   $('#ciphertext').html('Ciphertext: ' + encoded.message);
   $('#key').html('Key: ' + encoded.key);
   $('#salt').html('Salt: ' + encoded.salt);

   return false;
}