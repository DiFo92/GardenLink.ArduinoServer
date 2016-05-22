var os=require('os');
var winston     = require ('winston'); 
var path        = require ('path'); //para utilizar rutas
var fs = require('fs'); //leer desde el filesystem
var async = require('async');
var Auxiliares = require("./lib/util/Auxiliares.js");
var auxiliares = new Auxiliares();

var _DEBUG = true;

var cmd_restart = "QREX";
var cmd_network_reset = "QNRX";
var cmd_status = "QSTX";



// Configuracion de Winston (logging) para crear archivo de log diario
// ej. log_file.log.2015-13-02
// uso: logger.info("Registro de log", {extraData: 'texto logueado'});
var transports  = []; 
transports.push(new winston.transports.DailyRotateFile({
  name: 'file',
  //datePattern: '.yyyy-MM-ddTHH',
  filename: path.join(__dirname, "logs", "log_file_socket.log")
}));

var logger = new winston.Logger({transports: transports});
var _dirname = __dirname;


//Fin config Winston
// Modo de inicio de aplicacion:
// 1.- Configuracion desde config.json. Requiere iniciar server con comando: 
//     NODE_ENV=production node app.js
// 2.- Configuracion como argumentos al iniciar aplicacion
//     node SwitchControl.js release
//      Opciones: release / debug
var environment = process.argv[2] || process.env.NODE_ENV || 'debug'

//Revisar que las carpetas iniciales existan.. si no estan, las crea.
console.log("Verificando carpetas de sistema..");
var pathLog = __dirname + "/logs";
try {
  fs.mkdirSync(pathLog);
} catch(e) {
  if ( e.code != 'EEXIST' ) throw e;
}
console.log("Carpetas de sistema ok..");

console.log("Leyendo Configuracion... ");
logger.info("Leyendo Configuracion...");
if (environment != 'release' && environment != 'debug')
{
  console.log("Ambiente especificado invalido.. se usara configuracion por defecto");
  logger.info("Ambiente especificado invalido.. se usara configuracion por defecto");
  environment = 'debug';
}
console.log("Ambiente : " + environment);
logger.info("Ambiente : " + environment);
//var config = require("./config.json")[environment];
var Configuracion = require("./lib/util/Configuracion.js");
var configuracion = new Configuracion(environment);
var config = configuracion.LeerConfiguracion();


console.log("Configurando Base de Datos");
logger.info("Configurando Base de Datos");

var DataProvider = require('./lib/dao/DataProvider.js');
var dataProvider = new DataProvider(logger, config, null);

var http = require('http')
  , net = require('net')
  , url = require('url')
  , fs = require('fs')
  , io = require('socket.io')
  , sys = require(process.binding('natives').util ? 'util' : 'sys')
  , server;
  
var tcpGuests = [];  //clientes tcp (arduinos)
var webGuests = []; //clientes web u otros


server = http.createServer(function(req, res){
  // your normal server code
  var path = url.parse(req.url).pathname;
  switch (path){
    case '/':
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.write('<h1>Welcome. Try the <a href="/arduino.html">Arduino</a> example.</h1>');
      res.end();
      break;
    case '/Sensor':
    	res.end();
    	break;
    
    case '/json.js':
    case '/arduino.html':
      fs.readFile(__dirname + path, function(err, data){
        if (err) return send404(res);
        res.writeHead(200, {'Content-Type': path == 'json.js' ? 'text/javascript' : 'text/html'})
        res.write(data, 'utf8');
        res.end();
      });
      break;
      
    default: send404(res);
  }
}),

send404 = function(res){
  res.writeHead(404);
  res.write('404');
  res.end();
};

server.listen(8090);
console.log('Servidor socket.io corriendo en puerto 8090');


/* SOCKET.io SERVER 
 * Maneja comunicaciones con App y Clientes WEB
 */

var io = io.listen(server)
  , buffer = [];
  
