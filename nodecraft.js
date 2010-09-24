var sys = require('sys')
  , net = require('net')
  , ps = require('./ps')
  , colors = require('./colors')
  , zip = require('compress')
  , chunk = require('./chunk')
  , session = require('./session')
  , terrain = require('./terrain')
  ;


var enableProtocolDebug = 0;
var enableChunkPreDebug = 0;
var enableTerrainModsDebug = 0;


function protodebug()
{
	if (enableProtocolDebug)
		sys.debug.apply(sys, arguments);
}

function chunkpredebug()
{
	if (enableChunkPreDebug)
		sys.debug.apply(sys, arguments);
}

function terrainmodsdebug()
{
	if (enableTerrainModsDebug)
		sys.debug.apply(sys, arguments);
}


// TODO: put this useful function somewhere else
function concat(buf1, buf2) {
	var buf = new Buffer(buf1.length + buf2.length);
	buf1.copy(buf, 0, 0);
	buf2.copy(buf, buf1.length, 0);
	return buf;
}

function keepalive(session, pkt) {
	// doo-de-doo
}

function handshake(session, pkt) {
	session.stream.write(ps.makePacket({
		type: 0x02,
		serverID: '-',
	}));
}


function composeTerrainPacket(cb, session, x,z)
{
	var zippedChunk = new Buffer(0);
	var gzip = new zip.GzipStream(zip.Z_DEFAULT_COMPRESSION, zip.MAX_WBITS);
	gzip.on('data', function (data) {
		zippedChunk = concat(zippedChunk, data);
	}).on('error', function (err) {
		throw err;
	}).on('end', function () {
		
		chunkpredebug("X: "+x+" Z: "+z);
		session.stream.write(ps.makePacket({
			type: 0x33,
			x: x, z: z, y: 0,
			sizeX: 15, sizeY: 127, sizeZ: 15, // +1 to all
			chunk: zippedChunk
		}));
		cb();
	});

	session.world.terrain.getChunk(x,z, function(chunk_data) {	
			gzip.write(chunk_data.data);
			gzip.close();
			});
}

function login(session, pkt) {
	sys.print("Protocol version: " + pkt.protoVer +
	          "\nUsername: " + pkt.username +
	          "\nPassword: " + pkt.password + "\n");

	session.username = pkt.username;
	session.password = pkt.password;
	/* TODO: Add whitelist check here */

	session.stream.write(ps.makePacket({
		type: 0x01,
		playerID: 0x0,
		serverName: '',
		motd: '',
	}));
	session.stream.write(ps.makePacket({
		type: 0x06,
		x: 0, y: 0, z: 0
	}));
	session.stream.write(ps.makePacket({
		type: 0x03,
		message: pkt.username + ' joined the game',
	}));

	// i'm going to send you some chunks!
	for (var x = -10; x < 10; x++) {
		for (var z = -10; z < 10; z++) {
			session.stream.write(ps.makePacket({
				type: 0x32,
				mode: true,
				x: x, z: z
			}));
		}
	}

	var items = [];
	for (var i = 0; i < 36; i++) {
		items.push({id: -1});
	}
	session.stream.write(ps.makePacket({
		type: 0x05,
		invType: -1,
		count: 36,
		items: items,
	}));
	items = [];
	for (var i = 0; i < 4; i++) {
		items.push({id: -1});
	}
	session.stream.write(ps.makePacket({
		type: 0x05,
		invType: -2,
		count: 4,
		items: items,
	}));
	session.stream.write(ps.makePacket({
		type: 0x05,
		invType: -3,
		count: 4,
		items: items,
	}));

	/* Fast start */
	for (var x = -1 * 16; x < 1 * 16; x+= 16)
	{
		for (var z = -1*16; z < 1*16; z += 16) {
			/* Closure for callback [cannot do anonymously, otherwise we end up with 160,160] */
			r = function(x,z)
			{
				/* Callback to be added to outgoing session task list */
				return function (cb) {
					return composeTerrainPacket(cb, session, x,z);
				}	
			}
			session.addOutgoing(r(x,z));
		}
	}

	get_and_send_position = function (cb) {
		send_position_packet = function (posY) {
			session.stream.write(ps.makePacket({
				type: 0x0d,
				x: 0.5, y: posY+4, z: 0.5, stance: 71,
				rotation: 0, pitch: 0,
				flying: 0,
			}));
			cb();
		};
		session.world.terrain.getMaxHeight(0,0,send_position_packet);
	};

	session.addOutgoing(get_and_send_position);

	/* Send rest of packets in visible range */
	for (var x = -10*16; x < 10*16; x += 16) {
		for (var z = -10*16; z < 10*16; z += 16) {
			if ((x == -16 || x == 0) && (z == -16 || z == 0))
				continue;
			/* Closure for callback [cannot do anonymously, otherwise we end up with 160,160 */
			r = function(x,z)
			{
				/* Callback to be added to outgoing session task list */
				return function (cb) {
					return composeTerrainPacket(cb, session, x,z);
				}	
			}
			session.addOutgoing(r(x,z));
		}
	}

	session.pump();
}

