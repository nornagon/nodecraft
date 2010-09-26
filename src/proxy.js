(function () {
	var path = require('path');
	var lib_path = path.join(path.dirname(process.argv[1]), '..', 'lib');
	require.paths.push(path.normalize(lib_path));
})();

var sys = require('sys')
  , net = require('net')
  , fs = require('fs')
  , colors = require('colors')
  , ps = require('./protocol')
  ;

function concat(buf1, buf2) {
	var buf = new Buffer(buf1.length + buf2.length);
	buf1.copy(buf, 0, 0);
	buf2.copy(buf, buf1.length, 0);
	return buf;
}

var realServer = process.argv[2];
var realPort = parseInt(process.argv[3] || '25565');

var server = net.createServer(function(stream) {
	var realServerStream;
	var partialData = new Buffer(0);
	var pendingData = new Buffer(0);

	stream.on('connect', function () {
		var partialServerData = new Buffer(0);
		realServerStream = net.createConnection(realPort, realServer);
		realServerStream.on('connect', function () {
			sys.debug("connected to " + realServer + ", sending " + sys.inspect(pendingData));
			if (pendingData.length > 0) realServerStream.write(pendingData);
		});
		realServerStream.on('data', function (data) {
			//sys.debug(('S: ' + sys.inspect(data)).green);
			var allData = concat(partialServerData, data);
			do {
				try {
					//sys.debug("parsing " + sys.inspect(allData));
					var pkt = ps.parsePacketWith(allData, ps.serverPacketStructure);
					if (!masks[pkt.type])
						sys.debug('Server'.green+' sent 0x' + pkt.type.toString(16) + ' ' +
										ps.packetNames[pkt.type].bold+': ' + sys.inspect(pkt));
					partialServerData = new Buffer(0);
					allData = allData.slice(pkt.length, allData.length);
				} catch (err) {
					if (err.message == 'oob') {
						partialServerData = allData;
						allData = new Buffer(0);
					} else {
						sys.debug(err.message);
						throw err;
					}
				}
			} while (allData.length > 0);
			stream.write(data);
		});
	});

	stream.on('data', function (data) {
		//sys.debug(("C: " + sys.inspect(data)).cyan);
		if (realServerStream.writable)
			realServerStream.write(data);
		else
			pendingData = concat(pendingData, data);

		var allData = concat(partialData, data);
		do {
			try {
				var pkt = ps.parsePacket(allData);
				if (!masks[pkt.type])
					sys.debug('Client'.cyan+' sent 0x'+pkt.type.toString(16)+' '+
									ps.packetNames[pkt.type].bold+': ' + sys.inspect(pkt));
				partialData = new Buffer(0); // successfully used up the partial data
				allData = allData.slice(pkt.length, allData.length);
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

server.listen(25565, '0.0.0.0');
sys.puts('Proxy listening on ' + 'localhost:25565'.bold.grey + '...');
