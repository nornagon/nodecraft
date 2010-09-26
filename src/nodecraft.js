(function () {
	var path = require('path');
	var lib_path = path.join(path.dirname(process.argv[1]), '..', 'lib');
	require.paths.push(path.normalize(lib_path));
})();

var sys = require('sys')
  , net = require('net')
  , colors = require('colors')
  , zip = require('compress')
  , fs = require('fs')
  , ps = require('./protocol')
  , chunk = require('./chunk')
  , session = require('./session')
  , terrain = require('./terrain')
  , uniqueid = require('./uniqueid')
  , entities = require('./entities')
  ;


var enableProtocolDebug = 1;
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

var spawn_for_harvest = {
	1: 4, // Stone -> cobblestone
	2: 3, // Grass -> dirt
	3: 3, // Dirt  -> dirt
	4: 4, // Cobblestone -> cobblestone
	5: 5, // Wood -> Wood
	6: 6, // Sapling->Sapling
	12: 12, // Sand->Sand
	13: 13, // Gravel->Gravel
	14: 14, // Gold Ore->Gold Ore
	15: 15, // Iron Ore->Iron Ore
	16: 263, // Coal Ore -> Coal
	17: 17, // Logs -> Logs
	37: 37, // Flower->Flower
	38: 38, // Flower->Flower
	39: 39, // Mushroom->Mushroom
	40: 40, // Mushroom->Mushroom
};


function blockdig(session, pkt) {
	if (pkt.status == 0x3)
	{
		terrainmodsdebug("Received packet: " + sys.inspect(pkt));
		
		/* Get the type that was there */
		session.world.terrain.getCellType(pkt.x, pkt.y, pkt.z,
				function (cellType) {
					/* Blank the cell */
					session.world.terrain.setCellType(pkt.x,pkt.y,pkt.z,0x0);

					/* Reply with block dig notification */
					/* TODO: terrainSessionTracker should do this by listening to the chunk */
					session.stream.write(ps.makePacket({
							type: 0x35,
							x: pkt.x, y: pkt.y, z: pkt.z, blockType: 0,
							blockMetadata: 0
						}));

					/* Spawn an object to be picked up */
					if (cellType in spawn_for_harvest)
					{
						// Spawn the object

						var newEntity = world.entities.spawnEntity(pkt.x*32+16, pkt.y*32+16, pkt.z*32+16,
							spawn_for_harvest[cellType],
							0,0,0);

						/* TODO - this should be done by something listening on the EntityTracker */
						session.stream.write(ps.makePacket({
							type: 0x15,
							uid: newEntity.uid, item: newEntity.type,
							x: newEntity.x, y: newEntity.y, z: newEntity.z, rotation: newEntity.rotation, pitch: newEntity.pitch,
							unk: 1, hvel: newEntity.velocity
						}));
					}
				});
	}
}

function findBlockCoordsForDirection(x,y,z,face) {
	switch (face) {
		case 0: return {x: x, y: y-1, z: z};
		case 1: return {x: x, y: y+1, z: z};
		case 2: return {x: x, y: y, z: z-1};
		case 3: return {x: x, y: y, z: z+1};
		case 4: return {x: x-1, y: y, z: z};
		case 5: return {x: x+1, y: y, z: z};
	}
}


function isUsableObject(type)
{
	var usable_objects = {
		61: true,
		62:true,
		58:true,
		54:true
	};

	return type in usable_objects;
}

function blockplace(session, pkt)
{
	var coords = findBlockCoordsForDirection(pkt.x, pkt.y, pkt.z, pkt.face);

	if (pkt.item == -1) {
		sys.debug("Player USING block " + pkt.x + " "+pkt.y + " "+pkt.z);
		return;
	
	}

	/* Check to ensure that we're building against a block that can't be "used"
	 * If we can "use" a block; the build event is sent to tell the server that we're using that block
	 */
	checkBlockEventHandler = function (type) {
		if (isUsableObject(type))
			return;

		session.world.terrain.setCellType(coords.x, coords.y, coords.z, pkt.item);
	
		/* TODO: TerrainTracker should do this by listening on the chunk and updating all clients that have it when the change goes through */
		session.stream.write(ps.makePacket({
			type: 0x35,
			x: coords.x, y: coords.y, z: coords.z, blockType: pkt.item,
			blockMetadata: 0
		}));
	};

	session.world.terrain.getCellType(pkt.x, pkt.y, pkt.z, checkBlockEventHandler);
}

