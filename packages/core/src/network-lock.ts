import dns from "node:dns";
import dgram from "node:dgram";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

const INSTALL_KEY = Symbol.for("openfolio.node-network-lock.installed");
const DENIED_MESSAGE = "OpenFolio Network Lock denied a Node network operation.";

type MutableModule = Record<string, unknown>;

function denied(): never {
  throw new Error(DENIED_MESSAGE);
}

function replace(target: object, property: string) {
  Object.defineProperty(target, property, {
    configurable: false,
    enumerable: true,
    writable: false,
    value: denied,
  });
}

/**
 * Defense in depth for the packaged Mac app and distributed MCP process.
 * Capability removal and signed-artifact traffic tests remain the release boundary.
 */
export function installNodeNetworkLock() {
  const state = globalThis as typeof globalThis & { [INSTALL_KEY]?: boolean };
  if (state[INSTALL_KEY]) return;

  Object.defineProperty(state, INSTALL_KEY, { value: true, configurable: false });
  Object.defineProperty(globalThis, "fetch", {
    configurable: false,
    writable: false,
    value: denied,
  });

  for (const property of ["request", "get", "createServer"]) replace(http as unknown as MutableModule, property);
  for (const property of ["request", "get", "createServer"]) replace(https as unknown as MutableModule, property);
  for (const property of ["connect", "createConnection", "createServer"]) replace(net as unknown as MutableModule, property);
  for (const property of ["connect", "createServer"]) replace(tls as unknown as MutableModule, property);
  replace(dgram as unknown as MutableModule, "createSocket");

  for (const property of ["lookup", "resolve", "resolve4", "resolve6", "reverse"]) {
    replace(dns as unknown as MutableModule, property);
    replace(dns.promises as unknown as MutableModule, property);
  }
  replace(net.Socket.prototype, "connect");
}

export function isNodeNetworkLockInstalled() {
  return Boolean((globalThis as typeof globalThis & { [INSTALL_KEY]?: boolean })[INSTALL_KEY]);
}
