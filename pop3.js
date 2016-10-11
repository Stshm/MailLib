var net = require('net');
var fs = require('fs');
var util = require('util');
var path = require('path');
var readline = require('readline');
var emitter = require('events').EventEmitter;

var debug = true;
function debugLog(msg){ if(debug) console.log('Debug: ' + msg); }



class Pop3Client extends  emitter {

	constructor(server, opt){
		super();
		/* connection info */
		this.serverAddr = server;
		this.serverPort = 110;
		if(opt && opt['port'])
			this.serverPort = opt['port'];
		/* sockets */
		this.rawSocket = undefined;
		/* tls is currently not implements */
		this.isTls = false; 
		this.optTls = undefined;
		this.tlsSocket = undefined;
		/* socket to use */
		this.socket =  undefined;
		/*  readline interface for this connection
		 *  will be set up when connection is established.
		**/
		this.rl = undefined;
		this.data = [];
	}
	
	cleanUp(){
		
	}
	onNotifiedLine(line){
		/* accecpted */
		if(line.match(/^\+ok/i)) {
			debugLog(line); /* XXX mark */
			this.emit('response', line, true);
		/* error */
		}else if(line.match(/^\-err/i)) {
			debugLog(line); /* XXX mark */
			this.emit('response', line, false);
		/* end of data */
		}else if(line.match(/^\.$/)){
			var allData = this.data;
			this.emit('completed', allData);
			this.data = [];
		/* store data to internal buffer */
		}else{
			this.emit('data',line);
			this.data.push(line);
		}
	}

	/* cbdunc(array_of_response_or_error[]) */
	connect(cbfunc){
		var self = this;
		self.rawSocket = net.connect(this.serverPort, this.serverAddr, 
										function() {
			debugLog('connected');
			_onConnect(self.rawSocket,cbfunc);
		});
	
		function _onConnect(sock,_cbfunc){
			
			self.socket = sock;
			/* set up readline interface */
			self.rl = readline.createInterface({'input': self.socket, 
															'output': {}});
			self.rl.on('line', function(line){ 
				self.onNotifiedLine(line);
			});

			/* if socket error */
			self.socket.on('error', function(e){
				debugLog('socket error: ' + e.message);
				self.emit('error', e);
				self.cleanUp();
			});

			/* waiting response */
			self.addListenerResponse(function(res, isOk){
				cbfunc(res, isOk);
			});
		}
	}

	stratTls(cbfunc){
		debugLog('TLS wrapping socket ...');
		self.tlsSocket = new tls.TLSSocket(self.rawSocket, self.optTls);
		self.tlsSocket.on('secure', function() {
			debugLog('TLS data connection is established.');
			cbfunc();
		});
	}

	addListenerResponse(cbfunc){
		var self = this;
		this.on('response', function(res, isOk){
			self.removeAllListeners('response');
			cbfunc(res, isOk);
		});
	}
	addListenerCompleted(cbfunc){
		var self = this;
		this.on('completed', function(allData){
			self.removeAllListeners('completed');
			cbfunc(allData);
		});
	}
	receiveCompleted(cbfunc){
		var self = this;
		this.addListenerResponse(function(res, isOk){
			if(isOk){
				self.addListenerCompleted( function(allData){
					cbfunc(allData, true);
				});
			}else{
				cbfunc(res,false);
			}
		});		
	}
	/* USER -> PASS */
	auth(user, pass, cbfunc){
		var self = this;
		this.socket.write('USER ' + user + '\r\n');
		this.addListenerResponse(function(dump, userIsOk){
			self.socket.write('PASS ' + pass + '\r\n');			
			self.addListenerResponse(function(passRes, passIsOk){
				cbfunc(passRes, passIsOk);
			});
		});
	}
	/* LIST or UIDL [*line number] */
	uidl(number,cbfunc){
		this._list('uidl', number, cbfunc);
	}
	list(number,cbfunc){
		this._list('list', number, cbfunc);
	}
	_list(cmd, number, cbfunc){
		var self = this;
		var cmdList;
		if(cmd.match(/list/i)) { 
			cmdList = 'LIST';
		}else if(cmd.match(/uidl/i)) {
			cmdList = 'UIDL';
		}else{
			cbfunc(undefined, false);
			return;
		}
		if(number) cmdList += ' ' + number;
		this.socket.write(cmdList + '\r\n');
		this.addListenerResponse(function(dump, isOk){
			self.addListenerCompleted( function(allData){
				cbfunc(allData, true);
			});
		});
	}
	retr(number,cbfunc){
		this.socket.write('RETR ' + number + '\r\n');
		this.receiveCompleted(function(data, result){
				cbfunc(data,result);
		});
	}
	quit(cbfunc){
		this.socket.write('QUIT\r\n');
		this.addListenerResponse(function(res,isOk){
			cbfunc(res, isOk);
		});
	}
}

exports.pop3Connect = function(server, user, pass, opt, cbfunc) {



}



/* Codes for test */
var rlPasswd = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function passwdin(prompt, callback) {
    var stdin = process.openStdin();
    process.stdin.on("data", function(c) {
        c = c + "";
        switch (c) {
            case "\n":
            case "\r":
            case "\u0004":
                stdin.pause();
                break;
            default:
                process.stdout.write("\033[2K\033[200D" + prompt + 
									Array(rlPasswd.line.length+1).join("*"));
                break;
        }
    });

    rlPasswd.question(prompt, function(v) {
        rlPasswd.history = rlPasswd.history.slice(1);
        callback(v);
    });
}


var username = "";
var passwd = "";

rlPasswd.question('New user name: ', function(_name){
	username = _name;

	passwdin("Password for " + username + ": ", function(_passwd) {
       	passwd = _passwd;

		pop3 = new Pop3Client('localhost');

		pop3.connect(function(cRes){
			console.log(cRes);
			pop3.auth(username,passwd,function(aRes, result){
				console.log(aRes);
				if(result){
					pop3.uidl(0, function(data, result){
						console.log(data);
						pop3.retr(1,function(msg,result){
							console.log(msg);
							pop3.quit(function(qRes){ console.log(qRes); });	

						});
					});	
				}else{
					pop3.quit(function(qRes){ console.log(qRes); });
				}
			});
		});
	});
});









