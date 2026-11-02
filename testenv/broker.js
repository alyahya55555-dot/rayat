// خادما MQTT محليان عبر WebSocket لمحاكاة خوادم البث العامة في الاختبار
const aedesMod = require('aedes'); const http = require('http'); const ws = require('websocket-stream');
const ports = (process.argv[2] || '9001,9002').split(',').map(Number);
const brokers = ports.map(port => {
  const aedes = (aedesMod.createBroker ? aedesMod.createBroker() : aedesMod());
  const server = http.createServer(); ws.createServer({ server }, aedes.handle); server.listen(port, () => console.log('broker on', port));
  return { aedes, server, port };
});
process.on('SIGTERM', () => process.exit(0));
