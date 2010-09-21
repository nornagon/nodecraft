var sys = require('sys')
  , net = require('net')
  , ps = require('./ps')
  , colors = require('./colors')
  , zip = require('compress')
  ;

// TODO: put this useful function somewhere else
function concat(buf1, buf2) {
	var buf = new Buffer(buf1.length + buf2.length);
	buf1.copy(buf, 0, 0);
	buf2.copy(buf, buf1.length, 0);
	return buf;
}

function keepalive(stream, pkt) {
	// doo-de-doo
}

function handshake(stream, pkt) {
	stream.write(ps.makePacket({
		type: 0x02,
		serverID: '6314c1ab00fc9b61',
	}));
}

function login(stream, pkt) {
	sys.print("Protocol version: " + pkt.protoVer +
	          "\nUsername: " + pkt.username +
	          "\nPassword: " + pkt.password + "\n");

	stream.write(ps.makePacket({
		type: 0x01,
		playerID: 0x0,
		serverName: '',
		motd: '',
	}));
	stream.write(ps.makePacket({
		type: 0x06,
		x: 0, y: 0, z: 0
	}));
	stream.write(ps.makePacket({
		type: 0x03,
		message: pkt.username + ' joined the game',
	}));

	// i'm going to send you some chunks!
	for (var x = -10; x < 10; x++) {
		for (var z = -10; z < 10; z++) {
			stream.write(ps.makePacket({
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
	stream.write(ps.makePacket({
		type: 0x05,
		invType: -1,
		count: 36,
		items: items,
	}));
	items = [];
	for (var i = 0; i < 4; i++) {
		items.push({id: -1});
	}
	stream.write(ps.makePacket({
		type: 0x05,
		invType: -2,
		count: 4,
		items: items,
	}));
	stream.write(ps.makePacket({
		type: 0x05,
		invType: -3,
		count: 4,
		items: items,
	}));

	for (var x = -10*16; x < 10*16; x += 16) {
		for (var z = -10*16; z < 10*16; z += 16) {
			(function(){
				var chunk = new Buffer(0);
				var gzip = new zip.GzipStream(zip.Z_DEFAULT_COMPRESSION, zip.MAX_WBITS);
				gzip.on('data', function (data) {
					chunk = concat(chunk, data);
				}).on('error', function (err) {
					throw err;
				}).on('end', function () {
					stream.write(ps.makePacket({
						type: 0x33,
						x: x, z: z, y: 0,
						sizeX: 15, sizeY: 127, sizeZ: 15, // +1 to all
						chunk: chunk
					}));
				});

				var chunk_data = new Buffer(16 * 128 * 16 * 2.5);
				for (var i = 0; i < 16 * 128 * 16 * 2.5; i++) {
					chunk_data[i] = 0;
				}

				gzip.write(chunk_data);
				gzip.close();
			})();
		}
	}

	stream.write(ps.makePacket({
		type: 0x0d,
		x: 0, y: 0, z: 0, stance: 71,
		rotation: 0, pitch: 0,
		flying: 0,
	}));
}

function flying(stream, pkt) {
}

var packets = {
	0x00: keepalive,
	0x01: login,
	0x02: handshake,
	0x0a: flying,
};

var server = net.createServer(function(stream) {
	stream.on('connect', function () {
		// ...
		var f = stream.write;
		stream.write = function () {
			sys.debug(('S: ' + sys.inspect(arguments[0])).green);
			f.apply(stream, arguments);
		}
	});

	var partialData = new Buffer(0);
	stream.on('data', function (data) {
		sys.debug(("C: " + sys.inspect(data)).cyan);

		var allData = concat(partialData, data);
		do {
			try {
				sys.debug("parsing: " + sys.inspect(allData));
				pkt = ps.parsePacket(allData);
				sys.debug(sys.inspect(pkt));
				if (packets[pkt.type]) {
					packets[pkt.type](stream, pkt);
				} else {
					sys.debug("Unhandled packet".red.bold + " 0x"+pkt.type.toString(16));
				}
				partialData = new Buffer(0); // successfully used up the partial data
				sys.debug("pkt.length = " + pkt.length + " ; allData.length = " + allData.length);
				allData = allData.slice(pkt.length, allData.length);
				sys.debug("Remaining data: " + sys.inspect(allData));
			} catch (err) {
				if (err.message == "oob") {
					partialData = allData;
					allData = new Buffer(0);
				} else {
					throw err;
				}
			}
		} while (allData.length > 0)
	});
});

server.listen(25565, 'localhost');
sys.print('listening on localhost:25565...\n');
