import express from "express";
import cors from "cors";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { verifyTypedData, getAddress } from "ethers";

const app = express();
app.use(cors());
app.use(express.json());

const NONCES = new Map<string, { nonce: string; createdAt: number }>();

// Replace in prod
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const SERVER_NAME = "Ontology Bounty by dev. P";
const SERVER_URL = "https://ontology-bounty-bydevp.onrender.com"; // dev
const CLOCK_SKEW_SEC = 60 * 5;

app.post("/api/challenge", (req, res) => {
  // You may inspect req.body (ClientHello) if you want action/VCs, etc.
  const challengeId = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  NONCES.set(challengeId, { nonce, createdAt: Date.now() });

  // Minimal ServerHello. (You can add server.did, chains, algs, VCFilters if needed)
  return res.json({
    ver: "1.0",
    type: "ServerHello",
    nonce,
    server: { name: SERVER_NAME, url: SERVER_URL },
    challengeId,
  });
});

app.post("/api/verify", async (req, res) => {
  try {
    const { nonce, did, proof, signData, challengeId, account } = req.body || {};

    if (!nonce || !did || !proof?.value || !signData || !challengeId || !account) {
      console.log("❌ Missing field(s):", { nonce, did, proof, signData, challengeId, account });
      return res.status(400).json({ message: "Bad request" });
    }

    const entry = NONCES.get(challengeId);
    if (!entry || entry.nonce !== nonce) {
      console.log("❌ Nonce mismatch:", { expected: entry?.nonce, got: nonce });
      return res.status(400).json({ message: "Invalid or expired nonce" });
    }

    const createdSec = Number(signData?.message?.created);
    if (!Number.isFinite(createdSec)) {
      console.log("❌ Invalid created timestamp:", signData?.message?.created);
      return res.status(400).json({ message: "Invalid created timestamp" });
    }
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - createdSec) > CLOCK_SKEW_SEC) {
      console.log("❌ Timestamp out of range:", { createdSec, nowSec });
      return res.status(400).json({ message: "Signature timestamp out of range" });
    }

    // Verify EIP-712 signature
    let recovered;
    try {
      recovered = verifyTypedData(signData.domain, signData.types, signData.message, proof.value);
    } catch (err) {
      console.log("❌ Signature verification threw error:", err);
      return res.status(401).json({ message: "Signature verification failed" });
    }

    const expectedAddr = getAddress(account);
    if (getAddress(recovered) !== expectedAddr) {
      console.log("❌ Address mismatch:", { recovered, expectedAddr });
      return res.status(401).json({ message: "Signature does not match account" });
    }

    const expectedDid = `did:etho:${expectedAddr.replace(/^0x/, "")}`;
    if (expectedDid.toLowerCase() !== String(did).toLowerCase()) {
      console.log("❌ DID mismatch:", { expectedDid, got: did });
      return res.status(401).json({ message: "DID/account mismatch" });
    }

    NONCES.delete(challengeId);
    const token = jwt.sign(
      { sub: expectedDid, addr: expectedAddr, iat: Math.floor(Date.now() / 1000) },
      JWT_SECRET,
      { expiresIn: "15m" }
    );

    console.log("✅ Verification success for", expectedAddr);
    res.json({ token, did: expectedDid, address: expectedAddr });
  } catch (e) {
    console.error("❌ Verification error:", e);
    res.status(500).json({ message: "Verification error" });
  }
});

const port = process.env.PORT || 5179;
app.listen(port, () => console.log(`API on https://ontology-bounty-bydevp.onrender.com`));