io.on('connection', function(client){
  client.send({ buffer: buffer });
  client.broadcast.send({ announcement: client.sessionId + ' connected' });
  console.log("connection");
  
  webGuests.push(client);
  
  client.on('message', function(message){
  	
  	console.log("COMMAND: <" + message + ">");
  	var comando = message.trim().split(/\s+/);
  	console.log(comando);
  	var arduinoMsg ="";
  	var respuesta = ">server: ";
  	if (comando.length > 0)
  	{
	  	switch (comando[0]) {
	  		
	  		case "restart":
	  			process.exit();
	  			break;
	  		
	  		case "kill":
	  			if (comando[1])
	  				process.kill(comando[1]);
	  			break;
	  			
	  		case "logs":
	  			 var contents = fs.readFileSync(__dirname +'/logs/log_file_socket.log.' + auxiliares.DateParse_yyyy_mm_dd(new Date()), {encoding: 'utf8'}).toString();
	  			 respuesta += ("LOG FILE : " + contents);
	  			break;
	  		
	  		case "pid":
	  			console.log(process.pid);
	  			respuesta += process.pid;
	  			break;
	  			
	  		case "webclients":
	  			respuesta += "clientes web conectados : " + webGuests.length;
	  			break;
	  			
	  		case "tcpclients":
	  			respuesta += "arduinos conectados : " + tcpGuests.length;
	  			break;
	  			
	  			
	  		case "uptime":
	  			console.log("UPTIME : " + process.uptime() + " secconds");
	  			respuesta += process.uptime();
	  			break;
	  			
	  		case "help":
	  			respuesta += "logs restart kill pid uptime webclients tcpclients help";
	  			break;
	  		
	  		case "arduino":
	  			if (comando[1]) {
	  				switch (comando[1]) {
	  					case "restart":
	  						arduinoMsg = cmd_restart;
	  						respuesta += " reiniciando arduino...";
	  						break;
	  						
	  					case "dhcprestart":
	  						arduinoMsg = cmd_network_reset
	  						respuesta += "comando ejecutado..";
	  						break;
	  						
	  					case "help":
	  						respuesta += "restart dhcprestart status custom";
	  						break;
	  						
	  					case "custom":
	  						arduinoMsg = comando[2];
	  						respuesta += "comando ejecutado..";
	  						break;
	  						
	  					case "status":
	  						arduinoMsg = cmd_status;
	  						respuesta += "comando ejecutado..";
	  						break;
	  						
	  					default:
	  						respuesta += "comando no reconocido.. para ver comandos usar arduino help";
	  						break;
	  				}
	  			}
	  			else
	  			{
	  				respuesta += "comando no reconocido.. para ver comandos usar arduino help";
	  			}
	  			break;
	  		
	  		default:
	  			respuesta += " comando no reconocido";
	  			break;
	  	}
	  	
	  	client.emit('console-response', respuesta);
	  	
	  	 //Comunico a los clientes arduino
	    for (g in tcpGuests) {
	        tcpGuests[g].write(arduinoMsg);
	    }
	  	
	  	
  	}
    //var msg = { message: [client.sessionId, message] };
    //buffer.push(msg);
    //if (buffer.length > 15) buffer.shift();
    //client.broadcast.send(msg);
    
   
  });

  client.on('disconnect', function(){
    client.broadcast.send({ announcement: client.sessionId + ' disconnected' });
  });
});


/* NET SERVER 
 * Maneja comunicaciones con arduino
 *
*/


//tcp socket server
var tcpServer = net.createServer(function (socket) {
  console.log('Servidor TCP corriendo en puerto 1337');
  //console.log('web server running on http://localhost:8090');
  
  socket.on('error', function(error) { console.log("error: " + error); });
  
  socket.on('close', function() {
  	console.log("Close event");
  	 for (g in tcpGuests) {
     		if (tcpGuests[g].remoteAddress == socket.remoteAddress &&
     			tcpGuests[g].remotePort == socket.remotePort) {
					var index = tcpGuests.indexOf(tcpGuests[g]);
					console.log("Eliminando cliente en evento close");
					tcpGuests.splice(index,1);
				}
       }
  	printConnections();
  });
  
   socket.on('disconnect', function (socket) {
 	console.log("Disconnect event");
 	   for (g in tcpGuests) {
     		if (tcpGuests[g].remoteAddress == socket.remoteAddress &&
     			tcpGuests[g].remotePort == socket.remotePort) {
     			var index = tcpGuests.indexOf(tcpGuests[g]);
				console.log("Eliminando cliente en evento disconnect");
				tcpGuests.splice(index,1);	
			}
       }
 	  
      socket.emit('disconnected');
      socket.destroy();
      printConnections();
  });
  
  /*
  socket.setTimeout(20000, function() {
  	console.log('Timeout de 20 segundos');
  	 for (g in tcpGuests) {
     		if (tcpGuests[g].remoteAddress == socket.remoteAddress &&
     			tcpGuests[g].remotePort == socket.remotePort)
				console.log("Borro un weon en timeout");
				tcpGuests.remove(g);	
       }	
  	socket.destroy();
  	printConnections();
  })
  */
  
});
   
function printConnections()
{
	 tcpServer.getConnections(function(err, count) {
    	console.log('num of connections on port 1337: ' +  count);
    });
    
    console.log('Largo de arreglo de sockets : ' + tcpGuests.length);
    
    console.log('Detalle de socket : ');
     for (g in tcpGuests) {
     	console.log("IP: " + tcpGuests[g].remoteAddress + " PUERTO: " + tcpGuests[g].remotePort);
    }
    
} 
    

