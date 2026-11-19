const os = require('os');
const dns = require('dns');
const net = require('net');

function getPhysicalIPv4() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    const l = name.toLowerCase();
    if (l.includes('flclash') || l.includes('tunnel') || l.includes('tap') || l.includes('loopback')) continue;
    for (const info of nets[name]) {
      if (info.family === 'IPv4' && !info.internal && !info.address.startsWith('28.')) {
        return info.address;
      }
    }
  }
  return '192.168.123.152';
}

const localIP = getPhysicalIPv4();

const origLookup = dns.lookup;
dns.lookup = function(hostname, options, callback) {
  if (typeof options === 'function') { callback = options; options = {}; }
  if (hostname === 'api.stepfun.com') {
    if (options && options.all) {
      return callback(null, [{ address: '14.103.2.83', family: 4 }]);
    }
    return callback(null, '14.103.2.83', 4);
  }
  return origLookup(hostname, options, callback);
};

const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  let [options] = args;
  if (typeof options === 'object' && options !== null) {
    if (options.host === '14.103.2.83' || options.hostname === '14.103.2.83' || options.servername === 'api.stepfun.com') {
      options.localAddress = localIP;
    }
  }
  return origConnect.apply(this, args);
};
