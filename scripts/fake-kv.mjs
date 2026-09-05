/**
 * A minimal in-memory stand-in for the Upstash Redis REST pipeline endpoint.
 * Exists so the pilot loop can be exercised end to end — store, dashboard,
 * outcome capture, export — without provisioning real infrastructure.
 *
 *   node scripts/fake-kv.mjs [port]
 */
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 3311);
const hashes = new Map();
const lists = new Map();
const strings = new Map();

const H = (k) => hashes.get(k) ?? hashes.set(k, new Map()).get(k);
const L = (k) => lists.get(k) ?? lists.set(k, []).get(k);

function run([cmd, ...args]) {
  const c = String(cmd).toUpperCase();
  switch (c) {
    case "HSET": {
      const [key, field, value] = args;
      H(key).set(field, value);
      return 1;
    }
    case "HGET": {
      const [key, field] = args;
      return H(key).get(field) ?? null;
    }
    case "HSETNX": {
      const [key, field, value] = args;
      if (H(key).has(field)) return 0;
      H(key).set(field, value);
      return 1;
    }
    case "HMGET": {
      const [key, ...fields] = args;
      return fields.map((f) => H(key).get(f) ?? null);
    }
    case "LPUSH": {
      const [key, ...values] = args;
      const list = L(key);
      list.unshift(...values);
      return list.length;
    }
    case "LREM": {
      const [key, , value] = args;
      lists.set(key, L(key).filter((v) => v !== value));
      return 1;
    }
    case "LTRIM": {
      const [key, start, stop] = args;
      lists.set(key, L(key).slice(Number(start), Number(stop) + 1));
      return "OK";
    }
    case "LRANGE": {
      const [key, start, stop] = args;
      const end = Number(stop);
      return L(key).slice(Number(start), end === -1 ? undefined : end + 1);
    }
    case "LLEN": {
      return L(args[0]).length;
    }
    case "HDEL": {
      const [key, field] = args;
      return H(key).delete(field) ? 1 : 0;
    }
    case "SET": {
      const [key, value] = args;
      strings.set(key, value);
      return "OK";
    }
    case "GET": {
      return strings.get(args[0]) ?? null;
    }
    case "DEL": {
      return strings.delete(args[0]) ? 1 : 0;
    }
    default:
      throw new Error(`unsupported: ${c}`);
  }
}

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (!req.url?.endsWith("/pipeline")) {
      res.writeHead(404).end();
      return;
    }
    if (req.headers.authorization !== "Bearer test-kv-token") {
      res.writeHead(401).end();
      return;
    }
    try {
      const commands = JSON.parse(body);
      const out = commands.map((cmd) => {
        try {
          return { result: run(cmd) };
        } catch (e) {
          return { error: String(e.message) };
        }
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out));
    } catch {
      res.writeHead(400).end();
    }
  });
}).listen(port, () => console.log(`fake-kv on ${port}`));
