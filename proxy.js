var sys = require('sys')
  , net = require('net')
  , colors = require('./colors')
  , ps = require('./ps')
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
			sys.debug(('S: ' + sys.inspect(data)).green);
			var allData = concat(partialServerData, data);
			do {
				try {
					//sys.debug("parsing " + sys.inspect(allData));
					var pkt = ps.parsePacketWith(allData, ps.serverPacketStructure);
					sys.debug('Server sent packet: ' + sys.inspect(pkt));
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
		sys.debug(("C: " + sys.inspect(data)).cyan);
		if (realServerStream.writable)
			realServerStream.write(data);
		else
			pendingData = concat(pendingData, data);

		var allData = concat(partialData, data);
		do {
			try {
				var pkt = ps.parsePacket(allData);
				sys.debug('Client sent packet: ' + sys.inspect(pkt));
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

server.listen(25565, 'localhost');
sys.puts('Proxy listening on ' + 'localhost:25565'.bold.grey + '...');
