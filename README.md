socket-chat
===========
> Written by Matt Borja

A handy chat application server and client written in socket.io for the purposes of learning socket programming in Node.js.

Features:
- Client authentication implementing Bcrypt hashing and server issued unique UUID issuing
- Chat commands (see command.js for a complete list of currently available chat commands)
- Handy crypto wrapper with signing, ciphering, packing, and hashing
- Cross-Origin Resource Sharing (CORS)
- Various developer-friendly helper functions
- Implements yaml-config for configuring crypto
- Client UI with online users list and admin-only /reboot command :)
- Socket rooms restricted to authentication and access lists

Feedback and suggestions are greatly appreciated! Please feel free to fork and submit a pull request if you would like to make a contribution. Small changes are welcomed :)