function blockdig(session, pkt) {
	if (pkt.status == 0x3)
	{
		terrainmodsdebug("Received packet: " + sys.inspect(pkt));
		session.world.terrain.setCellType(pkt.x,pkt.y,pkt.z,0x0);
		session.stream.write(ps.makePacket({
				type: 0x35,
				x: pkt.x, y: pkt.y, z: pkt.z, blockType: 0,
				blockMetadata: 0
			}));
	}
}

function flying(session, pkt) {
}

var packets = {
	0x00: keepalive,
	0x01: login,
	0x02: handshake,
	0x0a: flying,
	0x0e: blockdig,
};



var world = new Object();
world.terrain = new terrain.WorldTerrain();
world.time = 0;
world.sessions = [];

function sendTicks()
{
	for (var i=0; i<world.sessions.length; i++)
	{
		var session = world.sessions[i];
		session.stream.write(ps.makePacket({
			type: 0x04,
			time: world.time
		}));
	}
	world.time += 20;
}

setTimeout(1000, sendTicks());

var server = net.createServer(function(stream) {
	stream.on('connect', function () {
		// ...
		var f = stream.write;
		stream.write = function () {
			var pkt = ps.parsePacketWith(arguments[0], ps.serverPacketStructure);
			protodebug(('Server sent '+('0x'+pkt.type.toString(16)+' '+
							ps.packetNames[pkt.type]).bold+': ' + sys.inspect(pkt)).green);
			f.apply(stream, arguments);
		}
	});

	var clientsession = new session.Session();
	clientsession.stream = stream;
	clientsession.world = world;
	world.sessions.push(clientsession);

	var partialData = new Buffer(0);
	stream.on('data', function (data) {
		protodebug(("C: " + sys.inspect(data)).cyan);

		var allData = concat(partialData, data);
		do {
			try {
				//sys.debug("parsing: " + sys.inspect(allData));
				pkt = ps.parsePacket(allData);
				protodebug(('Client sent '+('0x'+pkt.type.toString(16)+' '+
								ps.packetNames[pkt.type]).bold+': ' + sys.inspect(pkt)).cyan);
				if (packets[pkt.type]) {
					packets[pkt.type](clientsession, pkt);
				} else {
					protodebug("Unhandled packet".red.bold + " 0x"+pkt.type.toString(16));
				}
				partialData = new Buffer(0); // successfully used up the partial data
				//sys.debug("pkt.length = " + pkt.length + " ; allData.length = " + allData.length);
				allData = allData.slice(pkt.length, allData.length);
				//sys.debug("Remaining data: " + sys.inspect(allData));
			} catch (err) {
				if (err.message == "oob") {
					partialData = allData;
					allData = new Buffer(0);
				} else {
					sys.debug(err);
					throw err;
				}
			}
		} while (allData.length > 0)
	});
});


var listenOn = process.argv[2] || 'localhost';

sys.puts('Nodecraft '+'v0.1'.bold.red+' starting up.')
server.listen(25565, listenOn);
sys.puts('Listening on ' + listenOn + ':25565'.bold.grey + '...');