tcpServer.on('connection',function(socket){
    //socket.write('connected to the tcp server : \r\n');
    console.log('Client connected from : ', socket.remoteAddress);
    printConnections();
    
    tcpGuests.push(socket);
    
    //socket.send(socket.id);
    
    socket.on('data',function(data){
        console.log('received data on tcp socket: '+data);
        logger.info('socket.on(data) : ' + data); 
        //socket.write('msg received\r\n');
        
        
        
        //send data to guest socket.io chat server
        for (g in io.clients) {
            var client = io.clients[g];
            client.send({message:["arduino",data.toString('ascii',0,data.length)]});
            
        }
    })
});


//var later = require('later'); // gestion de tarea
//var configEncendido = later.parse.recur().every(0.5).minute();
//var x = later.setInterval(function() { Activar(dataProvider, logger); }, configEncendido);





function Activar(dataProvider, logger) {
	console.log("Activo");
	
	
	
	var caracterEscape = 'X';
	/*
	//var message = "ST1X";
	
	var message = Dispositivos.Sensor + Operaciones.Sensor.Temperatura + "1" + caracterEscape;
	
	for (g in tcpGuests) {
        	tcpGuests[g].write(message);
    	}
	*/
	//SENSORES
	
	dataProvider.Sensor().GetAll(function(error, data) {
		//console.log(data);
		if (error) console.log(error);
		
		
		async.each(data, function(doc, cb) { 
        	var message = "";
			if (doc.Tipo == "Temperatura") {
				message = Dispositivos.Sensor + Operaciones.Sensor.Temperatura + doc.IdSensor +  caracterEscape;
				console.log(message);
			}
			
			if (doc.Tipo == "Humedad") {
				message = Dispositivos.Sensor + Operaciones.Sensor.Humedad + doc.IdSensor +  caracterEscape;
				console.log(message);
			}
			
			if (doc.Tipo == "Lluvia") {
				message = Dispositivos.Sensor + Operaciones.Sensor.Lluvia + doc.IdSensor +  caracterEscape;
				console.log(message);
			}
			
			if (doc.Tipo == "PH") {
				message = Dispositivos.Sensor + Operaciones.Sensor.PH + doc.IdSensor +  caracterEscape;
				console.log(message);
			}
			
			if (doc.Tipo == "EC") {
				message = Dispositivos.Sensor + Operaciones.Sensor.EC + doc.IdSensor +  caracterEscape;
				console.log(message);
			}
			
			if (doc.Tipo == "HumedadTierra") {
				message = Dispositivos.Sensor + Operaciones.Sensor.HumedadTierra + doc.IdSensor +  caracterEscape;
				console.log(message);
			}
			if (message != "") {
				for (g in tcpGuests) {
		        	tcpGuests[g].write(message);
		    	}
	    	}
	        	  
          
          
          
        }, function(error) { console.log("Error al leer async en mettodo <MONGO> DeviceProvider.GetAll() error : " + error); return;});

		
		
		
		    	
	});
	
	
	
	
	
	 
    
	//x.clear(); // detiene el schedule 
}

var Dispositivos = {
	Sensor : "S",
	Relay : "R",
	Motor : "M"
};

var Operaciones = {
	Sensor : {
		Temperatura : "T",
		Humedad : "H",
		PH : "P",
		EC : "E",
		Lluvia : "L",
		HumedadTierra : "S"
	},
	Relay : {
		Encender : "E",
		Apagar : "A"
	},
	Motor : {
		Avanzar : "A",
		Retroceder : "R",
		Detener : "D",
		Estado : "E",
		Posicion : "P"
	}
};



function PrepararDataSensor(data) {

	async.each(data, function(doc, cb) { 
          var sensorModel = new Models();
          sensorModel.Crear(doc.Id, doc.Nombre, doc.Tipo, doc.Ip, doc.Puerto, doc.Habilitado, doc.Estado,doc.FrecuenciaMuestreo);
          
          lstModels.push(deviceModel.Objeto());
          
          
        }, function(error) { console.log("Error al leer async en mettodo <MONGO> DeviceProvider.GetAll() error : " + error); return;});


}
console.log("Iniciando configuracion de temporizador...");
var Temporizador = require("./lib/util/Temporizador.js");
var tareas = new Temporizador(config, logger, dataProvider,tcpGuests, function(error, data) {
	
	if (_DEBUG) console.dir("Retorno de funcion Temporizador " + data);
	tareas.Iniciar();
});

console.log("Fin Configuracion Temporizador...");
logger.info("Fin Configuracion Temporizador..."); 


tcpServer.listen(1337);
