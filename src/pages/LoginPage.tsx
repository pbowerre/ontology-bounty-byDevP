import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createAuthRequest,
  createSignData as createSignData712,
  Version,
  MessageType,
} from "ontlogin";
import type { AuthChallenge as BaseAuthChallenge, SignData as OntSignData } from "ontlogin";

type AuthChallenge = BaseAuthChallenge & { challengeId: string };

type SignData = OntSignData & {
  message: {
    created: string;
    [key: string]: unknown;
  };
};

interface EthereumProvider {
  request<T = unknown>(args: { method: string; params?: unknown[] }): Promise<T>;
  isONTO?: boolean;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
    onto?: EthereumProvider;
  }
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const navigate = useNavigate();

  const connectWallet = async () => {
    setErr(null);
    try {
      const provider = window.ethereum || window.onto;
      if (!provider) throw new Error("No wallet detected. Please install ONTO.");

      const accounts = await provider.request<string[]>({ method: "eth_requestAccounts" });
      const walletAccount = accounts?.[0];
      if (!walletAccount) throw new Error("No account selected.");
      setAccount(walletAccount);
    } catch (e) {
      const error = e as Error;
      setErr(error.message || "Wallet connection failed");
      console.error("Wallet connection error:", error);
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    localStorage.removeItem("ont_token");
    localStorage.removeItem("wallet_address");
    localStorage.removeItem("did");
    localStorage.removeItem("onto_storage");
  };

  const continueLogin = async () => {
    if (!account) {
      setErr("Please connect your wallet first.");
      return;
    }
    setLoading(true);
    setErr(null);

    try {
      const provider = window.ethereum || window.onto;
      if (!provider) throw new Error("No wallet detected. Please install ONTO.");

      const authRequest = createAuthRequest();
      const res = await fetch("/api/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authRequest),
      });
      if (!res.ok) throw new Error("Failed to obtain challenge from server.");
      const challenge: AuthChallenge = await res.json();

      const did = `did:etho:${account.replace(/^0x/, "")}`;
      const signData: SignData = createSignData712(challenge, did) as SignData;

      let method: string = "eth_signTypedData_v4";
      let params: unknown[] = [account, JSON.stringify(signData)];
      if (provider.isONTO) {
        method = "eth_signTypedData";
        params = [account, signData];
      }

      let signature: string;
      try {
        signature = await provider.request<string>({ method, params });
      } catch (signError) {
        const error = signError as { message?: string; code?: number };
        if (error.message?.includes("Method not found") || error.code === 5001) {
          throw new Error("Your wallet does not support this signing method. Please update ONTO or try MetaMask.");
        }
        throw error;
      }

      const authResponse = {
        ver: Version.Version1,
        type: MessageType.ClientResponse,
        nonce: challenge.nonce,
        did,
        proof: {
          type: "ecdsa",
          verificationMethod: `${did}#key-1`,
          created: signData.message.created,
          value: signature,
        },
        VPs: [],
        signData,
        challengeId: challenge.challengeId,
        account,
      };

      const verifyRes = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authResponse),
      });

      if (!verifyRes.ok) {
        const e = await verifyRes.json().catch(() => ({}));
        throw new Error((e as { message?: string })?.message || "Verification failed");
      }

      const { token } = (await verifyRes.json()) as { token: string };
      // Save individual keys
      localStorage.setItem("ont_token", token);
      localStorage.setItem("wallet_address", account);
      localStorage.setItem("did", did);
      // Save combined storage
      localStorage.setItem(
        "onto_storage",
        JSON.stringify({
          ont_token: token,
          wallet_address: account,
          did,
          timestamp: Date.now(),
        })
      );

      navigate("/app");
    } catch (e) {
      const error = e as Error;
      setErr(error.message || "Login failed");
      console.error("Login error:", error);
    } finally {
      setLoading(false);
    }
  };

  const goToApp = () => navigate("/app");

  return (
    <div className="centered">
      <div className="card fancy-card">
        {!account ? (
          <>
            <h1>🔐 Login with ONT ID</h1>
            <p>Authenticate securely using your ONTO wallet (Chrome/Edge).</p>
            <button className="primary glow-btn" onClick={connectWallet}>
              🚀 Connect Wallet
            </button>
          </>
        ) : (
          <>
            <h1>✅ Wallet Connected</h1>
            <p className="muted">Address:</p>
            <p className="wallet-address">{account}</p>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary glow-btn" onClick={continueLogin} disabled={loading}>
                {loading ? "🔄 Authenticating…" : "🔐 Continue Login"}
              </button>
              <button className="secondary" onClick={disconnectWallet}>
                ❌ Disconnect
              </button>
              <button className="secondary" onClick={goToApp}>
                📂 Go to App
              </button>
            </div>
          </>
        )}
        {err && <p className="error">{err}</p>}
        <small className="muted">Need ONTO? Install the extension from your browser add-ons store.</small>
        <div className="footer-links">
          <span>Developed by <strong>Dev. P</strong></span>
          <div className="social-buttons">
            <a href="https://x.com/devp_b" target="_blank" rel="noopener noreferrer" className="social-btn twitter-btn">
              🐦 Twitter
            </a>
            <a href="https://github.com/pbowerre" target="_blank" rel="noopener noreferrer" className="social-btn github-btn">
              💻 GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