function flying(session, pkt) {
}

function checkEntities(session, x, y, z)
{
	var pickups = session.world.entities.findPickups(x*32, y*32, z*32);
	
	for (var i=0; i<pickups.length; i++) {
		var item = pickups[i];
		/* TODO - this should be done by something listening on the EntityTracker */
		session.stream.write(ps.makePacket({
			type: 0x16,
			collectedID: item.uid, collectorID: session.uid
		}));

		// Push the packet to the client's inventory
		session.stream.write(ps.makePacket({
			type: 0x11,
			item: item.type, amount:1, life:0
		}));

		/* TODO - also should be done by something listening on the EntityTracker - destruction of an item
		 * on the server should push the notification to affected clients automatically, without having to do it in every case
		 * */
		session.stream.write(ps.makePacket({
			type: 0x1D,
			uid: item.uid
		}));

		session.world.entities.destroyEntity(item.uid);
	
	}
}
function moveandlook(session, pkt) {
	checkEntities(session, pkt.x, pkt.y, pkt.z);
}

function playerpos(session, pkt) {
	checkEntities(session, pkt.x, pkt.y, pkt.z);
}

function grantID(session, type, count)
{
	if (typeof(count) == undefined)
		count = 1;

	session.stream.write(ps.makePacket({
			type: 0x11,
			item: type, amount:count, life:0
		}));
}

function chat(session, pkt)
{
	if (pkt.message.indexOf("/grant") == 0) {
		var tokens = pkt.message.split(" ");
		sys.debug(sys.inspect(tokens));

		var count = 1;
		var item = parseInt(tokens[1]);
		if (typeof(tokens[2]) != undefined) {
			count = parseInt(tokens[2]);
		}
		grantID(session, item, count);
	}
}

var packets = {
	0x00: keepalive,
	0x01: login,
	0x02: handshake,
	0x03: chat,
	0x0a: flying,
	0x0b: playerpos,
	0x0d: moveandlook,
	0x0e: blockdig,
	0x0f: blockplace,
};



var world = new Object();
world.terrain = new terrain.WorldTerrain();
world.time = 0;
world.sessions = [];
world.uidgen = new uniqueid.UniqueIDGenerator();
world.entities = new entities.EntityTracker(world);

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

                               if (!masks[pkt.type])
			
				protodebug(('Server sent '+('0x'+pkt.type.toString(16)+' '+
							ps.packetNames[pkt.type]).bold+': ' + sys.inspect(pkt)).green);
			f.apply(stream, arguments);
		}
	});

	var clientsession = new session.Session(world, stream);
	world.sessions.push(clientsession);

	var partialData = new Buffer(0);
	stream.on('data', function (data) {
		//protodebug(("C: " + sys.inspect(data)).cyan);

		var allData = concat(partialData, data);
		do {
			try {
				//sys.debug("parsing: " + sys.inspect(allData));
				pkt = ps.parsePacket(allData);

                                if (!masks[pkt.type])			
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
					sys.debug("Data in buffer: " + sys.inspect(allData));
					sys.debug(err);
					throw err;
				}
			}
		} while (allData.length > 0)
	});
});




try {
        var cfg = String(fs.readFileSync("packet_masks")).split('\n')
} catch (err) {
        if (err.errno == 2)
                cfg = [];
        else
                throw err;
}

var masks = {};
for (var i in ps.packetNames)
        masks[i] = false;

for (var maskidx in cfg)
        for (var i in ps.packetNames)
        {
                if (ps.packetNames[i] == cfg[maskidx])
                        masks[i] = true;
        }


var listenOn = process.argv[2] || 'localhost';

sys.puts('Nodecraft '+'v0.1'.bold.red+' starting up.')
server.listen(25565, listenOn);
sys.puts('Listening on ' + listenOn + ':25565'.bold.grey + '...');
