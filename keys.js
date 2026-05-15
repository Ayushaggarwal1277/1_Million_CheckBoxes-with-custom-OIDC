import { generateKeyPair, exportJWK } from "jose";

const { publicKey, privateKey } = await generateKeyPair("RS256", {
	extractable: true,
});

export const jwk = await exportJWK(publicKey);
export { publicKey, privateKey };
