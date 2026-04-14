import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { format: "jwk" },
  privateKeyEncoding: { format: "pem", type: "pkcs8" },
});

const jwtPrivateKey = privateKey.trim().replace(/\n/g, " ");
const jwks = JSON.stringify({
  keys: [{ ...publicKey, use: "sig", alg: "RS256", kid: "openfolio-default" }],
});

process.stdout.write(`JWT_PRIVATE_KEY="${jwtPrivateKey}"\n`);
process.stdout.write(`JWKS='${jwks}'\n`);
